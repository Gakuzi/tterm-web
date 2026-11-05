"""The machine passport: what a machine is, learned right after it connects,
over SSH from a server, through the agent from a computer. The page shows
it; later the input line uses the list of commands to tell a command from a
question, and to complete words.
"""
from __future__ import annotations

#: Plain POSIX sh, run without a terminal: as the tterm user on a server, as
#: the person on a computer, which may be a Mac (sw_vers, dscl, sysctl and
#: Homebrew there instead of os-release, getent, /proc and apt). Every line
#: is key=value; after the marker, one command name per line.
SCRIPT = r"""
LC_ALL=C; export LC_ALL
os=""; os_id=""; os_version=""
if [ -r /etc/os-release ]; then
  os=$(. /etc/os-release; printf '%s' "${PRETTY_NAME:-}")
  os_id=$(. /etc/os-release; printf '%s' "${ID:-}")
  os_version=$(. /etc/os-release; printf '%s' "${VERSION_ID:-}")
elif command -v sw_vers >/dev/null 2>&1; then
  os_version=$(sw_vers -productVersion 2>/dev/null)
  os="$(sw_vers -productName 2>/dev/null) $os_version"
  os_id=macos
fi
[ -n "$os" ] || os=$(uname -s)
printf 'os=%s\n' "$os"
printf 'os_id=%s\n' "$os_id"
printf 'os_version=%s\n' "$os_version"
printf 'kernel=%s\n' "$(uname -r)"
printf 'arch=%s\n' "$(uname -m)"
printf 'hostname=%s\n' "$(hostname 2>/dev/null)"
for pm in apt-get dnf yum apk pacman zypper brew; do
  if command -v "$pm" >/dev/null 2>&1; then printf 'package_manager=%s\n' "$pm"; break; fi
done
login=$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)
[ -n "$login" ] || login=$(dscl . -read "/Users/$(id -un)" UserShell 2>/dev/null | awk '{print $2}')
[ -n "$login" ] || login=${SHELL:-}
printf 'shell=%s\n' "$login"
for s in bash zsh fish; do
  command -v "$s" >/dev/null 2>&1 && printf 'shells=%s\n' "$s"
done
printf 'cpus=%s\n' "$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null)"
memory=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null)
[ -n "$memory" ] || memory=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%d", $1 / 1024}')
printf 'memory_kb=%s\n' "$memory"
df -Pk / 2>/dev/null | awk 'NR==2 {print "disk_total_kb=" $2; print "disk_free_kb=" $4}'
if sudo -n true 2>/dev/null; then echo sudo=yes
elif command -v sudo >/dev/null 2>&1 && id -Gn 2>/dev/null | tr ' ' '\n' | grep -qxE 'sudo|wheel|admin'; then echo sudo=password
else echo sudo=no; fi
if [ -d /run/systemd/system ]; then echo systemd=yes; else echo systemd=no; fi
echo '--docker--'
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
fi
echo '--ports--'
if command -v ss >/dev/null 2>&1; then
  ss -tulpn 2>/dev/null | grep -E 'LISTEN' || true
elif command -v netstat >/dev/null 2>&1; then
  netstat -tulpn 2>/dev/null | grep -E 'LISTEN' || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -i -P -n 2>/dev/null | grep -E 'LISTEN' || true
fi
echo '--commands--'
if command -v bash >/dev/null 2>&1; then
  bash -c 'compgen -c' 2>/dev/null | LC_ALL=C sort -u | head -n 5000
fi
"""

