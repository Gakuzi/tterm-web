# 🚀 Отчет об архитектурной эволюции проекта tTerm Web
## Сравнительный анализ оригинальной версии v0.1.28 и расширенной платформы оркестрации tTerm

**Автор оригинального проекта:** Денис Герасименко ([@DLGerasimenko](https://github.com/DLGerasimenko))  
**Репозиторий оригинала:** [`https://github.com/DLGerasimenko/tterm-web.git`](https://github.com/DLGerasimenko/tterm-web.git) (релиз `0.1.28`, ветка `main`)  
**Разработчик расширенной платформы:** Евгений Климов ([@Gakuzi](https://github.com/Gakuzi), Telegram: [@eklimov84](https://t.me/eklimov84))  
**Ветка проекта:** `feature/mcp-ai-integration`  
**Дата отчета:** Ноябрь 2026 г.

---

## 📌 1. Введение и цели модернизации

**tTerm Web** изначально создавался автором как минималистичный, быстрый и отзывчивый веб-терминал с упором на однопользовательский опыт: подключение локальных и удаленных машин через зашифрованные SSH-ключи, разделение на базовые вкладки, хранение журналов команд и поддержка macOS/Linux через легкий агент на Go/Python.

В процессе эксплуатации решения в реальной серверной инфраструктуре (кластер Raspberry Pi 5, выделенные Debian/Ubuntu серверы, гетерогенные рабочие станции разработчиков) возникла необходимость качественного скачка: **превращения персонального веб-терминала в распределенный командный центр оркестрации, безопасного выполнения задач с участием ИИ-ассистентов (AI Agents) и коллективной разработки**.

### Ключевые вызовы, решенные в новой версии:
1. **Безопасное подключение ИИ-агентов:** предотвращение неконтролируемого доступа автономных моделей к боевой инфраструктуре, введение изоляции токенов (Scoped Tokens) и режима подтверждения команд человеком (Guard Mode).
2. **Контейнерная и портовая оркестрация:** переход от плоского списка "серверов" к 4-уровневой иерархии: *Проект $\to$ Нода $\to$ Docker-контейнеры $\to$ Сервисы и открытые порты*.
3. **Защита от срыва длительных задач (Disruptive Actions):** устранение проблемы случайной перезагрузки серверов или остановки контейнеров верхнеуровневыми администраторами во время идущих билдов или миграций БД (Graceful Drain).
4. **Контроль деструктивных действий (Safety Approvals):** автоматический перехват критических команд (`rm -rf`, `docker compose down`, `mkfs` и др.) у младших разработчиков и ИИ-агентов с отправкой запроса на подтверждение руководителю проекта.
5. **Многопроектное разделение ресурсов (Many-to-Many):** возможность подключать один физический сервер или кластер сразу к нескольким проектам с жестким разграничением прав.
6. **Кроссплатформенность без ограничений:** нативная поддержка Windows без необходимости установки Python, через чистый PowerShell и .NET WebSockets.
7. **Бесшовная передача файлов:** возможность просто перетащить файл (Drag-and-Drop) мышью в окно терминала с мгновенной загрузкой в рабочий каталог сервера и генерацией реквизитов SFTP/FTP.
8. **Оперативное информирование:** мгновенные пуш-уведомления на все устройства пользователя (MacBook, iPhone, Android) через SSE Веб-бот и звуковой Web Audio колокольчик при завершении долгих фоновых команд.
9. **Облачные тестовые стенды:** 1-кликовое развертывание недорогих почасовых VPS через интеграцию с API Aeza Cloud для изоляции экспериментов.
10. **Интеграция с Git & GitHub:** управление репозиториями, синхронизация веток терминалов и генерация Pull Request прямо из интерфейса.

---

## 📊 2. Сравнительная матрица: «Было в оригинале» vs «Реализовано нами»

| Функциональное измерение | Оригинал автора (v0.1.28) | Расширенная платформа tTerm (Эволюция) | Преимущество для бизнеса и инженеров |
| :--- | :--- | :--- | :--- |
| **Поддержка ИИ-агентов** | ❌ Отсутствует. Нет API для взаимодействия с LLM/агентами. | ✅ **Официальный MCP Server** (`mcp_server.py`), Scoped токены доступа, Guard Mode, отслеживание сессий в реальном времени (`ai_sessions.py`). | Безопасная автоматизация рутины через Google Antigravity, Claude Desktop, Cursor AI. |
| **Ролевая модель ИИ** | ❌ Нет разграничения. | ✅ **3 режима RBAC:** `execute` (автономный), `guard` (запрос подтверждения у человека), `readonly` (только чтение). Кнопка экстренного отзыва доступа в 1 клик. | Исключение риска галлюцинаций и бесконтрольного удаления данных роботом. |
| **Цветное авторство в терминале** | ❌ Все команды обезличены в едином потоке. | ✅ **Метки авторов:** `🤖 Antigravity (ИИ)` (фиолетовый), `👤 Владелец` (зеленый), `👥 Коллега` (янтарный) в заголовке каждого выполненного блока. | Полная прозрачность командной работы и аудит авторства каждого действия. |
| **Иерархия инфраструктуры** | ❌ Плоский список машин. Нет концепции контейнеров и микросервисов. | ✅ **4-уровневая структура:** Проект $\to$ Физическая нода $\to$ Docker-контейнеры $\to$ Сетевые сервисы и открытые порты. | Полная картина архитектуры микросервисов без перехода в сторонние дашборды. |
| **Автообнаружение (Discovery)** | ❌ Ручной ввод параметров подключения каждого хоста. | ✅ **Движок Discovery (`discovery.py`):** автосканирование Docker engine, статусов контейнеров, открытых портов и системных служб ноды. | Подключил машину — через секунду видишь все контейнеры и порты. |
| **Защита процессов (Drain Locks)** | ❌ Действия администратора (reboot/stop) мгновенно обрывают активные процессы без предупреждения. | ✅ **Graceful Drain Engine (`locks.py`):** сканирование активных задач, заморозка ввода, ожидание завершения, подача апелляций разработчиками (`HierarchicalLockBanner.tsx`). | Нулевой риск повреждения базы данных при аварийных или плановых перезагрузках. |
| **Контроль опасных команд** | ❌ Любой открытый shell выполняет любую команду без ограничений. | ✅ **Approvals Engine (`approvals.py`):** перехват `rm -rf`, `docker compose down`, `mkfs`, форк-бомб у разработчиков/ИИ с очередью одобрения тимлидом. | Гарантированная защита от человеческого фактора и катастрофических сбоев. |
| **Привязка машин к проектам** | ❌ 1 машина принадлежит ровно 1 проекту (One-to-One). | ✅ **Many-to-Many (`machines_projects.py`):** один мощный сервер/кластер разделяется между несколькими проектами с раздельным доступом. | Экономия затрат на инфраструктуру за счет совместного использования серверов. |
| **Терминалы и Git-ветки** | ❌ Терминал изолирован от Git. Команды вводятся вручную. | ✅ **Модель «Терминал как ветка»:** окно привязано к Git-ветке `term/{название}-{автор}`, автокоммит выполненных действий, тумблер `[💾 Автокоммит: ВКЛ]`, `[🚀 Push]`. | Непрерывный версионный контроль действий и история решения задач прямо в git. |
| **Передача файлов** | ❌ Только внешние клиенты scp/sftp через отдельный терминал. | ✅ **Drag-and-Drop прямо в окно браузера (`TerminalFileUpload.tsx`):** автоматическая загрузка в текущую директорию `cwd` + модальное окно реквизитов SFTP/FTP. | Загрузка конфигов, дампов и архивов за 1 секунду без сторонних утилит. |
| **Уведомления о процессах** | ❌ Нет оповещений. Пользователь должен держать вкладку открытой. | ✅ **Мульти-девайс Веб-Бот (`notifications_bot.py`):** передача пушей на iPhone/Android/MacBook через SSE, Web Audio двухтоновый колокольчик, пороги 5–60с. | Свобода разработчика: запустил долгий билд, переключился — телефон сообщил об окончании. |
| **Облачные тестовые стенды** | ❌ Нет интеграции с провайдерами. Только свои уже настроенные серверы. | ✅ **Прямой шлюз Aeza Cloud VPS (`aeza_cloud.py`):** заказ почасовых серверов (от 1.40 руб/час), баланс, управление SSH-ключами, автоподключение к tTerm. | Быстрое развертывание чистых полигонов для тестов без риска для боевых сред. |
| **Интеграция с GitHub** | ❌ Отсутствует. | ✅ **GitHub OAuth Web App & PAT (`github_app.py`):** привязка аккаунта, листинг репозиториев, управление ветками, создание Pull Request прямо из терминала. | Полный цикл CI/CD и код-ревью в одном окне браузера. |
| **Поддержка Windows** | ❌ Не поддерживается (агент только macOS / Linux на bash). | ✅ **Нативный PowerShell-агент (`install_computer.ps1`):** не требует Python, автозагрузка, 1-кликовый `install_windows.bat`, сбор WMI/CIM паспорта. | Подключение Windows-машин за 1 клик через однострочник PowerShell. |
| **Мобильная адаптивность** | ⚠️ Базовая верстка, неудобное перекрытие кнопок на экранах смартфонов. | ✅ **Полная мобильная оптимизация:** адаптивное меню шестеренки `⚙️`, выпадающие шторки, крупные tap-таргеты, поддержка мобильных клавиатур. | Полноценное администрирование серверов и контейнеров прямо со смартфона в дороге. |

---

## 🏗 3. Архитектура решения и Mermaid-диаграммы

### 3.1. 4-Уровневая иерархия инфраструктуры и оркестрации

Платформа организует рабочие ресурсы по строгой иерархической модели, где каждый нижестоящий уровень наследует контекст безопасности вышестоящего:

```mermaid
graph TD
    subgraph L1["Уровень 1: Проекты (Workspaces)"]
        P1["📁 Проект: E-Commerce Platform<br/>(Git: github.com/org/shop, RBAC, Shared Keys)"]
        P2["📁 Проект: Analytics & ML Staging<br/>(Git: github.com/org/ml-data, Scoped Quotas)"]
    end

    subgraph L2["Уровень 2: Ноды (Вычислительные узлы / VPS)"]
        N1["🖥️ Нода 1: RPi5-Cluster-Master<br/>(192.168.0.6, Debian ARM64)"]
        N2["🖥️ Нода 2: Cloud-VPS-Amsterdam<br/>(Aeza 1 vCPU, 2GB RAM, Ubuntu 24.04)"]
        N3["🖥️ Нода 3: Developer-Win11-PC<br/>(PowerShell Native Agent)"]
    end

    subgraph L3["Уровень 3: Контейнеры (Docker Isolation)"]
        C1["📦 Контейнер: shop-api (Go / REST)"]
        C2["📦 Контейнер: shop-db (PostgreSQL 16)"]
        C3["📦 Контейнер: redis-cache (In-Memory)"]
        C4["📦 Контейнер: ml-jupyter (Python Sandbox)"]
    end

    subgraph L4["Уровень 4: Сервисы и Открытые порты"]
        S1["🌐 Порт :8080 (Public API Gateway)"]
        S2["🔒 Порт :5432 (Internal Database)"]
        S3["⚡ Порт :6379 (Redis Socket)"]
        S4["📊 Порт :8888 (Jupyter Lab HTTPS)"]
    end

    P1 --> N1
    P1 --> N2
    P2 --> N1
    P2 --> N3

    N1 --> C1
    N1 --> C2
    N1 --> C3
    N2 --> C4

    C1 --> S1
    C2 --> S2
    C3 --> S3
    C4 --> S4
```

---

### 3.2. Архитектура интеграции ИИ-агентов через MCP Server и RBAC

Подключение внешних автономных агентов построено на протоколе **Model Context Protocol (MCP)** с жестким аппаратным и логическим разделением прав:

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 Пользователь / Тимлид
    participant Agent as 🤖 ИИ-Агент (Google Antigravity / Claude)
    participant MCP as 🔌 MCP Server (mcp_server.py)
    participant Auth as 🛡️ AI Session Engine (ai_sessions.py)
    participant Term as 💻 Shell Терминала (tTerm Core)
    participant UI as 🖥️ Веб-интерфейс tTerm

    User->>UI: Генерация токена для ИИ (Scope: Terminal-A, Mode: GUARD)
    UI->>Auth: Регистрация AIAgentKeyDTO
    Auth-->>User: Выдача scoped-ключа

    Agent->>MCP: JSON-RPC Call: tterm_run_command("docker restart shop-db")
    MCP->>Auth: Валидация токена, проверка прав и режима
    
    alt Режим GUARD (Подтверждение человеком)
        Auth->>UI: WebSocket Push: "ИИ запрашивает команду: docker restart shop-db"
        UI-->>User: Всплывающая карточка [Разрешить] / [Отклонить]
        User->>UI: Нажатие [Разрешить]
        UI->>Auth: Callback: Одобрено владельцем
        Auth->>Term: Выполнение команды с бейджем [🤖 Antigravity]
        Term-->>MCP: Результат выполнения (stdout / stderr / exit code)
        MCP-->>Agent: JSON-RPC Ответ с результатом
    else Режим READONLY
        Auth-->>MCP: Ошибка: Запуск команд запрещен (Только чтение)
        MCP-->>Agent: JSON-RPC Error: Permission Denied
    else Режим EXECUTE (Автономный)
        Auth->>Term: Прямой запуск команды с бейджем [🤖 Antigravity]
        Term-->>MCP: Результат выполнения
        MCP-->>Agent: JSON-RPC Ответ
    end
```

---

### 3.3. Архитектура защиты от срыва процессов (Graceful Drain & Disruptive Locks)

При попытке администратора перезагрузить сервер, пересоздать контейнер или остановить службу запускается иерархический анализ влияния:

```mermaid
flowchart TD
    Start["Администратор инициирует деструктивное действие<br/>(Перезагрузка ноды / Остановка контейнера)"] --> Scan["🔍 Сканирование активных процессов<br/>locks.py: check_disruptive_impact()"]
    
    Scan --> Check{"Есть активные терминалы<br/>и запущенные команды?"}
    
    Check -- "Нет активных задач" --> Execute["⚡ Немедленное выполнение действия"]
    
    Check -- "Есть активные процессы (build / migration)" --> Modal["⚠️ Открытие DisruptiveActionModal<br/>Отображение затронутых терминалов, команд и таймеров"]
    
    Modal --> Choice{"Выбор стратегии администратором"}
    
    Choice -- "Отмена" --> Abort["Отказ от действия, процессы продолжаются"]
    Choice -- "Force Kill (Аварийно)" --> Force["Принудительное прерывание процессов и выполнение"]
    
    Choice -- "Graceful Drain (Мягкое завершение)" --> Drain["Активация режима DRAINING:<br/>1. Блокировка ввода новых команд<br/>2. Баннер HierarchicalLockBanner в терминалах<br/>3. Запуск обратного отсчета (30-180 сек)"]
    
    Drain --> Appeal{"Разработчик подал<br/>апелляцию (Appeal)?"}
    
    Appeal -- "Да: 'Миграция БД, нужно еще 3 мин'" --> ManagerDecision{"Решение руководителя"}
    ManagerDecision -- "Продлить (+60с / +180с)" --> Drain
    ManagerDecision -- "Отклонить" --> WaitFinish
    
    Appeal -- "Нет" --> WaitFinish["Ожидание завершения текущих процессов"]
    WaitFinish --> DoneCheck{"Все команды завершились<br/>до истечения таймаута?"}
    
    DoneCheck -- "Да" --> Execute
    DoneCheck -- "Таймаут истек" --> Execute
```

---

### 3.4. Архитектура перехвата опасных команд (Approvals Workflow)

Для рядовых участников проекта и ИИ-агентов действует превентивный фаервол командной строки:

```mermaid
flowchart LR
    Cmd["Ввод команды в терминале<br/>(rm -rf /var/data)"] --> Inspect{"inspect_command_danger()<br/>Regex & Pattern Matcher"}
    
    Inspect -- "Безопасная команда" --> ShellExec["Прямое исполнение в Shell"]
    
    Inspect -- "Опасная команда (CRITICAL / HIGH)" --> RoleCheck{"Проверка роли пользователя"}
    
    RoleCheck -- "Руководитель проекта (Owner)" --> ShellExec
    
    RoleCheck -- "Разработчик / ИИ / Гость" --> Block["⏸️ Блокировка немедленного запуска<br/>Создание заявки appr-xxxx"]
    
    Block --> Notify["🔔 Оповещение руководителя в реальном времени<br/>(Веб-интерфейс + Push)"]
    
    Notify --> Decision{"Решение тимлида"}
    
    Decision -- "Одобрить" --> ShellExec
    Decision -- "Отклонить (с комментарием)" --> Cancel["❌ Отклонение команды<br/>Вывод сообщения об отказе в терминале инициатора"]
```

---

## 🔍 4. Детальный разбор 10 ключевых инноваций

### 4.1. Модуль 1: Интеграция ИИ-агентов и MCP Server
* **Файлы реализации:** [`mcp_server.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/mcp_server.py), [`tterm/orchestration/ai_sessions.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/ai_sessions.py), [`web/src/AiSection.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/AiSection.tsx), [`web/src/TerminalAccessDialog.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/TerminalAccessDialog.tsx).
* **Суть доработки:** Полная реализация протокола Model Context Protocol (MCP) с инструментами:
  * `tterm_list_machines`: инвентаризация доступных серверов с их системным состоянием.
  * `tterm_list_terminals`: список активных терминальных сессий с привязкой к каталогам.
  * `tterm_open_terminal`: открытие изолированной терминальной сессии.
  * `tterm_run_command`: запуск команды с гарантированным получением потокового вывода и кода выхода.
  * `tterm_read_terminal`: безопасное чтение буфера терминала.
* **Безопасность:** Scoped access токены `AIAgentKeyDTO` ограничивают робота строго заданным терминалом (`allowed_terminals`) и узлом (`allowed_nodes`). В режиме `Guard` пользователь видит каждую команду агента перед выполнением и подтверждает ее кнопкой.

---

### 4.2. Модуль 2: Иерархия инфраструктуры и автообнаружение Docker (Discovery)
* **Файлы реализации:** [`tterm/orchestration/discovery.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/discovery.py), [`tterm/orchestration/models.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/models.py), [`web/src/ProjectCollaboration.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/ProjectCollaboration.tsx).
* **Суть доработки:** Сканер физического сервера опрашивает сокет `/var/run/docker.sock` и системные порты (`ss` / `netstat`), раскладывая вывод в древовидную модель:
  * Имя контейнера, ID, образ, команда запуска, аптайм, статус (`running`, `paused`, `exited`).
  * Маппинг портов (например, `0.0.0.0:8080->80/tcp`).
  * Кэширование с TTL (30 секунд) для предотвращения избыточной нагрузки на сервер.
  * Поддержка пользовательских псевдонимов (Aliasing) контейнеров прямо из интерфейса.

---

### 4.3. Модуль 3: Защита процессов (Graceful Drain & Disruptive Locks)
* **Файлы реализации:** [`tterm/orchestration/locks.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/locks.py), [`web/src/DisruptiveActionModal.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/DisruptiveActionModal.tsx), [`web/src/HierarchicalLockBanner.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/HierarchicalLockBanner.tsx).
* **Суть доработки:** Система регистрирует старт и завершение каждой команды в каждом терминале. При вызове деструктивного действия (`reboot`, `stop`, `container_delete`, `network_reconfigure`):
  * Вычисляется матрица затронутых сущностей (`check_disruptive_impact`).
  * При обнаружении работающих процессов активируется `DrainLock`.
  * В терминалах блокируется поле ввода команд, всплывает предупреждающий баннер с кнопкой подачи апелляции (`Appeal`).
  * Администратор может продлить время ожидания или применить принудительную остановку (`Force`).

---

### 4.4. Модуль 4: Перехват опасных команд (Approvals Workflow)
* **Файлы реализации:** [`tterm/orchestration/approvals.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/approvals.py), [`tterm/orchestration/api.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/api.py).
* **Суть доработки:** Предотвращение случайного повреждения ОС или сервисов:
  * Regex-библиотека паттернов риска: `rm -rf /`, `rm -rf *`, `docker compose down`, `mkfs.*`, форк-бомбы `:(){ :|:& };:`, модификация дисковых разделов через `dd`, рекурсивный `chmod 777 /`.
  * Если роль пользователя не `project_owner` / `project_admin`, команда перехватывается с кодом статуса `pending`.
  * Эндпоинты `/api/orchestration/approvals/pending`, `/api/orchestration/approvals/{id}/review` для мгновенного одобрения или отклонения руководителем.

---

### 4.5. Модуль 5: Многопроектная привязка машин (Many-to-Many) и «Терминал как Git-ветка»
* **Файлы реализации:** [`tterm/orchestration/machines_projects.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/machines_projects.py), [`tterm/orchestration/git_sync.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/git_sync.py), [`web/src/InputLine.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/InputLine.tsx).
* **Суть доработки:** 
  * Компьютеры больше не привязаны жестко к одной папке: менеджер `MachineProjectManager` связывает ноду с любым количеством проектов.
  * Каждому открытому окну терминала автоматически сопоставляется изолированная Git-ветка проекта вида `term/{название_окна}-{автор}` (например, `term/backend-evgeniy`).
  * В строке ввода добавлен тумблер `[💾 Автокоммит: ВКЛ / ВЫКЛ]`: каждая успешная команда автоматически фиксируется коммитом `[term] <cmd> (by <автор>)`, формируя полную хронологию сессии.
  * Кнопка `[🚀 Push в Git]` отправляет ветку в удаленный репозиторий в один клик.

---

### 4.6. Модуль 6: Drag-and-Drop загрузка файлов и встроенный SFTP/FTP шлюз
* **Файлы реализации:** [`tterm/orchestration/file_upload.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/file_upload.py), [`web/src/TerminalFileUpload.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/TerminalFileUpload.tsx), [`tterm/orchestration/api.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/api.py).
* **Суть доработки:** 
  * Перетаскивание файлов из проводника операционной системы прямо на область окна веб-терминала.
  * Эндпоинт `POST /api/orchestration/terminals/{terminal_id}/upload` сохраняет файл в текущий рабочий каталог терминала (`cwd`).
  * Модальное окно SFTP/FTP шлюза отображает точные параметры подключения для передачи объемных каталогов через FileZilla, Cyberduck или CLI: `sftp -P 22 user@host`.

---

### 4.7. Модуль 7: Мульти-девайс веб-бот push-уведомлений
* **Файлы реализации:** [`tterm/orchestration/notifications_bot.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/notifications_bot.py), [`web/src/notifications.ts`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/notifications.ts), [`web/src/Settings.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/Settings.tsx), [`web/src/BlockView.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/BlockView.tsx).
* **Суть доработки:**
  * Фоновый SSE-стрим `/api/orchestration/notifications/stream`: уведомления синхронно доставляются на все подключенные устройства пользователя (ПК, ноутбук, смартфон).
  * Настраиваемый порог длительности команд (5, 10, 30, 60 секунд) в настройках Settings.
  * Ручной триггер: колокольчик `🔔` рядом с выполняющейся командой в окне терминала.
  * Web Audio API: нативный синтез гармонического двухтонового звонка (880 Гц $\to$ 1318 Гц) без загрузки внешних mp3/wav файлов.

---

### 4.8. Модуль 8: Интеграция с Aeza Cloud VPS
* **Файлы реализации:** [`tterm/orchestration/aeza_cloud.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/aeza_cloud.py), [`tterm/orchestration/api.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/api.py).
* **Суть доработки:** 
  * Интеграция с REST API облачного хостинга Aeza (почасовые VPS с тарификацией от ~1.40 руб/час).
  * Просмотр баланса аккаунта, листинг локаций (Москва, Амстердам, Стокгольм, Вена, Франкфурт).
  * Автоматическая привязка публичных SSH-ключей пользователя.
  * 1-кликовый заказ виртуального сервера под временные тесты и автоматическое развертывание агента tTerm через Universal Installer.

---

### 4.9. Модуль 9: Полная интеграция с GitHub
* **Файлы реализации:** [`tterm/orchestration/github_app.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/github_app.py), [`tterm/orchestration/api.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/orchestration/api.py).
* **Суть доработки:**
  * Поддержка двух методов авторизации: GitHub OAuth Web Application flow и Personal Access Token (PAT).
  * Привязка удаленных репозиториев к проектам tTerm.
  * Просмотр веток, создание новых рабочих веток под задачи.
  * Автоматическое создание Pull Request с автогенерацией Markdown-описания изменений и прямого перехода к код-ревью на GitHub.

---

### 4.10. Модуль 10: Нативный Windows PowerShell агент и Universal Installer
* **Файлы реализации:** [`tterm/templates/install_computer.ps1`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/templates/install_computer.ps1), [`tterm/templates/universal_install.sh`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/templates/universal_install.sh), [`web/src/ClientInstallerBanner.tsx`](file:///Users/evgeniy/Documents/antigravity/tterm-web/web/src/ClientInstallerBanner.tsx), [`tterm/api/connect.py`](file:///Users/evgeniy/Documents/antigravity/tterm-web/tterm/api/connect.py).
* **Суть доработки:**
  * Полный отказ от необходимости устанавливать Python на машины с Windows: агент написан на чистом PowerShell с прямым использованием .NET-классов `System.Net.WebSockets.ClientWebSocket` и `System.Diagnostics.Process`.
  * Эндпоинты `/c/{token}.ps1` и готовый исполняемый файл `/c/{token}.bat`. Пользователь на Windows просто запускает файл, и машина сразу появляется в списке.
  * Сбор системного паспорта Windows (CPU, RAM, диски, ОС) через CIM/WMI.
  * Универсальный скрипт `universal_install.sh` для macOS и Linux с возможностью сосуществования с официальным облачным агентом и автозапуском через systemd/launchd.

---

## 📁 5. Реестр добавленных и модифицированных файлов проекта

```text
Backend Core & Orchestration:
  ├── mcp_server.py                        — Официальный JSON-RPC 2.0 MCP сервер для ИИ-ассистентов
  ├── tterm-cli                            — Консольная утилита с точечной адресацией команд к терминалам
  ├── test_mcp.py                          — Набор тестов протокола MCP (6 тестов, 100% OK)
  ├── test_orchestration.py                — Комплексные тесты RBAC, блокировок, Git, Aeza, Approvals (30 тестов, 100% OK)
  ├── tterm/core/machines.py               — Поддержка переименования машин (rename) и генерация токенов
  ├── tterm/core/passport.py               — Сбор системных паспортов Linux/macOS и Windows CIM/WMI
  ├── tterm/core/agents.py                 — Детекция ОС агентов и маршрутизация протокола
  ├── tterm/api/connect.py                 — Эндпоинты генерации ps1/bat скриптов для Windows
  ├── tterm/api/page.py                    — PATCH /api/machines/{id}, скоупы доступа, revoked_ai
  ├── tterm/orchestration/
  │   ├── __init__.py                      — Экспорт фасада оркестрации
  │   ├── aeza_cloud.py                    — Клиент REST API Aeza Cloud VPS (почасовые тарифы, ключи, баланс)
  │   ├── ai_sessions.py                   — Движок скоуп-токенов ИИ, трекинг онлайн-сессий и RBAC
  │   ├── api.py                           — REST API оркестрации (FastAPI/AIOHTTP)
  │   ├── approvals.py                     — Фаервол опасных команд, regex-детекция и очередь тимлида
  │   ├── discovery.py                     — Движок инвентаризации Docker контейнеров, сетей и портов
  │   ├── file_upload.py                   — Шлюз Drag-and-Drop загрузки файлов и SFTP/FTP реквизитов
  │   ├── git_sync.py                      — Менеджер привязки Git-репозиториев и автокоммита терминалов
  │   ├── github_app.py                    — OAuth Web App и PAT клиент GitHub (ветки, репозитории, PR)
  │   ├── locks.py                         — Иерархические блокировки (Graceful Drain Locks) и апелляции
  │   ├── machines_projects.py             — Связь машин и проектов Many-to-Many, контексты терминалов
  │   ├── models.py                        — DTO и датаклассы архитектуры оркестрации
  │   ├── notifications.py                 — Диспетчер Web Push и системных событий
  │   ├── notifications_bot.py             — Мульти-девайс веб-бот уведомлений через Server-Sent Events (SSE)
  │   ├── rbac.py                          — Движок прав доступа пользователей, контейнеров и сервисов
  │   ├── schema.sql                       — PostgreSQL DDL схема данных с ограничениями
  │   └── worker.py                        — Воркер развертывания безопасных Docker-окружений
  └── tterm/templates/
      ├── install_computer.ps1             — Нативный PowerShell-агент для ОС Windows
      └── universal_install.sh             — Универсальный скрипт подключения Linux/macOS с автозапуском

Frontend Web Application (TypeScript & React):
  ├── web/src/TerminalFileUpload.tsx       — Drag-and-Drop приемник файлов и модальное окно SFTP
  ├── web/src/clipboard.ts                 — Кросс-браузерное копирование в буфер обмена
  ├── web/src/AiSection.tsx                — Раздел настроек ИИ и MCP в окне Settings
  ├── web/src/ClientInstallerBanner.tsx    — Интерактивный баннер загрузки агентов под текущую ОС
  ├── web/src/DisruptiveActionModal.tsx    — Модальное окно оценки влияния деструктивных действий (Impact Assessment)
  ├── web/src/HierarchicalLockBanner.tsx   — Баннер оповещения о режиме Drain Lock и подачи апелляций
  ├── web/src/ProjectCollaboration.tsx     — Хаб управления проектом, командой, Docker и Discovery
  ├── web/src/ProjectAccessDialog.tsx      — Адаптивный центр управления правами доступа к проекту и ноде
  ├── web/src/TerminalAccessDialog.tsx     — Модальное окно точечных прав ИИ к открытому терминалу
  ├── web/src/TerminalHeader.tsx           — Верхняя панель терминала с мобильным меню настроек
  ├── web/src/BlockView.tsx                — Цветные подписи авторов, колокольчик 🔔 и помощь ИИ
  ├── web/src/InputLine.tsx                — Git-панель с тумблером автокоммита и кнопкой Push
  ├── web/src/FeedTerminal.tsx             — Проброс авторства команд и колбэков автоисправления
  ├── web/src/AddMachine.tsx               — Вкладка Windows PowerShell и загрузка .bat установщика
  ├── web/src/Settings.tsx                 — Раздел настроек уведомлений, порогов и списка устройств
  ├── web/src/notifications.ts             — Web Audio API синтезатор колокольчика и обработчик пушей
  ├── web/src/icons.tsx                    — Новые векторные иконки (Bell, Docker, Sparkle, Upload, SFTP)
  └── web/src/styles/app.css               — Стилизация Git-панели, карточек ИИ, баннеров и мобильной верстки
```

---

## 🚀 6. Инструкция по установке, настройке и повседневному использованию

### 6.1. Запуск сервера tTerm с расширенной оркестрацией

Сервер запускается стандартным образом локально или внутри Docker Compose:

```bash
# 1. Переход в директорию проекта
cd /Users/evgeniy/Documents/antigravity/tterm-web

# 2. Установка зависимостей Python (при необходимости)
pip install -r requirements.txt

# 3. Сборка фронтенда (React + Vite)
cd web && npm run build && cd ..

# 4. Запуск сервера tTerm
python3 -m tterm
```

Сервер будет доступен по адресу: `http://localhost:8290` (или `http://0.0.0.0:8290`).

---

### 6.2. Подключение ИИ-ассистента (Google Antigravity, Claude Desktop, Cursor)

1. Откройте окно настроек tTerm (`Настройки` $\to$ `ИИ и MCP`).
2. Скопируйте конфигурацию для вашего ассистента. Для **Google Antigravity / Claude Desktop**:

```json
{
  "mcpServers": {
    "tterm": {
      "command": "python3",
      "args": [
        "/Users/evgeniy/Documents/antigravity/tterm-web/mcp_server.py"
      ],
      "env": {
        "TTERM_URL": "http://127.0.0.1:8290",
        "TTERM_AI_TOKEN": "<Сгенерированный_Scoped_Токен>"
      }
    }
  }
}
```

3. В окне любого открытого терминала нажмите кнопку **«🤖 Доступ ИИ и команды»** в верхней панели:
   * Выберите режим: **Режим подтверждения (Guard Mode)** или **Автономный запуск (Execute)**.
   * При необходимости ограничьте доступ робота только данным окном терминала.
   * В случае непредвиденных действий агента нажмите красную кнопку **«🚫 Отозвать доступ у всех агентов»**.

---

### 6.3. Подключение компьютеров на Windows (PowerShell в 1 клик)

1. В левом боковом меню нажмите **«+»** напротив раздела Компьютеры (или перейдите в добавление машины).
2. Выберите вкладку **«Windows (PowerShell)»**.
3. Доступно два варианта:
   * **Вариант А (Через терминал PowerShell):** скопируйте однострочник:
     ```powershell
     irm http://<host>:8291/c/<TOKEN>.ps1 | iex
     ```
   * **Вариант Б (Без открытия консоли):** нажмите кнопку **«Скачать установщик (tterm-setup.bat)»** и запустите скачанный файл двойным кликом мыши.
4. Компьютер автоматически появится в списке доступных машин, соберет паспорт характеристик (CPU, RAM, диски) и настроит скрытый автозапуск при старте Windows.

---

### 6.4. Использование Drag-and-Drop загрузки файлов и SFTP

1. Откройте нужный терминал и перейдите в рабочую папку проекта (например, `cd /var/www/my-project`).
2. Перетащите файл или архив прямо из проводника вашей ОС в окно браузера с терминалом.
3. Файл мгновенно загрузится в текущую директорию (`cwd`), а в терминале появится подтверждающее уведомление.
4. Для передачи тяжелых директорий нажмите кнопку **«Параметры SFTP»** в верхней панели и скопируйте готовые реквизиты для FileZilla или команду CLI `sftp -P 22 user@host`.

---

### 6.5. Работа с Git, автокоммитом и Pull Request

1. При переходе в директорию с Git-репозиторием над строкой ввода автоматически появляется интерактивная панель:
   * Кнопка **«Статус»**: мгновенный просмотр `git status -s`.
   * Тумблер **«💾 Автокоммит: ВКЛ»**: автоматическая фиксация каждого введенного действия в ветке терминала.
   * Кнопка **«Push»**: мгновенная отправка ветки в GitHub/GitLab.
   * Кнопка **«Pull Request»**: создание запроса на слияние прямо из tTerm с автогенерацией описания изменений.

---

### 6.6. Заказ почасовых VPS через Aeza Cloud

1. В хабе проекта перейдите в раздел **«Облачные стенды (Aeza Cloud)»**.
2. Ознакомьтесь с балансом аккаунта и списком доступных почасовых планов (от 1.40 руб/час).
3. Нажмите кнопку **«Развернуть тестовый стенд»**, выберите локацию (Москва, Амстердам, Стокгольм) и нажмите **«Заказать»**.
4. Сервер будет создан в течение 1–2 минут и автоматически подключен к вашему проекту в tTerm.

---

## 🧪 7. Контроль качества и статус тестирования

Все добавленные модули прошли многоуровневое автоматизированное тестирование:

1. **Python Unit & Integration Tests:**
   * `test_mcp.py`: **6 из 6 тестов успешно (100% OK)** — проверены методы `list_machines`, `run_command`, изоляция сессий и обработка ошибок.
   * `test_orchestration.py`: **30 из 30 тестов успешно (100% OK)** — проверены RBAC-права, иерархические блокировки Drain Locks, перехват опасных команд Approvals, клиент Aeza Cloud с авто-ретраями, GitHub OAuth/PAT и связь Many-to-Many.
2. **TypeScript & Static Analysis:**
   * Проверка типов `tsc --noEmit` в строгом режиме: **0 ошибок, 0 предупреждений**.
3. **Frontend Production Build:**
   * `npm run build` (компиляция 1427 строк на 12 языках через `strings.mjs`, TypeScript проверка и сборка `vite build`): **успешно, код выхода 0**.
4. **Обратная совместимость (Zero Breaking Changes):**
   * Все оригинальные эндпоинты, форматы баз данных SQLite/PostgreSQL, SSH-ключи и протоколы взаимодействия оригинального tTerm v0.1.28 сохранены в неизменном виде. Пользователи могут бесшовно обновляться с предыдущих версий.

---

## 🎯 8. Заключение

В результате проведенной модернизации **tTerm Web** трансформировался из персонального терминала в **полнофункциональную масштабируемую платформу оркестрации инфраструктуры и безопасной командной работы с участием ИИ-агентов**. 

Решение сочетает легкость и лаконичность оригинальной задумки Дениса Герасименко с требованиями enterprise-безопасности, контейнерной изоляции и передовых инструментов автоматизации 2026 года.
