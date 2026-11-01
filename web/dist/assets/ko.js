var e=`# Strings of tTerm Web's page in English: one a line, \`key = text\`.
# Every language has the same keys; the build stops when one is missing
# (scripts/strings.mjs). {name} is a value the page puts in; a counting
# string has a form for each plural of the language, "one: … | other: …",
# and {n} is the count; <b>…</b> wraps a part the page makes a link, bold
# or code. Names of machines, projects, notes and terminals, commands and
# their output, tTerm, tTerm Web and Free are not translated.

# ------------------------------------------------------------ common: words used in many places
common.close = 닫기
common.cancel = 취소
common.save = 저장
common.loading = 불러오는 중…
common.try_again = 다시 시도
common.copy = 복사
common.copied = 복사됨
common.back = 뒤로
common.done = 완료
common.more = 기타
common.sign_in = 로그인

# ------------------------------------------------------------ time: how long ago (time.ts)
# A duration after "for": Away for 3 minutes, running for an hour.
time.for_less = 1분 미만
time.for_minutes = other: {n}분
time.for_hours = other: {n}시간
time.for_days = other: {n}일
# How long ago, in full words: Signed in 3 minutes ago.
time.ago_now = 방금
time.ago_minutes = other: {n}분 전
time.ago_hours = other: {n}시간 전
time.ago_days = other: {n}일 전
# A machine that is offline: {ago} is one of the four above.
time.last_seen = 마지막 접속: {ago}
# How long ago, short, in lists of notes and in Updates: Looked 5 min ago.
time.short_minutes = other: {n}분 전
time.short_hours = other: {n}시간 전
time.yesterday = 어제
time.today = 오늘
time.days_ago = other: {n}일 전
time.last_week = 지난주
time.weeks_ago = other: {n}주 전
# {day} is a date as the language writes it: 12 Oct, 12. Okt.
time.on_day = {day}
# In search: yesterday 17:38, 2 Oct 09:12.
time.yesterday_at = 어제 {time}
time.day_at = {day} {time}

# ------------------------------------------------------------ here: the computer tTerm for Mac runs on
# Alone, as a label (the sidebar, tabs). Sentences that name it have a
# string of their own for each: .mac and .computer.
here.mac = 이 Mac
here.computer = 이 컴퓨터

# ------------------------------------------------------------ role: one's role in a project
role.owner = 소유자
role.admin = 관리자
role.member = 멤버
role.observer = 뷰어

# ------------------------------------------------------------ color: projects' colors (colors.ts)
color.violet = 보라색
color.sky = 하늘색
color.teal = 청록색
color.pink = 분홍색
color.orange = 주황색
color.lime = 라임색
color.indigo = 남색
color.slate = 청회색

# ------------------------------------------------------------ count: how many, in lists and lines
count.machines = other: 머신 {n}대
count.notes = other: 노트 {n}개
count.terminals_open = other: 열린 터미널 {n}개
# The end of a list cut short: web-01, web-02, web-03, web-04 and 3 more.
count.more = other: 그 외 {n}개

# A terminal that has only its number, in lists: terminal 2.
terminal.numbered = 터미널 {number}
# A note without a title.
note.untitled = 제목 없음

# ------------------------------------------------------------ sidebar (Sidebar.tsx)
sidebar.label = 사이드바
sidebar.all_machines = 모든 머신
sidebar.keep_open = 사이드바 고정
sidebar.keep_open_title = 사이드바 계속 열어 두기
sidebar.let_slide = 사이드바 자동으로 숨기기
sidebar.close = 사이드바 닫기
sidebar.projects = 프로젝트
sidebar.fold = {name} 접기
sidebar.unfold = {name} 펼치기
sidebar.open_project = {name} 열기: 머신과 노트
sidebar.machines = 머신
sidebar.add_machine = 머신 추가
sidebar.no_machines = 아직 머신이 없어요
sidebar.notes = 노트
sidebar.new_folder = 새 폴더
sidebar.no_notes = 아직 노트가 없어요
sidebar.no_notes_writes = 아직 노트가 없어요. +를 눌러 노트를 넣을 폴더를 만드세요
sidebar.new_project = 새 프로젝트
sidebar.waits = tTerm과 다시 연결되면 {name}에도 접속할 수 있어요
sidebar.offline = {name}: 오프라인이에요. 절전 모드이거나 에이전트가 실행 중이 아니에요
# {seen} is time.last_seen: last seen 14 minutes ago.
sidebar.offline_seen = {name}: 오프라인이에요. 절전 모드이거나 에이전트가 실행 중이 아니에요 ({seen})
sidebar.here.mac = {name}, 이 Mac: 터미널이 바로 여기에서 실행되어 인터넷이 없어도 작동해요
sidebar.here.computer = {name}, 이 컴퓨터: 터미널이 바로 여기에서 실행되어 인터넷이 없어도 작동해요
sidebar.new_terminal = 새 터미널
sidebar.new_terminal_on = {name}에서 새 터미널
sidebar.rename_hint = Enter로 저장, Esc로 취소
sidebar.go_to = {label} 터미널로 이동
sidebar.go_to_away = {label} 터미널로 이동: {machine} 머신이 돌아오기를 기다리는 중이에요
sidebar.double_click = 더블클릭해서 이름 바꾸기
sidebar.end = {label} 종료
sidebar.end_title = {label} 종료: 셸이 종료돼요
sidebar.new_note_in = {name} 폴더에 새 노트
sidebar.empty_folder = 비어 있음
sidebar.empty_folder_writes = 비어 있어요. +를 누르면 새 노트를 쓸 수 있어요
sidebar.signin_title = 서버와 프로젝트
sidebar.signin_text = 로그인하면 서버에서 터미널을 열고, 프로젝트에 노트를 남기고, 팀과 함께 작업할 수 있어요. 이 컴퓨터는 그대로 유지돼요.
sidebar.theme_dark = 다크 테마로 전환
sidebar.theme_light = 라이트 테마로 전환
# A server that opens with the person's own key, from their vault (0.1.17):
# the key's tip, after the server's name.
sidebar.with_key = 보관함에 있는 내 키로 열려요
# A server that opens through the person's Mac: a small label after its
# name, and its tip ({mac} is the Mac's name).
sidebar.via_mac = Mac 경유
sidebar.via_title = {mac} 경유, 켜져 있는 동안 열려요

# ------------------------------------------------------------ account_menu: the account at the bottom of the sidebar and its menu
# "Free" is the plan's name: it stays as it is.
account_menu.free_plan = Free 요금제
account_menu.title = 설정, 언어, 계정, 로그아웃
account_menu.title_local = 설정, 언어, 로그인
account_menu.not_signed_in = 로그인하지 않음
account_menu.only_here = 이 컴퓨터에서만 사용
account_menu.offline = 오프라인, 다시 시도하는 중
account_menu.local_note = tTerm이 이 컴퓨터에서 작동하고 있어요. 서버, 프로젝트, 팀을 쓰려면 로그인하세요.
account_menu.sign_out = 로그아웃
# Only in tTerm for Mac, right above Sign out (from 0.1.19): the servers and
# keys of this Mac to the account (0.1.17). The second line is small, under
# the first.
account_menu.move = 클라우드로 옮기기
account_menu.move_note = 이 Mac의 서버와 키
# Only in a Mac's browser, until the person has signed in with the app
# (0.1.18): the app for a Mac. "tTerm for Mac" is the app's name.
account_menu.download = Mac용 tTerm 다운로드
account_menu.download_note = 내 Mac의 로컬 터미널
# The item after Settings, and the title of the list of languages.
language.item = 언어

# ------------------------------------------------------------ settings (Settings.tsx)
# The page, and the item of the account's menu that opens it.
settings.title = 설정
settings.appearance = 모양
settings.appearance_local = 이 컴퓨터에 저장돼요. 시스템을 고르면 이 컴퓨터의 설정을 따라요. 프로젝트 색상은 코드 배지를 채우거나, 사이드바에서 프로젝트 전체에 칠해져요.
settings.appearance_account = 계정에 저장돼요. 시스템을 고르면 사용하는 컴퓨터마다 그 컴퓨터의 설정을 따라요. 프로젝트 색상은 코드 배지를 채우거나, 사이드바에서 프로젝트 전체에 칠해져요.
settings.theme = 테마
settings.theme_system = 시스템
settings.theme_light = 라이트
settings.theme_dark = 다크
settings.tints = 프로젝트 색상
settings.tint_badge = 코드 배지
settings.tint_block = 프로젝트 전체

# ------------------------------------------------------------ devices (Devices.tsx)
devices.title = 기기

# ------------------------------------------------------------ account (Account.tsx)
# The page, and the item of the account's menu that opens it.
account.title = 계정

# ------------------------------------------------------------ app: the page's frame, toasts and dialogs (App.tsx)
app.session_ended = 세션이 끝났어요. 다시 로그인하세요. 터미널은 계속 실행되고 있어요.
# How saving goes in the note in front, on the line of tabs.
app.saved = 저장됨
app.saving = 저장 중…
app.not_saved_offline = 저장 안 됨: 연결 없음
app.not_saved = 저장 안 됨
app.no_connection = 연결 없음
app.not_answering_local = tTerm Web이 응답하지 않아요. 터미널 창에서 python -m tterm.dev가 실행 중인가요?
app.not_answering = tTerm Web이 응답하지 않아요. 연결을 확인한 다음 다시 시도하세요.
# {why} is the reason tTerm Web gave, as it gave it.
app.no_terminal = 터미널을 열지 못했어요: {why}
app.offline = {name} 머신이 오프라인이에요. 에이전트가 연결되면 돌아와요.
# {seen} is time.last_seen: last seen 14 minutes ago.
app.offline_seen = {name} 머신이 오프라인이에요({seen}). 에이전트가 연결되면 돌아와요.
app.removed_shared = tTerm Web에서 {name} 머신을 제거했어요. 같은 서버가 다른 프로젝트에도 있어서, 이 서버에 대한 tTerm Web의 접근 권한은 그대로 남아요.
app.removed_access = tTerm Web에서 {name} 머신을 제거하고, 서버에서 tTerm Web의 접근 권한을 회수했어요.
app.removed = tTerm Web에서 {name} 머신을 제거했어요.
app.no_note = 새 노트를 만들지 못했어요: {why}
app.note_deleted = {folder} 폴더에서 {title} 노트를 삭제했어요.
app.note_deleted_journal = {folder} 폴더에서 {title} 노트를 삭제했어요. 로그에 기록이 남아요.
app.folder_deleted = {name} 폴더를 삭제했어요.
app.folder_deleted_journal = {name} 폴더를 삭제했어요. 로그에 기록이 남아요.
app.folder_notes_deleted = other: {name} 폴더와 노트 {n}개를 삭제했어요.
app.folder_notes_deleted_journal = other: {name} 폴더와 노트 {n}개를 삭제했어요. 로그에 기록이 남아요.
app.moved_to = {folder} 폴더로 옮겼어요.
app.no_move = 옮기지 못했어요: {why}
app.moved_here = {project} 프로젝트에서 여기로 옮겼어요.
app.moved_here_journal = {project} 프로젝트에서 여기로 옮겼어요. 그 프로젝트의 로그에 기록이 남아요.
app.moved_to_project = {project} 프로젝트의 {folder} 폴더로 옮겼어요.
app.moved_to_other = 다른 프로젝트의 {folder} 폴더로 옮겼어요.
app.copied_markdown = Markdown으로 복사했어요.
app.note_gone = 노트가 삭제됐어요.
app.no_copy = 복사하지 못했어요: {why}
app.no_copy_browser = 복사하지 못했어요: 브라우저가 허용하지 않았어요.
app.project_deleted = {name} 프로젝트를 삭제했어요.
app.project_deleted_notes = other: {name} 프로젝트와 노트 {n}개를 삭제했어요.
# {label} is where it is now: P/web-01.
app.machine_moved = {name} 머신을 {project} 프로젝트로 옮겼어요({label}). 터미널은 계속 실행돼요.
app.no_rename = 이름을 바꾸지 못했어요: {why}
app.signed_out = 로그아웃했어요. 터미널은 계속 실행돼요.
app.no_sign_out = 로그아웃하지 못했어요: tTerm Web이 응답하지 않았어요. 다시 시도하세요.
app.no_theme = 테마를 저장하지 못했어요: tTerm Web이 응답하지 않았어요.
app.no_language = 언어를 저장하지 못했어요: tTerm Web이 응답하지 않았어요.
app.no_tints = 프로젝트 색상을 저장하지 못했어요: tTerm Web이 응답하지 않았어요.
app.go_on_in_browser = 브라우저에서 계속하세요. 거기서 로그인한 다음 이 컴퓨터를 허용하면 돼요.
app.open_sidebar = 사이드바 열기
app.no_project = 프로젝트를 찾을 수 없어요
app.no_project_text = 더 이상 내 프로젝트 목록에 없어요.
app.close_the_tab = 탭 닫기
app.connection_lost = 연결이 끊겼어요. 다시 연결하는 중이에요. 터미널은 계속 실행돼요.
app.cut_off.mac = <b>tTerm에 연결되어 있지 않아요.</b> 이 Mac은 평소처럼 작동해요. 서버의 터미널은 서버에서 계속 실행되고, 다시 연결되면 여기에 돌아와요.
app.cut_off.computer = <b>tTerm에 연결되어 있지 않아요.</b> 이 컴퓨터는 평소처럼 작동해요. 서버의 터미널은 서버에서 계속 실행되고, 다시 연결되면 여기에 돌아와요.
app.paste_busy = 이 터미널에서 명령이 실행 중이라 입력 줄을 쓸 수 없어요. 명령이 끝나면 다시 시도하세요.
app.paste_gone = {machine} 머신은 더 이상 tTerm Web에 없어요. 다른 곳에서 터미널을 열고, 그 터미널의 입력 줄에 명령을 넣으세요.
app.picker.placeholder = 모든 프로젝트에서 머신 찾기
# Tabs: their labels and the tips under the mouse. {label} is a terminal's: P/web-01 · 2.
app.tab.note = 노트
app.tab.note_in = {folder} 폴더의 노트
app.tab.close_note = 노트 닫기. 노트는 폴더에 그대로 남아요.
app.tab.project = 프로젝트
app.tab.project_title = {name}: 머신과 노트
app.tab.close_page = 페이지 닫기
app.tab.terminal = 터미널
app.tab.away = {label}: {machine} 머신이 절전 모드이거나 오프라인이라 터미널이 기다리고 있어요
app.tab.away_unknown = {label}: 머신이 절전 모드이거나 오프라인이라 터미널이 기다리고 있어요
app.tab.ended = {label}: 종료됨
app.tab.running = {label}: 명령 실행 중
app.tab.close_terminal = 탭 닫기. 터미널은 계속 실행되고, 사이드바의 머신 아래에 남아요.
# A machine's state, small, after its name in lists.
app.machine.no_connection = 연결 없음
app.machine.offline = 오프라인
app.machine.offline_seen = 오프라인, {seen}
app.machine.online = 온라인
# Search and the palette (⌘K): what it finds on the page, the lines under each, and the details beside.
app.search.state_away = 컴퓨터를 기다리는 중
app.search.state_ended = 종료됨
app.search.state_busy = 명령 실행 중
app.search.state_prompt = 입력 대기 중
app.search.this_tab = 이 탭
app.search.tab = 탭
app.search.no_tab = 실행 중, 탭 없음
app.search.row_machine = 머신
app.search.row_folder = 폴더
app.search.row_now = 현재
app.search.row_in = 위치
app.search.row_edited = 마지막 편집
app.search.row_project = 프로젝트
app.search.row_system = 시스템
app.search.row_address = 주소
app.search.row_status = 상태
app.search.row_terminals = 터미널
app.search.row_code = 코드
app.search.row_does = 하는 일
app.search.open_count = other: {n}개 열림
# The button that does what was found.
app.search.open = 열기
app.search.open_note = 노트 열기
app.search.open_page = 페이지 열기
app.search.do_it = 실행
# Search words: keep the English words, add the language's own after them.
app.search.terminal_words = terminal 터미널
app.search.note_words = note 노트 메모
app.search.project_words = project page folders 프로젝트 페이지 폴더
# Things to do, in the palette: each with what it does, small, and its search words.
app.action.add_machine = 머신 추가
app.action.add_machine_hint = 서버 또는 컴퓨터
app.action.new_project_hint = 별도의 머신과 노트
app.action.edit_project = {name} 편집
app.action.edit_project_hint = 이름, 코드, 색상
app.action.new_folder_in = {name}에 새 폴더
app.action.new_folder_hint = 노트용
app.action.close_tab = 이 탭 닫기
app.action.close_tab_terminal = 터미널은 계속 실행돼요
app.action.close_tab_note = 노트는 폴더에 남아요
app.action.rename_terminal = 이 터미널에 이름 붙이기
app.action.rename_terminal_hint = 번호 대신
app.action.end_terminal = 이 터미널 종료
app.action.end_terminal_hint = 셸이 종료돼요
app.action.delete_note = 이 노트 삭제
app.action.delete_note_hint = {folder} 폴더에서
app.action.theme_dark = 다크 테마로 전환
app.action.theme_light = 라이트 테마로 전환
app.action.settings_hint_local = 테마, 프로젝트 색상
app.action.settings_hint = 테마, 프로젝트 색상, 기기
app.action.sign_in_hint = 서버, 프로젝트, 팀
app.action.account_hint = 이름, 사진, 요금제
app.action.sign_out_hint = 이 브라우저에서 로그인 정보가 지워져요
# Search words: keep the English words, add the language's own after them.
app.action.add_machine_words = new server computer connect 새 서버 컴퓨터 연결 머신 추가
app.action.new_project_words = project new create make 프로젝트 새 만들기 생성
app.action.edit_project_words = project rename edit code color colour 프로젝트 이름 변경 바꾸기 편집 코드 색상 색
app.action.new_folder_words = notes folder new create 노트 폴더 새 만들기 생성
app.action.machines_words = machines home overview 머신 홈 개요 전체
app.action.close_tab_words = tab close 탭 닫기
app.action.rename_terminal_words = terminal rename name label 터미널 이름 변경 바꾸기 붙이기 라벨
app.action.end_terminal_words = terminal end stop kill exit shell 터미널 종료 중지 끝내기 셸
app.action.delete_note_words = note delete remove 노트 메모 삭제 제거 지우기
app.action.theme_words = theme dark light colours colors 테마 다크 라이트 어두운 밝은 색상
app.action.pin_words = sidebar panel pin 사이드바 패널 고정
app.action.settings_words_local = settings preferences theme dark light colors colours support 설정 환경설정 테마 다크 라이트 색상 지원
app.action.move_words = move cloud servers keys ssh vault migrate import 옮기기 이동 클라우드 서버 키 보관함 이전 가져오기
app.action.settings_words = settings preferences theme dark light colors colours devices quick code forget browsers support 설정 환경설정 테마 다크 라이트 색상 기기 간편 코드 지우기 브라우저 지원
app.action.sign_in_words = sign in log in login account cloud servers 로그인 계정 클라우드 서버
app.action.account_words = account profile name photo picture avatar plan limits delete 계정 프로필 이름 사진 아바타 요금제 한도 삭제
app.action.sign_out_words = sign out log out logout leave switch account 로그아웃 나가기 계정 전환
# A folder: made, or named again.
app.folder.new_title = {name}에 새 폴더
app.folder.rename_title = 폴더 이름 바꾸기
app.folder.create = 폴더 만들기
app.folder.new_help_alone = 나만 볼 수 있어요. 폴더를 만든 다음 옆에 있는 +를 누르면 첫 노트를 쓸 수 있어요.
app.folder.new_help = {name} 프로젝트의 모든 사람이 이 폴더를 보고 노트를 쓸 수 있어요. 폴더를 만든 다음 옆에 있는 +를 누르면 첫 노트를 쓸 수 있어요.
app.folder.rename_help_alone = 나만 볼 수 있어요.
app.folder.rename_help = {name} 프로젝트의 모든 사람에게 새 이름이 바로 보여요. 안에 있는 노트는 그대로예요.
# Asked before it is done.
app.remove.title = {name} 머신을 제거할까요?
app.remove.confirm = {name} 제거
app.remove.text = tTerm Web에서 사라지고, 터미널이 모두 종료돼요. 그 머신에서 입력한 명령은 기록에 남아요.
app.remove.computer = 에이전트는 컴퓨터가 제거됐다는 것을 알고 멈춰요. 컴퓨터를 다시 연결하려면 머신 추가에서 컴퓨터를 고르세요.
app.remove.server = tTerm Web은 더 이상 이 서버에 로그인하지 않고, 서버에서 직접 접근 권한을 회수해요. 서버가 응답하지 않으면 직접 실행할 명령을 이어서 보여 드려요.
app.end.title = {label} 터미널을 종료할까요?
app.end.confirm = 터미널 종료
app.end.text = 터미널 창을 닫을 때처럼 셸이 종료되고, 그 안에서 실행 중인 것도 멈춰요. 실행한 내용은 탭과 기록에 남아요.
app.delete_note.title = {title} 노트를 삭제할까요?
app.delete_note.sub = 위치: {folder} 폴더
app.delete_note.confirm = 노트 삭제
app.delete_note.alone = 노트가 영구적으로 삭제돼요.
app.delete_note.shared = {project} 프로젝트의 모든 사람에게서 사라져요. 지금 노트를 열어 둔 사람도 마찬가지예요. 누가 언제 삭제했는지 로그에 남아요.
app.delete_folder.title = {name} 폴더를 삭제할까요?
app.delete_folder.confirm = 폴더 삭제
app.delete_folder.confirm_notes = other: 폴더와 노트 {n}개 삭제
app.delete_folder.empty = 폴더가 비어 있어요.
# {names} is the notes' titles, listed: Plan, Ideas and 3 more.
app.delete_folder.notes_go = other: 노트 {n}개도 함께 삭제돼요: {names}.
app.delete_folder.shared = {project} 프로젝트의 모든 사람에게서 사라져요. 지금 노트를 열어 둔 사람도 마찬가지예요. 누가 언제 폴더를 삭제했는지 로그에 남아요.
app.delete_folder.keep = 남겨 둘 노트는 먼저 옮기세요. 노트 옆의 ⋯에서 다른 폴더를 고르면 돼요.

# ------------------------------------------------------------ api: what the page says when tTerm Web gives no reason (api.ts)
api.note_changed = 그사이 다른 곳에서 노트가 바뀌었어요.
api.sign_in = 계속하려면 로그인하세요.
# {status} is the HTTP status: 502.
api.answered = tTerm Web 응답: {status}
api.confirm_first = 먼저 본인 확인을 해 주세요.
api.account_changed = 지금은 다른 계정으로 로그인되어 있어요.

# ------------------------------------------------------------ app_link: the apps for computers, as the site names them (appLink.ts)
app_link.mac = Mac용 tTerm
app_link.windows = Windows용 tTerm
app_link.linux = Linux용 tTerm

# ------------------------------------------------------------ add_machine: the window that adds a server or a computer to a project (AddMachine.tsx)
# When the browser does not let the page copy the command.
add_machine.copy_failed = 복사하지 못했어요. 명령을 선택해서 직접 복사하세요.
# How long the command works, inside add_machine.hint_computer and add_machine.hint_server as {works}.
add_machine.works_once = other: 앞으로 {n}분 동안 한 번만 쓸 수 있어요.
add_machine.title = 머신 추가
# Before the list of the projects the machine can go to.
add_machine.to_project = 추가할 프로젝트
# The two buttons Server and Computer, for screen readers.
add_machine.kind = 머신 종류
add_machine.server = 서버
add_machine.computer = 컴퓨터
# Step 1 for a computer, above the command.
add_machine.run_computer = 컴퓨터에서 이 명령을 실행하세요
# Under the command. {works} is add_machine.works_once; sudo stays as it is.
add_machine.hint_computer = 그 컴퓨터의 터미널에서 sudo 없이 내 계정으로 실행하세요. {works} 그 뒤로는 에이전트가 스스로 업데이트돼요. 나중에 새 명령을 실행하면 에이전트가 다시 설치돼요. 이때 컴퓨터는 그대로 남고, 열려 있던 터미널은 종료돼요.
# A fold under the command, for trying an agent that is not released yet.
add_machine.by_hand = 또는 에이전트를 직접 시작하기
# {version} is the agent's version: 0.11.0. tterm-agent, Python and websockets are names: they stay as they are.
add_machine.by_hand_hint = tterm-agent {version} 이상의 사본과, websockets 패키지가 설치된 Python이 필요해요. 아직 출시되지 않은 에이전트를 시험할 때 쓰는 방법이에요. 터미널 창이 열려 있는 동안 실행되고, 토큰이 이 컴퓨터의 키가 돼요.
# Step 2, while the window waits for the machine.
add_machine.keep_open = 이 창을 열어 두세요
# A fold: what the command for a computer does, point by point.
add_machine.what_command = 이 명령이 하는 일
# {folder} is ~/.tterm-web, {bot_folder} ~/.tterm; launchd and systemd are names: they stay as they are.
add_machine.what_command_puts = tTerm 에이전트를 {folder}에 설치해요. 에이전트는 tTerm 릴리스에 있는 이 시스템용 파일 하나이고, 실행하기 전에 명령 스크립트에 든 체크섬으로 검증해요. 그리고 로그인할 때마다 에이전트가 시작되게 해요(macOS는 launchd, Linux는 systemd). {bot_folder}에 tTerm 봇의 에이전트가 있다면 그대로 둬요.
add_machine.what_command_updates = 에이전트는 스스로 업데이트돼요. tTerm 릴리스 빌드가 서명한 버전으로만, 그리고 이 컴퓨터에 열린 터미널이 없을 때만 업데이트돼요.
add_machine.what_command_key = 이 컴퓨터만의 키를 만들어 컴퓨터에 보관해요. 이 키는 본인만 읽을 수 있어요. 명령에 든 토큰은 처음 연결할 때 한 번만 쓰여요.
# root is the name of the system's administrator: it stays as it is.
add_machine.what_command_runs = 에이전트는 root가 아닌 내 계정으로만 실행되고, 포트를 열지 않아요. 에이전트가 tTerm Web으로 직접 연결해서 그 연결 하나를 유지해요. 여기서 여는 터미널은 하나하나가 그 컴퓨터에서 실행되는 내 셸이에요.
# {command} is ~/.tterm-web/uninstall.sh.
add_machine.what_command_uninstall = {command} 명령으로 모두 제거할 수 있어요.
# Step 1 for a server, above the command.
add_machine.run_server = 서버에서 이 명령을 실행하세요
# Under the command. {works} is add_machine.works_once; root and sudo stay as they are.
add_machine.hint_server = {works} root로, 또는 sudo 권한이 있는 사용자로 실행하세요.
# A fold: what the script for a server does, point by point.
add_machine.what_script = 이 스크립트가 하는 일
# Here and in the next two, tterm in small letters is the name of the user the script makes on the server: it stays as it is, as sudo and sshd_config do.
add_machine.what_script_user = 비밀번호가 없는 tterm 사용자를 만들어요. tTerm 봇이 이미 만들어 둔 사용자가 있으면 그대로 써요.
add_machine.what_script_certificates = tTerm Web이 tterm 사용자로 로그인할 수 있게 해요. 이때 2분 동안만 유효하고 이 서버에서만 쓸 수 있는 인증서를 써요. 서버에는 키가 남지 않아요.
add_machine.what_script_sudo = 서버를 관리할 수 있도록 tterm 사용자에게 sudo 권한을 줘요. 명령 한 줄로 회수할 수 있어요.
add_machine.what_script_safe = sshd_config는 건드리지 않고 포트도 열지 않아요. 두 번 실행해도 안전해요.
# {name} is the machine's name.
add_machine.connected = {name} 머신이 연결됐어요
# After the machine's system and host: Ubuntu 24.04 · web-01 · in tabs it reads P/web-01.
add_machine.tabs_label = 탭 표시: {label}
add_machine.open_terminal = 터미널 열기
add_machine.add_another = 다른 머신 추가
# {why} is what went wrong, as tTerm Web said it.
add_machine.no_command = 명령을 만들지 못했어요: {why}
add_machine.expired_token = 토큰이 만료됐어요. 토큰은 10분 동안만 유효해요.
add_machine.expired_command = 명령이 만료됐어요. 명령은 10분 동안만 유효해요.
add_machine.new_command = 새 명령 받기
add_machine.failed_computer = 컴퓨터를 추가하지 못했어요.
add_machine.failed_server = 서버를 확인하지 못했어요.
add_machine.still_works = 같은 명령을 아직 쓸 수 있어요. 문제를 해결한 다음 다시 실행하세요.
# While the window waits: the agent or the server has called in, or not yet.
add_machine.agent_in = 에이전트가 연결됐어요. 컴퓨터 정보를 읽는 중…
add_machine.server_in = 서버가 응답했어요. 로그인해서 확인하는 중…
add_machine.waiting_agent = 에이전트를 기다리는 중…
add_machine.waiting_server = 서버를 기다리는 중…
# {project} is the project's name; the _unnamed ones are for when it is not known.
add_machine.appears_computer = 명령이 끝나고 몇 초 뒤에 {project} 프로젝트에 나타나요.
add_machine.appears_computer_unnamed = 명령이 끝나고 몇 초 뒤에 프로젝트에 나타나요.
add_machine.appears_server = 스크립트가 끝나는 대로 {project} 프로젝트에 나타나요. 보통 1분이면 돼요.
add_machine.appears_server_unnamed = 스크립트가 끝나는 대로 프로젝트에 나타나요. 보통 1분이면 돼요.

# ------------------------------------------------------------ signin: signing in with a code from email, and the quick code (SignIn.tsx)
# When the server does not answer at all.
signin.no_answer = 서버가 응답하지 않아요. 연결을 확인하고 다시 시도하세요.
signin.email_lead = 이메일을 입력하면 코드를 보내 드려요
# The field for the address, for screen readers.
signin.email = 이메일
# The button, while the code is being sent.
signin.sending = 보내는 중…
signin.get_code = 코드 받기
signin.new_here = 처음이신가요? 코드를 입력하면 계정을 만들 수 있어요.
signin.code_resent = 새 코드를 보냈어요. 이전 코드는 더 이상 쓸 수 없어요.
signin.code_title = 코드 입력
# {email} is the address the code went to.
signin.code_sent = <b>{email}</b> 주소로 보냈어요
# The field for the code, for screen readers.
signin.code_label = 이메일로 받은 코드
# A link that counts the seconds down until another code may be sent: New code in 42 s.
signin.resend_in = other: {n}초 후 새 코드 받기
signin.resend = 새 코드 보내기
signin.change_email = 이메일 변경
signin.no_email = 메일이 오지 않았나요? 스팸함을 확인하세요.
signin.signup_title = 계정 만들기
# The field for one's name, and the words in it while it is empty.
signin.your_name = 이름
# The one tick of signing up. <terms> and <privacy> are links to the site's two documents: their names as the site has them in the language.
signin.agree = <terms>서비스 이용약관</terms>과 <privacy>개인정보 처리방침</privacy>에 동의해요
# The button, while the account is being made.
signin.creating = 만드는 중…
signin.create = 계정 만들기
signin.another_email = 다른 이메일 사용
# A quick code is four digits that sign one in on this device.
signin.pin_easy = 추측하기 너무 쉬워요. 모두 같은 숫자나 연속된 숫자는 피해 주세요.
signin.pin_mismatch = 두 코드가 일치하지 않아요. 다시 만들어 주세요.
# {name} is the person's first name: Welcome for an account made just now, Hello for one there before.
signin.welcome = {name} 님, 환영해요!
signin.hello = {name} 님, 안녕하세요!
# The quick code, typed a second time.
signin.pin_repeat = 코드 다시 입력
signin.pin_repeat_lead = 같은 숫자 4자리를 한 번 더 입력하세요
signin.pin_offer_lead = 이 기기에서 쓸 간편 코드를 만드세요
# The field for the quick code, for screen readers: the second time, the first time.
signin.pin_repeat_label = 간편 코드 다시 입력
signin.pin_offer_label = 간편 코드
# The link that goes on without a quick code.
signin.not_now = 나중에
# {name} is the person's first name.
signin.welcome_back = {name} 님, 다시 오신 걸 환영해요!
signin.pin_lead = 간편 코드를 입력하세요
# The field for the quick code, for screen readers.
signin.pin_label = 간편 코드
signin.forgot = 코드를 잊으셨나요?
signin.switch = 계정 전환

# ------------------------------------------------------------ connect: in the browser, allowing tTerm for the computer to sign in (Connect.tsx)
connect.no_answer = tTerm이 응답하지 않아요. 연결을 확인한 다음 이 페이지를 새로 고치세요.
# {app} is app_link.*: tTerm for Mac. Also the page's title in the browser.
connect.allow_title = {app}을 허용할까요?
# The address the app opened is cut short.
connect.incomplete = 링크가 완전하지 않아요
# Sign in with your browser is the app's button: the words of app_signin.browser.
connect.start_again = 컴퓨터의 tTerm에서 다시 시작하세요: 브라우저로 로그인.
# Above signing in, after Allow. {app} is app_link.*: tTerm for Mac.
connect.confirm = {app}을 허용하려면 본인 확인을 해 주세요.
connect.signin_other = 다른 계정으로 로그인한 다음 {app}을 허용하세요.
connect.signin_then = 로그인한 다음 {app}을 허용하세요.
connect.no_connection = 연결 없음
# {computer} is the name of the computer the app runs on, {email} the account's address.
connect.asks = <b>{computer}</b>의 앱이 내 계정 {email}에 로그인하려고 해요.
# Above the code that both this page and the app show.
connect.check = 앱에 같은 코드가 표시되는지 확인하세요
# The button.
connect.allow = 허용
connect.another = 본인이 아닌가요? 다른 계정 사용
# Personal is the name of one's own project: it stays as it is. Settings and Devices are the page and its section, in the words of settings.title and devices.title.
connect.small = 이 컴퓨터는 Personal 프로젝트의 머신이 돼요. 앱은 설정 > 기기에 표시되고, 거기서 지울 수 있어요.
# While the browser goes back to the app. {app} is app_link.*: tTerm for Mac.
connect.back = {app}으로 돌아가는 중…
connect.takes_over = 이제 이 컴퓨터의 앱에서 이어서 진행해요.

# ------------------------------------------------------------ app_signin: in tTerm for the computer, signing in with the browser (AppSignIn.tsx)
# The app's first screen, for screen readers.
app_signin.welcome_label = 환영 화면
app_signin.welcome_title = tTerm에 오신 걸 환영해요
app_signin.welcome_lead = 이 컴퓨터의 터미널은 계정 없이 바로 쓸 수 있어요.
# The button: the app opens the browser, to sign in there.
app_signin.browser = 브라우저로 로그인
# The button: not now, sign in later.
app_signin.later = 나중에
app_signin.welcome_note = 로그인하면 서버, 프로젝트, 노트, 팀이 이 창에 나타나요. 로그인은 사이드바 아래쪽에서 언제든 할 수 있어요.
app_signin.cancelled = 브라우저에서 로그인이 취소됐어요.
# The title of the window that waits while one signs in in the browser.
app_signin.link_title = 브라우저로 로그인
# {host} is app.tterm.net. The code comes under it.
app_signin.link_note = tTerm이 브라우저에서 {host} 페이지를 열었어요. 거기서 로그인하고, 페이지에서 요청하면 이 컴퓨터를 허용하세요. 페이지에도 이 코드가 표시돼요:
app_signin.until_then = 그동안 이 컴퓨터는 전과 같이 작동해요.
app_signin.open_again = 페이지 다시 열기

# ------------------------------------------------------------ welcome: the first screen, while nothing is connected yet (Welcome.tsx)
# {name} is the person's first name.
welcome.title = {name} 님, tTerm에 오신 걸 환영해요
welcome.lead = 브라우저에서 바로 쓰는 서버와 컴퓨터용 터미널이에요. 이 컴퓨터에 설치할 것도, 복사할 키도, 열어야 할 포트도 없어요.
welcome.connect = 첫 머신을 연결하세요
# The two cards: the kinds of machine to connect.
welcome.server = 서버
welcome.server_note = SSH로 접속하는 VPS나 클라우드 서버예요. 서버에서 명령 한 줄을 실행하면 여기에 나타나요.
# Small labels under the cards: Linux, One command; macOS, Linux, No open ports.
welcome.one_command = 명령 한 줄
welcome.computer = 컴퓨터
welcome.computer_note = 집이나 사무실에 있는 Mac 또는 Linux 머신이에요. NAT 뒤에 있어도 돼요. 작은 에이전트가 연결을 유지해요.
welcome.no_ports = 포트 열 필요 없음
# The three steps below, for screen readers.
welcome.how = 작동 방식
welcome.step_add = 머신 추가
welcome.step_add_text = 머신에서 명령 한 줄을 실행하세요. 명령은 10분 동안 한 번만 쓸 수 있어요.
welcome.step_open = 터미널 열기
welcome.step_open_text = 명령은 하나하나 블록이 돼요. 복사하고, 다시 실행하고, 링크로 공유하세요.
welcome.step_team = 팀과 함께
welcome.step_team_text = 역할과 공유 로그가 있고, 누가 보고 있는지 항상 알 수 있어요.
# {project} is the project's name and {code} its code: P. In {code}/name, name stands for a machine's name, as in P/web-01.
welcome.footnote = 첫 프로젝트가 준비됐어요: {project}(코드 {code}). 이 프로젝트의 머신은 탭에 {code}/이름 형식으로 표시돼요.

# ------------------------------------------------------------ need_account: New project and Add machine in the app before signing in (NeedAccount.tsx)
need_account.machine_title = 머신 추가
need_account.machine_note = 서버와 다른 컴퓨터를 쓰려면 tTerm 계정이 필요해요. 아직 계정이 없다면 로그인할 때 만들어져요.
need_account.server = 서버
need_account.server_text = SSH로 접속하는 VPS나 클라우드 서버예요. 서버에서 명령 한 줄을 실행하면 여기에 나타나요.
need_account.computer = 컴퓨터
need_account.computer_text = 집이나 사무실에 있는 Mac 또는 Linux 머신이에요. NAT 뒤에 있어도 돼요.
# What the Free plan gives. {machines} is need_account.plan_machines, {terminals} need_account.plan_terminals.
need_account.machine_plan = {machines}, {terminals}까지 쓸 수 있어요.
# In need_account.machine_plan, after "Up to": in the form the words take there.
need_account.plan_machines = other: 머신 {n}대
need_account.plan_terminals = other: 열린 터미널 {n}개
need_account.machine_stays = 이 컴퓨터와 그 터미널은 그대로 유지돼요.
need_account.project_title = 새 프로젝트
need_account.project_note = 프로젝트를 더 만들려면 tTerm 계정이 필요해요. 아직 계정이 없다면 로그인할 때 만들어져요.
need_account.personal = 개인 프로젝트
need_account.personal_text = 나만 쓰는 프로젝트예요. 머신, 터미널, 노트 모두 나만 쓸 수 있어요.
need_account.shared = 공유 프로젝트
# A small label on Shared projects: they are not there yet.
need_account.soon = 출시 예정
need_account.shared_text = 팀과 함께 쓰는 프로젝트예요. 사람들을 초대하면 프로젝트의 머신에서 터미널을 열고 노트를 편집할 수 있어요.
need_account.project_plan = 직접 만드는 프로젝트마다 머신, 터미널, 노트가 따로 있어요. 팀과 함께 쓰는 공유 프로젝트도 곧 나와요.
# Personal is the name of one's own project: it stays as it is.
need_account.project_stays = Personal 프로젝트는 이 컴퓨터와 그 터미널, 노트와 함께 그대로 유지돼요.
# The button that closes the window.
need_account.not_now = 나중에

# ------------------------------------------------------------ updates: tTerm for Mac updating itself, only in the app (Updates.tsx)
# The title of Restart to update in the top bar. {version} is the new version: 0.5.1.
updates.pill_title.mac = tTerm {version} 버전이 준비됐어요. 재시작은 몇 초면 끝나요. 이 Mac에서 터미널이 실행 중이면 tTerm이 먼저 물어봐요.
updates.pill_title.computer = tTerm {version} 버전이 준비됐어요. 재시작은 몇 초면 끝나요. 이 컴퓨터에서 터미널이 실행 중이면 tTerm이 먼저 물어봐요.
updates.restarting = 재시작하는 중…
# A button, in the top bar and in Settings: tTerm restarts and the new version goes in.
updates.restart_to_update = 재시작하여 업데이트
# The card above the account in the sidebar, and Settings. {version} is the new version.
updates.ready = tTerm {version} 버전이 준비됐어요
updates.restart_takes = 재시작은 몇 초면 끝나요.
# The card's button.
updates.restart = 재시작
# A link to the notes of the new version.
updates.whats_new = 새 소식
# Once, after the restart. {version} is the version now: 0.5.1.
updates.updated = tTerm이 {version} 버전으로 업데이트됐어요
# Settings, Updates: the two ways tTerm takes a new version.
updates.auto = 자동으로 업데이트
updates.auto_text.mac = 새 버전은 tTerm을 종료할 때 설치돼요. 창을 닫고 tTerm이 메뉴 막대에 있을 때는 이 Mac에서 아무것도 실행 중이지 않으면 바로 설치돼요.
updates.auto_text.computer = 새 버전은 tTerm을 종료할 때 설치돼요. 창을 닫고 tTerm이 메뉴 막대에 있을 때는 이 컴퓨터에서 아무것도 실행 중이지 않으면 바로 설치돼요.
updates.ask = 먼저 물어보기
# "Restart to update" is the button (updates.restart_to_update): the same words.
updates.ask_text = 새 버전은 재시작하여 업데이트 버튼을 누를 때까지 기다려요.
# The section of Settings.
updates.title = 업데이트
updates.about = Mac용 tTerm은 tTerm 릴리스에서 스스로 업데이트돼요. tTerm이 서명한 버전만 설치돼요.
# For screen readers: the two ways above.
updates.how = tTerm 업데이트 방식
# Beside Update by itself.
updates.recommended = 권장
updates.checking = 새 버전을 확인하는 중…
# {version} is the new version.
updates.downloading = tTerm {version} 버전을 다운로드하는 중…
# {version} is the version this app is; {day} is today, yesterday or on 12 Oct (time.today, time.yesterday, time.on_day); {time} is 10:02.
updates.you_have_downloaded = 지금은 {version} 버전이에요. 새 버전은 {day} {time}에 다운로드했어요.
updates.you_have = 지금은 {version} 버전이에요.
# {version} is the new version; why it failed comes under it, as tTerm says it.
updates.failed = {version} 버전으로 업데이트하지 못했어요
# {site} is tterm.net. Applications is the folder of the Mac: as macOS names it in the language.
updates.download = 또는 <link>{site}</link>에서 tTerm을 다운로드해 응용 프로그램 폴더로 드래그하세요.
# A button: tTerm moves itself from the disk image to Applications.
updates.move = 응용 프로그램 폴더로 이동
# {ago} is when tTerm last looked: just now, 5 min ago, 2 h ago, yesterday, on 12 Oct (time.*).
updates.looked = tTerm {version} 버전이 최신이에요. 마지막 확인: {ago}.
updates.this_is = tTerm {version} 버전이에요.
# A button: look for a new version now.
updates.check_now = 지금 확인

# ------------------------------------------------------------ account: the name, the photo and the plan (Account.tsx)
# The file chosen for one's photo is none.
account.not_a_photo = tTerm에서 쓸 수 없는 파일이에요. 5MB 이하의 JPEG, PNG, WebP 파일을 고르세요.
# What the plan allows, after "Up to" (account.up_to): Up to 50 machines and 24 open terminals.
account.limit_machines = other: 머신 {n}대
account.limit_terminals = other: 열린 터미널 {n}개
# {limits} is one or both of the two above, as a list.
account.up_to = {limits}까지
account.no_limits = 제한 없음
# A meter of the plan, beside its label (Machines, Open terminals): 3 of 50.
account.used_of = {used}/{limit}
account.used_no_limit = {used}, 제한 없음
# The title of Close at the top of Account and Settings.
account.close_title = 이전 화면으로 돌아가기
account.photo_removed = 사진을 제거했어요. 다시 이니셜이 표시돼요.
# For screen readers: the card with one's name and photo.
account.profile = 프로필
account.change_photo = 사진 변경
account.add_photo = 사진 추가
account.your_name = 이름
account.saving = 저장 중…
account.edit_name = 이름 편집
account.remove_photo = 사진 제거
# Under the photo's buttons: what the photo is for.
account.photo_hint = 이니셜 대신 이름 옆에 표시돼요.
# For screen readers: the file chooser for the photo.
account.choose_photo = 사진 선택
# Under one's email address. {email} is support's address.
account.address_note = 이 주소로 로그인해요. 주소를 바꾸려면 <link>{email}</link>으로 메일을 보내 주세요.
# The section of the plan; its name (Free) stays as it is.
account.plan = 요금제
account.plan_note = tTerm을 만드는 동안은 무료예요. 다른 요금제가 생기면 여기에 표시되고, 바뀌는 게 있으면 미리 알려 드릴게요.
# The labels of the plan's two meters.
account.machines = 머신
account.open_terminals = 열린 터미널
account.photo_saved = 사진을 등록했어요. 사이드바 아래쪽과 메뉴에 표시돼요.
# {email} is support's address.
account.delete_note = 계정을 삭제하려면 로그인할 때 쓰는 주소에서 {email}으로 메일을 보내 주세요.

# ------------------------------------------------------------ devices: where one is signed in, in Settings (Devices.tsx)
# On the sign-in screen, after this very device was forgotten.
devices.this_forgotten = 이 기기를 지웠어요. 이메일로 받은 코드로 로그인하세요.
# {device} is a device's label: tTerm for Mac on MacBook-Pro. tTerm there now works with that computer only, as before signing in.
devices.app_signed_out = {device}에서 로그아웃했어요. 이제 그곳의 tTerm은 로그인하기 전처럼 그 컴퓨터에서만 작동해요.
# {device} is a device's label: Chrome on macOS.
devices.forgotten = {device} 항목을 지웠어요. 그 기기에서는 다시 이메일로 받은 코드로 로그인해야 해요.
# On the sign-in screen.
devices.all_forgotten = 모든 기기를 지웠어요. 이제 각 기기에서 이메일로 받은 코드로 로그인해야 해요.
devices.about = 간편 코드로 로그인하는 브라우저와, 브라우저를 통해 로그인한 컴퓨터의 tTerm이에요. 그 밖의 곳에서는 이메일로 받은 코드가 필요해요.
devices.idle = 8시간 동안 아무 활동이 없으면 tTerm이 간편 코드를 다시 물어봐요. 터미널은 계속 실행돼요.
devices.none = 기억된 브라우저가 없어요. 로그인할 때마다 이메일로 받은 코드가 필요해요.
# A mark beside the device one uses now.
devices.this_device = 이 기기
# Under a device's label. {created} and {used} are how long ago: just now, 3 minutes ago, 2 days ago (time.ago_*).
devices.app_times = 로그인: {created}, 마지막 사용: {used}
devices.browser_times = 신뢰 등록: {created}, 마지막 로그인: {used}
# A button beside each device.
devices.forget = 지우기
# The heading, and the red button that does it.
devices.forget_all = 모든 기기 지우기
devices.forget_all_text = 이 기기를 포함해 모든 기기를 지우고 모든 세션을 끝내요. 그러면 각 브라우저에서 이메일로 받은 코드를 다시 요청해요. 터미널은 계속 실행돼요.
# The button that asks first.
devices.forget_all_ask = 모든 기기 지우기…

# ------------------------------------------------------------ this_computer: the computer the app runs on, in Settings (ThisComputer.tsx)
# How the link to tTerm Web is, under the switch. {name} is the name tTerm Web knows this computer by.
this_computer.online_terminals = other: tTerm Web에서 온라인: {name} · 거기서 연 터미널 {n}개
this_computer.online = tTerm Web에서 온라인: {name}
this_computer.connecting = tTerm Web에 연결하는 중…
this_computer.waiting = 아직 tTerm Web에 연결되지 않았어요.
this_computer.no_network = 네트워크가 없어요. tTerm이 알아서 다시 시도해요.
# "Turn this on": the switch above.
this_computer.removed.mac = 이 Mac은 tTerm Web에서 제거되어 거기서 열 수 없어요. 다시 추가하려면 이 설정을 켜세요.
this_computer.removed.computer = 이 컴퓨터는 tTerm Web에서 제거되어 거기서 열 수 없어요. 다시 추가하려면 이 설정을 켜세요.
this_computer.closed.mac = 지금은 tTerm Web에서 이 Mac을 열 수 없어요.
this_computer.closed.computer = 지금은 tTerm Web에서 이 컴퓨터를 열 수 없어요.
# The section's title, on a Mac too.
this_computer.title = 이 컴퓨터
# {name} is this computer's machine in tTerm, {project} its project.
this_computer.about = {project} 프로젝트의 {name}. 터미널이 여기에서 실행되어 인터넷이 없어도 작동해요.
# The switch.
this_computer.open = tTerm Web과 휴대폰에서 열기
this_computer.open_text.mac = tTerm이 여기서 실행되는 동안 tTerm Web과 휴대폰에서 이 Mac의 터미널을 열 수 있어요. 창을 닫아도 tTerm은 메뉴 막대에 남고, 로그인할 때 시작돼요. 끄면 tTerm Web에서는 이 Mac이 오프라인으로 표시되고, 여기서는 모든 게 전과 같이 작동해요.
this_computer.open_text.computer = tTerm이 여기서 실행되는 동안 tTerm Web과 휴대폰에서 이 컴퓨터의 터미널을 열 수 있어요. 창을 닫아도 tTerm은 메뉴 막대에 남고, 로그인할 때 시작돼요. 끄면 tTerm Web에서는 이 컴퓨터가 오프라인으로 표시되고, 여기서는 모든 게 전과 같이 작동해요.
# Asked before the switch goes off while terminals opened from tTerm Web run here.
this_computer.ask_title.mac = tTerm Web에서 이 Mac을 열 수 없게 할까요?
this_computer.ask_title.computer = tTerm Web에서 이 컴퓨터를 열 수 없게 할까요?
# The red button.
this_computer.turn_off = 끄기
this_computer.ask_text.mac = other: tTerm Web에서 이 Mac에 연 터미널 {n}개가 종료되고, tTerm Web에서는 이 Mac이 오프라인으로 표시돼요.
this_computer.ask_text.computer = other: tTerm Web에서 이 컴퓨터에 연 터미널 {n}개가 종료되고, tTerm Web에서는 이 컴퓨터가 오프라인으로 표시돼요.

# ------------------------------------------------------------ photo: one's photo, cut to a circle (PhotoDialog.tsx)
# The photo could not be made here, in the browser.
photo.browser_failed = 브라우저에서 사진을 만들지 못했어요.
photo.no_answer = tTerm이 응답하지 않았어요. 다시 시도하세요.
# The dialog's title.
photo.title = 내 사진
# For screen readers: the photo in its frame, which the arrow keys move and + and - zoom.
photo.frame = 원 안의 내 사진이에요. 드래그하거나 화살표 키로 옮기고, +와 -로 확대하거나 축소하세요.
# The slider that makes the photo bigger in the circle.
photo.zoom = 확대
photo.drag = 사진을 드래그해서 원 안에 맞추세요.
# Beside the photo in three small sizes.
photo.preview = 다른 사람에게 보이는 모습
photo.note = 5MB 이하의 JPEG, PNG, WebP 파일. tTerm은 256픽셀 사본만 보관하고, 촬영 위치처럼 사진에 담긴 정보는 남기지 않아요.
photo.saving = 저장 중…
photo.save = 사진 저장

# ------------------------------------------------------------ confirm: asking before what cannot be undone (Confirm.tsx)
confirm.no_answer = tTerm Web이 응답하지 않았어요.
confirm.copy_failed = 복사하지 못했어요. 명령을 선택해서 직접 복사하세요.
# After a server is removed. {name} is the server's name.
confirm.removed = {name} 서버를 제거했어요
# The command that takes the access back comes after it.
confirm.removed_text = tTerm Web의 목록에서 빠졌고, 더 이상 이 서버에 로그인하지 않아요. 서버가 응답하지 않아서, 서버에서 직접 회수할 때까지 tTerm Web의 접근 권한은 남아 있어요:
# {user} is the server's user tterm; {command} is the command that removes it and its sudo rule.
confirm.user_stays = tTerm 봇을 쓰는 경우를 위해 {user} 사용자와 sudo 규칙은 남겨 둬요. 이것까지 제거하려면: {command}

# ------------------------------------------------------------ project_dialog: the windows of projects of one's own (ProjectDialog.tsx)
project_dialog.code_invalid = 코드는 1~4자의 문자나 숫자여야 해요.
# When saving or moving failed and tTerm Web gave no reason.
project_dialog.no_answer = tTerm Web이 응답하지 않았어요.
project_dialog.edit_title = 프로젝트 편집
project_dialog.new_title = 새 프로젝트
# Under the title, editing a project others are in: its name, code and color.
project_dialog.edit_sub = 이름, 코드, 색상은 소유자와 관리자가 바꿀 수 있어요.
project_dialog.new_sub = 프로젝트에는 다른 프로젝트와 분리된 자체 머신과 노트가 있어요.
# The label of the project's name.
project_dialog.name = 이름
# In the empty name field: an example of a project's name.
project_dialog.name_example = 예: 고객사 X
# The label of the project's code: the 1 to 4 letters or digits on its badge.
project_dialog.code = 짧은 코드
project_dialog.code_help_alone = 1~4자의 문자나 숫자예요. 탭과 사이드바에서 프로젝트를 나타내요.
project_dialog.code_help_shared = 1~4자의 문자나 숫자예요. 탭과 사이드바에서 프로젝트를 나타내고, 바꾸면 프로젝트의 모든 사람에게 한꺼번에 적용돼요.
project_dialog.code_help_new = 코드는 이름에서 만들어지고, 바꿀 수 있어요. 1~4자의 문자나 숫자이고, 탭과 사이드바에서 프로젝트를 나타내요.
# The label of the project's colors.
project_dialog.color = 색상
# "Whole project" and "Settings" are named as the choice and the page are (settings.tint_block, settings.title).
project_dialog.color_help_new = 다른 프로젝트와 겹치지 않는 색상을 골라 두었고, 바꿀 수 있어요. 색상은 코드 배지를 채우고, 설정에서 프로젝트 전체를 고르면 사이드바의 프로젝트 블록 전체에도 칠해져요.
project_dialog.color_help_alone = 색상은 코드 배지를 채우고, 설정에서 프로젝트 전체를 고르면 사이드바의 프로젝트 블록 전체에도 칠해져요.
project_dialog.color_help_shared = 색상은 프로젝트의 모든 사람에게 코드 배지를 채우고, 설정에서 프로젝트 전체를 고른 사람에게는 사이드바의 프로젝트 블록 전체에도 칠해져요.
# Above how the project will look in the sidebar and on a tab (a noun).
project_dialog.preview = 미리 보기
# In the preview, in place of the project's name while none is typed.
project_dialog.preview_name = 프로젝트
project_dialog.new_next = 이 프로젝트의 소유자가 돼요. 이어서 머신을 추가하거나 다른 프로젝트에서 옮겨 오고, 노트를 쓰면 돼요.
project_dialog.create = 프로젝트 만들기
# The title of the window that moves a machine to another project: {machine} is its name.
project_dialog.move_title = {machine} 머신 이동
project_dialog.move_sub = 내가 소유한 다른 프로젝트로 옮겨요.
# Next to each project one may move to: whether others are in it.
project_dialog.only_you = 나만 사용
project_dialog.with_others = 다른 사람과 함께
# {project} is the project it goes to, {code} that project's code, {name} the machine's name there: CX/web-01.
project_dialog.move_becomes = {project} 프로젝트에서는 {code}/{name} 머신이 돼요. 터미널은 계속 실행되고, 머신 자체에는 아무 변화도 없어요.
# The same, when its name is taken there: {machine} is its name now, {name} the one it gets (web-01-2).
project_dialog.move_becomes_taken = {project} 프로젝트에는 이미 {machine} 이름이 있어서 {code}/{name} 머신이 돼요. 터미널은 계속 실행되고, 머신 자체에는 아무 변화도 없어요.
# The button: {project} is the project's name.
project_dialog.move_to = {project} 프로젝트로 이동
# The button while there is nothing to pick (a verb).
project_dialog.move = 이동
# Next to a folder one may move a note to: it has no notes.
project_dialog.folder_empty = 비어 있음
# Next to a project without folders: the note goes to a new folder there, named as its own.
project_dialog.folder_new = 새 폴더를 만들어 옮겨요
# The title of the window that moves a note to another project: {note} is its title.
project_dialog.move_note_title = {note} 노트 이동
project_dialog.move_note_sub = 지금은 {project} 프로젝트의 {folder} 폴더에 있어요. 다른 프로젝트의 폴더를 고르세요.
# Who sees the note in the project it goes to.
project_dialog.note_alone = {project} 프로젝트에서는 나만 볼 수 있어요.
project_dialog.note_shared = {project} 프로젝트의 모든 사람이 보고 편집할 수 있어요.
# {project} is the project the note leaves.
project_dialog.note_leaves = {project} 프로젝트의 다른 사람들은 더 이상 이 노트를 볼 수 없어요. {project} 프로젝트의 로그에는 누가 언제 옮겼는지 남아요.
# The ticks: the items of a checklist ticked off, each with who ticked it.
project_dialog.note_keeps = 제목, 내용, 기록이 함께 옮겨지고, 체크 표시와 체크한 사람 정보도 그대로 남아요.
# The button: {folder} is the name of the folder made there, the note's own folder's name.
project_dialog.move_to_new_folder = 새 {folder} 폴더로 이동
project_dialog.move_to_folder = {folder} 폴더로 이동
project_dialog.delete_title = {project} 프로젝트를 삭제할까요?
# A project with machines in it cannot be deleted yet: {machine} is its machine's name.
project_dialog.delete_machine_first = 먼저 머신을 옮기거나 제거하세요: {machine}.
# {machines} is their names, listed: web-01, web-02 and db.
project_dialog.delete_machines_first = 먼저 머신을 옮기거나 제거하세요: {machines}.
# "Move to another project" and "Remove machine" are the items of a machine's ⋯ menu (projectpage.move_machine, projectpage.remove_machine).
project_dialog.delete_how = 프로젝트 페이지에서 머신 옆의 ⋯ 메뉴를 열고 다른 프로젝트로 이동 또는 머신 제거를 고르세요. 그러면 프로젝트를 삭제할 수 있어요.
project_dialog.cant_undo = 되돌릴 수 없어요.
# {n} is how many folders the project has; {notes} is project_dialog.delete_notes.
project_dialog.delete_folders = other: 폴더 {n}개와 그 안의 {notes}도 함께 삭제돼요.
# How many notes are in those folders, inside project_dialog.delete_folders: 2 folders with 5 notes are deleted with it.
project_dialog.delete_notes = other: 노트 {n}개
project_dialog.delete_no_notes = 노트가 없어요.
# Above the field the project's name is typed in.
project_dialog.delete_type = 확인하려면 프로젝트 이름을 입력하세요: {project}
# The button.
project_dialog.delete_button = {project} 삭제

# ------------------------------------------------------------ projectpage: a project's page (ProjectPage.tsx)
# The end of the line under the project's name: 2 machines · 1 terminal open · you are the owner.
projectpage.role_owner = 내 역할: 소유자
projectpage.role_admin = 내 역할: 관리자
projectpage.role_member = 내 역할: 멤버
projectpage.role_observer = 내 역할: 뷰어
# A terminal busy with a command whose line is not known.
projectpage.command_running = 명령 실행 중
# {duration} is how long the command has run: less than a minute, 3 minutes, an hour (time.for_*).
projectpage.running_for = {duration} 동안 실행 중
# The same, while it is not known how long.
projectpage.running = 실행 중
# A terminal whose machine is away: {machine} is its name.
projectpage.waits_for = {machine} 머신을 기다리는 중
# Under a terminal's name being typed. Enter and Esc are the keys.
projectpage.rename_hint = Enter로 저장, Esc로 취소.
# On a terminal's name.
projectpage.double_click = 더블클릭해서 이름 바꾸기
# The button next to a terminal: go to it (a verb).
projectpage.open = 열기
# An offline computer's state, next to its name: {ago} is how long ago (time.ago_*): Last seen 14 minutes ago.
projectpage.last_seen = 마지막 접속: {ago}
# A computer's state, next to its name.
projectpage.offline = 오프라인
projectpage.online = 온라인
# On New terminal: {machine} is the machine's name.
projectpage.offline_title = {machine}: 오프라인이에요. 절전 모드이거나 에이전트가 실행 중이 아니에요
projectpage.new_terminal_title = {machine}에서 새 터미널
# Said when New terminal is pressed on an offline computer: {seen} is time.last_seen: last seen 14 minutes ago.
projectpage.offline_wait_seen = {machine} 머신이 오프라인이에요({seen}). 에이전트가 연결되면 돌아와요.
projectpage.offline_wait = {machine} 머신이 오프라인이에요. 에이전트가 연결되면 돌아와요.
projectpage.new_terminal = 새 터미널
# The ⋯ button next to a machine, for screen readers: {machine} is its name.
projectpage.machine_menu = {machine}: 머신 메뉴
# The tip on that button: the items of its menu (projectpage.move_machine, projectpage.remove_machine).
projectpage.machine_menu_title = 다른 프로젝트로 이동, 머신 제거
# An item of a machine's menu, and the tip on its ⋯ button when it is the only item.
projectpage.remove_machine = 머신 제거
# An item of a machine's menu.
projectpage.move_machine = 다른 프로젝트로 이동
projectpage.no_terminals = 열린 터미널이 없어요
# Who changed a note last, and when: {ago} is just now, 5 min ago, yesterday, on 12 Oct (time.*).
projectpage.edited_you = 나, {ago}
# The same, someone else: {name} is their first name.
projectpage.edited_by = {name}, {ago}
# A note's author when it is oneself, in the note's menu: You, the owner and admins can delete it.
projectpage.you = 나
# A checklist's progress, in place of its first line: {n} items ticked of {total}.
projectpage.done = other: {n}/{total} 완료
# A note without text yet, in place of its first line.
projectpage.note_empty = 비어 있음
# The ⋯ button next to a note, for screen readers: {note} is its title.
projectpage.note_menu = {note}: 노트 메뉴
# The tip on that button: what its menu has.
projectpage.note_menu_title_move = 폴더, 다른 프로젝트로 이동, Markdown으로 복사, 노트 삭제
projectpage.note_menu_title = 폴더, Markdown으로 복사, 노트 삭제
# The end of the line under the project's name when nobody else is in it: 1 machine · 2 terminals open · only you.
projectpage.only_you = 나만 사용
# The tip on the project's code, next to its name.
projectpage.short_code = 짧은 코드
# The pencil next to the project's name.
projectpage.edit = 이름, 코드, 색상 편집
# A heading.
projectpage.machines = 머신
# Next to the heading Machines.
projectpage.machines_alone = 나만 이 머신에서 터미널을 열 수 있어요
projectpage.machines_shared = 내가 연 터미널
projectpage.add_machine = 머신 추가
# The two kinds of machine one can add, in a project without machines.
projectpage.server = 서버
projectpage.server_text = SSH로 접속하는 VPS나 클라우드 서버예요. 서버에서 명령 한 줄을 실행하면 여기에 나타나요.
projectpage.computer = 컴퓨터
projectpage.computer_text = 집이나 사무실에 있는 Mac 또는 Linux 머신이에요. NAT 뒤에 있어도 돼요. 작은 에이전트가 연결을 유지해요.
# "Move to another project" is the item of a machine's ⋯ menu (projectpage.move_machine).
projectpage.move_hint = 다른 프로젝트에 이미 머신이 있나요? 그 프로젝트 페이지에서 머신 옆의 ⋯ 메뉴를 열고 다른 프로젝트로 이동을 고르세요.
# On the page of Personal, the project each person has for themselves: {project} is its name.
projectpage.personal_title = {project} 프로젝트는 나만 쓸 수 있어요
projectpage.personal_text = 여기에는 아무도 초대할 수 없어요. 다른 머신을 따로 두거나 나중에 다른 사람과 함께 작업하려면, 프로젝트를 만들고 머신을 옮기세요.
projectpage.new_project = 새 프로젝트
# A heading.
projectpage.notes = 노트
# Next to the heading Notes.
projectpage.notes_alone = {project} 프로젝트의 노트는 나만 볼 수 있어요. 폴더로 정리돼요
projectpage.notes_shared = {project} 프로젝트의 모든 사람이 노트를 읽고 편집할 수 있어요. 폴더로 정리돼요
projectpage.new_folder = 새 폴더
projectpage.no_notes = 아직 노트가 없어요
# Runbooks, Access, Checklists: examples of folders' names.
projectpage.no_notes_text = 터미널이 머신에 있듯이 노트는 폴더에 있어요. 런북, 접속 정보, 체크리스트 같은 폴더부터 만들어 보세요.
# A folder without notes, next to its name.
projectpage.folder_empty = 비어 있음
# Who made a folder: {name} is their first name.
projectpage.made_by_you = 내가 만듦
projectpage.made_by = {name} 님이 만듦
projectpage.new_note = 새 노트
# The ⋯ button next to a folder, for screen readers: {folder} is its name.
projectpage.folder_menu = {folder}: 폴더 메뉴
# The tip on that button: what its menu has.
projectpage.folder_menu_title = 폴더 이름 바꾸기, 폴더 삭제
# "New note" is the button next to the folder's name (projectpage.new_note).
projectpage.folder_no_notes_writes = 아직 노트가 없어요. 새 노트를 누르면 여기에 첫 노트가 생겨요
# A heading at the end of the page: {project} is the project's name.
projectpage.delete_title = {project} 삭제
projectpage.delete_text = 폴더와 노트도 함께 삭제돼요. 머신은 먼저 다른 프로젝트로 옮기거나 제거해야 해요.
projectpage.delete_project = 프로젝트 삭제

# ------------------------------------------------------------ machines: the machines page (Machines.tsx)
# What sudo does on the machine, after "sudo" in what tTerm Web learned about it.
machines.sudo_works = 사용 가능
machines.sudo_password = 비밀번호 필요
machines.sudo_missing = 사용 불가
# What tTerm Web learned about a machine when it connected: the labels, each with its value.
machines.system = 시스템
machines.kernel = 커널
machines.cpu = CPU
machines.cores = other: 코어 {n}개
machines.memory = 메모리
machines.disk = 디스크
# {free} and {total} are sizes: 7.8 GB free of 50 GB.
machines.disk_free = {total} 중 {free} 남음
# The package manager: apt, brew.
machines.packages = 패키지
machines.shell = 셸
# {shell} is the shell its terminals start, {shells} all the shells it has: zsh (has bash, zsh).
machines.shell_has = {shell} (사용 가능: {shells})
machines.commands = 명령
# How many commands tTerm Web knows there.
machines.commands_known = other: {n}개 확인됨
# The version of the agent, or of tTerm for the computer.
machines.agent = 에이전트
# The account on the machine the terminals run as: root, deploy.
machines.account = 계정
# A computer's state on its card: {seen} is time.last_seen: offline, last seen 14 minutes ago.
machines.offline_seen = 오프라인, {seen}
machines.offline = 오프라인
machines.online = 온라인
machines.offline_note = 컴퓨터가 절전 모드이거나 오프라인이거나, 에이전트가 실행 중이 아니에요. 에이전트가 연결되면 저절로 돌아오고, 이 페이지에는 10초 안에 반영돼요.
# On Open a terminal while the computer is offline.
machines.offline_title = 오프라인이에요. 절전 모드이거나 에이전트가 실행 중이 아니에요
machines.open_terminal = 터미널 열기
# A terminal running on the machine: {label} is as its tab shows it (P/web-01 · 2).
machines.back_to = {label} 터미널로 돌아가기 (아직 실행 중)
# The tip on Remove: {machine} is the machine's name.
machines.remove_title = tTerm Web에서 {machine} 머신 제거
# The button: take the machine out (a verb).
machines.remove = 제거
# The page's heading.
machines.title = 머신
machines.add = 머신 추가
machines.lead = 탭을 닫아도 터미널은 계속 실행돼요. 셸이 종료될 때까지 여기와 사이드바에서 기다려요.
# A size: {size} is a number as the language writes it, 16 or 7.5.
machines.gb = {size}GB

# ------------------------------------------------------------ note_view: a note in its tab (NoteView.tsx)
# Said for a moment at the bottom of the page. {why} is the reason tTerm
# Web gave, as it gave it.
note_view.not_saved = 저장하지 못했어요: {why}
note_view.draft_back = 이 노트에 입력했지만 저장되지 않았던 내용을 되살렸어요.
# When tTerm Web gives no reason.
note_view.no_answer = tTerm Web이 응답하지 않았어요.
# Ticking a checklist item did not get through.
note_view.no_tick = 체크하지 못했어요: {why}
# The note's tab was closed with what was typed in it not saved. {title} is
# the note's title, or note.untitled.
note_view.kept_draft = {title}: 입력한 내용이 아직 저장되지 않았어요. 이 브라우저에 보관해 두었다가 노트를 다시 열면 되살려요.
note_view.copied_markdown = Markdown으로 복사했어요.
note_view.no_copy = 복사하지 못했어요: 브라우저가 허용하지 않았어요.
note_view.no_move = 옮기지 못했어요: {why}
# Under the note's title, the parts of one line with dots between: who
# started it and when; or who edited it last and when · who wrote it and
# on which day; then who sees it. Someone is a person no longer known.
# {name} is a person's first name; {ago} is how long ago, short: just now,
# 5 min ago, yesterday, on 12 Oct; {folder} is a folder's name.
note_view.someone_started = 누군가 {ago} {folder} 폴더에 만듦
note_view.you_started = 내가 {ago} {folder} 폴더에 만듦
note_view.started = {name} 님이 {ago} {folder} 폴더에 만듦
note_view.someone_edited = 누군가 {ago} 편집함
note_view.you_edited = 내가 {ago} 편집함
note_view.edited = {name} 님이 {ago} 편집함
# {day} is today, yesterday or on 12 Oct.
note_view.someone_wrote = 누군가 {day} 작성함
note_view.you_wrote = 내가 {day} 작성함
note_view.wrote = {name} 님이 {day} 작성함
# The end of the same line, after a dot. {project} is a project's name.
note_view.only_you = 나만 볼 수 있음
note_view.everyone_edits = {project}의 모든 사람이 편집 가능
# The note was deleted while it was open here.
note_view.gone_title = 이 노트는 삭제됐어요
note_view.gone_text = 다른 탭이나 기기에서 이 노트 또는 노트가 있던 폴더가 삭제됐어요.
note_view.close_tab = 탭 닫기
note_view.copy_what_was_here = 여기 있던 내용을 Markdown으로 복사
note_view.no_open = 노트를 열지 못했어요: {why}
# The ⋯ beside where the note is: what screen readers say, and the tip
# under the mouse, which lists what is in its menu.
note_view.menu = 노트 메뉴
note_view.menu_title_move = 폴더, 다른 프로젝트로 이동, Markdown으로 복사, 노트 삭제
note_view.menu_title = 폴더, Markdown으로 복사, 노트 삭제
# The field of the note's title, for screen readers.
note_view.title = 노트 제목
# The note was saved meanwhile from elsewhere, changed in the same places.
note_view.conflict = 작성하는 동안 다른 곳에서 이 노트의 같은 부분이 바뀌었어요. 그 부분은 내 버전과 다른 버전 중 무엇을 남길까요? 나머지는 양쪽 내용이 모두 남아요.
note_view.keep_mine = 내 버전 유지
note_view.keep_theirs = 다른 버전 유지

# ------------------------------------------------------------ note_editor: a note's blocks, written in place (NoteEditor.tsx)
# The kinds of block: what screen readers say of one, and what an empty one
# shows. Heading, Code, Divider and Text are also in the list that / opens.
note_editor.text = 텍스트
note_editor.heading = 제목
note_editor.list_item = 목록 항목
note_editor.checklist_item = 체크리스트 항목
note_editor.code = 코드
note_editor.divider = 구분선
# In the list that / opens: what a block can become. What is typed after
# the / picks from these names.
note_editor.checklist = 체크리스트
note_editor.list = 목록
# Who ticked a checklist item, beside it: You · 10:02, Denis · 12 Oct.
note_editor.you = 나
# The same, for a person no longer known.
note_editor.someone = 누군가
# What an empty note shows. The marks # - [ ] \`\`\` and / are typed as they
# are; the words after them are the language's own.
note_editor.start_writing = 작성을 시작하세요. 입력하는 대로 Markdown이 적용돼요: # 제목, - [ ] 체크리스트, \`\`\` 코드. 나머지는 /를 입력해 고르세요.
# What an empty line of text shows.
note_editor.type_slash = /를 입력해 체크리스트, 제목, 코드 넣기
# A checklist item's box, for screen readers.
note_editor.untick = 완료됨: 체크 해제
note_editor.tick = 완료로 체크
note_editor.no_copy = 복사하지 못했어요. 텍스트를 선택해서 직접 복사하세요.
# The list that / opens, for screen readers.
note_editor.turn_into = 블록 변환

# ------------------------------------------------------------ menus: the menus behind ⋯, and the window that names a folder (Menus.tsx)
# A note's menu: over the project's folders, the one the note is in
# checked; a click moves it to another.
menus.folder = 폴더
menus.move_out = 다른 프로젝트로 이동…
menus.copy_markdown = Markdown으로 복사
menus.delete_note = 노트 삭제
# Instead of Delete note, for one who may not: who may. {name} is the first
# name of the note's author.
menus.note_rights_move = 다른 프로젝트로 옮기거나 삭제할 수 있는 사람: {name}, 소유자, 관리자
menus.note_rights_delete = 삭제할 수 있는 사람: {name}, 소유자, 관리자
# The same, when the note's author is no longer known.
menus.note_rights_move_someone = 다른 프로젝트로 옮기거나 삭제할 수 있는 사람: 작성자, 소유자, 관리자
menus.note_rights_delete_someone = 삭제할 수 있는 사람: 작성자, 소유자, 관리자
# A folder's menu.
menus.rename_folder = 폴더 이름 바꾸기
menus.delete_folder = 폴더 삭제
# Instead of Delete folder, for one who may not.
menus.folder_rights = 노트가 든 폴더는 소유자와 관리자만 삭제할 수 있어요
# The window that names a folder, a new one or one renamed. First what it
# says when tTerm Web gives no reason.
menus.no_answer = tTerm Web이 응답하지 않았어요.
# The field of the folder's name, and an example of one in it.
menus.name = 이름
menus.name_example = 예: 런북

# ------------------------------------------------------------ search: search over everything, by ⌘K or Search on the right of the tabs (Search.tsx)
# The kinds of what is found: the buttons above the list, and the heads of
# its groups.
search.kind_commands = 명령
search.kind_output = 출력
search.kind_notes = 노트
search.kind_terminals = 터미널
search.kind_machines = 머신
search.kind_projects = 프로젝트
search.kind_actions = 동작
# The kind of the line chosen, on top of the preview beside the list.
search.label_command = 명령
search.label_output = 출력
search.label_note = 노트
search.label_terminal = 터미널
search.label_machine = 머신
search.label_project = 프로젝트
search.label_action = 동작
# Nothing found. {text} is what was typed; Commands, Output… are the button
# chosen above the list (search.kind_*).
search.nothing_for = ‘{text}’에 대한 결과가 없어요.
search.nothing_in_commands = 명령에서 ‘{text}’에 대한 결과가 없어요.
search.nothing_in_output = 출력에서 ‘{text}’에 대한 결과가 없어요.
search.nothing_in_notes = 노트에서 ‘{text}’에 대한 결과가 없어요.
search.nothing_in_terminals = 터미널에서 ‘{text}’에 대한 결과가 없어요.
search.nothing_in_machines = 머신에서 ‘{text}’에 대한 결과가 없어요.
search.nothing_in_projects = 프로젝트에서 ‘{text}’에 대한 결과가 없어요.
search.nothing_in_actions = 동작에서 ‘{text}’에 대한 결과가 없어요.
# How a command found ended: stopped (it has no exit code), or exit 1.
# {code} is its exit code.
search.stopped = 중지됨
search.exit = 종료 코드 {code}
# How often it ran, at the end of the line under a command:
# P/web-01 · ~/app · main · exit 0 · 10:46 · 3 runs.
search.runs = other: {n}회 실행
# Under a line of output found: the command that printed it, in npm test.
search.in_command = {command}에서
# Beside the list: what the line chosen is, a row each.
search.row_machine = 머신
# {machine} is the project's code and the machine's name: P/web-01.
search.machine_removed = {machine}, tTerm에서 제거됨
search.row_folder = 폴더
search.row_branch = 브랜치
search.row_status = 상태
search.row_when = 시각
search.row_terminal = 터미널
# {terminal} is the terminal as its tab names it, P/web-01 · deploy; {when}
# is when it ended: 10:46, yesterday 17:38, 2 Oct 09:12.
search.terminal_ended = {terminal}, {when}에 종료됨
# The buttons under the preview: the command opened at its block, or put
# into the line of the terminal in front, not run.
search.open_in_terminal = 해당 터미널에서 열기
search.into_line = 입력 줄에 넣기
# A note found: where it is (its project and folder), when it was edited.
search.row_in = 위치
search.row_edited = 마지막 편집
search.open_note = 노트 열기
# Before anything is typed: what was open last, and the commands run most
# on the machine in front; {machine} is its name.
search.recent = 최근 항목
search.yours_on = {machine}에서 실행한 내 명령
# Beside a group's head in All: all of its kind; + when there are more
# than were sent.
search.all = other: 전체 {n}개
search.all_more = other: 전체 {n}개 이상
# The window, and its field.
search.label = 검색
search.placeholder = 명령, 출력, 노트, 터미널, 머신…
search.close_title = 닫기 (Esc)
# The buttons above the list; All is the first of them.
search.filters = 검색 대상
search.kind_all = 전체
# The list of what was found, for screen readers.
search.found = 검색 결과
search.nothing_typed = 아직 입력한 내용이 없어요. 최근에 열었던 항목과 여기서 가장 자주 실행한 명령을 보여 드려요.
search.looks_in = 내 모든 터미널의 모든 명령과 그 출력, 노트, 터미널, 머신, 프로젝트에서 검색해요.
search.everything = 전체 검색
# With Output, Notes or Commands chosen and nothing typed yet.
search.type_output = 명령 출력에서 찾을 단어를 입력하세요.
search.type_notes = 노트에서 찾을 단어를 입력하세요.
search.type_commands = 명령에서 찾을 단어를 입력하세요.
# Beside the list while nothing is chosen: what to type (c: nginx,
# o: timed out…), and what each keeps to.
search.tips = 앞에 접두어를 붙이면 한 종류만 찾아요
search.tip_commands = 명령
search.tip_output = 명령이 출력한 내용
search.tip_notes = 노트
search.tip_terminals = 터미널
search.tip_machines = 머신
search.tip_projects = 프로젝트
search.tip_actions = 할 수 있는 동작
# Tab is the key.
search.tips_buttons = 또는 목록 위의 버튼 중 하나를 고르세요. Tab을 누르면 다음 버튼으로 넘어가요.
# At the bottom: a key, and what it does (move, open: verbs). {keys} is
# ⌘ Enter or Ctrl+Enter.
search.keys_move = <kbd>↑</kbd><kbd>↓</kbd> 이동
search.keys_open = <kbd>Enter</kbd> 열기
search.keys_paste = <kbd>{keys}</kbd> 입력 줄에 넣기
search.keys_next = <kbd>Tab</kbd> 다음 종류
# The words in front, and what each keeps to. c:, o:, n:, >, t:, m: and p:
# are typed as they are: keep them.
search.prefixes_title = t: 터미널, m: 머신, p: 프로젝트
search.prefix_commands = <code>c:</code> 명령
search.prefix_output = <code>o:</code> 출력
search.prefix_notes = <code>n:</code> 노트
search.prefix_actions = <code>></code> 동작

# ------------------------------------------------------------ input: tTerm's own input line, under a terminal's feed (InputLine.tsx)
# Said for a moment at the bottom of the page.
input.still_running = 명령이 아직 실행 중이에요. 끝날 때까지 기다리거나, 블록에서 Ctrl+C로 중지하세요.
# Faint, after a name in the lists over the line: .. goes up a level; the
# branch checked out now; a branch of the remote.
input.up_level = 상위 디렉터리
input.branch_current = 현재
input.branch_remote = 원격
# {error} is what went wrong, as the browser or tTerm Web said it.
input.no_answer = 머신이 응답하지 않았어요: {error}
# Faint in the line while it cannot take a command.
input.starting = 셸을 시작하는 중…
input.keys_go = 키 입력은 실행 중인 명령으로 전달돼요. 다음 명령을 입력하려면 여기를 클릭하세요.
# The directory and the branch above the line are buttons: each opens a
# list, to cd into or to switch to. Ctrl+R lists the history.
input.change_dir = 디렉터리 변경
input.switch_branch = 브랜치 전환
input.history = 기록
# The search field over those lists.
input.find_dir = 디렉터리를 찾거나 경로를 입력하세요
input.find_branch = 브랜치 찾기
input.find_command = 명령 찾기
# Tab's list of what the word could be.
input.completions = 자동 완성
input.more_not_shown = 나머지는 표시되지 않았어요. 몇 글자 더 입력하세요
# The line itself, for screen readers.
input.command = 명령
# Under the line, while it holds a command search put there.
input.from_search = 검색에서 가져옴, 아직 실행 안 됨
input.enter_runs = <kbd>Enter</kbd> 여기서 실행
input.esc_clears = <kbd>Esc</kbd> 입력 줄 비우기
# Under the line: a key, and what it does. ⇧↵ is Shift+Enter.
input.tab_complete = <kbd>Tab</kbd> 자동 완성 또는 제안 적용
input.history_local = <kbd>↑</kbd> 이 컴퓨터의 기록
input.history_devices = <kbd>↑</kbd> 모든 기기의 기록
input.new_line = <kbd>⇧↵</kbd> 줄 바꿈
input.while_running = 명령이 실행되는 동안에는 입력한 내용이 그 명령으로 전달돼요
# A terminal's two modes, beside the line: Line, with this line and the
# commands as blocks; Classic, every key straight to the shell.
input.mode = 입력 모드
input.mode_line = 입력 줄
input.mode_classic = 클래식

# ------------------------------------------------------------ block: one command of the feed, with its output (BlockView.tsx)
# The block, for screen readers. {command} is the command as typed, {code}
# its exit code.
block.state_input = {command}, 셸에서 시작되지 않음
block.state_running = {command}, 실행 중
block.state_failed = {command}, 실패 (종료 코드 {code})
block.state_finished = {command}, 완료
block.state_ended = {command}, 종료됨
# A command redacted in the machine's log (0.1.20): its words are gone.
block.state_redacted = 지워진 명령
# On a block search opened: the words found are marked in it.
block.found = 검색 결과
# A command the shell has not started; Stop is the button (block.stop).
block.not_started_title = 셸이 나머지 입력을 기다리고 있거나(닫히지 않은 따옴표나 heredoc), 명령을 받지 않았어요. 블록에 이어서 입력하거나 중지를 누르세요.
block.not_started = 시작 안 됨
block.running = 실행 중
# A command that failed: exit 1.
block.exit = 종료 코드 {code}
block.stop_title = 명령 중지 (Ctrl+C)
# The button that stops the command running: a verb.
block.stop = 중지
# The buttons of a finished block, with their tips.
block.actions = 블록 동작
block.copy_block = 명령과 출력 복사
block.copy_output = 출력 복사
block.copy_output_title = 출력만 복사
block.run_again = 다시 실행
block.copy_link = 이 블록의 링크 복사
block.expand = 블록 펼치기
block.collapse = 블록 접기
# For screen readers: the browser did not let the page copy.
block.not_copied = 복사 안 됨
# A folded block, in its place; a click unfolds it.
block.lines_hidden = other: {n}줄 숨겨짐
# Above a long output, of which the last 400 lines show.
block.show_earlier = other: 이전 {n}줄 보기
block.show_whole = 전체 출력 보기

# ------------------------------------------------------------ feed: a terminal's commands as blocks, in the Line mode (FeedTerminal.tsx)
# Said for a moment at the bottom of the page.
feed.not_connected = 지금 tTerm Web에 연결되어 있지 않아서 명령을 보내지 못했어요.
feed.still_running = 명령이 아직 실행 중이에요. Ctrl+C로 중지할 수 있어요.
feed.copy_refused = 브라우저가 복사를 허용하지 않았어요.
feed.output_gone = 전체 출력이 더 이상 남아 있지 않아요.
feed.show_earlier = 이전 명령 보기
# After clear or Ctrl+L, on top: what came before is out of view; a click
# shows it again.
feed.cleared = other: 블록 {n}개를 화면에서 지웠어요: 다시 보기
feed.empty = 아래에 명령을 입력하세요. 명령은 하나하나 여기에 블록으로 나타나고, 출력, 걸린 시간, 종료 결과가 함께 표시돼요.
# Asked before a dangerous command runs. {what} is what it would do and
# {lost} what does not come back, as tTerm Web says them: delete a
# directory and everything inside it; There is no undo and no bin to look
# in. {machine} is the machine's name; the second is for while it is not
# known.
feed.confirm_label = 이 명령을 실행할까요?
feed.confirm = 이 명령은 <strong>{machine}</strong>에서 다음 작업을 해요: <strong>{what}</strong>. {lost}
feed.confirm_unknown = 이 명령은 <strong>해당 머신</strong>에서 다음 작업을 해요: <strong>{what}</strong>. {lost}
# What a command held back would do ({what} of feed.confirm, so in the form
# that fits there) and what does not come back ({lost}): the nine of the
# core and the app (danger.ts).
danger.delete_tree = 디렉터리와 그 안의 모든 항목 삭제
danger.delete_tree_lost = 되돌릴 수 없고, 휴지통에서 찾을 수도 없어요.
danger.disk = 디스크의 파일 시스템 덮어쓰기
danger.disk_lost = 파일뿐 아니라 그 디스크에 있는 모든 것이 사라져요.
danger.device = 장치에 직접 쓰기
danger.device_lost = 시작하는 순간 그 장치에 있던 내용이 모두 사라져요.
danger.database = 데이터베이스 또는 테이블 삭제
danger.database_lost = 백업이 있어야만 되살릴 수 있어요.
danger.power_off = 머신 전원 끄기
danger.power_off_lost = 여기서는 다시 켤 수 없어요. 다시 켜려면 호스팅 업체의 관리 패널이 필요해요.
danger.reboot = 머신 재부팅
danger.reboot_lost = 세션이 끊기고, 실행 중이던 작업도 모두 함께 멈춰요.
danger.ssh = SSH 서비스 중지
danger.ssh_lost = SSH는 머신으로 들어가는 길이에요. 중지하면 안에서 문을 잠그는 셈이에요.
danger.firewall = 방화벽 변경
danger.firewall_lost = 잘못된 규칙 하나로 머신에 다시 접속할 수 없게 될 수 있어요.
danger.user = 사용자 계정 삭제
danger.user_lost = 그 사용자의 파일과 접근 권한도 함께 사라져요.
# Under it, for rm -rf aimed at / or ~.
feed.everything = <strong>머신 전체가 대상이에요.</strong> 머신에 있는 어떤 것도 남지 않아요.
feed.run_it = 실행

# ------------------------------------------------------------ log: the log of a machine, in the Logs folder of a project's notes (LogView.tsx, LogNotes.tsx)
# The folder in the sidebar, before a project's folders of notes, and the
# small label after it with its tip.
log.folder = 로그
log.by_tterm = tTerm이 기록
log.by_tterm_title = tTerm이 기록하는 내용이라 아무도 바꿀 수 없어요
# After a machine's name in the folder: commands run on it today.
log.today_count = 오늘 {n}개
# A log's tab, after the project's code: P/web-01 log. {machine} is the machine's name.
log.tab = {machine} 로그
log.tab_title = {machine} 머신의 로그
log.close_tab = 로그 닫기
# The ⋯ over the page, and its one item.
log.menu = 로그 메뉴
log.copy_markdown = Markdown으로 복사
# Under the title. {lines} and {output} are log.keep_year or log.keep_days.
log.lead = tTerm을 통해 {machine}에서 실행된 내용이에요. tTerm이 기록하고, 아무도 바꿀 수 없어요. 로그 줄은 {lines} 동안, 명령이 출력한 내용은 {output} 동안 보관돼요.
log.keep_year = 1년
log.keep_days = other: {n}일
# Going from day to day.
log.day_before = 전날
log.day_after = 다음 날
log.today = 오늘
log.pick_day = 날짜 선택
# The day over its lines: Today, Thursday 29 October. {day} is the date, as the language writes it with the day of the week.
log.day_today = 오늘, {day}
log.day_yesterday = 어제, {day}
# What the day holds, on the right of it: 9 commands · 1 failed · 3 notes.
log.commands = other: 명령 {n}개
log.failed = other: 실패 {n}개
# A day with nothing in it.
log.nothing_day = 이날은 tTerm을 통해 {machine}에서 실행된 것이 없어요.
log.nothing_yet = 아직 tTerm을 통해 {machine}에서 실행된 것이 없어요. 이 머신의 터미널에서 실행된 명령은 끝나는 대로 여기에 나타나요.
log.cut = 여기에는 이날의 처음 {n}줄만 표시돼요.
# A terminal opened or ended. {name} is a terminal's name: terminal 1, or the name it was given; {who} a person's first name.
log.opened_you = 내가 {name} 시작함
log.opened = {who} 님이 {name} 시작함
log.ended_you = 내가 {name} 종료함
log.ended = {who} 님이 {name} 종료함
# A terminal that ended by itself: the shell exited, the connection went. {why} is what tTerm Web said, as it said it.
log.ended_why = {name} 종료됨: {why}
# A command's line under the mouse.
log.output = 출력
log.output_title = 해당 터미널에서 열기
log.output_gone = 출력 보관 안 됨
# {days} is log.keep_days or log.keep_year.
log.output_gone_title = 출력은 {days} 동안 보관돼요
log.add_note = 노트 추가
log.add_note_title = 이 명령에 노트 추가
log.line_menu = 더 보기
log.copy_command = 명령 복사
log.copy_link = 이 줄의 링크 복사
log.redact = 지우기…
# Under Redact in the menu.
log.redact_note = 실수로 들어간 비밀번호나 토큰을 지울 때 써요. 텍스트는 영구적으로 사라지고, 누가 언제 왜 지웠는지는 로그에 남아요.
# In place of redacted words: Redacted by You · 09:23 · a password. {at} is when, {reason} why, as the person wrote it.
log.redacted_by_you = 내가 지움 · {at} · {reason}
log.redacted_by = {who} 님이 지움 · {at} · {reason}
log.redacted_by_someone = 지워짐 · {at} · {reason}
# Who wrote a note: You, or a person's first name; an AI on someone's behalf: AI for You, AI for Anna. "AI" may be the language's own short word for it.
log.you = 나
log.someone = 누군가
log.ai_for_you = 내 AI
log.ai_for = {who} 님의 AI
log.reply = 답글
# Writing a note. <k>…</k> are keys on the keyboard.
log.note_label = 명령에 대한 노트
log.reply_label = 답글
log.note_placeholder = 이유, 결과, 다음에 할 일
log.reply_placeholder = 답글을 입력하세요
log.edit_hint = 쓴 그대로 로그에 남아요 · <k>Enter</k>로 저장 · <k>Esc</k>로 취소
# {why} is what tTerm Web said, as it said it.
log.no_note = 노트를 저장하지 못했어요: {why}
log.note_menu = 더 보기
log.copy_note = 텍스트 복사
# Redacting: the window that asks why. Under its title: web-01 · today, 09:20 · terminal 1.
log.redact_command_title = 이 명령을 지울까요?
log.redact_note_title = 이 노트를 지울까요?
log.redact_where = {machine} · {when} · {name}
# {when} above: today, 09:20; another day with its date. {time} is the time, {day} the date with the day of the week.
log.when_today = 오늘 {time}
log.when_on = {day} {time}
log.redact_command_text = 이 텍스트는 tTerm에서 영구적으로 사라져요. 로그, 터미널의 블록, 검색 어디에도 남지 않아요. 로그에는 여기에 명령이 있었다는 것과 누가 언제 왜 지웠는지가 남아요.
log.redact_note_text = 이 텍스트는 tTerm에서 영구적으로 사라져요. 로그에는 여기에 노트가 있었다는 것과 누가 언제 왜 지웠는지가 남아요.
log.why = 이유
log.why_placeholder = 비밀번호, 토큰 등
log.redact_button = 지우기
# After a command is redacted, when the same command was run elsewhere in the project too: those go with it.
log.redacted_also = other: 이 프로젝트에서 같은 명령이 {n}번 더 실행되어 함께 지웠어요.
# Over a day whose commands' output is no longer kept. {output} and {lines} are log.keep_days or log.keep_year.
log.old_banner = <b>이 명령들이 출력한 내용은 더 이상 보관되지 않아요.</b> 출력은 {output}, 로그 줄은 {lines} 동안 보관돼요. 유료 요금제에서는 둘 다 더 오래 보관할 예정이에요.
# {why} is what went wrong, as tTerm Web said it.
log.no_open = 로그를 열지 못했어요: {why}
log.gone_title = 이 로그를 찾을 수 없어요
log.gone_text = 이 로그의 머신이 제거됐거나, 내가 속하지 않은 프로젝트로 옮겨졌어요.

# ------------------------------------------------------------ terminal_view: a terminal under its tab (TerminalView.tsx)
# A terminal's tab while its own name is not known yet.
terminal_view.terminal = 터미널
# The tip of Line (input.mode_line) when it cannot be chosen.
terminal_view.no_blocks = 이 셸은 명령이 시작되는 위치를 표시하지 않아서 클래식 모드로만 실행돼요.
terminal_view.end_failed = 터미널을 종료하지 못했어요: tTerm Web이 응답하지 않았어요.
# Under a terminal in the Classic mode (input.mode_classic). Tab is the key.
terminal_view.classic_hint = 클래식: 모든 키가 셸로 바로 전달되고, Tab과 기록도 셸 자체의 기능을 써요.
terminal_view.classic_warning = 이 모드에서는 위험한 명령도 확인 없이 실행돼요.
# {machine} is the machine's name; the second is for while it is not known.
terminal_view.connecting = {machine}에 연결하는 중…
terminal_view.connecting_unknown = 머신에 연결하는 중…
# A terminal whose computer sleeps, or is offline. {since} is how long:
# 3 minutes, an hour (time.for_*).
terminal_view.away = {machine} 머신이 절전 모드이거나 오프라인이에요
terminal_view.away_since = 이 터미널은 머신이 돌아오기를 기다렸다가, 돌아오면 멈춘 곳에서 이어서 계속해요. {since} 동안 연결이 끊겨 있어요.
terminal_view.away_text = 이 터미널은 머신이 돌아오기를 기다렸다가, 돌아오면 멈춘 곳에서 이어서 계속해요.
terminal_view.end = 이 터미널 종료
# A terminal that ended. Under it, how it ended as tTerm Web says it, or
# not_running.
terminal_view.no_such = 터미널을 찾을 수 없어요
terminal_view.ended = 이 터미널은 종료됐어요
terminal_view.not_running = 더 이상 실행되고 있지 않아요.
terminal_view.open_new = {machine}에서 새 터미널 열기
terminal_view.close_tab = 탭 닫기

# ------------------------------------------------------------ classic: the Classic mode, every key straight to the shell (ClassicTerminal.tsx)
# A command search put here. Line is the mode (input.mode_line).
classic.several_lines = 이 명령은 여러 줄이라 클래식 모드에서는 한 줄씩 들어가는 대로 실행돼요. 터미널 아래에서 입력 줄 모드로 바꾸세요.

# ------------------------------------------------------------ tabs: the line of tabs on top (TabBar.tsx)
# The tabs that are open, for screen readers.
tabs.label = 열린 탭
# Naming a terminal in its tab, after a double click.
tabs.rename_title = 이 터미널에 이름 붙이기
tabs.rename_hint = Enter로 저장, Esc로 취소. 이름은 사이드바, 탭, 프로젝트 페이지에 표시돼요.
# {name} is the tab as it reads: P/web-01 · 2, a note's title, a project's
# name.
tabs.close = {name} 탭 닫기
# The + after the tabs.
tabs.new_terminal = 새 터미널
tabs.new_terminal_title = 아무 머신에서나 새 터미널 열기
# The button on the right that opens search.
tabs.search_title = 명령과 그 출력, 노트, 터미널, 머신, 할 수 있는 동작 검색
tabs.search = 검색

# ------------------------------------------------------------ finder: a list with a search field, as the + after the tabs opens it (Finder.tsx)
finder.nothing = 결과가 없어요

# ------------------------------------------------------------ picker: the lists over the input line: directories, branches, history (Picker.tsx)
# While the machine is asked for its directories or branches.
picker.asking = 머신에서 가져오는 중…
picker.nothing = 항목이 없어요

# ------------------------------------------------------------ name_input: the field that names a terminal (NameInput.tsx)
# For screen readers. While the terminal has only its number,
# terminal.numbered shows faint in it.
name_input.label = 터미널 이름

# ------------------------------------------------------------ vault: the vault of SSH keys, words used in many places (0.1.17)
# The vault keeps the person's SSH keys, locked on their own devices; tTerm
# never sees them. Touch ID, Windows Hello and passkey are the names the
# systems give these: they stay as the systems name them in the language.
vault.your_mac = 내 Mac
vault.open_touch = Touch ID로 열기
vault.open_hello = Windows Hello로 열기
vault.open_passkey = 패스키로 열기
vault.not_now = 나중에
# For screen readers: the six digits both devices show, "Code 482 913".
vault.code_label = 코드 {code}

# ------------------------------------------------------------ keys: Settings › Keys, the vault (Keys.tsx)
keys.title = SSH 키
keys.about = 내 보관함: 저장한 SSH 키를 내 모든 기기에서 쓸 수 있어요. 보관함은 내 기기만 각 기기의 잠금 해제 방식으로 열 수 있고, tTerm은 열 수 없어요.
keys.open_here = 이 브라우저에서 열려 있음
# How it opened, then when it locks again: one of these under "Open in this browser".
keys.open_text.touch = Touch ID로 열었어요. 8시간 동안 아무 활동이 없거나, tTerm Web을 닫거나, ‘잠그기’를 누르면 다시 잠겨요.
keys.open_text.hello = Windows Hello로 열었어요. 8시간 동안 아무 활동이 없거나, tTerm Web을 닫거나, ‘잠그기’를 누르면 다시 잠겨요.
keys.open_text.passkey = 패스키로 열었어요. 8시간 동안 아무 활동이 없거나, tTerm Web을 닫거나, ‘잠그기’를 누르면 다시 잠겨요.
keys.open_text.recovery = 복구 코드로 이 세션 동안 열었어요. 8시간 동안 아무 활동이 없거나, tTerm Web을 닫거나, ‘잠그기’를 누르면 다시 잠겨요.
keys.open_text.pairing = Mac의 승인으로 이 세션 동안 열었어요. 8시간 동안 아무 활동이 없거나, tTerm Web을 닫거나, ‘잠그기’를 누르면 다시 잠겨요.
keys.open_text.new = 방금 이 브라우저에서 만들었어요. 8시간 동안 아무 활동이 없거나, tTerm Web을 닫거나, ‘잠그기’를 누르면 다시 잠겨요.
# In tTerm for Mac.
keys.open_mac = 이 Mac에서 열려 있음
keys.open_text.mac = Touch ID 또는 Mac 암호로 열었어요. tTerm이 실행되는 동안 ‘잠그기’를 누르거나 로그아웃할 때까지 열려 있어요.
keys.lock = 잠그기
keys.locked_here = 이 브라우저에서 잠겨 있음
keys.locked_text = 여기서 키를 쓰려면 보관함을 여세요. 이 컴퓨터의 잠금 해제 방식, Mac의 승인, 또는 복구 코드로 열 수 있어요.
keys.locked_mac = 이 Mac에서 잠겨 있음
keys.locked_mac_text = Touch ID 또는 Mac 암호로 여세요. 그러면 이 Mac이 내 서버에 로그인해요.
keys.locked_mac_code = 이 Mac은 아직 보관함을 직접 열 수 없어요. 여기서 복구 코드로 한 번만 열면, 그다음부터는 Touch ID 또는 Mac 암호로 열려요.
keys.open = 열기
keys.open_code = 복구 코드로 열기
keys.none_title = 아직 보관함이 없어요
keys.none_web = 파일에서 키를 추가하세요. 그러면 이 브라우저에서 보관함이 만들어지고, 직접 보관할 복구 코드도 생겨요.
keys.none_app = ‘클라우드로 옮기기’에서, 또는 터미널에서 ssh를 실행한 뒤 나타나는 배너에서 키를 저장하세요. 그러면 Touch ID로 보관함이 만들어져요.
keys.no_passkey_here = 이 브라우저에는 보관함 패스키를 저장할 수 없어요. 여기서는 복구 코드나 Mac의 승인으로 매번 한 세션 동안만 열려요.
keys.no_ed25519_here = 이 브라우저는 Ed25519 키로 서명할 수 없어요. 이런 키로 여는 서버는 최신 브라우저나 Mac용 tTerm에서 여세요.
# {servers} is a list of servers: droplet and staging; web-01 in Client X.
keys.opens = 여는 서버: {servers}
keys.opens_none = 아직 이 키로 여는 서버가 없어요
keys.server_in = {project}의 {server}
# Where the key came from, and when: {where} is a Mac's name, {day} is
# time.today, time.yesterday or time.on_day ("on 29 Oct").
keys.from_mac = {day} {where}에서 저장함
keys.from_file = {day} 파일에서 추가함
# After the line above, with " · ": {ago} is "2 hours ago".
keys.used = 마지막 사용: {ago}
keys.unused = 아직 사용 안 함
keys.cannot_ed25519 = 이 브라우저는 Ed25519 키로 서명할 수 없어요
keys.cannot_open = 여기서는 열리지 않아요: 키 파일에서 다시 추가하세요
keys.remove = 제거
keys.add_file = 파일에서 키 추가
keys.new_recovery = 새 복구 코드 만들기
# {places} is where the vault opens: "MacBook-Pro-Denis · tTerm for Mac, Chrome on macOS".
keys.opens_on = 보관함이 열리는 곳: {places}.
keys.opens_on_code = 보관함은 복구 코드로만 열려요.
keys.place_mac = {mac} · {app}
keys.place_browser = 브라우저
keys.more_web = Mac의 서버와 키를 더 옮기려면 Mac용 tTerm에서 ‘클라우드로 옮기기’를 쓰세요.
keys.more_app = 서버와 키를 더 옮기려면 계정 메뉴에서 ‘클라우드로 옮기기’를 쓰세요.
keys.remove_title = 보관함에서 {name} 키를 제거할까요?
keys.remove_confirm = {name} 제거
keys.remove_text = {servers} 서버는 tTerm에 남지만, 다른 접속 방법을 고르기 전까지는 열 수 없어요.
keys.remove_text_none = 이 키로 여는 서버는 없어요.
keys.remove_hint = 키 원본은 원래 있던 곳, 즉 내 Mac이나 키 파일에 그대로 남아요.
keys.removed = 보관함에서 {name} 키를 제거했어요

# ------------------------------------------------------------ add_key: Add a key from a file (Keys.tsx)
add_key.title = 파일에서 키 추가
add_key.passphrase = 암호 문구
add_key.passphrase_hint = 키가 암호화되어 있어요. 암호 문구는 여기 이 브라우저에서 키를 여는 데 쓰이고, 어디로도 전송되지 않아요.
add_key.open_key = 키 열기
add_key.reading = 키를 읽는 중…
add_key.name = 이름
add_key.sealed_here = 키는 이 브라우저를 떠나기 전에 여기서 잠겨요. 내 기기만 열 수 있고, tTerm은 열 수 없어요.
add_key.add = 보관함에 추가
add_key.next = 다음
add_key.added = {name} 키를 보관함에 추가했어요
# What is wrong with the file chosen. ssh-keygen and its options are commands: they stay as they are.
add_key.problem_big = 개인 키라고 하기에는 파일이 너무 커요.
add_key.problem_read = 브라우저가 이 파일을 읽지 못했어요.
add_key.problem_format = tTerm이 읽을 수 있는 개인 키가 아니에요. OpenSSH 자체 형식이나 PEM(PKCS#8, PKCS#1) 형식이어야 해요.
add_key.problem_public = 공개 키(.pub)예요. 개인 키를 고르세요. .pub이 붙지 않은 같은 이름의 파일이에요.
add_key.problem_passphrase = 키에 암호 문구가 있어요. 암호 문구를 입력해 키를 여세요.
add_key.problem_wrong_passphrase = 이 암호 문구로는 키를 열 수 없어요.
add_key.problem_security_key = 이 키는 보안 키에 들어 있어서 밖으로 꺼낼 수 없어요. 이 키의 서버는 내 Mac을 경유해 여세요.
add_key.problem_dsa = DSA 키는 보관함에 저장할 수 없어요. ssh-keygen -t ed25519로 새 키를 만드세요.
add_key.problem_nistp521 = ECDSA P-521 키는 아직 보관함에 저장할 수 없어요. Ed25519, ECDSA P-256과 P-384, RSA 키는 저장할 수 있어요.
add_key.problem_type = 이 종류의 키는 보관함에 저장할 수 없어요. Ed25519, ECDSA P-256과 P-384, RSA 키만 저장할 수 있어요.
add_key.problem_cipher = 이 키는 이 브라우저가 열 수 없는 방식으로 암호화되어 있어요. ssh-keygen -p로 암호 문구를 바꾼 다음 다시 추가하세요.
add_key.problem_encrypted_pem = 이 키 파일은 예전 PEM 방식으로 암호화되어 있어요. ssh-keygen -p -f 뒤에 파일을 지정해 OpenSSH 형식으로 바꾼 다음 다시 추가하세요.
add_key.problem_ed25519 = 이 브라우저는 이 형식의 Ed25519 키를 읽을 수 없어요. 최신 브라우저를 쓰거나 OpenSSH 형식의 키를 추가해 보세요.
add_key.problem_several = 파일에 키가 여러 개 있어요. 하나씩 추가하세요.

# ------------------------------------------------------------ vault_new: Save your key to your vault (VaultDialogs.tsx)
vault_new.title = 보관함에 내 키 저장
# <code>…</code> is the key's name: id_ed25519. {server} is the server's name.
vault_new.text_server = <code>{key}</code> 키가 보관함에 저장되고, tTerm Web, 휴대폰, 로그인한 어떤 컴퓨터에서든 이 키로 {server} 서버를 열 수 있어요.
vault_new.text = <code>{key}</code> 키가 보관함에 저장돼요. 이 키로 여는 서버를 tTerm Web, 휴대폰, 로그인한 어떤 컴퓨터에서든 열 수 있어요.
# In tTerm for Mac.
vault_new.point_mac_unlock = 보관함은 이 Mac의 잠금 해제 방식, 즉 Touch ID나 Mac 암호로 열려요. 새로 외울 건 없어요.
vault_new.point_mac_locked = 키는 이 Mac을 떠나기 전에 잠겨요. 내 기기만 열 수 있고, tTerm은 열 수 없어요.
vault_new.point_mac_browser = 새 브라우저에서는 여기서 승인하거나 복구 코드를 입력하면 열려요.
# In a browser.
vault_new.point_web_unlock = 보관함은 이 컴퓨터의 잠금 해제 방식, 즉 Touch ID, Windows Hello 또는 휴대폰 화면 잠금으로 열려요. 새로 외울 건 없어요.
vault_new.point_web_no_passkey = 이 브라우저에는 보관함 패스키를 저장할 수 없어요. 여기서는 복구 코드로 매번 한 세션 동안만 열려요.
vault_new.point_web_locked = 키는 이 브라우저를 떠나기 전에 잠겨요. 내 기기만 열 수 있고, tTerm은 열 수 없어요.
vault_new.point_web_browser = 다른 브라우저에서는 복구 코드를 입력하거나 Mac용 tTerm에서 승인하면 열려요.
vault_new.make_touch = Touch ID로 보관함 만들기
vault_new.make_hello = Windows Hello로 보관함 만들기
vault_new.make_passkey = 패스키로 보관함 만들기
vault_new.make = 보관함 만들기

# ------------------------------------------------------------ recovery: the recovery code, shown once (VaultDialogs.tsx)
recovery.title = 복구 코드
recovery.text = 보관함을 여는 기기를 모두 잃어버리면 이 코드가 키를 되찾는 유일한 방법이에요. tTerm은 키를 대신 복구해 줄 수 없어요. 이 코드는 한 번만 보여요.
recovery.title_new = 새 복구 코드
recovery.text_new = 이전 코드로는 더 이상 보관함을 열 수 없어요. 보관함을 여는 기기를 모두 잃어버리면 이 코드가 키를 되찾는 유일한 방법이에요. 이 코드는 한 번만 보여요.
# For screen readers.
recovery.code_label = 복구 코드 {code}
recovery.save_file = 파일로 저장
recovery.copy_failed = 복사하지 못했어요. 코드를 선택해서 직접 복사하세요.
# What the file saved holds.
recovery.file_text = tTerm 보관함 복구 코드: {code}\\n내 기기로 보관함을 열 수 없을 때 이 코드로 열 수 있어요. 기기와 떨어진 안전한 곳에 보관하세요.
recovery.kept_mac = 이 Mac에만 두지 않고 안전한 곳에 보관했어요
recovery.kept_web = 이 컴퓨터에만 두지 않고 안전한 곳에 보관했어요
recovery.make_title = 새 복구 코드를 만들까요?
recovery.make_text = 현재 코드는 더 이상 쓸 수 없게 되고, 새 코드는 한 번만 보여요. 키와 기기는 그대로 유지돼요.
recovery.now_code = 현재 복구 코드
recovery.now_code_hint = 이 브라우저에는 보관함 패스키가 없어서, 현재 코드로 새 코드를 만들어요. 현재 코드를 잃어버렸나요? Mac용 tTerm에서 새 코드를 만드세요.
recovery.make_go = 새 코드 만들기
recovery.make_go_passkey = 패스키로 만들기
recovery.make_touch = Touch ID로 만들기

# ------------------------------------------------------------ vault_open: Open your keys on this browser (VaultDialogs.tsx)
vault_open.title = 이 브라우저에서 키 열기
vault_open.text = 이 브라우저에서 보관함을 여는 건 처음이에요. 보관함을 이미 열 수 있는 기기에서 이 브라우저를 승인하세요.
vault_open.text_code = 복구 코드로 이 브라우저에서 보관함을 여세요.
# {mac} is the Mac's name, {app} is app_link.mac: "MacBook-Pro-Denis · tTerm for Mac".
vault_open.mac_name = {mac} · {app}
vault_open.mac_ask = 여기서 보관함을 열도록 요청하기
vault_open.mac_waiting = 요청했어요. Mac에서 확인하기를 기다리는 중…
vault_open.mac_compare = 같은 코드가 표시될 때만 Mac에서 허용하세요
vault_open.mac_approved = 승인됐어요. 키를 여는 중…
vault_open.mac_denied = Mac에서 거부했어요.
vault_open.mac_expired = 요청이 만료됐어요. 다시 요청하세요.
vault_open.sas_text = Mac에도 코드가 표시돼요. 같은 코드일 때만 Mac에서 허용하세요:
vault_open.or = 또는
vault_open.code = 복구 코드
vault_open.open = 열기
# Once open with the recovery code or the Mac's approval: whether this browser keeps a passkey.
vault_open.opened_title = 이 브라우저에서 키가 열렸어요
vault_open.opened_text = 다음에 이 컴퓨터의 잠금 해제 방식으로 열리도록 여기에 패스키를 저장할까요? 내 컴퓨터가 아니라면 ‘이번만’을 고르세요.
vault_open.keep_touch = Touch ID로 저장
vault_open.keep_hello = Windows Hello로 저장
vault_open.keep_passkey = 패스키로 저장
vault_open.only_now = 이번만
vault_open.kept_session = 이 세션 동안만 열려 있어요.

# ------------------------------------------------------------ app_code: in tTerm for Mac, a vault this Mac has no lock of (VaultDialogs.tsx)
app_code.title = 이 Mac에서 보관함 열기
app_code.text = 이 Mac은 아직 보관함을 직접 열 수 없어요. 여기서 복구 코드로 한 번만 열면, 그다음부터는 이 Mac에서 Touch ID로 열려요.
# When this Mac's lock is there but no longer opens the vault (taken off in a browser, or gone from the keychain).
app_code.text_lost = 이 Mac은 더 이상 보관함을 직접 열 수 없어요. 여기서 복구 코드로 한 번만 열면, 이 Mac에서 다시 Touch ID로 열 수 있게 설정돼요.

# ------------------------------------------------------------ passphrase: a key's passphrase, in tTerm for Mac (VaultDialogs.tsx)
# {key} is the key's name: id_ed25519.
passphrase.title = {key} 키에 암호 문구가 있어요
passphrase.text = 암호 문구를 입력하세요. 이 Mac은 암호 문구로 키를 열 뿐, 다른 곳으로 보내지 않아요. 키는 잠긴 상태로 보관함에 저장돼요.
# For Let tTerm in: {server} is the server's name, or several ("staging and old-vps").
passphrase.text_sign_in = 암호 문구를 입력하세요. 이 Mac이 키로 {server} 서버에 한 번 로그인해 tTerm 전용 줄을 추가해요. 암호 문구는 다른 곳으로 보내지 않고, 키는 이 Mac에 남아요.
passphrase.label = 암호 문구
passphrase.go = 키 열기

# ------------------------------------------------------------ mac_approve: in tTerm for Mac, a new browser asks for the keys (VaultDialogs.tsx)
# {device} is the browser, "Chrome on Windows".
mac_approve.title = {device}에서 내 키를 열려고 해요
mac_approve.a_browser = 어떤 브라우저
# {ago} is "2 minutes ago", {ip} the address it signed in from.
mac_approve.text_code = {ago}, 이메일로 받은 코드로 {ip}에서 내 계정에 로그인했어요. 본인일 때만 허용하세요. 허용하면 그 브라우저가 내 키로 서버를 열게 돼요.
mac_approve.text_code_now = 이메일로 받은 코드로 {ip}에서 내 계정에 로그인했어요. 본인일 때만 허용하세요. 허용하면 그 브라우저가 내 키로 서버를 열게 돼요.
mac_approve.text_other = {ip}에서 내 계정에 로그인했어요. 본인일 때만 허용하세요. 허용하면 그 브라우저가 내 키로 서버를 열게 돼요.
mac_approve.sas_text = 그 브라우저에 코드가 표시돼요. 같은 코드일 때만 허용하세요:
# For screen readers, while the code is on its way.
mac_approve.sas_waiting = 코드를 기다리는 중
mac_approve.not_me = 제가 아니에요
mac_approve.allow = Touch ID로 허용
mac_approve.not_me_note = ‘제가 아니에요’를 누르면 그 로그인이 종료되고, 설정 > 기기에서 그 밖에 확인할 사항을 볼 수 있어요.

# ------------------------------------------------------------ vault_locked: a server with your key, the vault locked here (VaultLocked.tsx)
vault_locked.title = {machine} 서버는 내 키로 열려요
vault_locked.text = 이 브라우저에서 키가 잠겨 있어요. 이 컴퓨터의 잠금 해제 방식으로 키를 열면 tTerm이 {machine} 서버에 로그인하고, 키는 절대 이 브라우저 밖으로 나가지 않아요.
vault_locked.text_app = 이 Mac에서 키가 잠겨 있어요. Touch ID 또는 Mac 암호로 키를 열면 이 Mac이 {machine} 서버에 로그인해요.
vault_locked.text_app_code = 이 Mac은 아직 보관함을 직접 열 수 없어요. 여기서 복구 코드로 한 번만 열면 이 Mac이 {machine} 서버에 로그인해요.
# Small links under the button: "or approve on MacBook-Pro-Denis · use the recovery code".
vault_locked.or = 또는
vault_locked.approve_on = {mac}에서 승인
vault_locked.use_code = 복구 코드 사용
vault_locked.approve_on_button = {mac}에서 승인
vault_locked.use_code_button = 복구 코드 사용
vault_locked.signing = 내 키로 {machine} 서버에 로그인하는 중…
vault_locked.no_ed25519 = 이 브라우저는 Ed25519 키로 서명할 수 없어요. {machine} 서버는 최신 브라우저나 Mac용 tTerm에서 여세요.
# {key} is the key's name, or vault_locked.its_key.
vault_locked.not_here = 여기서 보관함은 열려 있지만, {key} 키는 이 브라우저에서 열리지 않아요. 설정 > SSH 키에서 키 파일로 다시 추가하세요.
vault_locked.its_key = 이 서버의

# ------------------------------------------------------------ vault_problem: what went wrong with the vault (vault/store.ts)
vault_problem.no_vault = 아직 보관함이 없어요.
vault_problem.exists = 이미 보관함이 있어요. 보관함을 연 다음 키를 추가하세요.
vault_problem.locked = 먼저 보관함을 여세요.
vault_problem.no_passkey = 여기서는 보관함 패스키가 응답하지 않았어요. Mac에서 이 브라우저를 승인하거나 복구 코드를 사용하세요.
vault_problem.no_prf = 이 패스키로는 여기서 보관함을 열 수 없어요. Mac에서 이 브라우저를 승인하거나 복구 코드를 사용하세요.
vault_problem.no_prf_here = 이 브라우저에는 보관함 패스키를 저장할 수 없어요. 보관함은 이 세션 동안만 열려 있어요.
vault_problem.lock_broken = 이 브라우저의 잠금으로는 더 이상 보관함을 열 수 없어요. 복구 코드를 사용하거나 Mac에서 이 브라우저를 승인하세요.
vault_problem.code_form = 복구 코드는 문자와 숫자 24자로, 4자씩 6묶음이에요.
vault_problem.code_wrong = 이 복구 코드로는 보관함을 열 수 없어요. 코드를 확인하거나 Mac에서 이 브라우저를 승인하세요.
# In tTerm for Mac: the engine's answers, said by the page (the code window, Touch ID).
vault_problem.code_wrong_app = 이 복구 코드로는 보관함을 열 수 없어요. 코드를 확인하고 다시 시도하세요.
vault_problem.touch_failed = Touch ID 또는 Mac 암호로 확인하지 못했어요. 바뀐 것은 없어요.
vault_problem.need_code = 지금 복구 코드를 입력하세요. 이 브라우저에는 보관함 패스키가 없어요.
vault_problem.no_x25519 = 이 브라우저는 너무 오래돼서 Mac에서 승인할 수 없어요. 복구 코드를 사용하거나 최신 브라우저를 쓰세요.
vault_problem.pairing = 요청이 전달되지 않았어요. 다시 요청하세요.
vault_problem.passkey_exists = 이 브라우저에는 이미 tTerm 패스키가 있어요.
vault_problem.no_passkey_here = 이 브라우저에서는 패스키를 만들 수 없어요.
vault_problem.something = 문제가 생겼어요. 다시 시도하세요.

# ------------------------------------------------------------ ssh_strip: under a successful ssh in tTerm for Mac's terminals (SshStrip.tsx)
# {alias} is the server's name as ssh knows it: droplet.
ssh_strip.region = tTerm에 {alias} 서버 저장
ssh_strip.title = {alias}: 어디서든 열어 보세요
# <code>…</code>: the address, root@203.0.113.7, and the key, ~/.ssh/id_ed25519.
ssh_strip.text = tTerm Web, 휴대폰, 로그인한 어떤 컴퓨터에서든. <code>{address}</code>, 내 키 <code>{key}</code>
ssh_strip.text_no_key = tTerm Web, 휴대폰, 로그인한 어떤 컴퓨터에서든. <code>{address}</code>
ssh_strip.save = 내 키 저장
ssh_strip.let_in = tTerm 접근 허용
ssh_strip.not_now = 나중에
ssh_strip.never = {alias} 서버는 다시 묻지 않기
# <b>…</b> are the two buttons' names, as above.
ssh_strip.explain = <b>내 키 저장:</b> 키가 내 기기만 열 수 있는 보관함에 저장되고, {alias} 서버는 그대로예요. <b>tTerm 접근 허용:</b> tTerm이 {alias} 서버에 전용 줄을 하나 추가하고, 키는 이 Mac에 남아요. 여러 서버를 한 번에 옮기려면 계정 메뉴의 ‘클라우드로 옮기기’를 쓰세요.
ssh_strip.explain_pass = <b>tTerm 접근 허용:</b> tTerm이 {alias} 서버에 전용 줄을 하나 추가하고, 키는 이 Mac에 남아요. 여러 서버를 한 번에 옮기려면 계정 메뉴의 ‘클라우드로 옮기기’를 쓰세요.
ssh_strip.unreachable = tTerm Web은 클라우드에서 {alias} 서버에 접속할 수 없어요. 이 Mac이 켜져 있는 동안 이 Mac을 경유해 열려요.
ssh_strip.through_mac = 이 Mac 경유로 열기
ssh_strip.saved_key = {alias} 서버가 tTerm에 추가됐어요. 어디서든 내 키로 열려요.
ssh_strip.saved_cert = {alias} 서버가 tTerm에 추가됐어요. 서버에 tTerm 전용 줄이 추가되어 어디서든 열려요.
ssh_strip.saved_mac = {alias} 서버가 tTerm에 추가됐어요. 이 Mac이 켜져 있는 동안 이 Mac을 경유해 열려요.

# ------------------------------------------------------------ move: Move to cloud, in tTerm for Mac (MoveToCloud.tsx)
move.title = 클라우드로 옮기기
move.text = 이 Mac이 알고 있는 서버가 내 계정으로 옮겨져요. tTerm Web, 휴대폰, 로그인한 어떤 컴퓨터에서든 열 수 있어요. ‘옮기기’를 누르기 전에는 아무것도 옮겨지지 않아요.
move.servers = 이 Mac의 서버
# <code>…</code> are ssh's files: they stay as they are.
move.servers_from = <code>~/.ssh/config</code>, <code>known_hosts</code>, 여기서 실행한 ssh에서 가져옴
move.looking = ~/.ssh 폴더를 살펴보는 중…
move.no_servers = 이 Mac이 알고 있는 서버가 아직 없어요. ~/.ssh/config와 known_hosts에 아무것도 없고, 이 Mac의 터미널에서 실행한 ssh도 없어요.
# For screen readers: the tick and the choice of each server.
move.tick_server = {name} 옮기기
move.how = {name} 서버를 여는 방법
# The three ways, in the choice of each server and on the cards under the list.
move.method_key = 내 키
move.method_cert = tTerm 접근 권한
move.method_mac = 이 Mac 경유
move.way_key = 키가 보관함에 저장되고, 서버는 그대로예요. 보관함을 연 브라우저라면 어디서든 열려요.
move.way_cert = tTerm이 서버에 전용 줄을 하나 추가하고, 키는 여기에 남아요. 어디서든, Telegram에서도 열려요.
move.way_mac = 아무것도 옮겨지지 않아요. 이 Mac이 켜져 있는 동안 tTerm이 이 Mac에 서버 접속을 요청해요. VPN 뒤에 있는 서버용이에요.
# {address} is root@203.0.113.7, {jump} the bastion it goes through.
move.addr_via = {address}, {jump} 경유
# After "~/.ssh/config · ": {ago} is "3 minutes ago".
move.ran_ago = {ago} ssh {alias} 실행함
move.ran_here = 여기서 ssh {alias} 실행함
move.note_known = 이 Mac이 알고 있는 서버
move.note_git = git 호스트: 열 터미널이 없어요
move.note_there = 이미 tTerm에 있어요
move.note_checking = tTerm Web에서 접속할 수 있는지 확인하는 중…
move.note_jump = 클라우드에서 접속할 수 있는 배스천 호스트 {jump} 뒤에 있어요: 그 호스트를 경유해 열려요
move.note_jump_far = 내 네트워크에서만 접속할 수 있는 배스천 호스트({jump}) 뒤에 있어요: 이 Mac 경유
move.note_far = tTerm Web이 클라우드에서 접속할 수 없어요: 이 Mac 경유
move.note_key_stays = {key} 키는 이 Mac 밖으로 나갈 수 없어요: 이 Mac 경유
move.keys = ~/.ssh의 키
move.keys_note = 체크한 키만 보관함에 저장돼요
# For screen readers.
move.tick_key = 보관함에 {name} 키 저장
# {servers} is a server, or a list of them: droplet, staging and app-01.
move.key_used_one = {servers} 서버가 이 키로 열려요: 보관함에 저장돼요
move.key_used_many = {servers} 서버가 이 키로 열려요: 보관함에 저장돼요
move.key_unused = 위 서버 중 이 키를 쓰는 서버가 없어요
move.key_in_vault = 이미 보관함에 있어요
move.key_security = 보안 키에 들어 있어서 꺼낼 수 없어요. 이 키의 서버는 이 Mac을 경유해요
move.key_agent = SSH 에이전트에만 있어서 복사할 수 없어요. 이 키의 서버는 이 Mac을 경유해요
move.key_type = 보관함에 아직 저장할 수 없는 종류의 키예요. 이 키의 서버는 이 Mac을 경유해요
move.key_passphrase = 암호 문구 있음
move.vault_note = 보관함은 이 Mac의 잠금 해제 방식, 즉 Touch ID나 Mac 암호로 열려요. 내 기기만 열 수 있고, tTerm은 열 수 없어요.
move.go = other: 서버 {n}대 옮기기

# ------------------------------------------------------------ moved: what came of Move to cloud (MoveToCloud.tsx)
moved.title = other: 서버 {n}대 중 {ok}대가 tTerm에 추가됐어요
# {project} is where they are: Personal.
moved.text = {project} 프로젝트에 추가됐어요. tTerm Web, 휴대폰, 로그인한 어떤 컴퓨터에서든 열 수 있어요.
moved.key = 내 키로 열려요
moved.key_jump = {jump} 경유, 내 키로 열려요
moved.cert = tTerm 접근 권한으로 열려요
moved.cert_jump = {jump} 경유, tTerm 접근 권한으로 열려요
moved.mac = 이 Mac 경유, 켜져 있는 동안 열려요
moved.failed = 옮기지 못했어요.
# {why} is what went wrong, as the Mac said it.
moved.failed_text = {why} 이 서버에 대해서는 아무것도 저장하지 않았어요.
moved.open = 터미널 열기
moved.change = 변경
# <b>…</b> is the key's name, or a list of them.
moved.keys_one = <b>{keys}</b> 키가 보관함에 저장됐고, 내 기기의 잠금 해제 방식으로 열리도록 잠겨 있어요. 설정 > SSH 키에서 어디서든 볼 수 있어요.
moved.keys_many = <b>{keys}</b> 키가 보관함에 저장됐고, 내 기기의 잠금 해제 방식으로 열리도록 잠겨 있어요. 설정 > SSH 키에서 어디서든 볼 수 있어요.
moved.no_keys = 옮긴 키가 없어요. 키는 이 Mac에 그대로 있어요.
`;export{e as default};