POWERSHELL_SCRIPT = r"""
$os = (Get-CimInstance Win32_OperatingSystem).Caption
$os_ver = [System.Environment]::OSVersion.Version.ToString()
$hostName = [System.Environment]::MachineName
$arch = if ([System.Environment]::Is64BitOperatingSystem) { "x86_64" } else { "x86" }
$cpus = [System.Environment]::ProcessorCount
$mem = [math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize)
$drive = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -like "$($env:SystemDrive)*" } | Select-Object -First 1
$free_kb = if ($drive) { [math]::Round($drive.Free / 1024) } else { 0 }
$total_kb = if ($drive) { [math]::Round(($drive.Used + $drive.Free) / 1024) } else { 0 }

"os=$os"
"os_id=windows"
"os_version=$os_ver"
"hostname=$hostName"
"arch=$arch"
"shell=powershell.exe"
"cpus=$cpus"
"memory_kb=$mem"
"disk_total_kb=$total_kb"
"disk_free_kb=$free_kb"
"sudo=yes"
"systemd=no"
"--commands--"
"git"
"powershell"
"cmd"
"dir"
"cd"
"cls"
"ping"
"ipconfig"
"tasklist"
"systeminfo"
"curl"
"tar"
"""

MARKER = "--commands--"
DOCKER_MARKER = "--docker--"
PORTS_MARKER = "--ports--"

_INTS = ("cpus", "memory_kb", "disk_total_kb", "disk_free_kb")
_FLAGS = ("sudo", "systemd")
_TEXT = ("os", "os_id", "os_version", "kernel", "arch", "hostname",
         "package_manager", "shell")


def parse(output: str) -> dict:
    """The passport from the script's output. Unknown lines are ignored;
    whatever is missing is simply absent."""
    head, _, tail = output.partition(f"\n{MARKER}\n")
    if not tail and output.startswith(MARKER):
        head, tail = "", output[len(MARKER) + 1:]

    docker_raw = ""
    ports_raw = ""
    if f"\n{DOCKER_MARKER}\n" in head:
        head_part, _, after_docker = head.partition(f"\n{DOCKER_MARKER}\n")
        head = head_part
        if f"\n{PORTS_MARKER}\n" in after_docker:
            docker_raw, _, ports_raw = after_docker.partition(f"\n{PORTS_MARKER}\n")
        else:
            docker_raw = after_docker
    elif f"\n{PORTS_MARKER}\n" in head:
        head_part, _, ports_raw = head.partition(f"\n{PORTS_MARKER}\n")
        head = head_part

    passport: dict = {"shells": []}
    for line in head.splitlines():
        key, sep, value = line.partition("=")
        if not sep:
            continue
        value = value.strip()
        if key in _TEXT and value:
            passport[key] = value[:200]
        elif key in _INTS:
            if value.isdigit():
                passport[key] = int(value)
        elif key in _FLAGS:
            passport[key] = value == "yes"
            if key == "sudo":
                # There, but it asks for a password: a person's own Mac. Not
                # the same as no sudo at all.
                passport["sudo_password"] = value == "password"
        elif key == "shells" and value and value not in passport["shells"]:
            passport["shells"].append(value)

    # Parse Docker containers
    containers = []
    for line in docker_raw.splitlines():
        line = line.strip()
        if not line or line.startswith("CONTAINER ID"):
            continue
        parts = line.split("\t")
        if len(parts) >= 4:
            cid = parts[0].strip()
            cname = parts[1].strip()
            cimg = parts[2].strip()
            cstatus = parts[3].strip()
            cports = parts[4].strip() if len(parts) >= 5 else ""
            containers.append({
                "id": cid,
                "name": cname,
                "image": cimg,
                "status": cstatus,
                "ports": [cports] if cports else [],
            })
    if containers:
        passport["docker_containers"] = containers

    # Parse listening ports
    ports = []
    for line in ports_raw.splitlines():
        line = line.strip()
        if not line:
            continue
        ports.append(line[:120])
    if ports:
        passport["listening_ports"] = ports[:50]

    passport["commands"] = sorted({
        c.strip() for c in tail.splitlines()
        if c.strip() and len(c) <= 100 and c.isprintable()})[:5000]
    return passport


def summary(passport: dict) -> dict:
    """What the page shows: everything but the long list of commands."""
    out = {k: v for k, v in passport.items() if k != "commands"}
    out["commands_count"] = len(passport.get("commands", []))
    if "docker_containers" in passport:
        out["docker_containers"] = passport["docker_containers"]
    if "listening_ports" in passport:
        out["listening_ports"] = passport["listening_ports"]
    return out
