var e=`# Strings of tTerm Web's page in English: one a line, \`key = text\`.
# Every language has the same keys; the build stops when one is missing
# (scripts/strings.mjs). {name} is a value the page puts in; a counting
# string has a form for each plural of the language, "one: … | other: …",
# and {n} is the count; <b>…</b> wraps a part the page makes a link, bold
# or code. Names of machines, projects, notes and terminals, commands and
# their output, tTerm, tTerm Web and Free are not translated.

# ------------------------------------------------------------ common: words used in many places
common.close = Kapat
common.cancel = Vazgeç
common.save = Kaydet
common.loading = Yükleniyor…
common.try_again = Yeniden dene
common.copy = Kopyala
common.copied = Kopyalandı
common.back = Geri
common.done = Bitti
common.more = Diğer
common.sign_in = Giriş yap

# ------------------------------------------------------------ time: how long ago (time.ts)
# A duration after "for": Away for 3 minutes, running for an hour.
time.for_less = bir dakikadan kısa süredir
time.for_minutes = one: bir dakikadır | other: {n} dakikadır
time.for_hours = one: bir saattir | other: {n} saattir
time.for_days = one: bir gündür | other: {n} gündür
# How long ago, in full words: Signed in 3 minutes ago.
time.ago_now = az önce
time.ago_minutes = one: bir dakika önce | other: {n} dakika önce
time.ago_hours = one: bir saat önce | other: {n} saat önce
time.ago_days = one: bir gün önce | other: {n} gün önce
# A machine that is offline: {ago} is one of the four above.
time.last_seen = en son {ago} görüldü
# How long ago, short, in lists of notes and in Updates: Looked 5 min ago.
time.short_minutes = one: {n} dk önce | other: {n} dk önce
time.short_hours = one: {n} sa önce | other: {n} sa önce
time.yesterday = dün
time.today = bugün
time.days_ago = one: {n} gün önce | other: {n} gün önce
time.last_week = geçen hafta
time.weeks_ago = one: {n} hafta önce | other: {n} hafta önce
# {day} is a date as the language writes it: 12 Oct, 12. Okt.
time.on_day = {day} tarihinde
# In search: yesterday 17:38, 2 Oct 09:12.
time.yesterday_at = dün {time}
time.day_at = {day} {time}

# ------------------------------------------------------------ here: the computer tTerm for Mac runs on
# Alone, as a label (the sidebar, tabs). Sentences that name it have a
# string of their own for each: .mac and .computer.
here.mac = bu Mac
here.computer = bu bilgisayar

# ------------------------------------------------------------ role: one's role in a project
role.owner = Sahip
role.admin = Yönetici
role.member = Üye
role.observer = İzleyici

# ------------------------------------------------------------ color: projects' colors (colors.ts)
color.violet = Mor
color.sky = Gök mavisi
color.teal = Turkuaz
color.pink = Pembe
color.orange = Turuncu
color.lime = Fıstık yeşili
color.indigo = Çivit mavisi
color.slate = Kurşuni

# ------------------------------------------------------------ count: how many, in lists and lines
count.machines = one: {n} makine | other: {n} makine
count.notes = one: {n} not | other: {n} not
count.terminals_open = one: {n} açık terminal | other: {n} açık terminal
# The end of a list cut short: web-01, web-02, web-03, web-04 and 3 more.
count.more = one: {n} tane daha | other: {n} tane daha

# A terminal that has only its number, in lists: terminal 2.
terminal.numbered = terminal {number}
# A note without a title.
note.untitled = Adsız

# ------------------------------------------------------------ sidebar (Sidebar.tsx)
sidebar.label = Kenar çubuğu
sidebar.all_machines = Tüm makineler
sidebar.keep_open = Kenar çubuğunu açık tut
sidebar.keep_open_title = Kenar çubuğunu açık tut
sidebar.let_slide = Kenar çubuğu kayarak gizlensin
sidebar.close = Kenar çubuğunu kapat
sidebar.projects = Projeler
sidebar.fold = Daralt: {name}
sidebar.unfold = Genişlet: {name}
sidebar.open_project = {name} projesini aç: makineleri ve notları
sidebar.machines = Makineler
sidebar.add_machine = Makine ekle
sidebar.no_machines = Henüz makine yok
sidebar.notes = Notlar
sidebar.new_folder = Yeni klasör
sidebar.no_notes = Henüz not yok
sidebar.no_notes_writes = Henüz not yok. + notlar için bir klasör oluşturur
sidebar.new_project = Yeni proje
sidebar.waits = {name}, tTerm'e bağlantı yeniden kurulunca geri gelir
sidebar.offline = {name} çevrimdışı: uykuda ya da ajanı çalışmıyor
# {seen} is time.last_seen: last seen 14 minutes ago.
sidebar.offline_seen = {name} çevrimdışı: uykuda ya da ajanı çalışmıyor ({seen})
sidebar.here.mac = {name}, bu Mac: terminalleri tam burada, internet olmadan da çalışır
sidebar.here.computer = {name}, bu bilgisayar: terminalleri tam burada, internet olmadan da çalışır
sidebar.new_terminal = Yeni terminal
sidebar.new_terminal_on = {name} üzerinde yeni terminal
sidebar.rename_hint = Enter kaydeder, Esc iptal eder
sidebar.go_to = {label} terminaline geç
sidebar.go_to_away = {label} terminaline geç: {machine} geri gelene kadar bekliyor
sidebar.double_click = Yeniden adlandırmak için çift tıkla
sidebar.end = {label} terminalini sonlandır
sidebar.end_title = {label} terminalini sonlandır: kabuğu sonlanır
sidebar.new_note_in = {name} klasöründe yeni not
sidebar.empty_folder = Boş
sidebar.empty_folder_writes = Boş. + yeni bir not başlatır
sidebar.signin_title = Sunucular ve projeler
sidebar.signin_text = Sunucularında terminal açmak, projelerde not tutmak ve ekibinle çalışmak için giriş yap. Bu bilgisayar olduğu gibi kalır.
sidebar.theme_dark = Koyu temaya geç
sidebar.theme_light = Açık temaya geç

# ------------------------------------------------------------ account_menu: the account at the bottom of the sidebar and its menu
# "Free" is the plan's name: it stays as it is.
account_menu.free_plan = Free planı
account_menu.title = Ayarlar, dil, hesap, çıkış yap
account_menu.title_local = Ayarlar, dil, giriş yap
account_menu.not_signed_in = Giriş yapılmadı
account_menu.only_here = Yalnızca bu bilgisayar
account_menu.offline = Çevrimdışı, yeniden deneniyor
account_menu.local_note = tTerm bu bilgisayarla çalışıyor. Sunucuların, projelerin ve ekibin için giriş yap.
account_menu.sign_out = Çıkış yap
# The item after Settings, and the title of the list of languages.
language.item = Dil

# ------------------------------------------------------------ settings (Settings.tsx)
# The page, and the item of the account's menu that opens it.
settings.title = Ayarlar
settings.appearance = Görünüm
settings.appearance_local = Bu bilgisayara kaydedilir. Sistem seçeneği bu bilgisayarın ayarına uyar. Projenin rengi kod rozetini doldurur ya da kenar çubuğunda projenin tamamını renklendirir.
settings.appearance_account = Hesabına kaydedilir. Sistem seçeneği, kullandığın her bilgisayarın kendi ayarına uyar. Projenin rengi kod rozetini doldurur ya da kenar çubuğunda projenin tamamını renklendirir.
settings.theme = Tema
settings.theme_system = Sistem
settings.theme_light = Açık
settings.theme_dark = Koyu
settings.tints = Proje renkleri
settings.tint_badge = Kod rozeti
settings.tint_block = Tüm proje

# ------------------------------------------------------------ devices (Devices.tsx)
devices.title = Cihazlar

# ------------------------------------------------------------ account (Account.tsx)
# The page, and the item of the account's menu that opens it.
account.title = Hesap

# ------------------------------------------------------------ app: the page's frame, toasts and dialogs (App.tsx)
app.session_ended = Oturumun sona erdi. Yeniden giriş yap: terminallerin çalışmaya devam etti.
# How saving goes in the note in front, on the line of tabs.
app.saved = Kaydedildi
app.saving = Kaydediliyor…
app.not_saved_offline = Kaydedilmedi: bağlantı yok
app.not_saved = Kaydedilmedi
app.no_connection = Bağlantı yok
app.not_answering_local = tTerm Web yanıt vermiyor. python -m tterm.dev bir terminal penceresinde çalışıyor mu?
app.not_answering = tTerm Web yanıt vermiyor. Bağlantını kontrol et ve yeniden dene.
# {why} is the reason tTerm Web gave, as it gave it.
app.no_terminal = Terminal açılamadı: {why}
app.offline = {name} çevrimdışı: ajanı bağlandığında geri gelir.
# {seen} is time.last_seen: last seen 14 minutes ago.
app.offline_seen = {name} çevrimdışı, {seen}: ajanı bağlandığında geri gelir.
app.removed_shared = {name} tTerm Web'den kaldırıldı. Aynı sunucu başka bir projede de olduğu için tTerm Web'in sunucudaki erişimi duruyor.
app.removed_access = {name} tTerm Web'den kaldırıldı ve tTerm Web'in sunucudaki erişimi geri alındı.
app.removed = {name} tTerm Web'den kaldırıldı.
app.no_note = Not oluşturulamadı: {why}
app.note_deleted = {title} notu {folder} klasöründen silindi.
app.note_deleted_journal = {title} notu {folder} klasöründen silindi. Günlüğe bununla ilgili bir satır eklendi.
app.folder_deleted = {name} klasörü silindi.
app.folder_deleted_journal = {name} klasörü silindi. Günlüğe bununla ilgili bir satır eklendi.
app.folder_notes_deleted = one: {name} klasörü ve içindeki not silindi. | other: {name} klasörü ve içindeki {n} not silindi.
app.folder_notes_deleted_journal = one: {name} klasörü ve içindeki not silindi. Günlüğe bununla ilgili bir satır eklendi. | other: {name} klasörü ve içindeki {n} not silindi. Günlüğe bununla ilgili bir satır eklendi.
app.moved_to = {folder} klasörüne taşındı.
app.no_move = Taşınamadı: {why}
app.moved_here = {project} projesinden buraya taşındı.
app.moved_here_journal = {project} projesinden buraya taşındı. O projenin günlüğüne bununla ilgili bir satır eklendi.
app.moved_to_project = {project} projesine, {folder} klasörüne taşındı.
app.moved_to_other = Diğer projeye, {folder} klasörüne taşındı.
app.copied_markdown = Markdown olarak kopyalandı.
app.note_gone = Not silindi.
app.no_copy = Kopyalanamadı: {why}
app.no_copy_browser = Kopyalanamadı: tarayıcı sayfanın kopyalamasına izin vermedi.
app.project_deleted = {name} silindi.
app.project_deleted_notes = one: {name}, notuyla birlikte silindi. | other: {name}, {n} notuyla birlikte silindi.
# {label} is where it is now: P/web-01.
app.machine_moved = {name} artık {project} projesinde, {label} olarak. Terminalleri çalışmaya devam ediyor.
app.no_rename = Yeniden adlandırılamadı: {why}
app.signed_out = Çıkış yaptın. Terminallerin çalışmaya devam ediyor.
app.no_sign_out = Çıkış yapılamadı: tTerm Web yanıt vermedi. Yeniden dene.
app.no_theme = Tema kaydedilemedi: tTerm Web yanıt vermedi.
app.no_language = Dil kaydedilemedi: tTerm Web yanıt vermedi.
app.no_tints = Proje renkleri kaydedilemedi: tTerm Web yanıt vermedi.
app.go_on_in_browser = Tarayıcında devam et: orada giriş yap ve bu bilgisayara izin ver.
app.open_sidebar = Kenar çubuğunu aç
app.no_project = Böyle bir proje yok
app.no_project_text = Artık projelerin arasında değil.
app.close_the_tab = Sekmeyi kapat
app.connection_lost = Bağlantı koptu. Yeniden bağlanılıyor; terminallerin çalışmaya devam ediyor.
app.cut_off.mac = <b>tTerm'e bağlantı yok.</b> Bu Mac her zamanki gibi çalışıyor. Sunuculardaki terminaller orada çalışmaya devam eder ve bağlantı gelince burada yeniden görünür.
app.cut_off.computer = <b>tTerm'e bağlantı yok.</b> Bu bilgisayar her zamanki gibi çalışıyor. Sunuculardaki terminaller orada çalışmaya devam eder ve bağlantı gelince burada yeniden görünür.
app.paste_busy = Bu terminalde bir komut çalışıyor, bu yüzden giriş satırı meşgul. Komut bitince yeniden dene.
app.paste_gone = {machine} artık tTerm Web'de değil. Başka bir yerde terminal aç ve komutu oradan o terminalin satırına aktar.
app.picker.placeholder = Herhangi bir projeden makine
# Tabs: their labels and the tips under the mouse. {label} is a terminal's: P/web-01 · 2.
app.tab.note = Not
app.tab.note_in = {folder} klasöründeki not
app.tab.close_note = Notu kapat. Not klasöründe kalır.
app.tab.project = Proje
app.tab.project_title = {name}: makineleri ve notları
app.tab.close_page = Sayfayı kapat
app.tab.terminal = Terminal
app.tab.away = {label}: {machine} uykuda ya da çevrimdışı, terminal onu bekliyor
app.tab.away_unknown = {label}: makinesi uykuda ya da çevrimdışı, terminal onu bekliyor
app.tab.ended = {label}: sonlandı
app.tab.running = {label}: bir komut çalışıyor
app.tab.close_terminal = Sekmeyi kapat. Terminal çalışmaya devam eder; kenar çubuğunda makinesinin altında durur.
# A machine's state, small, after its name in lists.
app.machine.no_connection = bağlantı yok
app.machine.offline = çevrimdışı
app.machine.offline_seen = çevrimdışı, {seen}
app.machine.online = çevrimiçi
# Search and the palette (⌘K): what it finds on the page, the lines under each, and the details beside.
app.search.state_away = bilgisayarını bekliyor
app.search.state_ended = sonlandı
app.search.state_busy = bir komut çalışıyor
app.search.state_prompt = komut bekliyor
app.search.this_tab = bu sekme
app.search.tab = sekme
app.search.no_tab = çalışıyor, sekmesi yok
app.search.row_machine = Makine
app.search.row_folder = Dizin
app.search.row_now = Şu an
app.search.row_in = Konum
app.search.row_edited = Düzenlendi
app.search.row_project = Proje
app.search.row_system = Sistem
app.search.row_address = Adres
app.search.row_status = Durum
app.search.row_terminals = Terminaller
app.search.row_code = Kod
app.search.row_does = Açıklama
app.search.open_count = one: {n} açık | other: {n} açık
# The button that does what was found.
app.search.open = Aç
app.search.open_note = Notu aç
app.search.open_page = Sayfasını aç
app.search.do_it = Uygula
# Search words: keep the English words, add the language's own after them.
app.search.terminal_words = terminal uçbirim
app.search.note_words = note not
app.search.project_words = project page folders proje sayfa klasörler klasör
# Things to do, in the palette: each with what it does, small, and its search words.
app.action.add_machine = Makine ekle
app.action.add_machine_hint = bir sunucu ya da bilgisayar
app.action.new_project_hint = kendi makineleri ve notlarıyla
app.action.edit_project = {name} projesini düzenle
app.action.edit_project_hint = ad, kod ve renk
app.action.new_folder_in = {name} projesinde yeni klasör
app.action.new_folder_hint = notlar için
app.action.close_tab = Bu sekmeyi kapat
app.action.close_tab_terminal = terminal çalışmaya devam eder
app.action.close_tab_note = not klasöründe kalır
app.action.rename_terminal = Bu terminale ad ver
app.action.rename_terminal_hint = numarası yerine
app.action.end_terminal = Bu terminali sonlandır
app.action.end_terminal_hint = kabuğu sonlanır
app.action.delete_note = Bu notu sil
app.action.delete_note_hint = {folder} klasöründen
app.action.theme_dark = Koyu temaya geç
app.action.theme_light = Açık temaya geç
app.action.settings_hint_local = tema, proje renkleri
app.action.settings_hint = tema, proje renkleri, cihazlar
app.action.sign_in_hint = sunucuların, projelerin ve ekibin
app.action.account_hint = ad, fotoğraf ve plan
app.action.sign_out_hint = bu tarayıcı seni unutur
# Search words: keep the English words, add the language's own after them.
app.action.add_machine_words = new server computer connect yeni sunucu bilgisayar bağla ekle makine
app.action.new_project_words = project new create make proje yeni oluştur yap
app.action.edit_project_words = project rename edit code color colour proje yeniden adlandır düzenle kod renk ad isim
app.action.new_folder_words = notes folder new create notlar klasör yeni oluştur
app.action.machines_words = machines home overview makineler ana sayfa genel bakış
app.action.close_tab_words = tab close sekme kapat
app.action.rename_terminal_words = terminal rename name label uçbirim yeniden adlandır ad isim etiket
app.action.end_terminal_words = terminal end stop kill exit shell uçbirim sonlandır durdur öldür çık kapat kabuk
app.action.delete_note_words = note delete remove not sil kaldır
app.action.theme_words = theme dark light colours colors tema koyu açık renkler renk
app.action.pin_words = sidebar panel pin kenar çubuğu sabitle
app.action.settings_words_local = settings preferences theme dark light colors colours support ayarlar tercihler tema koyu açık renkler destek
app.action.settings_words = settings preferences theme dark light colors colours devices quick code forget browsers support ayarlar tercihler tema koyu açık renkler cihazlar hızlı kod unut tarayıcılar destek
app.action.sign_in_words = sign in log in login account cloud servers giriş yap oturum aç hesap bulut sunucular
app.action.account_words = account profile name photo picture avatar plan limits delete hesap profil ad isim fotoğraf resim plan sınırlar sil
app.action.sign_out_words = sign out log out logout leave switch account çıkış yap oturumu kapat ayrıl hesap değiştir
# A folder: made, or named again.
app.folder.new_title = {name} projesinde yeni klasör
app.folder.rename_title = Klasörü yeniden adlandır
app.folder.create = Klasör oluştur
app.folder.new_help_alone = Yalnızca sen görürsün. Sonra klasörün yanındaki + ilk notu başlatır.
app.folder.new_help = {name} projesindeki herkes onu görür ve içine not yazabilir. Sonra klasörün yanındaki + ilk notu başlatır.
app.folder.rename_help_alone = Yalnızca sen görürsün.
app.folder.rename_help = {name} projesindeki herkes yeni adı hemen görür. İçindeki notlar olduğu gibi kalır.
# Asked before it is done.
app.remove.title = {name} makinesi kaldırılsın mı?
app.remove.confirm = {name} makinesini kaldır
app.remove.text = tTerm Web'den kaybolur ve terminalleri sonlanır. Orada yazılan komutlar geçmişte kalır.
app.remove.computer = Bilgisayardaki ajan, makinenin kaldırıldığını öğrenir ve durur. Bilgisayarı yeniden bağlamak için: Makine ekle, ardından Bilgisayar.
app.remove.server = tTerm Web ona giriş yapmayı bırakır ve erişimini sunucunun kendisinde geri alır. Sunucu yanıt vermezse bunun için gereken komut ardından gösterilir.
app.end.title = {label} terminali sonlandırılsın mı?
app.end.confirm = Terminali sonlandır
app.end.text = Kabuğu sonlanır ve içinde çalışan her şey durur, tıpkı bir terminal penceresi kapatıldığında olduğu gibi. Çalıştırdığı komutlar sekmesinde ve geçmişte kalır.
app.delete_note.title = {title} notu silinsin mi?
app.delete_note.sub = {folder} klasöründe.
app.delete_note.confirm = Notu sil
app.delete_note.alone = Kalıcı olarak silinir.
app.delete_note.shared = {project} projesindeki herkes notu kaybeder, şu anda açık tutanlar da. Günlükte bir satır kalır: kimin ve ne zaman sildiği.
app.delete_folder.title = {name} klasörü silinsin mi?
app.delete_folder.confirm = Klasörü sil
app.delete_folder.confirm_notes = one: Klasörü ve {n} notu sil | other: Klasörü ve {n} notu sil
app.delete_folder.empty = Klasör boş.
# {names} is the notes' titles, listed: Plan, Ideas and 3 more.
app.delete_folder.notes_go = one: İçindeki not da onunla birlikte silinir: {names}. | other: İçindeki {n} not da onunla birlikte silinir: {names}.
app.delete_folder.shared = {project} projesindeki herkes onları kaybeder, şu anda birini açık tutanlar da. Günlükte bir satır kalır: klasörü kimin ve ne zaman sildiği.
app.delete_folder.keep = Bir notu saklamak için önce taşı: notun yanındaki ⋯, ardından başka bir klasör.

# ------------------------------------------------------------ api: what the page says when tTerm Web gives no reason (api.ts)
api.note_changed = Not bu arada başka bir yerde değişti.
api.sign_in = Devam etmek için giriş yap.
# {status} is the HTTP status: 502.
api.answered = tTerm Web'in yanıtı: {status}
api.confirm_first = Önce sen olduğunu doğrula.
api.account_changed = Şu anda başka bir hesapla giriş yapılmış.

# ------------------------------------------------------------ app_link: the apps for computers, as the site names them (appLink.ts)
app_link.mac = Mac için tTerm
app_link.windows = Windows için tTerm
app_link.linux = Linux için tTerm

# ------------------------------------------------------------ add_machine: the window that adds a server or a computer to a project (AddMachine.tsx)
# When the browser does not let the page copy the command.
add_machine.copy_failed = Kopyalanamadı: komutu seç ve elle kopyala.
# How long the command works, inside add_machine.hint_computer and add_machine.hint_server as {works}.
add_machine.works_once = one: Önümüzdeki {n} dakika içinde bir kez çalışır. | other: Önümüzdeki {n} dakika içinde bir kez çalışır.
add_machine.title = Makine ekle
# Before the list of the projects the machine can go to.
add_machine.to_project = Hedef proje
# The two buttons Server and Computer, for screen readers.
add_machine.kind = Makine türü
add_machine.server = Sunucu
add_machine.computer = Bilgisayar
# Step 1 for a computer, above the command.
add_machine.run_computer = Bunu bilgisayarda çalıştır
# Under the command. {works} is add_machine.works_once; sudo stays as it is.
add_machine.hint_computer = O bilgisayardaki bir terminalde, sudo ile değil, kendi kullanıcınla çalıştır. {works} Ajan bundan sonra kendini günceller. Daha sonra çalıştırılan yeni bir komut onu yeniden kurar: bilgisayar olduğu gibi kalır, açık terminalleri sonlanır.
# A fold under the command, for trying an agent that is not released yet.
add_machine.by_hand = Ya da ajanı elle başlat
# {version} is the agent's version: 0.11.0. tterm-agent, Python and websockets are names: they stay as they are.
add_machine.by_hand_hint = tterm-agent {version} veya daha yeni bir kopyadan, websockets paketi kurulu bir Python ile. Henüz yayımlanmamış bir ajanı denemek için: terminal penceresi açık kaldığı sürece çalışır ve token bilgisayarın anahtarı olur.
# Step 2, while the window waits for the machine.
add_machine.keep_open = Bu pencereyi açık tut
# A fold: what the command for a computer does, point by point.
add_machine.what_command = Komut ne yapar
# {folder} is ~/.tterm-web, {bot_folder} ~/.tterm; launchd and systemd are names: they stay as they are.
add_machine.what_command_puts = tTerm'in ajanını {folder} içine koyar: ajan, tTerm'in yayımladığı sürümlerden bu sisteme uygun tek bir dosyadır ve çalışmadan önce komutun betiğindeki sağlama toplamıyla doğrulanır. Ajanı her oturum açtığında başlatır (macOS'te launchd, Linux'ta systemd). {bot_folder} içindeki tTerm bot ajanı, varsa, olduğu gibi kalır.
add_machine.what_command_updates = Ajan kendini yalnızca tTerm'in sürüm derlemesi tarafından imzalanmış sürümlere ve yalnızca bu bilgisayarda açık terminal yokken günceller.
add_machine.what_command_key = Bu bilgisayar için kendine ait bir anahtar oluşturur ve onu yalnızca senin okuyabileceğin şekilde orada saklar. Komuttaki token yalnızca katılmasını sağlar, o da bir kez.
# root is the name of the system's administrator: it stays as it is.
add_machine.what_command_runs = Ajan asla root olarak değil, senin kullanıcınla çalışır ve hiçbir port açmaz: dışarıya, tTerm Web'e bağlanır ve bu tek bağlantıyı açık tutar. Buradaki her terminal, orada senin bir kabuğundur.
# {command} is ~/.tterm-web/uninstall.sh.
add_machine.what_command_uninstall = {command} hepsini kaldırır.
# Step 1 for a server, above the command.
add_machine.run_server = Bunu sunucuda çalıştır
# Under the command. {works} is add_machine.works_once; root and sudo stay as they are.
add_machine.hint_server = {works} Komutu root olarak ya da sudo yetkisi olan herhangi bir kullanıcıyla çalıştır.
# A fold: what the script for a server does, point by point.
add_machine.what_script = Betik ne yapar
# Here and in the next two, tterm in small letters is the name of the user the script makes on the server: it stays as it is, as sudo and sshd_config do.
add_machine.what_script_user = Parolasız tterm kullanıcısını oluşturur. tTerm botu onu daha önce oluşturduysa aynı kullanıcı kullanılır.
add_machine.what_script_certificates = tTerm Web'in, iki dakika geçerli olan ve yalnızca bu sunucu için üretilen sertifikalarla tterm olarak giriş yapmasını sağlar. Sunucuda hiçbir anahtar kalmaz.
add_machine.what_script_sudo = Sunucuyu yönetebilmen için tterm kullanıcısına sudo yetkisi verir. Tek bir komut bunu geri alır.
add_machine.what_script_safe = sshd_config dosyasına asla dokunmaz ve hiçbir port açmaz. İki kez çalıştırmak güvenlidir.
# {name} is the machine's name.
add_machine.connected = {name} bağlandı
# After the machine's system and host: Ubuntu 24.04 · web-01 · in tabs it reads P/web-01.
add_machine.tabs_label = sekmelerde {label} olarak görünür
add_machine.open_terminal = Terminal aç
add_machine.add_another = Başka bir makine ekle
# {why} is what went wrong, as tTerm Web said it.
add_machine.no_command = Komut oluşturulamadı: {why}
add_machine.expired_token = Süresi doldu: bu token 10 dakika geçerlidir.
add_machine.expired_command = Süresi doldu: bu komut 10 dakika geçerlidir.
add_machine.new_command = Yeni komut al
add_machine.failed_computer = Bilgisayar eklenemedi.
add_machine.failed_server = Sunucu doğrulanamadı.
add_machine.still_works = Aynı komut hâlâ geçerli: sorunu düzelt ve yeniden çalıştır.
# While the window waits: the agent or the server has called in, or not yet.
add_machine.agent_in = Ajan bağlandı. Bilgisayarın bilgileri okunuyor…
add_machine.server_in = Sunucu haber verdi. Doğrulamak için giriş yapılıyor…
add_machine.waiting_agent = Ajan bekleniyor…
add_machine.waiting_server = Sunucu bekleniyor…
# {project} is the project's name; the _unnamed ones are for when it is not known.
add_machine.appears_computer = Komut bittikten birkaç saniye sonra {project} projesinde görünür.
add_machine.appears_computer_unnamed = Komut bittikten birkaç saniye sonra projede görünür.
add_machine.appears_server = Betik biter bitmez {project} projesinde görünür, genellikle bir dakika içinde.
add_machine.appears_server_unnamed = Betik biter bitmez projede görünür, genellikle bir dakika içinde.

# ------------------------------------------------------------ signin: signing in with a code from email, and the quick code (SignIn.tsx)
# When the server does not answer at all.
signin.no_answer = Sunucu yanıt vermiyor. Bağlantını kontrol et ve yeniden dene.
signin.email_lead = E-posta adresini gir, sana bir kod gönderelim
# The field for the address, for screen readers.
signin.email = E-posta
# The button, while the code is being sent.
signin.sending = Gönderiliyor…
signin.get_code = Kod al
signin.new_here = Burada yeni misin? Hesabını koddan sonra oluşturursun.
signin.code_resent = Yeni bir kod yolda. Önceki kod artık geçerli değil.
signin.code_title = Kodu gir
# {email} is the address the code went to.
signin.code_sent = Kodu <b>{email}</b> adresine gönderdik
# The field for the code, for screen readers.
signin.code_label = E-postadaki kod
# A link that counts the seconds down until another code may be sent: New code in 42 s.
signin.resend_in = one: {n} sn sonra yeni kod | other: {n} sn sonra yeni kod
signin.resend = Yeni kod gönder
signin.change_email = E-postayı değiştir
signin.no_email = E-posta gelmedi mi? Spam klasörüne bak.
signin.signup_title = Hesabını oluştur
# The field for one's name, and the words in it while it is empty.
signin.your_name = Adın
# The one tick of signing up. <terms> and <privacy> are links to the site's two documents: their names as the site has them in the language.
signin.agree = <terms>Hizmet Şartları</terms>'nı ve <privacy>Gizlilik Politikası</privacy>'nı kabul ediyorum
# The button, while the account is being made.
signin.creating = Oluşturuluyor…
signin.create = Hesap oluştur
signin.another_email = Başka bir e-posta kullan
# A quick code is four digits that sign one in on this device.
signin.pin_easy = Tahmin edilmesi çok kolay: hepsi aynı olmayan ve ardışık gitmeyen rakamlar seç.
signin.pin_mismatch = Kodlar eşleşmedi. Yeniden oluştur.
# {name} is the person's first name: Welcome for an account made just now, Hello for one there before.
signin.welcome = Hoş geldin, {name}!
signin.hello = Merhaba, {name}!
# The quick code, typed a second time.
signin.pin_repeat = Kodu tekrarla
signin.pin_repeat_lead = Aynı dört rakamı bir kez daha gir
signin.pin_offer_lead = Bu cihaz için bir hızlı kod oluştur
# The field for the quick code, for screen readers: the second time, the first time.
signin.pin_repeat_label = Hızlı kod, bir kez daha
signin.pin_offer_label = Hızlı kod
# The link that goes on without a quick code.
signin.not_now = Şimdi değil
# {name} is the person's first name.
signin.welcome_back = Yeniden hoş geldin, {name}!
signin.pin_lead = Hızlı kodunu gir
# The field for the quick code, for screen readers.
signin.pin_label = Hızlı kod
signin.forgot = Kodu mu unuttun?
signin.switch = Hesap değiştir

# ------------------------------------------------------------ connect: in the browser, allowing tTerm for the computer to sign in (Connect.tsx)
connect.no_answer = tTerm yanıt vermiyor. Bağlantını kontrol et ve bu sayfayı yeniden yükle.
# {app} is app_link.*: tTerm for Mac. Also the page's title in the browser.
connect.allow_title = {app}'e izin verilsin mi?
# The address the app opened is cut short.
connect.incomplete = Bu bağlantı eksik
# Sign in with your browser is the app's button: the words of app_signin.browser.
connect.start_again = Bilgisayarındaki tTerm'de baştan başla: Tarayıcınla giriş yap.
# Above signing in, after Allow. {app} is app_link.*: tTerm for Mac.
connect.confirm = {app}'e izin vermek için sen olduğunu doğrula.
connect.signin_other = Diğer hesapla giriş yap, ardından {app}'e izin ver.
connect.signin_then = Giriş yap, ardından {app}'e izin ver.
connect.no_connection = Bağlantı yok
# {computer} is the name of the computer the app runs on, {email} the account's address.
connect.asks = <b>{computer}</b> üzerindeki uygulama, {email} hesabına giriş yapmak için izin istiyor.
# Above the code that both this page and the app show.
connect.check = Uygulamanın aynı kodu gösterdiğini kontrol et
# The button.
connect.allow = İzin ver
connect.another = Sen değil misin? Başka bir hesap kullan
# Personal is the name of one's own project: it stays as it is. Settings and Devices are the page and its section, in the words of settings.title and devices.title.
connect.small = Bilgisayar, Personal projesinde bir makine olur. Uygulama Ayarlar'da, Cihazlar bölümünde görünür; onu oradan unutabilirsin.
# While the browser goes back to the app. {app} is app_link.*: tTerm for Mac.
connect.back = {app}'e dönülüyor…
connect.takes_over = Bundan sonrasını bu bilgisayarda uygulama halleder.

# ------------------------------------------------------------ app_signin: in tTerm for the computer, signing in with the browser (AppSignIn.tsx)
# The app's first screen, for screen readers.
app_signin.welcome_label = Hoş geldin
app_signin.welcome_title = tTerm'e hoş geldin
app_signin.welcome_lead = Bu bilgisayarın terminalleri hemen çalışır, hesap gerekmez.
# The button: the app opens the browser, to sign in there.
app_signin.browser = Tarayıcınla giriş yap
# The button: not now, sign in later.
app_signin.later = Daha sonra
app_signin.welcome_note = Giriş yaptığında sunucuların, projelerin, notların ve ekibin bu pencereye gelir. Bunu istediğin zaman kenar çubuğunun altından yapabilirsin.
app_signin.cancelled = Giriş tarayıcıda iptal edildi.
# The title of the window that waits while one signs in in the browser.
app_signin.link_title = Tarayıcınla giriş yap
# {host} is app.tterm.net. The code comes under it.
app_signin.link_note = tTerm, tarayıcında {host} adresini açtı. Orada giriş yap ve sayfa sorduğunda bu bilgisayara izin ver. Sayfa da bu kodu gösterir:
app_signin.until_then = O zamana kadar bu bilgisayar eskisi gibi çalışır.
app_signin.open_again = Sayfayı yeniden aç

# ------------------------------------------------------------ welcome: the first screen, while nothing is connected yet (Welcome.tsx)
# {name} is the person's first name.
welcome.title = tTerm'e hoş geldin, {name}
welcome.lead = Sunucularına ve bilgisayarlarına açılan bir terminal, doğrudan tarayıcıda. Bu bilgisayara kurulacak bir şey yok, kopyalanacak anahtar yok, açılacak port yok.
welcome.connect = İlk makineni bağla
# The two cards: the kinds of machine to connect.
welcome.server = Sunucu
welcome.server_note = SSH ile eriştiğin bir VPS ya da bulut sunucu. Üzerinde tek bir komut çalıştır, hemen burada görünür.
# Small labels under the cards: Linux, One command; macOS, Linux, No open ports.
welcome.one_command = Tek komut
welcome.computer = Bilgisayar
welcome.computer_note = Evde ya da ofiste, NAT arkasında bile olsa bir Mac ya da Linux makine. Küçük bir ajan onu bağlı tutar.
welcome.no_ports = Açık port yok
# The three steps below, for screen readers.
welcome.how = Nasıl çalışır
welcome.step_add = Makine ekle
welcome.step_add_text = Üzerinde tek bir komut çalıştır. Komut 10 dakika içinde bir kez çalışır.
welcome.step_open = Terminal aç
welcome.step_open_text = Her komut bir blok olur: kopyala, yeniden çalıştır, bağlantısını paylaş.
welcome.step_team = Ekibini davet et
welcome.step_team_text = Roller, ortak bir günlük; kimin izlediğini de her zaman görürsün.
# {project} is the project's name and {code} its code: P. In {code}/name, name stands for a machine's name, as in P/web-01.
welcome.footnote = İlk projen {project} hazır, kodu {code}: makineleri sekmelerde {code}/ad olarak görünür.

# ------------------------------------------------------------ need_account: New project and Add machine in the app before signing in (NeedAccount.tsx)
need_account.machine_title = Makine ekle
need_account.machine_note = Sunucular ve diğer bilgisayarlar için bir tTerm hesabı gerekir. Henüz hesabın yoksa giriş yaptığında bir hesap oluşturulur.
need_account.server = Sunucu
need_account.server_text = SSH ile eriştiğin bir VPS ya da bulut sunucu. Üzerinde tek bir komut çalıştır, hemen burada görünür.
need_account.computer = Bilgisayar
need_account.computer_text = Evde ya da ofiste, NAT arkasında bile olsa bir Mac ya da Linux makine.
# What the Free plan gives. {machines} is need_account.plan_machines, {terminals} need_account.plan_terminals.
need_account.machine_plan = En fazla {machines} ve {terminals}.
# In need_account.machine_plan, after "Up to": in the form the words take there.
need_account.plan_machines = one: {n} makine | other: {n} makine
need_account.plan_terminals = one: {n} açık terminal | other: {n} açık terminal
need_account.machine_stays = Bu bilgisayar, terminalleriyle birlikte olduğu gibi kalır.
need_account.project_title = Yeni proje
need_account.project_note = Daha fazla proje için bir tTerm hesabı gerekir. Henüz hesabın yoksa giriş yaptığında bir hesap oluşturulur.
need_account.personal = Kişisel projeler
need_account.personal_text = Yalnızca sen. Makineleri, terminalleri ve notları yalnızca sana ait.
need_account.shared = Ortak projeler
# A small label on Shared projects: they are not there yet.
need_account.soon = Yakında
need_account.shared_text = Ekibinle. Kişileri sen davet edersin: projenin makinelerinde terminal açar, notlarını düzenlerler.
need_account.project_plan = Her biri kendi makineleri, terminalleri ve notlarıyla, sana ait projeler. Ekiple ortak projeler yakında.
# Personal is the name of one's own project: it stays as it is.
need_account.project_stays = Personal projesi, içindeki bu bilgisayar, terminalleri ve notlarıyla olduğu gibi kalır.
# The button that closes the window.
need_account.not_now = Şimdi değil

# ------------------------------------------------------------ updates: tTerm for Mac updating itself, only in the app (Updates.tsx)
# The title of Restart to update in the top bar. {version} is the new version: 0.5.1.
updates.pill_title.mac = tTerm {version} hazır. Yeniden başlatma birkaç saniye sürer; bu Mac'te terminaller çalışıyorsa tTerm önce sorar.
updates.pill_title.computer = tTerm {version} hazır. Yeniden başlatma birkaç saniye sürer; bu bilgisayarda terminaller çalışıyorsa tTerm önce sorar.
updates.restarting = Yeniden başlatılıyor…
# A button, in the top bar and in Settings: tTerm restarts and the new version goes in.
updates.restart_to_update = Yeniden başlat ve güncelle
# The card above the account in the sidebar, and Settings. {version} is the new version.
updates.ready = tTerm {version} hazır
updates.restart_takes = Yeniden başlatma birkaç saniye sürer.
# The card's button.
updates.restart = Yeniden başlat
# A link to the notes of the new version.
updates.whats_new = Yenilikler
# Once, after the restart. {version} is the version now: 0.5.1.
updates.updated = tTerm, {version} sürümüne güncellendi
# Settings, Updates: the two ways tTerm takes a new version.
updates.auto = Otomatik güncelle
updates.auto_text.mac = Yeni sürüm tTerm'den çıkılırken yüklenir; tTerm menü çubuğundayken ve penceresi kapalıyken ise bu Mac'te hiçbir şey çalışmadığı anda yüklenir.
updates.auto_text.computer = Yeni sürüm tTerm'den çıkılırken yüklenir; tTerm menü çubuğundayken ve penceresi kapalıyken ise bu bilgisayarda hiçbir şey çalışmadığı anda yüklenir.
updates.ask = Önce bana sor
# "Restart to update" is the button (updates.restart_to_update): the same words.
updates.ask_text = Yeni sürüm, sen Yeniden başlat ve güncelle düğmesine basana kadar bekler.
# The section of Settings.
updates.title = Güncellemeler
updates.about = Mac için tTerm, kendini tTerm'in yayımladığı sürümlerle günceller. Yalnızca tTerm tarafından imzalanmış bir sürüm yüklenir.
# For screen readers: the two ways above.
updates.how = tTerm nasıl güncellenir
# Beside Update by itself.
updates.recommended = Önerilen
updates.checking = Yeni sürüm aranıyor…
# {version} is the new version.
updates.downloading = tTerm {version} indiriliyor…
# {version} is the version this app is; {day} is today, yesterday or on 12 Oct (time.today, time.yesterday, time.on_day); {time} is 10:02.
updates.you_have_downloaded = Şu anki sürümün {version}; yenisi {day} indirildi ({time}).
updates.you_have = Şu anki sürümün {version}.
# {version} is the new version; why it failed comes under it, as tTerm says it.
updates.failed = {version} sürümüne güncellenemedi
# {site} is tterm.net. Applications is the folder of the Mac: as macOS names it in the language.
updates.download = Ya da tTerm'i <link>{site}</link> adresinden indir ve Uygulamalar klasörüne sürükle.
# A button: tTerm moves itself from the disk image to Applications.
updates.move = Uygulamalar klasörüne taşı
# {ago} is when tTerm last looked: just now, 5 min ago, 2 h ago, yesterday, on 12 Oct (time.*).
updates.looked = tTerm {version} güncel. En son {ago} denetlendi.
updates.this_is = Şu anki sürümün tTerm {version}.
# A button: look for a new version now.
updates.check_now = Şimdi denetle

# ------------------------------------------------------------ account: the name, the photo and the plan (Account.tsx)
# The file chosen for one's photo is none.
account.not_a_photo = Bu dosya, tTerm'in kabul ettiği bir fotoğraf değil. En fazla 5 MB boyutunda bir JPEG, PNG ya da WebP seç.
# What the plan allows, after "Up to" (account.up_to): Up to 50 machines and 24 open terminals.
account.limit_machines = one: {n} makine | other: {n} makine
account.limit_terminals = one: {n} açık terminal | other: {n} açık terminal
# {limits} is one or both of the two above, as a list.
account.up_to = En fazla {limits}
account.no_limits = Sınır yok
# A meter of the plan, beside its label (Machines, Open terminals): 3 of 50.
account.used_of = {used} / {limit}
account.used_no_limit = {used}, sınır yok
# The title of Close at the top of Account and Settings.
account.close_title = Geldiğin yere dön
account.photo_removed = Fotoğraf kaldırıldı: baş harflerin geri geldi.
# For screen readers: the card with one's name and photo.
account.profile = Profil
account.change_photo = Fotoğrafı değiştir
account.add_photo = Fotoğraf ekle
account.your_name = Adın
account.saving = Kaydediliyor…
account.edit_name = Adı düzenle
account.remove_photo = Fotoğrafı kaldır
# Under the photo's buttons: what the photo is for.
account.photo_hint = Adının yanında, baş harflerinin yerine görünür.
# For screen readers: the file chooser for the photo.
account.choose_photo = Fotoğraf seç
# Under one's email address. {email} is support's address.
account.address_note = Bu adresle giriş yaparsın. Değiştirmek için <link>{email}</link> adresine yaz.
# The section of the plan; its name (Free) stays as it is.
account.plan = Plan
account.plan_note = tTerm biz geliştirirken ücretsiz. Diğer planlar burada görünecek; bir şey değişmeden önce sana haber vereceğiz.
# The labels of the plan's two meters.
account.machines = Makineler
account.open_terminals = Açık terminaller
account.photo_saved = Fotoğrafın yüklendi: kenar çubuğunun altında ve menüsünde görünür.
# {email} is support's address.
account.delete_note = Hesabını silmek için giriş yaptığın adresten {email} adresine yaz.

# ------------------------------------------------------------ devices: where one is signed in, in Settings (Devices.tsx)
# On the sign-in screen, after this very device was forgotten.
devices.this_forgotten = Bu cihaz unutuldu. E-postayla gelen bir kodla giriş yap.
# {device} is a device's label: tTerm for Mac on MacBook-Pro. tTerm there now works with that computer only, as before signing in.
devices.app_signed_out = {device} için çıkış yapıldı: tTerm orada artık yalnızca o bilgisayarla çalışır.
# {device} is a device's label: Chrome on macOS.
devices.forgotten = {device} unutuldu: orada yeniden e-postayla gelen bir kod gerekecek.
# On the sign-in screen.
devices.all_forgotten = Tüm cihazlar unutuldu. Artık her biri e-postayla gelen bir kodla giriş yapar.
devices.about = Hızlı kodunla giriş yaptığın tarayıcılar ve bilgisayarlarında tarayıcıyla giriş yapmış tTerm uygulamaları. Bunların dışındaki her yerde e-postayla gelen bir kod gerekir.
devices.idle = 8 saat boyunca hiçbir işlem yapılmazsa tTerm hızlı kodu yeniden sorar. Terminallerin çalışmaya devam eder.
devices.none = Hatırlanan tarayıcı yok. Her girişte e-postayla gelen bir kod gerekir.
# A mark beside the device one uses now.
devices.this_device = Bu cihaz
# Under a device's label. {created} and {used} are how long ago: just now, 3 minutes ago, 2 days ago (time.ago_*).
devices.app_times = Giriş yapıldı: {created}, son kullanım: {used}
devices.browser_times = Eklendi: {created}, son giriş: {used}
# A button beside each device.
devices.forget = Unut
# The heading, and the red button that does it.
devices.forget_all = Tüm cihazları unut
devices.forget_all_text = Tüm cihazlar unutulur ve bu dahil tüm oturumlar sona erer. Ardından her tarayıcı e-postayla gelen bir kod ister. Terminallerin çalışmaya devam eder.
# The button that asks first.
devices.forget_all_ask = Tüm cihazları unut…

# ------------------------------------------------------------ this_computer: the computer the app runs on, in Settings (ThisComputer.tsx)
# How the link to tTerm Web is, under the switch. {name} is the name tTerm Web knows this computer by.
this_computer.online_terminals = one: tTerm Web'de {name} olarak çevrimiçi · oradan açılan {n} terminal | other: tTerm Web'de {name} olarak çevrimiçi · oradan açılan {n} terminal
this_computer.online = tTerm Web'de {name} olarak çevrimiçi
this_computer.connecting = tTerm Web'e bağlanılıyor…
this_computer.waiting = Henüz tTerm Web'e bağlı değil.
this_computer.no_network = Ağ yok. tTerm kendiliğinden yeniden dener.
# "Turn this on": the switch above.
this_computer.removed.mac = Bu Mac tTerm Web'den kaldırıldı, bu yüzden ona oradan erişilemiyor. Yeniden eklemek için bu ayarı aç.
this_computer.removed.computer = Bu bilgisayar tTerm Web'den kaldırıldı, bu yüzden ona oradan erişilemiyor. Yeniden eklemek için bu ayarı aç.
this_computer.closed.mac = Bu Mac'e şu anda tTerm Web'den erişilemiyor.
this_computer.closed.computer = Bu bilgisayara şu anda tTerm Web'den erişilemiyor.
# The section's title, on a Mac too.
this_computer.title = Bu bilgisayar
# {name} is this computer's machine in tTerm, {project} its project.
this_computer.about = {name}, {project} projesinde. Terminalleri burada, internet olmadan da çalışır.
# The switch.
this_computer.open = tTerm Web'den ve telefonundan erişime izin ver
this_computer.open_text.mac = tTerm burada çalıştığı sürece tTerm Web ve telefonun bu Mac'te terminal açabilir: penceresi kapalıyken menü çubuğunda kalır ve oturum açtığında başlar. Ayar kapalıyken tTerm Web'de bu Mac çevrimdışı görünür; burada her şey eskisi gibi çalışır.
this_computer.open_text.computer = tTerm burada çalıştığı sürece tTerm Web ve telefonun bu bilgisayarda terminal açabilir: penceresi kapalıyken menü çubuğunda kalır ve oturum açtığında başlar. Ayar kapalıyken tTerm Web'de bu bilgisayar çevrimdışı görünür; burada her şey eskisi gibi çalışır.
# Asked before the switch goes off while terminals opened from tTerm Web run here.
this_computer.ask_title.mac = Bu Mac'e tTerm Web'den erişim kapatılsın mı?
this_computer.ask_title.computer = Bu bilgisayara tTerm Web'den erişim kapatılsın mı?
# The red button.
this_computer.turn_off = Erişimi kapat
this_computer.ask_text.mac = one: tTerm Web'den bu Mac'te açılan {n} terminal sonlanacak ve bu Mac orada çevrimdışı olacak. | other: tTerm Web'den bu Mac'te açılan {n} terminal sonlanacak ve bu Mac orada çevrimdışı olacak.
this_computer.ask_text.computer = one: tTerm Web'den bu bilgisayarda açılan {n} terminal sonlanacak ve bu bilgisayar orada çevrimdışı olacak. | other: tTerm Web'den bu bilgisayarda açılan {n} terminal sonlanacak ve bu bilgisayar orada çevrimdışı olacak.

# ------------------------------------------------------------ photo: one's photo, cut to a circle (PhotoDialog.tsx)
# The photo could not be made here, in the browser.
photo.browser_failed = Tarayıcı fotoğrafı hazırlayamadı.
photo.no_answer = tTerm yanıt vermedi. Yeniden dene.
# The dialog's title.
photo.title = Fotoğrafın
# For screen readers: the photo in its frame, which the arrow keys move and + and - zoom.
photo.frame = Daire içindeki fotoğrafın. Sürükle ya da ok tuşlarıyla kaydır; + ve - ile yakınlaştır ve uzaklaştır.
# The slider that makes the photo bigger in the circle.
photo.zoom = Yakınlaştırma
photo.drag = Fotoğrafı daireye yerleştirmek için sürükle.
# Beside the photo in three small sizes.
photo.preview = Başkalarının gördüğü gibi
photo.note = En fazla 5 MB boyutunda JPEG, PNG ya da WebP. tTerm 256 piksellik bir kopya saklar; fotoğrafa gömülü bilgileri, örneğin nerede çekildiğini saklamaz.
photo.saving = Kaydediliyor…
photo.save = Fotoğrafı kaydet

# ------------------------------------------------------------ confirm: asking before what cannot be undone (Confirm.tsx)
confirm.no_answer = tTerm Web yanıt vermedi.
confirm.copy_failed = Kopyalanamadı: komutu seç ve elle kopyala.
# After a server is removed. {name} is the server's name.
confirm.removed = {name} kaldırıldı
# The command that takes the access back comes after it.
confirm.removed_text = tTerm Web artık onu listelemiyor ve ona giriş yapmıyor. Sunucu yanıt vermediği için tTerm Web'in oradaki erişimi, sen orada geri alana kadar duruyor:
# {user} is the server's user tterm; {command} is the command that removes it and its sudo rule.
confirm.user_stays = {user} kullanıcısı ve sudo kuralı, kullanıyorsan tTerm botu için yerinde kalır. Onları da kaldırmak için: {command}

# ------------------------------------------------------------ project_dialog: the windows of projects of one's own (ProjectDialog.tsx)
project_dialog.code_invalid = Kod 1 ila 4 harf ya da rakamdan oluşur.
# When saving or moving failed and tTerm Web gave no reason.
project_dialog.no_answer = tTerm Web yanıt vermedi.
project_dialog.edit_title = Projeyi düzenle
project_dialog.new_title = Yeni proje
# Under the title, editing a project others are in: its name, code and color.
project_dialog.edit_sub = Bunları proje sahibi ve yöneticiler değiştirir.
project_dialog.new_sub = Bir proje, diğer projelerinden ayrı olarak kendi makinelerini ve notlarını tutar.
# The label of the project's name.
project_dialog.name = Ad
# In the empty name field: an example of a project's name.
project_dialog.name_example = Örneğin Müşteri X
# The label of the project's code: the 1 to 4 letters or digits on its badge.
project_dialog.code = Kısa kod
project_dialog.code_help_alone = 1 ila 4 harf ya da rakam. Kod, projeyi sekmelerde ve kenar çubuğunda işaretler.
project_dialog.code_help_shared = 1 ila 4 harf ya da rakam. Kod, projeyi sekmelerde ve kenar çubuğunda, projedeki herkes için aynı anda işaretler.
project_dialog.code_help_new = Kod addan üretilir, istersen değiştirebilirsin: 1 ila 4 harf ya da rakam. Projeyi sekmelerde ve kenar çubuğunda işaretler.
# The label of the project's colors.
project_dialog.color = Renk
# "Whole project" and "Settings" are named as the choice and the page are (settings.tint_block, settings.title).
project_dialog.color_help_new = Renk, diğer projelerinden farklı olacak şekilde seçilir; istersen değiştirebilirsin. Kod rozetini doldurur; Ayarlar'da Tüm proje seçeneğini seçersen kenar çubuğunda projenin tamamını da renklendirir.
project_dialog.color_help_alone = Renk kod rozetini doldurur; Ayarlar'da Tüm proje seçeneğini seçersen kenar çubuğunda projenin tamamını da renklendirir.
project_dialog.color_help_shared = Renk, projedeki herkes için kod rozetini doldurur; kendi Ayarlar'ında Tüm proje seçeneğini seçenler için kenar çubuğunda projenin tamamını da renklendirir.
# Above how the project will look in the sidebar and on a tab (a noun).
project_dialog.preview = Önizleme
# In the preview, in place of the project's name while none is typed.
project_dialog.preview_name = Proje
project_dialog.new_next = Projenin sahibi sensin. Ardından bir makine ekler ya da başka bir projeden taşırsın ve notlar yazarsın.
project_dialog.create = Proje oluştur
# The title of the window that moves a machine to another project: {machine} is its name.
project_dialog.move_title = {machine} makinesini taşı
project_dialog.move_sub = Sahibi olduğun başka bir projeye.
# Next to each project one may move to: whether others are in it.
project_dialog.only_you = yalnızca sen
project_dialog.with_others = başkalarıyla
# {project} is the project it goes to, {code} that project's code, {name} the machine's name there: CX/web-01.
project_dialog.move_becomes = {project} projesinde {code}/{name} olur. Terminalleri çalışmaya devam eder, makinenin kendisinde hiçbir şey değişmez.
# The same, when its name is taken there: {machine} is its name now, {name} the one it gets (web-01-2).
project_dialog.move_becomes_taken = {project} projesinde {code}/{name} olur: {machine} adı orada kullanılıyor. Terminalleri çalışmaya devam eder, makinenin kendisinde hiçbir şey değişmez.
# The button: {project} is the project's name.
project_dialog.move_to = {project} projesine taşı
# The button while there is nothing to pick (a verb).
project_dialog.move = Taşı
# Next to a folder one may move a note to: it has no notes.
project_dialog.folder_empty = boş
# Next to a project without folders: the note goes to a new folder there, named as its own.
project_dialog.folder_new = orada onun için oluşturulacak yeni bir klasör
# The title of the window that moves a note to another project: {note} is its title.
project_dialog.move_note_title = {note} notunu taşı
project_dialog.move_note_sub = Şu an {project} projesinde, {folder} klasöründe. Başka bir projede bir klasör seç.
# Who sees the note in the project it goes to.
project_dialog.note_alone = {project} projesinde onu yalnızca sen görürsün.
project_dialog.note_shared = {project} projesindeki herkes onu görür ve düzenler.
# {project} is the project the note leaves.
project_dialog.note_leaves = {project} projesindeki diğer herkes onu kaybeder. {project} projesinin günlüğünde bir satır kalır: kimin ve ne zaman dışarı taşıdığı.
# The ticks: the items of a checklist ticked off, each with who ticked it.
project_dialog.note_keeps = Başlığı, metni ve geçmişi onunla birlikte gider; işaretler de kimin koyduğu bilgisiyle birlikte gider.
# The button: {folder} is the name of the folder made there, the note's own folder's name.
project_dialog.move_to_new_folder = Yeni {folder} klasörüne taşı
project_dialog.move_to_folder = {folder} klasörüne taşı
project_dialog.delete_title = {project} projesi silinsin mi?
# A project with machines in it cannot be deleted yet: {machine} is its machine's name.
project_dialog.delete_machine_first = Önce makinesini taşı ya da kaldır: {machine}.
# {machines} is their names, listed: web-01, web-02 and db.
project_dialog.delete_machines_first = Önce makinelerini taşı ya da kaldır: {machines}.
# "Move to another project" and "Remove machine" are the items of a machine's ⋯ menu (projectpage.move_machine, projectpage.remove_machine).
project_dialog.delete_how = Proje sayfasında bir makinenin yanındaki ⋯: Başka bir projeye taşı ya da Makineyi kaldır. Ardından proje silinebilir.
project_dialog.cant_undo = Bu işlem geri alınamaz.
# {n} is how many folders the project has; {notes} is project_dialog.delete_notes.
project_dialog.delete_folders = one: {notes} içeren {n} klasör de onunla birlikte silinir. | other: {notes} içeren {n} klasör de onunla birlikte silinir.
# How many notes are in those folders, inside project_dialog.delete_folders: 2 folders with 5 notes are deleted with it.
project_dialog.delete_notes = one: {n} not | other: {n} not
project_dialog.delete_no_notes = Hiç notu yok.
# Above the field the project's name is typed in.
project_dialog.delete_type = Onaylamak için {project} yaz
# The button.
project_dialog.delete_button = {project} projesini sil

# ------------------------------------------------------------ projectpage: a project's page (ProjectPage.tsx)
# The end of the line under the project's name: 2 machines · 1 terminal open · you are the owner.
projectpage.role_owner = sahibi sensin
projectpage.role_admin = yöneticisin
projectpage.role_member = üyesin
projectpage.role_observer = izleyicisin
# A terminal busy with a command whose line is not known.
projectpage.command_running = Bir komut çalışıyor
# {duration} is how long the command has run: less than a minute, 3 minutes, an hour (time.for_*).
projectpage.running_for = {duration} çalışıyor
# The same, while it is not known how long.
projectpage.running = çalışıyor
# A terminal whose machine is away: {machine} is its name.
projectpage.waits_for = {machine} makinesini bekliyor
# Under a terminal's name being typed. Enter and Esc are the keys.
projectpage.rename_hint = Enter kaydeder, Esc iptal eder.
# On a terminal's name.
projectpage.double_click = Yeniden adlandırmak için çift tıkla
# The button next to a terminal: go to it (a verb).
projectpage.open = Aç
# An offline computer's state, next to its name: {ago} is how long ago (time.ago_*): Last seen 14 minutes ago.
projectpage.last_seen = En son {ago} görüldü
# A computer's state, next to its name.
projectpage.offline = Çevrimdışı
projectpage.online = Çevrimiçi
# On New terminal: {machine} is the machine's name.
projectpage.offline_title = {machine} çevrimdışı: uykuda ya da ajanı çalışmıyor
projectpage.new_terminal_title = {machine} üzerinde yeni terminal
# Said when New terminal is pressed on an offline computer: {seen} is time.last_seen: last seen 14 minutes ago.
projectpage.offline_wait_seen = {machine} çevrimdışı, {seen}: ajanı bağlandığında geri gelir.
projectpage.offline_wait = {machine} çevrimdışı: ajanı bağlandığında geri gelir.
projectpage.new_terminal = Yeni terminal
# The ⋯ button next to a machine, for screen readers: {machine} is its name.
projectpage.machine_menu = {machine}: makine menüsü
# The tip on that button: the items of its menu (projectpage.move_machine, projectpage.remove_machine).
projectpage.machine_menu_title = Başka bir projeye taşı, Makineyi kaldır
# An item of a machine's menu, and the tip on its ⋯ button when it is the only item.
projectpage.remove_machine = Makineyi kaldır
# An item of a machine's menu.
projectpage.move_machine = Başka bir projeye taşı
projectpage.no_terminals = Açık terminal yok
# Who changed a note last, and when: {ago} is just now, 5 min ago, yesterday, on 12 Oct (time.*).
projectpage.edited_you = Sen, {ago}
# The same, someone else: {name} is their first name.
projectpage.edited_by = {name}, {ago}
# A note's author when it is oneself, in the note's menu: You, the owner and admins can delete it.
projectpage.you = sen
# A checklist's progress, in place of its first line: {n} items ticked of {total}.
projectpage.done = one: {n}/{total} tamamlandı | other: {n}/{total} tamamlandı
# A note without text yet, in place of its first line.
projectpage.note_empty = Boş
# The ⋯ button next to a note, for screen readers: {note} is its title.
projectpage.note_menu = {note}: not menüsü
# The tip on that button: what its menu has.
projectpage.note_menu_title_move = Klasör, Başka bir projeye taşı, Markdown olarak kopyala, Notu sil
projectpage.note_menu_title = Klasör, Markdown olarak kopyala, Notu sil
# The end of the line under the project's name when nobody else is in it: 1 machine · 2 terminals open · only you.
projectpage.only_you = yalnızca sen
# The tip on the project's code, next to its name.
projectpage.short_code = Kısa kod
# The pencil next to the project's name.
projectpage.edit = Adı, kodu ve rengi düzenle
# A heading.
projectpage.machines = Makineler
# Next to the heading Machines.
projectpage.machines_alone = Bunlarda yalnızca sen terminal açarsın
projectpage.machines_shared = Bunlardaki terminallerin
projectpage.add_machine = Makine ekle
# The two kinds of machine one can add, in a project without machines.
projectpage.server = Sunucu
projectpage.server_text = SSH ile eriştiğin bir VPS ya da bulut sunucu. Üzerinde tek bir komut çalıştır, hemen burada görünür.
projectpage.computer = Bilgisayar
projectpage.computer_text = Evde ya da ofiste, NAT arkasında bile olsa bir Mac ya da Linux makine. Küçük bir ajan onu bağlı tutar.
# "Move to another project" is the item of a machine's ⋯ menu (projectpage.move_machine).
projectpage.move_hint = Makine zaten başka bir projede mi? O projenin sayfasında makinenin yanındaki ⋯, ardından Başka bir projeye taşı.
# On the page of Personal, the project each person has for themselves: {project} is its name.
projectpage.personal_title = {project} yalnızca senin
projectpage.personal_text = Buraya kimse davet edilemez. Diğer makineleri ayrı tutmak ya da ileride başkalarıyla çalışmak için bir proje oluştur ve makineleri oraya taşı.
projectpage.new_project = Yeni proje
# A heading.
projectpage.notes = Notlar
# Next to the heading Notes.
projectpage.notes_alone = {project} projesindeki notları yalnızca sen görürsün. Klasörler onları düzenli tutar
projectpage.notes_shared = {project} projesindeki herkes onları okur ve düzenler. Klasörler onları düzenli tutar
projectpage.new_folder = Yeni klasör
projectpage.no_notes = Henüz not yok
# Runbooks, Access, Checklists: examples of folders' names.
projectpage.no_notes_text = Terminaller makinelerde nasıl duruyorsa notlar da klasörlerde öyle durur. Bir klasörle başla: Runbook'lar, Erişim, Kontrol listeleri.
# A folder without notes, next to its name.
projectpage.folder_empty = Boş
# Who made a folder: {name} is their first name.
projectpage.made_by_you = oluşturan: sen
projectpage.made_by = oluşturan: {name}
projectpage.new_note = Yeni not
# The ⋯ button next to a folder, for screen readers: {folder} is its name.
projectpage.folder_menu = {folder}: klasör menüsü
# The tip on that button: what its menu has.
projectpage.folder_menu_title = Klasörü yeniden adlandır, Klasörü sil
# "New note" is the button next to the folder's name (projectpage.new_note).
projectpage.folder_no_notes_writes = Henüz not yok. Yeni not düğmesi ilkini buraya ekler
# A heading at the end of the page: {project} is the project's name.
projectpage.delete_title = {project} projesini sil
projectpage.delete_text = Klasörleri ve notları da onunla birlikte silinir. Makineler önce başka bir projeye taşınır ya da kaldırılır.
projectpage.delete_project = Projeyi sil

# ------------------------------------------------------------ machines: the machines page (Machines.tsx)
# What sudo does on the machine, after "sudo" in what tTerm Web learned about it.
machines.sudo_works = çalışıyor
machines.sudo_password = parola istiyor
machines.sudo_missing = yok
# What tTerm Web learned about a machine when it connected: the labels, each with its value.
machines.system = Sistem
machines.kernel = Çekirdek
machines.cpu = İşlemci
machines.cores = one: {n} çekirdek | other: {n} çekirdek
machines.memory = Bellek
machines.disk = Disk
# {free} and {total} are sizes: 7.8 GB free of 50 GB.
machines.disk_free = {free} boş, toplam {total}
# The package manager: apt, brew.
machines.packages = Paketler
machines.shell = Kabuk
# {shell} is the shell its terminals start, {shells} all the shells it has: zsh (has bash, zsh).
machines.shell_has = {shell} (mevcut: {shells})
machines.commands = Komutlar
# How many commands tTerm Web knows there.
machines.commands_known = one: {n} bilinen komut | other: {n} bilinen komut
# The version of the agent, or of tTerm for the computer.
machines.agent = Ajan
# The account on the machine the terminals run as: root, deploy.
machines.account = Kullanıcı
# A computer's state on its card: {seen} is time.last_seen: offline, last seen 14 minutes ago.
machines.offline_seen = çevrimdışı, {seen}
machines.offline = çevrimdışı
machines.online = çevrimiçi
machines.offline_note = Bilgisayar uykuda ya da çevrimdışı, ya da ajanı çalışmıyor. Ajanı bağlanabildiğinde kendiliğinden geri gelir; bu sayfa bunu on saniye içinde fark eder.
# On Open a terminal while the computer is offline.
machines.offline_title = Çevrimdışı: uykuda ya da ajanı çalışmıyor
machines.open_terminal = Terminal aç
# A terminal running on the machine: {label} is as its tab shows it (P/web-01 · 2).
machines.back_to = {label} terminaline dön, hâlâ çalışıyor
# The tip on Remove: {machine} is the machine's name.
machines.remove_title = {machine} makinesini tTerm Web'den çıkar
# The button: take the machine out (a verb).
machines.remove = Kaldır
# The page's heading.
machines.title = Makineler
machines.add = Makine ekle
machines.lead = Sekmesini kapattığında terminal çalışmaya devam eder: kabuğu sonlanana kadar burada ve kenar çubuğunda bekler.
# A size: {size} is a number as the language writes it, 16 or 7.5.
machines.gb = {size} GB

# ------------------------------------------------------------ note_view: a note in its tab (NoteView.tsx)
# Said for a moment at the bottom of the page. {why} is the reason tTerm
# Web gave, as it gave it.
note_view.not_saved = Kaydedilmedi: {why}
note_view.draft_back = Bu notta yazılıp kaydedilmeyenler geri geldi.
# When tTerm Web gives no reason.
note_view.no_answer = tTerm Web yanıt vermedi.
# Ticking a checklist item did not get through.
note_view.no_tick = İşaretlenemedi: {why}
# The note's tab was closed with what was typed in it not saved. {title} is
# the note's title, or note.untitled.
note_view.kept_draft = {title}: yazılanlar henüz kaydedilmedi. Bu tarayıcıda saklanıyor ve notu yeniden açtığında geri gelir.
note_view.copied_markdown = Markdown olarak kopyalandı.
note_view.no_copy = Kopyalanamadı: tarayıcı sayfanın kopyalamasına izin vermedi.
note_view.no_move = Taşınamadı: {why}
# Under the note's title, the parts of one line with dots between: who
# started it and when; or who edited it last and when · who wrote it and
# on which day; then who sees it. Someone is a person no longer known.
# {name} is a person's first name; {ago} is how long ago, short: just now,
# 5 min ago, yesterday, on 12 Oct; {folder} is a folder's name.
note_view.someone_started = Biri {ago} {folder} klasöründe oluşturdu
note_view.you_started = Sen {ago} {folder} klasöründe oluşturdun
note_view.started = {name} {ago} {folder} klasöründe oluşturdu
note_view.someone_edited = Biri {ago} düzenledi
note_view.you_edited = Sen {ago} düzenledin
note_view.edited = {name} {ago} düzenledi
# {day} is today, yesterday or on 12 Oct.
note_view.someone_wrote = Biri {day} yazdı
note_view.you_wrote = Sen {day} yazdın
note_view.wrote = {name} {day} yazdı
# The end of the same line, after a dot. {project} is a project's name.
note_view.only_you = yalnızca sen görüyorsun
note_view.everyone_edits = {project} projesindeki herkes düzenleyebilir
# The note was deleted while it was open here.
note_view.gone_title = Bu not silindi
note_view.gone_text = Not ya da içinde bulunduğu klasör başka bir sekmeden veya cihazdan silindi.
note_view.close_tab = Sekmeyi kapat
note_view.copy_what_was_here = Burada olanı Markdown olarak kopyala
note_view.no_open = Not açılamadı: {why}
# The ⋯ beside where the note is: what screen readers say, and the tip
# under the mouse, which lists what is in its menu.
note_view.menu = Not menüsü
note_view.menu_title_move = Klasör, Başka bir projeye taşı, Markdown olarak kopyala, Notu sil
note_view.menu_title = Klasör, Markdown olarak kopyala, Notu sil
# The field of the note's title, for screen readers.
note_view.title = Başlık
# The note was saved meanwhile from elsewhere, changed in the same places.
note_view.conflict = Sen yazarken bu not başka bir yerde de değişti, hem de aynı yerlerde. O yerlerde seninki mi kalsın, diğer sürüm mü? Geri kalan her şey iki taraftan da korunur.
note_view.keep_mine = Benimkini koru
note_view.keep_theirs = Diğer sürümü koru

# ------------------------------------------------------------ note_editor: a note's blocks, written in place (NoteEditor.tsx)
# The kinds of block: what screen readers say of one, and what an empty one
# shows. Heading, Code, Divider and Text are also in the list that / opens.
note_editor.text = Metin
note_editor.heading = Başlık
note_editor.list_item = Liste öğesi
note_editor.checklist_item = Kontrol listesi öğesi
note_editor.code = Kod
note_editor.divider = Ayırıcı
# In the list that / opens: what a block can become. What is typed after
# the / picks from these names.
note_editor.checklist = Kontrol listesi
note_editor.list = Liste
# Who ticked a checklist item, beside it: You · 10:02, Denis · 12 Oct.
note_editor.you = Sen
# The same, for a person no longer known.
note_editor.someone = Biri
# What an empty note shows. The marks # - [ ] \`\`\` and / are typed as they
# are; the words after them are the language's own.
note_editor.start_writing = Yazmaya başla. Markdown yazarken çalışır: # başlık, - [ ] kontrol listesi, \`\`\` kod. Geri kalanı için / yaz.
# What an empty line of text shows.
note_editor.type_slash = Kontrol listesi, başlık ya da kod için / yaz
# A checklist item's box, for screen readers.
note_editor.untick = Tamamlandı: işareti kaldır
note_editor.tick = Tamamlandı olarak işaretle
note_editor.no_copy = Kopyalanamadı: metni seç ve elle kopyala.
# The list that / opens, for screen readers.
note_editor.turn_into = Dönüştür

# ------------------------------------------------------------ menus: the menus behind ⋯, and the window that names a folder (Menus.tsx)
# A note's menu: over the project's folders, the one the note is in
# checked; a click moves it to another.
menus.folder = Klasör
menus.move_out = Başka bir projeye taşı…
menus.copy_markdown = Markdown olarak kopyala
menus.delete_note = Notu sil
# Instead of Delete note, for one who may not: who may. {name} is the first
# name of the note's author.
menus.note_rights_move = Başka projeye taşıma ve silme yetkisi: {name}, proje sahibi ve yöneticiler
menus.note_rights_delete = Silme yetkisi: {name}, proje sahibi ve yöneticiler
# The same, when the note's author is no longer known.
menus.note_rights_move_someone = Başka projeye taşıma ve silme yetkisi: notun yazarı, proje sahibi ve yöneticiler
menus.note_rights_delete_someone = Silme yetkisi: notun yazarı, proje sahibi ve yöneticiler
# A folder's menu.
menus.rename_folder = Klasörü yeniden adlandır
menus.delete_folder = Klasörü sil
# Instead of Delete folder, for one who may not.
menus.folder_rights = İçinde not olan bir klasörü proje sahibi ve yöneticiler silebilir
# The window that names a folder, a new one or one renamed. First what it
# says when tTerm Web gives no reason.
menus.no_answer = tTerm Web yanıt vermedi.
# The field of the folder's name, and an example of one in it.
menus.name = Ad
menus.name_example = Örneğin Runbook'lar

# ------------------------------------------------------------ search: search over everything, by ⌘K or Search on the right of the tabs (Search.tsx)
# The kinds of what is found: the buttons above the list, and the heads of
# its groups.
search.kind_commands = Komutlar
search.kind_output = Çıktı
search.kind_notes = Notlar
search.kind_terminals = Terminaller
search.kind_machines = Makineler
search.kind_projects = Projeler
search.kind_actions = Eylemler
# The kind of the line chosen, on top of the preview beside the list.
search.label_command = Komut
search.label_output = Çıktı
search.label_note = Not
search.label_terminal = Terminal
search.label_machine = Makine
search.label_project = Proje
search.label_action = Eylem
# Nothing found. {text} is what was typed; Commands, Output… are the button
# chosen above the list (search.kind_*).
search.nothing_for = “{text}” için sonuç yok.
search.nothing_in_commands = Komutlar içinde “{text}” için sonuç yok.
search.nothing_in_output = Çıktı içinde “{text}” için sonuç yok.
search.nothing_in_notes = Notlar içinde “{text}” için sonuç yok.
search.nothing_in_terminals = Terminaller içinde “{text}” için sonuç yok.
search.nothing_in_machines = Makineler içinde “{text}” için sonuç yok.
search.nothing_in_projects = Projeler içinde “{text}” için sonuç yok.
search.nothing_in_actions = Eylemler içinde “{text}” için sonuç yok.
# How a command found ended: stopped (it has no exit code), or exit 1.
# {code} is its exit code.
search.stopped = durduruldu
search.exit = çıkış {code}
# How often it ran, at the end of the line under a command:
# P/web-01 · ~/app · main · exit 0 · 10:46 · 3 runs.
search.runs = one: {n} kez çalıştı | other: {n} kez çalıştı
# Under a line of output found: the command that printed it, in npm test.
search.in_command = {command} komutunda
# Beside the list: what the line chosen is, a row each.
search.row_machine = Makine
# {machine} is the project's code and the machine's name: P/web-01.
search.machine_removed = {machine}, tTerm'den kaldırıldı
search.row_folder = Dizin
search.row_branch = Dal
search.row_status = Durum
search.row_when = Zaman
search.row_terminal = Terminal
# {terminal} is the terminal as its tab names it, P/web-01 · deploy; {when}
# is when it ended: 10:46, yesterday 17:38, 2 Oct 09:12.
search.terminal_ended = {terminal}, sonlandı: {when}
# The buttons under the preview: the command opened at its block, or put
# into the line of the terminal in front, not run.
search.open_in_terminal = Terminalinde aç
search.into_line = Satıra aktar
# A note found: where it is (its project and folder), when it was edited.
search.row_in = Konum
search.row_edited = Düzenlendi
search.open_note = Notu aç
# Before anything is typed: what was open last, and the commands run most
# on the machine in front; {machine} is its name.
search.recent = Son kullanılanlar
search.yours_on = {machine} üzerindeki komutların
# Beside a group's head in All: all of its kind; + when there are more
# than were sent.
search.all = one: Tümü ({n}) | other: Tümü ({n})
search.all_more = one: Tümü ({n}+) | other: Tümü ({n}+)
# The window, and its field.
search.label = Arama
search.placeholder = Komutlar, çıktı, notlar, terminaller, makineler…
search.close_title = Kapat (Esc)
# The buttons above the list; All is the first of them.
search.filters = Arama kapsamı
search.kind_all = Tümü
# The list of what was found, for screen readers.
search.found = Bulunanlar
search.nothing_typed = Henüz bir şey yazılmadı: son açtıkların ve burada en çok çalıştırdıkların.
search.looks_in = Arama, tüm terminallerindeki her komutu, bu komutların çıktısını, notları, terminalleri, makineleri ve projeleri tarar.
search.everything = Her şeyde ara
# With Output, Notes or Commands chosen and nothing typed yet.
search.type_output = Komutların çıktısında aramak için bir sözcük yaz.
search.type_notes = Notlarda aramak için bir sözcük yaz.
search.type_commands = Komutlarda aramak için bir sözcük yaz.
# Beside the list while nothing is chosen: what to type (c: nginx,
# o: timed out…), and what each keeps to.
search.tips = Başa yazılan bir önek aramayı tek bir türle sınırlar
search.tip_commands = komutlar
search.tip_output = komutların çıktısı
search.tip_notes = notlar
search.tip_terminals = terminaller
search.tip_machines = makineler
search.tip_projects = projeler
search.tip_actions = yapılabilecek işler
# Tab is the key.
search.tips_buttons = Ya da listenin üstündeki düğmelerden birini seç. Tab bir sonrakine geçer.
# At the bottom: a key, and what it does (move, open: verbs). {keys} is
# ⌘ Enter or Ctrl+Enter.
search.keys_move = <kbd>↑</kbd><kbd>↓</kbd> gezin
search.keys_open = <kbd>Enter</kbd> aç
search.keys_paste = <kbd>{keys}</kbd> satıra aktar
search.keys_next = <kbd>Tab</kbd> sonraki tür
# The words in front, and what each keeps to. c:, o:, n:, >, t:, m: and p:
# are typed as they are: keep them.
search.prefixes_title = t: terminaller, m: makineler, p: projeler
search.prefix_commands = <code>c:</code> komutlar
search.prefix_output = <code>o:</code> çıktı
search.prefix_notes = <code>n:</code> notlar
search.prefix_actions = <code>></code> eylemler

# ------------------------------------------------------------ input: tTerm's own input line, under a terminal's feed (InputLine.tsx)
# Said for a moment at the bottom of the page.
input.still_running = Bir komut hâlâ çalışıyor. Bitmesini bekle ya da bloğunda Ctrl+C ile durdur.
# Faint, after a name in the lists over the line: .. goes up a level; the
# branch checked out now; a branch of the remote.
input.up_level = bir üst dizin
input.branch_current = geçerli
input.branch_remote = uzak
# {error} is what went wrong, as the browser or tTerm Web said it.
input.no_answer = Makine yanıt vermedi: {error}
# Faint in the line while it cannot take a command.
input.starting = Kabuk başlatılıyor…
input.keys_go = Tuşlar çalışan komuta gidiyor. Sonrakini yazmak için buraya tıkla.
# The directory and the branch above the line are buttons: each opens a
# list, to cd into or to switch to. Ctrl+R lists the history.
input.change_dir = Dizini değiştir
input.switch_branch = Dalı değiştir
input.history = Geçmiş
# The search field over those lists.
input.find_dir = Dizin bul ya da bir yol yaz
input.find_branch = Dal bul
input.find_command = Komut bul
# Tab's list of what the word could be.
input.completions = Tamamlamalar
input.more_not_shown = Gösterilmeyenler var: birkaç harf daha yaz
# The line itself, for screen readers.
input.command = Komut
# Under the line, while it holds a command search put there.
input.from_search = Aramadan geldi, henüz çalıştırılmadı
input.enter_runs = <kbd>Enter</kbd> burada çalıştırır
input.esc_clears = <kbd>Esc</kbd> satırı temizler
# Under the line: a key, and what it does. ⇧↵ is Shift+Enter.
input.tab_complete = <kbd>Tab</kbd> tamamla ya da öneriyi kabul et
input.history_local = <kbd>↑</kbd> bu bilgisayardaki geçmiş
input.history_devices = <kbd>↑</kbd> tüm cihazlarındaki geçmiş
input.new_line = <kbd>⇧↵</kbd> yeni satır
input.while_running = Bir komut çalışırken yazdıkların ona gider
# A terminal's two modes, beside the line: Line, with this line and the
# commands as blocks; Classic, every key straight to the shell.
input.mode = Giriş modu
input.mode_line = Satır
input.mode_classic = Klasik

# ------------------------------------------------------------ block: one command of the feed, with its output (BlockView.tsx)
# The block, for screen readers. {command} is the command as typed, {code}
# its exit code.
block.state_input = {command}, kabuk tarafından başlatılmadı
block.state_running = {command}, çalışıyor
block.state_failed = {command}, {code} çıkış koduyla başarısız oldu
block.state_finished = {command}, tamamlandı
block.state_ended = {command}, sonlandı
# On a block search opened: the words found are marked in it.
block.found = Bulundu
# A command the shell has not started; Stop is the button (block.stop).
block.not_started_title = Kabuk komutun geri kalanını bekliyor (açık bir tırnak ya da heredoc) ya da komutu almadı. Bloğa yaz ya da Durdur'a bas.
block.not_started = başlamadı
block.running = çalışıyor
# A command that failed: exit 1.
block.exit = çıkış {code}
block.stop_title = Komutu durdur (Ctrl+C)
# The button that stops the command running: a verb.
block.stop = Durdur
# The buttons of a finished block, with their tips.
block.actions = Blok eylemleri
block.copy_block = Komutu ve çıktısını kopyala
block.copy_output = Çıktıyı kopyala
block.copy_output_title = Yalnızca çıktıyı kopyala
block.run_again = Yeniden çalıştır
block.copy_link = Bu bloğun bağlantısını kopyala
block.expand = Bloğu genişlet
block.collapse = Bloğu daralt
# For screen readers: the browser did not let the page copy.
block.not_copied = Kopyalanmadı
# A folded block, in its place; a click unfolds it.
block.lines_hidden = one: {n} satır gizli | other: {n} satır gizli
# Above a long output, of which the last 400 lines show.
block.show_earlier = one: Önceki {n} satırı göster | other: Önceki {n} satırı göster
block.show_whole = Çıktının tamamını göster

# ------------------------------------------------------------ feed: a terminal's commands as blocks, in the Line mode (FeedTerminal.tsx)
# Said for a moment at the bottom of the page.
feed.not_connected = Şu anda tTerm Web'e bağlantı yok: komut gönderilmedi.
feed.still_running = Bir komut hâlâ çalışıyor. Ctrl+C ile durdurulabilir.
feed.copy_refused = Tarayıcı sayfanın kopyalamasına izin vermedi.
feed.output_gone = Çıktının tamamı artık mevcut değil.
feed.show_earlier = Önceki komutları göster
# After clear or Ctrl+L, on top: what came before is out of view; a click
# shows it again.
feed.cleared = one: {n} blok görünümden kaldırıldı: göster | other: {n} blok görünümden kaldırıldı: göster
feed.empty = Aşağıya bir komut yaz. Her komut burada çıktısı, ne kadar sürdüğü ve nasıl bittiğiyle birlikte bir blok olur.
# Asked before a dangerous command runs. {what} is what it would do and
# {lost} what does not come back, as tTerm Web says them: delete a
# directory and everything inside it; There is no undo and no bin to look
# in. {machine} is the machine's name; the second is for while it is not
# known.
feed.confirm_label = Bu komut çalıştırılsın mı?
feed.confirm = Bu komut <strong>{machine}</strong> üzerinde şunu yapacak: <strong>{what}</strong>. {lost}
feed.confirm_unknown = Bu komut <strong>makine</strong> üzerinde şunu yapacak: <strong>{what}</strong>. {lost}
# What a command held back would do ({what} of feed.confirm, so in the form
# that fits there) and what does not come back ({lost}): the nine of the
# core and the app (danger.ts).
danger.delete_tree = bir dizini ve içindeki her şeyi silmek
danger.delete_tree_lost = Geri almanın yolu yok, bakabileceğin bir çöp kutusu da yok.
danger.disk = bir diskin dosya sistemini yeniden oluşturmak
danger.disk_lost = Yalnızca dosyalar değil, o diskteki her şey silinir.
danger.device = doğrudan bir aygıtın üzerine yazmak
danger.device_lost = Üzerindeki her şey, komut başladığı anda yok olur.
danger.database = bir veritabanını ya da tabloyu silmek
danger.database_lost = Yalnızca bir yedekten geri getirilebilir.
danger.power_off = makineyi kapatmak
danger.power_off_lost = Buradan yeniden açılamaz: bunun için sağlayıcının paneli gerekir.
danger.reboot = makineyi yeniden başlatmak
danger.reboot_lost = Oturum kopar ve çalışan her şey onunla birlikte durur.
danger.ssh = SSH servisini durdurmak
danger.ssh_lost = Makineye giriş yolu bu. Onu durdurmak, kapıyı içeriden kilitlemek demek.
danger.firewall = güvenlik duvarı ayarlarını değiştirmek
danger.firewall_lost = Yanlış bir kural makineye erişimi kesebilir ve geri girmenin yolu kalmaz.
danger.user = bir kullanıcı hesabını silmek
danger.user_lost = Kullanıcının dosyaları ve erişimi de onunla birlikte gider.
# Under it, for rm -rf aimed at / or ~.
feed.everything = <strong>Bu komut makinenin tamamını hedefliyor.</strong> Makinedeki hiçbir şey kurtulmaz.
feed.run_it = Çalıştır

# ------------------------------------------------------------ terminal_view: a terminal under its tab (TerminalView.tsx)
# A terminal's tab while its own name is not known yet.
terminal_view.terminal = Terminal
# The tip of Line (input.mode_line) when it cannot be chosen.
terminal_view.no_blocks = Bu kabuk komutların nerede başladığını işaretlemiyor, bu yüzden yalnızca klasik modda çalışır.
terminal_view.end_failed = Terminal sonlandırılamadı: tTerm Web yanıt vermedi.
# Under a terminal in the Classic mode (input.mode_classic). Tab is the key.
terminal_view.classic_hint = Klasik: her tuş doğrudan kabuğa gider; Tab ve geçmiş kabuğun kendisine aittir.
terminal_view.classic_warning = Bu modda tehlikeli komutlar için onay istenmez.
# {machine} is the machine's name; the second is for while it is not known.
terminal_view.connecting = {machine} makinesine bağlanılıyor…
terminal_view.connecting_unknown = Makineye bağlanılıyor…
# A terminal whose computer sleeps, or is offline. {since} is how long:
# 3 minutes, an hour (time.for_*).
terminal_view.away = {machine} uykuda ya da çevrimdışı
terminal_view.away_since = Bu terminal onu bekliyor ve geri geldiğinde kaldığı yerden devam eder. Makine {since} uzakta.
terminal_view.away_text = Bu terminal onu bekliyor ve geri geldiğinde kaldığı yerden devam eder.
terminal_view.end = Bu terminali sonlandır
# A terminal that ended. Under it, how it ended as tTerm Web says it, or
# not_running.
terminal_view.no_such = Böyle bir terminal yok
terminal_view.ended = Bu terminal sonlandı
terminal_view.not_running = Artık çalışmıyor.
terminal_view.open_new = {machine} üzerinde yeni terminal aç
terminal_view.close_tab = Sekmeyi kapat

# ------------------------------------------------------------ classic: the Classic mode, every key straight to the shell (ClassicTerminal.tsx)
# A command search put here. Line is the mode (input.mode_line).
classic.several_lines = Bu komut birkaç satırdan oluşuyor ve klasik mod her satırı girildiği anda çalıştırır. Terminalin altından Satır moduna geç.

# ------------------------------------------------------------ tabs: the line of tabs on top (TabBar.tsx)
# The tabs that are open, for screen readers.
tabs.label = Açık sekmeler
# Naming a terminal in its tab, after a double click.
tabs.rename_title = Bu terminale ad ver
tabs.rename_hint = Enter kaydeder, Esc iptal eder. Ad kenar çubuğunda, sekmelerde ve proje sayfasında görünür.
# {name} is the tab as it reads: P/web-01 · 2, a note's title, a project's
# name.
tabs.close = {name} sekmesini kapat
# The + after the tabs.
tabs.new_terminal = Yeni terminal
tabs.new_terminal_title = Herhangi bir makinede yeni terminal
# The button on the right that opens search.
tabs.search_title = Komutlarda, çıktılarında, notlarda, terminallerde, makinelerde ve yapılabilecek işlerde ara
tabs.search = Ara

# ------------------------------------------------------------ finder: a list with a search field, as the + after the tabs opens it (Finder.tsx)
finder.nothing = Hiçbir şey bulunamadı

# ------------------------------------------------------------ picker: the lists over the input line: directories, branches, history (Picker.tsx)
# While the machine is asked for its directories or branches.
picker.asking = Makineye soruluyor…
picker.nothing = Burada bir şey yok

# ------------------------------------------------------------ name_input: the field that names a terminal (NameInput.tsx)
# For screen readers. While the terminal has only its number,
# terminal.numbered shows faint in it.
name_input.label = Terminal adı
`;export{e as default};