"""The block feed and tTerm's own input line, as far as the core goes: the
commands held back for a question, Tab, the side scripts on a real sh, and
commands typed by the page into real shells over SSH."""
import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path


from ..core import complete, danger, shell, terminals
from .harness import page_socket, request, shell_server
from .test_terminals import (CHANGE, KEY, Pty, _ca_public, _deploy, _home,
                             _login_shell, _machine, _prompts, _screen, _until)


# ---------------------------------------------------------------- danger

def test_dangerous_commands_are_held_back():
    for cmd in ("rm -rf /var/log/old", "rm -fr build",
                "sudo rm -rf node_modules", "mkfs.ext4 /dev/sdb1",
                "dd if=/dev/zero of=/dev/sda bs=1M",
                "psql -c 'DROP DATABASE prod'", "shutdown -h now", "reboot",
                "systemctl stop sshd", "userdel deploy", "ufw deny 22",
                "sudo deluser --remove-home tt-check",
                "cd /tmp\nrm -rf build"):
        assert danger.looks_destructive(cmd) is not None, cmd
    for cmd in ("rm file.txt", "ls -la", "git reset --hard", "cd /tmp && ls",
                "docker ps", "grep -r pattern .", "systemctl restart tterm",
                "cat /etc/passwd", "rmdir empty", "df -h", "rm -i old.log",
                "rm old.log\nls -rf"):
        assert danger.looks_destructive(cmd) is None, cmd
    assert danger.hits_everything("rm -rf /") and danger.hits_everything("rm -rf ~")
    assert danger.hits_everything("rm -rf $HOME")
    assert danger.hits_everything("rm -rf ~/")
    assert not danger.hits_everything("rm -rf /var/log/old")
    assert danger.looks_destructive("rm --recursive --force build")
    for rule in danger.RULES:
        assert "—" not in rule.what + rule.lost, "no long dashes"
    # Checked as typed: a control character hidden in a word goes before
    # the check, not after it.
    from ..core.terminals import clean_command
    for sneaky in ("r\x01m -rf /tmp/x", "re\x00boot", "rm -rf\r/tmp/x"):
        assert danger.looks_destructive(clean_command(sneaky)), repr(sneaky)
    assert clean_command("a\r\nb\rc\x1b[201~") == "a\nb\nc[201~"


# ------------------------------------------------------------------ Tab

def _ctx(line: str) -> complete.Context:
    words, word = complete.split(line)
    return complete.context(words, word)


def test_the_page_says_every_held_back_command_in_its_languages():
    """0.1.16: the page finds each rule by its English words
    (web/src/danger.ts) and says it in the language shown; a rule changed
    or added here must be there too, with the same English."""
    root = Path(__file__).resolve().parents[2]
    keys = (root / "web" / "src" / "danger.ts").read_text(encoding="utf-8")
    listed = dict(re.findall(r'^  "([^"]+)": \{ what: "([a-z_.]+)", lost: "[a-z_.]+" \}',
                             keys, re.M))
    lost_keys = dict(re.findall(r'^  "([^"]+)": \{ what: "[a-z_.]+", lost: "([a-z_.]+)" \}',
                                keys, re.M))
    english = {}
    for line in (root / "web" / "src" / "i18n" / "en.txt").read_text(
            encoding="utf-8").splitlines():
        if " = " in line and not line.startswith("#"):
            key, _, text = line.partition(" = ")
            english[key] = text
    assert set(listed) == {rule.what for rule in danger.RULES}, set(listed) ^ {
        rule.what for rule in danger.RULES}
    for rule in danger.RULES:
        assert english[listed[rule.what]] == rule.what, rule.what
        assert english[lost_keys[rule.what]] == rule.lost, rule.lost


def test_the_line_is_read_like_the_shell_reads_it():
    words, word = complete.split('git commit -m "two words" && cd My\\ Do')
    assert words == ["cd"] and word.value == "My Do" and word.start == 32
    words, word = complete.split("ls 'a b")
    assert word.value == "a b" and word.quote == "'"
    words, word = complete.split('echo "x\\"y')
    assert word.value == 'x"y' and word.quote == '"'
    words, word = complete.split("cat < fi")
    assert word.redirect and word.value == "fi"
    words, word = complete.split("ls ")
    assert words == ["ls"] and word.value == "" and word.start == 3
    words, word = complete.split("echo $(whi")
    assert words == [] and word.value == "whi"


