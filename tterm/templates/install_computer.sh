#!/bin/sh
# tTerm Web: connecting this computer (macOS or Linux).
#
# What this does:
#   1. puts tTerm's agent in ~/.tterm-web: one file for this system, from
#      tTerm's releases on GitHub, checked against its checksum written below
#      before it runs; and makes this computer a key of its own there,
#      readable by you only. The key goes nowhere but to the tTerm Web this
#      command is from; the token in the command only lets the computer join,
#      once;
#   2. sets up autostart: launchd on macOS, systemd --user on Linux, so that
#      the agent starts when you log in;
#   3. starts the agent. It connects out to tTerm Web, and the computer
#      appears there in a few seconds.
#
# What it does not do:
#   - never asks for root, and refuses to run as root;
#   - opens no port: the connection always goes out from here;
#   - touches nothing outside ~/.tterm-web and its autostart entry. The tTerm
#     bot's agent in ~/.tterm, if you have one, stays as it is.
#
# The agent updates itself: only to a version signed by tTerm's release
# build, and only while no terminal is open on this computer. Not at all with
# TTERM_UPDATE=off, given as curl ... | TTERM_UPDATE=off sh or written in
# ~/.tterm-web/env; TTERM_UPDATE=on the same way turns it back on.
#
# Running this again puts this release of the agent back in place and keeps
# this computer as it is in tTerm Web; the computer's open terminals end, as
# the agent restarts.
# Remove everything: ~/.tterm-web/uninstall.sh
#
# The agent's source: https://github.com/tterm-net/tterm-app (agent/). On a
# Linux the new agent has no file for, the agent before it goes in its
# place, with Python 3.11 or newer: https://github.com/tterm-net/tterm-agent

set -eu

HUB="${TTERM_HUB:-{{HUB}}}"
TOKEN="{{TOKEN}}"
# The agent's release, and the checksums of its files there: a file put in
# their place on GitHub would not match, and does not go in.
AGENT_VERSION="0.14.0"
SUM_MACOS="c7becd5ecd3a67eb49b9ebbcdd58a27216a09baa2bf800e73f2c1206c380ddd7"
SUM_LINUX_X86_64="590034b8cee87aae1bc93839f4617a38aac96e845d920180a80ae85d1750e957"
SUM_LINUX_ARM64="1593c81dc76b62052c35aa0e81df211dc9232fa34c856365fba4e988994ad969"
FILES="https://github.com/tterm-net/tterm-app/releases/download/agent-v$AGENT_VERSION"
# The agent before it, agent.py 0.13.0 at its commit, and its checksum, for
# a Linux the new agent has no file for. TTERM_SRC to try another: unchecked.
SRC="${TTERM_SRC:-{{SRC}}}"
SUM_PY="6f4547992745043f2a3ba65e65f3514512a35226c1c3fb8b27dfc6892e13ac03"
DIR="${HOME%/}/.tterm-web"
LABEL="net.tterm.web-agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UNIT="$HOME/.config/systemd/user/tterm-web-agent.service"

say() { printf '  %s\n' "$1"; }
die() { printf '\n  x %s\n\n' "$1" >&2; exit 1; }

printf '\n  tTerm Web: connecting this computer\n\n'

# ------------------------------------------------------------------ checks

[ "$(id -u)" -ne 0 ] || die "Do not run this as root or with sudo. The agent
    works with your own permissions, so it can do no more than you can."

# A terminal of tTerm Web on this computer runs through the agent this
# updates: stopping it would end the terminal, and this script with it.
if [ -n "${TTERM_AGENT_DIR:-}" ] && { [ "$TTERM_AGENT_DIR/tterm-agent" -ef "$DIR/tterm-agent" ] ||
        [ "$TTERM_AGENT_DIR/agent.py" -ef "$DIR/agent.py" ]; }; then
    die "This terminal runs through the agent this command updates, so it
    would end halfway. Run the command in a terminal on the computer itself
    (Terminal on a Mac)."
fi

case "$(uname -s)" in
    Darwin) OS=macos; PLATFORM=macos; SUM="$SUM_MACOS" ;;
    Linux)
        OS=linux
        case "$(uname -m)" in
            x86_64|amd64) PLATFORM=linux-x86_64; SUM="$SUM_LINUX_X86_64" ;;
            aarch64|arm64) PLATFORM=linux-arm64; SUM="$SUM_LINUX_ARM64" ;;
            *) PLATFORM=python; SUM="$SUM_PY" ;;
        esac ;;
    *)      die "Only macOS and Linux are supported. On Windows, WSL2 works
    as a Linux computer." ;;
