var e=`# Strings of tTerm Web's page in English: one a line, \`key = text\`.
# Every language has the same keys; the build stops when one is missing
# (scripts/strings.mjs). {name} is a value the page puts in; a counting
# string has a form for each plural of the language, "one: … | other: …",
# and {n} is the count; <b>…</b> wraps a part the page makes a link, bold
# or code. Names of machines, projects, notes and terminals, commands and
# their output, tTerm, tTerm Web and Free are not translated.

# ------------------------------------------------------------ common: words used in many places
common.close = Schließen
common.cancel = Abbrechen
common.save = Speichern
common.loading = Wird geladen …
common.try_again = Erneut versuchen
common.copy = Kopieren
common.copied = Kopiert
common.back = Zurück
common.done = Fertig
common.more = Mehr
common.sign_in = Anmelden

# ------------------------------------------------------------ time: how long ago (time.ts)
# A duration after "for": Away for 3 minutes, running for an hour.
time.for_less = weniger als einer Minute
time.for_minutes = one: einer Minute | other: {n} Minuten
time.for_hours = one: einer Stunde | other: {n} Stunden
time.for_days = one: einem Tag | other: {n} Tagen
# How long ago, in full words: Signed in 3 minutes ago.
time.ago_now = gerade eben
time.ago_minutes = one: vor einer Minute | other: vor {n} Minuten
time.ago_hours = one: vor einer Stunde | other: vor {n} Stunden
time.ago_days = one: vor einem Tag | other: vor {n} Tagen
# A machine that is offline: {ago} is one of the four above.
time.last_seen = zuletzt verbunden {ago}
# How long ago, short, in lists of notes and in Updates: Looked 5 min ago.
time.short_minutes = one: vor {n} Min. | other: vor {n} Min.
time.short_hours = one: vor {n} Std. | other: vor {n} Std.
time.yesterday = gestern
time.today = heute
time.days_ago = one: vor {n} Tag | other: vor {n} Tagen
time.last_week = letzte Woche
time.weeks_ago = one: vor {n} Woche | other: vor {n} Wochen
# {day} is a date as the language writes it: 12 Oct, 12. Okt.
time.on_day = am {day}
# In search: yesterday 17:38, 2 Oct 09:12.
time.yesterday_at = gestern {time}
time.day_at = {day} {time}

# ------------------------------------------------------------ here: the computer tTerm for Mac runs on
# Alone, as a label (the sidebar, tabs). Sentences that name it have a
# string of their own for each: .mac and .computer.
here.mac = dieser Mac
here.computer = dieser Computer

# ------------------------------------------------------------ role: one's role in a project
role.owner = Eigentümer
role.admin = Admin
role.member = Mitglied
role.observer = Betrachter

# ------------------------------------------------------------ color: projects' colors (colors.ts)
color.violet = Violett
color.sky = Himmelblau
color.teal = Petrol
color.pink = Pink
color.orange = Orange
color.lime = Limettengrün
color.indigo = Indigo
color.slate = Schiefergrau

# ------------------------------------------------------------ count: how many, in lists and lines
count.machines = one: {n} Maschine | other: {n} Maschinen
count.notes = one: {n} Notiz | other: {n} Notizen
count.terminals_open = one: {n} Terminal offen | other: {n} Terminals offen
# The end of a list cut short: web-01, web-02, web-03, web-04 and 3 more.
count.more = one: {n} weitere | other: {n} weitere

# A terminal that has only its number, in lists: terminal 2.
terminal.numbered = Terminal {number}
# A note without a title.
note.untitled = Ohne Titel

# ------------------------------------------------------------ sidebar (Sidebar.tsx)
sidebar.label = Seitenleiste
sidebar.all_machines = Alle Maschinen
sidebar.keep_open = Seitenleiste offen halten
sidebar.keep_open_title = Seitenleiste offen halten
sidebar.let_slide = Seitenleiste automatisch ausblenden
sidebar.close = Seitenleiste schließen
sidebar.projects = Projekte
sidebar.fold = {name} einklappen
sidebar.unfold = {name} ausklappen
sidebar.open_project = {name} öffnen: Maschinen und Notizen
sidebar.machines = Maschinen
sidebar.add_machine = Maschine hinzufügen
sidebar.no_machines = Noch keine Maschinen
sidebar.notes = Notizen
sidebar.new_folder = Neuer Ordner
sidebar.no_notes = Noch keine Notizen
sidebar.no_notes_writes = Noch keine Notizen. + legt einen Ordner dafür an
sidebar.new_project = Neues Projekt
sidebar.waits = {name} ist wieder da, sobald die Verbindung zu tTerm steht
sidebar.offline = {name} ist offline: im Ruhezustand, oder der Agent läuft nicht
# {seen} is time.last_seen: last seen 14 minutes ago.
sidebar.offline_seen = {name} ist offline: im Ruhezustand, oder der Agent läuft nicht ({seen})
sidebar.here.mac = {name}, dieser Mac: Seine Terminals laufen direkt hier, auch ohne Internet
sidebar.here.computer = {name}, dieser Computer: Seine Terminals laufen direkt hier, auch ohne Internet
sidebar.new_terminal = Neues Terminal
sidebar.new_terminal_on = Neues Terminal auf {name}
sidebar.rename_hint = Enter speichert, Esc bricht ab
sidebar.go_to = Zu {label} wechseln
sidebar.go_to_away = Zu {label} wechseln: Das Terminal wartet, bis {machine} zurück ist
sidebar.double_click = Zum Umbenennen doppelklicken
sidebar.end = {label} beenden
sidebar.end_title = {label} beenden: Die Shell wird beendet
sidebar.new_note_in = Neue Notiz in {name}
sidebar.empty_folder = Leer
sidebar.empty_folder_writes = Leer. + legt eine Notiz an
sidebar.signin_title = Server und Projekte
sidebar.signin_text = Melde dich an, um Terminals auf deinen Servern zu öffnen, Notizen in Projekten zu führen und mit deinem Team zu arbeiten. Dieser Computer bleibt, wie er ist.
sidebar.theme_dark = Zum dunklen Design wechseln
sidebar.theme_light = Zum hellen Design wechseln
# A server that opens with the person's own key, from their vault (0.1.17):
# the key's tip, after the server's name.
sidebar.with_key = Öffnet sich mit deinem Schlüssel aus deinem Tresor
# A server that opens through the person's Mac: a small label after its
# name, and its tip ({mac} is the Mac's name).
sidebar.via_mac = via Mac
sidebar.via_title = Öffnet sich von {mac} aus, solange der Mac eingeschaltet ist

# ------------------------------------------------------------ account_menu: the account at the bottom of the sidebar and its menu
# "Free" is the plan's name: it stays as it is.
account_menu.free_plan = Free-Tarif
account_menu.title = Einstellungen, Sprache, Konto, Abmelden
account_menu.title_local = Einstellungen, Sprache, Anmelden
account_menu.not_signed_in = Nicht angemeldet
account_menu.only_here = Nur dieser Computer
account_menu.offline = Offline, neuer Versuch
account_menu.local_note = tTerm arbeitet mit diesem Computer. Mit der Anmeldung kommen deine Server, Projekte und dein Team dazu.
account_menu.sign_out = Abmelden
# Only in tTerm for Mac, right under Settings: the servers and keys of this
# Mac to the account (0.1.17). The second line is small, under the first.
account_menu.move = Umzug in die Cloud
account_menu.move_note = Server und Schlüssel dieses Macs überall nutzen
# Only in a browser: the app for a Mac. "tTerm for Mac" is the app's name.
account_menu.download = tTerm für Mac herunterladen
account_menu.download_note = Terminals auf deinem Mac, auch offline
# The item after Settings, and the title of the list of languages.
language.item = Sprache

# ------------------------------------------------------------ settings (Settings.tsx)
# The page, and the item of the account's menu that opens it.
settings.title = Einstellungen
settings.appearance = Darstellung
settings.appearance_local = Auf diesem Computer gespeichert. „System“ folgt der Einstellung dieses Computers. Die Farbe eines Projekts füllt sein Code-Badge oder färbt das ganze Projekt in der Seitenleiste ein.
settings.appearance_account = In deinem Konto gespeichert. „System“ folgt der Einstellung des jeweiligen Computers, an dem du arbeitest. Die Farbe eines Projekts füllt sein Code-Badge oder färbt das ganze Projekt in der Seitenleiste ein.
settings.theme = Design
settings.theme_system = System
settings.theme_light = Hell
settings.theme_dark = Dunkel
settings.tints = Projektfarben
settings.tint_badge = Code-Badge
settings.tint_block = Ganzes Projekt

# ------------------------------------------------------------ devices (Devices.tsx)
devices.title = Geräte

# ------------------------------------------------------------ account (Account.tsx)
# The page, and the item of the account's menu that opens it.
account.title = Konto

# ------------------------------------------------------------ app: the page's frame, toasts and dialogs (App.tsx)
app.session_ended = Deine Sitzung ist abgelaufen. Melde dich erneut an: Deine Terminals sind weitergelaufen.
# How saving goes in the note in front, on the line of tabs.
app.saved = Gespeichert
app.saving = Wird gespeichert …
app.not_saved_offline = Nicht gespeichert: keine Verbindung
app.not_saved = Nicht gespeichert
app.no_connection = Keine Verbindung
app.not_answering_local = tTerm Web antwortet nicht. Läuft python -m tterm.dev in einem Terminalfenster?
app.not_answering = tTerm Web antwortet nicht. Prüf die Verbindung und versuch es dann noch einmal.
# {why} is the reason tTerm Web gave, as it gave it.
app.no_terminal = Das Terminal konnte nicht geöffnet werden: {why}
app.offline = {name} ist offline. Sobald sich der Agent verbindet, ist die Maschine wieder da.
# {seen} is time.last_seen: last seen 14 minutes ago.
app.offline_seen = {name} ist offline, {seen}. Sobald sich der Agent verbindet, ist die Maschine wieder da.
app.removed_shared = {name} wurde aus tTerm Web entfernt. Derselbe Server ist auch in einem anderen Projekt, deshalb bleibt der Zugriff von tTerm Web darauf bestehen.
app.removed_access = {name} wurde aus tTerm Web entfernt, und der Zugriff von tTerm Web auf den Server wurde entzogen.
app.removed = {name} wurde aus tTerm Web entfernt.
app.no_note = Die Notiz konnte nicht angelegt werden: {why}
app.note_deleted = Die Notiz {title} wurde aus {folder} gelöscht.
app.note_deleted_journal = Die Notiz {title} wurde aus {folder} gelöscht. Im Protokoll steht ein Eintrag dazu.
app.folder_deleted = Der Ordner {name} wurde gelöscht.
app.folder_deleted_journal = Der Ordner {name} wurde gelöscht. Im Protokoll steht ein Eintrag dazu.
app.folder_notes_deleted = one: Der Ordner {name} und seine Notiz wurden gelöscht. | other: Der Ordner {name} und seine {n} Notizen wurden gelöscht.
app.folder_notes_deleted_journal = one: Der Ordner {name} und seine Notiz wurden gelöscht. Im Protokoll steht ein Eintrag dazu. | other: Der Ordner {name} und seine {n} Notizen wurden gelöscht. Im Protokoll steht ein Eintrag dazu.
app.moved_to = In den Ordner {folder} verschoben.
app.no_move = Verschieben fehlgeschlagen: {why}
app.moved_here = Aus {project} hierher verschoben.
app.moved_here_journal = Aus {project} hierher verschoben. Im Protokoll von {project} steht ein Eintrag dazu.
app.moved_to_project = Nach {project} verschoben, in den Ordner {folder}.
app.moved_to_other = In das andere Projekt verschoben, in den Ordner {folder}.
app.copied_markdown = Als Markdown kopiert.
app.note_gone = Die Notiz wurde gelöscht.
app.no_copy = Kopieren fehlgeschlagen: {why}
app.no_copy_browser = Kopieren fehlgeschlagen: Der Browser hat es der Seite nicht erlaubt.
app.project_deleted = Das Projekt {name} wurde gelöscht.
app.project_deleted_notes = one: Das Projekt {name} und seine Notiz wurden gelöscht. | other: Das Projekt {name} und seine {n} Notizen wurden gelöscht.
# {label} is where it is now: P/web-01.
app.machine_moved = {name} ist jetzt in {project}, als {label}. Die Terminals laufen weiter.
app.no_rename = Umbenennen fehlgeschlagen: {why}
app.signed_out = Du hast dich abgemeldet. Deine Terminals laufen weiter.
app.no_sign_out = Abmelden fehlgeschlagen: tTerm Web hat nicht geantwortet. Versuch es noch einmal.
app.no_theme = Das Design konnte nicht gespeichert werden: tTerm Web hat nicht geantwortet.
app.no_language = Die Sprache konnte nicht gespeichert werden: tTerm Web hat nicht geantwortet.
app.no_tints = Die Projektfarben konnten nicht gespeichert werden: tTerm Web hat nicht geantwortet.
app.go_on_in_browser = Mach im Browser weiter: Melde dich dort an und lass diesen Computer zu.
app.open_sidebar = Seitenleiste öffnen
app.no_project = Projekt nicht gefunden
app.no_project_text = Es gehört nicht mehr zu deinen Projekten.
app.close_the_tab = Tab schließen
app.connection_lost = Verbindung verloren. Sie wird wiederhergestellt; deine Terminals laufen weiter.
app.cut_off.mac = <b>Keine Verbindung zu tTerm.</b> Dieser Mac funktioniert wie gewohnt. Terminals auf Servern laufen dort weiter und sind wieder hier, sobald die Verbindung steht.
app.cut_off.computer = <b>Keine Verbindung zu tTerm.</b> Dieser Computer funktioniert wie gewohnt. Terminals auf Servern laufen dort weiter und sind wieder hier, sobald die Verbindung steht.
app.paste_busy = In diesem Terminal läuft ein Befehl, deshalb ist seine Eingabezeile nicht frei. Versuch es noch einmal, wenn er fertig ist.
app.paste_gone = {machine} ist nicht mehr in tTerm Web. Öffne woanders ein Terminal und setz den Befehl von dort aus in seine Eingabezeile.
app.picker.placeholder = Maschine aus einem beliebigen Projekt
# Tabs: their labels and the tips under the mouse. {label} is a terminal's: P/web-01 · 2.
app.tab.note = Notiz
app.tab.note_in = Notiz in {folder}
app.tab.close_note = Notiz schließen. Sie bleibt in ihrem Ordner.
app.tab.project = Projekt
app.tab.project_title = {name}: Maschinen und Notizen
app.tab.close_page = Seite schließen
app.tab.terminal = Terminal
app.tab.away = {label}: {machine} ist im Ruhezustand oder offline; das Terminal wartet, bis die Maschine zurück ist
app.tab.away_unknown = {label}: Die Maschine ist im Ruhezustand oder offline; das Terminal wartet, bis sie zurück ist
app.tab.ended = {label}: beendet
app.tab.running = {label}: Ein Befehl läuft
app.tab.close_terminal = Tab schließen. Das Terminal läuft weiter, in der Seitenleiste unter seiner Maschine.
# A machine's state, small, after its name in lists.
app.machine.no_connection = keine Verbindung
app.machine.offline = offline
app.machine.offline_seen = offline, {seen}
app.machine.online = online
# Search and the palette (⌘K): what it finds on the page, the lines under each, and the details beside.
app.search.state_away = wartet auf seinen Computer
app.search.state_ended = beendet
app.search.state_busy = ein Befehl läuft
app.search.state_prompt = wartet auf Befehl
app.search.this_tab = dieser Tab
app.search.tab = Tab
app.search.no_tab = läuft, ohne Tab
app.search.row_machine = Maschine
app.search.row_folder = Verzeichnis
app.search.row_now = Jetzt
app.search.row_in = Ort
app.search.row_edited = Bearbeitet
app.search.row_project = Projekt
app.search.row_system = System
app.search.row_address = Adresse
app.search.row_status = Status
app.search.row_terminals = Terminals
app.search.row_code = Code
app.search.row_does = Details
app.search.open_count = one: {n} offen | other: {n} offen
# The button that does what was found.
app.search.open = Öffnen
app.search.open_note = Notiz öffnen
app.search.open_page = Seite öffnen
app.search.do_it = Ausführen
# Search words: keep the English words, add the language's own after them.
app.search.terminal_words = terminal konsole
app.search.note_words = note notiz notizen
app.search.project_words = project page folders projekt projektseite seite ordner
# Things to do, in the palette: each with what it does, small, and its search words.
app.action.add_machine = Maschine hinzufügen
app.action.add_machine_hint = Server oder Computer
app.action.new_project_hint = mit eigenen Maschinen und Notizen
app.action.edit_project = {name} bearbeiten
app.action.edit_project_hint = Name, Code und Farbe
app.action.new_folder_in = Neuer Ordner in {name}
app.action.new_folder_hint = für Notizen
app.action.close_tab = Diesen Tab schließen
app.action.close_tab_terminal = das Terminal läuft weiter
app.action.close_tab_note = die Notiz bleibt in ihrem Ordner
app.action.rename_terminal = Dieses Terminal benennen
app.action.rename_terminal_hint = statt seiner Nummer
app.action.end_terminal = Dieses Terminal beenden
app.action.end_terminal_hint = die Shell wird beendet
app.action.delete_note = Diese Notiz löschen
app.action.delete_note_hint = aus {folder}
app.action.theme_dark = Zum dunklen Design wechseln
app.action.theme_light = Zum hellen Design wechseln
app.action.settings_hint_local = Design, Projektfarben
app.action.settings_hint = Design, Projektfarben, Geräte
app.action.sign_in_hint = deine Server, Projekte und dein Team
app.action.account_hint = Name, Foto und Tarif
app.action.sign_out_hint = dieser Browser vergisst dich
# Search words: keep the English words, add the language's own after them.
app.action.add_machine_words = new server computer connect neuer neue neues rechner verbinden hinzufügen
app.action.new_project_words = project new create make projekt neues erstellen anlegen
app.action.edit_project_words = project rename edit code color colour projekt umbenennen bearbeiten ändern kurzcode farbe
app.action.new_folder_words = notes folder new create notizen ordner neuer erstellen anlegen
app.action.machines_words = machines home overview maschinen startseite übersicht
app.action.close_tab_words = tab close schließen
app.action.rename_terminal_words = terminal rename name label umbenennen benennen bezeichnung
app.action.end_terminal_words = terminal end stop kill exit shell beenden stoppen schließen
app.action.delete_note_words = note delete remove notiz löschen entfernen
app.action.theme_words = theme dark light colours colors design dunkel dunkles hell helles farben darstellung
app.action.pin_words = sidebar panel pin seitenleiste anheften fixieren
app.action.settings_words_local = settings preferences theme dark light colors colours support einstellungen optionen design dunkel hell farben hilfe
app.action.move_words = move cloud servers keys ssh vault migrate import umzug umziehen server schlüssel tresor migrieren importieren übertragen
app.action.settings_words = settings preferences theme dark light colors colours devices quick code forget browsers support einstellungen optionen design dunkel hell farben geräte schnellcode vergessen hilfe
app.action.sign_in_words = sign in log in login account cloud servers anmelden einloggen konto
app.action.account_words = account profile name photo picture avatar plan limits delete konto foto bild tarif grenzen löschen
app.action.sign_out_words = sign out log out logout leave switch account abmelden ausloggen verlassen wechseln konto
# A folder: made, or named again.
app.folder.new_title = Neuer Ordner in {name}
app.folder.rename_title = Ordner umbenennen
app.folder.create = Ordner erstellen
app.folder.new_help_alone = Nur du siehst ihn. Danach legt + neben dem Ordner die erste Notiz an.
app.folder.new_help = Alle in {name} sehen ihn und können darin Notizen schreiben. Danach legt + neben dem Ordner die erste Notiz an.
app.folder.rename_help_alone = Nur du siehst ihn.
app.folder.rename_help = Alle in {name} sehen den neuen Namen sofort. Die Notizen darin bleiben, wie sie sind.
# Asked before it is done.
app.remove.title = {name} entfernen?
app.remove.confirm = {name} entfernen
app.remove.text = Die Maschine verschwindet aus tTerm Web, und ihre Terminals werden beendet. Die dort eingegebenen Befehle bleiben im Verlauf.
app.remove.computer = Der Agent erfährt, dass der Computer entfernt wurde, und beendet sich. Um den Computer wieder zu verbinden: „Maschine hinzufügen“, dann „Computer“.
app.remove.server = tTerm Web meldet sich dort nicht mehr an und entfernt seinen Zugriff auf dem Server selbst. Antwortet der Server nicht, folgt als Nächstes der Befehl dafür.
app.end.title = {label} beenden?
app.end.confirm = Terminal beenden
app.end.text = Die Shell wird beendet, und alles, was darin läuft, stoppt, wie beim Schließen eines Terminalfensters. Was darin ausgeführt wurde, bleibt im Tab und im Verlauf.
app.delete_note.title = Notiz {title} löschen?
app.delete_note.sub = Im Ordner {folder}.
app.delete_note.confirm = Notiz löschen
app.delete_note.alone = Sie ist dann endgültig weg.
app.delete_note.shared = Alle in {project} verlieren sie, auch wer sie gerade geöffnet hat. Das Protokoll hält fest, wer sie wann gelöscht hat.
app.delete_folder.title = Ordner {name} löschen?
app.delete_folder.confirm = Ordner löschen
app.delete_folder.confirm_notes = one: Ordner und {n} Notiz löschen | other: Ordner und {n} Notizen löschen
app.delete_folder.empty = Der Ordner ist leer.
# {names} is the notes' titles, listed: Plan, Ideas and 3 more.
app.delete_folder.notes_go = one: Seine Notiz wird mitgelöscht: {names}. | other: Seine {n} Notizen werden mitgelöscht: {names}.
app.delete_folder.shared = Alle in {project} verlieren sie, auch wer gerade eine davon geöffnet hat. Das Protokoll hält fest, wer den Ordner wann gelöscht hat.
app.delete_folder.keep = Um eine Notiz zu behalten, verschieb sie vorher: ⋯ neben der Notiz, dann einen anderen Ordner wählen.

# ------------------------------------------------------------ api: what the page says when tTerm Web gives no reason (api.ts)
api.note_changed = Die Notiz wurde inzwischen anderswo geändert.
api.sign_in = Melde dich an, um fortzufahren.
# {status} is the HTTP status: 502.
api.answered = tTerm Web hat mit {status} geantwortet
api.confirm_first = Bestätige zuerst, dass du es bist.
api.account_changed = Inzwischen ist ein anderes Konto angemeldet.

# ------------------------------------------------------------ app_link: the apps for computers, as the site names them (appLink.ts)
app_link.mac = tTerm für Mac
app_link.windows = tTerm für Windows
app_link.linux = tTerm für Linux

# ------------------------------------------------------------ add_machine: the window that adds a server or a computer to a project (AddMachine.tsx)
# When the browser does not let the page copy the command.
add_machine.copy_failed = Kopieren fehlgeschlagen: Markier den Befehl und kopier ihn von Hand.
# How long the command works, inside add_machine.hint_computer and add_machine.hint_server as {works}.
add_machine.works_once = one: Einmal verwendbar, noch {n} Minute gültig. | other: Einmal verwendbar, noch {n} Minuten gültig.
add_machine.title = Maschine hinzufügen
# Before the list of the projects the machine can go to.
add_machine.to_project = In Projekt
# The two buttons Server and Computer, for screen readers.
add_machine.kind = Art der Maschine
add_machine.server = Server
add_machine.computer = Computer
# Step 1 for a computer, above the command.
add_machine.run_computer = Führ das auf dem Computer aus
# Under the command. {works} is add_machine.works_once; sudo stays as it is.
add_machine.hint_computer = In einem Terminal auf dem Computer selbst, unter deinem eigenen Benutzer, nicht mit sudo. {works} Danach aktualisiert sich der Agent selbst. Führst du später einen neuen Befehl aus, wird der Agent neu installiert: Der Computer bleibt, wie er ist, seine offenen Terminals werden beendet.
# A fold under the command, for trying an agent that is not released yet.
add_machine.by_hand = Oder den Agenten von Hand starten
# {version} is the agent's version: 0.11.0. tterm-agent, Python and websockets are names: they stay as they are.
add_machine.by_hand_hint = Aus einer Kopie von tterm-agent {version} oder neuer, mit einem Python, in dem das Paket websockets installiert ist. Zum Ausprobieren eines Agenten, der noch nicht veröffentlicht ist: Er läuft, solange sein Terminalfenster offen ist, und das Token wird zum Schlüssel des Computers.
# Step 2, while the window waits for the machine.
add_machine.keep_open = Lass dieses Fenster offen
# A fold: what the command for a computer does, point by point.
add_machine.what_command = Was der Befehl macht
# {folder} is ~/.tterm-web, {bot_folder} ~/.tterm; launchd and systemd are names: they stay as they are.
add_machine.what_command_puts = Legt den Agenten von tTerm in {folder} ab, eine Datei für dieses System aus den Releases von tTerm, vor dem Start mit der Prüfsumme im Skript des Befehls abgeglichen, und startet ihn jedes Mal, wenn du dich anmeldest (launchd unter macOS, systemd unter Linux). Der Agent des tTerm-Bots in {bot_folder} bleibt, falls vorhanden, wie er ist.
add_machine.what_command_updates = Der Agent aktualisiert sich selbst, nur auf Versionen, die der Release-Build von tTerm signiert hat, und nur, solange auf diesem Computer kein Terminal offen ist.
add_machine.what_command_key = Erzeugt für diesen Computer einen eigenen Schlüssel und bewahrt ihn dort auf, nur für dich lesbar. Das Token im Befehl dient nur dem Beitritt, ein einziges Mal.
# root is the name of the system's administrator: it stays as it is.
add_machine.what_command_runs = Der Agent läuft unter deinem Benutzer, nie als root, und öffnet keine Ports: Er baut selbst die Verbindung nach außen zu tTerm Web auf und hält diese eine Verbindung. Jedes Terminal hier ist dort eine Shell unter deinem Benutzer.
# {command} is ~/.tterm-web/uninstall.sh.
add_machine.what_command_uninstall = {command} entfernt alles wieder.
# Step 1 for a server, above the command.
add_machine.run_server = Führ das auf dem Server aus
# Under the command. {works} is add_machine.works_once; root and sudo stay as they are.
add_machine.hint_server = {works} Führ ihn als root oder als beliebiger Benutzer mit sudo aus.
# A fold: what the script for a server does, point by point.
add_machine.what_script = Was das Skript macht
# Here and in the next two, tterm in small letters is the name of the user the script makes on the server: it stays as it is, as sudo and sshd_config do.
add_machine.what_script_user = Legt den Benutzer tterm an, ohne Passwort. Hat der tTerm-Bot ihn schon angelegt, wird er weiterverwendet.
add_machine.what_script_certificates = Erlaubt tTerm Web, sich als tterm anzumelden, mit Zertifikaten, die zwei Minuten gelten und nur für diesen Server ausgestellt werden. Auf dem Server bleiben keine Schlüssel.
add_machine.what_script_sudo = Gibt tterm sudo-Rechte, damit du den Server verwalten kannst. Ein Befehl nimmt sie wieder zurück.
add_machine.what_script_safe = Rührt sshd_config nie an und öffnet keine Ports. Mehrfaches Ausführen ist unbedenklich.
# {name} is the machine's name.
add_machine.connected = {name} ist verbunden
# After the machine's system and host: Ubuntu 24.04 · web-01 · in tabs it reads P/web-01.
add_machine.tabs_label = in Tabs: {label}
add_machine.open_terminal = Terminal öffnen
add_machine.add_another = Weitere Maschine hinzufügen
# {why} is what went wrong, as tTerm Web said it.
add_machine.no_command = Der Befehl konnte nicht erstellt werden: {why}
add_machine.expired_token = Dieses Token ist abgelaufen: Es ist nur 10 Minuten gültig.
add_machine.expired_command = Dieser Befehl ist abgelaufen: Er ist nur 10 Minuten gültig.
add_machine.new_command = Neuen Befehl anfordern
add_machine.failed_computer = Der Computer konnte nicht hinzugefügt werden.
add_machine.failed_server = Der Server konnte nicht geprüft werden.
add_machine.still_works = Derselbe Befehl funktioniert noch: Behebe das Problem und führ ihn erneut aus.
# While the window waits: the agent or the server has called in, or not yet.
add_machine.agent_in = Der Agent hat sich gemeldet. Details des Computers werden gelesen …
add_machine.server_in = Der Server hat sich gemeldet. tTerm meldet sich zur Prüfung an …
add_machine.waiting_agent = Warten auf den Agenten …
add_machine.waiting_server = Warten auf den Server …
# {project} is the project's name; the _unnamed ones are for when it is not known.
add_machine.appears_computer = Er erscheint in {project} ein paar Sekunden, nachdem der Befehl fertig ist.
add_machine.appears_computer_unnamed = Er erscheint im Projekt ein paar Sekunden, nachdem der Befehl fertig ist.
add_machine.appears_server = Er erscheint in {project}, sobald das Skript fertig ist, meist innerhalb einer Minute.
add_machine.appears_server_unnamed = Er erscheint im Projekt, sobald das Skript fertig ist, meist innerhalb einer Minute.

# ------------------------------------------------------------ signin: signing in with a code from email, and the quick code (SignIn.tsx)
# When the server does not answer at all.
signin.no_answer = Der Server antwortet nicht. Prüf die Verbindung und versuch es noch einmal.
signin.email_lead = Gib deine E-Mail-Adresse ein, dann schicken wir dir einen Code
# The field for the address, for screen readers.
signin.email = E-Mail-Adresse
# The button, while the code is being sent.
signin.sending = Wird gesendet …
signin.get_code = Code anfordern
signin.new_here = Neu hier? Das Konto erstellst du nach dem Code.
signin.code_resent = Ein neuer Code ist unterwegs. Der vorherige gilt nicht mehr.
signin.code_title = Code eingeben
# {email} is the address the code went to.
signin.code_sent = Wir haben ihn an <b>{email}</b> geschickt
# The field for the code, for screen readers.
signin.code_label = Code aus der E-Mail
# A link that counts the seconds down until another code may be sent: New code in 42 s.
signin.resend_in = one: Neuer Code in {n} s | other: Neuer Code in {n} s
signin.resend = Neuen Code senden
signin.change_email = E-Mail ändern
signin.no_email = Keine E-Mail? Schau im Spam-Ordner nach.
signin.signup_title = Erstelle dein Konto
# The field for one's name, and the words in it while it is empty.
signin.your_name = Dein Name
# The one tick of signing up. <terms> and <privacy> are links to the site's two documents: their names as the site has them in the language.
signin.agree = Ich stimme den <terms>Nutzungsbedingungen</terms> und der <privacy>Datenschutzerklärung</privacy> zu
# The button, while the account is being made.
signin.creating = Wird erstellt …
signin.create = Konto erstellen
signin.another_email = Andere E-Mail verwenden
# A quick code is four digits that sign one in on this device.
signin.pin_easy = Zu leicht zu erraten: Wähl Ziffern, die nicht alle gleich sind und nicht aufeinanderfolgen.
signin.pin_mismatch = Die Codes stimmen nicht überein. Erstelle den Code noch einmal.
# {name} is the person's first name: Welcome for an account made just now, Hello for one there before.
signin.welcome = Willkommen, {name}!
signin.hello = Hallo, {name}!
# The quick code, typed a second time.
signin.pin_repeat = Code wiederholen
signin.pin_repeat_lead = Gib dieselben vier Ziffern noch einmal ein
signin.pin_offer_lead = Erstelle einen Schnellcode für dieses Gerät
# The field for the quick code, for screen readers: the second time, the first time.
signin.pin_repeat_label = Schnellcode, noch einmal
signin.pin_offer_label = Schnellcode
# The link that goes on without a quick code.
signin.not_now = Nicht jetzt
# {name} is the person's first name.
signin.welcome_back = Willkommen zurück, {name}!
signin.pin_lead = Gib deinen Schnellcode ein
# The field for the quick code, for screen readers.
signin.pin_label = Schnellcode
signin.forgot = Code vergessen?
signin.switch = Konto wechseln

# ------------------------------------------------------------ connect: in the browser, allowing tTerm for the computer to sign in (Connect.tsx)
connect.no_answer = tTerm antwortet nicht. Prüf die Verbindung und lade diese Seite dann neu.
# {app} is app_link.*: tTerm for Mac. Also the page's title in the browser.
connect.allow_title = {app} zulassen?
# The address the app opened is cut short.
connect.incomplete = Dieser Link ist unvollständig
# Sign in with your browser is the app's button: the words of app_signin.browser.
connect.start_again = Fang in tTerm auf deinem Computer noch einmal an: „Mit dem Browser anmelden“.
# Above signing in, after Allow. {app} is app_link.*: tTerm for Mac.
connect.confirm = Bestätige, dass du es bist, um {app} zuzulassen.
connect.signin_other = Melde dich mit dem anderen Konto an und lass dann {app} zu.
connect.signin_then = Melde dich an und lass dann {app} zu.
connect.no_connection = Keine Verbindung
# {computer} is the name of the computer the app runs on, {email} the account's address.
connect.asks = Die App auf <b>{computer}</b> möchte sich bei deinem Konto {email} anmelden.
# Above the code that both this page and the app show.
connect.check = Prüf, ob die App denselben Code zeigt
# The button.
connect.allow = Zulassen
connect.another = Nicht du? Anderes Konto verwenden
# Personal is the name of one's own project: it stays as it is. Settings and Devices are the page and its section, in the words of settings.title and devices.title.
connect.small = Der Computer wird zu einer Maschine in Personal. Die App erscheint in den Einstellungen unter „Geräte“, wo du sie vergessen kannst.
# While the browser goes back to the app. {app} is app_link.*: tTerm for Mac.
connect.back = Zurück zu {app} …
connect.takes_over = Ab hier übernimmt die App auf diesem Computer.

# ------------------------------------------------------------ app_signin: in tTerm for the computer, signing in with the browser (AppSignIn.tsx)
# The app's first screen, for screen readers.
app_signin.welcome_label = Willkommen
app_signin.welcome_title = Willkommen bei tTerm
app_signin.welcome_lead = Die Terminals dieses Computers funktionieren sofort, ganz ohne Konto.
# The button: the app opens the browser, to sign in there.
app_signin.browser = Mit dem Browser anmelden
# The button: not now, sign in later.
app_signin.later = Später
app_signin.welcome_note = Mit der Anmeldung kommen deine Server, Projekte, Notizen und dein Team in dieses Fenster. Das geht jederzeit, unten in der Seitenleiste.
app_signin.cancelled = Die Anmeldung wurde im Browser abgebrochen.
# The title of the window that waits while one signs in in the browser.
app_signin.link_title = Mit dem Browser anmelden
# {host} is app.tterm.net. The code comes under it.
app_signin.link_note = tTerm hat {host} in deinem Browser geöffnet. Melde dich dort an und lass diesen Computer zu, wenn die Seite danach fragt. Die Seite zeigt auch diesen Code:
app_signin.until_then = Bis dahin funktioniert dieser Computer wie bisher.
app_signin.open_again = Seite erneut öffnen

# ------------------------------------------------------------ welcome: the first screen, while nothing is connected yet (Welcome.tsx)
# {name} is the person's first name.
welcome.title = Willkommen bei tTerm, {name}
welcome.lead = Ein Terminal für deine Server und Computer, direkt im Browser. Auf diesem Computer musst du nichts installieren, keine Schlüssel kopieren und keine Ports öffnen.
welcome.connect = Verbinde deine erste Maschine
# The two cards: the kinds of machine to connect.
welcome.server = Server
welcome.server_note = Ein VPS oder Cloud-Server, den du per SSH erreichst. Führ darauf einen Befehl aus, und er erscheint hier.
# Small labels under the cards: Linux, One command; macOS, Linux, No open ports.
welcome.one_command = Ein Befehl
welcome.computer = Computer
welcome.computer_note = Ein Mac oder eine Linux-Maschine zu Hause oder im Büro, auch hinter NAT. Ein kleiner Agent hält die Verbindung.
welcome.no_ports = Keine offenen Ports
# The three steps below, for screen readers.
welcome.how = So funktioniert es
welcome.step_add = Maschine hinzufügen
welcome.step_add_text = Führ darauf einen Befehl aus. Er ist einmal verwendbar und 10 Minuten gültig.
welcome.step_open = Terminal öffnen
welcome.step_open_text = Jeder Befehl wird zu einem Block: kopieren, erneut ausführen, Link teilen.
welcome.step_team = Team dazuholen
welcome.step_team_text = Rollen, ein gemeinsames Protokoll, und du siehst immer, wer zuschaut.
# {project} is the project's name and {code} its code: P. In {code}/name, name stands for a machine's name, as in P/web-01.
welcome.footnote = Dein erstes Projekt, {project}, ist bereit, mit dem Code {code}: Seine Maschinen erscheinen in Tabs als {code}/Name.

# ------------------------------------------------------------ need_account: New project and Add machine in the app before signing in (NeedAccount.tsx)
need_account.machine_title = Maschine hinzufügen
need_account.machine_note = Server und weitere Computer gibt es mit einem tTerm-Konto. Bei der Anmeldung wird eins erstellt, falls du noch keins hast.
need_account.server = Server
need_account.server_text = Ein VPS oder Cloud-Server, den du per SSH erreichst. Führ darauf einen Befehl aus, und er erscheint hier.
need_account.computer = Computer
need_account.computer_text = Ein Mac oder eine Linux-Maschine zu Hause oder im Büro, auch hinter NAT.
# What the Free plan gives. {machines} is need_account.plan_machines, {terminals} need_account.plan_terminals.
need_account.machine_plan = Bis zu {machines} und {terminals}.
# In need_account.machine_plan, after "Up to": in the form the words take there.
need_account.plan_machines = one: {n} Maschine | other: {n} Maschinen
need_account.plan_terminals = one: {n} offenes Terminal | other: {n} offene Terminals
need_account.machine_stays = Dieser Computer bleibt, wie er ist, mit seinen Terminals.
need_account.project_title = Neues Projekt
need_account.project_note = Weitere Projekte gibt es mit einem tTerm-Konto. Bei der Anmeldung wird eins erstellt, falls du noch keins hast.
need_account.personal = Persönliche Projekte
need_account.personal_text = Nur du. Maschinen, Terminals und Notizen gehören dir allein.
need_account.shared = Gemeinsame Projekte
# A small label on Shared projects: they are not there yet.
need_account.soon = Bald
need_account.shared_text = Mit deinem Team. Du lädst Leute ein: Sie öffnen Terminals auf den Maschinen und bearbeiten die Notizen.
need_account.project_plan = Eigene Projekte, jedes mit seinen Maschinen, Terminals und Notizen. Gemeinsame Projekte mit einem Team folgen bald.
# Personal is the name of one's own project: it stays as it is.
need_account.project_stays = Personal bleibt, wie es ist, mit diesem Computer, seinen Terminals und Notizen.
# The button that closes the window.
need_account.not_now = Nicht jetzt

# ------------------------------------------------------------ updates: tTerm for Mac updating itself, only in the app (Updates.tsx)
# The title of Restart to update in the top bar. {version} is the new version: 0.5.1.
updates.pill_title.mac = tTerm {version} ist bereit. Der Neustart dauert ein paar Sekunden; laufen auf diesem Mac Terminals, fragt tTerm vorher.
updates.pill_title.computer = tTerm {version} ist bereit. Der Neustart dauert ein paar Sekunden; laufen auf diesem Computer Terminals, fragt tTerm vorher.
updates.restarting = Wird neu gestartet …
# A button, in the top bar and in Settings: tTerm restarts and the new version goes in.
updates.restart_to_update = Update installieren
# The card above the account in the sidebar, and Settings. {version} is the new version.
updates.ready = tTerm {version} ist bereit
updates.restart_takes = Der Neustart dauert ein paar Sekunden.
# The card's button.
updates.restart = Neu starten
# A link to the notes of the new version.
updates.whats_new = Neuigkeiten
# Once, after the restart. {version} is the version now: 0.5.1.
updates.updated = tTerm wurde auf {version} aktualisiert
# Settings, Updates: the two ways tTerm takes a new version.
updates.auto = Automatisch aktualisieren
updates.auto_text.mac = Eine neue Version wird beim Beenden von tTerm installiert und, wenn tTerm mit geschlossenem Fenster in der Menüleiste sitzt, sobald auf diesem Mac nichts läuft.
updates.auto_text.computer = Eine neue Version wird beim Beenden von tTerm installiert und, wenn tTerm mit geschlossenem Fenster in der Menüleiste sitzt, sobald auf diesem Computer nichts läuft.
updates.ask = Vorher fragen
# "Restart to update" is the button (updates.restart_to_update): the same words.
updates.ask_text = Eine neue Version wartet, bis du auf „Update installieren“ drückst.
# The section of Settings.
updates.title = Updates
updates.about = tTerm für Mac aktualisiert sich selbst aus den Releases von tTerm. Installiert wird nur eine Version, die tTerm signiert hat.
# For screen readers: the two ways above.
updates.how = Wie sich tTerm aktualisiert
# Beside Update by itself.
updates.recommended = Empfohlen
updates.checking = Suche nach einer neuen Version …
# {version} is the new version.
updates.downloading = tTerm {version} wird heruntergeladen …
# {version} is the version this app is; {day} is today, yesterday or on 12 Oct (time.today, time.yesterday, time.on_day); {time} is 10:02.
updates.you_have_downloaded = Du nutzt {version}. Heruntergeladen {day} um {time}.
updates.you_have = Du nutzt {version}.
# {version} is the new version; why it failed comes under it, as tTerm says it.
updates.failed = Update auf {version} fehlgeschlagen
# {site} is tterm.net. Applications is the folder of the Mac: as macOS names it in the language.
updates.download = Oder lade tTerm von <link>{site}</link> herunter und zieh es in den Ordner „Programme“.
# A button: tTerm moves itself from the disk image to Applications.
updates.move = In „Programme“ verschieben
# {ago} is when tTerm last looked: just now, 5 min ago, 2 h ago, yesterday, on 12 Oct (time.*).
updates.looked = tTerm {version} ist aktuell. Zuletzt geprüft {ago}.
updates.this_is = Dies ist tTerm {version}.
# A button: look for a new version now.
updates.check_now = Jetzt prüfen

# ------------------------------------------------------------ account: the name, the photo and the plan (Account.tsx)
# The file chosen for one's photo is none.
account.not_a_photo = Diese Datei nimmt tTerm nicht als Foto an. Wähl ein JPEG, PNG oder WebP bis 5 MB.
# What the plan allows, after "Up to" (account.up_to): Up to 50 machines and 24 open terminals.
account.limit_machines = one: {n} Maschine | other: {n} Maschinen
account.limit_terminals = one: {n} offenes Terminal | other: {n} offene Terminals
# {limits} is one or both of the two above, as a list.
account.up_to = Bis zu {limits}
account.no_limits = Keine Limits
# A meter of the plan, beside its label (Machines, Open terminals): 3 of 50.
account.used_of = {used} von {limit}
account.used_no_limit = {used}, ohne Limit
# The title of Close at the top of Account and Settings.
account.close_title = Zurück dorthin, wo du warst
account.photo_removed = Foto entfernt: Deine Initialen sind wieder da.
# For screen readers: the card with one's name and photo.
account.profile = Profil
account.change_photo = Foto ändern
account.add_photo = Foto hinzufügen
account.your_name = Dein Name
account.saving = Wird gespeichert …
account.edit_name = Namen bearbeiten
account.remove_photo = Foto entfernen
# Under the photo's buttons: what the photo is for.
account.photo_hint = Es erscheint neben deinem Namen anstelle deiner Initialen.
# For screen readers: the file chooser for the photo.
account.choose_photo = Foto auswählen
# Under one's email address. {email} is support's address.
account.address_note = Mit dieser Adresse meldest du dich an. Um sie zu ändern, schreib an <link>{email}</link>.
# The section of the plan; its name (Free) stays as it is.
account.plan = Tarif
account.plan_note = tTerm ist kostenlos, solange wir es bauen. Weitere Tarife erscheinen hier, und du erfährst davon, bevor sich etwas ändert.
# The labels of the plan's two meters.
account.machines = Maschinen
account.open_terminals = Offene Terminals
account.photo_saved = Dein Foto ist da: unten in der Seitenleiste und im Kontomenü.
# {email} is support's address.
account.delete_note = Um dein Konto zu löschen, schreib von der Adresse, mit der du dich anmeldest, an {email}.

# ------------------------------------------------------------ devices: where one is signed in, in Settings (Devices.tsx)
# On the sign-in screen, after this very device was forgotten.
devices.this_forgotten = Dieses Gerät wurde vergessen. Melde dich mit einem Code per E-Mail an.
# {device} is a device's label: tTerm for Mac on MacBook-Pro. tTerm there now works with that computer only, as before signing in.
devices.app_signed_out = {device} wurde abgemeldet: Dort arbeitet tTerm jetzt nur noch mit dem Computer selbst.
# {device} is a device's label: Chrome on macOS.
devices.forgotten = {device} wurde vergessen: Dort braucht es wieder einen Code per E-Mail.
# On the sign-in screen.
devices.all_forgotten = Alle Geräte wurden vergessen. Jedes meldet sich jetzt mit einem Code per E-Mail an.
devices.about = Browser, in denen du dich mit deinem Schnellcode anmeldest, und tTerm auf deinen Computern, angemeldet über den Browser. Überall sonst braucht es einen Code per E-Mail.
devices.idle = Nach 8 Stunden ohne Aktivität fragt tTerm erneut nach dem Schnellcode. Deine Terminals laufen weiter.
devices.none = Noch kein Browser gemerkt. Jede Anmeldung braucht einen Code per E-Mail.
# A mark beside the device one uses now.
devices.this_device = Dieses Gerät
# Under a device's label. {created} and {used} are how long ago: just now, 3 minutes ago, 2 days ago (time.ago_*).
devices.app_times = Angemeldet {created}, zuletzt genutzt {used}
devices.browser_times = Gemerkt {created}, letzte Anmeldung {used}
# A button beside each device.
devices.forget = Vergessen
# The heading, and the red button that does it.
devices.forget_all = Alle Geräte vergessen
devices.forget_all_text = Alle Geräte werden vergessen und alle Sitzungen beendet, auch diese. Jeder Browser fragt danach nach einem Code per E-Mail. Deine Terminals laufen weiter.
# The button that asks first.
devices.forget_all_ask = Alle Geräte vergessen …

# ------------------------------------------------------------ this_computer: the computer the app runs on, in Settings (ThisComputer.tsx)
# How the link to tTerm Web is, under the switch. {name} is the name tTerm Web knows this computer by.
this_computer.online_terminals = one: Online in tTerm Web als {name} · {n} Terminal von dort geöffnet | other: Online in tTerm Web als {name} · {n} Terminals von dort geöffnet
this_computer.online = Online in tTerm Web als {name}
this_computer.connecting = Verbindung zu tTerm Web wird hergestellt …
this_computer.waiting = Noch nicht mit tTerm Web verbunden.
this_computer.no_network = Kein Netzwerk. tTerm versucht es von selbst erneut.
# "Turn this on": the switch above.
this_computer.removed.mac = Dieser Mac wurde aus tTerm Web entfernt, deshalb ist er nicht für tTerm Web geöffnet. Schalte die Option oben ein, um ihn wieder hinzuzufügen.
this_computer.removed.computer = Dieser Computer wurde aus tTerm Web entfernt, deshalb ist er nicht für tTerm Web geöffnet. Schalte die Option oben ein, um ihn wieder hinzuzufügen.
this_computer.closed.mac = Dieser Mac ist gerade nicht für tTerm Web geöffnet.
this_computer.closed.computer = Dieser Computer ist gerade nicht für tTerm Web geöffnet.
# The section's title, on a Mac too.
this_computer.title = Dieser Computer
# {name} is this computer's machine in tTerm, {project} its project.
this_computer.about = {name}, in {project}. Die Terminals laufen hier, auch ohne Internet.
# The switch.
this_computer.open = Für tTerm Web und dein Handy öffnen
this_computer.open_text.mac = tTerm Web und dein Handy öffnen Terminals auf diesem Mac, solange tTerm hier läuft: Mit geschlossenem Fenster bleibt es in der Menüleiste, und es startet, wenn du dich anmeldest. Aus: Dort ist dieser Mac offline, hier funktioniert alles wie bisher.
this_computer.open_text.computer = tTerm Web und dein Handy öffnen Terminals auf diesem Computer, solange tTerm hier läuft: Mit geschlossenem Fenster bleibt es in der Menüleiste, und es startet, wenn du dich anmeldest. Aus: Dort ist dieser Computer offline, hier funktioniert alles wie bisher.
# Asked before the switch goes off while terminals opened from tTerm Web run here.
this_computer.ask_title.mac = Diesen Mac für tTerm Web schließen?
this_computer.ask_title.computer = Diesen Computer für tTerm Web schließen?
# The red button.
this_computer.turn_off = Ausschalten
this_computer.ask_text.mac = one: {n} Terminal, das von tTerm Web aus auf diesem Mac geöffnet wurde, wird beendet, und in tTerm Web ist dieser Mac dann offline. | other: {n} Terminals, die von tTerm Web aus auf diesem Mac geöffnet wurden, werden beendet, und in tTerm Web ist dieser Mac dann offline.
this_computer.ask_text.computer = one: {n} Terminal, das von tTerm Web aus auf diesem Computer geöffnet wurde, wird beendet, und in tTerm Web ist dieser Computer dann offline. | other: {n} Terminals, die von tTerm Web aus auf diesem Computer geöffnet wurden, werden beendet, und in tTerm Web ist dieser Computer dann offline.

# ------------------------------------------------------------ photo: one's photo, cut to a circle (PhotoDialog.tsx)
# The photo could not be made here, in the browser.
photo.browser_failed = Der Browser konnte das Foto nicht erstellen.
photo.no_answer = tTerm hat nicht geantwortet. Versuch es noch einmal.
# The dialog's title.
photo.title = Dein Foto
# For screen readers: the photo in its frame, which the arrow keys move and + and - zoom.
photo.frame = Dein Foto in einem Kreis. Zieh es oder verschieb es mit den Pfeiltasten; + und - zoomen.
# The slider that makes the photo bigger in the circle.
photo.zoom = Zoom
photo.drag = Zieh das Foto, um es im Kreis zu platzieren.
# Beside the photo in three small sizes.
photo.preview = So sehen es andere
photo.note = JPEG, PNG oder WebP bis 5 MB. tTerm speichert eine Kopie mit 256 × 256 Pixeln, ohne die Angaben, die das Foto über sich selbst enthält, etwa wo es aufgenommen wurde.
photo.saving = Wird gespeichert …
photo.save = Foto speichern

# ------------------------------------------------------------ confirm: asking before what cannot be undone (Confirm.tsx)
confirm.no_answer = tTerm Web hat nicht geantwortet.
confirm.copy_failed = Kopieren fehlgeschlagen: Markier den Befehl und kopier ihn von Hand.
# After a server is removed. {name} is the server's name.
confirm.removed = {name} wurde entfernt
# The command that takes the access back comes after it.
confirm.removed_text = tTerm Web führt ihn nicht mehr auf und meldet sich dort nicht mehr an. Der Server hat nicht geantwortet, deshalb bleibt der Zugriff von tTerm Web darauf bestehen, bis du ihn dort entziehst:
# {user} is the server's user tterm; {command} is the command that removes it and its sudo rule.
confirm.user_stays = Der Benutzer {user} und seine sudo-Regel bleiben bestehen, für den tTerm-Bot, falls du ihn nutzt. Um auch sie zu entfernen: {command}

# ------------------------------------------------------------ project_dialog: the windows of projects of one's own (ProjectDialog.tsx)
project_dialog.code_invalid = Der Code besteht aus 1 bis 4 Buchstaben oder Ziffern.
# When saving or moving failed and tTerm Web gave no reason.
project_dialog.no_answer = tTerm Web hat nicht geantwortet.
project_dialog.edit_title = Projekt bearbeiten
project_dialog.new_title = Neues Projekt
# Under the title, editing a project others are in: its name, code and color.
project_dialog.edit_sub = Ändern können das nur Eigentümer und Admins.
project_dialog.new_sub = Ein Projekt hat eigene Maschinen und Notizen, getrennt von deinen anderen Projekten.
# The label of the project's name.
project_dialog.name = Name
# In the empty name field: an example of a project's name.
project_dialog.name_example = z. B. Kunde X
# The label of the project's code: the 1 to 4 letters or digits on its badge.
project_dialog.code = Kurzcode
project_dialog.code_help_alone = 1 bis 4 Buchstaben oder Ziffern. Der Code kennzeichnet das Projekt in Tabs und in der Seitenleiste.
project_dialog.code_help_shared = 1 bis 4 Buchstaben oder Ziffern. Der Code kennzeichnet das Projekt in Tabs und in der Seitenleiste, für alle darin gleichzeitig.
project_dialog.code_help_new = Der Code wird aus dem Namen gebildet, und du kannst ihn ändern: 1 bis 4 Buchstaben oder Ziffern. Er kennzeichnet das Projekt in Tabs und in der Seitenleiste.
# The label of the project's colors.
project_dialog.color = Farbe
# "Whole project" and "Settings" are named as the choice and the page are (settings.tint_block, settings.title).
project_dialog.color_help_new = Die Farbe wird so gewählt, dass sie sich von deinen anderen Projekten abhebt, und du kannst sie ändern. Sie füllt das Code-Badge und, wenn du in den Einstellungen „Ganzes Projekt“ wählst, das ganze Projekt in der Seitenleiste.
project_dialog.color_help_alone = Die Farbe füllt das Code-Badge und, wenn du in den Einstellungen „Ganzes Projekt“ wählst, das ganze Projekt in der Seitenleiste.
project_dialog.color_help_shared = Die Farbe füllt das Code-Badge für alle im Projekt und das ganze Projekt in der Seitenleiste für alle, die in ihren Einstellungen „Ganzes Projekt“ wählen.
# Above how the project will look in the sidebar and on a tab (a noun).
project_dialog.preview = Vorschau
# In the preview, in place of the project's name while none is typed.
project_dialog.preview_name = Projekt
project_dialog.new_next = Es gehört dir. Als Nächstes fügst du eine Maschine hinzu oder verschiebst eine aus einem anderen Projekt hierher und schreibst Notizen.
project_dialog.create = Projekt erstellen
# The title of the window that moves a machine to another project: {machine} is its name.
project_dialog.move_title = {machine} verschieben
project_dialog.move_sub = In ein anderes Projekt, das dir gehört.
# Next to each project one may move to: whether others are in it.
project_dialog.only_you = nur du
project_dialog.with_others = mit anderen
# {project} is the project it goes to, {code} that project's code, {name} the machine's name there: CX/web-01.
project_dialog.move_becomes = In {project} wird daraus {code}/{name}. Die Terminals laufen weiter, und auf der Maschine selbst ändert sich nichts.
# The same, when its name is taken there: {machine} is its name now, {name} the one it gets (web-01-2).
project_dialog.move_becomes_taken = In {project} wird daraus {code}/{name}: Der Name {machine} ist dort schon vergeben. Die Terminals laufen weiter, und auf der Maschine selbst ändert sich nichts.
# The button: {project} is the project's name.
project_dialog.move_to = Nach {project} verschieben
# The button while there is nothing to pick (a verb).
project_dialog.move = Verschieben
# Next to a folder one may move a note to: it has no notes.
project_dialog.folder_empty = leer
# Next to a project without folders: the note goes to a new folder there, named as its own.
project_dialog.folder_new = ein neuer Ordner, der dort dafür angelegt wird
# The title of the window that moves a note to another project: {note} is its title.
project_dialog.move_note_title = {note} verschieben
project_dialog.move_note_sub = Jetzt in {project}, Ordner {folder}. Wähl einen Ordner in einem anderen Projekt.
# Who sees the note in the project it goes to.
project_dialog.note_alone = In {project} siehst nur du sie.
project_dialog.note_shared = Alle in {project} sehen und bearbeiten sie.
# {project} is the project the note leaves.
project_dialog.note_leaves = Alle anderen in {project} verlieren sie. Das Protokoll von {project} hält fest, wer sie wann verschoben hat.
# The ticks: the items of a checklist ticked off, each with who ticked it.
project_dialog.note_keeps = Titel, Text und Verlauf ziehen mit um, ebenso die Häkchen samt der Angabe, wer sie gesetzt hat.
# The button: {folder} is the name of the folder made there, the note's own folder's name.
project_dialog.move_to_new_folder = In neuen Ordner {folder} verschieben
project_dialog.move_to_folder = In {folder} verschieben
project_dialog.delete_title = {project} löschen?
# A project with machines in it cannot be deleted yet: {machine} is its machine's name.
project_dialog.delete_machine_first = Verschieb oder entferne zuerst die Maschine darin: {machine}.
# {machines} is their names, listed: web-01, web-02 and db.
project_dialog.delete_machines_first = Verschieb oder entferne zuerst die Maschinen darin: {machines}.
# "Move to another project" and "Remove machine" are the items of a machine's ⋯ menu (projectpage.move_machine, projectpage.remove_machine).
project_dialog.delete_how = Auf der Seite des Projekts über ⋯ neben einer Maschine: „In anderes Projekt verschieben“ oder „Maschine entfernen“. Danach lässt sich das Projekt löschen.
project_dialog.cant_undo = Das lässt sich nicht rückgängig machen.
# {n} is how many folders the project has; {notes} is project_dialog.delete_notes.
project_dialog.delete_folders = one: {n} Ordner mit {notes} wird mitgelöscht. | other: {n} Ordner mit {notes} werden mitgelöscht.
# How many notes are in those folders, inside project_dialog.delete_folders: 2 folders with 5 notes are deleted with it.
project_dialog.delete_notes = one: {n} Notiz | other: {n} Notizen
project_dialog.delete_no_notes = Es hat keine Notizen.
# Above the field the project's name is typed in.
project_dialog.delete_type = Gib zur Bestätigung {project} ein
# The button.
project_dialog.delete_button = {project} löschen

# ------------------------------------------------------------ projectpage: a project's page (ProjectPage.tsx)
# The end of the line under the project's name: 2 machines · 1 terminal open · you are the owner.
projectpage.role_owner = deine Rolle: Eigentümer
projectpage.role_admin = deine Rolle: Admin
projectpage.role_member = deine Rolle: Mitglied
projectpage.role_observer = deine Rolle: Betrachter
# A terminal busy with a command whose line is not known.
projectpage.command_running = Ein Befehl läuft
# {duration} is how long the command has run: less than a minute, 3 minutes, an hour (time.for_*).
projectpage.running_for = läuft seit {duration}
# The same, while it is not known how long.
projectpage.running = läuft
# A terminal whose machine is away: {machine} is its name.
projectpage.waits_for = wartet auf {machine}
# Under a terminal's name being typed. Enter and Esc are the keys.
projectpage.rename_hint = Enter speichert, Esc bricht ab.
# On a terminal's name.
projectpage.double_click = Zum Umbenennen doppelklicken
# The button next to a terminal: go to it (a verb).
projectpage.open = Öffnen
# An offline computer's state, next to its name: {ago} is how long ago (time.ago_*): Last seen 14 minutes ago.
projectpage.last_seen = Zuletzt verbunden {ago}
# A computer's state, next to its name.
projectpage.offline = Offline
projectpage.online = Online
# On New terminal: {machine} is the machine's name.
projectpage.offline_title = {machine} ist offline: im Ruhezustand, oder der Agent läuft nicht
projectpage.new_terminal_title = Ein neues Terminal auf {machine}
# Said when New terminal is pressed on an offline computer: {seen} is time.last_seen: last seen 14 minutes ago.
projectpage.offline_wait_seen = {machine} ist offline, {seen}. Sobald sich der Agent verbindet, ist die Maschine wieder da.
projectpage.offline_wait = {machine} ist offline. Sobald sich der Agent verbindet, ist die Maschine wieder da.
projectpage.new_terminal = Neues Terminal
# The ⋯ button next to a machine, for screen readers: {machine} is its name.
projectpage.machine_menu = {machine}: Maschinenmenü
# The tip on that button: the items of its menu (projectpage.move_machine, projectpage.remove_machine).
projectpage.machine_menu_title = In anderes Projekt verschieben, Maschine entfernen
# An item of a machine's menu, and the tip on its ⋯ button when it is the only item.
projectpage.remove_machine = Maschine entfernen
# An item of a machine's menu.
projectpage.move_machine = In anderes Projekt verschieben
projectpage.no_terminals = Keine Terminals offen
# Who changed a note last, and when: {ago} is just now, 5 min ago, yesterday, on 12 Oct (time.*).
projectpage.edited_you = Du, {ago}
# The same, someone else: {name} is their first name.
projectpage.edited_by = {name}, {ago}
# A note's author when it is oneself, in the note's menu: You, the owner and admins can delete it.
projectpage.you = Du
# A checklist's progress, in place of its first line: {n} items ticked of {total}.
projectpage.done = one: {n} von {total} erledigt | other: {n} von {total} erledigt
# A note without text yet, in place of its first line.
projectpage.note_empty = Leer
# The ⋯ button next to a note, for screen readers: {note} is its title.
projectpage.note_menu = {note}: Notizmenü
# The tip on that button: what its menu has.
projectpage.note_menu_title_move = Ordner, In anderes Projekt verschieben, Als Markdown kopieren, Notiz löschen
projectpage.note_menu_title = Ordner, Als Markdown kopieren, Notiz löschen
# The end of the line under the project's name when nobody else is in it: 1 machine · 2 terminals open · only you.
projectpage.only_you = nur du
# The tip on the project's code, next to its name.
projectpage.short_code = Kurzcode
# The pencil next to the project's name.
projectpage.edit = Name, Code und Farbe bearbeiten
# A heading.
projectpage.machines = Maschinen
# Next to the heading Machines.
projectpage.machines_alone = Nur du öffnest Terminals darauf
projectpage.machines_shared = Deine Terminals darauf
projectpage.add_machine = Maschine hinzufügen
# The two kinds of machine one can add, in a project without machines.
projectpage.server = Server
projectpage.server_text = Ein VPS oder Cloud-Server, den du per SSH erreichst. Führ darauf einen Befehl aus, und er erscheint hier.
projectpage.computer = Computer
projectpage.computer_text = Ein Mac oder eine Linux-Maschine zu Hause oder im Büro, auch hinter NAT. Ein kleiner Agent hält die Verbindung.
# "Move to another project" is the item of a machine's ⋯ menu (projectpage.move_machine).
projectpage.move_hint = Die Maschine ist schon in einem anderen Projekt? Dann auf dessen Seite ⋯ neben der Maschine und „In anderes Projekt verschieben“.
# On the page of Personal, the project each person has for themselves: {project} is its name.
projectpage.personal_title = {project} gehört nur dir
projectpage.personal_text = Hierher kann niemand eingeladen werden. Um andere Maschinen getrennt zu halten oder später mit anderen zu arbeiten, erstelle ein Projekt und verschieb Maschinen dorthin.
projectpage.new_project = Neues Projekt
# A heading.
projectpage.notes = Notizen
# Next to the heading Notes.
projectpage.notes_alone = Nur du siehst die Notizen in {project}. Ordner halten sie geordnet
projectpage.notes_shared = Alle in {project} lesen und bearbeiten sie. Ordner halten sie geordnet
projectpage.new_folder = Neuer Ordner
projectpage.no_notes = Noch keine Notizen
# Runbooks, Access, Checklists: examples of folders' names.
projectpage.no_notes_text = Notizen liegen in Ordnern, so wie Terminals auf Maschinen leben. Fang mit einem an: Runbooks, Zugänge, Checklisten.
# A folder without notes, next to its name.
projectpage.folder_empty = Leer
# Who made a folder: {name} is their first name.
projectpage.made_by_you = von dir angelegt
projectpage.made_by = von {name} angelegt
projectpage.new_note = Neue Notiz
# The ⋯ button next to a folder, for screen readers: {folder} is its name.
projectpage.folder_menu = {folder}: Ordnermenü
# The tip on that button: what its menu has.
projectpage.folder_menu_title = Ordner umbenennen, Ordner löschen
# "New note" is the button next to the folder's name (projectpage.new_note).
projectpage.folder_no_notes_writes = Noch keine Notizen. „Neue Notiz“ legt hier die erste an
# A heading at the end of the page: {project} is the project's name.
projectpage.delete_title = {project} löschen
projectpage.delete_text = Die Ordner und Notizen des Projekts werden mitgelöscht. Maschinen müssen vorher in ein anderes Projekt verschoben oder entfernt werden.
projectpage.delete_project = Projekt löschen

# ------------------------------------------------------------ machines: the machines page (Machines.tsx)
# What sudo does on the machine, after "sudo" in what tTerm Web learned about it.
machines.sudo_works = funktioniert
machines.sudo_password = fragt nach Passwort
machines.sudo_missing = nicht verfügbar
# What tTerm Web learned about a machine when it connected: the labels, each with its value.
machines.system = System
machines.kernel = Kernel
machines.cpu = CPU
machines.cores = one: {n} Kern | other: {n} Kerne
machines.memory = Arbeitsspeicher
machines.disk = Speicherplatz
# {free} and {total} are sizes: 7.8 GB free of 50 GB.
machines.disk_free = {free} von {total} frei
# The package manager: apt, brew.
machines.packages = Pakete
machines.shell = Shell
# {shell} is the shell its terminals start, {shells} all the shells it has: zsh (has bash, zsh).
machines.shell_has = {shell} (verfügbar: {shells})
machines.commands = Befehle
# How many commands tTerm Web knows there.
machines.commands_known = one: {n} bekannt | other: {n} bekannt
# The version of the agent, or of tTerm for the computer.
machines.agent = Agent
# The account on the machine the terminals run as: root, deploy.
machines.account = Benutzer
# A computer's state on its card: {seen} is time.last_seen: offline, last seen 14 minutes ago.
machines.offline_seen = offline, {seen}
machines.offline = offline
machines.online = online
machines.offline_note = Der Computer ist im Ruhezustand oder offline, oder sein Agent läuft nicht. Er kommt von selbst zurück, sobald sich sein Agent verbinden kann; diese Seite merkt das innerhalb von zehn Sekunden.
# On Open a terminal while the computer is offline.
machines.offline_title = Er ist offline: im Ruhezustand, oder sein Agent läuft nicht
machines.open_terminal = Terminal öffnen
# A terminal running on the machine: {label} is as its tab shows it (P/web-01 · 2).
machines.back_to = Zurück zu {label}, läuft noch
# The tip on Remove: {machine} is the machine's name.
machines.remove_title = {machine} aus tTerm Web entfernen
# The button: take the machine out (a verb).
machines.remove = Entfernen
# The page's heading.
machines.title = Maschinen
machines.add = Maschine hinzufügen
machines.lead = Ein Terminal läuft weiter, wenn du seinen Tab schließt: Es wartet hier und in der Seitenleiste, bis seine Shell endet.
# A size: {size} is a number as the language writes it, 16 or 7.5.
machines.gb = {size} GB

# ------------------------------------------------------------ note_view: a note in its tab (NoteView.tsx)
# Said for a moment at the bottom of the page. {why} is the reason tTerm
# Web gave, as it gave it.
note_view.not_saved = Nicht gespeichert: {why}
note_view.draft_back = Was in dieser Notiz getippt und nicht gespeichert wurde, ist wieder da.
# When tTerm Web gives no reason.
note_view.no_answer = tTerm Web hat nicht geantwortet.
# Ticking a checklist item did not get through.
note_view.no_tick = Abhaken fehlgeschlagen: {why}
# The note's tab was closed with what was typed in it not saved. {title} is
# the note's title, or note.untitled.
note_view.kept_draft = {title}: Das Getippte ist noch nicht gespeichert. Es bleibt in diesem Browser und ist wieder da, wenn du die Notiz erneut öffnest.
note_view.copied_markdown = Als Markdown kopiert.
note_view.no_copy = Kopieren fehlgeschlagen: Der Browser hat es der Seite nicht erlaubt.
note_view.no_move = Verschieben fehlgeschlagen: {why}
# Under the note's title, the parts of one line with dots between: who
# started it and when; or who edited it last and when · who wrote it and
# on which day; then who sees it. Someone is a person no longer known.
# {name} is a person's first name; {ago} is how long ago, short: just now,
# 5 min ago, yesterday, on 12 Oct; {folder} is a folder's name.
note_view.someone_started = Jemand hat sie {ago} in {folder} angelegt
note_view.you_started = Du hast sie {ago} in {folder} angelegt
note_view.started = {name} hat sie {ago} in {folder} angelegt
note_view.someone_edited = Jemand hat sie {ago} bearbeitet
note_view.you_edited = Du hast sie {ago} bearbeitet
note_view.edited = {name} hat sie {ago} bearbeitet
# {day} is today, yesterday or on 12 Oct.
note_view.someone_wrote = Jemand hat sie {day} geschrieben
note_view.you_wrote = Du hast sie {day} geschrieben
note_view.wrote = {name} hat sie {day} geschrieben
# The end of the same line, after a dot. {project} is a project's name.
note_view.only_you = nur du siehst sie
note_view.everyone_edits = alle in {project} können sie bearbeiten
# The note was deleted while it was open here.
note_view.gone_title = Diese Notiz wurde gelöscht
note_view.gone_text = Sie oder ihr Ordner wurde in einem anderen Tab oder auf einem anderen Gerät gelöscht.
note_view.close_tab = Tab schließen
note_view.copy_what_was_here = Was hier stand, als Markdown kopieren
note_view.no_open = Die Notiz konnte nicht geöffnet werden: {why}
# The ⋯ beside where the note is: what screen readers say, and the tip
# under the mouse, which lists what is in its menu.
note_view.menu = Notizmenü
note_view.menu_title_move = Ordner, In anderes Projekt verschieben, Als Markdown kopieren, Notiz löschen
note_view.menu_title = Ordner, Als Markdown kopieren, Notiz löschen
# The field of the note's title, for screen readers.
note_view.title = Titel
# The note was saved meanwhile from elsewhere, changed in the same places.
note_view.conflict = Diese Notiz wurde anderswo geändert, während du geschrieben hast, und zwar an denselben Stellen. Willst du dort deine Version behalten oder die andere? Alles andere bleibt von beiden erhalten.
note_view.keep_mine = Meine behalten
note_view.keep_theirs = Andere Version behalten

# ------------------------------------------------------------ note_editor: a note's blocks, written in place (NoteEditor.tsx)
# The kinds of block: what screen readers say of one, and what an empty one
# shows. Heading, Code, Divider and Text are also in the list that / opens.
note_editor.text = Text
note_editor.heading = Überschrift
note_editor.list_item = Listenpunkt
note_editor.checklist_item = Checklistenpunkt
note_editor.code = Code
note_editor.divider = Trennlinie
# In the list that / opens: what a block can become. What is typed after
# the / picks from these names.
note_editor.checklist = Checkliste
note_editor.list = Liste
# Who ticked a checklist item, beside it: You · 10:02, Denis · 12 Oct.
note_editor.you = Du
# The same, for a person no longer known.
note_editor.someone = Jemand
# What an empty note shows. The marks # - [ ] \`\`\` and / are typed as they
# are; the words after them are the language's own.
note_editor.start_writing = Fang an zu schreiben. Markdown funktioniert beim Tippen: # Überschrift, - [ ] Checkliste, \`\`\` Code. Tipp / für alles andere.
# What an empty line of text shows.
note_editor.type_slash = Tipp / für Checkliste, Überschrift, Code
# A checklist item's box, for screen readers.
note_editor.untick = Erledigt: Haken entfernen
note_editor.tick = Als erledigt abhaken
note_editor.no_copy = Kopieren fehlgeschlagen: Markier den Text und kopier ihn von Hand.
# The list that / opens, for screen readers.
note_editor.turn_into = Umwandeln in

# ------------------------------------------------------------ menus: the menus behind ⋯, and the window that names a folder (Menus.tsx)
# A note's menu: over the project's folders, the one the note is in
# checked; a click moves it to another.
menus.folder = Ordner
menus.move_out = In anderes Projekt verschieben …
menus.copy_markdown = Als Markdown kopieren
menus.delete_note = Notiz löschen
# Instead of Delete note, for one who may not: who may. {name} is the first
# name of the note's author.
menus.note_rights_move = {name} sowie Eigentümer und Admins können sie in ein anderes Projekt verschieben oder löschen
menus.note_rights_delete = {name} sowie Eigentümer und Admins können sie löschen
# The same, when the note's author is no longer known.
menus.note_rights_move_someone = Die Person, die sie angelegt hat, sowie Eigentümer und Admins können sie in ein anderes Projekt verschieben oder löschen
menus.note_rights_delete_someone = Die Person, die sie angelegt hat, sowie Eigentümer und Admins können sie löschen
# A folder's menu.
menus.rename_folder = Ordner umbenennen
menus.delete_folder = Ordner löschen
# Instead of Delete folder, for one who may not.
menus.folder_rights = Ordner mit Notizen können nur Eigentümer und Admins löschen
# The window that names a folder, a new one or one renamed. First what it
# says when tTerm Web gives no reason.
menus.no_answer = tTerm Web hat nicht geantwortet.
# The field of the folder's name, and an example of one in it.
menus.name = Name
menus.name_example = z. B. Runbooks

# ------------------------------------------------------------ search: search over everything, by ⌘K or Search on the right of the tabs (Search.tsx)
# The kinds of what is found: the buttons above the list, and the heads of
# its groups.
search.kind_commands = Befehle
search.kind_output = Ausgabe
search.kind_notes = Notizen
search.kind_terminals = Terminals
search.kind_machines = Maschinen
search.kind_projects = Projekte
search.kind_actions = Aktionen
# The kind of the line chosen, on top of the preview beside the list.
search.label_command = Befehl
search.label_output = Ausgabe
search.label_note = Notiz
search.label_terminal = Terminal
search.label_machine = Maschine
search.label_project = Projekt
search.label_action = Aktion
# Nothing found. {text} is what was typed; Commands, Output… are the button
# chosen above the list (search.kind_*).
search.nothing_for = Nichts gefunden für „{text}“.
search.nothing_in_commands = Nichts gefunden für „{text}“ unter „Befehle“.
search.nothing_in_output = Nichts gefunden für „{text}“ unter „Ausgabe“.
search.nothing_in_notes = Nichts gefunden für „{text}“ unter „Notizen“.
search.nothing_in_terminals = Nichts gefunden für „{text}“ unter „Terminals“.
search.nothing_in_machines = Nichts gefunden für „{text}“ unter „Maschinen“.
search.nothing_in_projects = Nichts gefunden für „{text}“ unter „Projekte“.
search.nothing_in_actions = Nichts gefunden für „{text}“ unter „Aktionen“.
# How a command found ended: stopped (it has no exit code), or exit 1.
# {code} is its exit code.
search.stopped = gestoppt
search.exit = exit {code}
# How often it ran, at the end of the line under a command:
# P/web-01 · ~/app · main · exit 0 · 10:46 · 3 runs.
search.runs = one: {n}-mal ausgeführt | other: {n}-mal ausgeführt
# Under a line of output found: the command that printed it, in npm test.
search.in_command = in {command}
# Beside the list: what the line chosen is, a row each.
search.row_machine = Maschine
# {machine} is the project's code and the machine's name: P/web-01.
search.machine_removed = {machine}, aus tTerm entfernt
search.row_folder = Verzeichnis
search.row_branch = Branch
search.row_status = Status
search.row_when = Zeit
search.row_terminal = Terminal
# {terminal} is the terminal as its tab names it, P/web-01 · deploy; {when}
# is when it ended: 10:46, yesterday 17:38, 2 Oct 09:12.
search.terminal_ended = {terminal}, beendet {when}
# The buttons under the preview: the command opened at its block, or put
# into the line of the terminal in front, not run.
search.open_in_terminal = Im Terminal öffnen
search.into_line = In die Eingabezeile
# A note found: where it is (its project and folder), when it was edited.
search.row_in = Ort
search.row_edited = Bearbeitet
search.open_note = Notiz öffnen
# Before anything is typed: what was open last, and the commands run most
# on the machine in front; {machine} is its name.
search.recent = Zuletzt geöffnet
search.yours_on = Deine Befehle auf {machine}
# Beside a group's head in All: all of its kind; + when there are more
# than were sent.
search.all = one: Alle {n} | other: Alle {n}
search.all_more = one: Alle {n}+ | other: Alle {n}+
# The window, and its field.
search.label = Suche
search.placeholder = Befehle, Ausgaben, Notizen, Terminals, Maschinen …
search.close_title = Schließen (Esc)
# The buttons above the list; All is the first of them.
search.filters = Suchbereich
search.kind_all = Alle
# The list of what was found, for screen readers.
search.found = Ergebnisse
search.nothing_typed = Noch nichts eingegeben: was du zuletzt offen hattest und was du hier am häufigsten ausführst.
search.looks_in = Die Suche umfasst jeden Befehl in jedem deiner Terminals, alles, was sie ausgegeben haben, sowie Notizen, Terminals, Maschinen und Projekte.
search.everything = Alles durchsuchen
# With Output, Notes or Commands chosen and nothing typed yet.
search.type_output = Gib ein Wort ein, um in der Ausgabe von Befehlen zu suchen.
search.type_notes = Gib ein Wort ein, um in Notizen zu suchen.
search.type_commands = Gib ein Wort ein, um in Befehlen zu suchen.
# Beside the list while nothing is chosen: what to type (c: nginx,
# o: timed out…), and what each keeps to.
search.tips = Ein Präfix beschränkt die Suche auf eine Kategorie
search.tip_commands = Befehle
search.tip_output = Ausgabe von Befehlen
search.tip_notes = Notizen
search.tip_terminals = Terminals
search.tip_machines = Maschinen
search.tip_projects = Projekte
search.tip_actions = Aktionen
# Tab is the key.
search.tips_buttons = Oder wähl einen der Buttons über der Liste. Tab springt zum nächsten.
# At the bottom: a key, and what it does (move, open: verbs). {keys} is
# ⌘ Enter or Ctrl+Enter.
search.keys_move = <kbd>↑</kbd><kbd>↓</kbd> navigieren
search.keys_open = <kbd>Enter</kbd> öffnen
search.keys_paste = <kbd>{keys}</kbd> in die Eingabezeile
search.keys_next = <kbd>Tab</kbd> nächste Kategorie
# The words in front, and what each keeps to. c:, o:, n:, >, t:, m: and p:
# are typed as they are: keep them.
search.prefixes_title = t: Terminals, m: Maschinen, p: Projekte
search.prefix_commands = <code>c:</code> Befehle
search.prefix_output = <code>o:</code> Ausgabe
search.prefix_notes = <code>n:</code> Notizen
search.prefix_actions = <code>></code> Aktionen

# ------------------------------------------------------------ input: tTerm's own input line, under a terminal's feed (InputLine.tsx)
# Said for a moment at the bottom of the page.
input.still_running = Ein Befehl läuft noch. Warte, bis er fertig ist, oder stopp ihn mit Ctrl+C in seinem Block.
# Faint, after a name in the lists over the line: .. goes up a level; the
# branch checked out now; a branch of the remote.
input.up_level = eine Ebene höher
input.branch_current = aktuell
input.branch_remote = remote
# {error} is what went wrong, as the browser or tTerm Web said it.
input.no_answer = Die Maschine hat nicht geantwortet: {error}
# Faint in the line while it cannot take a command.
input.starting = Shell wird gestartet …
input.keys_go = Tastatureingaben gehen an den laufenden Befehl. Klick hier, um den nächsten einzugeben.
# The directory and the branch above the line are buttons: each opens a
# list, to cd into or to switch to. Ctrl+R lists the history.
input.change_dir = Verzeichnis wechseln
input.switch_branch = Branch wechseln
input.history = Verlauf
# The search field over those lists.
input.find_dir = Verzeichnis suchen oder Pfad eingeben
input.find_branch = Branch suchen
input.find_command = Befehl suchen
# Tab's list of what the word could be.
input.completions = Vervollständigungen
input.more_not_shown = Weitere nicht angezeigt: Tipp ein paar Buchstaben mehr
# The line itself, for screen readers.
input.command = Befehl
# Under the line, while it holds a command search put there.
input.from_search = Aus der Suche, noch nicht ausgeführt
input.enter_runs = <kbd>Enter</kbd> führt ihn hier aus
input.esc_clears = <kbd>Esc</kbd> leert die Zeile
# Under the line: a key, and what it does. ⇧↵ is Shift+Enter.
input.tab_complete = <kbd>Tab</kbd> vervollständigen oder Vorschlag übernehmen
input.history_local = <kbd>↑</kbd> Verlauf auf diesem Computer
input.history_devices = <kbd>↑</kbd> Verlauf über alle deine Geräte
input.new_line = <kbd>⇧↵</kbd> neue Zeile
input.while_running = Während ein Befehl läuft, geht alles, was du tippst, an ihn
# A terminal's two modes, beside the line: Line, with this line and the
# commands as blocks; Classic, every key straight to the shell.
input.mode = Eingabemodus
input.mode_line = Zeile
input.mode_classic = Klassisch

# ------------------------------------------------------------ block: one command of the feed, with its output (BlockView.tsx)
# The block, for screen readers. {command} is the command as typed, {code}
# its exit code.
block.state_input = {command}, von der Shell nicht gestartet
block.state_running = {command}, läuft
block.state_failed = {command}, fehlgeschlagen mit Exit-Code {code}
block.state_finished = {command}, abgeschlossen
block.state_ended = {command}, beendet
# On a block search opened: the words found are marked in it.
block.found = Gefunden
# A command the shell has not started; Stop is the button (block.stop).
block.not_started_title = Die Shell wartet auf den Rest (ein offenes Anführungszeichen oder ein Heredoc) oder hat den Befehl nicht angenommen. Tipp in den Block oder drück „Stoppen“.
block.not_started = nicht gestartet
block.running = läuft
# A command that failed: exit 1.
block.exit = exit {code}
block.stop_title = Befehl stoppen (Ctrl+C)
# The button that stops the command running: a verb.
block.stop = Stoppen
# The buttons of a finished block, with their tips.
block.actions = Blockaktionen
block.copy_block = Befehl und Ausgabe kopieren
block.copy_output = Ausgabe kopieren
block.copy_output_title = Nur die Ausgabe kopieren
block.run_again = Erneut ausführen
block.copy_link = Link zu diesem Block kopieren
block.expand = Block ausklappen
block.collapse = Block einklappen
# For screen readers: the browser did not let the page copy.
block.not_copied = Nicht kopiert
# A folded block, in its place; a click unfolds it.
block.lines_hidden = one: {n} Zeile ausgeblendet | other: {n} Zeilen ausgeblendet
# Above a long output, of which the last 400 lines show.
block.show_earlier = one: {n} frühere Zeile anzeigen | other: {n} frühere Zeilen anzeigen
block.show_whole = Ganze Ausgabe anzeigen

# ------------------------------------------------------------ feed: a terminal's commands as blocks, in the Line mode (FeedTerminal.tsx)
# Said for a moment at the bottom of the page.
feed.not_connected = Gerade keine Verbindung zu tTerm Web: Der Befehl wurde nicht gesendet.
feed.still_running = Ein Befehl läuft noch. Er lässt sich mit Ctrl+C stoppen.
feed.copy_refused = Der Browser hat der Seite das Kopieren nicht erlaubt.
feed.output_gone = Die vollständige Ausgabe ist nicht mehr vorhanden.
feed.show_earlier = Frühere Befehle anzeigen
# After clear or Ctrl+L, on top: what came before is out of view; a click
# shows it again.
feed.cleared = one: {n} Block ausgeblendet: anzeigen | other: {n} Blöcke ausgeblendet: anzeigen
feed.empty = Gib unten einen Befehl ein. Jeder wird hier zu einem Block: mit seiner Ausgabe, wie lange er gedauert hat und wie er ausgegangen ist.
# Asked before a dangerous command runs. {what} is what it would do and
# {lost} what does not come back, as tTerm Web says them: delete a
# directory and everything inside it; There is no undo and no bin to look
# in. {machine} is the machine's name; the second is for while it is not
# known.
feed.confirm_label = Diesen Befehl ausführen?
feed.confirm = Auf <strong>{machine}</strong> würde dieser Befehl <strong>{what}</strong>. {lost}
feed.confirm_unknown = Auf <strong>der Maschine</strong> würde dieser Befehl <strong>{what}</strong>. {lost}
# What a command held back would do ({what} of feed.confirm, so in the form
# that fits there) and what does not come back ({lost}): the nine of the
# core and the app (danger.ts).
danger.delete_tree = ein Verzeichnis und alles darin löschen
danger.delete_tree_lost = Das lässt sich nicht rückgängig machen, und es gibt keinen Papierkorb.
danger.disk = das Dateisystem eines Datenträgers überschreiben
danger.disk_lost = Alles auf diesem Datenträger geht verloren, nicht nur Dateien.
danger.device = direkt auf ein Gerät schreiben
danger.device_lost = Was darauf war, ist weg, sobald der Befehl startet.
danger.database = eine Datenbank oder eine Tabelle löschen
danger.database_lost = Nur ein Backup bringt sie zurück.
danger.power_off = die Maschine ausschalten
danger.power_off_lost = Von hier aus lässt sie sich nicht wieder einschalten: Dafür braucht es das Panel des Anbieters.
danger.reboot = die Maschine neu starten
danger.reboot_lost = Die Sitzung bricht ab, und alles, was gerade läuft, stoppt mit ihr.
danger.ssh = den SSH-Dienst stoppen
danger.ssh_lost = Über ihn kommst du hinein. Ihn zu stoppen heißt, die Tür von innen abzuschließen.
danger.firewall = die Firewall ändern
danger.firewall_lost = Eine falsche Regel kann die Maschine abschotten, und du kommst nicht mehr hinein.
danger.user = ein Benutzerkonto löschen
danger.user_lost = Seine Dateien und sein Zugang verschwinden mit ihm.
# Under it, for rm -rf aimed at / or ~.
feed.everything = <strong>Das zielt auf die ganze Maschine.</strong> Nichts darauf würde überleben.
feed.run_it = Ausführen

# ------------------------------------------------------------ terminal_view: a terminal under its tab (TerminalView.tsx)
# A terminal's tab while its own name is not known yet.
terminal_view.terminal = Terminal
# The tip of Line (input.mode_line) when it cannot be chosen.
terminal_view.no_blocks = Diese Shell markiert nicht, wo Befehle beginnen, deshalb läuft sie nur im klassischen Modus.
terminal_view.end_failed = Das Terminal konnte nicht beendet werden: tTerm Web hat nicht geantwortet.
# Under a terminal in the Classic mode (input.mode_classic). Tab is the key.
terminal_view.classic_hint = Klassisch: Jede Taste geht direkt an die Shell, mit ihrem eigenen Tab und Verlauf.
terminal_view.classic_warning = In diesem Modus gibt es keine Rückfrage bei gefährlichen Befehlen.
# {machine} is the machine's name; the second is for while it is not known.
terminal_view.connecting = Verbindung zu {machine} wird hergestellt …
terminal_view.connecting_unknown = Verbindung zur Maschine wird hergestellt …
# A terminal whose computer sleeps, or is offline. {since} is how long:
# 3 minutes, an hour (time.for_*).
terminal_view.away = {machine} ist im Ruhezustand oder offline
terminal_view.away_since = Dieses Terminal wartet und macht dort weiter, wo es war, sobald die Maschine zurück ist. Seit {since} nicht erreichbar.
terminal_view.away_text = Dieses Terminal wartet und macht dort weiter, wo es war, sobald die Maschine zurück ist.
terminal_view.end = Dieses Terminal beenden
# A terminal that ended. Under it, how it ended as tTerm Web says it, or
# not_running.
terminal_view.no_such = Terminal nicht gefunden
terminal_view.ended = Dieses Terminal wurde beendet
terminal_view.not_running = Es läuft nicht mehr.
terminal_view.open_new = Neues Terminal auf {machine} öffnen
terminal_view.close_tab = Tab schließen

# ------------------------------------------------------------ classic: the Classic mode, every key straight to the shell (ClassicTerminal.tsx)
# A command search put here. Line is the mode (input.mode_line).
classic.several_lines = Dieser Befehl hat mehrere Zeilen, und der klassische Modus würde jede sofort beim Einfügen ausführen. Wechsle unter dem Terminal zu „Zeile“.

# ------------------------------------------------------------ tabs: the line of tabs on top (TabBar.tsx)
# The tabs that are open, for screen readers.
tabs.label = Offene Tabs
# Naming a terminal in its tab, after a double click.
tabs.rename_title = Dieses Terminal benennen
tabs.rename_hint = Enter speichert, Esc bricht ab. Der Name erscheint in der Seitenleiste, in Tabs und auf der Projektseite.
# {name} is the tab as it reads: P/web-01 · 2, a note's title, a project's
# name.
tabs.close = Tab {name} schließen
# The + after the tabs.
tabs.new_terminal = Neues Terminal
tabs.new_terminal_title = Ein neues Terminal auf einer beliebigen Maschine
# The button on the right that opens search.
tabs.search_title = Befehle, ihre Ausgabe, Notizen, Terminals, Maschinen und Aktionen durchsuchen
tabs.search = Suchen

# ------------------------------------------------------------ finder: a list with a search field, as the + after the tabs opens it (Finder.tsx)
finder.nothing = Nichts gefunden

# ------------------------------------------------------------ picker: the lists over the input line: directories, branches, history (Picker.tsx)
# While the machine is asked for its directories or branches.
picker.asking = Maschine wird abgefragt …
picker.nothing = Hier ist nichts

# ------------------------------------------------------------ name_input: the field that names a terminal (NameInput.tsx)
# For screen readers. While the terminal has only its number,
# terminal.numbered shows faint in it.
name_input.label = Terminalname

# ------------------------------------------------------------ vault: the vault of SSH keys, words used in many places (0.1.17)
# The vault keeps the person's SSH keys, locked on their own devices; tTerm
# never sees them. Touch ID, Windows Hello and passkey are the names the
# systems give these: they stay as the systems name them in the language.
vault.your_mac = deinem Mac
vault.open_touch = Mit Touch ID öffnen
vault.open_hello = Mit Windows Hello öffnen
vault.open_passkey = Mit einem Passkey öffnen
vault.not_now = Nicht jetzt
# For screen readers: the six digits both devices show, "Code 482 913".
vault.code_label = Code {code}

# ------------------------------------------------------------ keys: Settings › Keys, the vault (Keys.tsx)
keys.title = Schlüssel
keys.about = Dein Tresor: die SSH-Schlüssel, die du gespeichert hast, auf all deinen Geräten. Öffnen können ihn nur deine Geräte, so wie du sie entsperrst; tTerm kann das nicht.
keys.open_here = In diesem Browser geöffnet
# How it opened, then when it locks again: one of these under "Open in this browser".
keys.open_text.touch = Mit Touch ID geöffnet. Dein Tresor wird wieder gesperrt: nach 8 Stunden ohne Aktivität, wenn du tTerm Web schließt oder wenn du auf „Sperren“ drückst.
keys.open_text.hello = Mit Windows Hello geöffnet. Dein Tresor wird wieder gesperrt: nach 8 Stunden ohne Aktivität, wenn du tTerm Web schließt oder wenn du auf „Sperren“ drückst.
keys.open_text.passkey = Mit deinem Passkey geöffnet. Dein Tresor wird wieder gesperrt: nach 8 Stunden ohne Aktivität, wenn du tTerm Web schließt oder wenn du auf „Sperren“ drückst.
keys.open_text.recovery = Mit deinem Wiederherstellungscode geöffnet, für diese Sitzung. Dein Tresor wird wieder gesperrt: nach 8 Stunden ohne Aktivität, wenn du tTerm Web schließt oder wenn du auf „Sperren“ drückst.
keys.open_text.pairing = Mit der Freigabe deines Macs geöffnet, für diese Sitzung. Dein Tresor wird wieder gesperrt: nach 8 Stunden ohne Aktivität, wenn du tTerm Web schließt oder wenn du auf „Sperren“ drückst.
keys.open_text.new = Gerade eben in diesem Browser erstellt. Dein Tresor wird wieder gesperrt: nach 8 Stunden ohne Aktivität, wenn du tTerm Web schließt oder wenn du auf „Sperren“ drückst.
# In tTerm for Mac.
keys.open_mac = Auf diesem Mac geöffnet
keys.open_text.mac = Mit Touch ID oder dem Passwort deines Macs geöffnet. Dein Tresor bleibt geöffnet, solange tTerm läuft, bis du auf „Sperren“ drückst oder dich abmeldest.
keys.lock = Sperren
keys.locked_here = In diesem Browser gesperrt
keys.locked_text = Öffne deinen Tresor, um deine Schlüssel hier zu verwenden: so, wie du diesen Computer entsperrst, mit der Freigabe deines Macs oder mit deinem Wiederherstellungscode.
keys.locked_mac = Auf diesem Mac gesperrt
keys.locked_mac_text = Öffne deinen Tresor mit Touch ID oder dem Passwort deines Macs: Dann meldet dich dieser Mac bei deinen Servern an.
keys.locked_mac_code = Dieser Mac kann deinen Tresor noch nicht selbst öffnen. Öffne ihn hier einmal mit deinem Wiederherstellungscode: Danach öffnet er sich mit Touch ID oder dem Passwort deines Macs.
keys.open = Öffnen
keys.open_code = Mit Wiederherstellungscode öffnen
keys.none_title = Noch kein Tresor
keys.none_web = Füg einen Schlüssel aus einer Datei hinzu: Dabei wird dein Tresor in diesem Browser erstellt, mit einem Wiederherstellungscode, den du aufbewahrst.
keys.none_app = Speichere einen Schlüssel über „Umzug in die Cloud“ oder über die Leiste, die nach ssh in einem Terminal erscheint: Dabei wird dein Tresor mit Touch ID erstellt.
keys.no_passkey_here = Dieser Browser kann keinen Passkey für deinen Tresor speichern: Hier öffnet sich der Tresor mit deinem Wiederherstellungscode oder mit der Freigabe deines Macs, jeweils für eine Sitzung.
keys.no_ed25519_here = Dieser Browser kann nicht mit Ed25519-Schlüsseln signieren. Öffne diese Server in einem neueren Browser oder in tTerm für Mac.
# {servers} is a list of servers: droplet and staging; web-01 in Client X.
keys.opens = Öffnet {servers}
keys.opens_none = Öffnet noch keinen Server
keys.server_in = {server} in {project}
# Where the key came from, and when: {where} is a Mac's name, {day} is
# time.today, time.yesterday or time.on_day ("on 29 Oct").
keys.from_mac = Gespeichert {day} von {where}
keys.from_file = Hinzugefügt {day} aus einer Datei
# After the line above, with " · ": {ago} is "2 hours ago".
keys.used = zuletzt genutzt {ago}
keys.unused = noch nicht genutzt
keys.cannot_ed25519 = Dieser Browser kann nicht mit Ed25519-Schlüsseln signieren
keys.cannot_open = Lässt sich hier nicht öffnen: Füg ihn noch einmal aus seiner Datei hinzu
keys.remove = Entfernen
keys.add_file = Schlüssel aus Datei hinzufügen
keys.new_recovery = Neuen Wiederherstellungscode erstellen
# {places} is where the vault opens: "MacBook-Pro-Denis · tTerm for Mac, Chrome on macOS".
keys.opens_on = Wo sich dein Tresor öffnet: {places}.
keys.opens_on_code = Dein Tresor öffnet sich nur mit deinem Wiederherstellungscode.
keys.place_mac = {mac} · {app}
keys.place_browser = ein Browser
keys.more_web = Weitere Server und Schlüssel von einem Mac: „Umzug in die Cloud“ in tTerm für Mac.
keys.more_app = Weitere Server und Schlüssel: „Umzug in die Cloud“ im Kontomenü.
keys.remove_title = {name} aus deinem Tresor entfernen?
keys.remove_confirm = {name} entfernen
keys.remove_text = Du behältst {servers} in tTerm, kannst darauf aber erst wieder Terminals öffnen, wenn du einen anderen Zugang wählst.
keys.remove_text_none = Damit öffnet sich kein Server.
keys.remove_hint = Der Schlüssel selbst bleibt, wo er war: auf deinem Mac oder in seiner Datei.
keys.removed = {name} wurde aus deinem Tresor entfernt

# ------------------------------------------------------------ add_key: Add a key from a file (Keys.tsx)
add_key.title = Schlüssel aus Datei hinzufügen
add_key.passphrase = Passphrase
add_key.passphrase_hint = Der Schlüssel ist verschlüsselt. Seine Passphrase öffnet ihn hier, in diesem Browser; sie wird nirgendwohin gesendet.
add_key.open_key = Schlüssel öffnen
add_key.reading = Schlüssel wird gelesen …
add_key.name = Name
add_key.sealed_here = Der Schlüssel wird hier verschlossen, bevor er diesen Browser verlässt. Öffnen können ihn nur deine Geräte, tTerm nicht.
add_key.add = Zum Tresor hinzufügen
add_key.next = Weiter
add_key.added = {name} ist jetzt in deinem Tresor
# What is wrong with the file chosen. ssh-keygen and its options are commands: they stay as they are.
add_key.problem_big = Diese Datei ist zu groß für einen privaten Schlüssel.
add_key.problem_read = Der Browser konnte diese Datei nicht lesen.
add_key.problem_format = Das ist kein privater Schlüssel, den tTerm lesen kann. tTerm liest das eigene Format von OpenSSH und PEM (PKCS#8, PKCS#1).
add_key.problem_public = Das ist ein öffentlicher Schlüssel (.pub). Wähl den privaten Schlüssel: die gleichnamige Datei ohne .pub.
add_key.problem_passphrase = Der Schlüssel hat eine Passphrase: Gib sie ein, um ihn zu öffnen.
add_key.problem_wrong_passphrase = Diese Passphrase öffnet den Schlüssel nicht.
add_key.problem_security_key = Dieser Schlüssel liegt auf einem Sicherheitsschlüssel und kann ihn nicht verlassen: Öffne seine Server über deinen Mac.
add_key.problem_dsa = DSA-Schlüssel werden im Tresor nicht gespeichert. Erstelle einen neuen Schlüssel mit ssh-keygen -t ed25519.
add_key.problem_nistp521 = Schlüssel vom Typ ECDSA P-521 speichert der Tresor noch nicht: Ed25519, ECDSA P-256 und P-384 sowie RSA schon.
add_key.problem_type = Diesen Schlüsseltyp speichert der Tresor nicht: nur Ed25519, ECDSA P-256 und P-384 sowie RSA.
add_key.problem_cipher = Dieser Schlüssel ist auf eine Weise verschlüsselt, die dieser Browser nicht öffnen kann. Ändere seine Passphrase mit ssh-keygen -p und füg ihn dann noch einmal hinzu.
add_key.problem_encrypted_pem = Diese Schlüsseldatei ist nach dem alten PEM-Verfahren verschlüsselt. Wandle sie mit ssh-keygen -p -f und der Datei in das Format von OpenSSH um und füg sie dann noch einmal hinzu.
add_key.problem_ed25519 = Dieser Browser kann Ed25519-Schlüssel in diesem Format nicht lesen. Versuch es mit einem neueren Browser oder mit dem Schlüssel im Format von OpenSSH.
add_key.problem_several = Die Datei enthält mehr als einen Schlüssel: Füg sie einzeln hinzu.

# ------------------------------------------------------------ vault_new: Save your key to your vault (VaultDialogs.tsx)
vault_new.title = Schlüssel in deinem Tresor speichern
# <code>…</code> is the key's name: id_ed25519. {server} is the server's name.
vault_new.text_server = <code>{key}</code> kommt in deinen Tresor, und du öffnest {server} damit in tTerm Web, auf deinem Handy oder auf jedem Computer, an dem du dich anmeldest.
vault_new.text = <code>{key}</code> kommt in deinen Tresor: Die Server, die sich damit öffnen, öffnest du dann in tTerm Web, auf deinem Handy oder auf jedem Computer, an dem du dich anmeldest.
# In tTerm for Mac.
vault_new.point_mac_unlock = Dein Tresor öffnet sich so, wie du diesen Mac entsperrst: mit Touch ID oder dem Passwort deines Macs. Du musst dir nichts Neues merken.
vault_new.point_mac_locked = Dein Schlüssel wird verschlossen, bevor er diesen Mac verlässt. Öffnen können ihn nur deine Geräte, tTerm nicht.
vault_new.point_mac_browser = Ein neuer Browser öffnet deinen Tresor, sobald du den Browser hier freigibst, oder mit deinem Wiederherstellungscode.
# In a browser.
vault_new.point_web_unlock = Dein Tresor öffnet sich so, wie du diesen Computer entsperrst: mit Touch ID, Windows Hello oder der Displaysperre deines Handys. Du musst dir nichts Neues merken.
vault_new.point_web_no_passkey = Dieser Browser kann keinen Passkey für deinen Tresor speichern: Hier öffnet sich der Tresor mit deinem Wiederherstellungscode, jeweils für eine Sitzung.
vault_new.point_web_locked = Dein Schlüssel wird verschlossen, bevor er diesen Browser verlässt. Öffnen können ihn nur deine Geräte, tTerm nicht.
vault_new.point_web_browser = Ein anderer Browser öffnet deinen Tresor mit deinem Wiederherstellungscode oder sobald du den Browser in tTerm für Mac freigibst.
vault_new.make_touch = Tresor mit Touch ID erstellen
vault_new.make_hello = Tresor mit Windows Hello erstellen
vault_new.make_passkey = Tresor mit einem Passkey erstellen
vault_new.make = Tresor erstellen

# ------------------------------------------------------------ recovery: the recovery code, shown once (VaultDialogs.tsx)
recovery.title = Dein Wiederherstellungscode
recovery.text = Wenn du jemals alle Geräte verlierst, die deinen Tresor öffnen, ist dieser Code der einzige Weg zurück zu deinen Schlüsseln. tTerm kann sie nicht für dich wiederherstellen. Du siehst ihn nur dieses eine Mal.
recovery.title_new = Dein neuer Wiederherstellungscode
recovery.text_new = Der bisherige Code öffnet deinen Tresor nicht mehr. Wenn du jemals alle Geräte verlierst, die deinen Tresor öffnen, ist dieser neue Code der einzige Weg zurück zu deinen Schlüsseln. Du siehst ihn nur dieses eine Mal.
# For screen readers.
recovery.code_label = Wiederherstellungscode {code}
recovery.save_file = Als Datei speichern
recovery.copy_failed = Kopieren fehlgeschlagen: Markier den Code und kopier ihn von Hand.
# What the file saved holds.
recovery.file_text = Wiederherstellungscode für deinen tTerm-Tresor: {code}\\nEr öffnet deinen Tresor, wenn keines deiner Geräte das kann. Bewahre ihn an einem sicheren Ort auf, getrennt von deinen Geräten.
recovery.kept_mac = Ich habe ihn sicher aufbewahrt, nicht nur auf diesem Mac
recovery.kept_web = Ich habe ihn sicher aufbewahrt, nicht nur auf diesem Computer
recovery.make_title = Neuen Wiederherstellungscode erstellen?
recovery.make_text = Dein aktueller Code funktioniert dann nicht mehr, und der neue wird nur einmal angezeigt. Deine Schlüssel und Geräte bleiben, wie sie sind.
recovery.now_code = Dein aktueller Wiederherstellungscode
recovery.now_code_hint = Dieser Browser hat keinen Passkey für deinen Tresor, deshalb brauchst du für den neuen Code deinen aktuellen. Du hast ihn verloren? Dann erstelle den neuen in tTerm für Mac.
recovery.make_go = Neuen Code erstellen
recovery.make_go_passkey = Mit deinem Passkey erstellen
recovery.make_touch = Mit Touch ID erstellen

# ------------------------------------------------------------ vault_open: Open your keys on this browser (VaultDialogs.tsx)
vault_open.title = Deine Schlüssel in diesem Browser öffnen
vault_open.text = Dieser Browser ist für deinen Tresor neu. Gib ihn auf einem Gerät frei, das den Tresor schon öffnet.
vault_open.text_code = Öffne deinen Tresor in diesem Browser mit deinem Wiederherstellungscode.
# {mac} is the Mac's name, {app} is app_link.mac: "MacBook-Pro-Denis · tTerm for Mac".
vault_open.mac_name = {app} auf {mac}
vault_open.mac_ask = Freigabe für diesen Browser anfordern
vault_open.mac_waiting = Anfrage gesendet. Sie wartet dort auf dich …
vault_open.mac_compare = Lass es dort nur zu, wenn der Mac denselben Code zeigt
vault_open.mac_approved = Freigegeben: Deine Schlüssel werden geöffnet …
vault_open.mac_denied = Dort abgelehnt.
vault_open.mac_expired = Die Anfrage ist abgelaufen. Fordere die Freigabe noch einmal an.
vault_open.sas_text = Auch dein Mac zeigt einen Code. Lass es dort nur zu, wenn der Code übereinstimmt:
vault_open.or = oder
vault_open.code = Wiederherstellungscode
vault_open.open = Öffnen
# Once open with the recovery code or the Mac's approval: whether this browser keeps a passkey.
vault_open.opened_title = Deine Schlüssel sind in diesem Browser geöffnet
vault_open.opened_text = Hier einen Passkey speichern, damit sie sich nächstes Mal so öffnen, wie du diesen Computer entsperrst? Auf einem Computer, der nicht dir gehört, wähl „Nur dieses Mal“.
vault_open.keep_touch = Mit Touch ID speichern
vault_open.keep_hello = Mit Windows Hello speichern
vault_open.keep_passkey = Mit einem Passkey speichern
vault_open.only_now = Nur dieses Mal
vault_open.kept_session = Sie bleiben nur für diese Sitzung geöffnet.

# ------------------------------------------------------------ app_code: in tTerm for Mac, a vault this Mac has no lock of (VaultDialogs.tsx)
app_code.title = Deinen Tresor auf diesem Mac öffnen
app_code.text = Dieser Mac kann deinen Tresor noch nicht selbst öffnen. Öffne ihn hier einmal mit deinem Wiederherstellungscode: Danach öffnet dieser Mac ihn mit Touch ID.
# When this Mac's lock is there but no longer opens the vault (taken off in a browser, or gone from the keychain).
app_code.text_lost = Dieser Mac kann deinen Tresor nicht mehr selbst öffnen. Öffne ihn hier einmal mit deinem Wiederherstellungscode: Dann öffnet dieser Mac ihn wieder mit Touch ID.

# ------------------------------------------------------------ passphrase: a key's passphrase, in tTerm for Mac (VaultDialogs.tsx)
# {key} is the key's name: id_ed25519.
passphrase.title = {key} hat eine Passphrase
passphrase.text = Gib sie ein: Dieser Mac öffnet den Schlüssel damit, und sonst geht sie nirgendwohin. Der Schlüssel kommt verschlossen in deinen Tresor.
# For Let tTerm in: {server} is the server's name, or several ("staging and old-vps").
passphrase.text_sign_in = Gib sie ein: Dieser Mac meldet sich einmal mit dem Schlüssel bei {server} an, um dort die Zeile von tTerm hinzuzufügen. Die Passphrase geht sonst nirgendwohin, und der Schlüssel bleibt auf diesem Mac.
passphrase.label = Passphrase
passphrase.go = Schlüssel öffnen

# ------------------------------------------------------------ mac_approve: in tTerm for Mac, a new browser asks for the keys (VaultDialogs.tsx)
# {device} is the browser, "Chrome on Windows".
mac_approve.title = {device} möchte deine Schlüssel öffnen
mac_approve.a_browser = Ein Browser
# {ago} is "2 minutes ago", {ip} the address it signed in from.
mac_approve.text_code = Der Browser hat sich {ago} mit einem Code per E-Mail bei deinem Konto angemeldet, von {ip} aus. Lass ihn nur zu, wenn du es bist: Er öffnet dann Server mit deinen Schlüsseln.
mac_approve.text_code_now = Der Browser hat sich mit einem Code per E-Mail bei deinem Konto angemeldet, von {ip} aus. Lass ihn nur zu, wenn du es bist: Er öffnet dann Server mit deinen Schlüsseln.
mac_approve.text_other = Der Browser hat sich von {ip} aus bei deinem Konto angemeldet. Lass ihn nur zu, wenn du es bist: Er öffnet dann Server mit deinen Schlüsseln.
mac_approve.sas_text = Der Browser zeigt einen Code. Lass ihn nur zu, wenn der Code übereinstimmt:
# For screen readers, while the code is on its way.
mac_approve.sas_waiting = Warten auf den Code
mac_approve.not_me = Das bin ich nicht
mac_approve.allow = Mit Touch ID zulassen
mac_approve.not_me_note = „Das bin ich nicht“: Die Anmeldung dort wird beendet, und unter Einstellungen › Geräte siehst du, was du sonst noch prüfen solltest.

# ------------------------------------------------------------ vault_locked: a server with your key, the vault locked here (VaultLocked.tsx)
vault_locked.title = {machine} öffnet sich mit deinem Schlüssel
vault_locked.text = Deine Schlüssel sind in diesem Browser gesperrt. Öffne sie so, wie du diesen Computer entsperrst; tTerm meldet dich dann bei {machine} an, und dein Schlüssel verlässt diesen Browser nie.
vault_locked.text_app = Deine Schlüssel sind auf diesem Mac gesperrt. Öffne sie mit Touch ID oder dem Passwort deines Macs; dann meldet dich dieser Mac bei {machine} an.
vault_locked.text_app_code = Dieser Mac kann deinen Tresor noch nicht selbst öffnen. Öffne ihn hier einmal mit deinem Wiederherstellungscode; dann meldet dich dieser Mac bei {machine} an.
# Small links under the button: "or approve on MacBook-Pro-Denis · use the recovery code".
vault_locked.or = oder
vault_locked.approve_on = auf {mac} freigeben
vault_locked.use_code = den Wiederherstellungscode verwenden
vault_locked.approve_on_button = Auf {mac} freigeben
vault_locked.use_code_button = Wiederherstellungscode verwenden
vault_locked.signing = Anmeldung bei {machine} mit deinem Schlüssel …
vault_locked.no_ed25519 = Dieser Browser kann nicht mit Ed25519-Schlüsseln signieren. Öffne {machine} in einem neueren Browser oder in tTerm für Mac.
# {key} is the key's name, or vault_locked.its_key.
vault_locked.not_here = Dein Tresor ist hier geöffnet, aber {key} lässt sich in diesem Browser nicht öffnen. Füg ihn unter Einstellungen › Schlüssel noch einmal aus seiner Datei hinzu.
vault_locked.its_key = der zugehörige Schlüssel

# ------------------------------------------------------------ vault_problem: what went wrong with the vault (vault/store.ts)
vault_problem.no_vault = Du hast noch keinen Tresor.
vault_problem.exists = Du hast schon einen Tresor: Öffne ihn und füg dann den Schlüssel hinzu.
vault_problem.locked = Öffne zuerst deinen Tresor.
vault_problem.no_passkey = Hier hat sich kein Passkey für deinen Tresor gemeldet. Gib diesen Browser auf deinem Mac frei oder verwende deinen Wiederherstellungscode.
vault_problem.no_prf = Dieser Passkey kann deinen Tresor hier nicht öffnen. Gib diesen Browser auf deinem Mac frei oder verwende deinen Wiederherstellungscode.
vault_problem.no_prf_here = Dieser Browser kann keinen Passkey für deinen Tresor speichern: Der Tresor bleibt nur für diese Sitzung geöffnet.
vault_problem.lock_broken = Der Passkey dieses Browsers öffnet deinen Tresor nicht mehr. Verwende deinen Wiederherstellungscode oder gib den Browser auf deinem Mac frei.
vault_problem.code_form = Ein Wiederherstellungscode besteht aus 24 Buchstaben und Ziffern in sechs Vierergruppen.
vault_problem.code_wrong = Dieser Wiederherstellungscode öffnet deinen Tresor nicht. Prüf den Code oder gib diesen Browser auf deinem Mac frei.
# In tTerm for Mac: the engine's answers, said by the page (the code window, Touch ID).
vault_problem.code_wrong_app = Dieser Wiederherstellungscode öffnet deinen Tresor nicht. Prüf den Code und versuch es noch einmal.
vault_problem.touch_failed = Die Bestätigung mit Touch ID oder dem Passwort deines Macs ist nicht durchgegangen. Es wurde nichts geändert.
vault_problem.need_code = Gib jetzt deinen Wiederherstellungscode ein: Dieser Browser hat keinen Passkey für deinen Tresor.
vault_problem.no_x25519 = Dieser Browser ist zu alt, um von deinem Mac freigegeben zu werden: Verwende deinen Wiederherstellungscode oder einen neueren Browser.
vault_problem.pairing = Die Anfrage ist nicht durchgekommen. Fordere die Freigabe noch einmal an.
vault_problem.passkey_exists = Dieser Browser hat schon einen Passkey für tTerm.
vault_problem.no_passkey_here = Dieser Browser kann keinen Passkey erstellen.
vault_problem.something = Etwas ist schiefgelaufen. Versuch es noch einmal.

# ------------------------------------------------------------ ssh_strip: under a successful ssh in tTerm for Mac's terminals (SshStrip.tsx)
# {alias} is the server's name as ssh knows it: droplet.
ssh_strip.region = {alias} in tTerm übernehmen
ssh_strip.title = {alias}: von überall öffnen
# <code>…</code>: the address, root@203.0.113.7, and the key, ~/.ssh/id_ed25519.
ssh_strip.text = tTerm Web, dein Handy, jeder Computer, an dem du dich anmeldest. <code>{address}</code>, dein Schlüssel <code>{key}</code>
ssh_strip.text_no_key = tTerm Web, dein Handy, jeder Computer, an dem du dich anmeldest. <code>{address}</code>
ssh_strip.save = Schlüssel speichern
ssh_strip.let_in = tTerm Zugang geben
ssh_strip.not_now = Nicht jetzt
ssh_strip.never = Bei {alias} nicht mehr fragen
# <b>…</b> are the two buttons' names, as above.
ssh_strip.explain = <b>Schlüssel speichern:</b> Er kommt in deinen Tresor, den nur deine Geräte öffnen; auf {alias} ändert sich nichts. <b>tTerm Zugang geben:</b> tTerm fügt auf {alias} eine eigene Zeile hinzu; dein Schlüssel bleibt auf diesem Mac. Mehrere Server auf einmal: „Umzug in die Cloud“ im Kontomenü.
ssh_strip.explain_pass = <b>tTerm Zugang geben:</b> tTerm fügt auf {alias} eine eigene Zeile hinzu; dein Schlüssel bleibt auf diesem Mac. Mehrere Server auf einmal: „Umzug in die Cloud“ im Kontomenü.
ssh_strip.unreachable = tTerm Web erreicht {alias} aus der Cloud nicht: Der Server öffnet sich über diesen Mac, solange dieser eingeschaltet ist.
ssh_strip.through_mac = Über diesen Mac öffnen
ssh_strip.saved_key = {alias} ist jetzt in tTerm und öffnet sich von überall mit deinem Schlüssel.
ssh_strip.saved_cert = {alias} ist jetzt in tTerm: tTerm hat darauf eine eigene Zeile hinzugefügt, und der Server öffnet sich von überall.
ssh_strip.saved_mac = {alias} ist jetzt in tTerm und öffnet sich über diesen Mac, solange dieser eingeschaltet ist.

# ------------------------------------------------------------ move: Move to cloud, in tTerm for Mac (MoveToCloud.tsx)
move.title = Umzug in die Cloud
move.text = Die Server, die dieser Mac kennt, kommen in dein Konto: Öffne sie in tTerm Web, auf deinem Handy oder auf jedem Computer, an dem du dich anmeldest. Nichts zieht um, bis du auf „Umziehen“ drückst.
move.servers = Server auf diesem Mac
# <code>…</code> are ssh's files: they stay as they are.
move.servers_from = aus <code>~/.ssh/config</code>, <code>known_hosts</code> und deinen ssh-Aufrufen hier
move.looking = ~/.ssh wird gelesen …
move.no_servers = Dieser Mac kennt noch keine Server: nichts in ~/.ssh/config oder known_hosts und kein ssh-Aufruf in seinen Terminals.
# For screen readers: the tick and the choice of each server.
move.tick_server = {name} umziehen
move.how = Wie sich {name} öffnet
# The three ways, in the choice of each server and on the cards under the list.
move.method_key = Mein Schlüssel
move.method_cert = tTerm-Zugang
move.method_mac = Über diesen Mac
move.way_key = Der Schlüssel kommt in deinen Tresor; auf dem Server ändert sich nichts. Öffnet sich in jedem Browser, sobald dieser deinen Tresor entsperrt hat.
move.way_cert = tTerm fügt auf dem Server eine eigene Zeile hinzu, dein Schlüssel bleibt hier. Öffnet sich überall, auch in Telegram.
move.way_mac = Nichts zieht um: tTerm bittet diesen Mac, sich zu verbinden, solange er eingeschaltet ist. Für Server hinter einem VPN.
# {address} is root@203.0.113.7, {jump} the bastion it goes through.
move.addr_via = {address} via {jump}
# After "~/.ssh/config · ": {ago} is "3 minutes ago".
move.ran_ago = ssh {alias} {ago} ausgeführt
move.ran_here = ssh {alias} hier ausgeführt
move.note_known = diesem Mac bekannt
move.note_git = Ein Git-Host: kein Terminal zum Öffnen
move.note_there = Schon in tTerm
move.note_checking = Es wird geprüft, ob tTerm Web ihn erreicht …
move.note_jump = Hinter dem Bastion-Host {jump}, den die Cloud erreicht: öffnet sich darüber
move.note_jump_far = Hinter einem Bastion-Host, den nur dein Netzwerk erreicht ({jump}): über diesen Mac
move.note_far = tTerm Web erreicht ihn aus der Cloud nicht: über diesen Mac
move.note_key_stays = Sein Schlüssel {key} kann diesen Mac nicht verlassen: über diesen Mac
move.keys = Schlüssel in ~/.ssh
move.keys_note = nur die angehakten kommen in deinen Tresor
# For screen readers.
move.tick_key = {name} in deinem Tresor speichern
# {servers} is a server, or a list of them: droplet, staging and app-01.
move.key_used_one = {servers} öffnet sich damit: kommt in deinen Tresor
move.key_used_many = {servers} öffnen sich damit: kommt in deinen Tresor
move.key_unused = Keiner der Server oben nutzt ihn
move.key_in_vault = Schon in deinem Tresor
move.key_security = Liegt auf einem Sicherheitsschlüssel und kann ihn nicht verlassen. Seine Server laufen über diesen Mac
move.key_agent = Liegt nur in einem Agenten und lässt sich nicht kopieren. Seine Server laufen über diesen Mac
move.key_type = Ein Schlüsseltyp, den der Tresor noch nicht speichert. Seine Server laufen über diesen Mac
move.key_passphrase = hat eine Passphrase
move.vault_note = Dein Tresor öffnet sich so, wie du diesen Mac entsperrst: mit Touch ID oder dem Passwort deines Macs. Öffnen können ihn nur deine Geräte, tTerm nicht.
move.go = one: {n} Server umziehen | other: {n} Server umziehen

# ------------------------------------------------------------ moved: what came of Move to cloud (MoveToCloud.tsx)
moved.title = one: {ok} von {n} Server in tTerm übernommen | other: {ok} von {n} Servern in tTerm übernommen
# {project} is where they are: Personal.
moved.text = In {project}: Öffne sie in tTerm Web, auf deinem Handy oder auf jedem Computer, an dem du dich anmeldest.
moved.key = Öffnet sich mit deinem Schlüssel
moved.key_jump = Öffnet sich mit deinem Schlüssel, über {jump}
moved.cert = Öffnet sich mit dem tTerm-Zugang
moved.cert_jump = Öffnet sich mit dem tTerm-Zugang, über {jump}
moved.mac = Über diesen Mac, solange er eingeschaltet ist
moved.failed = Nicht umgezogen.
# {why} is what went wrong, as the Mac said it.
moved.failed_text = {why} Für diesen Server wurde nichts gespeichert.
moved.open = Terminal öffnen
moved.change = Ändern
# <b>…</b> is the key's name, or a list of them.
moved.keys_one = <b>{keys}</b> ist jetzt in deinem Tresor verschlossen und öffnet sich so, wie du deine Geräte entsperrst. Unter Einstellungen › Schlüssel siehst du ihn überall.
moved.keys_many = <b>{keys}</b> sind jetzt in deinem Tresor verschlossen und öffnen sich so, wie du deine Geräte entsperrst. Unter Einstellungen › Schlüssel siehst du sie überall.
moved.no_keys = Kein Schlüssel ist umgezogen: Deine Schlüssel bleiben auf diesem Mac.
`;export{e as default};