def test_tab_knows_what_kind_of_word_it_is():
    assert _ctx("gi").kind == "command"
    assert _ctx("sudo -E sys").kind == "command"
    assert _ctx("FOO=1 py").kind == "command"
    assert _ctx("./scr").kind == "file"
    assert _ctx("ls -la sr").kind == "file"
    assert _ctx("ls -").kind == "none"
    assert _ctx("echo $HO").kind == "none"
    assert _ctx("cd sr").kind == "dir"
    assert _ctx("git sw").kind == "git"
    assert _ctx("git switch fe").kind == "branch"
    assert _ctx("git switch fe").switch
    assert _ctx("git checkout ma").kind == "branch+file"
    assert _ctx("ls | gr").kind == "command"
    assert _ctx("echo hi > ou").kind == "file"


def test_words_go_back_quoted_as_they_came():
    assert complete.escape("My Docs/a&b") == "My\\ Docs/a\\&b"
    assert complete.escape("~/x y") == "~/x\\ y", "a leading ~ is home"
    assert complete.escape("a~b") == "a\\~b"
    assert complete.word_text("it's", "'") == "'it'\\''s"
    assert complete.word_text('a"b$c', '"') == '"a\\"b\\$c'
    assert complete.sh_quote("it's") == "'it'\\''s'"
    assert complete.cd_command("..") == "cd .."
    assert complete.cd_command("src") == "cd src"
    assert complete.cd_command("My Docs") == "cd 'My Docs'"
    assert complete.cd_command("-x") == "cd './-x'"
    assert complete.switch_command("feature/x") == "git switch feature/x"


def test_items_for_files_commands_and_branches():
    word = complete.Word(start=3, value="sr")
    items = complete.file_items(word, ["src/", "srv.txt", ".srx", "lib/"],
                                "/home/u")
    assert [i["text"] for i in items] == ["src/", "srv.txt"]
    assert items[0]["kind"] == "dir"
    hidden = complete.file_items(complete.Word(3, "."), [".git/", "a"], "/h")
    assert [i["label"] for i in hidden] == [".git/"]
    tilde = complete.file_items(complete.Word(3, "~/Do"), ["Docs/", "x"],
                                "/home/u")
    assert [i["text"] for i in tilde] == ["~/Docs/"]
    assert complete.dir_part("~/Do", "/home/u") == ("/home/u/", "~/", "Do")
    assert complete.dir_part("/etc/pa", "/h") == ("/etc/", "/etc/", "pa")
    assert complete.dir_part("pa", "/h") == (".", "", "pa")
    spaced = complete.file_items(complete.Word(3, "My"), ["My Docs/"], "/h")
    assert spaced[0]["text"] == "My\\ Docs/"
    cmds = complete.command_items(complete.Word(0, "ech"), ["echo", "ecl"])
    assert [i["label"] for i in cmds] == ["echo"], "listed and builtin, once"
    refs = ["refs/heads/main", "refs/heads/feature/x",
            "refs/remotes/origin/HEAD", "refs/remotes/origin/main",
            "refs/remotes/origin/fix"]
    sw = complete.branch_items(complete.Word(11, ""), refs, switch=True)
    assert [i["label"] for i in sw] == ["main", "feature/x", "fix"]
    merge = complete.branch_items(complete.Word(10, "ori"), refs)
    assert [i["label"] for i in merge] == ["origin/main", "origin/fix"]
    assert complete.branches_of(refs) == {
        "local": ["feature/x", "main"], "remote": ["origin/fix", "origin/main"]}
    assert complete.dirs_of(["b/", ".a/", "f", "A/"]) == ["A", "b", ".a"]


def _sh(script: str, cwd: Path) -> list[str]:
    out = subprocess.run(["sh", "-s"], input=script.encode(), cwd=cwd,
                         capture_output=True, timeout=20).stdout
    return complete.listed(b"some chatty startup file\n" + out)