esac
say "System: $OS, $(uname -m)"

# The agent here runs as a user service the session of this script cannot
# reach (after su or sudo -u): it could neither stop it nor start the new
# one, and the computer would not come back after a restart.
if [ "$OS" = linux ] && [ -f "$UNIT" ] && ! systemctl --user show-environment >/dev/null 2>&1; then
    die "The agent here runs as a systemd user service, and this session cannot
    reach it (as after su or sudo -u). Run the command in your own login:
    over SSH as yourself, or in a terminal of your desktop."
fi

command -v curl >/dev/null 2>&1 || die "curl is needed to fetch the agent."

# A file's checksum, by whichever tool this system has.
sha256() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum <"$1" | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 <"$1" | cut -d' ' -f1
    elif command -v openssl >/dev/null 2>&1; then
        openssl dgst -sha256 <"$1" | sed 's/^.*= *//'
    fi
}

# Whether a process is this agent's, by what it runs: agent.pid outlives a
# restart, and its number may by then be another program's.
ours() {
    cmd=$(ps -o command= -p "$1" 2>/dev/null || tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null || true)
    case "$cmd" in *"$DIR/"*) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------- download

# What can fail on the network comes first, while the agent that runs now
# goes on: an update that fails leaves it as it was.
mkdir -p "$DIR"
chmod 700 "$DIR"
rm -f "$DIR/tterm-agent.new" "$DIR/agent.py.new"

if [ -z "${TTERM_AGENT_FILE:-}" ] && { [ "$PLATFORM" != python ] || [ -z "${TTERM_SRC:-}" ]; }; then
    [ "$(sha256 /dev/null)" = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ] \
        || die "This computer has no tool to check the agent's checksum with:
    sha256sum, shasum or openssl."
fi

if [ "$PLATFORM" != python ]; then
    if [ -n "${TTERM_AGENT_FILE:-}" ]; then
        # A file of the agent at hand, to try one not released yet: yours,
        # so not checked against the release.
        say "The agent from $TTERM_AGENT_FILE, not checked: yours"
        cp "$TTERM_AGENT_FILE" "$DIR/tterm-agent.new" || die "Could not copy $TTERM_AGENT_FILE"
    else
        say "Downloading the agent..."
        if ! curl -fsSL "$FILES/tterm-agent-$PLATFORM" -o "$DIR/tterm-agent.new" </dev/null; then
            rm -f "$DIR/tterm-agent.new"
            die "Could not download the agent from $FILES"
        fi
        if [ "$(sha256 "$DIR/tterm-agent.new")" != "$SUM" ]; then
            rm -f "$DIR/tterm-agent.new"
            die "What came from $FILES is not the agent this installer expects:
    its checksum differs. Nothing was changed."
        fi
    fi
    chmod 755 "$DIR/tterm-agent.new"
    if ! SAID=$("$DIR/tterm-agent.new" --version 2>&1 </dev/null) || [ -z "$SAID" ]; then
        rm -f "$DIR/tterm-agent.new"
        die "The agent does not start on this computer${SAID:+: $(printf '%s' "$SAID" | head -n 1)}.
    Nothing was changed."
    fi
    if [ -z "${TTERM_AGENT_FILE:-}" ] && [ "$SAID" != "$AGENT_VERSION" ]; then
        rm -f "$DIR/tterm-agent.new"
        die "The agent from $FILES says it is $SAID, not $AGENT_VERSION.
    Nothing was changed."
    fi
    AGENT_SAYS=$SAID
    # What autostart runs, quoted for sh and systemd, and for launchd.
    RUN="\"$DIR/tterm-agent\""
    RUN_XML="    <string>$DIR/tterm-agent</string>"
