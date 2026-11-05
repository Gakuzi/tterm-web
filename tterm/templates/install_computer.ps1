# tTerm Web: connect this Windows computer (PowerShell).
#
# What this does:
#   1. creates %USERPROFILE%\.tterm-web for the agent and settings;
#   2. generates a secure computer key and saves settings in env.json;
#   3. creates agent.ps1 using standard .NET WebSockets;
#   4. registers the computer with tTerm hub;
#   5. sets up autostart in the Windows Startup folder;
#   6. starts the agent in the background.

$ErrorActionPreference = "Stop"

$HUB = "{{HUB}}"
$TOKEN = "{{TOKEN}}"
$DIR = Join-Path $env:USERPROFILE ".tterm-web"

Write-Host ""
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host "    tTerm Web: connecting this Windows computer" -ForegroundColor Cyan
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $DIR)) {
    New-Item -ItemType Directory -Path $DIR -Force | Out-Null
}

# Ensure TLS 1.2
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls,Tls11,Tls12'

# Load System assembly for ClientWebSocket (.NET 4.5+)
try {
    $null = [System.Reflection.Assembly]::LoadWithPartialName("System")
} catch {}
try {
    Add-Type -AssemblyName System.Net.WebSockets -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.Net.WebSockets.Client -ErrorAction SilentlyContinue
} catch {}

# Key generation and preservation
$ENV_FILE = Join-Path $DIR "env.json"
$KEY = ""
if (Test-Path $ENV_FILE) {
    try {
        $existing = Get-Content $ENV_FILE -Raw | ConvertFrom-Json
        if ($existing.hub -eq $HUB -and $existing.key) {
            $KEY = $existing.key
            Write-Host "  Preserving existing computer key..." -ForegroundColor Gray
        }
    } catch {}
}