def test_names_with_control_characters_stay_out():
    out = (complete.LIST_MARK + "\nREADME\nREADME\rmake\ntab\tname\nok/\n").encode()
    assert complete.listed(out) == ["README", "ok/"]


def test_the_side_scripts_on_a_real_sh():
    tmp = Path(tempfile.mkdtemp(prefix="ttside"))
    try:
        (tmp / "My Docs").mkdir()
        (tmp / "src").mkdir()
        (tmp / "it's.txt").write_text("x")
        (tmp / "link").symlink_to(tmp / "src")
        listed = _sh(complete.list_script(str(tmp), "."), Path("/"))
        assert {"My Docs/", "src/", "it's.txt", "link/"} <= set(listed), listed
        gone = str(tmp / "no-such-dir")
        assert _sh(complete.list_script(gone, "."), tmp) == [], \
            "a directory that cannot be entered lists nothing, not home"
        assert "src/" in _sh(complete.list_script(gone, str(tmp)), Path("/")), \
            "an absolute path still lists"
        bin_dir = tmp / "bin"
        bin_dir.mkdir()
        tool = bin_dir / "ttool-one"
        tool.write_text("#!/bin/sh\n")
        tool.chmod(0o755)
        (bin_dir / "ttool-data").write_text("not runnable")
        cmds = _sh(complete.commands_script(f"/nowhere:{bin_dir}", "ttool"), tmp)
        assert cmds == ["ttool-one"], cmds
        if shutil.which("git"):
            repo = tmp / "repo"
            git = ["git", "-C", str(repo), "-c", "user.name=t",
                   "-c", "user.email=t@t"]
            subprocess.run(["git", "init", "-q", "-b", "main", str(repo)],
                           check=True)
            subprocess.run(git + ["commit", "-q", "--allow-empty", "-m", "a"],
                           check=True)
            subprocess.run(git + ["branch", "feature/x"], check=True)
            refs = _sh(complete.branches_script(str(repo)), tmp)
            assert set(refs) == {"refs/heads/main", "refs/heads/feature/x"}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_the_plan_says_who_marks_commands():
    assert shell.plan("shell=/bin/bash\nbash=/bin/bash\nbash_version=5.2\n").blocks
    assert not shell.plan("shell=/bin/bash\nbash=/bin/bash\nbash_version=3.2\n"
                          ).blocks, "no PS0 before 4.4"
    assert shell.plan("shell=/bin/bash\nbash=/bin/bash\nbash_version=4.4\n"
                      ).blocks
    assert shell.plan("shell=/usr/bin/zsh\nzsh=/usr/bin/zsh\n").blocks
    assert not shell.plan("shell=/bin/ash\n").blocks


class _Pool:
    """A database that takes the blocks and forgets them."""

    async def execute(self, *args):
        return None


async def test_a_replay_knows_the_command_it_starts_in():
    from types import SimpleNamespace

    from ..core import terminals
    machine = terminals.Machine(uuid.uuid4(), uuid.uuid4(), "P", "vm",
                                "127.0.0.1", 22, "tterm", [], None)
    t = terminals.Terminal(pool=_Pool(), signer=None,  # type: ignore[arg-type]
                           owner=SimpleNamespace(id=uuid.uuid4(), name="D"),
                           machine=machine, name="1", cols=80, rows=24)

    def marker(*fields: str) -> bytes:
        body = ";".join(fields)
        return f"\x1b]6973;{t._key};{body}\x07".encode()

    t._take(marker("P", "0", "/h", "/h", "", "", "/bin"))
    t._take(marker("C", "yes", "0"))
    start = t.last_seq
    for _ in range(5):
        t._take(b"y\r\ny\r\n")
    inside = t.last_seq - 2
    assert t.block_at(inside)["command"] == "yes", "running: inside it"
    t._take(marker("P", "130", "/h", "/h", "", "", "/bin"))
    end = t.last_seq
    await asyncio.sleep(0)
    got = t.block_at(inside)
    assert got and got["seqStart"] == start and got["command"] == "yes"
    assert t.block_at(end) is None, "the prompt after it is not inside it"
    assert t.block_at(start - 1) is None