else
    PY=""
    for candidate in python3.14 python3.13 python3.12 python3.11 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
            version=$("$candidate" -c 'import sys; print(sys.version_info[0]*100+sys.version_info[1])' 2>/dev/null </dev/null || echo 0)
            if [ "$version" -ge 311 ]; then PY=$(command -v "$candidate"); break; fi
        fi
    done
    [ -n "$PY" ] || die "There is no agent file for $(uname -m) yet, and the agent
    before it needs Python 3.11 or newer: sudo apt install python3 python3-venv"
    say "Python: $("$PY" --version 2>&1)"
    say "Downloading the agent..."
    if ! curl -fsSL "$SRC" -o "$DIR/agent.py.new" </dev/null; then
        rm -f "$DIR/agent.py.new"
        die "Could not download the agent from $SRC"
    fi
    if [ -z "${TTERM_SRC:-}" ] && [ "$(sha256 "$DIR/agent.py.new")" != "$SUM" ]; then
        rm -f "$DIR/agent.py.new"
        die "What came from $SRC is not the agent this installer expects:
    its checksum differs. Nothing was changed."
    fi
    AGENT_SAYS=$(sed -n 's/^__version__ = "\([0-9][0-9.]*\)"$/\1/p' "$DIR/agent.py.new" | head -n 1)
    [ -n "$AGENT_SAYS" ] || { rm -f "$DIR/agent.py.new"; die "What came from $SRC is not the agent."; }
    MAJOR=${AGENT_SAYS%%.*}
    REST=${AGENT_SAYS#*.}
    MINOR=${REST%%.*}
    if [ "$MAJOR" -eq 0 ] && [ "$MINOR" -lt 13 ]; then
        rm -f "$DIR/agent.py.new"
        die "The agent at $SRC is $AGENT_SAYS; this installer needs 0.13.0 or newer."
    fi
    # Kept between runs, unless the Python it was made with is gone.
    if ! "$DIR/venv/bin/python" -c 'import sys' >/dev/null 2>&1 </dev/null; then
        rm -rf "$DIR/venv"
        "$PY" -m venv "$DIR/venv" </dev/null || die "Could not make the Python environment.
    On Debian and Ubuntu: sudo apt install python3-venv"
    fi
    say "Installing what the agent needs..."
    "$DIR/venv/bin/python" -m pip install --quiet --disable-pip-version-check \
        --upgrade websockets </dev/null || die "Could not install websockets"
    "$DIR/venv/bin/python" -m pip install --quiet --disable-pip-version-check \
        setproctitle </dev/null 2>/dev/null || true
    RUN="\"$DIR/venv/bin/python\" \"$DIR/agent.py\""
    RUN_XML="    <string>$DIR/venv/bin/python</string>
    <string>$DIR/agent.py</string>"
fi

# ----------------------------------------------------------------- install

# Run again for the same tTerm Web, the computer keeps its key and stays the
# one it was. For another tTerm Web, or once the computer was removed (its
# agent then forgot the key), it gets a new one.
KEY=""
UPDATE=$(printf '%s' "${TTERM_UPDATE:-}" | tr -cd 'A-Za-z0-9')
if [ -f "$DIR/env" ]; then
    say "The agent is here already: updating it"
    OLD_HUB=$(sed -n 's/^TTERM_HUB=//p' "$DIR/env" 2>/dev/null | head -n 1)
    if [ "$OLD_HUB" = "$HUB" ]; then
        KEY=$(sed -n 's/^TTERM_KEY=//p' "$DIR/env" 2>/dev/null | head -n 1)
        case "$KEY" in
            *[!A-Za-z0-9_-]*) KEY="" ;;
        esac
        [ "${#KEY}" -ge 32 ] || KEY=""
    fi
    # TTERM_UPDATE=off, if it was set, stays so.
    [ -n "$UPDATE" ] || UPDATE=$(sed -n 's/^TTERM_UPDATE=//p' "$DIR/env" 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9')
fi
if [ -z "$KEY" ]; then
    # Read in a bounded amount: a tr that does not stop at a closed pipe
    # would otherwise read forever.
    KEY=$(head -c 1024 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9_' | head -c 43)
fi
[ "${#KEY}" -ge 32 ] || die "Could not make this computer's key."
case "$UPDATE" in
    [Oo][Ff][Ff]|0|[Nn][Oo]|[Ff][Aa][Ll][Ss][Ee]) UPDATES="it does not update itself (TTERM_UPDATE=$UPDATE)" ;;
    *) UPDATES="it updates itself" ;;
esac

# The agent that runs now stops here, so that two of them never fight over
# this computer.
if [ "$OS" = macos ]; then
    launchctl unload "$PLIST" 2>/dev/null || launchctl remove "$LABEL" 2>/dev/null || true
