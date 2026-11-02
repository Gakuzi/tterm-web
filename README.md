# tTerm Web

tTerm in the browser: a real terminal with command blocks, for people who work
with servers and for their teams. Projects, roles, a journal of who ran what,
and watching a colleague's terminal, always with them knowing.

**Status:** early development. Version 0.1.23 makes a machine's log the
machine's own: moved to another project, the machine takes all of it
along, the lines written before the move too, and the move is a line of
it; whoever is in the project the machine is in now reads all of it, and
deleting the project it left takes none of it away. Version 0.1.22 keeps each line of a
machine's log to one line, the command cut short where it is long and
how many notes are under it; a click on it opens the command in full,
what it printed and the notes, and a click again closes it. Lines Find
in this log found open the same way, and the search stays until you
clear it. Version 0.1.21 opens what a command
printed under its line of a machine's log, finds words in the whole log, a
year back, and in search too, and shows only the failed lines, those with
notes, someone's or one terminal's, the newest first if you like.
Version 0.1.20 keeps a log of each
machine: every command run on it through tTerm is a line, with who ran
it, when, how it ended, how long it took and where, in the Logs folder of
the project's notes, a day at a time. Under a command, notes, written
from its block in the terminal or from the log, by a person or by an AI
on a person's behalf; nothing written is changed, it is answered with
Reply. The project's owner or an admin redacts a password or a token
that got into a line or a note: its words go for good, from the log, the
terminal's feed and search, and the log keeps who, when and why. Lines
are kept a year, what the commands printed 30 days.
Version 0.1.16 speaks the twelve languages
of the site: English, Deutsch, Español, Français, Italiano, Polski,
Português, Türkçe, Русский, 日本語, 한국어 and 简体中文. The account's menu
has Language after Settings, the languages beside it, the one shown on top
with a check; the one chosen is kept in the account, and until one is,
the page speaks the browser's language when it is one of them, English
otherwise. It comes with the app 0.6.0, whose own menus speak the same.
Version 0.1.15 shows how tTerm for the
Mac updates itself, with the app 0.5.0: while a new version is ready,
Restart to update in the top bar next to Search and a card above the
account in the sidebar; once after the restart, tTerm is updated with
What's new; and in Settings, Updates, where it updates by itself
(recommended, the default: as tTerm quits, and in the menu bar with
nothing running on the Mac) or asks first, with how it is now, Check now,
why it cannot update itself where it runs and, from the disk image, Move
to Applications. tTerm's menu's Check for Updates… opens Settings there.
Version 0.1.14 gives Settings in tTerm
for the computer, signed in, a part for This computer: the switch Open
from tTerm Web and your phone, and under it how its link to tTerm Web is
(online, connecting and why not yet, no network, removed there, or off by
itself and why); it comes with the app 0.4.0, which keeps that link itself
in the agent's place, and a computer's card says "tTerm app" for it where
an agent's version would be. Version 0.1.13 shows on a button what
pressing it did: a copy puts a check where the button's icon was, in the
button's own colour, for a moment, and Copy says Copied; Run again turns
its arrow once, and the new run is ringed in amber as it starts. Version
0.1.11 gives the web an icon of
its own, so that its tab is not taken for the site's: tTerm's, with the
arrow green instead of amber, and that is all; 0.1.9 had a green dot in
the corner and 0.1.10 a green arrow, each blinking while a command ran.
Version 0.1.8 lets the person allowing
tTerm for the computer use another account than the browser's: Not you?
under Cancel ends this browser's session and asks for an email first; and
in the app's window a photo comes through the app, as its other requests
do. Version 0.1.7 searches everything: Cmd+K,
or Search at the top, finds the commands of every terminal of yours, ended
ones too, what they printed, notes, whole, terminals, machines, projects
and things to do; Enter opens a command in its terminal, at its block,
marked, and Cmd+Enter puts it into the line of the terminal in front,
not run. Account takes a photo of your own, cut to a circle in the
browser and kept by tTerm as 256 pixels with nothing else of the file;
it shows where your name is written, the initials stay where a badge
alone says whose a terminal is. Version 0.1.6 lets tTerm for the computer
sign in with the browser: the app opens tTerm there, the person allows it,
and a one-time code goes back to the app on that very computer, which
trades it with a secret of its own (PKCE) for a device key; the app shows
in Settings under Devices, and Forget signs it out. In the app the page
marks the computer it runs on and says when tTerm cannot be reached.
Version 0.1.5 shows New project and Add
machine in the app before signing in too: there they tell what an account
brings and what the Free plan gives, and offer to sign in. Settings ends
with support's address alone. Version 0.1.4 turns the account at the
bottom of the sidebar into a menu: Settings, Account and Sign out. Account
keeps the name and the plan; Settings has the theme, project colors, the
trusted devices and the documents, and the email about a new sign-in
leads there; Sign out signs out at once, and the sign-in screen says the
terminals keep running. The page also knows the app for the computer
before signing in: there it has Personal with that computer, adds no
machines and makes no projects, says Not signed in at the bottom, and
offers Sign in. Version 0.1.3 mends bash in a folder with a
space in its name: tTerm's script took the folder's path as cut at the
space, so bash printed an error before every prompt and the git branch
was not found. Version 0.1.2 names a terminal where it is
listed too, with a double click on it in the sidebar or on its project's
page, and moves a note to another project, into any of its folders or into
one made there for it, with its history and its ticks; out of a project a
note goes by the hand of those who may delete it there, and each project's
journal keeps a line that names neither the other project nor its folder.
Version 0.1.1 lets you make projects of your
own besides Personal, rename any of them, Personal too, and give each a
color: it fills the project's code badge, or tints its whole block in the
sidebar, as you choose on the account page. A machine moves from one
project to another with its terminals running, a project without machines
can be deleted, and a terminal gets a name of its own with a double click on
its tab. Version 0.1.0 adds notes: each project keeps
them in folders, the way terminals live on machines, with Markdown as you
type, checklists that say who ticked an item and when, and code with Copy. A
note written on two devices at once keeps the changes of both, and asks only
when the same place changed both ways. The sidebar shows each project's
machines and notes; a click on a machine or a folder only folds it, its "+"
opens a terminal or starts a note, and a project's name opens its page.
Version 0.0.12 makes a certificate for one
server useless on any other: each server trusts tTerm Web only for
certificates made out to it, a server connected earlier is moved over at
tTerm Web's next sign-in there, and removing a server takes tTerm Web's
access back on the server itself. The block under the mouse stands out a
little, and a device is deleted once forgotten or after 90 days without a
sign-in. Version 0.0.11 dressed the two emails, the code for signing in and
the note about a new sign-in, in tTerm's look: HTML with the logo and the
code large, the same words as plain text beside it.
Version 0.0.10 added the account page, opened
from the account at the bottom of the sidebar: your name, which you can
change, the plan and what counts against it, the trusted devices with Forget
and Forget all devices, the theme, and Sign out, which makes the browser
forget you. Version 0.0.9 let everyone in: you sign up
with a code from email, your name and a yes to the Terms of Service, then sign
in with a code from email, or on a device you trust with a four-digit quick
code; each person sees only their own machines and terminals, as many as
their plan allows; and tTerm Web runs on a server of its own, set up with
one script (`deploy/`). Version
0.0.8 added a computer with one command that installs
tTerm's agent and starts it
whenever you log in, removing machines and ending terminals, and folded
blocks and a cleared feed that stay so. Since 0.0.7 the page is the one
of the mockups: tabs of open terminals from any project, "+" for a terminal
on any machine, a palette on Cmd+K, and a computer's terminals live through
its sleep, waiting while it is away and going on where they were. Since 0.0.6 a
laptop without a public address gets the same terminals as a server, and
since 0.0.5 a terminal is a feed of blocks, one per command, typed into
tTerm's own input line: history from all your devices, Tab that asks the
machine, the directory and the git branch as buttons, and a question before
a command that would destroy something. The classic terminal is one click
away. Accounts and a server of its own came early, in 0.0.9; next come
teams, then a public launch.