# ------------------------------------------------------- the real shells

def _markers_say_more(login_shell: str, full: bool) -> None:
    home = _home()
    p = None
    try:
        out = _deploy(home, login_shell)
        plan = shell.plan(out)
        if login_shell.endswith("bash"):
            assert "bash_version=" in out
        p = Pty(home, login_shell, plan.command)
        p.read_until(1)
        # The login files may change it (Debian's /etc/profile does).
        assert "/bin" in p.marks[-1].field(5), "the prompt carries the PATH"
        if not full:
            return
        # Three commands in one paste: bash marks each, with the code of the
        # one before; zsh takes the paste as one command.
        os.write(p.master, b"\x1b[200~(exit 3)\n(exit 5)\necho x\x1b[201~\r")
        p.read_until(2)
        cs = [m for m in p.marks if m.kind == "C"]
        if login_shell.endswith("bash"):
            assert [m.field(0) for m in cs] == ["(exit 3)", "(exit 5)", "echo x"]
            assert [m.field(1) for m in cs][1:] == ["3", "5"]
        else:
            assert [m.field(0) for m in cs] == ["(exit 3)\n(exit 5)\necho x"]
        assert p.marks[-1].kind == "P" and p.marks[-1].field(0) == "0"
    finally:
        if p:
            p.close()
        shutil.rmtree(home, ignore_errors=True)


def test_bash_markers_carry_path_and_codes():
    if shutil.which("bash"):
        from .test_terminals import _bash_full
        _markers_say_more(shutil.which("bash") or "bash", _bash_full())


def test_zsh_markers_carry_path_and_codes():
    if shutil.which("zsh"):
        _markers_say_more(shutil.which("zsh") or "zsh", True)


# ------------------------------------------------- over SSH, the page's way

async def _saved(core, tid, n: int) -> list:
    end = time.monotonic() + 10
    while True:
        rows = await core.pool.fetch(
            "SELECT command, exit_code, cols, seq_start FROM blocks "
            "WHERE terminal_id = $1 ORDER BY seq_start", tid)
        if len(rows) >= n:
            return rows
        assert time.monotonic() < end, f"{len(rows)} blocks saved, not {n}"
        await asyncio.sleep(0.05)