else
    systemctl --user stop tterm-web-agent.service 2>/dev/null || true
fi
if [ -f "$DIR/agent.pid" ]; then
    PID=$(cat "$DIR/agent.pid" 2>/dev/null || true)
    if [ -n "$PID" ] && ours "$PID"; then kill "$PID" 2>/dev/null || true; fi
    rm -f "$DIR/agent.pid"
fi
if [ "$PLATFORM" != python ]; then
    mv "$DIR/tterm-agent.new" "$DIR/tterm-agent"
    say "Agent: $AGENT_SAYS, $UPDATES"
else
    mv "$DIR/agent.py.new" "$DIR/agent.py"
    say "Agent: $AGENT_SAYS"
fi
# What the agent's own updates keep here: the version before, a version on
# trial, files half written when it stopped. This release starts from none
# of them; a version it does not take again (tterm-agent.skip) it still does
# not take.
rm -f "$DIR/tterm-agent.old" "$DIR/tterm-agent.trial" "$DIR"/.tterm-agent.*

# A name of your choosing for a new computer, if TTERM_NAME says one;
# otherwise the agent takes the one in the system's settings.
NAME=$(printf '%s' "${TTERM_NAME:-}" | tr -cd 'A-Za-z0-9._-')

# The settings, the key among them: for this user only, and not in the
# autostart entry, which other programs may read.
(
    umask 077
    {
        printf 'TTERM_HUB=%s\n' "$HUB"
        printf 'TTERM_TOKEN=%s\n' "$TOKEN"
        printf 'TTERM_KEY=%s\n' "$KEY"
        if [ -n "$NAME" ]; then printf 'TTERM_NAME=%s\n' "$NAME"; fi
        if [ -n "$UPDATE" ]; then printf 'TTERM_UPDATE=%s\n' "$UPDATE"; fi
    } > "$DIR/env.new"
)
mv "$DIR/env.new" "$DIR/env"
chmod 600 "$DIR/env"
say "Settings and this computer's key: $DIR/env"

# What this run's agent says, apart from the runs before.
if [ -f "$DIR/agent.log" ]; then mv "$DIR/agent.log" "$DIR/agent.log.1"; fi

# --------------------------------------------------------------- autostart

NOTE=""
if [ "$OS" = macos ]; then
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
$RUN_XML
    <string>--env-file</string>
    <string>$DIR/env</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$DIR/agent.log</string>
</dict></plist>
EOF
    launchctl load "$PLIST" || die "Could not set up autostart"
    UNSTART="rm -f \"$PLIST\""
    STOP="launchctl remove $LABEL 2>/dev/null || true"
    say "Autostart: launchd ($LABEL)"
elif command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
    mkdir -p "$(dirname "$UNIT")"
    cat > "$UNIT" <<EOF
[Unit]
Description=tTerm Web agent
After=network-online.target

[Service]
Type=simple
ExecStart=$RUN --env-file "$DIR/env"
Restart=on-failure
RestartSec=5
StandardOutput=append:$DIR/agent.log
StandardError=append:$DIR/agent.log

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now tterm-web-agent.service >/dev/null 2>&1 \
        || die "Could not start the service"
    UNSTART="systemctl --user disable tterm-web-agent.service 2>/dev/null || true
rm -f \"$UNIT\"
systemctl --user daemon-reload 2>/dev/null || true"
    STOP="systemctl --user stop tterm-web-agent.service 2>/dev/null || true"
    say "Autostart: systemd --user (tterm-web-agent)"
    # Without lingering, user services stop at logout and wait for a login.
    if command -v loginctl >/dev/null 2>&1 && ! loginctl show-user "$(id -un)" \
            --property=Linger 2>/dev/null | grep -q '=yes'; then
        NOTE="It runs while you are logged in. For a computer you reach only over
    SSH, to have it run without a login too: sudo loginctl enable-linger $(id -un)"
    fi
else
    # No user services here (WSL without systemd, a container): the agent
    # starts now, in the background, and again with ~/.tterm-web/start.sh.
    cat > "$DIR/start.sh" <<EOF
#!/bin/sh
nohup $RUN --env-file "$DIR/env" \\
    >> "$DIR/agent.log" 2>&1 </dev/null &
