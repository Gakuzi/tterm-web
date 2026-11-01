var e=`# Strings of tTerm Web's page in English: one a line, \`key = text\`.
# Every language has the same keys; the build stops when one is missing
# (scripts/strings.mjs). {name} is a value the page puts in; a counting
# string has a form for each plural of the language, "one: … | other: …",
# and {n} is the count; <b>…</b> wraps a part the page makes a link, bold
# or code. Names of machines, projects, notes and terminals, commands and
# their output, tTerm, tTerm Web and Free are not translated.

# ------------------------------------------------------------ common: words used in many places
common.close = 关闭
common.cancel = 取消
common.save = 保存
common.loading = 正在加载…
common.try_again = 重试
common.copy = 复制
common.copied = 已复制
common.back = 返回
common.done = 完成
common.more = 更多
common.sign_in = 登录

# ------------------------------------------------------------ time: how long ago (time.ts)
# A duration after "for": Away for 3 minutes, running for an hour.
time.for_less = 不到一分钟
time.for_minutes = other: {n} 分钟
time.for_hours = other: {n} 小时
time.for_days = other: {n} 天
# How long ago, in full words: Signed in 3 minutes ago.
time.ago_now = 刚刚
time.ago_minutes = other: {n} 分钟前
time.ago_hours = other: {n} 小时前
time.ago_days = other: {n} 天前
# A machine that is offline: {ago} is one of the four above.
time.last_seen = {ago}在线
# How long ago, short, in lists of notes and in Updates: Looked 5 min ago.
time.short_minutes = other: {n} 分钟前
time.short_hours = other: {n} 小时前
time.yesterday = 昨天
time.today = 今天
time.days_ago = other: {n} 天前
time.last_week = 上周
time.weeks_ago = other: {n} 周前
# {day} is a date as the language writes it: 12 Oct, 12. Okt.
time.on_day = {day}
# In search: yesterday 17:38, 2 Oct 09:12.
time.yesterday_at = 昨天 {time}
time.day_at = {day} {time}

# ------------------------------------------------------------ here: the computer tTerm for Mac runs on
# Alone, as a label (the sidebar, tabs). Sentences that name it have a
# string of their own for each: .mac and .computer.
here.mac = 这台 Mac
here.computer = 这台电脑

# ------------------------------------------------------------ role: one's role in a project
role.owner = 所有者
role.admin = 管理员
role.member = 成员
role.observer = 查看者

# ------------------------------------------------------------ color: projects' colors (colors.ts)
color.violet = 紫罗兰
color.sky = 天蓝
color.teal = 青绿
color.pink = 粉红
color.orange = 橙色
color.lime = 青柠
color.indigo = 靛蓝
color.slate = 石板灰

# ------------------------------------------------------------ count: how many, in lists and lines
count.machines = other: {n} 台机器
count.notes = other: {n} 篇笔记
count.terminals_open = other: 已打开 {n} 个终端
# The end of a list cut short: web-01, web-02, web-03, web-04 and 3 more.
count.more = other: 其他 {n} 个

# A terminal that has only its number, in lists: terminal 2.
terminal.numbered = 终端 {number}
# A note without a title.
note.untitled = 无标题

# ------------------------------------------------------------ sidebar (Sidebar.tsx)
sidebar.label = 侧边栏
sidebar.all_machines = 所有机器
sidebar.keep_open = 固定侧边栏
sidebar.keep_open_title = 保持侧边栏展开
sidebar.let_slide = 让侧边栏自动收起
sidebar.close = 关闭侧边栏
sidebar.projects = 项目
sidebar.fold = 折叠 {name}
sidebar.unfold = 展开 {name}
sidebar.open_project = 打开 {name}：查看它的机器和笔记
sidebar.machines = 机器
sidebar.add_machine = 添加机器
sidebar.no_machines = 还没有机器
sidebar.notes = 笔记
sidebar.new_folder = 新建文件夹
sidebar.no_notes = 还没有笔记
sidebar.no_notes_writes = 还没有笔记。点击 + 新建文件夹来存放笔记
sidebar.new_project = 新建项目
sidebar.waits = 与 tTerm 的连接恢复后，{name} 也会随之恢复
sidebar.offline = {name} 已离线：可能处于休眠状态，或代理没有运行
# {seen} is time.last_seen: last seen 14 minutes ago.
sidebar.offline_seen = {name} 已离线：可能处于休眠状态，或代理没有运行（{seen}）
sidebar.here.mac = {name}，这台 Mac：它的终端就在本机运行，没有网络也能用
sidebar.here.computer = {name}，这台电脑：它的终端就在本机运行，没有网络也能用
sidebar.new_terminal = 新建终端
sidebar.new_terminal_on = 在 {name} 上新建终端
sidebar.rename_hint = Enter 保存，Esc 取消
sidebar.go_to = 转到 {label}
sidebar.go_to_away = 转到 {label}：它在等待 {machine} 恢复
sidebar.double_click = 双击重命名
sidebar.end = 结束 {label}
sidebar.end_title = 结束 {label}：它的 shell 会结束
sidebar.new_note_in = 在 {name} 中新建笔记
sidebar.empty_folder = 空文件夹
sidebar.empty_folder_writes = 空文件夹。点击 + 新建笔记
sidebar.signin_title = 服务器和项目
sidebar.signin_text = 登录后，你可以在服务器上打开终端、在项目中记笔记，并与团队协作。这台电脑会保持原样。
sidebar.theme_dark = 切换到深色主题
sidebar.theme_light = 切换到浅色主题
# A server that opens with the person's own key, from their vault (0.1.17):
# the key's tip, after the server's name.
sidebar.with_key = 用你保险库中的密钥打开
# A server that opens through the person's Mac: a small label after its
# name, and its tip ({mac} is the Mac's name).
sidebar.via_mac = 通过 Mac
sidebar.via_title = 通过 {mac}，在它开机时可用

# ------------------------------------------------------------ account_menu: the account at the bottom of the sidebar and its menu
# "Free" is the plan's name: it stays as it is.
account_menu.free_plan = Free 方案
account_menu.title = 设置、语言、账号、退出登录
account_menu.title_local = 设置、语言、登录
account_menu.not_signed_in = 未登录
account_menu.only_here = 仅这台电脑
account_menu.offline = 离线，正在重试
account_menu.local_note = tTerm 目前只用于这台电脑。登录即可使用你的服务器、项目和团队。
account_menu.sign_out = 退出登录
# Only in tTerm for Mac, right under Settings: the servers and keys of this
# Mac to the account (0.1.17). The second line is small, under the first.
account_menu.move = 迁移到云端
account_menu.move_note = 这台 Mac 的服务器和密钥，随处可用
# Only in a browser: the app for a Mac. "tTerm for Mac" is the app's name.
account_menu.download = 下载 tTerm Mac 版
account_menu.download_note = 你 Mac 上的终端，没有网络也能用
# The item after Settings, and the title of the list of languages.
language.item = 语言

# ------------------------------------------------------------ settings (Settings.tsx)
# The page, and the item of the account's menu that opens it.
settings.title = 设置
settings.appearance = 外观
settings.appearance_local = 保存在这台电脑上。“跟随系统”会使用这台电脑的设置。项目的颜色会填充其代号标记，或为侧边栏中的整个项目着色。
settings.appearance_account = 保存在你的账号中。“跟随系统”会使用你所用的每台电脑各自的设置。项目的颜色会填充其代号标记，或为侧边栏中的整个项目着色。
settings.theme = 主题
settings.theme_system = 跟随系统
settings.theme_light = 浅色
settings.theme_dark = 深色
settings.tints = 项目颜色
settings.tint_badge = 代号标记
settings.tint_block = 整个项目

# ------------------------------------------------------------ devices (Devices.tsx)
devices.title = 设备

# ------------------------------------------------------------ account (Account.tsx)
# The page, and the item of the account's menu that opens it.
account.title = 账号

# ------------------------------------------------------------ app: the page's frame, toasts and dialogs (App.tsx)
app.session_ended = 会话已结束。请重新登录：你的终端一直在运行。
# How saving goes in the note in front, on the line of tabs.
app.saved = 已保存
app.saving = 正在保存…
app.not_saved_offline = 未保存：无连接
app.not_saved = 未保存
app.no_connection = 无连接
app.not_answering_local = tTerm Web 没有响应。python -m tterm.dev 是否正在某个终端窗口中运行？
app.not_answering = tTerm Web 没有响应。请检查网络连接，然后重试。
# {why} is the reason tTerm Web gave, as it gave it.
app.no_terminal = 无法打开终端：{why}
app.offline = {name} 已离线：代理连接后它就会恢复。
# {seen} is time.last_seen: last seen 14 minutes ago.
app.offline_seen = {name} 已离线（{seen}）：代理连接后它就会恢复。
app.removed_shared = {name} 已从 tTerm Web 中移除。同一台服务器也在另一个项目中，因此 tTerm Web 对它的访问权限会保留。
app.removed_access = {name} 已从 tTerm Web 中移除，tTerm Web 在这台服务器上的访问权限也已收回。
app.removed = {name} 已从 tTerm Web 中移除。
app.no_note = 无法新建笔记：{why}
app.note_deleted = 笔记 {title} 已从 {folder} 中删除。
app.note_deleted_journal = 笔记 {title} 已从 {folder} 中删除。日志中记录了这一操作。
app.folder_deleted = 文件夹 {name} 已删除。
app.folder_deleted_journal = 文件夹 {name} 已删除。日志中记录了这一操作。
app.folder_notes_deleted = other: 文件夹 {name} 及其中的 {n} 篇笔记已删除。
app.folder_notes_deleted_journal = other: 文件夹 {name} 及其中的 {n} 篇笔记已删除。日志中记录了这一操作。
app.moved_to = 已移到 {folder}。
app.no_move = 无法移动：{why}
app.moved_here = 已从 {project} 移到这里。
app.moved_here_journal = 已从 {project} 移到这里。该项目的日志中记录了这一操作。
app.moved_to_project = 已移到 {project} 的 {folder} 文件夹。
app.moved_to_other = 已移到另一个项目的 {folder} 文件夹。
app.copied_markdown = 已复制为 Markdown。
app.note_gone = 这篇笔记已删除。
app.no_copy = 无法复制：{why}
app.no_copy_browser = 无法复制：浏览器不允许页面复制。
app.project_deleted = {name} 已删除。
app.project_deleted_notes = other: {name} 已删除，其中的 {n} 篇笔记也一并删除。
# {label} is where it is now: P/web-01.
app.machine_moved = {name} 现在位于 {project}，显示为 {label}。它的终端仍在运行。
app.no_rename = 无法重命名：{why}
app.signed_out = 你已退出登录。你的终端仍在运行。
app.no_sign_out = 无法退出登录：tTerm Web 没有响应。请重试。
app.no_theme = 无法保存主题：tTerm Web 没有响应。
app.no_language = 无法保存语言：tTerm Web 没有响应。
app.no_tints = 无法保存项目颜色：tTerm Web 没有响应。
app.go_on_in_browser = 请在浏览器中继续：在那里登录，并允许这台电脑。
app.open_sidebar = 打开侧边栏
app.no_project = 项目不存在
app.no_project_text = 它已不在你的项目中。
app.close_the_tab = 关闭标签页
app.connection_lost = 连接已断开。正在重新连接，你的终端仍在运行。
app.cut_off.mac = <b>无法连接到 tTerm。</b>这台 Mac 照常工作。服务器上的终端会在服务器上继续运行，连接恢复后会回到这里。
app.cut_off.computer = <b>无法连接到 tTerm。</b>这台电脑照常工作。服务器上的终端会在服务器上继续运行，连接恢复后会回到这里。
app.paste_busy = 这个终端中有命令正在运行，输入行暂时不可用。请在命令结束后重试。
app.paste_gone = {machine} 已不在 tTerm Web 中。请在别处打开一个终端，然后在那里把命令放进它的输入行。
app.picker.placeholder = 任意项目中的机器
# Tabs: their labels and the tips under the mouse. {label} is a terminal's: P/web-01 · 2.
app.tab.note = 笔记
app.tab.note_in = {folder} 中的笔记
app.tab.close_note = 关闭笔记。笔记会保留在所在的文件夹中。
app.tab.project = 项目
app.tab.project_title = {name}：它的机器和笔记
app.tab.close_page = 关闭页面
app.tab.terminal = 终端
app.tab.away = {label}：{machine} 处于休眠或离线状态，终端在等待它恢复
app.tab.away_unknown = {label}：它的机器处于休眠或离线状态，终端在等待它恢复
app.tab.ended = {label}：已结束
app.tab.running = {label}：有命令正在运行
app.tab.close_terminal = 关闭标签页。终端会继续运行，可以在侧边栏中它所属的机器下找到。
# A machine's state, small, after its name in lists.
app.machine.no_connection = 无连接
app.machine.offline = 离线
app.machine.offline_seen = 离线，{seen}
app.machine.online = 在线
# Search and the palette (⌘K): what it finds on the page, the lines under each, and the details beside.
app.search.state_away = 等待电脑上线
app.search.state_ended = 已结束
app.search.state_busy = 命令运行中
app.search.state_prompt = 等待输入
app.search.this_tab = 当前标签页
app.search.tab = 在标签页中
app.search.no_tab = 运行中，无标签页
app.search.row_machine = 机器
app.search.row_folder = 目录
app.search.row_now = 当前
app.search.row_in = 位置
app.search.row_edited = 上次编辑
app.search.row_project = 项目
app.search.row_system = 系统
app.search.row_address = 地址
app.search.row_status = 状态
app.search.row_terminals = 终端
app.search.row_code = 代号
app.search.row_does = 作用
app.search.open_count = other: 已打开 {n} 个
# The button that does what was found.
app.search.open = 打开
app.search.open_note = 打开笔记
app.search.open_page = 打开项目页面
app.search.do_it = 执行
# Search words: keep the English words, add the language's own after them.
app.search.terminal_words = terminal 终端
app.search.note_words = note 笔记
app.search.project_words = project page folders 项目 页面 文件夹
# Things to do, in the palette: each with what it does, small, and its search words.
app.action.add_machine = 添加机器
app.action.add_machine_hint = 服务器或电脑
app.action.new_project_hint = 拥有自己的机器和笔记
app.action.edit_project = 编辑 {name}
app.action.edit_project_hint = 名称、代号和颜色
app.action.new_folder_in = 在 {name} 中新建文件夹
app.action.new_folder_hint = 用于存放笔记
app.action.close_tab = 关闭当前标签页
app.action.close_tab_terminal = 终端会继续运行
app.action.close_tab_note = 笔记会保留在所在的文件夹中
app.action.rename_terminal = 为当前终端命名
app.action.rename_terminal_hint = 用名称代替编号
app.action.end_terminal = 结束当前终端
app.action.end_terminal_hint = 它的 shell 会结束
app.action.delete_note = 删除当前笔记
app.action.delete_note_hint = 从 {folder} 中删除
app.action.theme_dark = 切换到深色主题
app.action.theme_light = 切换到浅色主题
app.action.settings_hint_local = 主题、项目颜色
app.action.settings_hint = 主题、项目颜色、设备
app.action.sign_in_hint = 你的服务器、项目和团队
app.action.account_hint = 名字、头像和方案
app.action.sign_out_hint = 这个浏览器将不再记住你
# Search words: keep the English words, add the language's own after them.
app.action.add_machine_words = new server computer connect 新建 新增 服务器 电脑 连接
app.action.new_project_words = project new create make 项目 新建 创建
app.action.edit_project_words = project rename edit code color colour 项目 重命名 编辑 代号 颜色 编辑项目
app.action.new_folder_words = notes folder new create 笔记 文件夹 新建 创建
app.action.machines_words = machines home overview 机器 首页 概览
app.action.close_tab_words = tab close 标签页 关闭 关闭标签页
app.action.rename_terminal_words = terminal rename name label 终端 重命名 命名 名称 标签
app.action.end_terminal_words = terminal end stop kill exit shell 终端 结束 停止 终止 退出 结束终端
app.action.delete_note_words = note delete remove 笔记 删除 移除 删除笔记
app.action.theme_words = theme dark light colours colors 主题 深色 浅色 暗色 亮色 夜间 颜色
app.action.pin_words = sidebar panel pin 侧边栏 面板 固定
app.action.settings_words_local = settings preferences theme dark light colors colours support 设置 偏好设置 主题 深色 浅色 颜色 技术支持
app.action.move_words = move cloud servers keys ssh vault migrate import 迁移 迁移到云端 云端 云 服务器 密钥 保险库 导入 移动
app.action.settings_words = settings preferences theme dark light colors colours devices quick code forget browsers support 设置 偏好设置 主题 深色 浅色 颜色 设备 快捷码 移除 浏览器 技术支持
app.action.sign_in_words = sign in log in login account cloud servers 登录 账号 云端 服务器
app.action.account_words = account profile name photo picture avatar plan limits delete 账号 个人资料 名字 头像 照片 方案 限额 删除账号
app.action.sign_out_words = sign out log out logout leave switch account 退出登录 注销 离开 切换账号
# A folder: made, or named again.
app.folder.new_title = 在 {name} 中新建文件夹
app.folder.rename_title = 重命名文件夹
app.folder.create = 创建文件夹
app.folder.new_help_alone = 只有你能看到它。之后点击文件夹旁的 + 即可新建第一篇笔记。
app.folder.new_help = {name} 中的所有人都能看到它，并可以在其中写笔记。之后点击文件夹旁的 + 即可新建第一篇笔记。
app.folder.rename_help_alone = 只有你能看到它。
app.folder.rename_help = {name} 中的所有人都会立即看到新名称。其中的笔记保持不变。
# Asked before it is done.
app.remove.title = 移除 {name}？
app.remove.confirm = 移除 {name}
app.remove.text = 它会从 tTerm Web 中消失，它的终端也会结束。在那里输入过的命令会保留在历史记录中。
app.remove.computer = 它的代理会得知电脑已被移除，随后停止运行。如需重新连接这台电脑：点击“添加机器”，然后选择“电脑”。
app.remove.server = tTerm Web 将不再登录它，并会在服务器上收回自己的访问权限。如果服务器没有响应，接下来会给出完成这一步的命令。
app.end.title = 结束 {label}？
app.end.confirm = 结束终端
app.end.text = 它的 shell 会结束，其中运行的一切都会停止，就像关闭终端窗口一样。它运行过的内容会保留在标签页和历史记录中。
app.delete_note.title = 删除笔记 {title}？
app.delete_note.sub = 位于 {folder}。
app.delete_note.confirm = 删除笔记
app.delete_note.alone = 它将被永久删除。
app.delete_note.shared = {project} 中的所有人都将无法再看到这篇笔记，包括此刻正打开着它的人。日志会记录是谁在什么时候删除了它。
app.delete_folder.title = 删除文件夹 {name}？
app.delete_folder.confirm = 删除文件夹
app.delete_folder.confirm_notes = other: 删除文件夹和 {n} 篇笔记
app.delete_folder.empty = 这个文件夹是空的。
# {names} is the notes' titles, listed: Plan, Ideas and 3 more.
app.delete_folder.notes_go = other: 其中的 {n} 篇笔记也会一并删除：{names}。
app.delete_folder.shared = {project} 中的所有人都将无法再看到这些笔记，包括此刻正打开其中某篇的人。日志会记录是谁在什么时候删除了这个文件夹。
app.delete_folder.keep = 如果想保留某篇笔记，请先把它移走：点击笔记旁的 ⋯，再选择另一个文件夹。

# ------------------------------------------------------------ api: what the page says when tTerm Web gives no reason (api.ts)
api.note_changed = 这篇笔记在此期间已在别处被修改。
api.sign_in = 请登录后继续。
# {status} is the HTTP status: 502.
api.answered = tTerm Web 返回了 {status}
api.confirm_first = 请先确认是你本人。
api.account_changed = 现在登录的是另一个账号。

# ------------------------------------------------------------ app_link: the apps for computers, as the site names them (appLink.ts)
app_link.mac = tTerm Mac 版
app_link.windows = tTerm Windows 版
app_link.linux = tTerm Linux 版

# ------------------------------------------------------------ add_machine: the window that adds a server or a computer to a project (AddMachine.tsx)
# When the browser does not let the page copy the command.
add_machine.copy_failed = 无法复制：请选中命令并手动复制。
# How long the command works, inside add_machine.hint_computer and add_machine.hint_server as {works}.
add_machine.works_once = other: 命令只能使用一次，在接下来的 {n} 分钟内有效。
add_machine.title = 添加机器
# Before the list of the projects the machine can go to.
add_machine.to_project = 添加到项目
# The two buttons Server and Computer, for screen readers.
add_machine.kind = 机器类型
add_machine.server = 服务器
add_machine.computer = 电脑
# Step 1 for a computer, above the command.
add_machine.run_computer = 在电脑上运行以下命令
# Under the command. {works} is add_machine.works_once; sudo stays as it is.
add_machine.hint_computer = 在那台电脑的终端中，以你自己的身份运行，不要用 sudo。{works}之后代理会自行更新。以后再运行一条新命令会重新安装代理：电脑本身保持不变，但已打开的终端会结束。
# A fold under the command, for trying an agent that is not released yet.
add_machine.by_hand = 或者手动启动代理
# {version} is the agent's version: 0.11.0. tterm-agent, Python and websockets are names: they stay as they are.
add_machine.by_hand_hint = 需要 tterm-agent {version} 或更高版本的副本，以及装有 websockets 包的 Python。用于试用尚未发布的代理：它只在其终端窗口打开期间运行，令牌会成为这台电脑的密钥。
# Step 2, while the window waits for the machine.
add_machine.keep_open = 请保持此窗口打开
# A fold: what the command for a computer does, point by point.
add_machine.what_command = 这条命令会做什么
# {folder} is ~/.tterm-web, {bot_folder} ~/.tterm; launchd and systemd are names: they stay as they are.
add_machine.what_command_puts = 把 tTerm 的代理放到 {folder}：这是 tTerm 发布版本中适用于这个系统的单个文件，运行前会用命令脚本中的校验和进行核对；之后每次你登录时都会启动它（macOS 上用 launchd，Linux 上用 systemd）。如果 {bot_folder} 中有 tTerm 机器人的代理，它会保持不变。
add_machine.what_command_updates = 代理会自行更新，只会更新到由 tTerm 发布构建签名的版本，而且只在这台电脑上没有打开的终端时进行。
add_machine.what_command_key = 为这台电脑生成专属密钥并保存在本机，只有你能读取。命令中的令牌只用于让它加入，且只能用一次。
# root is the name of the system's administrator: it stays as it is.
add_machine.what_command_runs = 代理以你的身份运行，绝不以 root 身份运行，也不开放任何端口：它主动向外连接 tTerm Web，并只保持这一条连接。这里的每个终端，都是你在那台电脑上的一个 shell。
# {command} is ~/.tterm-web/uninstall.sh.
add_machine.what_command_uninstall = 运行 {command} 即可全部移除。
# Step 1 for a server, above the command.
add_machine.run_server = 在服务器上运行以下命令
# Under the command. {works} is add_machine.works_once; root and sudo stay as they are.
add_machine.hint_server = {works}请以 root 或任何有 sudo 权限的用户身份运行。
# A fold: what the script for a server does, point by point.
add_machine.what_script = 这个脚本会做什么
# Here and in the next two, tterm in small letters is the name of the user the script makes on the server: it stays as it is, as sudo and sshd_config do.
add_machine.what_script_user = 创建没有密码的用户 tterm。如果 tTerm 机器人已经创建过这个用户，就直接沿用。
add_machine.what_script_certificates = 允许 tTerm Web 以 tterm 的身份登录，所用证书只有两分钟有效期，并且只为这台服务器签发。服务器上不会留下任何密钥。
add_machine.what_script_sudo = 给 tterm 授予 sudo 权限，以便你管理服务器。一条命令即可收回。
add_machine.what_script_safe = 绝不改动 sshd_config，也不开放任何端口。重复运行也是安全的。
# {name} is the machine's name.
add_machine.connected = {name} 已连接
# After the machine's system and host: Ubuntu 24.04 · web-01 · in tabs it reads P/web-01.
add_machine.tabs_label = 在标签页中显示为 {label}
add_machine.open_terminal = 打开终端
add_machine.add_another = 再添加一台机器
# {why} is what went wrong, as tTerm Web said it.
add_machine.no_command = 无法生成命令：{why}
add_machine.expired_token = 这个令牌已过期：它只在 10 分钟内有效。
add_machine.expired_command = 这条命令已过期：它只在 10 分钟内有效。
add_machine.new_command = 获取新命令
add_machine.failed_computer = 无法添加这台电脑。
add_machine.failed_server = 无法检查这台服务器。
add_machine.still_works = 同一条命令仍然有效：解决这个问题后再运行一次。
# While the window waits: the agent or the server has called in, or not yet.
add_machine.agent_in = 代理已接入。正在读取电脑的信息…
add_machine.server_in = 服务器已响应。正在登录以检查它…
add_machine.waiting_agent = 正在等待代理…
add_machine.waiting_server = 正在等待服务器…
# {project} is the project's name; the _unnamed ones are for when it is not known.
add_machine.appears_computer = 命令完成几秒钟后，它就会出现在 {project} 中。
add_machine.appears_computer_unnamed = 命令完成几秒钟后，它就会出现在项目中。
add_machine.appears_server = 脚本一完成，它就会出现在 {project} 中，通常不超过一分钟。
add_machine.appears_server_unnamed = 脚本一完成，它就会出现在项目中，通常不超过一分钟。

# ------------------------------------------------------------ signin: signing in with a code from email, and the quick code (SignIn.tsx)
# When the server does not answer at all.
signin.no_answer = 服务器没有响应。请检查网络连接后重试。
signin.email_lead = 输入你的邮箱，我们会给你发送验证码
# The field for the address, for screen readers.
signin.email = 邮箱
# The button, while the code is being sent.
signin.sending = 正在发送…
signin.get_code = 获取验证码
signin.new_here = 第一次使用？输入验证码后即可创建账号。
signin.code_resent = 新的验证码已发出。之前的验证码已失效。
signin.code_title = 输入验证码
# {email} is the address the code went to.
signin.code_sent = 验证码已发送到 <b>{email}</b>
# The field for the code, for screen readers.
signin.code_label = 邮件中的验证码
# A link that counts the seconds down until another code may be sent: New code in 42 s.
signin.resend_in = other: {n} 秒后可重新发送
signin.resend = 重新发送验证码
signin.change_email = 更换邮箱
signin.no_email = 没收到邮件？请查看垃圾邮件文件夹。
signin.signup_title = 创建账号
# The field for one's name, and the words in it while it is empty.
signin.your_name = 你的名字
# The one tick of signing up. <terms> and <privacy> are links to the site's two documents: their names as the site has them in the language.
signin.agree = 我同意<terms>服务条款</terms>和<privacy>隐私政策</privacy>
# The button, while the account is being made.
signin.creating = 正在创建…
signin.create = 创建账号
signin.another_email = 使用其他邮箱
# A quick code is four digits that sign one in on this device.
signin.pin_easy = 太容易被猜到：请选择不全相同、也不连续的数字。
signin.pin_mismatch = 两次输入的快捷码不一致。请重新设置。
# {name} is the person's first name: Welcome for an account made just now, Hello for one there before.
signin.welcome = 欢迎，{name}！
signin.hello = 你好，{name}！
# The quick code, typed a second time.
signin.pin_repeat = 确认快捷码
signin.pin_repeat_lead = 再输入一次同样的四位数字
signin.pin_offer_lead = 为这台设备设置快捷码
# The field for the quick code, for screen readers: the second time, the first time.
signin.pin_repeat_label = 再次输入快捷码
signin.pin_offer_label = 快捷码
# The link that goes on without a quick code.
signin.not_now = 以后再说
# {name} is the person's first name.
signin.welcome_back = 欢迎回来，{name}！
signin.pin_lead = 输入你的快捷码
# The field for the quick code, for screen readers.
signin.pin_label = 快捷码
signin.forgot = 忘记快捷码了？
signin.switch = 切换账号

# ------------------------------------------------------------ connect: in the browser, allowing tTerm for the computer to sign in (Connect.tsx)
connect.no_answer = tTerm 没有响应。请检查网络连接，然后重新加载此页面。
# {app} is app_link.*: tTerm for Mac. Also the page's title in the browser.
connect.allow_title = 允许 {app}？
# The address the app opened is cut short.
connect.incomplete = 这个链接不完整
# Sign in with your browser is the app's button: the words of app_signin.browser.
connect.start_again = 请在你电脑上的 tTerm 中重新开始：点击“用浏览器登录”。
# Above signing in, after Allow. {app} is app_link.*: tTerm for Mac.
connect.confirm = 要允许 {app}，请先确认是你本人。
connect.signin_other = 请用另一个账号登录，然后允许 {app}。
connect.signin_then = 请登录，然后允许 {app}。
connect.no_connection = 无连接
# {computer} is the name of the computer the app runs on, {email} the account's address.
connect.asks = <b>{computer}</b> 上的应用请求登录你的账号 {email}。
# Above the code that both this page and the app show.
connect.check = 请核对应用中显示的确认码是否与此相同
# The button.
connect.allow = 允许
connect.another = 不是你？使用其他账号
# Personal is the name of one's own project: it stays as it is. Settings and Devices are the page and its section, in the words of settings.title and devices.title.
connect.small = 这台电脑会成为 Personal 中的一台机器。应用会出现在“设置”的“设备”中，你可以在那里移除它。
# While the browser goes back to the app. {app} is app_link.*: tTerm for Mac.
connect.back = 正在返回 {app}…
connect.takes_over = 接下来由这台电脑上的应用继续。

# ------------------------------------------------------------ app_signin: in tTerm for the computer, signing in with the browser (AppSignIn.tsx)
# The app's first screen, for screen readers.
app_signin.welcome_label = 欢迎
app_signin.welcome_title = 欢迎使用 tTerm
app_signin.welcome_lead = 这台电脑的终端立即可用，无需账号。
# The button: the app opens the browser, to sign in there.
app_signin.browser = 用浏览器登录
# The button: not now, sign in later.
app_signin.later = 稍后
app_signin.welcome_note = 登录后，你的服务器、项目、笔记和团队都会出现在这个窗口中。你随时都可以从侧边栏底部登录。
app_signin.cancelled = 已在浏览器中取消登录。
# The title of the window that waits while one signs in in the browser.
app_signin.link_title = 用浏览器登录
# {host} is app.tterm.net. The code comes under it.
app_signin.link_note = tTerm 已在浏览器中打开 {host}。请在那里登录，并在页面询问时允许这台电脑。页面上也会显示这个确认码：
app_signin.until_then = 在此之前，这台电脑照常工作。
app_signin.open_again = 重新打开页面

# ------------------------------------------------------------ welcome: the first screen, while nothing is connected yet (Welcome.tsx)
# {name} is the person's first name.
welcome.title = 欢迎使用 tTerm，{name}
welcome.lead = 直接在浏览器中使用你的服务器和电脑的终端。这台电脑上无需安装任何东西，无需复制密钥，也无需开放端口。
welcome.connect = 连接你的第一台机器
# The two cards: the kinds of machine to connect.
welcome.server = 服务器
welcome.server_note = 可通过 SSH 访问的 VPS 或云服务器。在上面运行一条命令，它就会出现在这里。
# Small labels under the cards: Linux, One command; macOS, Linux, No open ports.
welcome.one_command = 一条命令
welcome.computer = 电脑
welcome.computer_note = 家里或办公室的 Mac 或 Linux 机器，即使位于 NAT 之后也可以。一个小型代理会让它保持连接。
welcome.no_ports = 无需开放端口
# The three steps below, for screen readers.
welcome.how = 工作原理
welcome.step_add = 添加机器
welcome.step_add_text = 在机器上运行一条命令。命令只能使用一次，10 分钟内有效。
welcome.step_open = 打开终端
welcome.step_open_text = 每条命令都会成为一个块：可以复制、重新运行，或分享链接。
welcome.step_team = 邀请团队
welcome.step_team_text = 角色、共享日志，而且你始终能看到谁在旁观。
# {project} is the project's name and {code} its code: P. In {code}/name, name stands for a machine's name, as in P/web-01.
welcome.footnote = 你的第一个项目 {project} 已就绪，代号为 {code}：其中的机器在标签页中显示为 {code}/机器名。

# ------------------------------------------------------------ need_account: New project and Add machine in the app before signing in (NeedAccount.tsx)
need_account.machine_title = 添加机器
need_account.machine_note = 使用服务器和其他电脑需要 tTerm 账号。如果你还没有账号，登录时会为你创建一个。
need_account.server = 服务器
need_account.server_text = 可通过 SSH 访问的 VPS 或云服务器。在上面运行一条命令，它就会出现在这里。
need_account.computer = 电脑
need_account.computer_text = 家里或办公室的 Mac 或 Linux 机器，即使位于 NAT 之后也可以。
# What the Free plan gives. {machines} is need_account.plan_machines, {terminals} need_account.plan_terminals.
need_account.machine_plan = 最多 {machines}和 {terminals}。
# In need_account.machine_plan, after "Up to": in the form the words take there.
need_account.plan_machines = other: {n} 台机器
need_account.plan_terminals = other: {n} 个同时打开的终端
need_account.machine_stays = 这台电脑及其终端会保持原样。
need_account.project_title = 新建项目
need_account.project_note = 创建更多项目需要 tTerm 账号。如果你还没有账号，登录时会为你创建一个。
need_account.personal = 个人项目
need_account.personal_text = 只有你自己。其中的机器、终端和笔记都只属于你。
need_account.shared = 共享项目
# A small label on Shared projects: they are not there yet.
need_account.soon = 即将推出
need_account.shared_text = 与团队共享。你可以邀请他人：他们可以在项目的机器上打开终端，并编辑其中的笔记。
need_account.project_plan = 自建项目，每个项目都有自己的机器、终端和笔记。与团队共享的项目即将推出。
# Personal is the name of one's own project: it stays as it is.
need_account.project_stays = Personal 会保持原样，包括这台电脑、它的终端和笔记。
# The button that closes the window.
need_account.not_now = 以后再说

# ------------------------------------------------------------ updates: tTerm for Mac updating itself, only in the app (Updates.tsx)
# The title of Restart to update in the top bar. {version} is the new version: 0.5.1.
updates.pill_title.mac = tTerm {version} 已就绪。重新启动只需几秒钟；如果这台 Mac 上有终端在运行，tTerm 会先询问你。
updates.pill_title.computer = tTerm {version} 已就绪。重新启动只需几秒钟；如果这台电脑上有终端在运行，tTerm 会先询问你。
updates.restarting = 正在重新启动…
# A button, in the top bar and in Settings: tTerm restarts and the new version goes in.
updates.restart_to_update = 重新启动以更新
# The card above the account in the sidebar, and Settings. {version} is the new version.
updates.ready = tTerm {version} 已就绪
updates.restart_takes = 重新启动只需几秒钟。
# The card's button.
updates.restart = 重新启动
# A link to the notes of the new version.
updates.whats_new = 更新内容
# Once, after the restart. {version} is the version now: 0.5.1.
updates.updated = tTerm 已更新到 {version}
# Settings, Updates: the two ways tTerm takes a new version.
updates.auto = 自动更新
updates.auto_text.mac = 新版本会在 tTerm 退出时安装；如果 tTerm 留在菜单栏中、窗口已关闭，则会在这台 Mac 上没有任何东西运行时立即安装。
updates.auto_text.computer = 新版本会在 tTerm 退出时安装；如果 tTerm 留在菜单栏中、窗口已关闭，则会在这台电脑上没有任何东西运行时立即安装。
updates.ask = 先询问我
# "Restart to update" is the button (updates.restart_to_update): the same words.
updates.ask_text = 新版本会等你点击“重新启动以更新”后再安装。
# The section of Settings.
updates.title = 更新
updates.about = tTerm Mac 版会通过 tTerm 的发布版本自行更新。只有经过 tTerm 签名的版本才会安装。
# For screen readers: the two ways above.
updates.how = tTerm 的更新方式
# Beside Update by itself.
updates.recommended = 推荐
updates.checking = 正在检查新版本…
# {version} is the new version.
updates.downloading = 正在下载 tTerm {version}…
# {version} is the version this app is; {day} is today, yesterday or on 12 Oct (time.today, time.yesterday, time.on_day); {time} is 10:02.
updates.you_have_downloaded = 当前版本为 {version}，{day} {time} 下载。
updates.you_have = 当前版本为 {version}。
# {version} is the new version; why it failed comes under it, as tTerm says it.
updates.failed = 无法更新到 {version}
# {site} is tterm.net. Applications is the folder of the Mac: as macOS names it in the language.
updates.download = 或者从 <link>{site}</link> 下载 tTerm，然后把它拖到“应用程序”文件夹。
# A button: tTerm moves itself from the disk image to Applications.
updates.move = 移到“应用程序”文件夹
# {ago} is when tTerm last looked: just now, 5 min ago, 2 h ago, yesterday, on 12 Oct (time.*).
updates.looked = tTerm {version} 已是最新版本。上次检查：{ago}。
updates.this_is = 这是 tTerm {version}。
# A button: look for a new version now.
updates.check_now = 立即检查

# ------------------------------------------------------------ account: the name, the photo and the plan (Account.tsx)
# The file chosen for one's photo is none.
account.not_a_photo = tTerm 无法使用这个文件作为头像。请选择不超过 5 MB 的 JPEG、PNG 或 WebP 图片。
# What the plan allows, after "Up to" (account.up_to): Up to 50 machines and 24 open terminals.
account.limit_machines = other: {n} 台机器
account.limit_terminals = other: {n} 个同时打开的终端
# {limits} is one or both of the two above, as a list.
account.up_to = 最多 {limits}
account.no_limits = 无限制
# A meter of the plan, beside its label (Machines, Open terminals): 3 of 50.
account.used_of = {used}/{limit}
account.used_no_limit = {used}，无上限
# The title of Close at the top of Account and Settings.
account.close_title = 返回之前的位置
account.photo_removed = 头像已移除：重新显示你的姓名缩写。
# For screen readers: the card with one's name and photo.
account.profile = 个人资料
account.change_photo = 更换头像
account.add_photo = 添加头像
account.your_name = 你的名字
account.saving = 正在保存…
account.edit_name = 编辑名字
account.remove_photo = 移除头像
# Under the photo's buttons: what the photo is for.
account.photo_hint = 头像显示在你的名字旁边，代替你的姓名缩写。
# For screen readers: the file chooser for the photo.
account.choose_photo = 选择图片
# Under one's email address. {email} is support's address.
account.address_note = 你用这个邮箱登录。如需更改，请写信至 <link>{email}</link>。
# The section of the plan; its name (Free) stays as it is.
account.plan = 方案
account.plan_note = tTerm 在开发期间免费。其他方案会出现在这里，在任何变化之前，我们都会先通知你。
# The labels of the plan's two meters.
account.machines = 机器
account.open_terminals = 打开的终端
account.photo_saved = 头像已更新：显示在侧边栏底部及其菜单中。
# {email} is support's address.
account.delete_note = 如需删除账号，请用你登录所用的邮箱写信至 {email}。

# ------------------------------------------------------------ devices: where one is signed in, in Settings (Devices.tsx)
# On the sign-in screen, after this very device was forgotten.
devices.this_forgotten = 这台设备已被移除。请用邮件验证码登录。
# {device} is a device's label: tTerm for Mac on MacBook-Pro. tTerm there now works with that computer only, as before signing in.
devices.app_signed_out = {device} 已退出登录：那里的 tTerm 现在只用于那台电脑本身。
# {device} is a device's label: Chrome on macOS.
devices.forgotten = {device} 已移除：在那里需要重新用邮件验证码登录。
# On the sign-in screen.
devices.all_forgotten = 所有设备都已移除。现在每台设备都需要用邮件验证码登录。
devices.about = 可以用快捷码登录的浏览器，以及你电脑上通过浏览器登录的 tTerm。在其他任何地方，登录都需要邮件验证码。
devices.idle = 8 小时没有任何操作后，tTerm 会再次要求输入快捷码。你的终端仍会继续运行。
devices.none = 没有记住任何浏览器。每次登录都需要邮件验证码。
# A mark beside the device one uses now.
devices.this_device = 当前设备
# Under a device's label. {created} and {used} are how long ago: just now, 3 minutes ago, 2 days ago (time.ago_*).
devices.app_times = 登录时间：{created}，上次使用：{used}
devices.browser_times = 信任时间：{created}，上次登录：{used}
# A button beside each device.
devices.forget = 移除
# The heading, and the red button that does it.
devices.forget_all = 移除所有设备
devices.forget_all_text = 所有设备都会被移除，所有会话都会结束，包括当前这个。之后每个浏览器都会要求输入邮件验证码。你的终端仍会继续运行。
# The button that asks first.
devices.forget_all_ask = 移除所有设备…

# ------------------------------------------------------------ this_computer: the computer the app runs on, in Settings (ThisComputer.tsx)
# How the link to tTerm Web is, under the switch. {name} is the name tTerm Web knows this computer by.
this_computer.online_terminals = other: 在 tTerm Web 中在线：{name} · 从那里打开了 {n} 个终端
this_computer.online = 在 tTerm Web 中在线：{name}
this_computer.connecting = 正在连接 tTerm Web…
this_computer.waiting = 尚未连接到 tTerm Web。
this_computer.no_network = 无网络。tTerm 会自动重试。
# "Turn this on": the switch above.
this_computer.removed.mac = 这台 Mac 已从 tTerm Web 中移除，因此不再向 tTerm Web 开放。打开上方的开关即可重新添加。
this_computer.removed.computer = 这台电脑已从 tTerm Web 中移除，因此不再向 tTerm Web 开放。打开上方的开关即可重新添加。
this_computer.closed.mac = 这台 Mac 目前未向 tTerm Web 开放。
this_computer.closed.computer = 这台电脑目前未向 tTerm Web 开放。
# The section's title, on a Mac too.
this_computer.title = 这台电脑
# {name} is this computer's machine in tTerm, {project} its project.
this_computer.about = {name}，位于 {project}。它的终端在本机运行，没有网络也能用。
# The switch.
this_computer.open = 向 tTerm Web 和手机开放
this_computer.open_text.mac = 只要 tTerm 在这里运行，tTerm Web 和手机就能打开这台 Mac 上的终端：关闭窗口后，它会留在菜单栏中，并在你登录时自动启动。关闭此开关后：tTerm Web 中这台 Mac 会显示为离线；这里一切照旧。
this_computer.open_text.computer = 只要 tTerm 在这里运行，tTerm Web 和手机就能打开这台电脑上的终端：关闭窗口后，它会留在菜单栏中，并在你登录时自动启动。关闭此开关后：tTerm Web 中这台电脑会显示为离线；这里一切照旧。
# Asked before the switch goes off while terminals opened from tTerm Web run here.
this_computer.ask_title.mac = 停止向 tTerm Web 开放这台 Mac？
this_computer.ask_title.computer = 停止向 tTerm Web 开放这台电脑？
# The red button.
this_computer.turn_off = 关闭
this_computer.ask_text.mac = other: 从 tTerm Web 在这台 Mac 上打开的 {n} 个终端将会结束，这台 Mac 在 tTerm Web 中会显示为离线。
this_computer.ask_text.computer = other: 从 tTerm Web 在这台电脑上打开的 {n} 个终端将会结束，这台电脑在 tTerm Web 中会显示为离线。

# ------------------------------------------------------------ photo: one's photo, cut to a circle (PhotoDialog.tsx)
# The photo could not be made here, in the browser.
photo.browser_failed = 浏览器无法生成头像。
photo.no_answer = tTerm 没有响应。请重试。
# The dialog's title.
photo.title = 你的头像
# For screen readers: the photo in its frame, which the arrow keys move and + and - zoom.
photo.frame = 圆框中的头像。可以拖动，或用方向键移动；按 + 和 - 缩放。
# The slider that makes the photo bigger in the circle.
photo.zoom = 缩放
photo.drag = 拖动图片，调整它在圆框中的位置。
# Beside the photo in three small sizes.
photo.preview = 他人看到的效果
photo.note = 不超过 5 MB 的 JPEG、PNG 或 WebP。tTerm 会保存一份 256 像素的副本，并去掉图片自带的信息，例如拍摄地点。
photo.saving = 正在保存…
photo.save = 保存头像

# ------------------------------------------------------------ confirm: asking before what cannot be undone (Confirm.tsx)
confirm.no_answer = tTerm Web 没有响应。
confirm.copy_failed = 无法复制：请选中命令并手动复制。
# After a server is removed. {name} is the server's name.
confirm.removed = {name} 已移除
# The command that takes the access back comes after it.
confirm.removed_text = tTerm Web 不再列出它，也不会再登录它。服务器没有响应，因此在你到服务器上收回之前，tTerm Web 对它的访问权限会一直保留：
# {user} is the server's user tterm; {command} is the command that removes it and its sudo rule.
confirm.user_stays = 用户 {user} 及其 sudo 规则会保留，供 tTerm 机器人使用（如果你在用它）。如需一并移除：{command}

# ------------------------------------------------------------ project_dialog: the windows of projects of one's own (ProjectDialog.tsx)
project_dialog.code_invalid = 代号须为 1 到 4 个字母或数字。
# When saving or moving failed and tTerm Web gave no reason.
project_dialog.no_answer = tTerm Web 没有响应。
project_dialog.edit_title = 编辑项目
project_dialog.new_title = 新建项目
# Under the title, editing a project others are in: its name, code and color.
project_dialog.edit_sub = 只有所有者和管理员可以修改这些设置。
project_dialog.new_sub = 项目拥有自己的机器和笔记，与你的其他项目分开。
# The label of the project's name.
project_dialog.name = 名称
# In the empty name field: an example of a project's name.
project_dialog.name_example = 例如：客户 X
# The label of the project's code: the 1 to 4 letters or digits on its badge.
project_dialog.code = 代号
project_dialog.code_help_alone = 1 到 4 个字母或数字。代号用于在标签页和侧边栏中标识项目。
project_dialog.code_help_shared = 1 到 4 个字母或数字。代号用于在标签页和侧边栏中标识项目，对项目中的所有人同时生效。
project_dialog.code_help_new = 代号根据名称生成，你也可以修改：1 到 4 个字母或数字。它用于在标签页和侧边栏中标识项目。
# The label of the project's colors.
project_dialog.color = 颜色
# "Whole project" and "Settings" are named as the choice and the page are (settings.tint_block, settings.title).
project_dialog.color_help_new = 系统会选一个与你其他项目不同的颜色，你也可以修改。它会填充代号标记；如果你在“设置”中选择了“整个项目”，还会为侧边栏中的整个项目着色。
project_dialog.color_help_alone = 颜色会填充代号标记；如果你在“设置”中选择了“整个项目”，还会为侧边栏中的整个项目着色。
project_dialog.color_help_shared = 颜色会为项目中的所有人填充代号标记；对于在自己的“设置”中选择了“整个项目”的人，还会为侧边栏中的整个项目着色。
# Above how the project will look in the sidebar and on a tab (a noun).
project_dialog.preview = 预览
# In the preview, in place of the project's name while none is typed.
project_dialog.preview_name = 项目
project_dialog.new_next = 你是它的所有者。接下来可以添加机器，或从其他项目移入机器，然后撰写笔记。
project_dialog.create = 创建项目
# The title of the window that moves a machine to another project: {machine} is its name.
project_dialog.move_title = 移动 {machine}
project_dialog.move_sub = 移到你拥有的另一个项目。
# Next to each project one may move to: whether others are in it.
project_dialog.only_you = 仅你一人
project_dialog.with_others = 与他人共享
# {project} is the project it goes to, {code} that project's code, {name} the machine's name there: CX/web-01.
project_dialog.move_becomes = 在 {project} 中，它将显示为 {code}/{name}。它的终端会继续运行，机器本身不会有任何变化。
# The same, when its name is taken there: {machine} is its name now, {name} the one it gets (web-01-2).
project_dialog.move_becomes_taken = 在 {project} 中，它将显示为 {code}/{name}：那里已有名为 {machine} 的机器。它的终端会继续运行，机器本身不会有任何变化。
# The button: {project} is the project's name.
project_dialog.move_to = 移到 {project}
# The button while there is nothing to pick (a verb).
project_dialog.move = 移动
# Next to a folder one may move a note to: it has no notes.
project_dialog.folder_empty = 空
# Next to a project without folders: the note goes to a new folder there, named as its own.
project_dialog.folder_new = 将在那里为它新建文件夹
# The title of the window that moves a note to another project: {note} is its title.
project_dialog.move_note_title = 移动 {note}
project_dialog.move_note_sub = 当前位于 {project} 的 {folder} 文件夹。请选择另一个项目中的文件夹。
# Who sees the note in the project it goes to.
project_dialog.note_alone = 在 {project} 中只有你能看到它。
project_dialog.note_shared = {project} 中的所有人都能查看和编辑它。
# {project} is the project the note leaves.
project_dialog.note_leaves = {project} 中的其他人将无法再看到它。{project} 的日志会记录是谁在什么时候将它移出。
# The ticks: the items of a checklist ticked off, each with who ticked it.
project_dialog.note_keeps = 它的标题、正文和历史记录会一起移过去，勾选记录及勾选人也会保留。
# The button: {folder} is the name of the folder made there, the note's own folder's name.
project_dialog.move_to_new_folder = 移到新文件夹 {folder}
project_dialog.move_to_folder = 移到 {folder}
project_dialog.delete_title = 删除 {project}？
# A project with machines in it cannot be deleted yet: {machine} is its machine's name.
project_dialog.delete_machine_first = 请先移动或移除其中的机器：{machine}。
# {machines} is their names, listed: web-01, web-02 and db.
project_dialog.delete_machines_first = 请先移动或移除其中的机器：{machines}。
# "Move to another project" and "Remove machine" are the items of a machine's ⋯ menu (projectpage.move_machine, projectpage.remove_machine).
project_dialog.delete_how = 在项目页面上，点击机器旁的 ⋯，选择“移到其他项目”或“移除机器”。之后就可以删除这个项目了。
project_dialog.cant_undo = 此操作无法撤销。
# {n} is how many folders the project has; {notes} is project_dialog.delete_notes.
project_dialog.delete_folders = other: {n} 个文件夹及其中的 {notes}会一并删除。
# How many notes are in those folders, inside project_dialog.delete_folders: 2 folders with 5 notes are deleted with it.
project_dialog.delete_notes = other: {n} 篇笔记
project_dialog.delete_no_notes = 其中没有笔记。
# Above the field the project's name is typed in.
project_dialog.delete_type = 输入 {project} 以确认
# The button.
project_dialog.delete_button = 删除 {project}

# ------------------------------------------------------------ projectpage: a project's page (ProjectPage.tsx)
# The end of the line under the project's name: 2 machines · 1 terminal open · you are the owner.
projectpage.role_owner = 你是所有者
projectpage.role_admin = 你是管理员
projectpage.role_member = 你是成员
projectpage.role_observer = 你是查看者
# A terminal busy with a command whose line is not known.
projectpage.command_running = 有命令正在运行
# {duration} is how long the command has run: less than a minute, 3 minutes, an hour (time.for_*).
projectpage.running_for = 已运行 {duration}
# The same, while it is not known how long.
projectpage.running = 运行中
# A terminal whose machine is away: {machine} is its name.
projectpage.waits_for = 等待 {machine} 恢复
# Under a terminal's name being typed. Enter and Esc are the keys.
projectpage.rename_hint = Enter 保存，Esc 取消。
# On a terminal's name.
projectpage.double_click = 双击重命名
# The button next to a terminal: go to it (a verb).
projectpage.open = 打开
# An offline computer's state, next to its name: {ago} is how long ago (time.ago_*): Last seen 14 minutes ago.
projectpage.last_seen = {ago}在线
# A computer's state, next to its name.
projectpage.offline = 离线
projectpage.online = 在线
# On New terminal: {machine} is the machine's name.
projectpage.offline_title = {machine} 已离线：可能处于休眠状态，或代理没有运行
projectpage.new_terminal_title = 在 {machine} 上新建终端
# Said when New terminal is pressed on an offline computer: {seen} is time.last_seen: last seen 14 minutes ago.
projectpage.offline_wait_seen = {machine} 已离线（{seen}）：代理连接后它就会恢复。
projectpage.offline_wait = {machine} 已离线：代理连接后它就会恢复。
projectpage.new_terminal = 新建终端
# The ⋯ button next to a machine, for screen readers: {machine} is its name.
projectpage.machine_menu = {machine}：机器菜单
# The tip on that button: the items of its menu (projectpage.move_machine, projectpage.remove_machine).
projectpage.machine_menu_title = 移到其他项目、移除机器
# An item of a machine's menu, and the tip on its ⋯ button when it is the only item.
projectpage.remove_machine = 移除机器
# An item of a machine's menu.
projectpage.move_machine = 移到其他项目
projectpage.no_terminals = 没有打开的终端
# Who changed a note last, and when: {ago} is just now, 5 min ago, yesterday, on 12 Oct (time.*).
projectpage.edited_you = 你，{ago}
# The same, someone else: {name} is their first name.
projectpage.edited_by = {name}，{ago}
# A note's author when it is oneself, in the note's menu: You, the owner and admins can delete it.
projectpage.you = 你
# A checklist's progress, in place of its first line: {n} items ticked of {total}.
projectpage.done = other: 已完成 {n}/{total}
# A note without text yet, in place of its first line.
projectpage.note_empty = 暂无内容
# The ⋯ button next to a note, for screen readers: {note} is its title.
projectpage.note_menu = {note}：笔记菜单
# The tip on that button: what its menu has.
projectpage.note_menu_title_move = 文件夹、移到其他项目、复制为 Markdown、删除笔记
projectpage.note_menu_title = 文件夹、复制为 Markdown、删除笔记
# The end of the line under the project's name when nobody else is in it: 1 machine · 2 terminals open · only you.
projectpage.only_you = 仅你一人
# The tip on the project's code, next to its name.
projectpage.short_code = 代号
# The pencil next to the project's name.
projectpage.edit = 编辑名称、代号和颜色
# A heading.
projectpage.machines = 机器
# Next to the heading Machines.
projectpage.machines_alone = 只有你能在这些机器上打开终端
projectpage.machines_shared = 你在这些机器上的终端
projectpage.add_machine = 添加机器
# The two kinds of machine one can add, in a project without machines.
projectpage.server = 服务器
projectpage.server_text = 可通过 SSH 访问的 VPS 或云服务器。在上面运行一条命令，它就会出现在这里。
projectpage.computer = 电脑
projectpage.computer_text = 家里或办公室的 Mac 或 Linux 机器，即使位于 NAT 之后也可以。一个小型代理会让它保持连接。
# "Move to another project" is the item of a machine's ⋯ menu (projectpage.move_machine).
projectpage.move_hint = 机器已经在其他项目中？在那个项目的页面上，点击机器旁的 ⋯，然后选择“移到其他项目”。
# On the page of Personal, the project each person has for themselves: {project} is its name.
projectpage.personal_title = {project} 只属于你
projectpage.personal_text = 这里不能邀请其他人。如果想把其他机器分开管理，或者以后要与他人协作，请创建一个项目并把机器移进去。
projectpage.new_project = 新建项目
# A heading.
projectpage.notes = 笔记
# Next to the heading Notes.
projectpage.notes_alone = {project} 中的笔记只有你能看到。可以用文件夹整理它们
projectpage.notes_shared = {project} 中的所有人都能阅读和编辑这些笔记。可以用文件夹整理它们
projectpage.new_folder = 新建文件夹
projectpage.no_notes = 还没有笔记
# Runbooks, Access, Checklists: examples of folders' names.
projectpage.no_notes_text = 笔记放在文件夹里，就像终端运行在机器上一样。先建一个文件夹吧：运维手册、访问说明、检查清单。
# A folder without notes, next to its name.
projectpage.folder_empty = 空
# Who made a folder: {name} is their first name.
projectpage.made_by_you = 由你创建
projectpage.made_by = 由 {name} 创建
projectpage.new_note = 新建笔记
# The ⋯ button next to a folder, for screen readers: {folder} is its name.
projectpage.folder_menu = {folder}：文件夹菜单
# The tip on that button: what its menu has.
projectpage.folder_menu_title = 重命名文件夹、删除文件夹
# "New note" is the button next to the folder's name (projectpage.new_note).
projectpage.folder_no_notes_writes = 还没有笔记。点击“新建笔记”，在这里写下第一篇
# A heading at the end of the page: {project} is the project's name.
projectpage.delete_title = 删除 {project}
projectpage.delete_text = 其中的文件夹和笔记会一并删除。删除前，需要先把机器移到其他项目或移除。
projectpage.delete_project = 删除项目

# ------------------------------------------------------------ machines: the machines page (Machines.tsx)
# What sudo does on the machine, after "sudo" in what tTerm Web learned about it.
machines.sudo_works = 可用
machines.sudo_password = 需要密码
machines.sudo_missing = 不可用
# What tTerm Web learned about a machine when it connected: the labels, each with its value.
machines.system = 系统
machines.kernel = 内核
machines.cpu = CPU
machines.cores = other: {n} 核
machines.memory = 内存
machines.disk = 磁盘
# {free} and {total} are sizes: 7.8 GB free of 50 GB.
machines.disk_free = 可用 {free}，共 {total}
# The package manager: apt, brew.
machines.packages = 软件包
machines.shell = Shell
# {shell} is the shell its terminals start, {shells} all the shells it has: zsh (has bash, zsh).
machines.shell_has = {shell}（已安装 {shells}）
machines.commands = 命令
# How many commands tTerm Web knows there.
machines.commands_known = other: 已知 {n} 条
# The version of the agent, or of tTerm for the computer.
machines.agent = 代理
# The account on the machine the terminals run as: root, deploy.
machines.account = 用户
# A computer's state on its card: {seen} is time.last_seen: offline, last seen 14 minutes ago.
machines.offline_seen = 离线，{seen}
machines.offline = 离线
machines.online = 在线
machines.offline_note = 这台电脑处于休眠或离线状态，或者它的代理没有运行。代理能够连接时，它会自动恢复；此页面会在十秒内更新状态。
# On Open a terminal while the computer is offline.
machines.offline_title = 它已离线：可能处于休眠状态，或代理没有运行
machines.open_terminal = 打开终端
# A terminal running on the machine: {label} is as its tab shows it (P/web-01 · 2).
machines.back_to = 返回 {label}（仍在运行）
# The tip on Remove: {machine} is the machine's name.
machines.remove_title = 将 {machine} 从 tTerm Web 中移除
# The button: take the machine out (a verb).
machines.remove = 移除
# The page's heading.
machines.title = 机器
machines.add = 添加机器
machines.lead = 关闭标签页后，终端会继续运行：它会留在这里和侧边栏中，直到它的 shell 结束。
# A size: {size} is a number as the language writes it, 16 or 7.5.
machines.gb = {size} GB

# ------------------------------------------------------------ note_view: a note in its tab (NoteView.tsx)
# Said for a moment at the bottom of the page. {why} is the reason tTerm
# Web gave, as it gave it.
note_view.not_saved = 未保存：{why}
note_view.draft_back = 已恢复这篇笔记中输入但未保存的内容。
# When tTerm Web gives no reason.
note_view.no_answer = tTerm Web 没有响应。
# Ticking a checklist item did not get through.
note_view.no_tick = 无法勾选：{why}
# The note's tab was closed with what was typed in it not saved. {title} is
# the note's title, or note.untitled.
note_view.kept_draft = {title}：输入的内容尚未保存。它暂存在这个浏览器中，再次打开这篇笔记时会恢复。
note_view.copied_markdown = 已复制为 Markdown。
note_view.no_copy = 无法复制：浏览器不允许页面复制。
note_view.no_move = 无法移动：{why}
# Under the note's title, the parts of one line with dots between: who
# started it and when; or who edited it last and when · who wrote it and
# on which day; then who sees it. Someone is a person no longer known.
# {name} is a person's first name; {ago} is how long ago, short: just now,
# 5 min ago, yesterday, on 12 Oct; {folder} is a folder's name.
note_view.someone_started = {ago}由某人在 {folder} 中创建
note_view.you_started = {ago}由你在 {folder} 中创建
note_view.started = {ago}由 {name} 在 {folder} 中创建
note_view.someone_edited = {ago}由某人编辑
note_view.you_edited = {ago}由你编辑
note_view.edited = {ago}由 {name} 编辑
# {day} is today, yesterday or on 12 Oct.
note_view.someone_wrote = {day}由某人创建
note_view.you_wrote = {day}由你创建
note_view.wrote = {day}由 {name} 创建
# The end of the same line, after a dot. {project} is a project's name.
note_view.only_you = 仅你可见
note_view.everyone_edits = {project} 中的所有人都可以编辑
# The note was deleted while it was open here.
note_view.gone_title = 这篇笔记已被删除
note_view.gone_text = 它或它所在的文件夹已在另一个标签页或设备上被删除。
note_view.close_tab = 关闭标签页
note_view.copy_what_was_here = 将这里原有的内容复制为 Markdown
note_view.no_open = 无法打开笔记：{why}
# The ⋯ beside where the note is: what screen readers say, and the tip
# under the mouse, which lists what is in its menu.
note_view.menu = 笔记菜单
note_view.menu_title_move = 文件夹、移到其他项目、复制为 Markdown、删除笔记
note_view.menu_title = 文件夹、复制为 Markdown、删除笔记
# The field of the note's title, for screen readers.
note_view.title = 标题
# The note was saved meanwhile from elsewhere, changed in the same places.
note_view.conflict = 你编辑时，这篇笔记在别处也被修改了，而且改的是同样的位置。这些位置要保留你的版本，还是另一个版本？其余内容会保留双方的修改。
note_view.keep_mine = 保留我的
note_view.keep_theirs = 保留另一个版本

# ------------------------------------------------------------ note_editor: a note's blocks, written in place (NoteEditor.tsx)
# The kinds of block: what screen readers say of one, and what an empty one
# shows. Heading, Code, Divider and Text are also in the list that / opens.
note_editor.text = 文本
note_editor.heading = 标题
note_editor.list_item = 列表项
note_editor.checklist_item = 检查项
note_editor.code = 代码
note_editor.divider = 分隔线
# In the list that / opens: what a block can become. What is typed after
# the / picks from these names.
note_editor.checklist = 检查清单
note_editor.list = 列表
# Who ticked a checklist item, beside it: You · 10:02, Denis · 12 Oct.
note_editor.you = 你
# The same, for a person no longer known.
note_editor.someone = 某人
# What an empty note shows. The marks # - [ ] \`\`\` and / are typed as they
# are; the words after them are the language's own.
note_editor.start_writing = 开始书写。输入时即可使用 Markdown：# 标题，- [ ] 检查清单，\`\`\` 代码。输入 / 查看更多。
# What an empty line of text shows.
note_editor.type_slash = 输入 / 插入检查清单、标题、代码
# A checklist item's box, for screen readers.
note_editor.untick = 已完成：取消勾选
note_editor.tick = 勾选为已完成
note_editor.no_copy = 无法复制：请选中文本并手动复制。
# The list that / opens, for screen readers.
note_editor.turn_into = 转换为

# ------------------------------------------------------------ menus: the menus behind ⋯, and the window that names a folder (Menus.tsx)
# A note's menu: over the project's folders, the one the note is in
# checked; a click moves it to another.
menus.folder = 文件夹
menus.move_out = 移到其他项目…
menus.copy_markdown = 复制为 Markdown
menus.delete_note = 删除笔记
# Instead of Delete note, for one who may not: who may. {name} is the first
# name of the note's author.
menus.note_rights_move = {name}、所有者和管理员可以把它移到其他项目或删除
menus.note_rights_delete = {name}、所有者和管理员可以删除它
# The same, when the note's author is no longer known.
menus.note_rights_move_someone = 作者、所有者和管理员可以把它移到其他项目或删除
menus.note_rights_delete_someone = 作者、所有者和管理员可以删除它
# A folder's menu.
menus.rename_folder = 重命名文件夹
menus.delete_folder = 删除文件夹
# Instead of Delete folder, for one who may not.
menus.folder_rights = 含有笔记的文件夹只能由所有者和管理员删除
# The window that names a folder, a new one or one renamed. First what it
# says when tTerm Web gives no reason.
menus.no_answer = tTerm Web 没有响应。
# The field of the folder's name, and an example of one in it.
menus.name = 名称
menus.name_example = 例如：运维手册

# ------------------------------------------------------------ search: search over everything, by ⌘K or Search on the right of the tabs (Search.tsx)
# The kinds of what is found: the buttons above the list, and the heads of
# its groups.
search.kind_commands = 命令
search.kind_output = 输出
search.kind_notes = 笔记
search.kind_terminals = 终端
search.kind_machines = 机器
search.kind_projects = 项目
search.kind_actions = 操作
# The kind of the line chosen, on top of the preview beside the list.
search.label_command = 命令
search.label_output = 输出
search.label_note = 笔记
search.label_terminal = 终端
search.label_machine = 机器
search.label_project = 项目
search.label_action = 操作
# Nothing found. {text} is what was typed; Commands, Output… are the button
# chosen above the list (search.kind_*).
search.nothing_for = 没有找到“{text}”。
search.nothing_in_commands = 在“命令”中没有找到“{text}”。
search.nothing_in_output = 在“输出”中没有找到“{text}”。
search.nothing_in_notes = 在“笔记”中没有找到“{text}”。
search.nothing_in_terminals = 在“终端”中没有找到“{text}”。
search.nothing_in_machines = 在“机器”中没有找到“{text}”。
search.nothing_in_projects = 在“项目”中没有找到“{text}”。
search.nothing_in_actions = 在“操作”中没有找到“{text}”。
# How a command found ended: stopped (it has no exit code), or exit 1.
# {code} is its exit code.
search.stopped = 已停止
search.exit = 退出码 {code}
# How often it ran, at the end of the line under a command:
# P/web-01 · ~/app · main · exit 0 · 10:46 · 3 runs.
search.runs = other: 运行 {n} 次
# Under a line of output found: the command that printed it, in npm test.
search.in_command = 来自 {command}
# Beside the list: what the line chosen is, a row each.
search.row_machine = 机器
# {machine} is the project's code and the machine's name: P/web-01.
search.machine_removed = {machine}（已从 tTerm 中移除）
search.row_folder = 目录
search.row_branch = 分支
search.row_status = 状态
search.row_when = 时间
search.row_terminal = 终端
# {terminal} is the terminal as its tab names it, P/web-01 · deploy; {when}
# is when it ended: 10:46, yesterday 17:38, 2 Oct 09:12.
search.terminal_ended = {terminal}，{when} 结束
# The buttons under the preview: the command opened at its block, or put
# into the line of the terminal in front, not run.
search.open_in_terminal = 在所属终端中打开
search.into_line = 放入输入行
# A note found: where it is (its project and folder), when it was edited.
search.row_in = 位置
search.row_edited = 上次编辑
search.open_note = 打开笔记
# Before anything is typed: what was open last, and the commands run most
# on the machine in front; {machine} is its name.
search.recent = 最近
search.yours_on = 你在 {machine} 上的命令
# Beside a group's head in All: all of its kind; + when there are more
# than were sent.
search.all = other: 全部 {n} 项
search.all_more = other: 全部 {n}+ 项
# The window, and its field.
search.label = 搜索
search.placeholder = 命令、输出、笔记、终端、机器…
search.close_title = 关闭（Esc）
# The buttons above the list; All is the first of them.
search.filters = 搜索范围
search.kind_all = 全部
# The list of what was found, for screen readers.
search.found = 搜索结果
search.nothing_typed = 还没有输入内容：下面是你最近打开的内容，以及你在这台机器上最常运行的命令。
search.looks_in = 搜索范围包括你每个终端中的每条命令及其输出，以及笔记、终端、机器和项目。
search.everything = 搜索全部
# With Output, Notes or Commands chosen and nothing typed yet.
search.type_output = 输入关键词，搜索命令的输出。
search.type_notes = 输入关键词，搜索笔记。
search.type_commands = 输入关键词，搜索命令。
# Beside the list while nothing is chosen: what to type (c: nginx,
# o: timed out…), and what each keeps to.
search.tips = 在开头加上前缀，只搜索一类内容
search.tip_commands = 命令
search.tip_output = 命令的输出
search.tip_notes = 笔记
search.tip_terminals = 终端
search.tip_machines = 机器
search.tip_projects = 项目
search.tip_actions = 可执行的操作
# Tab is the key.
search.tips_buttons = 也可以点击列表上方的按钮。按 Tab 切换到下一个。
# At the bottom: a key, and what it does (move, open: verbs). {keys} is
# ⌘ Enter or Ctrl+Enter.
search.keys_move = <kbd>↑</kbd><kbd>↓</kbd> 移动
search.keys_open = <kbd>Enter</kbd> 打开
search.keys_paste = <kbd>{keys}</kbd> 放入输入行
search.keys_next = <kbd>Tab</kbd> 下一类
# The words in front, and what each keeps to. c:, o:, n:, >, t:, m: and p:
# are typed as they are: keep them.
search.prefixes_title = t: 终端，m: 机器，p: 项目
search.prefix_commands = <code>c:</code> 命令
search.prefix_output = <code>o:</code> 输出
search.prefix_notes = <code>n:</code> 笔记
search.prefix_actions = <code>></code> 操作

# ------------------------------------------------------------ input: tTerm's own input line, under a terminal's feed (InputLine.tsx)
# Said for a moment at the bottom of the page.
input.still_running = 仍有命令在运行。请等它结束，或在它的块中按 Ctrl+C 停止它。
# Faint, after a name in the lists over the line: .. goes up a level; the
# branch checked out now; a branch of the remote.
input.up_level = 上一级
input.branch_current = 当前
input.branch_remote = 远程
# {error} is what went wrong, as the browser or tTerm Web said it.
input.no_answer = 机器没有响应：{error}
# Faint in the line while it cannot take a command.
input.starting = 正在启动 shell…
input.keys_go = 按键会发送给正在运行的命令。点击这里输入下一条命令。
# The directory and the branch above the line are buttons: each opens a
# list, to cd into or to switch to. Ctrl+R lists the history.
input.change_dir = 切换目录
input.switch_branch = 切换分支
input.history = 历史记录
# The search field over those lists.
input.find_dir = 查找目录，或输入路径
input.find_branch = 查找分支
input.find_command = 查找命令
# Tab's list of what the word could be.
input.completions = 补全
input.more_not_shown = 还有更多结果未显示：请再多输入几个字母
# The line itself, for screen readers.
input.command = 命令
# Under the line, while it holds a command search put there.
input.from_search = 来自搜索，尚未运行
input.enter_runs = <kbd>Enter</kbd> 在这里运行
input.esc_clears = <kbd>Esc</kbd> 清空输入行
# Under the line: a key, and what it does. ⇧↵ is Shift+Enter.
input.tab_complete = <kbd>Tab</kbd> 补全或采用建议
input.history_local = <kbd>↑</kbd> 这台电脑上的历史记录
input.history_devices = <kbd>↑</kbd> 所有设备上的历史记录
input.new_line = <kbd>⇧↵</kbd> 换行
input.while_running = 命令运行时，你输入的内容会发送给它
# A terminal's two modes, beside the line: Line, with this line and the
# commands as blocks; Classic, every key straight to the shell.
input.mode = 输入模式
input.mode_line = 输入行
input.mode_classic = 经典

# ------------------------------------------------------------ block: one command of the feed, with its output (BlockView.tsx)
# The block, for screen readers. {command} is the command as typed, {code}
# its exit code.
block.state_input = {command}，shell 尚未启动它
block.state_running = {command}，运行中
block.state_failed = {command}，失败，退出码 {code}
block.state_finished = {command}，已完成
block.state_ended = {command}，已结束
# On a block search opened: the words found are marked in it.
block.found = 搜索结果
# A command the shell has not started; Stop is the button (block.stop).
block.not_started_title = shell 正在等待命令的剩余部分（未闭合的引号或 heredoc），或者没有接受它。请在块中继续输入，或点击“停止”。
block.not_started = 未启动
block.running = 运行中
# A command that failed: exit 1.
block.exit = 退出码 {code}
block.stop_title = 停止命令（Ctrl+C）
# The button that stops the command running: a verb.
block.stop = 停止
# The buttons of a finished block, with their tips.
block.actions = 块操作
block.copy_block = 复制命令及其输出
block.copy_output = 复制输出
block.copy_output_title = 仅复制输出
block.run_again = 重新运行
block.copy_link = 复制此块的链接
block.expand = 展开块
block.collapse = 折叠块
# For screen readers: the browser did not let the page copy.
block.not_copied = 未复制
# A folded block, in its place; a click unfolds it.
block.lines_hidden = other: 已隐藏 {n} 行
# Above a long output, of which the last 400 lines show.
block.show_earlier = other: 显示前面的 {n} 行
block.show_whole = 显示全部输出

# ------------------------------------------------------------ feed: a terminal's commands as blocks, in the Line mode (FeedTerminal.tsx)
# Said for a moment at the bottom of the page.
feed.not_connected = 目前未连接到 tTerm Web：命令没有发送。
feed.still_running = 仍有命令在运行。可以按 Ctrl+C 停止它。
feed.copy_refused = 浏览器不允许页面复制。
feed.output_gone = 完整的输出已不再保留。
feed.show_earlier = 显示更早的命令
# After clear or Ctrl+L, on top: what came before is out of view; a click
# shows it again.
feed.cleared = other: 已从视图中清除 {n} 个块：点击显示
feed.empty = 在下方输入命令。每条命令都会在这里成为一个块，包括它的输出、耗时和结束状态。
# Asked before a dangerous command runs. {what} is what it would do and
# {lost} what does not come back, as tTerm Web says them: delete a
# directory and everything inside it; There is no undo and no bin to look
# in. {machine} is the machine's name; the second is for while it is not
# known.
feed.confirm_label = 运行这条命令？
feed.confirm = 这条命令会在 <strong>{machine}</strong> 上执行：<strong>{what}</strong>。{lost}
feed.confirm_unknown = 这条命令会在<strong>这台机器</strong>上执行：<strong>{what}</strong>。{lost}
# What a command held back would do ({what} of feed.confirm, so in the form
# that fits there) and what does not come back ({lost}): the nine of the
# core and the app (danger.ts).
danger.delete_tree = 删除目录及其中的全部内容
danger.delete_tree_lost = 无法撤销，也没有回收站可以找回。
danger.disk = 重写磁盘的文件系统
danger.disk_lost = 这块磁盘上的所有内容都会丢失，不只是文件。
danger.device = 直接写入设备
danger.device_lost = 命令一开始，设备上原有的内容就会丢失。
danger.database = 删除数据库或数据表
danger.database_lost = 只能从备份中恢复。
danger.power_off = 关机
danger.power_off_lost = 在这里无法让它重新开机，只能到服务商的控制面板中操作。
danger.reboot = 重启
danger.reboot_lost = 会话会断开，正在运行的一切也会随之停止。
danger.ssh = 停止 SSH 服务
danger.ssh_lost = SSH 是进入这台机器的通道。停止它，就等于从里面把门锁上。
danger.firewall = 修改防火墙规则
danger.firewall_lost = 一条错误的规则就可能切断与这台机器的连接，而且再也连不回去。
danger.user = 删除用户账户
danger.user_lost = 该用户的文件和访问权限都会随之消失。
# Under it, for rm -rf aimed at / or ~.
feed.everything = <strong>这条命令针对的是整台机器。</strong>机器上的所有内容都将不复存在。
feed.run_it = 运行

# ------------------------------------------------------------ terminal_view: a terminal under its tab (TerminalView.tsx)
# A terminal's tab while its own name is not known yet.
terminal_view.terminal = 终端
# The tip of Line (input.mode_line) when it cannot be chosen.
terminal_view.no_blocks = 这个 shell 不会标记命令从哪里开始，因此只能在经典模式下运行。
terminal_view.end_failed = 无法结束终端：tTerm Web 没有响应。
# Under a terminal in the Classic mode (input.mode_classic). Tab is the key.
terminal_view.classic_hint = 经典模式：每个按键都直接发送给 shell，Tab 补全和历史记录都由 shell 自己处理。
terminal_view.classic_warning = 此模式下，危险命令不会再次确认。
# {machine} is the machine's name; the second is for while it is not known.
terminal_view.connecting = 正在连接 {machine}…
terminal_view.connecting_unknown = 正在连接机器…
# A terminal whose computer sleeps, or is offline. {since} is how long:
# 3 minutes, an hour (time.for_*).
terminal_view.away = {machine} 处于休眠或离线状态
terminal_view.away_since = 这个终端会等它恢复，然后从中断处继续。离线时长：{since}。
terminal_view.away_text = 这个终端会等它恢复，然后从中断处继续。
terminal_view.end = 结束这个终端
# A terminal that ended. Under it, how it ended as tTerm Web says it, or
# not_running.
terminal_view.no_such = 终端不存在
terminal_view.ended = 这个终端已结束
terminal_view.not_running = 它已不再运行。
terminal_view.open_new = 在 {machine} 上打开新终端
terminal_view.close_tab = 关闭标签页

# ------------------------------------------------------------ classic: the Classic mode, every key straight to the shell (ClassicTerminal.tsx)
# A command search put here. Line is the mode (input.mode_line).
classic.several_lines = 这条命令有多行，经典模式会在每一行输入后立即运行这一行。请在终端下方切换到“输入行”模式。

# ------------------------------------------------------------ tabs: the line of tabs on top (TabBar.tsx)
# The tabs that are open, for screen readers.
tabs.label = 已打开的标签页
# Naming a terminal in its tab, after a double click.
tabs.rename_title = 为这个终端命名
tabs.rename_hint = Enter 保存，Esc 取消。名称会显示在侧边栏、标签页和项目页面上。
# {name} is the tab as it reads: P/web-01 · 2, a note's title, a project's
# name.
tabs.close = 关闭标签页 {name}
# The + after the tabs.
tabs.new_terminal = 新建终端
tabs.new_terminal_title = 在任意机器上新建终端
# The button on the right that opens search.
tabs.search_title = 搜索命令及其输出、笔记、终端、机器，以及可执行的操作
tabs.search = 搜索

# ------------------------------------------------------------ finder: a list with a search field, as the + after the tabs opens it (Finder.tsx)
finder.nothing = 没有找到结果

# ------------------------------------------------------------ picker: the lists over the input line: directories, branches, history (Picker.tsx)
# While the machine is asked for its directories or branches.
picker.asking = 正在向机器查询…
picker.nothing = 这里什么都没有

# ------------------------------------------------------------ name_input: the field that names a terminal (NameInput.tsx)
# For screen readers. While the terminal has only its number,
# terminal.numbered shows faint in it.
name_input.label = 终端名称

# ------------------------------------------------------------ vault: the vault of SSH keys, words used in many places (0.1.17)
# The vault keeps the person's SSH keys, locked on their own devices; tTerm
# never sees them. Touch ID, Windows Hello and passkey are the names the
# systems give these: they stay as the systems name them in the language.
vault.your_mac = Mac
vault.open_touch = 用触控 ID 打开
vault.open_hello = 用 Windows Hello 打开
vault.open_passkey = 用通行密钥打开
vault.not_now = 以后再说
# For screen readers: the six digits both devices show, "Code 482 913".
vault.code_label = 确认码 {code}

# ------------------------------------------------------------ keys: Settings › Keys, the vault (Keys.tsx)
keys.title = 密钥
keys.about = 你的保险库：你保存的 SSH 密钥，在你的所有设备上都可用。只有你的设备能用各自的解锁方式打开它；tTerm 不能。
keys.open_here = 已在这个浏览器中打开
# How it opened, then when it locks again: one of these under "Open in this browser".
keys.open_text.touch = 已用触控 ID 打开。8 小时没有任何操作、关闭 tTerm Web 或点击“锁定”后，它会重新锁定。
keys.open_text.hello = 已用 Windows Hello 打开。8 小时没有任何操作、关闭 tTerm Web 或点击“锁定”后，它会重新锁定。
keys.open_text.passkey = 已用你的通行密钥打开。8 小时没有任何操作、关闭 tTerm Web 或点击“锁定”后，它会重新锁定。
keys.open_text.recovery = 已用你的恢复代码打开，本次会话内有效。8 小时没有任何操作、关闭 tTerm Web 或点击“锁定”后，它会重新锁定。
keys.open_text.pairing = 已由你的 Mac 批准打开，本次会话内有效。8 小时没有任何操作、关闭 tTerm Web 或点击“锁定”后，它会重新锁定。
keys.open_text.new = 刚刚在这个浏览器中创建。8 小时没有任何操作、关闭 tTerm Web 或点击“锁定”后，它会重新锁定。
# In tTerm for Mac.
keys.open_mac = 已在这台 Mac 上打开
keys.open_text.mac = 已用触控 ID 或 Mac 的密码打开。tTerm 运行期间它会一直保持打开，直到你点击“锁定”或退出登录。
keys.lock = 锁定
keys.locked_here = 已在这个浏览器中锁定
keys.locked_text = 要在这里使用你的密钥，请先打开它：用解锁这台电脑的方式、经你的 Mac 批准，或用你的恢复代码。
keys.locked_mac = 已在这台 Mac 上锁定
keys.locked_mac_text = 用触控 ID 或 Mac 的密码打开它：之后这台 Mac 就能登录你的服务器。
keys.locked_mac_code = 这台 Mac 还不能自己打开你的保险库。请用恢复代码在这里打开它一次：之后用触控 ID 或 Mac 的密码就能打开它。
keys.open = 打开
keys.open_code = 用恢复代码打开
keys.none_title = 还没有保险库
keys.none_web = 从文件添加密钥：届时会在这个浏览器中创建你的保险库，同时生成一个由你保管的恢复代码。
keys.none_app = 用“迁移到云端”保存密钥，或在终端中运行 ssh 后用出现的提示条保存：届时会用触控 ID 创建你的保险库。
keys.no_passkey_here = 这个浏览器无法用通行密钥保存你的保险库：在这里，它要用你的恢复代码或经你的 Mac 批准才能打开，每次只在当次会话中有效。
keys.no_ed25519_here = 这个浏览器无法用 Ed25519 密钥签名。请在较新的浏览器或 tTerm Mac 版中打开这些服务器。
# {servers} is a list of servers: droplet and staging; web-01 in Client X.
keys.opens = 可打开 {servers}
keys.opens_none = 还没有服务器用它打开
keys.server_in = {project} 中的 {server}
# Where the key came from, and when: {where} is a Mac's name, {day} is
# time.today, time.yesterday or time.on_day ("on 29 Oct").
keys.from_mac = {day}从 {where} 保存
keys.from_file = {day}从文件添加
# After the line above, with " · ": {ago} is "2 hours ago".
keys.used = 上次使用：{ago}
keys.unused = 尚未使用
keys.cannot_ed25519 = 这个浏览器无法用 Ed25519 密钥签名
keys.cannot_open = 无法在这里打开：请从它的文件重新添加
keys.remove = 移除
keys.add_file = 从文件添加密钥
keys.new_recovery = 生成新的恢复代码
# {places} is where the vault opens: "MacBook-Pro-Denis · tTerm for Mac, Chrome on macOS".
keys.opens_on = 可在以下设备上打开：{places}。
keys.opens_on_code = 只能用你的恢复代码打开。
keys.place_mac = {mac} · {app}
keys.place_browser = 一个浏览器
keys.more_web = 从 Mac 添加更多服务器和密钥：使用 tTerm Mac 版中的“迁移到云端”。
keys.more_app = 添加更多服务器和密钥：使用账号菜单中的“迁移到云端”。
keys.remove_title = 从你的保险库中移除 {name}？
keys.remove_confirm = 移除 {name}
keys.remove_text = {servers} 会保留在 tTerm 中，但在你选择其他打开方式之前无法打开。
keys.remove_text_none = 没有服务器用它打开。
keys.remove_hint = 密钥仍保留在原处：你的 Mac 上，或它的文件中。
keys.removed = {name} 已移出你的保险库

# ------------------------------------------------------------ add_key: Add a key from a file (Keys.tsx)
add_key.title = 从文件添加密钥
add_key.passphrase = 密码短语
add_key.passphrase_hint = 这个密钥已加密。密码短语就在这个浏览器中用来打开它，不会发往任何地方。
add_key.open_key = 打开密钥
add_key.reading = 正在读取密钥…
add_key.name = 名称
add_key.sealed_here = 它在离开这个浏览器之前，就已在这里锁定。只有你的设备能打开它；tTerm 不能。
add_key.add = 添加到你的保险库
add_key.next = 下一步
add_key.added = {name} 已加入你的保险库
# What is wrong with the file chosen. ssh-keygen and its options are commands: they stay as they are.
add_key.problem_big = 对私钥来说，这个文件太大了。
add_key.problem_read = 浏览器无法读取这个文件。
add_key.problem_format = 这不是 tTerm 能读取的私钥。支持的格式：OpenSSH 自有格式，或 PEM（PKCS#8、PKCS#1）。
add_key.problem_public = 这是公钥（.pub）。请选择私钥：同名但不带 .pub 的文件。
add_key.problem_passphrase = 这个密钥设有密码短语：请输入密码短语来打开它。
add_key.problem_wrong_passphrase = 输入的密码短语无法打开这个密钥。
add_key.problem_security_key = 这个密钥存放在安全密钥上，无法从中取出：请通过你的 Mac 打开它的服务器。
add_key.problem_dsa = 保险库不保存 DSA 密钥。请用 ssh-keygen -t ed25519 生成新密钥。
add_key.problem_nistp521 = 保险库暂不保存 ECDSA P-521 密钥：可以保存的是 Ed25519、ECDSA P-256 和 P-384，以及 RSA 密钥。
add_key.problem_type = 保险库不保存这类密钥：只保存 Ed25519、ECDSA P-256 和 P-384，以及 RSA 密钥。
add_key.problem_cipher = 这个浏览器无法打开以这种方式加密的密钥。请用 ssh-keygen -p 修改它的密码短语，然后重新添加。
add_key.problem_encrypted_pem = 这个密钥文件采用旧的 PEM 方式加密。请运行 ssh-keygen -p -f 加文件名，把它转换为 OpenSSH 格式，然后重新添加。
add_key.problem_ed25519 = 这个浏览器无法读取这种格式的 Ed25519 密钥。请试试较新的浏览器，或改用 OpenSSH 格式的密钥。
add_key.problem_several = 这个文件中有多个密钥：请逐个添加。

# ------------------------------------------------------------ vault_new: Save your key to your vault (VaultDialogs.tsx)
vault_new.title = 把你的密钥保存到保险库
# <code>…</code> is the key's name: id_ed25519. {server} is the server's name.
vault_new.text_server = <code>{key}</code> 会存入你的保险库，之后就能用它从 tTerm Web、手机或你登录的任何电脑打开 {server}。
vault_new.text = <code>{key}</code> 会存入你的保险库：用它打开的服务器，都能从 tTerm Web、手机或你登录的任何电脑打开。
# In tTerm for Mac.
vault_new.point_mac_unlock = 它用解锁这台 Mac 的方式打开：触控 ID 或 Mac 的密码。不用多记任何东西。
vault_new.point_mac_locked = 它在离开这台 Mac 之前就已锁定。只有你的设备能打开它；tTerm 不能。
vault_new.point_mac_browser = 新的浏览器要经你在这里批准，或用你的恢复代码，才能打开它。
# In a browser.
vault_new.point_web_unlock = 它用解锁这台电脑的方式打开：触控 ID、Windows Hello 或手机锁屏。不用多记任何东西。
vault_new.point_web_no_passkey = 这个浏览器无法用通行密钥保存它：在这里，它要用你的恢复代码打开，每次只在当次会话中有效。
vault_new.point_web_locked = 它在离开这个浏览器之前就已锁定。只有你的设备能打开它；tTerm 不能。
vault_new.point_web_browser = 其他浏览器要用你的恢复代码，或经你在 tTerm Mac 版中批准，才能打开它。
vault_new.make_touch = 用触控 ID 创建我的保险库
vault_new.make_hello = 用 Windows Hello 创建我的保险库
vault_new.make_passkey = 用通行密钥创建我的保险库
vault_new.make = 创建我的保险库

# ------------------------------------------------------------ recovery: the recovery code, shown once (VaultDialogs.tsx)
recovery.title = 你的恢复代码
recovery.text = 万一你丢失了所有能打开保险库的设备，这个代码就是找回密钥的唯一途径。tTerm 无法替你找回它们。它只会显示这一次。
recovery.title_new = 你的新恢复代码
recovery.text_new = 之前的代码已无法再打开你的保险库。万一你丢失了所有能打开保险库的设备，这个新代码就是找回密钥的唯一途径。它只会显示这一次。
# For screen readers.
recovery.code_label = 恢复代码 {code}
recovery.save_file = 保存为文件
recovery.copy_failed = 无法复制：请选中代码并手动复制。
# What the file saved holds.
recovery.file_text = tTerm 保险库恢复代码：{code}\\n当你的任何设备都打不开保险库时，可以用它打开。请把它保存在安全的地方，与你的设备分开存放。
recovery.kept_mac = 我已把它保存在安全的地方，不只是在这台 Mac 上
recovery.kept_web = 我已把它保存在安全的地方，不只是在这台电脑上
recovery.make_title = 生成新的恢复代码？
recovery.make_text = 你现在的代码将会失效，新代码只会显示一次。你的密钥和设备保持不变。
recovery.now_code = 你现在的恢复代码
recovery.now_code_hint = 这个浏览器上没有你保险库的通行密钥，所以要用你现在的代码来生成新代码。弄丢了？请在 tTerm Mac 版中生成新代码。
recovery.make_go = 生成新代码
recovery.make_go_passkey = 用你的通行密钥生成
recovery.make_touch = 用触控 ID 生成

# ------------------------------------------------------------ vault_open: Open your keys on this browser (VaultDialogs.tsx)
vault_open.title = 在这个浏览器中打开你的密钥
vault_open.text = 你的保险库还不认识这个浏览器。请在已经能打开保险库的设备上批准它。
vault_open.text_code = 用你的恢复代码在这个浏览器中打开保险库。
# {mac} is the Mac's name, {app} is app_link.mac: "MacBook-Pro-Denis · tTerm for Mac".
vault_open.mac_name = {mac} · {app}
vault_open.mac_ask = 请它在这里打开你的保险库
vault_open.mac_waiting = 已发出请求，正在等你在那边处理…
vault_open.mac_compare = 请只在那边显示相同的确认码时允许
vault_open.mac_approved = 已批准：正在打开你的密钥…
vault_open.mac_denied = 已在那边被拒绝。
vault_open.mac_expired = 请求已过期。请重新发送请求。
vault_open.sas_text = 你的 Mac 上也会显示一个确认码。只有两者相同时，才在那边允许：
vault_open.or = 或
vault_open.code = 恢复代码
vault_open.open = 打开
# Once open with the recovery code or the Mac's approval: whether this browser keeps a passkey.
vault_open.opened_title = 你的密钥已在这个浏览器中打开
vault_open.opened_text = 要在这里保存通行密钥，让它们下次用解锁这台电脑的方式打开吗？如果这不是你自己的电脑，请选择“仅此一次”。
vault_open.keep_touch = 用触控 ID 保存
vault_open.keep_hello = 用 Windows Hello 保存
vault_open.keep_passkey = 用通行密钥保存
vault_open.only_now = 仅此一次
vault_open.kept_session = 它们只在本次会话中保持打开。

# ------------------------------------------------------------ app_code: in tTerm for Mac, a vault this Mac has no lock of (VaultDialogs.tsx)
app_code.title = 在这台 Mac 上打开你的保险库
app_code.text = 这台 Mac 还不能自己打开你的保险库。请用恢复代码在这里打开它一次：之后这台 Mac 就能用触控 ID 打开它。
# When this Mac's lock is there but no longer opens the vault (taken off in a browser, or gone from the keychain).
app_code.text_lost = 这台 Mac 已无法再自己打开你的保险库。请用恢复代码在这里打开它一次：之后这台 Mac 就能重新用触控 ID 打开它。

# ------------------------------------------------------------ passphrase: a key's passphrase, in tTerm for Mac (VaultDialogs.tsx)
# {key} is the key's name: id_ed25519.
passphrase.title = {key} 设有密码短语
passphrase.text = 请输入密码短语：这台 Mac 会用它打开密钥，它不会发往其他任何地方。密钥会以锁定状态存入你的保险库。
# For Let tTerm in: {server} is the server's name, or several ("staging and old-vps").
passphrase.text_sign_in = 请输入密码短语：这台 Mac 会用这个密钥登录 {server} 一次，在那里添加 tTerm 的授权。密码短语不会发往其他任何地方，密钥留在这台 Mac 上。
passphrase.label = 密码短语
passphrase.go = 打开密钥

# ------------------------------------------------------------ mac_approve: in tTerm for Mac, a new browser asks for the keys (VaultDialogs.tsx)
# {device} is the browser, "Chrome on Windows".
mac_approve.title = {device} 请求打开你的密钥
mac_approve.a_browser = 某个浏览器
# {ago} is "2 minutes ago", {ip} the address it signed in from.
mac_approve.text_code = {ago}，它从 {ip} 用邮件验证码登录了你的账号。只有是你本人时才允许：它将能用你的密钥打开服务器。
mac_approve.text_code_now = 它从 {ip} 用邮件验证码登录了你的账号。只有是你本人时才允许：它将能用你的密钥打开服务器。
mac_approve.text_other = 它从 {ip} 登录了你的账号。只有是你本人时才允许：它将能用你的密钥打开服务器。
mac_approve.sas_text = 那个浏览器上显示了一个确认码。只有两者相同时才允许：
# For screen readers, while the code is on its way.
mac_approve.sas_waiting = 正在等待确认码
mac_approve.not_me = 不是我
mac_approve.allow = 用触控 ID 允许
mac_approve.not_me_note = “不是我”：那次登录会结束，“设置”›“设备”会显示还需要检查什么。

# ------------------------------------------------------------ vault_locked: a server with your key, the vault locked here (VaultLocked.tsx)
vault_locked.title = {machine} 用你的密钥打开
vault_locked.text = 你的密钥在这个浏览器中已锁定。请用解锁这台电脑的方式打开它们；tTerm 随后会登录 {machine}，而你的密钥始终不会离开这个浏览器。
vault_locked.text_app = 你的密钥在这台 Mac 上已锁定。请用触控 ID 或 Mac 的密码打开它们；之后这台 Mac 会登录 {machine}。
vault_locked.text_app_code = 这台 Mac 还不能自己打开你的保险库。请用恢复代码在这里打开它一次；之后这台 Mac 会登录 {machine}。
# Small links under the button: "or approve on MacBook-Pro-Denis · use the recovery code".
vault_locked.or = 或
vault_locked.approve_on = 在 {mac} 上批准
vault_locked.use_code = 使用恢复代码
vault_locked.approve_on_button = 在 {mac} 上批准
vault_locked.use_code_button = 使用恢复代码
vault_locked.signing = 正在用你的密钥登录 {machine}…
vault_locked.no_ed25519 = 这个浏览器无法用 Ed25519 密钥签名。请在较新的浏览器或 tTerm Mac 版中打开 {machine}。
# {key} is the key's name, or vault_locked.its_key.
vault_locked.not_here = 你的保险库已在这里打开，但这个浏览器无法打开 {key}。请在“设置”›“密钥”中从它的文件重新添加。
vault_locked.its_key = 这台服务器的密钥

# ------------------------------------------------------------ vault_problem: what went wrong with the vault (vault/store.ts)
vault_problem.no_vault = 你还没有保险库。
vault_problem.exists = 你已经有保险库了：请先打开它，再添加密钥。
vault_problem.locked = 请先打开你的保险库。
vault_problem.no_passkey = 在这里，你保险库的通行密钥都没有响应。请在你的 Mac 上批准这个浏览器，或使用你的恢复代码。
vault_problem.no_prf = 这个通行密钥无法在这里打开你的保险库。请在你的 Mac 上批准这个浏览器，或使用你的恢复代码。
vault_problem.no_prf_here = 这个浏览器无法用通行密钥保存你的保险库：它只在本次会话中保持打开。
vault_problem.lock_broken = 这个浏览器上的解锁方式已无法再打开你的保险库。请使用你的恢复代码，或在你的 Mac 上批准这个浏览器。
vault_problem.code_form = 恢复代码由 24 个字母和数字组成，分为六组，每组四个。
vault_problem.code_wrong = 这个恢复代码无法打开你的保险库。请检查一下，或在你的 Mac 上批准这个浏览器。
# In tTerm for Mac: the engine's answers, said by the page (the code window, Touch ID).
vault_problem.code_wrong_app = 这个恢复代码无法打开你的保险库。请检查一下，然后重试。
vault_problem.touch_failed = 触控 ID 或 Mac 密码验证没有通过。没有任何更改。
vault_problem.need_code = 请现在输入你的恢复代码：这个浏览器上没有你保险库的通行密钥。
vault_problem.no_x25519 = 这个浏览器版本太旧，你的 Mac 无法批准它：请使用你的恢复代码，或换用较新的浏览器。
vault_problem.pairing = 请求没有成功。请重新发送请求。
vault_problem.passkey_exists = 这个浏览器上已经有 tTerm 的通行密钥。
vault_problem.no_passkey_here = 这个浏览器无法创建通行密钥。
vault_problem.something = 出了点问题。请重试。

# ------------------------------------------------------------ ssh_strip: under a successful ssh in tTerm for Mac's terminals (SshStrip.tsx)
# {alias} is the server's name as ssh knows it: droplet.
ssh_strip.region = 在 tTerm 中保存 {alias}
ssh_strip.title = {alias}：从任何地方打开它
# <code>…</code>: the address, root@203.0.113.7, and the key, ~/.ssh/id_ed25519.
ssh_strip.text = tTerm Web、手机，以及你登录的任何电脑。<code>{address}</code>，你的密钥 <code>{key}</code>
ssh_strip.text_no_key = tTerm Web、手机，以及你登录的任何电脑。<code>{address}</code>
ssh_strip.save = 保存我的密钥
ssh_strip.let_in = 允许 tTerm 登录
ssh_strip.not_now = 以后再说
ssh_strip.never = 不再为 {alias} 询问
# <b>…</b> are the two buttons' names, as above.
ssh_strip.explain = <b>保存我的密钥：</b>密钥会存入你的保险库，只有你的设备能打开它；{alias} 保持不变。<b>允许 tTerm 登录：</b>tTerm 会在 {alias} 上添加一条自己的授权；你的密钥留在这台 Mac 上。一次添加多台服务器：使用账号菜单中的“迁移到云端”。
ssh_strip.explain_pass = <b>允许 tTerm 登录：</b>tTerm 会在 {alias} 上添加一条自己的授权；你的密钥留在这台 Mac 上。一次添加多台服务器：使用账号菜单中的“迁移到云端”。
ssh_strip.unreachable = tTerm Web 无法从云端连接到 {alias}：它会通过这台 Mac 打开，在这台 Mac 开机时可用。
ssh_strip.through_mac = 通过这台 Mac 打开
ssh_strip.saved_key = {alias} 已加入 tTerm：可以用你的密钥从任何地方打开。
ssh_strip.saved_cert = {alias} 已加入 tTerm：上面已有 tTerm 自己的授权，可以从任何地方打开。
ssh_strip.saved_mac = {alias} 已加入 tTerm：它通过这台 Mac 打开，在这台 Mac 开机时可用。

# ------------------------------------------------------------ move: Move to cloud, in tTerm for Mac (MoveToCloud.tsx)
move.title = 迁移到云端
move.text = 这台 Mac 知道的服务器将迁移到你的账号：之后可以从 tTerm Web、手机或你登录的任何电脑打开它们。在你点击“迁移”之前，什么都不会迁移。
move.servers = 这台 Mac 上的服务器
# <code>…</code> are ssh's files: they stay as they are.
move.servers_from = 来自 <code>~/.ssh/config</code>、<code>known_hosts</code> 以及你在这里运行过的 ssh
move.looking = 正在查看 ~/.ssh…
move.no_servers = 这台 Mac 还不知道任何服务器：~/.ssh/config 和 known_hosts 中都没有，它的终端里也没有运行过 ssh。
# For screen readers: the tick and the choice of each server.
move.tick_server = 迁移 {name}
move.how = {name} 的打开方式
# The three ways, in the choice of each server and on the cards under the list.
move.method_key = 我的密钥
move.method_cert = tTerm 通行证
move.method_mac = 通过这台 Mac
move.way_key = 密钥存入你的保险库；服务器保持不变。在任何浏览器中解锁你的保险库后即可打开。
move.way_cert = tTerm 在服务器上添加一条自己的授权，你的密钥留在这里。在任何地方都能打开，Telegram 中也可以。
move.way_mac = 什么都不迁移：tTerm 会在这台 Mac 开机时请它去连接。适用于位于 VPN 之后的服务器。
# {address} is root@203.0.113.7, {jump} the bastion it goes through.
move.addr_via = {address}，经由 {jump}
# After "~/.ssh/config · ": {ago} is "3 minutes ago".
move.ran_ago = {ago}运行过 ssh {alias}
move.ran_here = 在这里运行过 ssh {alias}
move.note_known = 这台 Mac 已知
move.note_git = git 托管平台：没有可打开的终端
move.note_there = 已在 tTerm 中
move.note_checking = 正在检查 tTerm Web 能否连接到它…
move.note_jump = 位于跳板机 {jump} 之后，云端能连接到该跳板机：经由它打开
move.note_jump_far = 位于只有你的网络能连接到的跳板机（{jump}）之后：通过这台 Mac
move.note_far = tTerm Web 无法从云端连接到它：通过这台 Mac
move.note_key_stays = 它的密钥 {key} 无法离开这台 Mac：通过这台 Mac
move.keys = ~/.ssh 中的密钥
move.keys_note = 只有勾选的密钥会存入你的保险库
# For screen readers.
move.tick_key = 把 {name} 保存到你的保险库
# {servers} is a server, or a list of them: droplet, staging and app-01.
move.key_used_one = {servers} 用它打开：将存入你的保险库
move.key_used_many = {servers} 用它打开：将存入你的保险库
move.key_unused = 上面的服务器都没有使用它
move.key_in_vault = 已在你的保险库中
move.key_security = 在安全密钥上：无法从中取出。它的服务器将通过这台 Mac 打开
move.key_agent = 只在 SSH 代理中：无法复制。它的服务器将通过这台 Mac 打开
move.key_type = 保险库暂不保存这类密钥。它的服务器将通过这台 Mac 打开
move.key_passphrase = 设有密码短语
move.vault_note = 你的保险库用解锁这台 Mac 的方式打开：触控 ID 或 Mac 的密码。只有你的设备能打开它；tTerm 不能。
move.go = other: 迁移 {n} 台服务器

# ------------------------------------------------------------ moved: what came of Move to cloud (MoveToCloud.tsx)
moved.title = other: {n} 台服务器中有 {ok} 台已加入 tTerm
# {project} is where they are: Personal.
moved.text = 位于 {project}：可以从 tTerm Web、手机或你登录的任何电脑打开它们。
moved.key = 用你的密钥打开
moved.key_jump = 用你的密钥打开，经由 {jump}
moved.cert = 用 tTerm 通行证打开
moved.cert_jump = 用 tTerm 通行证打开，经由 {jump}
moved.mac = 通过这台 Mac，在它开机时可用
moved.failed = 未能迁移。
# {why} is what went wrong, as the Mac said it.
moved.failed_text = 没有为它保存任何内容：{why}
moved.open = 打开终端
moved.change = 更改
# <b>…</b> is the key's name, or a list of them.
moved.keys_one = <b>{keys}</b> 已存入你的保险库，以你设备的解锁方式锁定。在任何设备上，“设置”›“密钥”中都会显示它。
moved.keys_many = <b>{keys}</b> 已存入你的保险库，以你设备的解锁方式锁定。在任何设备上，“设置”›“密钥”中都会显示它们。
moved.no_keys = 没有迁移任何密钥：你的密钥仍留在这台 Mac 上。
`;export{e as default};