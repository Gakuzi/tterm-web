# tTerm Web: connect this Windows computer (PowerShell).
#
# What this does:
#   1. creates %USERPROFILE%\.tterm-web for the agent and settings;
#   2. generates a secure computer key and saves settings in env.json;
#   3. creates agent.ps1 using standard .NET WebSockets;
#   4. sets up autostart in the Windows Startup folder;
#   5. starts the agent in the background.

$ErrorActionPreference = "Stop"

$HUB = "{{HUB}}"
$TOKEN = "{{TOKEN}}"
$DIR = Join-Path $env:USERPROFILE ".tterm-web"

Write-Host ""
Write-Host "  tTerm Web: connecting this Windows computer" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $DIR)) {
    New-Item -ItemType Directory -Path $DIR -Force | Out-Null
}

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

Add-Type -AssemblyName System.Net.WebSockets
Add-Type -AssemblyName System.Net.WebSockets.Client

function Start-AgentSession {
    while ($true) {
        try {
            $ws = New-Object System.Net.WebSockets.ClientWebSocket
            $cts = New-Object System.Threading.CancellationTokenSource
            
            Write-Host "[tTerm] Connecting to $wsUrl..."
            $connectTask = $ws.ConnectAsync((New-Object System.Uri($wsUrl)), $cts.Token)
            $connectTask.Wait()

            $hello = @{
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
            Write-Host "[tTerm] Connected and authenticated as $name!"

            $buffer = New-Object byte[] 65536
            $channels = @{}

            while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
                $receiveTask = $ws.ReceiveAsync($segment, $cts.Token)
                $receiveTask.Wait()
                $result = $receiveTask.Result

                if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
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
                        $pinfo = New-Object System.Diagnostics.ProcessStartInfo
                        $pinfo.FileName = "powershell.exe"
                        $pinfo.Arguments = "-NoLogo"
                        $pinfo.RedirectStandardInput = $true
                        $pinfo.RedirectStandardOutput = $true
                        $pinfo.RedirectStandardError = $true
                        $pinfo.UseShellExecute = $false
                        $pinfo.CreateNoWindow = $true

                        $proc = [System.Diagnostics.Process]::Start($pinfo)
                        $channels[$ch] = $proc

                        [System.Threading.ThreadPool]::QueueUserWorkItem({
                            param($state)
                            $p = $state.proc
                            $chanId = $state.ch
                            $socket = $state.ws
                            $token = $state.token

                            $buf = New-Object char[] 4096
                            while (-not $p.HasExited) {
                                $read = $p.StandardOutput.Read($buf, 0, $buf.Length)
                                if ($read -gt 0) {
                                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($buf, 0, $read)
                                    $frame = New-Object byte[] (5 + $bytes.Length)
                                    $frame[0] = 1
                                    $chanBytes = [System.BitConverter]::GetBytes([int]$chanId)
                                    if ([System.BitConverter]::IsLittleEndian) { [System.Array]::Reverse($chanBytes) }
                                    [System.Array]::Copy($chanBytes, 0, $frame, 1, 4)
                                    [System.Array]::Copy($bytes, 0, $frame, 5, $bytes.Length)

                                    if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                                        $socket.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$frame)), [System.Net.WebSockets.WebSocketMessageType]::Binary, $true, $token).Wait()
                                    }
                                }
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
            Write-Host "[tTerm] Connection error: $_"
        }
        Write-Host "[tTerm] Reconnecting in 5 seconds..."
        Start-Sleep -Seconds 5
    }
}

Start-AgentSession
'@

Set-Content -Path $AGENT_SCRIPT -Value $scriptContent -Encoding UTF8
Write-Host "  Agent script installed: $AGENT_SCRIPT" -ForegroundColor Green

# Set up autostart in Windows Startup
$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "tTermAgent.lnk"

try {
    $wscript = New-Object -ComObject WScript.Shell
    $shortcut = $wscript.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AGENT_SCRIPT`""
    $shortcut.WindowStyle = 7
    $shortcut.Description = "tTerm Web Agent"
    $shortcut.Save()
    Write-Host "  Autostart registered in Windows Startup" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Could not create startup shortcut: $_" -ForegroundColor Yellow
}

# Start the agent right now in the background
Start-Process powershell.exe -ArgumentList "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AGENT_SCRIPT`"" -WindowStyle Hidden

Write-Host ""
Write-Host "  Done! The tTerm agent is running in the background." -ForegroundColor Cyan
Write-Host "  Your computer will appear in tTerm Web within a few seconds." -ForegroundColor Green
Write-Host ""