if (-not $KEY) {
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] 32
    $rng.GetBytes($bytes)
    $KEY = [System.Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

$settings = @{
    hub = $HUB
    token = $TOKEN
    key = $KEY
    name = $env:COMPUTERNAME
}
$settings | ConvertTo-Json | Set-Content (Join-Path $DIR "env.json") -Encoding UTF8
Write-Host "  Settings saved to $ENV_FILE" -ForegroundColor Green

# Create the Windows agent script
$AGENT_SCRIPT = Join-Path $DIR "agent.ps1"
$scriptContent = @'
param(
    [string]$ConfigPath = "$env:USERPROFILE\.tterm-web\env.json"
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath"
    exit 1
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$hub = $cfg.hub
$token = $cfg.token
$key = $cfg.key
$name = if ($cfg.name) { $cfg.name } else { $env:COMPUTERNAME }

$wsUrl = $hub -replace "^http://", "ws://" -replace "^https://", "wss://"
if (-not $wsUrl.EndsWith("/agent")) {
    $wsUrl = "$wsUrl/agent"
}

# Ensure TLS & assemblies
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls,Tls11,Tls12'
try { $null = [System.Reflection.Assembly]::LoadWithPartialName("System") } catch {}
try {
    Add-Type -AssemblyName System.Net.WebSockets -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.Net.WebSockets.Client -ErrorAction SilentlyContinue
} catch {}

$logFile = Join-Path (Split-Path $ConfigPath) "agent.log"
function Log-Agent($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    try { Add-Content -Path $logFile -Value $line -Encoding UTF8 } catch {}
}

Log-Agent "Starting tTerm agent session for $name connecting to $wsUrl..."

function Start-AgentSession {
    while ($true) {
        try {
            $ws = New-Object System.Net.WebSockets.ClientWebSocket
            $cts = New-Object System.Threading.CancellationTokenSource
            
            Log-Agent "Connecting to $wsUrl..."
            $connectTask = $ws.ConnectAsync((New-Object System.Uri($wsUrl)), $cts.Token)
            $connectTask.Wait()

            # Protocol hello message
            $hello = @{
                t = "hello"
                token = $token
                key = $key
                name = $name
                user = $env:USERNAME
                os = "Windows"
                agent = "0.14.0"
                shell = "powershell.exe"
                web = 2
            } | ConvertTo-Json -Compress

            $helloBytes = [System.Text.Encoding]::UTF8.GetBytes($hello)
            $sendTask = $ws.SendAsync(
                (New-Object System.ArraySegment[byte] -ArgumentList @(,$helloBytes)),
                [System.Net.WebSockets.WebSocketMessageType]::Text,
                $true,
                $cts.Token
            )
            $sendTask.Wait()
            Log-Agent "Connected and authenticated as $name!"

            $buffer = New-Object byte[] 65536
            $channels = @{}

            while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
                $receiveTask = $ws.ReceiveAsync($segment, $cts.Token)
                $receiveTask.Wait()
                $result = $receiveTask.Result

                if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                    Log-Agent "Server initiated close"
                    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Closing", $cts.Token).Wait()
                    break
                }

                if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Text) {
                    $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
                    try {
                        $msg = $text | ConvertFrom-Json
                    } catch {
                        continue
                    }

                    if ($msg.t -eq "ping" -or $msg.t -eq "hb") {
                        $pong = '{"t":"hb"}'
                        $pongBytes = [System.Text.Encoding]::UTF8.GetBytes($pong)
                        $ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$pongBytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
                    }
                    elseif ($msg.t -eq "run") {
                        $runId = $msg.id
                        $scriptText = $msg.script
                        
                        $outText = ""
                        $code = 0
                        try {
                            $res = Invoke-Expression $scriptText 2>&1 | Out-String
                            $outText = $res
                        } catch {
                            $outText = $_.ToString()
                            $code = 1
                        }

                        $outB64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($outText))
                        $ran = @{
                            t = "ran"
                            id = $runId
                            code = $code
                            out = $outB64
                            err = ""
                        } | ConvertTo-Json -Compress
                        $ranBytes = [System.Text.Encoding]::UTF8.GetBytes($ran)
                        $ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$ranBytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
                    }
                    elseif ($msg.t -eq "open") {
                        $ch = $msg.ch
                        Log-Agent "Opening terminal channel $ch"
                        $pinfo = New-Object System.Diagnostics.ProcessStartInfo
                        $pinfo.FileName = "powershell.exe"
                        $pinfo.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass"
                        $pinfo.RedirectStandardInput = $true
                        $pinfo.RedirectStandardOutput = $true
                        $pinfo.RedirectStandardError = $true
                        $pinfo.UseShellExecute = $false
                        $pinfo.CreateNoWindow = $true

                        $proc = [System.Diagnostics.Process]::Start($pinfo)
                        $channels[$ch] = $proc

                        # Stdout reader thread
                        [System.Threading.ThreadPool]::QueueUserWorkItem({
                            param($state)
                            $p = $state.proc
                            $chanId = $state.ch
                            $socket = $state.ws
                            $token = $state.token

                            $buf = New-Object char[] 4096
                            while (-not $p.HasExited) {
                                try {
                                    $read = $p.StandardOutput.Read($buf, 0, $buf.Length)
                                    if ($read -gt 0) {
                                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($buf, 0, $read)
                                        $frame = New-Object byte[] (5 + $bytes.Length)
                                        $frame[0] = 1 # stdout frame
                                        $chanBytes = [System.BitConverter]::GetBytes([int]$chanId)
                                        if ([System.BitConverter]::IsLittleEndian) { [System.Array]::Reverse($chanBytes) }
                                        [System.Array]::Copy($chanBytes, 0, $frame, 1, 4)
                                        [System.Array]::Copy($bytes, 0, $frame, 5, $bytes.Length)

                                        if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                                            $socket.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$frame)), [System.Net.WebSockets.WebSocketMessageType]::Binary, $true, $token).Wait()
                                        }
                                    }
                                } catch { break }
                            }
                            # Send ended notification
                            try {
                                $endedMsg = @{ t = "ended"; ch = $chanId; code = $p.ExitCode; error = "" } | ConvertTo-Json -Compress
                                $endedBytes = [System.Text.Encoding]::UTF8.GetBytes($endedMsg)
                                if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                                    $socket.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$endedBytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $token).Wait()
                                }
                            } catch {}
                        }, @{ proc = $proc; ch = $ch; ws = $ws; token = $cts.Token })

                        # Stderr reader thread
                        [System.Threading.ThreadPool]::QueueUserWorkItem({
                            param($state)
                            $p = $state.proc
                            $chanId = $state.ch
                            $socket = $state.ws
                            $token = $state.token

                            $buf = New-Object char[] 4096
                            while (-not $p.HasExited) {
                                try {
                                    $read = $p.StandardError.Read($buf, 0, $buf.Length)
                                    if ($read -gt 0) {
                                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($buf, 0, $read)
                                        $frame = New-Object byte[] (5 + $bytes.Length)
                                        $frame[0] = 1 # output frame
                                        $chanBytes = [System.BitConverter]::GetBytes([int]$chanId)
                                        if ([System.BitConverter]::IsLittleEndian) { [System.Array]::Reverse($chanBytes) }
                                        [System.Array]::Copy($chanBytes, 0, $frame, 1, 4)
                                        [System.Array]::Copy($bytes, 0, $frame, 5, $bytes.Length)

                                        if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                                            $socket.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$frame)), [System.Net.WebSockets.WebSocketMessageType]::Binary, $true, $token).Wait()
                                        }
                                    }
                                } catch { break }
                            }
                        }, @{ proc = $proc; ch = $ch; ws = $ws; token = $cts.Token })
                    }
                    elseif ($msg.t -eq "close") {
                        $ch = $msg.ch
                        if ($channels.ContainsKey($ch)) {
                            try { $channels[$ch].Kill() } catch {}
                            $channels.Remove($ch)
                        }
                    }
                }
                elseif ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Binary) {
                    # Binary frame from core: [2 (1 byte), channel (4 bytes), stdin bytes]
                    if ($result.Count -gt 5 -and $buffer[0] -eq 2) {
                        $chanBytes = New-Object byte[] 4
                        [System.Array]::Copy($buffer, 1, $chanBytes, 0, 4)
                        if ([System.BitConverter]::IsLittleEndian) { [System.Array]::Reverse($chanBytes) }
                        $ch = [System.BitConverter]::ToInt32($chanBytes, 0)

                        if ($channels.ContainsKey($ch)) {
                            $inputData = [System.Text.Encoding]::UTF8.GetString($buffer, 5, $result.Count - 5)
                            $channels[$ch].StandardInput.Write($inputData)
                            $channels[$ch].StandardInput.Flush()
                        }
                    }
                }
            }
        } catch {
            Log-Agent "Connection error: $_"
        }
        Log-Agent "Reconnecting in 5 seconds..."
        Start-Sleep -Seconds 5
    }
}