async def test_the_page_types_whole_commands(h):
    login, full = _login_shell()
    if not full:
        return
    home = _home()
    try:
        (home / "My Docs").mkdir()
        (home / "src").mkdir()
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            machine_id = await _machine(core, port, host_key)
            t = await core.terminals.open(core.owner, machine_id, 100, 30)
            await _until(lambda: _prompts(t) >= 1, what="the first prompt")
            assert t.blocks and t.path
            assert t.run("echo one\necho two") is None
            assert t.run("echo three") == "A command is still running."
            await _until(lambda: _prompts(t) >= 2, what="the pasted lines")
            assert b"one\r\ntwo" in _screen(t)
            assert t.run("printf 'a\\tb\\n'; (exit 4)") is None
            await _until(lambda: _prompts(t) >= 3, what="tab and code")
            assert b"a\tb" in _screen(t) or b"a       b" in _screen(t)
            assert t.run("echo \x1b[201~evil") is None
            await _until(lambda: _prompts(t) >= 4, what="no escape")
            assert t.run("  ") == "There is no command to run."
            # Keys typed into a command that never read them wait for the
            # line editor; the next command must not start with them.
            t.write(b"leftover")
            await asyncio.sleep(0.3)
            assert t.run("echo clean") is None
            await _until(lambda: _prompts(t) >= 5, what="clean")
            started = [e.data["command"] for e in t.events
                       if e.kind == "ev" and e.data["t"] == "C"]
            assert started[-1] == "echo clean", started[-1]
            # bash runs the two pasted lines as two commands, zsh as one.
            rows = await _saved(core, t.id, 5 if login.endswith("bash") else 4)
            commands = [r["command"] for r in rows]
            assert "echo two" in commands or "echo one\necho two" in commands
            assert commands[-2] == "echo [201~evil", "the escape was taken out"
            assert rows[0]["cols"] == 100
            codes = {r["command"]: r["exit_code"] for r in rows}
            assert codes["printf 'a\\tb\\n'; (exit 4)"] == 4
            # The events the page builds its blocks from.
            evs = [e.data for e in t.events if e.kind == "ev"]
            assert all("at" in e for e in evs)
            assert all("trim" in e for e in evs if e["t"] == "P")
            assert t.describe()["blocks"] and t.describe()["running"] is None
            # Tab, over the side channel.
            got = await t.complete("cd M", 4)
            assert got["kind"] == "dir" and got["start"] == 3
            assert [i["text"] for i in got["items"]] == ["My\\ Docs/"]
            got = await t.complete("ls s", 4)
            assert "src/" in [i["text"] for i in got["items"]]
            got = await t.complete("ech", 3)
            assert "echo" in [i["label"] for i in got["items"]]
            dirs = await t.dirs()
            assert "src" in dirs["dirs"] and "My Docs" in dirs["dirs"]
            assert (await t.branches())["local"] == [], "not in a repository"
            if login.endswith("bash"):
                # A ! that bash cannot expand: it says so and shows its
                # prompt again without any marker. The next command finds
                # that out, sets the shell back, and asks for Enter again.
                stale = terminals.TYPED_STALE
                terminals.TYPED_STALE = 0.5
                try:
                    n = _prompts(t)
                    assert t.run('echo "fix!it"') is None
                    await asyncio.sleep(0.8)
                    assert _prompts(t) == n, "bash gave no marker"
                    why = t.run("echo next")
                    assert why and "Enter again" in why, why
                    await _until(lambda: _prompts(t) > n, what="Ctrl+C")
                    assert t.run("echo next") is None
                    await _until(lambda: _prompts(t) > n + 1, what="next")
                finally:
                    terminals.TYPED_STALE = stale
            assert t.run("cd repo") is None
            await _until(lambda: t.branch == "feature/x", what="the branch")
            # A long one: the page sees it as running, then not.
            assert t.run("sleep 1; echo slept") is None
            await _until(lambda: t._block is not None, what="sleep starts")
            running = t.describe()["running"]
            assert running and running["command"] == "sleep 1; echo slept"
            await _until(lambda: t._block is None, what="sleep ends")
            await t.close()
    finally:
        shutil.rmtree(home, ignore_errors=True)


async def _frames(ws, until, timeout: float = 15) -> list:
    got: list = []
    end = time.monotonic() + timeout
    while not until(got):
        left = end - time.monotonic()
        assert left > 0, f"timed out; got {got[-5:]!r}"
        msg = await asyncio.wait_for(ws.recv(), left)
        got.append(json.loads(msg) if isinstance(msg, str) else msg)
    return got


def _op(name):
    return lambda got: any(isinstance(f, dict) and f.get("op") == name
                           for f in got)


async def test_run_over_the_socket_asks_about_danger(h):
    login, full = _login_shell()
    if not full:
        return
    home = _home()
    try:
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            machine_id = await _machine(core, port, host_key)
            t = await core.terminals.open(core.owner, machine_id, 90, 25)
            await _until(lambda: _prompts(t) >= 1, what="the first prompt")
            tid = str(t.id)
            async with page_socket(core.page_port) as ws:
                await ws.send(json.dumps({"op": "attach", "ch": 1, "id": tid,
                                          "after": None, "cols": 90, "rows": 25}))
                await _frames(ws, _op("replayed"))
                (home / "junk").mkdir()
                await ws.send(json.dumps({"op": "run", "ch": 1,
                                          "command": "rm -rf junk"}))
                got = await _frames(ws, _op("confirm"))
                ask = next(f for f in got if isinstance(f, dict)
                           and f.get("op") == "confirm")
                assert "delete a directory" in ask["what"]
                assert not ask["everything"]
                assert (home / "junk").exists(), "nothing ran before the yes"
                await ws.send(json.dumps({"op": "run", "ch": 1,
                                          "command": "rm -rf junk",
                                          "confirmed": True}))
                await _until(lambda: not (home / "junk").exists(),
                             what="the confirmed delete")
                await _until(lambda: t._block is None and not t._typed,
                             what="back at the prompt")
                await ws.send(json.dumps({"op": "run", "ch": 1,
                                          "command": "sleep 2"}))
                await _until(lambda: t._block is not None, what="sleep")
                await ws.send(json.dumps({"op": "run", "ch": 1,
                                          "command": "echo no"}))
                got = await _frames(ws, _op("refused"))
                refused = next(f for f in got if isinstance(f, dict)
                               and f.get("op") == "refused")
                assert "running" in refused["reason"]
            await t.close()
    finally:
        shutil.rmtree(home, ignore_errors=True)


