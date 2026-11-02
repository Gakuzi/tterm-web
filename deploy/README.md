# tTerm Web on a server

One Ubuntu 24.04 server runs all of it. Two names lead to it straight, with
no proxy in between (in Cloudflare: "DNS only"): one for people, one for
machines. A proxy that ends TLS would see every command and its output.

```
server
├── nginx            the only thing open to the internet: 80 and 443
│   ├── app.…        the page, its API and socket   → 127.0.0.1:8090
│   └── connect.…    installers and agents          → 127.0.0.1:8091
├── tterm-web        the core, user tterm-web       (python -m tterm.serve)
├── tterm-signer     the CA keys, user tterm-signer (python -m tterm.signer)
└── PostgreSQL       the database tterm_web, reached by the core's own user
```

The core asks the signer for certificates over a Unix socket that only the
group `tterm-sign` (the core) may reach, and never sees the keys. The signer
has no network at all.

## Setting it up

You need:

- a server with Ubuntu 24.04, 2 GB of memory or more, and SSH as root;
- two names that point at its address, without a proxy;
- an address for Let's Encrypt to write to about the certificate.

On the server, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/tterm-net/tterm-web/main/deploy/setup.sh -o setup.sh
sh setup.sh app.example.com connect.example.com you@example.com
```

It installs nginx, PostgreSQL, Python and certbot; makes the users
`tterm-web` and `tterm-signer` and the group `tterm-sign`; puts the code in
`/opt/tterm-web` with its own Python environment; makes the database; writes
the settings to `/etc/tterm-web/core.env`; starts both services; gets one
certificate for both names; sets up nginx; keeps the system's logs 30 days;
and opens the firewall to SSH, 80 and 443 only. Running it again is safe.

Then open `https://app.example.com` and sign in. Until there is an email
key (below), the codes go to the core's log:

```bash
journalctl -u tterm-web -n 20 --no-pager
```

## Email

The codes go out through [Brevo](https://www.brevo.com): an account, the
sending domain authenticated there (Brevo shows the DNS records: its code,
DKIM, and DMARC if there is none), and an API key. Then, on the server, in
a terminal of your own over SSH, never through a chat:

```bash
sh /opt/tterm-web/deploy/brevo-key.sh
```

It asks for the key without showing it, puts it in the settings and
restarts the core. The sender is `TTERM_MAIL_FROM` in the settings.

## Updating

```bash
sh /opt/tterm-web/deploy/update.sh
```

It takes the latest from git as the user `tterm-web`, the Python packages,
the systemd units and nginx's settings, and restarts both services. The
core restarting ends the terminals; agents connect again by themselves. A
terminal that ended so says "tTerm Web was updated to <version>." on its
tab and in its machine's log once a new version starts (the core keeps
each start and its version, in `core_runs`); a restart of the same version,
with nothing new in git, says "tTerm Web stopped.", as before. Open a new
terminal there starts in the folder it was in. The page comes built in
`web/dist`: the server has no Node.

## Plans and their limits

Everyone is on the free plan for now: 50 machines and 24 open terminals a
person. The limits live in the database, in the table `plans`, and the core
reads them at the moment someone adds a machine or opens a terminal, so a
change works at once, with no restart:

```bash
runuser -u postgres -- psql -d tterm_web -c "UPDATE plans SET limits = jsonb_set(limits, '{terminals}', '32') WHERE id = 'free'"
```

A limit is a whole number under a name the core knows (`machines`,
`terminals`); the database refuses anything else, so a typo cannot quietly
lift a limit. A plan without a name has no limit for it.

Every hour the core writes down how much it carries, in the table
`usage_stats`: people, the active ones, new accounts, codes sent, machines,
the most one person has, computers online, the most terminals open at once,
in all and for one person, commands, the database's size and the core's
memory. Counts only, kept a year. To see them, with who has the most
machines and terminals now:

```bash
sh /opt/tterm-web/deploy/stats.sh
```

## Where things are

| Path | What |
|---|---|
| `/opt/tterm-web` | the code and its Python environment, the user `tterm-web`'s |
| `/etc/tterm-web/core.env` | the core's settings, readable by root and the core |
| `/var/lib/tterm-web/auth.key` | the secret for the hashes of codes and quick codes |
| `/var/lib/tterm-signer` | the CA keys and the signer's journal, its user's alone |
| `/run/tterm-signer/signer.sock` | the signer's socket |
| `/var/backups/tterm-web` | a dump of the database a night, the last two weeks |

Logs: `journalctl -u tterm-web` and `journalctl -u tterm-signer`. They hold
no commands and no output, and the journal keeps 30 days of them, as the
Privacy Policy says; `deploy/logs.sh` sets that, and keeps them out of
rsyslog's `/var/log/syslog`, which would hold them five weeks.

## What to keep safe

- **The CA keys,** `/var/lib/tterm-signer/cas`. Every server trusts them.
  Lost, each server has to be connected again; leaked, whoever has them can
  sign in to those servers. Then retire the CA: put its id on a line of
  `/var/lib/tterm-signer/retired` and run
  `sudo systemctl restart tterm-signer tterm-web`. It signs nothing from
  then on, and if no other CA is left, the signer makes a new one. Connect
  each server again with Add a machine, and take the old CA's lines out on
  it: `sudo sed -i '/ tterm-web CA-ID$/d' ~tterm/.ssh/authorized_keys`, with
  the retired CA's id for CA-ID.
- **`auth.key`.** Lost, quick codes stop working and every device signs in
  with a code from email once. The database alone, without it, guesses no
  code.
- **The database dumps** hold the people, the machines, and the commands
  with their output for 30 days.

The nightly dumps stay on this server; a backup of the whole server
(DigitalOcean's, for one) covers the rest.

## Restoring the database

```bash
systemctl stop tterm-web
runuser -u postgres -- dropdb tterm_web
runuser -u postgres -- createdb -O tterm-web tterm_web
runuser -u postgres -- pg_restore --no-owner --role=tterm-web -d tterm_web /var/backups/tterm-web/tterm_web-DATE.dump
systemctl start tterm-web
```