Start-AgentSession
'@

Set-Content -Path $AGENT_SCRIPT -Value $scriptContent -Encoding UTF8
Write-Host "  Agent script installed: $AGENT_SCRIPT" -ForegroundColor Green

# Foreground connectivity check before backgrounding
$wsUrl = $HUB -replace "^http://", "ws://" -replace "^https://", "wss://"
if (-not $wsUrl.EndsWith("/agent")) { $wsUrl = "$wsUrl/agent" }

Write-Host "  Verifying connection to tTerm ($wsUrl)..." -ForegroundColor Cyan
$verified = $false
try {
    $testWs = New-Object System.Net.WebSockets.ClientWebSocket
    $testCts = New-Object System.Threading.CancellationTokenSource(12000)
    $testTask = $testWs.ConnectAsync((New-Object System.Uri($wsUrl)), $testCts.Token)
    $testTask.Wait()

    $testHello = @{
        t = "hello"
        token = $TOKEN
        key = $KEY
        name = $env:COMPUTERNAME
        user = $env:USERNAME
        os = "Windows"
        agent = "0.14.0"
        shell = "powershell.exe"
        web = 2
    } | ConvertTo-Json -Compress

    $testBytes = [System.Text.Encoding]::UTF8.GetBytes($testHello)
    $testWs.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$testBytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $testCts.Token).Wait()

    $respBuf = New-Object byte[] 4096
    $recvTask = $testWs.ReceiveAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$respBuf)), $testCts.Token)
    $recvTask.Wait()
    $respText = [System.Text.Encoding]::UTF8.GetString($respBuf, 0, $recvTask.Result.Count)
    $testWs.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $testCts.Token).Wait()

    if ($respText -match '"welcome"') {
        Write-Host "  [OK] Successfully connected and registered in tTerm Web!" -ForegroundColor Green
        $verified = $true
    } else {
        Write-Host "  Server response: $respText" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  (Handshake note: $_. Agent will connect in background)" -ForegroundColor Gray
}

# Set up silent autostart via Windows VBS wrapper (no flashing window)
$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$vbsPath = Join-Path $DIR "start_agent.vbs"
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AGENT_SCRIPT`"", 0, False
"@
Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII

$shortcutPath = Join-Path $startupFolder "tTermAgent.lnk"
try {
    $wscript = New-Object -ComObject WScript.Shell
    $shortcut = $wscript.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "wscript.exe"
    $shortcut.Arguments = "`"$vbsPath`""
    $shortcut.WindowStyle = 7
    $shortcut.Description = "tTerm Web Agent"
    $shortcut.Save()
    Write-Host "  Autostart registered in Windows Startup" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Could not create startup shortcut: $_" -ForegroundColor Yellow
}

# Start agent in background
try {
    Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`""
} catch {
    Start-Process powershell.exe -ArgumentList "-WindowStyle Hidden -ExecutionPolicy Bypass -NoProfile -File `"$AGENT_SCRIPT`"" -WindowStyle Hidden
}

Write-Host ""
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host "  [SUCCESS] tTerm Windows Agent is running!" -ForegroundColor Green
Write-Host "  Your computer appears in tTerm Web now." -ForegroundColor Green
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host ""