Related:

- [tTerm](https://github.com/tterm-net/tTerm), the Telegram bot
- [tterm-app](https://github.com/tterm-net/tterm-app), the app for the
  computer, and in `agent/` the agent for computers without a public
  address: one file for macOS and for Linux on Intel and ARM, released
  there, signed, and updating itself (from 0.1.12)
- [tterm-agent](https://github.com/tterm-net/tterm-agent), the agent
  before it, in Python: for the bot, and for a computer the new one has no
  file for
- [tterm.net](https://tterm.net)

## Run it on your computer

For development. The page answers only on the computer it runs on, and you
sign in there as anyone would, with a code from email: without a Brevo key
(`TTERM_BREVO_KEY`) the email goes to the window tTerm Web runs in, so the
code is there. If this computer already has machines and history from before
0.0.9, set `TTERM_OWNER_EMAIL` in `.env` first: they are yours under that
address.

You need Python 3.12 or newer and PostgreSQL 16 or newer. The defaults expect
PostgreSQL on port 5433 with a database named `tterm_web`; set
`TTERM_DATABASE_URL` to use another one (see `.env.example`).

```bash
createdb -h localhost -p 5433 tterm_web

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# The page comes built, in web/dist. After a change in web/, build it again:
# (cd web && npm ci && npm run build)

python -m tterm.dev
```

Then open http://localhost:8090. Stop it with Ctrl+C.

To connect a server, the server must reach your machines' address: set
`TTERM_CONNECT_URL` to an address that leads to port 8091 on this computer,
for instance through a Cloudflare tunnel. Then "Add a machine" gives the
command to run on the server, and "Open a terminal" opens a shell on it. A
computer gets a command that installs the agent instead: the installer
takes the file for that system from the agent's release in
[tterm-app](https://github.com/tterm-net/tterm-app) and checks it against
the checksum written in the installer (`tterm/templates/install_computer.sh`)
before it runs; the agent then updates itself, to versions the release
build signed. To try an agent that is not released yet, hand the installer
a file of it, `curl -fsSL …/c/TOKEN | TTERM_AGENT_FILE=$HOME/tterm-app/target/release/tterm-agent TTERM_UPDATE=off sh`:
`TTERM_UPDATE=off` keeps it from updating itself, until a run with
`TTERM_UPDATE=on`. The same dialog has the command that starts agent.py by hand from
a checkout of [tterm-agent](https://github.com/tterm-net/tterm-agent); on a
system the new agent has no file for, the installer puts agent.py in its
place, from `TTERM_SRC` if set.

The checks need the same PostgreSQL. They create throwaway databases there
and drop them at the end. With tterm-agent checked out next to this
repository, they run the real agent too, or the new one with
`TTERM_AGENT` set to its file:

```bash
python -m tterm.tests
```

## How it is put together

```
tterm/
  core/          settings, the database and its migrations, people, projects,
                 machines, SSH, the server passport, terminals and the shell
                 on the other end of them, Tab, the commands held back
  core/auth.py   signing in: codes from email, trusted devices, sessions
  core/notes.py  notes in folders: saving, merging, ticks, who may do what
  core/mail.py   the emails, through Brevo or into the log
  core/letters.py  what the emails say, as HTML and as text
  api/page.py    the page and its API, for people, each within a session
  api/ws.py      the page's socket: every terminal on the page goes through it
  api/connect.py where machines talk to us: installer, registration, and
                 the agents of computers, which stay connected
  signer/        the signer: CA keys and short certificates, its own process
  templates/     the installers for servers and computers, and the shell
                 scripts terminals put on them
  server.py      runs both apps, on two ports
  dev.py         python -m tterm.dev: the signer, then the core
  serve.py       python -m tterm.serve: the core alone, on a server
  tests/         python -m tterm.tests
web/             the page: React, TypeScript, Vite, xterm.js
deploy/          a server: the setup script, systemd, nginx, backups
```

**Languages.** Every word the page shows is a string of
`web/src/i18n/<language>.txt`, as the site's are: `key = text` a line,
`{name}` a value the page puts in, `one: … | other: …` the forms a language
counts with (Unicode CLDR), `<b>…</b>` a part the page makes a link, bold or
code. English is the source; it comes with the page, and another language
is a file of its own, loaded once it is wanted. Components take their words
from `useT()` (`web/src/i18n.ts`) and draw again in another language as soon
as it is chosen. Before every build `web/scripts/strings.mjs` checks that
every language has every key of English, with its values and parts and its
own forms, that every key is used, and that no words are left in the code;
the build stops if not. The language chosen is the account's
(`users.language`); in the browser the one last shown is kept too, so the
first paint is in it. The core's own messages and the emails are in
English for now.

**How a server connects.** "Add a machine" makes a one-time command that
works for ten minutes. On the server it creates the user `tterm` with no
password, adds our certificate authority to that user's `authorized_keys`
for the server's own principal only (never touching `sshd_config`), gives
it sudo in `/etc/sudoers.d/tterm` and reports the server's host keys back.
tTerm Web then signs in once over SSH, with those host keys pinned and a
certificate for that principal, so only a server where the command ran lets
it in, and reads what the server is: system, shell, package manager, the
commands it has. If anything fails, the reason shows in the page and in the
installer's output, and the same command can be run again.

**A terminal** is a real login shell in a real terminal on the server,
bash or zsh as the server has it, reached over SSH with a certificate of its
own. It lives in tTerm Web, not in the browser: closing the tab, reloading
the page or a dropped connection leave it running, and the page takes up
where it was. Only the shell's own end, or tTerm Web stopping, ends it.

The shell also prints invisible markers, the way iTerm2, VS Code and Warp
do: before each prompt (the exit code, the directory, the git branch) and
when a command starts (its text). From them each command becomes a block:
its text, where it ran, how long it took, how it ended and its output, kept
in the database for as long as the project says. The scripts behind the
markers live on the server in `~/.tterm` of the user `tterm`; tTerm Web
writes them each time it opens a terminal there and starts the shell with
them, after the usual startup files. Every marker carries a one-time key
that the shell reads as the very first line, with echo off, so nothing a
program prints can pass for one. The key never touches a file, the
environment or a command line.

**The feed.** The page shows those blocks as a feed, as Warp does. The
command running now is drawn by xterm.js, so colours, progress bars and
password prompts work as in any terminal, and keys go straight to it. When
it ends, its screen is read back into text you can select, search and copy,
and a full-screen program such as vim or htop gets the whole window while it
runs. Finished blocks come from the database, so a reload shows the feed at
once and a running command is drawn again from what tTerm Web kept of it.

**The input line** is the page's own, not the shell's: several lines, the
mouse, history from every device you used, a grey suggestion from it. Enter
hands the whole command to the shell at its prompt as a bracketed paste, so
nothing in it is read as a key binding. Tab, and the lists behind the
directory and branch buttons, come from the server itself over a quiet side
channel of the same SSH connection: a small sh script that never touches the
terminal, its screen or its history. A handful of commands that destroy
something for good (a recursive delete, a wiped disk, a dropped database, a
shutdown) wait for a yes first. The classic mode is the terminal of 0.0.4:
every key goes to the shell, with its own Tab and history, and nothing is
checked. bash older than 4.4 cannot say where a command starts, so there
only the classic mode works.

**A computer** has no address to reach, so its agent reaches us: it opens a
WebSocket to the machines' side and keeps it, and every terminal on that
computer goes through it. "Add a machine", then "Computer", gives a command
to run there as yourself: `curl -fsSL …/c/TOKEN | sh`. It puts the agent in
`~/.tterm-web`, one file for that system from the agent's release (from
0.1.12; before, agent.py with a Python environment of its own), makes the
computer a key of its own (in `~/.tterm-web/env`, readable by you only; tTerm Web keeps
only its hash), and starts the agent whenever you log in: launchd on macOS,
systemd on Linux, or in the background until the next restart where there
is neither. The token in the command lets the computer join once within ten
minutes. The agent then updates itself, to versions tTerm's release build
signed and only while none of its terminals is open. The same command run
there again, with a new token, puts the agent in again and keeps the key,
so the computer stays the machine it was; its open terminals end, as the
agent restarts. `~/.tterm-web/uninstall.sh` removes
it all; the tTerm bot's agent in `~/.tterm` is never touched. Through that connection the
agent starts the shell a terminal asks for, in a terminal of the page's size,
and passes the bytes both ways untouched; it also runs the small sh scripts
behind Tab and the lists, and the one that puts the shell scripts in
`~/.tterm`. A computer is online while its agent runs, and the page shows
it, or when it was last seen. The agent is still a pipe: markers, blocks
and the rest stay here, as for a server. A computer installed afresh (its
`~/.tterm-web` gone) is a new machine, even under the same name: a name is
whatever a computer calls itself. A second agent with a key already
connected is turned away while the first one answers.

**A computer that sleeps.** When its agent's connection goes (the lid is
closed, the network blinks), the agent keeps the shells running and the
last megabyte each of them printed, and tTerm Web keeps the terminals,
away: they say they wait for the computer and take no keys. When the agent
is back, each terminal is taken back from the byte tTerm Web has of it:
nothing lost, nothing twice, and a full-screen program goes on as it was.
Terminals wait up to 12 hours; the agent keeps its shells for an hour of the
computer being awake without the link, and time asleep does not count. A
terminal the agent no longer has (it was restarted) ends and says why; one
stopped with Ctrl+C says goodbye, and its terminals end at once.

**Removing.** The owner and admins of a project can remove a machine, from
its card on the machines page or from its menu on the project's page, after
a question. Its terminals end and say
why, and it leaves the lists; the journal keeps what happened. A computer's
agent is told, forgets its key and stops; that key never works again, so a
key that leaked is dead once its computer is removed. A server
stops being signed in to, and tTerm Web takes its line out of the server's
`authorized_keys` itself; if the server does not answer, the page gives the
command that does it there. Ending a terminal
from the sidebar or the palette ends its shell, after a question too.

The machines' side is open to the internet, so `/agent` keeps strangers
short: the hello is small and comes at once, only a few connections from
one address may wait to say it, an address whose unknown tokens keep failing
waits a while, and no message is larger than a script's answer.

**The page** keeps tabs of the terminals and notes you work with, and of
projects' pages, from any project, in this browser. Every tab's terminal or
note is on the page at once, the others hidden behind the one in front, so
switching is instant and none of them is told of a new size. Closing a tab
leaves its terminal running, in the sidebar under its machine, where a click
brings the tab back; a note stays in its folder. In the sidebar a click on a
machine or a folder folds or unfolds it, and what is folded stays so in this
browser; the "+" beside it opens a terminal there or starts a note. "+" on
the line of tabs opens a terminal on any machine, and Cmd+K on a Mac,
Ctrl+Shift+K elsewhere, searches everything (from 0.1.7): the commands of
every terminal of yours, ended ones too, as long as the project keeps their
output, what they printed, notes, whole, terminals, machines, projects and
what the page can do; plain Ctrl stays the terminal's. Buttons over its list
keep to one kind, and so does a word in front: `c:` commands, `o:` output,
`n:` notes, `t:` terminals, `m:` machines, `p:` projects, `>` things to do.
Enter opens a command in its terminal at its block, marked, a note at the
block with the words; Cmd+Enter (Ctrl+Enter elsewhere) puts a command into
the line of the terminal in front without running it. The core keeps what a
command printed as plain text for this too, the start and the end of a long
output, and makes it in the background for blocks from before 0.1.7. Folded blocks, and a feed cleared with `clear` or Ctrl+L, stay
so after Classic and back or a reload, in this browser. A tab's dot is its machine: green on line, a turning ring while
a command runs, a hollow ring while the computer is away. When the page
loses tTerm Web, a strip says so until it is back.

**Notes** live in folders of a project, the way terminals live on its
machines: everyone in the project reads and writes them, an observer only
reads, and a note is deleted by its author, the owner and admins, a folder
with its notes by the owner and admins. A note moves to another folder of
its project, and from 0.1.2 to another project the person writes notes in,
into one of its folders or, where it has none, into a folder of the same
name made there for it: out of a project by those who may delete it there.
Its versions and ticks go with it, and each project's journal keeps a line
that names neither the other project nor its folder. A note is a title and blocks: text,
headings, list and checklist items, code and dividers. Markdown typed at the
start of a block turns it into what it means, "/" offers the same from a
list, and text pasted with several lines becomes blocks. The core keeps the
blocks as JSON and the page shows them only as text, so nothing written in a
note runs on the page. A note is saved a moment after typing stops, naming
the version it was made from; one made from an older version is merged with
what was saved since, block by block, and only the same block changed both
ways asks whose change to keep there, everything else staying from both.
The last 50 versions of a note are kept for that. What is typed and not
saved yet, with no connection say, stays in the browser until it is, and
comes back when the note is opened again. A tick in a checklist is saved at
once, and who ticked and when come from the core, never from the page.

**The signer** holds the CA keys and nothing else, in a process of its own.
For every connection the core makes a throwaway key pair and asks the
signer to certify the public half for two minutes, made out to the one
server it connects to: each server's line in `authorized_keys` names a
principal of its own, `m-` and a UUID, so a certificate for one server is
of no use on another. The key id names the person: the server's own
`auth.log` then shows who signed in. The signer keeps its own journal of
every certificate, and a CA it is told to retire signs nothing more.

The page and the machines' side are separate apps on separate ports, as they
will be separate addresses on the server: `app.tterm.net` for people and
`connect.tterm.net` for machines. Nothing of the page is reachable through the
machines' address.

**Signing in.** Anyone can. After the first code that works for an address
the person gives their name and ticks one box, agreeing to the Terms of
Service and the Privacy Policy, both links (`TTERM_TERMS_URL`,
`TTERM_PRIVACY_URL`); that makes the account, with its first project,
Personal, and keeps when the person agreed. The code is six digits by
email, for ten minutes and five tries, and only in the browser that asked
for it; codes come at most once a minute to an address, five an hour, and
there are limits per network and per day. Right after a code, the page
offers a quick code for this device, four digits, or "Not now". A quick
code works only together with a long random key the browser keeps, so it is
no use anywhere else, and five wrong ones forget the device. A session ends
after eight hours without anything done, and the quick code brings you back,
or with its device; the terminals keep running, and the page asks to sign in
again at once. Sign out, in the menu of the account at the bottom of the
sidebar, makes the browser forget you as well: next time it is a code from
email, which is also how you switch to another account. Settings lists the
trusted browsers, forgets one, or forgets them all. Each sign-in from a
browser tTerm Web does not know is told by email. Only hashes are kept: of the codes and quick codes
with a secret of the server's that is not in the database (`auth.key`), and
of the session and device keys, long and random, plain ones. The cookies are `HttpOnly` and
`SameSite=Strict`, and on https `__Host-` and `Secure`. Each person sees
and reaches only their own projects, machines, terminals and history, and
has as many machines and open terminals as their plan allows: 50 and 24 on
the free plan, the only one for now. Plans and their limits live in the
database, so a limit changes on a running server, without a release; every
hour the core writes down how much it carries (`usage_stats`), to show
when a limit needs another look.

The page guards itself as well: it answers only when the browser asks for
its own address (`TTERM_PAGE_URL`; on a laptop `localhost` or `127.0.0.1`
with its port), which defeats DNS rebinding, and a request that changes
something must come from the page itself, its socket included. The page
loads nothing from other sites, fonts included, and its security policy
allows no inline scripts or styles; the few style elements xterm.js writes
carry a one-time number each copy of the page gets.

## On a server

`deploy/setup.sh` sets up a fresh Ubuntu 24.04 server: nginx with Let's
Encrypt in front, PostgreSQL, the core and the signer as services under
users of their own, a firewall and a nightly dump of the database. See
[deploy/README.md](deploy/README.md).

## Contributing

Not open yet. Before the first outside pull request we will add a contributor
license agreement, so the project can keep its licensing options open.

## License

Copyright (C) 2026 Denis Gerasimenko

tTerm Web is free software: you can redistribute it and/or modify it under the
terms of the GNU Affero General Public License, version 3, as published by the
Free Software Foundation. See [LICENSE](LICENSE).

Using tTerm Web with your own machines places no obligations on you. The
license matters when you distribute a modified version or run one as a service
for others: then you must offer its source to the people who use it.

The page bundles the fonts Manrope and JetBrains Mono, both under the SIL Open
Font License 1.1, and xterm.js with its add-ons, under the MIT License.