async def test_the_feed_and_history_come_from_the_database(h):
    login, full = _login_shell()
    if not full:
        return
    home = _home()
    try:
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            machine_id = await _machine(core, port, host_key)
            t = await core.terminals.open(core.owner, machine_id, 80, 24)
            await _until(lambda: _prompts(t) >= 1, what="the first prompt")
            for i, cmd in enumerate(["echo first", "seq 1 20000",
                                     "echo first", "echo last"]):
                assert t.run(cmd) is None
                await _until(lambda n=i: _prompts(t) >= n + 2, what=cmd)
            rows = await _saved(core, t.id, 4)
            port_ = core.page_port
            r = await request(port_, "GET", f"/api/terminals/{t.id}/blocks")
            feed = r.json()
            assert r.status == 200 and not feed["more"]
            assert [b["command"] for b in feed["blocks"]] == \
                ["echo first", "seq 1 20000", "echo first", "echo last"]
            big = feed["blocks"][1]
            tail = base64.b64decode(big["output"])
            assert big["partial"] and big["size"] > len(tail), "only its end"
            assert tail.endswith(b"20000\r\n") and tail[:1].isdigit(), \
                "the end, from the start of a line"
            assert big["exitCode"] == 0 and big["cols"] == 80
            r = await request(port_, "GET",
                              f"/api/terminals/{t.id}/blocks?limit=2")
            assert [b["command"] for b in r.json()["blocks"]] == \
                ["echo first", "echo last"] and r.json()["more"]
            before = r.json()["blocks"][0]["seqStart"]
            r = await request(port_, "GET",
                              f"/api/terminals/{t.id}/blocks?before={before}")
            assert [b["command"] for b in r.json()["blocks"]] == \
                ["echo first", "seq 1 20000"]
            r = await request(port_, "GET", f"/api/terminals/{t.id}/blocks/"
                              f"{rows[1]['seq_start']}/output")
            assert r.status == 200 and r.body.startswith(b"1\r\n2\r\n")
            assert r.headers["x-tterm-cut"] == "0"
            r = await request(port_, "GET", f"/api/terminals/{t.id}/history")
            commands = [c["command"] for c in r.json()["commands"]]
            assert commands == ["echo last", "echo first", "seq 1 20000"]
            # Tab and the lists need the page's header, like every POST.
            r = await request(port_, "POST", f"/api/terminals/{t.id}/dirs",
                              headers={"content-type": "application/json"},
                              body=b"{}")
            assert r.status == 403
            r = await request(port_, "POST", f"/api/terminals/{t.id}/complete",
                              headers=CHANGE,
                              body=json.dumps({"line": "ech",
                                               "cursor": 3}).encode())
            assert r.status == 200 and r.json()["items"]
            nobody = uuid.uuid4()
            for path in (f"/api/terminals/{nobody}/blocks",
                         f"/api/terminals/{nobody}/history",
                         f"/api/terminals/{nobody}/blocks/1/output"):
                assert (await request(port_, "GET", path)).status == 404
            r = await request(port_, "POST", f"/api/terminals/{nobody}/branches",
                              headers=CHANGE, body=b"{}")
            assert r.status == 409
            await t.close()
            r = await request(port_, "GET", f"/api/terminals/{t.id}/blocks")
            assert len(r.json()["blocks"]) == 4, "an ended terminal keeps its feed"
            info = await core.terminals.ended(t.id, core.owner.id)
            assert t.home and info and info["home"] == t.home, \
                "and its home, so ~ reads as ~ after a restart too"
    finally:
        shutil.rmtree(home, ignore_errors=True)


# The key the markers carry in these checks, kept in sight of the imports.
assert KEY
