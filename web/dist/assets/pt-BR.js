var e=`# Strings of tTerm Web's page in English: one a line, \`key = text\`.
# Every language has the same keys; the build stops when one is missing
# (scripts/strings.mjs). {name} is a value the page puts in; a counting
# string has a form for each plural of the language, "one: … | other: …",
# and {n} is the count; <b>…</b> wraps a part the page makes a link, bold
# or code. Names of machines, projects, notes and terminals, commands and
# their output, tTerm, tTerm Web and Free are not translated.

# ------------------------------------------------------------ common: words used in many places
common.close = Fechar
common.cancel = Cancelar
common.save = Salvar
common.loading = Carregando…
common.try_again = Tentar novamente
common.copy = Copiar
common.copied = Copiado
common.back = Voltar
common.done = Concluído
common.more = Mais
common.sign_in = Entrar

# ------------------------------------------------------------ time: how long ago (time.ts)
# A duration after "for": Away for 3 minutes, running for an hour.
time.for_less = menos de um minuto
time.for_minutes = one: {n} minuto | other: {n} minutos
time.for_hours = one: {n} hora | other: {n} horas
time.for_days = one: {n} dia | other: {n} dias
# How long ago, in full words: Signed in 3 minutes ago.
time.ago_now = agora há pouco
time.ago_minutes = one: há {n} minuto | other: há {n} minutos
time.ago_hours = one: há {n} hora | other: há {n} horas
time.ago_days = one: há {n} dia | other: há {n} dias
# A machine that is offline: {ago} is one of the four above.
time.last_seen = última conexão {ago}
# How long ago, short, in lists of notes and in Updates: Looked 5 min ago.
time.short_minutes = one: há {n} min | other: há {n} min
time.short_hours = one: há {n} h | other: há {n} h
time.yesterday = ontem
time.today = hoje
time.days_ago = one: há {n} dia | other: há {n} dias
time.last_week = na semana passada
time.weeks_ago = one: há {n} semana | other: há {n} semanas
# {day} is a date as the language writes it: 12 Oct, 12. Okt.
time.on_day = em {day}
# In search: yesterday 17:38, 2 Oct 09:12.
time.yesterday_at = ontem às {time}
time.day_at = {day} às {time}

# ------------------------------------------------------------ here: the computer tTerm for Mac runs on
# Alone, as a label (the sidebar, tabs). Sentences that name it have a
# string of their own for each: .mac and .computer.
here.mac = este Mac
here.computer = este computador

# ------------------------------------------------------------ role: one's role in a project
role.owner = Proprietário
role.admin = Administrador
role.member = Membro
role.observer = Observador

# ------------------------------------------------------------ color: projects' colors (colors.ts)
color.violet = Violeta
color.sky = Celeste
color.teal = Turquesa
color.pink = Rosa
color.orange = Laranja
color.lime = Verde-limão
color.indigo = Índigo
color.slate = Ardósia

# ------------------------------------------------------------ count: how many, in lists and lines
count.machines = one: {n} máquina | other: {n} máquinas
count.notes = one: {n} nota | other: {n} notas
count.terminals_open = one: {n} terminal aberto | other: {n} terminais abertos
# The end of a list cut short: web-01, web-02, web-03, web-04 and 3 more.
count.more = one: mais {n} | other: mais {n}

# A terminal that has only its number, in lists: terminal 2.
terminal.numbered = terminal {number}
# A note without a title.
note.untitled = Sem título

# ------------------------------------------------------------ sidebar (Sidebar.tsx)
sidebar.label = Barra lateral
sidebar.all_machines = Todas as máquinas
sidebar.keep_open = Manter barra lateral aberta
sidebar.keep_open_title = Manter a barra lateral aberta
sidebar.let_slide = Deixar a barra lateral se esconder
sidebar.close = Fechar barra lateral
sidebar.projects = Projetos
sidebar.fold = Recolher {name}
sidebar.unfold = Expandir {name}
sidebar.open_project = Abrir {name}: máquinas e notas
sidebar.machines = Máquinas
sidebar.add_machine = Adicionar máquina
sidebar.no_machines = Nenhuma máquina ainda
sidebar.notes = Notas
sidebar.new_folder = Nova pasta
sidebar.no_notes = Nenhuma nota ainda
sidebar.no_notes_writes = Nenhuma nota ainda. O + cria uma pasta para elas
sidebar.new_project = Novo projeto
sidebar.waits = {name} reaparece quando a conexão com o tTerm voltar
sidebar.offline = {name} está offline: em repouso, ou o agente não está rodando
# {seen} is time.last_seen: last seen 14 minutes ago.
sidebar.offline_seen = {name} está offline: em repouso, ou o agente não está rodando ({seen})
sidebar.here.mac = {name}, este Mac: os terminais dele rodam aqui, mesmo sem internet
sidebar.here.computer = {name}, este computador: os terminais dele rodam aqui, mesmo sem internet
sidebar.new_terminal = Novo terminal
sidebar.new_terminal_on = Novo terminal em {name}
sidebar.rename_hint = Enter salva, Esc cancela
sidebar.go_to = Ir para {label}
sidebar.go_to_away = Ir para {label}: aguardando a volta de {machine}
sidebar.double_click = Clique duas vezes para renomear
sidebar.end = Encerrar {label}
sidebar.end_title = Encerrar {label}: o shell é encerrado
sidebar.new_note_in = Nova nota em {name}
sidebar.empty_folder = Vazia
sidebar.empty_folder_writes = Vazia. O + cria uma nota
sidebar.signin_title = Servidores e projetos
sidebar.signin_text = Entre para abrir terminais nos seus servidores, guardar notas em projetos e trabalhar com a sua equipe. Este computador continua como está.
sidebar.theme_dark = Mudar para o tema escuro
sidebar.theme_light = Mudar para o tema claro

# ------------------------------------------------------------ account_menu: the account at the bottom of the sidebar and its menu
# "Free" is the plan's name: it stays as it is.
account_menu.free_plan = Plano Free
account_menu.title = Configurações, idioma, conta, sair
account_menu.title_local = Configurações, idioma, entrar
account_menu.not_signed_in = Sem login
account_menu.only_here = Só este computador
account_menu.offline = Offline, tentando de novo
account_menu.local_note = O tTerm funciona com este computador. Entre para usar seus servidores, projetos e equipe.
account_menu.sign_out = Sair
# The item after Settings, and the title of the list of languages.
language.item = Idioma

# ------------------------------------------------------------ settings (Settings.tsx)
# The page, and the item of the account's menu that opens it.
settings.title = Configurações
settings.appearance = Aparência
settings.appearance_local = Salvo neste computador. A opção Sistema segue a configuração deste computador. A cor de um projeto preenche o selo do código ou tinge o projeto inteiro na barra lateral.
settings.appearance_account = Salvo na sua conta. A opção Sistema segue a configuração de cada computador que você usa. A cor de um projeto preenche o selo do código ou tinge o projeto inteiro na barra lateral.
settings.theme = Tema
settings.theme_system = Sistema
settings.theme_light = Claro
settings.theme_dark = Escuro
settings.tints = Cores dos projetos
settings.tint_badge = Selo do código
settings.tint_block = Projeto inteiro

# ------------------------------------------------------------ devices (Devices.tsx)
devices.title = Dispositivos

# ------------------------------------------------------------ account (Account.tsx)
# The page, and the item of the account's menu that opens it.
account.title = Conta

# ------------------------------------------------------------ app: the page's frame, toasts and dialogs (App.tsx)
app.session_ended = Sua sessão terminou. Entre de novo: seus terminais continuaram rodando.
# How saving goes in the note in front, on the line of tabs.
app.saved = Salvo
app.saving = Salvando…
app.not_saved_offline = Não salvo: sem conexão
app.not_saved = Não salvo
app.no_connection = Sem conexão
app.not_answering_local = O tTerm Web não está respondendo. O python -m tterm.dev está rodando numa janela de terminal?
app.not_answering = O tTerm Web não está respondendo. Verifique a conexão e tente de novo.
# {why} is the reason tTerm Web gave, as it gave it.
app.no_terminal = Não foi possível abrir um terminal: {why}
app.offline = {name} está offline: volta quando o agente se conectar.
# {seen} is time.last_seen: last seen 14 minutes ago.
app.offline_seen = {name} está offline, {seen}: volta quando o agente se conectar.
app.removed_shared = A máquina {name} foi removida do tTerm Web. O mesmo servidor também está em outro projeto, então o acesso do tTerm Web a ele continua.
app.removed_access = A máquina {name} foi removida do tTerm Web, e o acesso do tTerm Web ao servidor foi revogado.
app.removed = A máquina {name} foi removida do tTerm Web.
app.no_note = Não foi possível criar a nota: {why}
app.note_deleted = A nota {title} foi excluída da pasta {folder}.
app.note_deleted_journal = A nota {title} foi excluída da pasta {folder}. Isso ficou anotado no registro.
app.folder_deleted = A pasta {name} foi excluída.
app.folder_deleted_journal = A pasta {name} foi excluída. Isso ficou anotado no registro.
app.folder_notes_deleted = one: A pasta {name} e {n} nota foram excluídas. | other: A pasta {name} e as {n} notas dela foram excluídas.
app.folder_notes_deleted_journal = one: A pasta {name} e {n} nota foram excluídas. Isso ficou anotado no registro. | other: A pasta {name} e as {n} notas dela foram excluídas. Isso ficou anotado no registro.
app.moved_to = Nota movida para a pasta {folder}.
app.no_move = Não foi possível mover: {why}
app.moved_here = Movida para cá do projeto {project}.
app.moved_here_journal = Movida para cá do projeto {project}. Isso ficou anotado no registro dele.
app.moved_to_project = Nota movida para o projeto {project}, pasta {folder}.
app.moved_to_other = Nota movida para o outro projeto, pasta {folder}.
app.copied_markdown = Copiado como Markdown.
app.note_gone = A nota foi excluída.
app.no_copy = Não foi possível copiar: {why}
app.no_copy_browser = Não foi possível copiar: o navegador não permitiu.
app.project_deleted = O projeto {name} foi excluído.
app.project_deleted_notes = one: O projeto {name} foi excluído, junto com {n} nota. | other: O projeto {name} foi excluído, junto com as {n} notas dele.
# {label} is where it is now: P/web-01.
app.machine_moved = {name} agora está no projeto {project}, como {label}. Os terminais continuam rodando.
app.no_rename = Não foi possível renomear: {why}
app.signed_out = Você saiu da conta. Seus terminais continuam rodando.
app.no_sign_out = Não foi possível sair: o tTerm Web não respondeu. Tente de novo.
app.no_theme = Não foi possível salvar o tema: o tTerm Web não respondeu.
app.no_language = Não foi possível salvar o idioma: o tTerm Web não respondeu.
app.no_tints = Não foi possível salvar as cores dos projetos: o tTerm Web não respondeu.
app.go_on_in_browser = Continue no navegador: entre por lá e autorize este computador.
app.open_sidebar = Abrir barra lateral
app.no_project = Projeto não encontrado
app.no_project_text = Ele não está mais entre os seus projetos.
app.close_the_tab = Fechar a aba
app.connection_lost = Conexão perdida. Reconectando; seus terminais continuam rodando.
app.cut_off.mac = <b>Sem conexão com o tTerm.</b> Este Mac funciona normalmente. Os terminais nos servidores continuam rodando lá e reaparecem aqui quando a conexão voltar.
app.cut_off.computer = <b>Sem conexão com o tTerm.</b> Este computador funciona normalmente. Os terminais nos servidores continuam rodando lá e reaparecem aqui quando a conexão voltar.
app.paste_busy = Há um comando rodando neste terminal, então a linha de entrada está ocupada. Tente de novo quando ele terminar.
app.paste_gone = {machine} não está mais no tTerm Web. Abra um terminal em outra máquina e, de lá, coloque o comando na linha de entrada dele.
app.picker.placeholder = Uma máquina de qualquer projeto
# Tabs: their labels and the tips under the mouse. {label} is a terminal's: P/web-01 · 2.
app.tab.note = Nota
app.tab.note_in = Nota em {folder}
app.tab.close_note = Fechar a nota. Ela continua na pasta.
app.tab.project = Projeto
app.tab.project_title = {name}: máquinas e notas
app.tab.close_page = Fechar a página
app.tab.terminal = Terminal
app.tab.away = {label}: {machine} está em repouso ou offline; o terminal espera a reconexão
app.tab.away_unknown = {label}: a máquina está em repouso ou offline; o terminal espera a reconexão
app.tab.ended = {label}: encerrado
app.tab.running = {label}: um comando está rodando
app.tab.close_terminal = Fechar a aba. O terminal continua rodando e fica na barra lateral, sob a máquina.
# A machine's state, small, after its name in lists.
app.machine.no_connection = sem conexão
app.machine.offline = offline
app.machine.offline_seen = offline, {seen}
app.machine.online = online
# Search and the palette (⌘K): what it finds on the page, the lines under each, and the details beside.
app.search.state_away = aguardando o computador
app.search.state_ended = encerrado
app.search.state_busy = comando rodando
app.search.state_prompt = no prompt
app.search.this_tab = esta aba
app.search.tab = aba
app.search.no_tab = rodando, sem aba
app.search.row_machine = Máquina
app.search.row_folder = Pasta
app.search.row_now = Agora
app.search.row_in = Em
app.search.row_edited = Editada
app.search.row_project = Projeto
app.search.row_system = Sistema
app.search.row_address = Endereço
app.search.row_status = Status
app.search.row_terminals = Terminais
app.search.row_code = Código
app.search.row_does = O que faz
app.search.open_count = one: {n} aberto | other: {n} abertos
# The button that does what was found.
app.search.open = Abrir
app.search.open_note = Abrir a nota
app.search.open_page = Abrir a página
app.search.do_it = Executar
# Search words: keep the English words, add the language's own after them.
app.search.terminal_words = terminal terminais
app.search.note_words = note nota notas
app.search.project_words = project page folders projeto página pagina pastas
# Things to do, in the palette: each with what it does, small, and its search words.
app.action.add_machine = Adicionar uma máquina
app.action.add_machine_hint = um servidor ou um computador
app.action.new_project_hint = com máquinas e notas próprias
app.action.edit_project = Editar {name}
app.action.edit_project_hint = nome, código e cor
app.action.new_folder_in = Nova pasta em {name}
app.action.new_folder_hint = para notas
app.action.close_tab = Fechar esta aba
app.action.close_tab_terminal = o terminal continua rodando
app.action.close_tab_note = a nota continua na pasta
app.action.rename_terminal = Nomear este terminal
app.action.rename_terminal_hint = em vez do número
app.action.end_terminal = Encerrar este terminal
app.action.end_terminal_hint = o shell é encerrado
app.action.delete_note = Excluir esta nota
app.action.delete_note_hint = da pasta {folder}
app.action.theme_dark = Mudar para o tema escuro
app.action.theme_light = Mudar para o tema claro
app.action.settings_hint_local = tema, cores dos projetos
app.action.settings_hint = tema, cores dos projetos, dispositivos
app.action.sign_in_hint = seus servidores, projetos e equipe
app.action.account_hint = nome, foto e plano
app.action.sign_out_hint = este navegador vai esquecer você
# Search words: keep the English words, add the language's own after them.
app.action.add_machine_words = new server computer connect adicionar nova máquina maquina servidor computador conectar
app.action.new_project_words = project new create make projeto novo criar fazer
app.action.edit_project_words = project rename edit code color colour projeto renomear editar código codigo cor
app.action.new_folder_words = notes folder new create notas pasta nova criar
app.action.machines_words = machines home overview máquinas maquinas início inicio visão visao geral
app.action.close_tab_words = tab close aba fechar
app.action.rename_terminal_words = terminal rename name label renomear nomear nome rótulo rotulo
app.action.end_terminal_words = terminal end stop kill exit shell encerrar parar matar sair fechar
app.action.delete_note_words = note delete remove nota excluir apagar remover
app.action.theme_words = theme dark light colours colors tema escuro claro cores
app.action.pin_words = sidebar panel pin barra lateral painel fixar
app.action.settings_words_local = settings preferences theme dark light colors colours support configurações configuracoes preferências preferencias tema escuro claro cores suporte
app.action.settings_words = settings preferences theme dark light colors colours devices quick code forget browsers support configurações configuracoes preferências preferencias tema escuro claro cores dispositivos código codigo rápido rapido esquecer navegadores suporte
app.action.sign_in_words = sign in log in login account cloud servers entrar conta nuvem servidores
app.action.account_words = account profile name photo picture avatar plan limits delete conta perfil nome foto imagem plano limites excluir
app.action.sign_out_words = sign out log out logout leave switch account sair deslogar trocar conta
# A folder: made, or named again.
app.folder.new_title = Nova pasta em {name}
app.folder.rename_title = Renomear pasta
app.folder.create = Criar pasta
app.folder.new_help_alone = Só você vê a pasta. Depois, o + ao lado dela cria a primeira nota.
app.folder.new_help = Todos do projeto {name} veem a pasta e podem escrever notas nela. Depois, o + ao lado dela cria a primeira nota.
app.folder.rename_help_alone = Só você vê a pasta.
app.folder.rename_help = Todos do projeto {name} veem o novo nome na hora. As notas dentro dela continuam como estão.
# Asked before it is done.
app.remove.title = Remover {name}?
app.remove.confirm = Remover {name}
app.remove.text = A máquina sai do tTerm Web, e os terminais dela são encerrados. Os comandos digitados lá continuam no histórico.
app.remove.computer = O agente é avisado de que o computador foi removido e para de rodar. Para conectar o computador de novo: Adicionar uma máquina e depois Computador.
app.remove.server = O tTerm Web para de entrar no servidor e retira o próprio acesso dele. Se o servidor não responder, o comando para fazer isso aparece em seguida.
app.end.title = Encerrar {label}?
app.end.confirm = Encerrar o terminal
app.end.text = O shell é encerrado, e o que estiver rodando nele é interrompido, como quando se fecha uma janela de terminal. O que ele executou continua na aba e no histórico.
app.delete_note.title = Excluir a nota {title}?
app.delete_note.sub = Na pasta {folder}.
app.delete_note.confirm = Excluir nota
app.delete_note.alone = A exclusão é definitiva.
app.delete_note.shared = Todos do projeto {project} perdem a nota, inclusive quem estiver com ela aberta agora. O registro guarda uma linha: quem a excluiu e quando.
app.delete_folder.title = Excluir a pasta {name}?
app.delete_folder.confirm = Excluir pasta
app.delete_folder.confirm_notes = one: Excluir pasta e {n} nota | other: Excluir pasta e {n} notas
app.delete_folder.empty = A pasta está vazia.
# {names} is the notes' titles, listed: Plan, Ideas and 3 more.
app.delete_folder.notes_go = one: {n} nota vai junto: {names}. | other: {n} notas vão junto: {names}.
app.delete_folder.shared = Todos do projeto {project} perdem as notas, inclusive quem estiver com uma delas aberta agora. O registro guarda uma linha: quem excluiu a pasta e quando.
app.delete_folder.keep = Para manter uma nota, mova-a antes: ⋯ ao lado da nota e depois outra pasta.

# ------------------------------------------------------------ api: what the page says when tTerm Web gives no reason (api.ts)
api.note_changed = A nota foi alterada em outro lugar nesse meio-tempo.
api.sign_in = Entre para continuar.
# {status} is the HTTP status: 502.
api.answered = O tTerm Web respondeu {status}
api.confirm_first = Primeiro confirme que é você.
api.account_changed = Agora há outra conta conectada.

# ------------------------------------------------------------ app_link: the apps for computers, as the site names them (appLink.ts)
app_link.mac = tTerm para Mac
app_link.windows = tTerm para Windows
app_link.linux = tTerm para Linux

# ------------------------------------------------------------ add_machine: the window that adds a server or a computer to a project (AddMachine.tsx)
# When the browser does not let the page copy the command.
add_machine.copy_failed = Não foi possível copiar: selecione o comando e copie manualmente.
# How long the command works, inside add_machine.hint_computer and add_machine.hint_server as {works}.
add_machine.works_once = one: Funciona uma vez, no próximo {n} minuto. | other: Funciona uma vez, nos próximos {n} minutos.
add_machine.title = Adicionar uma máquina
# Before the list of the projects the machine can go to.
add_machine.to_project = Para o projeto
# The two buttons Server and Computer, for screen readers.
add_machine.kind = Tipo de máquina
add_machine.server = Servidor
add_machine.computer = Computador
# Step 1 for a computer, above the command.
add_machine.run_computer = Execute este comando no computador
# Under the command. {works} is add_machine.works_once; sudo stays as it is.
add_machine.hint_computer = Num terminal desse computador, com o seu próprio usuário, sem sudo. {works} Depois, o agente se atualiza sozinho. Um novo comando, rodado mais tarde, instala o agente de novo: o computador continua como está, e os terminais abertos nele são encerrados.
# A fold under the command, for trying an agent that is not released yet.
add_machine.by_hand = Ou inicie o agente manualmente
# {version} is the agent's version: 0.11.0. tterm-agent, Python and websockets are names: they stay as they are.
add_machine.by_hand_hint = A partir de uma cópia do tterm-agent {version} ou mais recente, com um Python que tenha o pacote websockets. Serve para testar um agente que ainda não foi lançado: ele roda enquanto a janela do terminal estiver aberta, e o token vira a chave do computador.
# Step 2, while the window waits for the machine.
add_machine.keep_open = Mantenha esta janela aberta
# A fold: what the command for a computer does, point by point.
add_machine.what_command = O que o comando faz
# {folder} is ~/.tterm-web, {bot_folder} ~/.tterm; launchd and systemd are names: they stay as they are.
add_machine.what_command_puts = Coloca o agente do tTerm em {folder}, um único arquivo para este sistema, das versões publicadas do tTerm, conferido com o checksum do script do comando antes de rodar, e o inicia sempre que você entra no sistema (launchd no macOS, systemd no Linux). O agente do bot do tTerm em {bot_folder}, se houver, continua como está.
add_machine.what_command_updates = O agente se atualiza sozinho, só para versões assinadas pelo build de release do tTerm, e só enquanto nenhum terminal estiver aberto neste computador.
add_machine.what_command_key = Cria uma chave própria para este computador e a guarda nele, legível só por você. O token do comando só serve para conectá-lo, uma única vez.
# root is the name of the system's administrator: it stays as it is.
add_machine.what_command_runs = O agente roda como você, nunca como root, e não abre portas: ele mesmo se conecta ao tTerm Web e mantém essa única conexão. Cada terminal aqui é um shell seu naquele computador.
# {command} is ~/.tterm-web/uninstall.sh.
add_machine.what_command_uninstall = {command} remove tudo.
# Step 1 for a server, above the command.
add_machine.run_server = Execute este comando no servidor
# Under the command. {works} is add_machine.works_once; root and sudo stay as they are.
add_machine.hint_server = {works} Execute como root ou como qualquer usuário com sudo.
# A fold: what the script for a server does, point by point.
add_machine.what_script = O que o script faz
# Here and in the next two, tterm in small letters is the name of the user the script makes on the server: it stays as it is, as sudo and sshd_config do.
add_machine.what_script_user = Cria o usuário tterm, sem senha. Se o bot do tTerm já o criou, ele é reaproveitado.
add_machine.what_script_certificates = Permite que o tTerm Web entre como tterm com certificados que valem dois minutos e são feitos só para este servidor. Nenhuma chave fica no servidor.
add_machine.what_script_sudo = Dá sudo ao tterm, para que você possa administrar o servidor. Um comando retira isso.
add_machine.what_script_safe = Nunca toca no sshd_config e não abre portas. Rodar duas vezes não causa problema.
# {name} is the machine's name.
add_machine.connected = {name} se conectou
# After the machine's system and host: Ubuntu 24.04 · web-01 · in tabs it reads P/web-01.
add_machine.tabs_label = nas abas aparece como {label}
add_machine.open_terminal = Abrir um terminal
add_machine.add_another = Adicionar outra máquina
# {why} is what went wrong, as tTerm Web said it.
add_machine.no_command = Não foi possível gerar um comando: {why}
add_machine.expired_token = Este token expirou: ele vale por 10 minutos.
add_machine.expired_command = Este comando expirou: ele vale por 10 minutos.
add_machine.new_command = Gerar um novo comando
add_machine.failed_computer = Não foi possível adicionar o computador.
add_machine.failed_server = Não foi possível verificar o servidor.
add_machine.still_works = O mesmo comando ainda funciona: corrija o problema e rode de novo.
# While the window waits: the agent or the server has called in, or not yet.
add_machine.agent_in = O agente se conectou. Lendo os dados do computador…
add_machine.server_in = O servidor respondeu. Entrando nele para verificar…
add_machine.waiting_agent = Aguardando o agente…
add_machine.waiting_server = Aguardando o servidor…
# {project} is the project's name; the _unnamed ones are for when it is not known.
add_machine.appears_computer = O computador aparece no projeto {project} alguns segundos depois que o comando terminar.
add_machine.appears_computer_unnamed = O computador aparece no projeto alguns segundos depois que o comando terminar.
add_machine.appears_server = O servidor aparece no projeto {project} assim que o script terminar, normalmente em menos de um minuto.
add_machine.appears_server_unnamed = O servidor aparece no projeto assim que o script terminar, normalmente em menos de um minuto.

# ------------------------------------------------------------ signin: signing in with a code from email, and the quick code (SignIn.tsx)
# When the server does not answer at all.
signin.no_answer = O servidor não está respondendo. Verifique a conexão e tente de novo.
signin.email_lead = Digite seu e-mail e enviaremos um código
# The field for the address, for screen readers.
signin.email = E-mail
# The button, while the code is being sent.
signin.sending = Enviando…
signin.get_code = Receber código
signin.new_here = Primeira vez aqui? Você cria a conta depois do código.
signin.code_resent = Um novo código está a caminho. O anterior não vale mais.
signin.code_title = Digite o código
# {email} is the address the code went to.
signin.code_sent = Enviamos para <b>{email}</b>
# The field for the code, for screen readers.
signin.code_label = Código do e-mail
# A link that counts the seconds down until another code may be sent: New code in 42 s.
signin.resend_in = one: Novo código em {n} s | other: Novo código em {n} s
signin.resend = Enviar um novo código
signin.change_email = Trocar e-mail
signin.no_email = Não chegou? Veja na pasta de spam.
signin.signup_title = Crie sua conta
# The field for one's name, and the words in it while it is empty.
signin.your_name = Seu nome
# The one tick of signing up. <terms> and <privacy> are links to the site's two documents: their names as the site has them in the language.
signin.agree = Concordo com os <terms>Termos de Serviço</terms> e a <privacy>Política de Privacidade</privacy>
# The button, while the account is being made.
signin.creating = Criando…
signin.create = Criar conta
signin.another_email = Usar outro e-mail
# A quick code is four digits that sign one in on this device.
signin.pin_easy = Fácil demais de adivinhar: escolha dígitos que não sejam todos iguais nem em sequência.
signin.pin_mismatch = Os códigos não conferem. Crie o código de novo.
# {name} is the person's first name: Welcome for an account made just now, Hello for one there before.
signin.welcome = Boas-vindas, {name}!
signin.hello = Olá, {name}!
# The quick code, typed a second time.
signin.pin_repeat = Repita o código
signin.pin_repeat_lead = Digite os mesmos quatro dígitos mais uma vez
signin.pin_offer_lead = Crie um código rápido para este dispositivo
# The field for the quick code, for screen readers: the second time, the first time.
signin.pin_repeat_label = O código rápido, mais uma vez
signin.pin_offer_label = Um código rápido
# The link that goes on without a quick code.
signin.not_now = Agora não
# {name} is the person's first name.
signin.welcome_back = Olá de novo, {name}!
signin.pin_lead = Digite seu código rápido
# The field for the quick code, for screen readers.
signin.pin_label = Código rápido
signin.forgot = Esqueceu o código?
signin.switch = Trocar de conta

# ------------------------------------------------------------ connect: in the browser, allowing tTerm for the computer to sign in (Connect.tsx)
connect.no_answer = O tTerm não está respondendo. Verifique a conexão e recarregue esta página.
# {app} is app_link.*: tTerm for Mac. Also the page's title in the browser.
connect.allow_title = Autorizar o {app}?
# The address the app opened is cut short.
connect.incomplete = Este link está incompleto
# Sign in with your browser is the app's button: the words of app_signin.browser.
connect.start_again = Comece de novo no tTerm do seu computador: Entrar pelo navegador.
# Above signing in, after Allow. {app} is app_link.*: tTerm for Mac.
connect.confirm = Para autorizar o {app}, confirme que é você.
connect.signin_other = Entre com a outra conta e depois autorize o {app}.
connect.signin_then = Entre e depois autorize o {app}.
connect.no_connection = Sem conexão
# {computer} is the name of the computer the app runs on, {email} the account's address.
connect.asks = O app em <b>{computer}</b> pede para entrar na sua conta, {email}.
# Above the code that both this page and the app show.
connect.check = Confira se o app mostra o mesmo código
# The button.
connect.allow = Autorizar
connect.another = Não é você? Use outra conta
# Personal is the name of one's own project: it stays as it is. Settings and Devices are the page and its section, in the words of settings.title and devices.title.
connect.small = O computador vira uma máquina em Personal. O app aparece em Configurações, na seção Dispositivos, onde você pode esquecê-lo.
# While the browser goes back to the app. {app} is app_link.*: tTerm for Mac.
connect.back = Voltando para o {app}…
connect.takes_over = O app continua daqui, neste computador.

# ------------------------------------------------------------ app_signin: in tTerm for the computer, signing in with the browser (AppSignIn.tsx)
# The app's first screen, for screen readers.
app_signin.welcome_label = Boas-vindas
app_signin.welcome_title = Boas-vindas ao tTerm
app_signin.welcome_lead = Os terminais deste computador funcionam na hora, sem precisar de conta.
# The button: the app opens the browser, to sign in there.
app_signin.browser = Entrar pelo navegador
# The button: not now, sign in later.
app_signin.later = Depois
app_signin.welcome_note = Ao entrar, seus servidores, projetos, notas e equipe vêm para esta janela. Você pode fazer isso quando quiser, na parte de baixo da barra lateral.
app_signin.cancelled = O login foi cancelado no navegador.
# The title of the window that waits while one signs in in the browser.
app_signin.link_title = Entrar pelo navegador
# {host} is app.tterm.net. The code comes under it.
app_signin.link_note = O tTerm abriu {host} no seu navegador. Entre por lá e autorize este computador quando a página pedir. A página também mostra este código:
app_signin.until_then = Enquanto isso, este computador funciona como antes.
app_signin.open_again = Abrir a página de novo

# ------------------------------------------------------------ welcome: the first screen, while nothing is connected yet (Welcome.tsx)
# {name} is the person's first name.
welcome.title = Boas-vindas ao tTerm, {name}
welcome.lead = Um terminal para os seus servidores e computadores, direto no navegador. Nada para instalar neste computador, nenhuma chave para copiar, nenhuma porta para abrir.
welcome.connect = Conecte sua primeira máquina
# The two cards: the kinds of machine to connect.
welcome.server = Servidor
welcome.server_note = Um servidor VPS ou na nuvem que você acessa por SSH. Rode um comando nele, e ele aparece aqui.
# Small labels under the cards: Linux, One command; macOS, Linux, No open ports.
welcome.one_command = Um comando
welcome.computer = Computador
welcome.computer_note = Um Mac ou uma máquina Linux em casa ou no escritório, mesmo atrás de NAT. Um pequeno agente mantém a conexão.
welcome.no_ports = Sem portas abertas
# The three steps below, for screen readers.
welcome.how = Como funciona
welcome.step_add = Adicione uma máquina
welcome.step_add_text = Rode um comando nela. O comando funciona uma vez, por 10 minutos.
welcome.step_open = Abra um terminal
welcome.step_open_text = Cada comando vira um bloco: copie, execute de novo, compartilhe um link.
welcome.step_team = Traga sua equipe
welcome.step_team_text = Papéis, um registro compartilhado, e você sempre vê quem está observando.
# {project} is the project's name and {code} its code: P. In {code}/name, name stands for a machine's name, as in P/web-01.
welcome.footnote = Seu primeiro projeto, {project}, já está pronto, com o código {code}: as máquinas dele aparecem nas abas como {code}/nome.

# ------------------------------------------------------------ need_account: New project and Add machine in the app before signing in (NeedAccount.tsx)
need_account.machine_title = Adicionar uma máquina
need_account.machine_note = Servidores e outros computadores vêm com uma conta do tTerm. Ao entrar, você cria uma, se ainda não tiver.
need_account.server = Servidor
need_account.server_text = Um servidor VPS ou na nuvem que você acessa por SSH. Rode um comando nele, e ele aparece aqui.
need_account.computer = Computador
need_account.computer_text = Um Mac ou uma máquina Linux em casa ou no escritório, mesmo atrás de NAT.
# What the Free plan gives. {machines} is need_account.plan_machines, {terminals} need_account.plan_terminals.
need_account.machine_plan = Até {machines} e {terminals}.
# In need_account.machine_plan, after "Up to": in the form the words take there.
need_account.plan_machines = one: {n} máquina | other: {n} máquinas
need_account.plan_terminals = one: {n} terminal aberto | other: {n} terminais abertos
need_account.machine_stays = Este computador continua como está, com os terminais dele.
need_account.project_title = Novo projeto
need_account.project_note = Mais projetos vêm com uma conta do tTerm. Ao entrar, você cria uma, se ainda não tiver.
need_account.personal = Projetos pessoais
need_account.personal_text = Só você. Máquinas, terminais e notas são só seus.
need_account.shared = Projetos compartilhados
# A small label on Shared projects: they are not there yet.
need_account.soon = Em breve
need_account.shared_text = Com a sua equipe. Você convida pessoas: elas abrem terminais nas máquinas do projeto e editam as notas dele.
need_account.project_plan = Projetos próprios, cada um com as suas máquinas, terminais e notas. Projetos compartilhados com uma equipe chegam em breve.
# Personal is the name of one's own project: it stays as it is.
need_account.project_stays = O Personal continua como está, com este computador, os terminais e as notas dele.
# The button that closes the window.
need_account.not_now = Agora não

# ------------------------------------------------------------ updates: tTerm for Mac updating itself, only in the app (Updates.tsx)
# The title of Restart to update in the top bar. {version} is the new version: 0.5.1.
updates.pill_title.mac = O tTerm {version} está pronto. A reinicialização leva alguns segundos; se houver terminais rodando neste Mac, o tTerm pergunta antes.
updates.pill_title.computer = O tTerm {version} está pronto. A reinicialização leva alguns segundos; se houver terminais rodando neste computador, o tTerm pergunta antes.
updates.restarting = Reiniciando…
# A button, in the top bar and in Settings: tTerm restarts and the new version goes in.
updates.restart_to_update = Reiniciar para atualizar
# The card above the account in the sidebar, and Settings. {version} is the new version.
updates.ready = O tTerm {version} está pronto
updates.restart_takes = A reinicialização leva alguns segundos.
# The card's button.
updates.restart = Reiniciar
# A link to the notes of the new version.
updates.whats_new = Novidades
# Once, after the restart. {version} is the version now: 0.5.1.
updates.updated = O tTerm foi atualizado para {version}
# Settings, Updates: the two ways tTerm takes a new version.
updates.auto = Atualizar automaticamente
updates.auto_text.mac = A nova versão é instalada quando o tTerm é encerrado e, com o tTerm na barra de menus e a janela fechada, assim que nada estiver rodando neste Mac.
updates.auto_text.computer = A nova versão é instalada quando o tTerm é encerrado e, com o tTerm na barra de menus e a janela fechada, assim que nada estiver rodando neste computador.
updates.ask = Perguntar antes
# "Restart to update" is the button (updates.restart_to_update): the same words.
updates.ask_text = A nova versão espera até você clicar em Reiniciar para atualizar.
# The section of Settings.
updates.title = Atualizações
updates.about = O tTerm para Mac se atualiza sozinho a partir das versões publicadas do tTerm. Só uma versão assinada pelo tTerm é instalada.
# For screen readers: the two ways above.
updates.how = Como o tTerm se atualiza
# Beside Update by itself.
updates.recommended = Recomendado
updates.checking = Procurando uma nova versão…
# {version} is the new version.
updates.downloading = Baixando o tTerm {version}…
# {version} is the version this app is; {day} is today, yesterday or on 12 Oct (time.today, time.yesterday, time.on_day); {time} is 10:02.
updates.you_have_downloaded = Você tem a versão {version}. Baixada {day} às {time}.
updates.you_have = Você tem a versão {version}.
# {version} is the new version; why it failed comes under it, as tTerm says it.
updates.failed = Não foi possível atualizar para a versão {version}
# {site} is tterm.net. Applications is the folder of the Mac: as macOS names it in the language.
updates.download = Ou baixe o tTerm em <link>{site}</link> e arraste-o para a pasta Aplicativos.
# A button: tTerm moves itself from the disk image to Applications.
updates.move = Mover para Aplicativos
# {ago} is when tTerm last looked: just now, 5 min ago, 2 h ago, yesterday, on 12 Oct (time.*).
updates.looked = O tTerm {version} está atualizado. Verificado {ago}.
updates.this_is = Este é o tTerm {version}.
# A button: look for a new version now.
updates.check_now = Verificar agora

# ------------------------------------------------------------ account: the name, the photo and the plan (Account.tsx)
# The file chosen for one's photo is none.
account.not_a_photo = Este arquivo não é uma foto que o tTerm aceita. Escolha um JPEG, PNG ou WebP de até 5 MB.
# What the plan allows, after "Up to" (account.up_to): Up to 50 machines and 24 open terminals.
account.limit_machines = one: {n} máquina | other: {n} máquinas
account.limit_terminals = one: {n} terminal aberto | other: {n} terminais abertos
# {limits} is one or both of the two above, as a list.
account.up_to = Até {limits}
account.no_limits = Sem limites
# A meter of the plan, beside its label (Machines, Open terminals): 3 of 50.
account.used_of = {used} de {limit}
account.used_no_limit = {used}, sem limite
# The title of Close at the top of Account and Settings.
account.close_title = Voltar para onde você estava
account.photo_removed = Foto removida: suas iniciais voltaram.
# For screen readers: the card with one's name and photo.
account.profile = Perfil
account.change_photo = Trocar foto
account.add_photo = Adicionar uma foto
account.your_name = Seu nome
account.saving = Salvando…
account.edit_name = Editar nome
account.remove_photo = Remover foto
# Under the photo's buttons: what the photo is for.
account.photo_hint = Ela aparece ao lado do seu nome, no lugar das suas iniciais.
# For screen readers: the file chooser for the photo.
account.choose_photo = Escolher uma foto
# Under one's email address. {email} is support's address.
account.address_note = Você entra com este endereço. Para trocá-lo, escreva para <link>{email}</link>.
# The section of the plan; its name (Free) stays as it is.
account.plan = Plano
account.plan_note = O tTerm é grátis enquanto o construímos. Outros planos vão aparecer aqui, e avisaremos você antes de qualquer mudança.
# The labels of the plan's two meters.
account.machines = Máquinas
account.open_terminals = Terminais abertos
account.photo_saved = Foto salva: ela aparece na parte de baixo da barra lateral e no menu da conta.
# {email} is support's address.
account.delete_note = Para excluir sua conta, escreva para {email} a partir do endereço com que você entra.

# ------------------------------------------------------------ devices: where one is signed in, in Settings (Devices.tsx)
# On the sign-in screen, after this very device was forgotten.
devices.this_forgotten = Este dispositivo foi esquecido. Entre com um código do e-mail.
# {device} is a device's label: tTerm for Mac on MacBook-Pro. tTerm there now works with that computer only, as before signing in.
devices.app_signed_out = {device} saiu da conta: lá, o tTerm agora funciona só com aquele computador.
# {device} is a device's label: Chrome on macOS.
devices.forgotten = {device} foi esquecido: lá, o login volta a ser pelo e-mail.
# On the sign-in screen.
devices.all_forgotten = Todos os dispositivos foram esquecidos. Agora cada um entra com um código do e-mail.
devices.about = Navegadores em que você entra com o seu código rápido, e o tTerm nos seus computadores, com login feito pelo navegador. Em qualquer outro lugar, é preciso um código do e-mail.
devices.idle = Depois de 8 horas sem nenhuma atividade, o tTerm pede o código rápido de novo. Seus terminais continuam rodando.
devices.none = Nenhum navegador está memorizado. Cada login pede um código do e-mail.
# A mark beside the device one uses now.
devices.this_device = Este dispositivo
# Under a device's label. {created} and {used} are how long ago: just now, 3 minutes ago, 2 days ago (time.ago_*).
devices.app_times = Login {created}, último uso {used}
devices.browser_times = Marcado como confiável {created}, último login {used}
# A button beside each device.
devices.forget = Esquecer
# The heading, and the red button that does it.
devices.forget_all = Esquecer todos os dispositivos
devices.forget_all_text = Todos os dispositivos são esquecidos e todas as sessões são encerradas, inclusive esta. Depois, cada navegador vai pedir um código do e-mail. Seus terminais continuam rodando.
# The button that asks first.
devices.forget_all_ask = Esquecer todos os dispositivos…

# ------------------------------------------------------------ this_computer: the computer the app runs on, in Settings (ThisComputer.tsx)
# How the link to tTerm Web is, under the switch. {name} is the name tTerm Web knows this computer by.
this_computer.online_terminals = one: Online no tTerm Web como {name} · {n} terminal aberto de lá | other: Online no tTerm Web como {name} · {n} terminais abertos de lá
this_computer.online = Online no tTerm Web como {name}
this_computer.connecting = Conectando ao tTerm Web…
this_computer.waiting = Ainda não conectado ao tTerm Web.
this_computer.no_network = Sem rede. O tTerm tenta de novo sozinho.
# "Turn this on": the switch above.
this_computer.removed.mac = Este Mac foi removido do tTerm Web, então não está acessível por lá. Ative esta opção para adicioná-lo de novo.
this_computer.removed.computer = Este computador foi removido do tTerm Web, então não está acessível por lá. Ative esta opção para adicioná-lo de novo.
this_computer.closed.mac = Agora este Mac não está acessível pelo tTerm Web.
this_computer.closed.computer = Agora este computador não está acessível pelo tTerm Web.
# The section's title, on a Mac too.
this_computer.title = Este computador
# {name} is this computer's machine in tTerm, {project} its project.
this_computer.about = {name}, no projeto {project}. Os terminais rodam aqui, mesmo sem internet.
# The switch.
this_computer.open = Acesso pelo tTerm Web e pelo celular
this_computer.open_text.mac = O tTerm Web e o celular abrem terminais neste Mac enquanto o tTerm roda aqui: com a janela fechada, ele fica na barra de menus e abre quando você inicia a sessão. Desativado: lá, este Mac fica offline; aqui, tudo funciona como antes.
this_computer.open_text.computer = O tTerm Web e o celular abrem terminais neste computador enquanto o tTerm roda aqui: com a janela fechada, ele fica na barra de menus e abre quando você inicia a sessão. Desativado: lá, este computador fica offline; aqui, tudo funciona como antes.
# Asked before the switch goes off while terminals opened from tTerm Web run here.
this_computer.ask_title.mac = Fechar o acesso do tTerm Web a este Mac?
this_computer.ask_title.computer = Fechar o acesso do tTerm Web a este computador?
# The red button.
this_computer.turn_off = Desativar
this_computer.ask_text.mac = one: {n} terminal aberto pelo tTerm Web neste Mac será encerrado, e lá este Mac fica offline. | other: {n} terminais abertos pelo tTerm Web neste Mac serão encerrados, e lá este Mac fica offline.
this_computer.ask_text.computer = one: {n} terminal aberto pelo tTerm Web neste computador será encerrado, e lá este computador fica offline. | other: {n} terminais abertos pelo tTerm Web neste computador serão encerrados, e lá este computador fica offline.

# ------------------------------------------------------------ photo: one's photo, cut to a circle (PhotoDialog.tsx)
# The photo could not be made here, in the browser.
photo.browser_failed = O navegador não conseguiu gerar a foto.
photo.no_answer = O tTerm não respondeu. Tente de novo.
# The dialog's title.
photo.title = Sua foto
# For screen readers: the photo in its frame, which the arrow keys move and + and - zoom.
photo.frame = Sua foto num círculo. Arraste-a ou mova-a com as setas; + e - dão zoom.
# The slider that makes the photo bigger in the circle.
photo.zoom = Zoom
photo.drag = Arraste a foto para posicioná-la no círculo.
# Beside the photo in three small sizes.
photo.preview = Como os outros veem
photo.note = JPEG, PNG ou WebP de até 5 MB. O tTerm guarda uma cópia de 256 pixels, sem os dados que a foto traz sobre si mesma, como o lugar onde foi tirada.
photo.saving = Salvando…
photo.save = Salvar foto

# ------------------------------------------------------------ confirm: asking before what cannot be undone (Confirm.tsx)
confirm.no_answer = O tTerm Web não respondeu.
confirm.copy_failed = Não foi possível copiar: selecione o comando e copie manualmente.
# After a server is removed. {name} is the server's name.
confirm.removed = O servidor {name} foi removido
# The command that takes the access back comes after it.
confirm.removed_text = O tTerm Web não o lista mais nem entra nele. O servidor não respondeu, então o acesso do tTerm Web continua lá até você retirá-lo no próprio servidor:
# {user} is the server's user tterm; {command} is the command that removes it and its sudo rule.
confirm.user_stays = O usuário {user} e a regra de sudo dele continuam, para o bot do tTerm, se você o usa. Para removê-los também: {command}

# ------------------------------------------------------------ project_dialog: the windows of projects of one's own (ProjectDialog.tsx)
project_dialog.code_invalid = O código deve ter de 1 a 4 letras ou dígitos.
# When saving or moving failed and tTerm Web gave no reason.
project_dialog.no_answer = O tTerm Web não respondeu.
project_dialog.edit_title = Editar projeto
project_dialog.new_title = Novo projeto
# Under the title, editing a project others are in: its name, code and color.
project_dialog.edit_sub = Só o proprietário e os administradores podem mudar isto.
project_dialog.new_sub = Um projeto tem máquinas e notas próprias, separadas dos seus outros projetos.
# The label of the project's name.
project_dialog.name = Nome
# In the empty name field: an example of a project's name.
project_dialog.name_example = Por exemplo, Cliente X
# The label of the project's code: the 1 to 4 letters or digits on its badge.
project_dialog.code = Código curto
project_dialog.code_help_alone = De 1 a 4 letras ou dígitos. O código identifica o projeto nas abas e na barra lateral.
project_dialog.code_help_shared = De 1 a 4 letras ou dígitos. O código identifica o projeto nas abas e na barra lateral, para todos do projeto ao mesmo tempo.
project_dialog.code_help_new = O código é gerado a partir do nome, e você pode mudá-lo: de 1 a 4 letras ou dígitos. Ele identifica o projeto nas abas e na barra lateral.
# The label of the project's colors.
project_dialog.color = Cor
# "Whole project" and "Settings" are named as the choice and the page are (settings.tint_block, settings.title).
project_dialog.color_help_new = A cor é escolhida para ser diferente dos seus outros projetos, e você pode mudá-la. Ela preenche o selo do código e, se você escolher Projeto inteiro nas Configurações, o projeto todo na barra lateral.
project_dialog.color_help_alone = A cor preenche o selo do código e, se você escolher Projeto inteiro nas Configurações, o projeto todo na barra lateral.
project_dialog.color_help_shared = A cor preenche o selo do código para todos do projeto e, para quem escolher Projeto inteiro nas próprias Configurações, o projeto todo na barra lateral.
# Above how the project will look in the sidebar and on a tab (a noun).
project_dialog.preview = Prévia
# In the preview, in place of the project's name while none is typed.
project_dialog.preview_name = Projeto
project_dialog.new_next = O projeto é seu. Em seguida, você adiciona uma máquina ou traz uma de outro projeto, e escreve notas.
project_dialog.create = Criar projeto
# The title of the window that moves a machine to another project: {machine} is its name.
project_dialog.move_title = Mover {machine}
project_dialog.move_sub = Para outro projeto seu.
# Next to each project one may move to: whether others are in it.
project_dialog.only_you = só você
project_dialog.with_others = com outras pessoas
# {project} is the project it goes to, {code} that project's code, {name} the machine's name there: CX/web-01.
project_dialog.move_becomes = No projeto {project}, a máquina vira {code}/{name}. Os terminais continuam rodando, e nada muda na própria máquina.
# The same, when its name is taken there: {machine} is its name now, {name} the one it gets (web-01-2).
project_dialog.move_becomes_taken = No projeto {project}, a máquina vira {code}/{name}: o nome {machine} já está em uso lá. Os terminais continuam rodando, e nada muda na própria máquina.
# The button: {project} is the project's name.
project_dialog.move_to = Mover para {project}
# The button while there is nothing to pick (a verb).
project_dialog.move = Mover
# Next to a folder one may move a note to: it has no notes.
project_dialog.folder_empty = vazia
# Next to a project without folders: the note goes to a new folder there, named as its own.
project_dialog.folder_new = uma pasta nova, criada lá para ela
# The title of the window that moves a note to another project: {note} is its title.
project_dialog.move_note_title = Mover {note}
project_dialog.move_note_sub = Agora no projeto {project}, pasta {folder}. Escolha uma pasta em outro projeto.
# Who sees the note in the project it goes to.
project_dialog.note_alone = No projeto {project}, só você vê a nota.
project_dialog.note_shared = Todos do projeto {project} veem e editam a nota.
# {project} is the project the note leaves.
project_dialog.note_leaves = Todos os outros do projeto {project} perdem a nota. O registro de {project} guarda uma linha: quem a tirou de lá e quando.
# The ticks: the items of a checklist ticked off, each with who ticked it.
project_dialog.note_keeps = O título, o texto e o histórico vão junto, e também as marcações, com quem as fez.
# The button: {folder} is the name of the folder made there, the note's own folder's name.
project_dialog.move_to_new_folder = Mover para uma nova pasta {folder}
project_dialog.move_to_folder = Mover para {folder}
project_dialog.delete_title = Excluir {project}?
# A project with machines in it cannot be deleted yet: {machine} is its machine's name.
project_dialog.delete_machine_first = Primeiro mova ou remova a máquina do projeto: {machine}.
# {machines} is their names, listed: web-01, web-02 and db.
project_dialog.delete_machines_first = Primeiro mova ou remova as máquinas do projeto: {machines}.
# "Move to another project" and "Remove machine" are the items of a machine's ⋯ menu (projectpage.move_machine, projectpage.remove_machine).
project_dialog.delete_how = Na página do projeto, ⋯ ao lado de uma máquina: Mover para outro projeto ou Remover máquina. Depois disso, o projeto pode ser excluído.
project_dialog.cant_undo = Isso não pode ser desfeito.
# {n} is how many folders the project has; {notes} is project_dialog.delete_notes.
project_dialog.delete_folders = one: {n} pasta com {notes} será excluída junto. | other: {n} pastas com {notes} serão excluídas junto.
# How many notes are in those folders, inside project_dialog.delete_folders: 2 folders with 5 notes are deleted with it.
project_dialog.delete_notes = one: {n} nota | other: {n} notas
project_dialog.delete_no_notes = O projeto não tem notas.
# Above the field the project's name is typed in.
project_dialog.delete_type = Digite {project} para confirmar
# The button.
project_dialog.delete_button = Excluir {project}

# ------------------------------------------------------------ projectpage: a project's page (ProjectPage.tsx)
# The end of the line under the project's name: 2 machines · 1 terminal open · you are the owner.
projectpage.role_owner = seu papel: proprietário
projectpage.role_admin = seu papel: administrador
projectpage.role_member = seu papel: membro
projectpage.role_observer = seu papel: observador
# A terminal busy with a command whose line is not known.
projectpage.command_running = Um comando está rodando
# {duration} is how long the command has run: less than a minute, 3 minutes, an hour (time.for_*).
projectpage.running_for = rodando há {duration}
# The same, while it is not known how long.
projectpage.running = rodando
# A terminal whose machine is away: {machine} is its name.
projectpage.waits_for = aguardando {machine}
# Under a terminal's name being typed. Enter and Esc are the keys.
projectpage.rename_hint = Enter salva, Esc cancela.
# On a terminal's name.
projectpage.double_click = Clique duas vezes para renomear
# The button next to a terminal: go to it (a verb).
projectpage.open = Abrir
# An offline computer's state, next to its name: {ago} is how long ago (time.ago_*): Last seen 14 minutes ago.
projectpage.last_seen = Última conexão {ago}
# A computer's state, next to its name.
projectpage.offline = Offline
projectpage.online = Online
# On New terminal: {machine} is the machine's name.
projectpage.offline_title = {machine} está offline: em repouso, ou o agente não está rodando
projectpage.new_terminal_title = Um novo terminal em {machine}
# Said when New terminal is pressed on an offline computer: {seen} is time.last_seen: last seen 14 minutes ago.
projectpage.offline_wait_seen = {machine} está offline, {seen}: volta quando o agente se conectar.
projectpage.offline_wait = {machine} está offline: volta quando o agente se conectar.
projectpage.new_terminal = Novo terminal
# The ⋯ button next to a machine, for screen readers: {machine} is its name.
projectpage.machine_menu = {machine}: menu da máquina
# The tip on that button: the items of its menu (projectpage.move_machine, projectpage.remove_machine).
projectpage.machine_menu_title = Mover para outro projeto, Remover máquina
# An item of a machine's menu, and the tip on its ⋯ button when it is the only item.
projectpage.remove_machine = Remover máquina
# An item of a machine's menu.
projectpage.move_machine = Mover para outro projeto
projectpage.no_terminals = Nenhum terminal aberto
# Who changed a note last, and when: {ago} is just now, 5 min ago, yesterday, on 12 Oct (time.*).
projectpage.edited_you = Você, {ago}
# The same, someone else: {name} is their first name.
projectpage.edited_by = {name}, {ago}
# A note's author when it is oneself, in the note's menu: You, the owner and admins can delete it.
projectpage.you = Você
# A checklist's progress, in place of its first line: {n} items ticked of {total}.
projectpage.done = one: {n} de {total} concluído | other: {n} de {total} concluídos
# A note without text yet, in place of its first line.
projectpage.note_empty = Vazia
# The ⋯ button next to a note, for screen readers: {note} is its title.
projectpage.note_menu = {note}: menu da nota
# The tip on that button: what its menu has.
projectpage.note_menu_title_move = Pasta, Mover para outro projeto, Copiar como Markdown, Excluir nota
projectpage.note_menu_title = Pasta, Copiar como Markdown, Excluir nota
# The end of the line under the project's name when nobody else is in it: 1 machine · 2 terminals open · only you.
projectpage.only_you = só você
# The tip on the project's code, next to its name.
projectpage.short_code = Código curto
# The pencil next to the project's name.
projectpage.edit = Editar nome, código e cor
# A heading.
projectpage.machines = Máquinas
# Next to the heading Machines.
projectpage.machines_alone = Só você abre terminais nelas
projectpage.machines_shared = Seus terminais nelas
projectpage.add_machine = Adicionar máquina
# The two kinds of machine one can add, in a project without machines.
projectpage.server = Servidor
projectpage.server_text = Um servidor VPS ou na nuvem que você acessa por SSH. Rode um comando nele, e ele aparece aqui.
projectpage.computer = Computador
projectpage.computer_text = Um Mac ou uma máquina Linux em casa ou no escritório, mesmo atrás de NAT. Um pequeno agente mantém a conexão.
# "Move to another project" is the item of a machine's ⋯ menu (projectpage.move_machine).
projectpage.move_hint = Já tem a máquina em outro projeto? Na página daquele projeto, ⋯ ao lado da máquina e depois Mover para outro projeto.
# On the page of Personal, the project each person has for themselves: {project} is its name.
projectpage.personal_title = O projeto {project} é só seu
projectpage.personal_text = Ninguém pode ser convidado para cá. Para manter outras máquinas separadas, ou mais tarde para trabalhar com outras pessoas, crie um projeto e mova máquinas para ele.
projectpage.new_project = Novo projeto
# A heading.
projectpage.notes = Notas
# Next to the heading Notes.
projectpage.notes_alone = Só você vê as notas do projeto {project}. As pastas mantêm tudo em ordem
projectpage.notes_shared = Todos do projeto {project} leem e editam as notas. As pastas mantêm tudo em ordem
projectpage.new_folder = Nova pasta
projectpage.no_notes = Nenhuma nota ainda
# Runbooks, Access, Checklists: examples of folders' names.
projectpage.no_notes_text = As notas ficam em pastas, assim como os terminais ficam nas máquinas. Comece com uma: Runbooks, Acessos, Checklists.
# A folder without notes, next to its name.
projectpage.folder_empty = Vazia
# Who made a folder: {name} is their first name.
projectpage.made_by_you = criada por você
projectpage.made_by = criada por {name}
projectpage.new_note = Nova nota
# The ⋯ button next to a folder, for screen readers: {folder} is its name.
projectpage.folder_menu = {folder}: menu da pasta
# The tip on that button: what its menu has.
projectpage.folder_menu_title = Renomear pasta, Excluir pasta
# "New note" is the button next to the folder's name (projectpage.new_note).
projectpage.folder_no_notes_writes = Nenhuma nota ainda. O botão Nova nota cria a primeira aqui
# A heading at the end of the page: {project} is the project's name.
projectpage.delete_title = Excluir {project}
projectpage.delete_text = As pastas e as notas vão junto. Antes, as máquinas são movidas para outro projeto ou removidas.
projectpage.delete_project = Excluir projeto

# ------------------------------------------------------------ machines: the machines page (Machines.tsx)
# What sudo does on the machine, after "sudo" in what tTerm Web learned about it.
machines.sudo_works = funciona
machines.sudo_password = pede senha
machines.sudo_missing = não disponível
# What tTerm Web learned about a machine when it connected: the labels, each with its value.
machines.system = Sistema
machines.kernel = Kernel
machines.cpu = CPU
machines.cores = one: {n} núcleo | other: {n} núcleos
machines.memory = Memória
machines.disk = Disco
# {free} and {total} are sizes: 7.8 GB free of 50 GB.
machines.disk_free = {free} livres de {total}
# The package manager: apt, brew.
machines.packages = Pacotes
machines.shell = Shell
# {shell} is the shell its terminals start, {shells} all the shells it has: zsh (has bash, zsh).
machines.shell_has = {shell} (tem {shells})
machines.commands = Comandos
# How many commands tTerm Web knows there.
machines.commands_known = one: {n} conhecido | other: {n} conhecidos
# The version of the agent, or of tTerm for the computer.
machines.agent = Agente
# The account on the machine the terminals run as: root, deploy.
machines.account = Usuário
# A computer's state on its card: {seen} is time.last_seen: offline, last seen 14 minutes ago.
machines.offline_seen = offline, {seen}
machines.offline = offline
machines.online = online
machines.offline_note = O computador está em repouso ou offline, ou o agente não está rodando. Ele volta sozinho quando o agente conseguir se conectar; esta página percebe em até dez segundos.
# On Open a terminal while the computer is offline.
machines.offline_title = Está offline: em repouso, ou o agente não está rodando
machines.open_terminal = Abrir um terminal
# A terminal running on the machine: {label} is as its tab shows it (P/web-01 · 2).
machines.back_to = Voltar para {label}, ainda rodando
# The tip on Remove: {machine} is the machine's name.
machines.remove_title = Tirar {machine} do tTerm Web
# The button: take the machine out (a verb).
machines.remove = Remover
# The page's heading.
machines.title = Máquinas
machines.add = Adicionar uma máquina
machines.lead = Um terminal continua rodando quando você fecha a aba dele: ele espera aqui e na barra lateral até o shell ser encerrado.
# A size: {size} is a number as the language writes it, 16 or 7.5.
machines.gb = {size} GB

# ------------------------------------------------------------ note_view: a note in its tab (NoteView.tsx)
# Said for a moment at the bottom of the page. {why} is the reason tTerm
# Web gave, as it gave it.
note_view.not_saved = Não foi possível salvar: {why}
note_view.draft_back = O que foi digitado nesta nota e não foi salvo está de volta.
# When tTerm Web gives no reason.
note_view.no_answer = O tTerm Web não respondeu.
# Ticking a checklist item did not get through.
note_view.no_tick = Não foi possível marcar: {why}
# The note's tab was closed with what was typed in it not saved. {title} is
# the note's title, or note.untitled.
note_view.kept_draft = {title}: o que foi digitado ainda não foi salvo. Fica guardado neste navegador e volta quando você abrir a nota de novo.
note_view.copied_markdown = Copiado como Markdown.
note_view.no_copy = Não foi possível copiar: o navegador não permitiu.
note_view.no_move = Não foi possível mover: {why}
# Under the note's title, the parts of one line with dots between: who
# started it and when; or who edited it last and when · who wrote it and
# on which day; then who sees it. Someone is a person no longer known.
# {name} is a person's first name; {ago} is how long ago, short: just now,
# 5 min ago, yesterday, on 12 Oct; {folder} is a folder's name.
note_view.someone_started = Criada por alguém {ago} na pasta {folder}
note_view.you_started = Criada por você {ago} na pasta {folder}
note_view.started = Criada por {name} {ago} na pasta {folder}
note_view.someone_edited = Editada por alguém {ago}
note_view.you_edited = Editada por você {ago}
note_view.edited = Editada por {name} {ago}
# {day} is today, yesterday or on 12 Oct.
note_view.someone_wrote = Escrita por alguém {day}
note_view.you_wrote = Escrita por você {day}
note_view.wrote = Escrita por {name} {day}
# The end of the same line, after a dot. {project} is a project's name.
note_view.only_you = só você vê
note_view.everyone_edits = todos do projeto {project} podem editar
# The note was deleted while it was open here.
note_view.gone_title = Esta nota foi excluída
note_view.gone_text = A nota, ou a pasta em que ela estava, foi excluída em outra aba ou outro dispositivo.
note_view.close_tab = Fechar a aba
note_view.copy_what_was_here = Copiar o que estava aqui como Markdown
note_view.no_open = Não foi possível abrir a nota: {why}
# The ⋯ beside where the note is: what screen readers say, and the tip
# under the mouse, which lists what is in its menu.
note_view.menu = Menu da nota
note_view.menu_title_move = Pasta, Mover para outro projeto, Copiar como Markdown, Excluir nota
note_view.menu_title = Pasta, Copiar como Markdown, Excluir nota
# The field of the note's title, for screen readers.
note_view.title = Título
# The note was saved meanwhile from elsewhere, changed in the same places.
note_view.conflict = Esta nota foi alterada em outro lugar enquanto você escrevia, nos mesmos trechos. Nesses trechos, manter a sua versão ou a outra? Todo o resto mantém as alterações das duas.
note_view.keep_mine = Manter a minha
note_view.keep_theirs = Manter a outra versão

# ------------------------------------------------------------ note_editor: a note's blocks, written in place (NoteEditor.tsx)
# The kinds of block: what screen readers say of one, and what an empty one
# shows. Heading, Code, Divider and Text are also in the list that / opens.
note_editor.text = Texto
note_editor.heading = Título
note_editor.list_item = Item de lista
note_editor.checklist_item = Item de checklist
note_editor.code = Código
note_editor.divider = Divisor
# In the list that / opens: what a block can become. What is typed after
# the / picks from these names.
note_editor.checklist = Checklist
note_editor.list = Lista
# Who ticked a checklist item, beside it: You · 10:02, Denis · 12 Oct.
note_editor.you = Você
# The same, for a person no longer known.
note_editor.someone = Alguém
# What an empty note shows. The marks # - [ ] \`\`\` and / are typed as they
# are; the words after them are the language's own.
note_editor.start_writing = Comece a escrever. O Markdown funciona enquanto você digita: # título, - [ ] checklist, \`\`\` código. Digite / para o resto.
# What an empty line of text shows.
note_editor.type_slash = Digite / para checklist, título, código
# A checklist item's box, for screen readers.
note_editor.untick = Concluído: desmarcar
note_editor.tick = Marcar como concluído
note_editor.no_copy = Não foi possível copiar: selecione o texto e copie manualmente.
# The list that / opens, for screen readers.
note_editor.turn_into = Transformar em

# ------------------------------------------------------------ menus: the menus behind ⋯, and the window that names a folder (Menus.tsx)
# A note's menu: over the project's folders, the one the note is in
# checked; a click moves it to another.
menus.folder = Pasta
menus.move_out = Mover para outro projeto…
menus.copy_markdown = Copiar como Markdown
menus.delete_note = Excluir nota
# Instead of Delete note, for one who may not: who may. {name} is the first
# name of the note's author.
menus.note_rights_move = {name}, o proprietário e os administradores podem movê-la para outro projeto ou excluí-la
menus.note_rights_delete = {name}, o proprietário e os administradores podem excluí-la
# The same, when the note's author is no longer known.
menus.note_rights_move_someone = Quem criou a nota, o proprietário e os administradores podem movê-la para outro projeto ou excluí-la
menus.note_rights_delete_someone = Quem criou a nota, o proprietário e os administradores podem excluí-la
# A folder's menu.
menus.rename_folder = Renomear pasta
menus.delete_folder = Excluir pasta
# Instead of Delete folder, for one who may not.
menus.folder_rights = Só o proprietário e os administradores podem excluir uma pasta com notas
# The window that names a folder, a new one or one renamed. First what it
# says when tTerm Web gives no reason.
menus.no_answer = O tTerm Web não respondeu.
# The field of the folder's name, and an example of one in it.
menus.name = Nome
menus.name_example = Por exemplo, Runbooks

# ------------------------------------------------------------ search: search over everything, by ⌘K or Search on the right of the tabs (Search.tsx)
# The kinds of what is found: the buttons above the list, and the heads of
# its groups.
search.kind_commands = Comandos
search.kind_output = Saída
search.kind_notes = Notas
search.kind_terminals = Terminais
search.kind_machines = Máquinas
search.kind_projects = Projetos
search.kind_actions = Ações
# The kind of the line chosen, on top of the preview beside the list.
search.label_command = Comando
search.label_output = Saída
search.label_note = Nota
search.label_terminal = Terminal
search.label_machine = Máquina
search.label_project = Projeto
search.label_action = Ação
# Nothing found. {text} is what was typed; Commands, Output… are the button
# chosen above the list (search.kind_*).
search.nothing_for = Nada encontrado para “{text}”.
search.nothing_in_commands = Nada encontrado para “{text}” em Comandos.
search.nothing_in_output = Nada encontrado para “{text}” em Saída.
search.nothing_in_notes = Nada encontrado para “{text}” em Notas.
search.nothing_in_terminals = Nada encontrado para “{text}” em Terminais.
search.nothing_in_machines = Nada encontrado para “{text}” em Máquinas.
search.nothing_in_projects = Nada encontrado para “{text}” em Projetos.
search.nothing_in_actions = Nada encontrado para “{text}” em Ações.
# How a command found ended: stopped (it has no exit code), or exit 1.
# {code} is its exit code.
search.stopped = interrompido
search.exit = retorno {code}
# How often it ran, at the end of the line under a command:
# P/web-01 · ~/app · main · exit 0 · 10:46 · 3 runs.
search.runs = one: {n} execução | other: {n} execuções
# Under a line of output found: the command that printed it, in npm test.
search.in_command = em {command}
# Beside the list: what the line chosen is, a row each.
search.row_machine = Máquina
# {machine} is the project's code and the machine's name: P/web-01.
search.machine_removed = {machine}, removida do tTerm
search.row_folder = Pasta
search.row_branch = Branch
search.row_status = Status
search.row_when = Quando
search.row_terminal = Terminal
# {terminal} is the terminal as its tab names it, P/web-01 · deploy; {when}
# is when it ended: 10:46, yesterday 17:38, 2 Oct 09:12.
search.terminal_ended = {terminal}, encerrado: {when}
# The buttons under the preview: the command opened at its block, or put
# into the line of the terminal in front, not run.
search.open_in_terminal = Abrir no terminal
search.into_line = Colocar na linha
# A note found: where it is (its project and folder), when it was edited.
search.row_in = Em
search.row_edited = Editada
search.open_note = Abrir a nota
# Before anything is typed: what was open last, and the commands run most
# on the machine in front; {machine} is its name.
search.recent = Recentes
search.yours_on = Seus comandos em {machine}
# Beside a group's head in All: all of its kind; + when there are more
# than were sent.
search.all = one: Ver tudo ({n}) | other: Ver tudo ({n})
search.all_more = one: Ver tudo ({n}+) | other: Ver tudo ({n}+)
# The window, and its field.
search.label = Busca
search.placeholder = Comandos, saída, notas, terminais, máquinas…
search.close_title = Fechar (Esc)
# The buttons above the list; All is the first of them.
search.filters = O que buscar
search.kind_all = Tudo
# The list of what was found, for screen readers.
search.found = Resultados
search.nothing_typed = Nada digitado ainda: o que você abriu por último e o que você mais roda aqui.
search.looks_in = A busca procura em cada comando de cada terminal seu, no que eles imprimiram, nas notas, nos terminais, nas máquinas e nos projetos.
search.everything = Buscar em tudo
# With Output, Notes or Commands chosen and nothing typed yet.
search.type_output = Digite uma palavra para procurar no que os comandos imprimiram.
search.type_notes = Digite uma palavra para procurar nas notas.
search.type_commands = Digite uma palavra para procurar nos comandos.
# Beside the list while nothing is chosen: what to type (c: nginx,
# o: timed out…), and what each keeps to.
search.tips = Um prefixo limita a busca a um tipo
search.tip_commands = comandos
search.tip_output = o que os comandos imprimiram
search.tip_notes = notas
search.tip_terminals = terminais
search.tip_machines = máquinas
search.tip_projects = projetos
search.tip_actions = ações
# Tab is the key.
search.tips_buttons = Ou escolha um dos botões acima da lista. Tab vai para o próximo.
# At the bottom: a key, and what it does (move, open: verbs). {keys} is
# ⌘ Enter or Ctrl+Enter.
search.keys_move = <kbd>↑</kbd><kbd>↓</kbd> mover
search.keys_open = <kbd>Enter</kbd> abrir
search.keys_paste = <kbd>{keys}</kbd> colocar na linha
search.keys_next = <kbd>Tab</kbd> próximo tipo
# The words in front, and what each keeps to. c:, o:, n:, >, t:, m: and p:
# are typed as they are: keep them.
search.prefixes_title = t: terminais, m: máquinas, p: projetos
search.prefix_commands = <code>c:</code> comandos
search.prefix_output = <code>o:</code> saída
search.prefix_notes = <code>n:</code> notas
search.prefix_actions = <code>></code> ações

# ------------------------------------------------------------ input: tTerm's own input line, under a terminal's feed (InputLine.tsx)
# Said for a moment at the bottom of the page.
input.still_running = Um comando ainda está rodando. Espere ele terminar ou pare-o com Ctrl+C no bloco dele.
# Faint, after a name in the lists over the line: .. goes up a level; the
# branch checked out now; a branch of the remote.
input.up_level = um nível acima
input.branch_current = atual
input.branch_remote = remota
# {error} is what went wrong, as the browser or tTerm Web said it.
input.no_answer = A máquina não respondeu: {error}
# Faint in the line while it cannot take a command.
input.starting = Iniciando o shell…
input.keys_go = As teclas vão para o comando em execução. Clique aqui para digitar o próximo.
# The directory and the branch above the line are buttons: each opens a
# list, to cd into or to switch to. Ctrl+R lists the history.
input.change_dir = Mudar de diretório
input.switch_branch = Trocar de branch
input.history = Histórico
# The search field over those lists.
input.find_dir = Busque um diretório ou digite um caminho
input.find_branch = Busque uma branch
input.find_command = Busque um comando
# Tab's list of what the word could be.
input.completions = Autocompletar
input.more_not_shown = Há mais opções ocultas: digite mais algumas letras
# The line itself, for screen readers.
input.command = Comando
# Under the line, while it holds a command search put there.
input.from_search = Da busca, ainda não executado
input.enter_runs = <kbd>Enter</kbd> executa aqui
input.esc_clears = <kbd>Esc</kbd> limpa a linha
# Under the line: a key, and what it does. ⇧↵ is Shift+Enter.
input.tab_complete = <kbd>Tab</kbd> completa ou aceita a sugestão
input.history_local = <kbd>↑</kbd> histórico neste computador
input.history_devices = <kbd>↑</kbd> histórico de todos os seus dispositivos
input.new_line = <kbd>⇧↵</kbd> nova linha
input.while_running = Enquanto um comando roda, o que você digita vai para ele
# A terminal's two modes, beside the line: Line, with this line and the
# commands as blocks; Classic, every key straight to the shell.
input.mode = Modo de entrada
input.mode_line = Linha
input.mode_classic = Clássico

# ------------------------------------------------------------ block: one command of the feed, with its output (BlockView.tsx)
# The block, for screen readers. {command} is the command as typed, {code}
# its exit code.
block.state_input = {command}, não iniciado pelo shell
block.state_running = {command}, rodando
block.state_failed = {command}, falhou com código de retorno {code}
block.state_finished = {command}, concluído
block.state_ended = {command}, encerrado
# On a block search opened: the words found are marked in it.
block.found = Encontrado
# A command the shell has not started; Stop is the button (block.stop).
block.not_started_title = O shell está esperando o resto dele (uma aspa ou um heredoc em aberto), ou não o aceitou. Digite no bloco ou use Parar.
block.not_started = não iniciado
block.running = rodando
# A command that failed: exit 1.
block.exit = retorno {code}
block.stop_title = Parar o comando (Ctrl+C)
# The button that stops the command running: a verb.
block.stop = Parar
# The buttons of a finished block, with their tips.
block.actions = Ações do bloco
block.copy_block = Copiar o comando e a saída
block.copy_output = Copiar saída
block.copy_output_title = Copiar só a saída
block.run_again = Executar de novo
block.copy_link = Copiar link deste bloco
block.expand = Expandir bloco
block.collapse = Recolher bloco
# For screen readers: the browser did not let the page copy.
block.not_copied = Não copiado
# A folded block, in its place; a click unfolds it.
block.lines_hidden = one: {n} linha oculta | other: {n} linhas ocultas
# Above a long output, of which the last 400 lines show.
block.show_earlier = one: Mostrar {n} linha anterior | other: Mostrar {n} linhas anteriores
block.show_whole = Mostrar a saída inteira

# ------------------------------------------------------------ feed: a terminal's commands as blocks, in the Line mode (FeedTerminal.tsx)
# Said for a moment at the bottom of the page.
feed.not_connected = Sem conexão com o tTerm Web agora: o comando não foi enviado.
feed.still_running = Um comando ainda está rodando. Ele pode ser interrompido com Ctrl+C.
feed.copy_refused = O navegador não permitiu copiar.
feed.output_gone = A saída inteira não está mais disponível.
feed.show_earlier = Mostrar comandos anteriores
# After clear or Ctrl+L, on top: what came before is out of view; a click
# shows it again.
feed.cleared = one: {n} bloco ocultado: mostrar | other: {n} blocos ocultados: mostrar
feed.empty = Digite um comando abaixo. Cada um vira um bloco aqui, com a saída, quanto tempo levou e como terminou.
# Asked before a dangerous command runs. {what} is what it would do and
# {lost} what does not come back, as tTerm Web says them: delete a
# directory and everything inside it; There is no undo and no bin to look
# in. {machine} is the machine's name; the second is for while it is not
# known.
feed.confirm_label = Executar este comando?
feed.confirm = Este comando vai <strong>{what}</strong> em <strong>{machine}</strong>. {lost}
feed.confirm_unknown = Este comando vai <strong>{what}</strong> <strong>na máquina</strong>. {lost}
# What a command held back would do ({what} of feed.confirm, so in the form
# that fits there) and what does not come back ({lost}): the nine of the
# core and the app (danger.ts).
danger.delete_tree = excluir um diretório e tudo o que há dentro dele
danger.delete_tree_lost = Não há como desfazer, nem lixeira onde procurar.
danger.disk = reescrever o sistema de arquivos de um disco
danger.disk_lost = Tudo o que há nesse disco se perde, não só os arquivos.
danger.device = gravar diretamente num dispositivo
danger.device_lost = O que havia nele se perde assim que o comando começa.
danger.database = excluir um banco de dados ou uma tabela
danger.database_lost = Só um backup traz isso de volta.
danger.power_off = desligar a máquina
danger.power_off_lost = Nada aqui consegue ligá-la de novo: para isso, é preciso o painel do provedor.
danger.reboot = reiniciar a máquina
danger.reboot_lost = A sessão cai, e o que estiver rodando é interrompido junto com ela.
danger.ssh = parar o serviço SSH
danger.ssh_lost = É por ele que se entra. Pará-lo é trancar a porta por dentro.
danger.firewall = alterar o firewall
danger.firewall_lost = Uma regra errada pode deixar a máquina inacessível, sem como entrar de novo.
danger.user = excluir uma conta de usuário
danger.user_lost = Os arquivos e o acesso dessa conta vão junto.
# Under it, for rm -rf aimed at / or ~.
feed.everything = <strong>O alvo é a máquina inteira.</strong> Nada nela sobreviveria.
feed.run_it = Executar

# ------------------------------------------------------------ terminal_view: a terminal under its tab (TerminalView.tsx)
# A terminal's tab while its own name is not known yet.
terminal_view.terminal = Terminal
# The tip of Line (input.mode_line) when it cannot be chosen.
terminal_view.no_blocks = Este shell não marca onde os comandos começam, então só roda no modo clássico.
terminal_view.end_failed = Não foi possível encerrar o terminal: o tTerm Web não respondeu.
# Under a terminal in the Classic mode (input.mode_classic). Tab is the key.
terminal_view.classic_hint = Clássico: cada tecla vai direto para o shell, com o Tab e o histórico dele.
terminal_view.classic_warning = Neste modo, não há confirmação para comandos perigosos.
# {machine} is the machine's name; the second is for while it is not known.
terminal_view.connecting = Conectando a {machine}…
terminal_view.connecting_unknown = Conectando à máquina…
# A terminal whose computer sleeps, or is offline. {since} is how long:
# 3 minutes, an hour (time.for_*).
terminal_view.away = {machine} está em repouso ou offline
terminal_view.away_since = Este terminal espera a reconexão e continua de onde parou. Ausente há {since}.
terminal_view.away_text = Este terminal espera a reconexão e continua de onde parou.
terminal_view.end = Encerrar este terminal
# A terminal that ended. Under it, how it ended as tTerm Web says it, or
# not_running.
terminal_view.no_such = Terminal não encontrado
terminal_view.ended = Este terminal foi encerrado
terminal_view.not_running = Ele não está mais rodando.
terminal_view.open_new = Abrir um novo terminal em {machine}
terminal_view.close_tab = Fechar a aba

# ------------------------------------------------------------ classic: the Classic mode, every key straight to the shell (ClassicTerminal.tsx)
# A command search put here. Line is the mode (input.mode_line).
classic.several_lines = Este comando tem várias linhas, e o modo clássico executaria cada uma assim que entrasse. Mude para Linha, embaixo do terminal.

# ------------------------------------------------------------ tabs: the line of tabs on top (TabBar.tsx)
# The tabs that are open, for screen readers.
tabs.label = Abas abertas
# Naming a terminal in its tab, after a double click.
tabs.rename_title = Nomear este terminal
tabs.rename_hint = Enter salva, Esc cancela. O nome aparece na barra lateral, nas abas e na página do projeto.
# {name} is the tab as it reads: P/web-01 · 2, a note's title, a project's
# name.
tabs.close = Fechar a aba {name}
# The + after the tabs.
tabs.new_terminal = Novo terminal
tabs.new_terminal_title = Um novo terminal em qualquer máquina
# The button on the right that opens search.
tabs.search_title = Buscar comandos, a saída deles, notas, terminais, máquinas e o que há para fazer
tabs.search = Buscar

# ------------------------------------------------------------ finder: a list with a search field, as the + after the tabs opens it (Finder.tsx)
finder.nothing = Nada encontrado

# ------------------------------------------------------------ picker: the lists over the input line: directories, branches, history (Picker.tsx)
# While the machine is asked for its directories or branches.
picker.asking = Consultando a máquina…
picker.nothing = Nada aqui

# ------------------------------------------------------------ name_input: the field that names a terminal (NameInput.tsx)
# For screen readers. While the terminal has only its number,
# terminal.numbered shows faint in it.
name_input.label = Nome do terminal
`;export{e as default};