echo \$! > "$DIR/agent.pid"
EOF
    chmod 700 "$DIR/start.sh"
    "$DIR/start.sh"
    UNSTART=":"
    STOP="[ -z \"\$PID\" ] || kill \"\$PID\" 2>/dev/null || true"
    NOTE="No autostart on this system: after a restart, run ~/.tterm-web/start.sh"
    say "Autostart: none here, see below"
fi

# The agent before, now that autostart runs the one put in its place: up to
# here, a failure left the computer with the one it had.
if [ "$PLATFORM" != python ]; then
    rm -rf "$DIR/venv" "$DIR/agent.py"
else
    rm -f "$DIR/tterm-agent"
fi

# --------------------------------------------------------------- uninstall

cat > "$DIR/uninstall.sh" <<EOF
#!/bin/sh
# Removes tTerm Web's agent from this computer: autostart, the agent and
# this computer's key. In tTerm Web the computer stays listed until you
# remove it there: its card, Remove. The agent stops last, so that run from
# one of its own terminals this still does everything.
PID=\$(cat "$DIR/agent.pid" 2>/dev/null)
$UNSTART
rm -rf "$DIR"
# The shell scripts tTerm Web's terminals put in ~/.tterm. The folder itself
# goes only if nothing else is in it: the tTerm bot's agent lives there.
rm -f "$HOME/.tterm/bash.sh"
rm -rf "$HOME/.tterm/zsh"
rmdir "$HOME/.tterm" 2>/dev/null || true
echo "tTerm Web's agent is removed from this computer."
$STOP
EOF
chmod 700 "$DIR/uninstall.sh"

cat > "$DIR/connect.sh" <<EOF
#!/bin/sh
# tTerm Web: connect or re-bind this computer to a project
TOKEN="\${1:-}"
if [ -z "\$TOKEN" ]; then
    printf 'Usage: %s <TTERM_TOKEN>\n' "\$0" >&2
    exit 1
fi
DIR="$DIR"
if [ -f "\$DIR/env" ]; then
    if grep -q '^TTERM_TOKEN=' "\$DIR/env"; then
        sed -i.bak "s|^TTERM_TOKEN=.*|TTERM_TOKEN=\$TOKEN|" "\$DIR/env" 2>/dev/null || sed -i "" "s|^TTERM_TOKEN=.*|TTERM_TOKEN=\$TOKEN|" "\$DIR/env"
        rm -f "\$DIR/env.bak"
    else
        printf 'TTERM_TOKEN=%s\n' "\$TOKEN" >> "\$DIR/env"
    fi
else
    mkdir -p "\$DIR"
    printf 'TTERM_HUB=%s\nTTERM_TOKEN=%s\n' "$HUB" "\$TOKEN" > "\$DIR/env"
fi
$STOP
if [ "$OS" = macos ]; then
    launchctl load "$PLIST" 2>/dev/null || true
elif [ "$OS" = linux ] && command -v systemctl >/dev/null 2>&1; then
    systemctl --user restart tterm-web-agent.service 2>/dev/null || true
fi
printf 'tTerm Agent updated with token %s and reloaded.\n' "\$TOKEN"
EOF
chmod 700 "$DIR/connect.sh"

# -------------------------------------------------------------- connected?

say "Starting the agent..."
i=0
RESULT=""
while [ $i -lt 30 ]; do
    if grep -q 'connected as' "$DIR/agent.log" 2>/dev/null; then
        RESULT=connected
        break
    fi
    if grep -q 'access revoked' "$DIR/agent.log" 2>/dev/null; then
        RESULT=refused
        break
    fi
    sleep 1
    i=$((i + 1))
done

case "$RESULT" in
    connected)
        printf '\n  Done: the computer is connected. Go back to tTerm Web.\n'
        ;;
    refused)
        printf '\n  x tTerm Web did not take the agent:\n' >&2
        grep 'access revoked' "$DIR/agent.log" | tail -n 1 | sed 's/^/    /' >&2
        printf '\n' >&2
        exit 1
        ;;
    *)
        printf '\n  The agent is installed but has not connected yet. What it says:\n'
        tail -n 3 "$DIR/agent.log" 2>/dev/null | sed 's/^/    /'
        ;;
esac
[ -z "$NOTE" ] || printf '\n  %s\n' "$NOTE"
printf '\n    Log:    %s/agent.log\n' "$DIR"
printf '    Remove: %s/uninstall.sh\n\n' "$DIR"
