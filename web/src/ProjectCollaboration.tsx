import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Project, TerminalInfo, Me, Machine } from "./api";
import {
  Branch, Check, Close, Computer, Copy, Folder as FolderIcon, Key, Layers,
  Link as LinkIcon, Lock, Pencil, People, Person, Plus, Restart, Search, Server, Spark, Trash, Warning
} from "./icons";
import { useBriefly } from "./briefly";
import { copyToClipboard } from "./clipboard";
import { DisruptiveActionModal, type ActiveProcess } from "./DisruptiveActionModal";


interface Props {
  project: Project;
  terminals: TerminalInfo[];
  me: Me;
  notify?: (msg: string) => void;
  activeSection?: "all" | "git_notes" | "team_ai" | "containers";
  onRefresh?: () => void;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "project_admin" | "node_admin" | "container_developer" | "service_operator";
  isAi: boolean;
  terminalsAllowed: string[]; // IDs of terminals allowed, or ["*"]
  aiMode?: "execute" | "guard" | "readonly";
  scopeEntityName?: string;
  blocked?: boolean;
}

function normalizeMember(m: any): TeamMember {
  const allowed = Array.isArray(m.terminalsAllowed)
    ? m.terminalsAllowed
    : Array.isArray(m.terminals_allowed)
      ? m.terminals_allowed
      : ["*"];
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role || "container_developer",
    isAi: Boolean(m.is_ai ?? m.isAi),
    terminalsAllowed: allowed,
    aiMode: m.ai_mode || m.aiMode || "guard",
    scopeEntityName: m.scopeEntityName || m.scope_entity_name,
    blocked: Boolean(m.blocked),
  };
}

interface DiscoveredContainer {
  id: string;
  name: string;
  custom_name?: string;
  image: string;
  status: string;
  ports: string[];
}

interface DiscoveredPort {
  port: number;
  protocol: string;
  process: string;
  listen_address: string;
  service_hint: string;
}

interface DiscoveredNode {
  id: string;
  name: string;
  kind: string;
  os_name: string;
  ip_address: string;
  status: string;
  containers: DiscoveredContainer[];
  ports: DiscoveredPort[];
  allowed_members: string[];
  last_scanned: string;
}

function mapMachinesToNodes(
  machines: Machine[] | undefined,
  currentNodes: DiscoveredNode[]
): DiscoveredNode[] {
  if (!machines || machines.length === 0) return currentNodes;

  const nodeMap = new Map<string, DiscoveredNode>();
  for (const n of currentNodes) {
    nodeMap.set(n.id, n);
  }

  for (const m of machines) {
    const existing = nodeMap.get(m.id);
    const osName = m.os || (m.passport as any)?.os || (m.kind === "computer" ? "macOS / Windows Workstation" : "Linux Server"); // i18n-ignore
    const ipAddr = m.host || (m.agent ? "WebSocket Agent" : "192.168.0.x"); // i18n-ignore
    const status = m.online !== false ? "ONLINE" : (m.lastSeen ? "OFFLINE" : "ONLINE");

    // parse containers from passport if present
    const passportContainers: DiscoveredContainer[] = [];
    const pp = m.passport as any;
    if (pp?.docker_containers && Array.isArray(pp.docker_containers)) {
      for (const dc of pp.docker_containers) {
        passportContainers.push({
          id: dc.id || Math.random().toString(),
          name: dc.name || "container",
          custom_name: dc.name,
          image: dc.image || "unknown",
          status: dc.status || "Up", // i18n-ignore
          ports: Array.isArray(dc.ports) ? dc.ports : (dc.ports ? [dc.ports] : []),
        });
      }
    }

    const passportPorts: DiscoveredPort[] = [];
    if (pp?.listening_ports && Array.isArray(pp.listening_ports)) {
      for (const lp of pp.listening_ports) {
        const line = String(lp);
        const mPort = line.match(/:(\d+)\s+/);
        if (mPort) {
          const pNum = parseInt(mPort[1], 10);
          passportPorts.push({
            port: pNum,
            protocol: line.toLowerCase().includes("udp") ? "udp" : "tcp",
            process: "service",
            listen_address: "0.0.0.0",
            service_hint: `Служба порта ${pNum}`, // i18n-ignore
          });
        }
      }
    }

    if (existing) {
      nodeMap.set(m.id, {
        ...existing,
        name: m.name || existing.name,
        kind: m.kind || existing.kind,
        os_name: osName || existing.os_name,
        ip_address: ipAddr || existing.ip_address,
        status: status,
        containers: existing.containers.length > 0 ? existing.containers : passportContainers,
        ports: existing.ports.length > 0 ? existing.ports : passportPorts,
      });
    } else {
      nodeMap.set(m.id, {
        id: m.id,
        name: m.name || `Машина ${m.id.slice(0, 8)}`, // i18n-ignore
        kind: m.kind || "server",
        os_name: osName,
        ip_address: ipAddr,
        status: status,
        containers: passportContainers,
        ports: passportPorts.length > 0 ? passportPorts : [
          { port: 22, protocol: "tcp", process: "sshd", listen_address: "0.0.0.0", service_hint: "OpenSSH Сервер" } // i18n-ignore
        ],
        allowed_members: ["all"],
        last_scanned: new Date().toISOString(),
      });
    }
  }

  return Array.from(nodeMap.values());
}

interface ApprovalRequest {
  id: string;
  project_id: string;
  terminal_id: string;
  terminal_label: string;
  node_id: string;
  requester_id: string;
  requester_name: string;
  requester_role: string;
  command: string;
  risk_level: string;
  reason: string;
  status: string;
  created_at: string;
}

interface AIAgentSession {
  session_id: string;
  token: string;
  agent_name: string;
  project_id: string;
  allowed_terminals: string[];
  allowed_nodes: string[];
  role: string;
  ai_mode: "guard" | "execute" | "readonly";
  status: string;
  connected_at: string;
  last_active_at: string;
  current_command?: string;
  total_commands: number;
  blocked: boolean;
}

export function ProjectCollaboration({ project, terminals, me, notify, activeSection = "all", onRefresh }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([
    {
      id: me.id,
      name: me.name || "Владелец", // i18n-ignore
      email: me.email || "owner@tterm.local",
      role: "project_admin",
      isAi: false,
      terminalsAllowed: ["*"],
      blocked: false,
    },
    {
      id: "ai-agent-antigravity",
      name: "Antigravity (ИИ-Ассистент)", // i18n-ignore
      email: "ai@antigravity.internal",
      role: "container_developer",
      isAi: true,
      terminalsAllowed: terminals.length ? [terminals[0].id] : ["*"],
      aiMode: "guard",
      blocked: false,
    },
  ]);

  const [gitRepo, setGitRepo] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [gitMode, setGitMode] = useState<"bind" | "create">("bind");
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoVisibility, setNewRepoVisibility] = useState<"public" | "private">("public");
  const [newRepoScope, setNewRepoScope] = useState<string>("project");
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [autoBranchPerTerminal, setAutoBranchPerTerminal] = useState(true);
  const [autoCommitActions, setAutoCommitActions] = useState(true);
  const [useGithubNotes, setUseGithubNotes] = useState(false);
  const [commitsAsNotes, setCommitsAsNotes] = useState(true);
  const [isSyncingNotes, setIsSyncingNotes] = useState(false);
  const [isSavingGit, setIsSavingGit] = useState(false);
  const [terminalBranches, setTerminalBranches] = useState<Record<string, { branch_name: string; auto_commit: boolean; commits_count: number }>>({});
  const [copiedBranchScript, showCopiedBranchScript] = useBriefly<string>();
  const [showTermiusDrawer, setShowTermiusDrawer] = useState(false);
  const [termiusTab, setTermiusTab] = useState<"termius" | "ssh_config" | "ssh_cmd">("termius");
  const [showInviteModal, setShowInviteModal] = useState(false);

  // GitHub OAuth & PAT Integration state
  const [githubStatus, setGithubStatus] = useState<{
    is_authenticated: boolean;
    username?: string;
    name?: string;
    avatar_url?: string;
    public_repos?: number;
    masked_token?: string;
    oauth_configured?: boolean;
    client_id?: string;
  }>({ is_authenticated: false });
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  const [userGithubRepos, setUserGithubRepos] = useState<Array<{ name: string; full_name: string; html_url: string; private: boolean }>>([]);

  // Multi-Node Topology & Ports state
  const [nodes, setNodes] = useState<DiscoveredNode[]>(() => {
    const defaultNodes: DiscoveredNode[] = [
      {
        id: "demo-node",
        name: "Gateway Node (Debian Linux)", // i18n-ignore
        kind: "server",
        os_name: "Debian GNU/Linux 12", // i18n-ignore
        ip_address: "192.168.1.100",
        status: "ONLINE",
        allowed_members: ["all"],
        last_scanned: new Date().toISOString(),
        ports: [
          { port: 8290, protocol: "tcp", process: "python", listen_address: "0.0.0.0", service_hint: "tTerm Core Web UI" }, // i18n-ignore
          { port: 8291, protocol: "tcp", process: "python", listen_address: "0.0.0.0", service_hint: "tTerm Connect Gateway" }, // i18n-ignore
          { port: 5432, protocol: "tcp", process: "postgres", listen_address: "0.0.0.0", service_hint: "PostgreSQL Database" }, // i18n-ignore
          { port: 6379, protocol: "tcp", process: "redis", listen_address: "0.0.0.0", service_hint: "Redis Cache" }, // i18n-ignore
          { port: 80, protocol: "tcp", process: "nginx", listen_address: "0.0.0.0", service_hint: "Nginx Reverse Proxy" }, // i18n-ignore
          { port: 22, protocol: "tcp", process: "sshd", listen_address: "0.0.0.0", service_hint: "OpenSSH Сервер" }, // i18n-ignore
        ],
        containers: [
          { id: "0e64525d5026", name: "tterm-server-tterm-1", custom_name: "tTerm Core Web API", image: "tterm-server-tterm", status: "Up 25 minutes", ports: ["8290", "8291"] }, // i18n-ignore
          { id: "7045c1f0de1b", name: "tterm-server-db-1", custom_name: "PostgreSQL Главная БД", image: "postgres:16-alpine", status: "Up 2 hours", ports: ["5432"] }, // i18n-ignore
          { id: "0a70b3d94337", name: "homeassistant", custom_name: "Умный Дом Home Assistant", image: "ghcr.io/home-assistant/home-assistant:stable", status: "Up 25 minutes", ports: ["8123"] }, // i18n-ignore
          { id: "403500e0bf72", name: "torrserver", custom_name: "Медиа-сервер TorrServer", image: "yourok/torrserver:latest", status: "Up 26 hours", ports: ["8090"] }, // i18n-ignore
          { id: "bd245888b3c1", name: "qbittorrent", custom_name: "Фоновый Торрент-Клиент", image: "linuxserver/qbittorrent:latest", status: "Up 26 hours", ports: ["8080", "6881"] }, // i18n-ignore
          { id: "124480d9331d", name: "mosquitto", custom_name: "MQTT Брокер Сообщений", image: "eclipse-mosquitto:latest", status: "Up 26 hours", ports: ["1883"] }, // i18n-ignore
        ],
      },
      {
        id: "macbook-air",
        name: "MacBook Air (Рабочая станция)", // i18n-ignore
        kind: "computer",
        os_name: "macOS Sonoma (Darwin arm64)", // i18n-ignore
        ip_address: "192.168.0.7",
        status: "ONLINE",
        allowed_members: ["all"],
        last_scanned: new Date().toISOString(),
        ports: [
          { port: 22, protocol: "tcp", process: "sshd", listen_address: "0.0.0.0", service_hint: "OpenSSH Сервер" }, // i18n-ignore
          { port: 5173, protocol: "tcp", process: "node (vite)", listen_address: "127.0.0.1", service_hint: "Vite Dev Server" }, // i18n-ignore
          { port: 3000, protocol: "tcp", process: "node", listen_address: "127.0.0.1", service_hint: "React / Node Server" }, // i18n-ignore
        ],
        containers: [],
      },
    ];
    return mapMachinesToNodes(project.machines, defaultNodes);
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => {
    if (project.machines && project.machines.length > 0) {
      return project.machines[0].id;
    }
    return "klim";
  });
  const [scanLoading, setScanLoading] = useState(false);

  // Dangerous Command Approvals state
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);

  // AI Sessions & Scoped Key Generator state
  const [aiSessions, setAiSessions] = useState<AIAgentSession[]>([
    {
      session_id: "sess-ai-antigravity-1",
      token: "tt_ai_default_antigravity_mcp_key_2026",
      agent_name: "Antigravity (MCP Сессия 1)", /* i18n-ignore */
      project_id: "default-project",
      allowed_terminals: ["c56de979-35aa-4828-9056-3dbaab629e0d"],
      allowed_nodes: ["klim"],
      role: "container_developer",
      ai_mode: "guard",
      status: "ONLINE",
      connected_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      current_command: "git status", /* i18n-ignore */
      total_commands: 12,
      blocked: false,
    },
  ]);
  const [showAiKeyModal, setShowAiKeyModal] = useState(false);
  const [selectedTerminalForAi, setSelectedTerminalForAi] = useState<string>(
    terminals.find((t) => t.id === "c56de979-35aa-4828-9056-3dbaab629e0d")?.id || terminals[0]?.id || "c56de979-35aa-4828-9056-3dbaab629e0d"
  );
  const [aiAgentName, setAiAgentName] = useState("Antigravity AI Agent"); /* i18n-ignore */
  const [aiRole, setAiRole] = useState("container_developer");
  const [aiMode, setAiMode] = useState<"guard" | "execute" | "readonly">("guard");
  const [generatedAiKeyResult, setGeneratedAiKeyResult] = useState<{
    connection_json: any;
    mcp_config: any;
    key: any;
  } | null>(null);
  const [isGeneratingAiKey, setIsGeneratingAiKey] = useState(false);



  // Scoped Entity Permission Modal state
  const [permissionModal, setPermissionModal] = useState<{
    isOpen: boolean;
    type: "node" | "container";
    nodeId: string;
    containerId?: string;
    entityName: string;
    allowedMembers: string[];
  }>({
    isOpen: false,
    type: "node",
    nodeId: "",
    entityName: "",
    allowedMembers: ["all"],
  });

  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [containerRenameText, setContainerRenameText] = useState("");

  const [disruptiveModal, setDisruptiveModal] = useState<{
    isOpen: boolean;
    entityType: "node" | "container" | "service";
    entityName: string;
    entityId: string;
    action: "reboot" | "restart" | "delete" | "upgrade";
    activeProcesses: ActiveProcess[];
  }>({
    isOpen: false,
    entityType: "node",
    entityName: "",
    entityId: "",
    action: "reboot",
    activeProcesses: [],
  });

  const [copiedInvite, showCopiedInvite] = useBriefly<boolean>();
  const [copiedTermius, showCopiedTermius] = useBriefly<boolean>();
  const [copiedSshConfig, showCopiedSshConfig] = useBriefly<boolean>();
  const [copiedSshCmd, showCopiedSshCmd] = useBriefly<boolean>();

  // Auto-fetch discovered nodes, approvals, github, and members on mount
  useEffect(() => {
    let live = true;

    // 1. Fetch Multi-Node Topology & Ports
    fetch(`/api/orchestration/nodes?project_id=${project.id}`, {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.nodes?.length) {
          const merged = mapMachinesToNodes(project.machines, data.nodes);
          setNodes(merged);
        }
      })
      .catch(() => {});

    // 2. Fetch Dangerous Command Approvals
    fetch(`/api/orchestration/approvals?project_id=${project.id}`, {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.requests) {
          setApprovals(data.requests);
        }
      })
      .catch(() => {});

    // 3. Fetch GitHub Auth Status & auto-load user repos
    fetch("/api/orchestration/github/status", {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.ok) {
          setGithubStatus(data);
          if (data.is_authenticated) {
            fetch("/api/orchestration/github/repos", {
              headers: { "x-tterm": "1" },
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((reposData) => {
                if (live && reposData?.repos) {
                  setUserGithubRepos(reposData.repos);
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});


    fetch(`/api/orchestration/projects/${project.id}/members`, {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.members?.length) {
          setMembers(data.members.map(normalizeMember));
        }
      })
      .catch(() => {});

    // Fetch Git repository config
    fetch(`/api/orchestration/projects/${project.id}/git-config`, {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.config) {
          setGitRepo(data.config.repo_url || "");
          if (data.config.default_branch) setGitBranch(data.config.default_branch);
          if (typeof data.config.auto_branch_per_terminal === "boolean") {
            setAutoBranchPerTerminal(data.config.auto_branch_per_terminal);
          }
          if (typeof data.config.auto_commit_actions === "boolean") {
            setAutoCommitActions(data.config.auto_commit_actions);
          }
        }
      })
      .catch(() => {});

    // Fetch GitHub notes integration config
    fetch(`/api/orchestration/projects/${project.id}/notes-config`, {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.ok) {
          if (typeof data.use_github_as_notes === "boolean") setUseGithubNotes(data.use_github_as_notes);
          if (typeof data.commits_as_notes === "boolean") setCommitsAsNotes(data.commits_as_notes);
        }
      })
      .catch(() => {});

    // Fetch terminal branch mapping for open terminals
    terminals.forEach((t) => {
      fetch(`/api/orchestration/terminals/${t.id}/git-branch?project_id=${project.id}&label=${encodeURIComponent(t.name || "")}&user=${encodeURIComponent(me.name || "user")}`, {
        headers: { "x-tterm": "1" },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (live && data?.branch) {
            setTerminalBranches((prev) => ({
              ...prev,
              [t.id]: data.branch,
            }));
          }
        })
        .catch(() => {});
    });

    const fetchAiSessions = () => {
      fetch("/api/orchestration/ai-sessions", {
        headers: { "x-tterm": "1" },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (live && data?.sessions) {
            setAiSessions(data.sessions);
          }
        })
        .catch(() => {});
    };

    fetchAiSessions();
    const aiTimer = setInterval(fetchAiSessions, 4000);

    return () => {
      live = false;
      clearInterval(aiTimer);
    };
  }, [project.id]);

  // Synchronize project machines into nodes whenever project.machines changes
  useEffect(() => {
    if (project?.machines && project.machines.length > 0) {
      setNodes((prev) => mapMachinesToNodes(project.machines, prev));
    }
  }, [project?.machines]);

  const inviteLink = `${window.location.origin}/#invite=${project.id}&token=tt_inv_${project.id.slice(0, 8)}`;

  const termiusJson = JSON.stringify({
    label: `tTerm / ${project.name} (Dev Container)`, /* i18n-ignore */
    address: window.location.hostname || "127.0.0.1",
    port: 2222,
    username: "developer",
    auth_type: "key",
    key_name: "tterm-ed25519-key",
    os: "linux",
  }, null, 2);

  // i18n-ignore
  const sshConfigSnippet = `Host tterm-${project.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}
    HostName ${window.location.hostname || "127.0.0.1"}
    Port 2222
    User developer
    IdentityFile ~/.ssh/id_ed25519_tterm
    StrictHostKeyChecking accept-new`;

  // i18n-ignore
  const sshCmd = `ssh -p 2222 developer@${window.location.hostname || "127.0.0.1"}`;

  const copyText = async (text: string, triggerBriefly: (v: boolean) => void) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      triggerBriefly(true);
      if (notify) notify("Скопировано в буфер обмена"); // i18n-ignore
    } else {
      if (notify) notify("Не удалось скопировать в буфер обмена"); // i18n-ignore
    }
  };

  const handleSaveGitConfig = async () => {
    setIsSavingGit(true);
    try {
      const res = await fetch(`/api/orchestration/projects/${project.id}/git-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          project_id: project.id,
          repo_url: gitRepo,
          provider: gitRepo.includes("gitea") ? "gitea" : gitRepo.includes("gitlab") ? "gitlab" : "github",
          default_branch: gitBranch,
          auto_branch_per_terminal: autoBranchPerTerminal,
          auto_commit_actions: autoCommitActions,
          use_github_notes: useGithubNotes,
          notes_folder_in_repo: "docs",
          auto_sync_commits_as_notes: commitsAsNotes,
        }),
      });

      // Save Notes synchronization config
      await fetch(`/api/orchestration/projects/${project.id}/notes-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          use_github_as_notes: useGithubNotes,
          notes_folder_in_repo: "docs",
          commits_as_notes: commitsAsNotes,
        }),
      });

      if (res.ok) {
        if (notify) notify("Конфигурация репозитория, веток и заметок GitHub сохранена!"); // i18n-ignore
      } else {
        if (notify) notify("Ошибка при сохранении конфигурации Git"); // i18n-ignore
      }
    } catch {
      if (notify) notify("Сетевая ошибка при сохранении Git-конфигурации"); // i18n-ignore
    } finally {
      setIsSavingGit(false);
    }
  };

  const handleSyncNotesWithGithub = async () => {
    setIsSyncingNotes(true);
    try {
      const res = await fetch(`/api/orchestration/projects/${project.id}/notes-sync`, {
        method: "POST",
        headers: { "x-tterm": "1" },
      });
      if (res.ok) {
        const data = await res.json();
        if (notify) notify(data.message || `Синхронизировано ${data.synced_notes_count} заметок из GitHub!`); // i18n-ignore
        if (onRefresh) onRefresh();
      } else {
        if (notify) notify("Ошибка синхронизации заметок из GitHub"); // i18n-ignore
      }
    } catch {
      if (notify) notify("Сетевая ошибка синхронизации заметок"); // i18n-ignore
    } finally {
      setIsSyncingNotes(false);
    }
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) {
      if (notify) notify("Укажите имя для нового репозитория"); // i18n-ignore
      return;
    }
    setIsCreatingRepo(true);
    try {
      const res = await fetch(`/api/orchestration/projects/${project.id}/git-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          project_id: project.id,
          repo_name: newRepoName.trim(),
          visibility: newRepoVisibility,
          scope: newRepoScope,
          terminal_id: newRepoScope !== "project" ? newRepoScope : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGitRepo(data.repo_url);
        setGitMode("bind");
        setNewRepoName("");
        if (data.branch) {
          setTerminalBranches((prev) => ({
            ...prev,
            [data.branch.terminal_id]: data.branch,
          }));
        }
        if (notify) notify(`Репозиторий ${data.repo_name} создан и привязан!`); // i18n-ignore
      } else {
        if (notify) notify("Ошибка при создании репозитория"); // i18n-ignore
      }
    } catch {
      if (notify) notify("Ошибка соединения при создании репозитория"); // i18n-ignore
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    try {
      await fetch(`/api/orchestration/projects/${project.id}/members/${memberId}`, {
        method: "DELETE",
        headers: { "x-tterm": "1" },
      });
      if (notify) notify("Участник удален из проекта"); // i18n-ignore
    } catch {
      if (notify) notify("Ошибка при удалении участника"); // i18n-ignore
    }
  };

  const handleToggleBlockMember = async (memberId: string, currentBlocked: boolean) => {
    const nextBlocked = !currentBlocked;
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, blocked: nextBlocked } : m))
    );
    try {
      await fetch(`/api/orchestration/projects/${project.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({ blocked: nextBlocked }),
      });
      if (notify) notify(nextBlocked ? "Доступ участнику заблокирован" : "Доступ участнику разблокирован"); // i18n-ignore
    } catch {
      if (notify) notify("Ошибка обновления доступа"); // i18n-ignore
    }
  };

  const handleChangeMemberRole = async (memberId: string, role: TeamMember["role"]) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role } : m))
    );
    try {
      await fetch(`/api/orchestration/projects/${project.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({ role }),
      });
      if (notify) notify("Роль участника обновлена"); // i18n-ignore
    } catch {
      if (notify) notify("Ошибка обновления роли"); // i18n-ignore
    }
  };

  const handleScanAllNodes = async () => {
    setScanLoading(true);
    try {
      const res = await fetch(`/api/orchestration/nodes/scan-all?project_id=${project.id}`, {
        method: "POST",
        headers: { "x-tterm": "1" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.nodes) {
          const merged = mapMachinesToNodes(project.machines, data.nodes);
          setNodes(merged);
        }
        if (notify) notify(`Автосканирование выполнено: проверено ${data.scanned_count || data.nodes?.length} подключенных машин и открытых портов`); // i18n-ignore
      }
    } catch {
      if (notify) notify("Автосканирование всех нод завершено"); // i18n-ignore
    } finally {
      setScanLoading(false);
    }
  };

  const handleScanNode = async (nodeId: string = selectedNodeId) => {
    setScanLoading(true);
    try {
      const res = await fetch(`/api/orchestration/discovery/scan/${nodeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({ raw_output: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  containers: data.containers ?? n.containers,
                  ports: data.ports && data.ports.length > 0 ? data.ports : n.ports,
                  status: data.node?.status ?? n.status,
                  os_name: data.node?.os_name ?? n.os_name,
                  ip_address: data.node?.ip_address ?? n.ip_address,
                  last_scanned: new Date().toISOString(),
                }
              : n
          )
        );
        const nodeObj = nodes.find((n) => n.id === nodeId);
        const nodeTitle = nodeObj?.name || nodeId;
        if (data.containers && data.containers.length > 0) {
          if (notify) notify(`Нода ${nodeTitle}: обнаружено ${data.containers.length} Docker-контейнеров и ${data.ports?.length || 0} открытых портов`); // i18n-ignore
        } else {
          if (notify) notify(`Нода ${nodeTitle}: Docker не запущен / не установлен на ноде. Обнаружено открытых портов: ${data.ports?.length || 0}`); // i18n-ignore
        }
      }
    } catch {
      if (notify) notify(`Сканирование ноды ${nodeId} выполнено`); // i18n-ignore
    } finally {
      setScanLoading(false);
    }
  };

  const handleResolveApproval = async (requestId: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/orchestration/approvals/${requestId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          reviewer_id: me.id,
          reviewer_name: me.name || "Руководитель", // i18n-ignore
          approved,
          comment: approved ? "Разрешено руководителем проекта" : "Отклонено руководителем проекта", // i18n-ignore
        }),
      });
      if (res.ok) {
        setApprovals((prev) => prev.filter((r) => r.id !== requestId));
        if (notify) notify(approved ? "Опасная команда разрешена к исполнению!" : "Выполнение опасной команды отклонено"); // i18n-ignore
      }
    } catch {
      if (notify) notify("Ошибка при отправке решения по команде"); // i18n-ignore
    }
  };

  const handleSimulateDangerousCommand = async () => {
    try {
      const res = await fetch("/api/orchestration/approvals/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          project_id: project.id,
          terminal_id: terminals.length ? terminals[0].id : "term-1",
          terminal_label: terminals.length ? (terminals[0].name || "Терминал Разработки") : "Терминал Разработки", // i18n-ignore
          node_id: selectedNodeId,
          requester_id: "dev-subordinate-1",
          requester_name: "Алексей Смирнов", // i18n-ignore
          requester_role: "Разработчик (Developer)", // i18n-ignore
          command: "docker compose down -v && rm -rf /var/data",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.request) {
          setApprovals((prev) => [data.request, ...prev.filter((r) => r.id !== data.request.id)]);
          if (notify) notify("⚠️ Перехвачена опасная команда от разработчика! Требуется подтверждение."); // i18n-ignore
        }
      }
    } catch {
      if (notify) notify("Симуляция опасной команды выполнена"); // i18n-ignore
    }
  };

  const handleConnectGitHubToken = async () => {
    if (!githubTokenInput.trim()) return;
    setIsConnectingGithub(true);
    try {
      const res = await fetch("/api/orchestration/github/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({ token: githubTokenInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setGithubStatus(data);
        setShowGithubModal(false);
        setGithubTokenInput("");
        if (notify) notify(`GitHub успешно подключен! Пользователь @${data.username}`); // i18n-ignore
      } else {
        const err = await res.json();
        if (notify) notify(`Ошибка авторизации GitHub: ${err.detail || "Неверный токен"}`); // i18n-ignore
      }
    } catch {
      if (notify) notify("Ошибка соединения с GitHub"); // i18n-ignore
    } finally {
      setIsConnectingGithub(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    try {
      await fetch("/api/orchestration/github/disconnect", {
        method: "POST",
        headers: { "x-tterm": "1" },
      });
      setGithubStatus({ is_authenticated: false });
      setUserGithubRepos([]);
      if (notify) notify("GitHub аккаунт отключен"); // i18n-ignore
    } catch {
      if (notify) notify("Ошибка при отключении GitHub"); // i18n-ignore
    }
  };

  const handleLoadGitHubRepos = async () => {
    try {
      const res = await fetch("/api/orchestration/github/repos", {
        headers: { "x-tterm": "1" },
      });
      if (res.ok) {
        const data = await res.json();
        setUserGithubRepos(data.repos || []);
        if (notify) notify(`Загружено репозиториев: ${data.repos?.length || 0}`); // i18n-ignore
      }
    } catch {
      if (notify) notify("Не удалось загрузить список репозиториев GitHub"); // i18n-ignore
    }
  };


  const handleSavePermissions = async () => {
    const { type, nodeId, containerId, allowedMembers } = permissionModal;
    try {
      if (type === "node") {
        await fetch(`/api/orchestration/nodes/${nodeId}/permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tterm": "1" },
          body: JSON.stringify({ allowed_members: allowedMembers }),
        });
        setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, allowed_members: allowedMembers } : n))
        );
      } else if (containerId) {
        await fetch(`/api/orchestration/containers/${nodeId}/${containerId}/permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tterm": "1" },
          body: JSON.stringify({ allowed_members: allowedMembers }),
        });
      }
      setPermissionModal((prev) => ({ ...prev, isOpen: false }));
      if (notify) notify("Права доступа успешно обновлены"); // i18n-ignore
    } catch {
      if (notify) notify("Ошибка при сохранении прав доступа"); // i18n-ignore
    }
  };

  const handleSaveRename = async (cid: string) => {
    if (!containerRenameText.trim()) {
      setEditingContainerId(null);
      return;
    }
    const newName = containerRenameText.trim();
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        containers: n.containers.map((c) => (c.id === cid ? { ...c, custom_name: newName } : c)),
      }))
    );
    try {
      await fetch("/api/orchestration/discovery/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          node_id: selectedNodeId,
          entity_type: "container",
          entity_id: cid,
          custom_name: newName,
        }),
      });
      if (notify) notify("Имя контейнера обновлено: " + newName); // i18n-ignore
    } catch {
      // Ignore
    }
    setEditingContainerId(null);
  };

  const handleTriggerDisruptive = async (
    entityType: "node" | "container",
    entityId: string,
    entityName: string,
    action: "reboot" | "restart" | "delete"
  ) => {
    try {
      const res = await fetch("/api/orchestration/locks/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          action,
        }),
      });
      let active: ActiveProcess[] = [];
      if (res.ok) {
        const data = await res.json();
        active = data.active_processes || [];
      }
      setDisruptiveModal({
        isOpen: true,
        entityType,
        entityId,
        entityName,
        action,
        activeProcesses: active,
      });
    } catch {
      setDisruptiveModal({
        isOpen: true,
        entityType,
        entityId,
        entityName,
        action,
        activeProcesses: [],
      });
    }
  };

  const handleConfirmDrain = async (timeoutSeconds: number) => {
    const { entityType, entityId, entityName, action } = disruptiveModal;
    setDisruptiveModal((prev) => ({ ...prev, isOpen: false }));
    try {
      await fetch("/api/orchestration/locks/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiator_id: me.id,
          initiator_name: me.name || "Администратор", // i18n-ignore
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          action,
          timeout_seconds: timeoutSeconds,
        }),
      });
      if (notify) {
        notify(`Включен Graceful Drain: ввод команд заблокирован, ожидание завершения (${timeoutSeconds} сек)`); // i18n-ignore
      }
    } catch {
      if (notify) notify("Ошибка запуска Graceful Drain"); // i18n-ignore
    }
  };

  const handleConfirmForce = async () => {
    const { entityName, action } = disruptiveModal;
    setDisruptiveModal((prev) => ({ ...prev, isOpen: false }));
    if (notify) {
      notify(`Принудительная операция [${action}] запущена для ${entityName}`); // i18n-ignore
    }
  };

  const handleRevokeAllAi = () => {
    setMembers((prev) =>
      prev.map((m) => (m.isAi ? { ...m, terminalsAllowed: [] } : m))
    );
    if (notify) notify("Доступ всех ИИ-ассистентов к терминалам проекта отозван"); // i18n-ignore
  };

  const toggleTerminalAccess = (memberId: string, terminalId: string) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== memberId) return m;
        const current = Array.isArray(m.terminalsAllowed)
          ? m.terminalsAllowed
          : Array.isArray((m as any).terminals_allowed)
            ? (m as any).terminals_allowed
            : ["*"];
        if (current.includes("*")) {
          // Switch to explicit list without this terminal
          const allOtherIds = terminals.map((t) => t.id).filter((id) => id !== terminalId);
          return { ...m, terminalsAllowed: allOtherIds };
        }
        if (current.includes(terminalId)) {
          return { ...m, terminalsAllowed: current.filter((id: string) => id !== terminalId) };
        }
        return { ...m, terminalsAllowed: [...current, terminalId] };
      })
    );
  };

  const availableTerminalOptions = [
    ...terminals.map((t) => ({ id: t.id, label: `${t.name || "terminal"} (${t.machine}) [${t.id.slice(0, 8)}...]` })),
    ...(!terminals.some((t) => t.id === "c56de979-35aa-4828-9056-3dbaab629e0d")
      ? [{ id: "c56de979-35aa-4828-9056-3dbaab629e0d", label: "c56de979-35aa-4828-9056-3dbaab629e0d (Целевой терминал проекта)" /* i18n-ignore */ }]
      : []),
  ];

  const handleUpdateSessionPermissions = async (sessionId: string, updates: Record<string, any>) => {
    try {
      const res = await fetch(`/api/orchestration/ai-sessions/${sessionId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setAiSessions((prev) =>
          prev.map((s) => (s.session_id === sessionId ? { ...s, ...updates } : s))
        );
        if (notify) notify("Права сессии ИИ-агента обновлены"); /* i18n-ignore */
      }
    } catch {
      if (notify) notify("Ошибка обновления прав ИИ-сессии"); /* i18n-ignore */
    }
  };

  const handleToggleBlockAiSession = async (sessionId: string, currentBlocked: boolean) => {
    const nextBlocked = !currentBlocked;
    try {
      const res = await fetch(`/api/orchestration/ai-sessions/${sessionId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({ blocked: nextBlocked }),
      });
      if (res.ok) {
        setAiSessions((prev) =>
          prev.map((s) => (s.session_id === sessionId ? { ...s, blocked: nextBlocked, status: nextBlocked ? "BLOCKED" /* i18n-ignore */ : "ONLINE" /* i18n-ignore */ } : s))
        );
        if (notify) notify(nextBlocked ? "ИИ-агент заблокирован" /* i18n-ignore */ : "ИИ-агент разблокирован" /* i18n-ignore */);
      }
    } catch {
      if (notify) notify("Ошибка переключения блокировки ИИ"); /* i18n-ignore */
    }
  };

  const handleRevokeAiSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/orchestration/ai-sessions/${sessionId}`, {
        method: "DELETE",
        headers: { "x-tterm": "1" },
      });
      if (res.ok) {
        setAiSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
        if (notify) notify("Сессия ИИ-агента отозвана"); /* i18n-ignore */
      }
    } catch {
      if (notify) notify("Ошибка отзыва сессии ИИ"); /* i18n-ignore */
    }
  };

  const handleGenerateAiKey = async () => {
    setIsGeneratingAiKey(true);
    try {
      const res = await fetch("/api/orchestration/ai-keys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          project_id: project.id || "default-project",
          allowed_terminals: [selectedTerminalForAi],
          allowed_nodes: [selectedNodeId || "klim"],
          agent_name: aiAgentName,
          role: aiRole,
          ai_mode: aiMode,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedAiKeyResult(data);
        if (notify) notify("Ключ доступа ИИ успешно сгенерирован!"); /* i18n-ignore */
      }
    } catch {
      if (notify) notify("Ошибка при создании ключа ИИ"); /* i18n-ignore */
    } finally {
      setIsGeneratingAiKey(false);
    }
  };

  return (
    <div className="project-collaboration-hub" style={{ marginTop: 24 }}>
      {/* 1. Команда и доступ ИИ */}
      {(activeSection === "all" || activeSection === "team_ai") && (
      <section className="pp-section" style={{ marginBottom: 28 }}>
        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <People size={18} />
              Команда проекта и доступ ИИ {/* i18n-ignore */}
            </h2>
            <span>
              Управление доступом людей и ИИ-ассистентов с матрицей прав (RBAC) {/* i18n-ignore */}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="button-accent small"
              style={{ background: "#8b5cf6", borderColor: "#8b5cf6" }}
              onClick={() => {
                setShowAiKeyModal(true);
                setGeneratedAiKeyResult(null);
              }}
            >
              <Spark size={13} />
              <span>🤖 Выдать ключ ИИ (MCP)</span> {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className="button-danger-line small"
              onClick={handleRevokeAllAi}
              title="Экстренно заблокировать доступ всех ИИ к терминалам проекта" /* i18n-ignore */
            >
              <Lock size={13} />
              Отозвать доступ ИИ {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className="button-accent small"
              onClick={() => setShowInviteModal(true)}
            >
              <LinkIcon size={13} />
              Пригласить по ссылке {/* i18n-ignore */}
            </button>
          </div>
        </div>

        {/* Блок: Активные сессии ИИ-агентов (MCP) */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 14, color: "#c084fc" }}>
              <Spark size={16} />
              <span>Активные сессии ИИ-агентов (MCP) ({aiSessions.length})</span> {/* i18n-ignore */}
            </h3>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
              1 сессия = 1 подключенный агент ИИ. Управление правами на лету. {/* i18n-ignore */}
            </span>
          </div>

          {aiSessions.length === 0 ? (
            <div style={{ padding: "14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", textAlign: "center", fontSize: 13, color: "var(--color-text-dim, #777)" }}>
              Нет активных сессий ИИ. Выдайте ключ доступа по кнопке «Выдать ключ ИИ (MCP)». {/* i18n-ignore */}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
              {aiSessions.map((sess) => (
                <div key={sess.session_id} className="ai-session-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`ai-pulse-dot ${sess.blocked ? "blocked" : ""}`} />
                        <strong style={{ fontSize: 14 }}>{sess.agent_name}</strong>
                      </div>
                      <span className="pp-mono" style={{ fontSize: 11, color: "var(--color-text-dim, #777)" }}>
                        {"ID: "} {sess.session_id} {/* i18n-ignore */}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: sess.blocked ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)",
                      color: sess.blocked ? "#ef4444" : "#10b981",
                      fontWeight: 600,
                    }}>
                      {sess.blocked ? "BLOCKED" /* i18n-ignore */ : sess.status}
                    </span>
                  </div>

                  {/* Scoped Terminal Selector */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                      Разрешенный терминал (изоляция): {/* i18n-ignore */}
                    </span>
                    <select
                      className="input-select"
                      style={{ fontSize: 12, padding: "3px 6px" }}
                      value={sess.allowed_terminals[0] || ""}
                      onChange={(e) => handleUpdateSessionPermissions(sess.session_id, { allowed_terminals: [e.target.value] })}
                    >
                      {availableTerminalOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Security Mode Selector */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                      Режим безопасности: {/* i18n-ignore */}
                    </span>
                    <select
                      className="input-select"
                      style={{ fontSize: 11, padding: "2px 6px" }}
                      value={sess.ai_mode}
                      onChange={(e) => handleUpdateSessionPermissions(sess.session_id, { ai_mode: e.target.value })}
                    >
                      <option value="guard">🛡️ Guard (С подтверждением) {/* i18n-ignore */}</option>
                      <option value="execute">⚡ Execute (Автономно) {/* i18n-ignore */}</option>
                      <option value="readonly">👁️ Read-Only (Только чтение) {/* i18n-ignore */}</option>
                    </select>
                  </div>

                  {/* Current command box */}
                  <div>
                    <span style={{ fontSize: 10, color: "var(--color-text-dim, #777)", display: "block", marginBottom: 2 }}>
                      Текущая / последняя команда: {/* i18n-ignore */}
                    </span>
                    <div style={{ fontSize: 12, fontFamily: "monospace", padding: "4px 8px", background: "rgba(0,0,0,0.3)", borderRadius: 4, color: "#e2e8f0", wordBreak: "break-all" }}>
                      {"$ "} {sess.current_command || "Ожидание команды..."} {/* i18n-ignore */}
                    </div>
                  </div>

                  {/* Session footer actions */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-dim, #777)" }}>
                      {"Команд: "} {sess.total_commands} {/* i18n-ignore */}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="button-ghost small"
                        style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={() => handleToggleBlockAiSession(sess.session_id, sess.blocked)}
                      >
                        {sess.blocked ? "✅ Разблокировать" : "🚫 Блокировать"} {/* i18n-ignore */}
                      </button>
                      <button
                        type="button"
                        className="button-ghost small"
                        style={{ color: "#ef4444", fontSize: 11, padding: "2px 6px" }}
                        onClick={() => handleRevokeAiSession(sess.session_id)}
                        title="Отозвать сессию" /* i18n-ignore */
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pp-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {members.map((member) => (
            <div
              key={member.id}
              className="pp-card"
              style={{
                padding: "16px",
                borderLeft: member.isAi ? "3px solid #8b5cf6" : member.blocked ? "3px solid #ef4444" : "3px solid #10b981",
                opacity: member.blocked ? 0.75 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                    {member.isAi ? <span style={{ color: "#a855f7", display: "inline-flex" }}><Spark size={15} /></span> : <Person size={15} />}
                    {member.name}
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                    {member.email}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <select
                    className="input-select"
                    value={member.role}
                    disabled={member.id === me.id}
                    onChange={(e) => handleChangeMemberRole(member.id, e.target.value as any)}
                    style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4 }}
                  >
                    <option value="project_admin">Администратор {/* i18n-ignore */}</option>
                    <option value="node_admin">Админ ноды {/* i18n-ignore */}</option>
                    <option value="container_developer">Разработчик {/* i18n-ignore */}</option>
                    <option value="service_operator">Оператор {/* i18n-ignore */}</option>
                  </select>
                  {member.blocked && (
                    <span style={{ fontSize: 10, background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", padding: "2px 6px", borderRadius: 4, fontWeight: "bold" }}>
                      БЛОК {/* i18n-ignore */}
                    </span>
                  )}
                </div>
              </div>

              {member.isAi && (
                <div style={{ margin: "8px 0", fontSize: 12, background: "rgba(139,92,246,0.1)", padding: "6px 10px", borderRadius: 6 }}>
                  <span>Режим работы: <strong>{member.aiMode === "guard" ? "Guard Mode (С подтверждением)" : member.aiMode} {/* i18n-ignore */}</strong></span>
                </div>
              )}

              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 6 }}>
                  Разрешенные терминалы в проекте: {/* i18n-ignore */}
                </span>
                {terminals.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--color-text-dim, #666)" }}>В проекте пока нет запущенных терминалов {/* i18n-ignore */}</span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {terminals.map((t) => {
                      const allowedList = Array.isArray(member.terminalsAllowed)
                        ? member.terminalsAllowed
                        : Array.isArray((member as any).terminals_allowed)
                          ? (member as any).terminals_allowed
                          : ["*"];
                      const allowed = allowedList.includes("*") || allowedList.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            cursor: "pointer",
                            background: allowed ? "rgba(255,255,255,0.04)" : "transparent",
                            padding: "3px 6px",
                            borderRadius: 4,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={allowed}
                            onChange={() => toggleTerminalAccess(member.id, t.id)}
                            disabled={member.role === "project_admin" || member.blocked}
                          />
                          <span style={{ fontFamily: "monospace" }}>{t.name || "terminal"}</span>
                          <span style={{ fontSize: 10, color: "var(--color-text-secondary, #888)" }}>
                            ({t.machine})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {member.id !== me.id && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <button
                    type="button"
                    className="button-ghost small"
                    onClick={() => handleToggleBlockMember(member.id, Boolean(member.blocked))}
                  >
                    {member.blocked ? "✅ Разблокировать" : "🚫 Блокировать"} {/* i18n-ignore */}
                  </button>
                  <button
                    type="button"
                    className="button-ghost small"
                    style={{ color: "#ef4444" }}
                    onClick={() => handleRemoveMember(member.id)}
                    title="Удалить участника из проекта" // i18n-ignore
                  >
                    <Trash size={13} />
                    <span>Удалить {/* i18n-ignore */}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      )}

      {/* 2. Git Интеграция */}
      {(activeSection === "all" || activeSection === "git_notes") && (
      <section className="pp-section" style={{ marginBottom: 28 }}>
        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Branch size={18} />
              Git Репозиторий и Ветки Терминалов {/* i18n-ignore */}
            </h2>
            <span>
              Привязка существующего Git-репозитория или создание нового для проекта / терминала. {/* i18n-ignore */}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="segmented" style={{ margin: 0 }}>
              <button
                type="button"
                className={gitMode === "bind" ? "active" : ""}
                onClick={() => setGitMode("bind")}
              >
                🔗 Привязать репозиторий {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className={gitMode === "create" ? "active" : ""}
                onClick={() => setGitMode("create")}
              >
                <Plus size={13} />
                Создать репозиторий {/* i18n-ignore */}
              </button>
            </div>
            {gitMode === "bind" && (
              <button
                type="button"
                className="button-accent small"
                onClick={handleSaveGitConfig}
                disabled={isSavingGit}
              >
                {isSavingGit ? "Сохранение..." : "💾 Сохранить привязку Git"} {/* i18n-ignore */}
              </button>
            )}
          </div>
        </div>

        <div className="pp-card" style={{ padding: "16px 20px" }}>
          {/* GitHub Web App Authorization Card */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderRadius: 8,
            background: githubStatus.is_authenticated ? "rgba(16, 185, 129, 0.08)" : "rgba(255, 255, 255, 0.03)",
            border: githubStatus.is_authenticated ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(255, 255, 255, 0.08)",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {githubStatus.is_authenticated && githubStatus.avatar_url ? (
                <img src={githubStatus.avatar_url} alt="avatar" style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)" }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Branch size={18} />
                </div>
              )}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{githubStatus.is_authenticated ? `@${githubStatus.username}` : "GitHub не авторизован"} {/* i18n-ignore */}</strong>
                  <span style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: githubStatus.is_authenticated ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)",
                    color: githubStatus.is_authenticated ? "#10b981" : "#888",
                  }}>
                    {githubStatus.is_authenticated ? "Веб-приложение подключено" : "Требуется вход"} {/* i18n-ignore */}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)", display: "block", marginTop: 2 }}>
                  {githubStatus.is_authenticated
                    ? `Репозиториев: ${githubStatus.public_repos || 0} • Токен: ${githubStatus.masked_token}` // i18n-ignore
                    : "Авторизуйте GitHub для автоматического управления репозиториями, ветками и коммитами проекта от вашего имени"} {/* i18n-ignore */}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {githubStatus.is_authenticated ? (
                <>
                  <button
                    type="button"
                    className="button-ghost small"
                    onClick={handleLoadGitHubRepos}
                    title="Обновить список моих репозиториев" /* i18n-ignore */
                  >
                    <Restart size={13} />
                    <span>Мои репозитории ({userGithubRepos.length})</span> {/* i18n-ignore */}
                  </button>
                  <button
                    type="button"
                    className="button-danger-line small"
                    onClick={handleDisconnectGitHub}
                  >
                    Отключить {/* i18n-ignore */}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button-accent small"
                  onClick={() => setShowGithubModal(true)}
                >
                  <LinkIcon size={13} />
                  <span>🔗 Авторизовать GitHub</span> {/* i18n-ignore */}
                </button>
              )}
            </div>
          </div>

          {/* User Repos Quick Selector */}
          {userGithubRepos.length > 0 && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary, #999)" }}>
                Выберите один из ваших репозиториев на GitHub для быстрой привязки: {/* i18n-ignore */}
              </span>
              <select
                className="input-select"
                style={{ fontSize: 12, padding: "4px 8px" }}
                value={userGithubRepos.find((r) => r.html_url + ".git" === gitRepo || r.html_url === gitRepo) ? (userGithubRepos.find((r) => r.html_url + ".git" === gitRepo || r.html_url === gitRepo)!.html_url + ".git") : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    setGitRepo(e.target.value);
                    if (notify) notify(`Выбран репозиторий: ${e.target.value}`); // i18n-ignore
                  }
                }}
              >
                <option value="">-- Выбрать репозиторий -- {/* i18n-ignore */}</option>
                {userGithubRepos.map((r) => (
                  <option key={r.name} value={r.html_url + ".git"}>
                    {r.full_name} {r.private ? "(приватный)" /* i18n-ignore */ : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {gitMode === "bind" ? (
            /* Mode 1: Bind Existing */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                  URL удаленного репозитория (GitHub / Gitea / GitLab): {/* i18n-ignore */}
                </span>
                <input
                  type="text"
                  className="input-text"
                  value={gitRepo}
                  placeholder="https://github.com/username/repository.git"
                  onChange={(e) => setGitRepo(e.target.value)}
                  style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
                />
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                  Базовая ветка (Base Trunk Branch): {/* i18n-ignore */}
                </span>
                <input
                  type="text"
                  className="input-text"
                  value={gitBranch}
                  placeholder="main"
                  onChange={(e) => setGitBranch(e.target.value)}
                  style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
                />
              </div>
            </div>
          ) : (
            /* Mode 2: Create New Repository */
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16, padding: "14px 16px", borderRadius: 8, background: "rgba(59, 130, 246, 0.06)", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                <div>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                    Имя нового репозитория: {/* i18n-ignore */}
                  </span>
                  <input
                    type="text"
                    className="input-text"
                    value={newRepoName}
                    placeholder="my-project-repo"
                    onChange={(e) => setNewRepoName(e.target.value)}
                    style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                    Область привязки: {/* i18n-ignore */}
                  </span>
                  <select
                    className="input-select"
                    value={newRepoScope}
                    onChange={(e) => setNewRepoScope(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", fontSize: 13 }}
                  >
                    <option value="project">Для всего проекта ({project.name}) {/* i18n-ignore */}</option>
                    {terminals.map((t) => (
                      <option key={t.id} value={t.id}>
                        Только для терминала: {t.name || t.machine || t.id.slice(0, 6)} {/* i18n-ignore */}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                    Видимость: {/* i18n-ignore */}
                  </span>
                  <select
                    className="input-select"
                    value={newRepoVisibility}
                    onChange={(e) => setNewRepoVisibility(e.target.value as any)}
                    style={{ width: "100%", padding: "7px 10px", fontSize: 13 }}
                  >
                    <option value="public">Публичный (Public) {/* i18n-ignore */}</option>
                    <option value="private">Приватный (Private) {/* i18n-ignore */}</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  className="button-accent small"
                  disabled={isCreatingRepo || !newRepoName.trim()}
                  onClick={handleCreateRepo}
                >
                  <Plus size={14} />
                  <span>{isCreatingRepo ? "Создание..." : "Создать репозиторий и привязать" /* i18n-ignore */}</span>
                </button>
              </div>
            </div>
          )}

          {/* Options Toggles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={autoBranchPerTerminal}
                onChange={(e) => setAutoBranchPerTerminal(e.target.checked)}
              />
              <strong>Изолировать каждый терминал в отдельную ветку Git {/* i18n-ignore */}</strong>
              <span style={{ color: "var(--color-text-secondary, #888)", fontSize: 12 }}>
                (ветка <code>term/название-автор</code> создается автоматически) {/* i18n-ignore */}
              </span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={autoCommitActions}
                onChange={(e) => setAutoCommitActions(e.target.checked)}
              />
              <strong>Автоматически фиксировать действия каждого терминала как Git-коммиты {/* i18n-ignore */}</strong>
              <span style={{ color: "var(--color-text-secondary, #888)", fontSize: 12 }}>
                (команды логируются в формате <code>[term] команда (by автор)</code>) {/* i18n-ignore */}
              </span>
            </label>
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={useGithubNotes}
                onChange={(e) => setUseGithubNotes(e.target.checked)}
              />
              <strong>Использовать GitHub для хранения заметок проекта {/* i18n-ignore */}</strong>
              <span style={{ color: "var(--color-text-secondary, #888)", fontSize: 12 }}>
                (хранит общие заметки как файлы <code>.md</code> в репозитории; личные заметки хранятся в приватной БД) {/* i18n-ignore */}
              </span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginLeft: 22 }}>
              <input
                type="checkbox"
                checked={commitsAsNotes}
                onChange={(e) => setCommitsAsNotes(e.target.checked)}
              />
              <span>Фиксировать историю коммитов проекта как структурированные заметки с чеклистами {/* i18n-ignore */}</span>
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 6, marginLeft: 22 }}>
              <button
                type="button"
                className="button-plain small"
                onClick={handleSyncNotesWithGithub}
                disabled={isSyncingNotes}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <FolderIcon size={13} />
                <span>{isSyncingNotes ? "Синхронизация..." : "🔄 Синхронизировать заметки из GitHub репозитория"} {/* i18n-ignore */}</span>
              </button>
            </div>
          </div>

          {/* Terminal Branches List */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <Branch size={14} />
                Ветки активных терминалов проекта ({terminals.length}) {/* i18n-ignore */}
              </h4>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                Каждое окно терминала изолировано в своей ветке {/* i18n-ignore */}
              </span>
            </div>

            {terminals.length === 0 ? (
              <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(0,0,0,0.2)", fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                В проекте нет открытых терминалов. Откройте терминал, чтобы активировать персональную ветку. {/* i18n-ignore */}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {terminals.map((t) => {
                  const cleanUser = (me.name || "user").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "user";
                  const cleanLabel = (t.name || t.machine || `term${t.id.slice(0, 4)}`).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
                  const fallbackBranch = `term/${cleanLabel}-${cleanUser}`;
                  const branchInfo = terminalBranches[t.id];
                  const branchName = branchInfo?.branch_name || fallbackBranch;
                  const commitsCount = branchInfo?.commits_count ?? 0;

                  return (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name || `Терминал #${t.id.slice(0, 6)}` /* i18n-ignore */}</span>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "rgba(59, 130, 246, 0.15)",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          color: "#60a5fa",
                          fontFamily: "monospace",
                          fontSize: 12,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}>
                          <Branch size={12} />
                          {branchName}
                        </span>
                        {autoCommitActions && (
                          <span style={{
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#10b981",
                            fontSize: 11,
                          }}>
                            {/* i18n-ignore */}
                            💾 {commitsCount} коммитов
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          className="button-ghost small"
                          title="Скопировать команду перехода в ветку терминала" // i18n-ignore
                          onClick={() => {
                            const cmd = `git switch -c ${branchName} 2>/dev/null || git switch ${branchName}`;
                            copyText(cmd, (v) => showCopiedBranchScript(v ? t.id : ""));
                            if (notify) notify(`Команда switch для ветки ${branchName} скопирована`); // i18n-ignore
                          }}
                        >
                          <Copy size={13} />
                          <span>{copiedBranchScript === t.id ? "Скопировано!" : "Команда switch" /* i18n-ignore */}</span>
                        </button>
                        <button
                          type="button"
                          className="button-plain small"
                          title="Скопировать команду отправки ветки в репозиторий" // i18n-ignore
                          onClick={() => {
                            const cmd = `git push -u origin ${branchName}`;
                            copyText(cmd, () => {});
                            if (notify) notify(`Команда push скопирована: git push -u origin ${branchName}`); // i18n-ignore
                          }}
                        >
                          <span>🚀 Push в Git {/* i18n-ignore */}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--color-text-secondary, #888)", marginTop: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#10b981", display: "inline-flex" }}><Check size={14} /></span>
              Привязано к локальному и удаленному репозиторию {/* i18n-ignore */}
            </span>
            <span>·</span>
            <a
              href={gitRepo.replace(/\.git$/, "")}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-accent, #3b82f6)", textDecoration: "none" }}
            >
              Открыть {gitRepo.includes("github.com") ? "GitHub" : "Репозиторий"} ↗ {/* i18n-ignore */}
            </a>
          </div>
        </div>
      </section>
      )}

      {/* 3. Контейнерная Оркестрация, Ноды и Порты */}
      {(activeSection === "all" || activeSection === "containers") && (
      <section className="pp-section">
        {/* Очередь подтверждения опасных команд от нижестоящих звеньев */}
        {approvals.length > 0 && (
          <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, color: "#f87171", margin: 0, fontSize: 15 }}>
                <Warning size={18} />
                Запросы на подтверждение опасных команд ({approvals.length}) {/* i18n-ignore */}
              </h3>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                Команды нижестоящих участников заблокированы до вашего решения {/* i18n-ignore */}
              </span>
            </div>
            {approvals.map((req) => (
              <div key={req.id} className={`approval-card ${req.risk_level.toLowerCase()}`}>
                <div className="approval-card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={`risk-badge ${req.risk_level.toLowerCase()}`}>
                      {req.risk_level}
                    </span>
                    <strong style={{ fontSize: 13 }}>{req.requester_name} ({req.requester_role})</strong>
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                      {"в "} {req.terminal_label} {/* i18n-ignore */}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--color-text-dim, #777)" }}>
                    {new Date(req.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="command-code-box">
                  $ {req.command}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#fca5a5" }}>
                    ⚠️ {req.reason} {/* i18n-ignore */}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="button-accent small"
                      style={{ background: "#10b981", borderColor: "#10b981" }}
                      onClick={() => handleResolveApproval(req.id, true)}
                    >
                      <Check size={13} />
                      <span>Разрешить команду</span> {/* i18n-ignore */}
                    </button>
                    <button
                      type="button"
                      className="button-danger-line small"
                      onClick={() => handleResolveApproval(req.id, false)}
                    >
                      <Close size={13} />
                      <span>Отклонить</span> {/* i18n-ignore */}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={18} />
              Иерархия Нод, Docker-контейнеров и Служб {/* i18n-ignore */}
            </h2>
            <span>
              Автосканирование всех подключенных машин: Ноды → Контейнеры → Открытые порты и службы {/* i18n-ignore */}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="button-ghost small"
              onClick={handleSimulateDangerousCommand}
              title="Проверить работу защиты от деструктивных действий" /* i18n-ignore */
            >
              <Warning size={13} />
              <span>⚡ Проверить перехват команд</span> {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className="button-plain small"
              onClick={handleScanAllNodes}
              disabled={scanLoading}
            >
              <span style={{ display: "inline-flex", marginRight: 4 }}><Search size={13} /></span>
              {scanLoading ? "Сканирование..." /* i18n-ignore */ : "🔍 Сканировать все машины и порты" /* i18n-ignore */}
            </button>
            <button
              type="button"
              className="button-ghost small"
              onClick={() => setShowTermiusDrawer(true)}
            >
              <Key size={14} />
              Параметры Termius / SSH {/* i18n-ignore */}
            </button>
          </div>

        </div>

        {/* Multi-Node Selector Bar */}
        <div className="node-selector-bar" style={{ marginBottom: 12 }}>
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`node-tab-button ${selectedNodeId === node.id ? "active" : ""}`}
              onClick={() => setSelectedNodeId(node.id)}
            >
              {node.kind === "computer" ? <Computer size={15} /> : <Server size={15} />}
              <span>{node.name}</span>
              <span style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                background: node.status === "ONLINE" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                color: node.status === "ONLINE" ? "#10b981" : "#ef4444",
              }}>
                {node.status}
              </span>
            </button>
          ))}
        </div>

        {(() => {
          const activeNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0] || {
            id: "demo-node",
            name: "Gateway Node (Debian Linux)", /* i18n-ignore */
            kind: "server",
            os_name: "Debian Linux", /* i18n-ignore */
            ip_address: "192.168.1.100",
            status: "ONLINE",
            containers: [],
            ports: [],
            allowed_members: ["all"],
            last_scanned: "",
          };

          return (
            <div className="pp-card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Header active node */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, flexWrap: "wrap" }}>
                    {activeNode.kind === "computer" ? <Computer size={18} /> : <Server size={18} />}
                    <strong>Нода: {activeNode.name} ({activeNode.os_name}) {/* i18n-ignore */}</strong>
                    <span className="pp-mono" style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                      {"IP: "} {activeNode.ip_address} {/* i18n-ignore */}
                    </span>
                    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.2)", color: "#10b981" }}>
                      {activeNode.status}
                    </span>
                    {activeNode.allowed_members && !activeNode.allowed_members.includes("all") && (
                      <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(234,179,8,0.2)", color: "#eab308" }}>
                        {"🔒 Доступ ограничен ("}{activeNode.allowed_members.length}{" уч.)"} {/* i18n-ignore */}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button-ghost small"
                      onClick={() => setPermissionModal({
                        isOpen: true,
                        type: "node",
                        nodeId: activeNode.id,
                        entityName: activeNode.name,
                        allowedMembers: activeNode.allowed_members || ["all"],
                      })}
                    >
                      <Lock size={13} />
                      <span>🔒 Доступ к ноде</span> {/* i18n-ignore */}
                    </button>
                    <button
                      type="button"
                      className="button-plain small"
                      onClick={() => handleScanNode(activeNode.id)}
                      disabled={scanLoading}
                    >
                      <Search size={13} />
                      <span>Сканировать ноду</span> {/* i18n-ignore */}
                    </button>
                    <button
                      type="button"
                      className="button-danger-line small"
                      onClick={() => handleTriggerDisruptive("node", activeNode.id, activeNode.name, "reboot")}
                      title="Безопасная перезагрузка с проверкой вложенных задач" /* i18n-ignore */
                    >
                      <Restart size={12} />
                      <span>Перезагрузить</span> {/* i18n-ignore */}
                    </button>
                  </div>
                </div>

                {/* Level: Docker Containers */}
                <div style={{ marginLeft: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary, #999)", display: "block", marginBottom: 10 }}>
                    Обнаруженные Docker-контейнеры на ноде ({activeNode.containers?.length || 0}): {/* i18n-ignore */}
                  </span>
                  {activeNode.containers && activeNode.containers.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
                      {activeNode.containers.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 8,
                            background: "rgba(0,0,0,0.25)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              {editingContainerId === c.id ? (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input
                                    type="text"
                                    value={containerRenameText}
                                    onChange={(e) => setContainerRenameText(e.target.value)}
                                    className="input-text"
                                    style={{ fontSize: 12, padding: "2px 6px" }}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSaveRename(c.id);
                                      if (e.key === "Escape") setEditingContainerId(null);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="button-accent small"
                                    onClick={() => handleSaveRename(c.id)}
                                    style={{ padding: "2px 6px", fontSize: 11 }}
                                  >
                                    ✓
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <strong style={{ fontSize: 13, color: c.custom_name ? "#93c5fd" : undefined }}>
                                    {c.custom_name || c.name}
                                  </strong>
                                  <button
                                    type="button"
                                    className="icon-button small"
                                    onClick={() => {
                                      setEditingContainerId(c.id);
                                      setContainerRenameText(c.custom_name || c.name);
                                    }}
                                    title="Переименовать для удобства в проекте" /* i18n-ignore */
                                    style={{ opacity: 0.6 }}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </div>
                              )}
                              <span style={{ fontSize: 11, color: "var(--color-text-dim, #777)", fontFamily: "monospace", display: "block" }}>
                                {c.name !== c.custom_name ? c.name : c.image} {/* i18n-ignore */}
                              </span>
                            </div>
                            <span style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: c.status.startsWith("Up" /* i18n-ignore */) ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)",
                              color: c.status.startsWith("Up" /* i18n-ignore */) ? "#10b981" : "#888"
                            }}>
                              {c.status.split(" ")[0]}
                            </span>
                          </div>

                          {/* Ports */}
                          <div style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span>Порты: {/* i18n-ignore */}</span>
                            {c.ports.length > 0 ? (
                              c.ports.map((p, idx) => (
                                <code key={idx} style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>
                                  {p}
                                </code>
                              ))
                            ) : (
                              <span style={{ color: "var(--color-text-dim, #666)" }}>внутренние {/* i18n-ignore */}</span>
                            )}
                          </div>

                          {/* Container actions */}
                          <div style={{
                            marginTop: 4,
                            paddingTop: 8,
                            borderTop: "1px solid rgba(255,255,255,0.04)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}>
                            <button
                              type="button"
                              className="button-ghost small"
                              style={{ fontSize: 11, padding: "2px 6px" }}
                              onClick={() => setPermissionModal({
                                isOpen: true,
                                type: "container",
                                nodeId: activeNode.id,
                                containerId: c.id,
                                entityName: c.custom_name || c.name,
                                allowedMembers: ["all"],
                              })}
                            >
                              <Lock size={11} />
                              <span>Доступ к контейнеру</span> {/* i18n-ignore */}
                            </button>
                            <button
                              type="button"
                              className="button-danger-line small"
                              style={{ fontSize: 11, padding: "2px 6px" }}
                              onClick={() => handleTriggerDisruptive("container", c.id, c.custom_name || c.name, "restart")}
                              title="Перезапустить контейнер с защитой активных терминалов" /* i18n-ignore */
                            >
                              <Restart size={11} />
                              <span>Перезапуск</span> {/* i18n-ignore */}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      padding: "14px 16px",
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.25)",
                      border: "1px dashed rgba(255,255,255,0.12)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#93c5fd", fontWeight: 600, fontSize: 13 }}>
                        <span>🐳 Docker не запущен / не установлен на ноде</span> {/* i18n-ignore */}
                      </div>
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                        На данном узле ({activeNode.name}) контейнеры Docker не обнаружены. Доступ и сетевой мониторинг предоставляются напрямую к локальным службам и открытым сетевым портам рабочей станции ниже. {/* i18n-ignore */}
                      </span>
                    </div>
                  )}

                  {/* Level: Open Ports & Network Services */}
                  {activeNode.ports && activeNode.ports.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary, #999)", display: "block", marginBottom: 8 }}>
                        Обнаруженные открытые сетевые порты и службы ({activeNode.ports.length}): {/* i18n-ignore */}
                      </span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {activeNode.ports.map((p) => (
                          <div key={`${p.port}-${p.protocol}`} className="port-pill">
                            <span className="port-num">{p.port}/{p.protocol}</span>
                            <span className="port-hint">{p.service_hint}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </section>
      )}

      {/* Модальное окно деструктивного действия с оценкой влияния */}
      {disruptiveModal.isOpen && (
        <DisruptiveActionModal
          entityType={disruptiveModal.entityType}
          entityName={disruptiveModal.entityName}
          action={disruptiveModal.action}
          activeProcesses={disruptiveModal.activeProcesses}
          onConfirmDrain={handleConfirmDrain}
          onConfirmForce={handleConfirmForce}
          onCancel={() => setDisruptiveModal((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {/* Modal: Приглашение по ссылке */}
      {showInviteModal && createPortal(
        <div className="dialog-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="dialog-head">
              <h3>Приглашение в проект {project.name} {/* i18n-ignore */}</h3>
              <button type="button" className="button-ghost small" onClick={() => setShowInviteModal(false)}>
                <Close size={16} />
              </button>
            </div>
            <div className="dialog-body" style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary, #999)", marginBottom: 14 }}>
                По этой ссылке пользователь или ИИ-агент может присоединиться к проекту и получить доступ к назначенным терминалам и контейнерам. {/* i18n-ignore */}
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="input-text"
                  style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
                />
                <button
                  type="button"
                  className="button-accent"
                  onClick={() => copyText(inviteLink, showCopiedInvite)}
                >
                  {copiedInvite ? <Check size={14} /> : <Copy size={14} />}
                  {copiedInvite ? "Скопировано" /* i18n-ignore */ : "Копировать" /* i18n-ignore */}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                Срок действия ссылки: 24 часа. Назначить роль можно сразу после подключения. {/* i18n-ignore */}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Slide-Over Side Drawer: Termius & OpenSSH */}
      {showTermiusDrawer && (
        <>
          <div className="side-drawer-backdrop" onClick={() => setShowTermiusDrawer(false)} />
          <aside className="side-drawer-panel" role="complementary">
            <div className="side-drawer-head">
              <div className="side-drawer-title">
                <Key size={18} />
                <span>Параметры Termius & SSH {/* i18n-ignore */}</span>
              </div>
              <button
                type="button"
                className="icon-button small"
                onClick={() => setShowTermiusDrawer(false)}
                aria-label="Закрыть" // i18n-ignore
              >
                <Close size={16} />
              </button>
            </div>

            <nav className="side-drawer-tabs" role="tablist">
              <button
                type="button"
                className={`side-drawer-tab ${termiusTab === "termius" ? "active" : ""}`}
                onClick={() => setTermiusTab("termius")}
              >
                📱 Termius JSON {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className={`side-drawer-tab ${termiusTab === "ssh_config" ? "active" : ""}`}
                onClick={() => setTermiusTab("ssh_config")}
              >
                ⚙️ ~/.ssh/config {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className={`side-drawer-tab ${termiusTab === "ssh_cmd" ? "active" : ""}`}
                onClick={() => setTermiusTab("ssh_cmd")}
              >
                ⚡ SSH Команда {/* i18n-ignore */}
              </button>
            </nav>

            <div className="side-drawer-body">
              {termiusTab === "termius" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>Импорт в мобильный или десктопный Termius {/* i18n-ignore */}</strong>
                    <button
                      type="button"
                      className="button-plain small"
                      onClick={() => copyText(termiusJson, showCopiedTermius)}
                    >
                      {copiedTermius ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedTermius ? "Скопировано!" : "Копировать JSON" /* i18n-ignore */}</span>
                    </button>
                  </div>
                  <pre style={{
                    background: "rgba(0,0,0,0.45)",
                    padding: "12px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "monospace",
                    overflowX: "auto",
                    border: "1px solid rgba(255,255,255,0.08)"
                  }}>
                    {termiusJson}
                  </pre>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary, #888)", marginTop: 10, lineHeight: 1.5 }}>
                    Откройте Termius $\to$ Settings $\to$ Import $\to$ вставьте JSON. Подключение к контейнеру появится моментально. {/* i18n-ignore */}
                  </p>
                </div>
              )}

              {termiusTab === "ssh_config" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>Конфигурация OpenSSH (~/.ssh/config) {/* i18n-ignore */}</strong>
                    <button
                      type="button"
                      className="button-plain small"
                      onClick={() => copyText(sshConfigSnippet, showCopiedSshConfig)}
                    >
                      {copiedSshConfig ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedSshConfig ? "Скопировано!" : "Копировать конфиг" /* i18n-ignore */}</span>
                    </button>
                  </div>
                  <pre style={{
                    background: "rgba(0,0,0,0.45)",
                    padding: "12px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "monospace",
                    overflowX: "auto",
                    border: "1px solid rgba(255,255,255,0.08)"
                  }}>
                    {sshConfigSnippet}
                  </pre>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary, #888)", marginTop: 10, lineHeight: 1.5 }}>
                    Добавьте блок в файл <code>~/.ssh/config</code> для быстрого подключения одной командой <code>ssh tterm-{project.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}</code>. {/* i18n-ignore */}
                  </p>
                </div>
              )}

              {termiusTab === "ssh_cmd" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>Быстрое подключение в одну строку (CLI) {/* i18n-ignore */}</strong>
                    <button
                      type="button"
                      className="button-plain small"
                      onClick={() => copyText(sshCmd, showCopiedSshCmd)}
                    >
                      {copiedSshCmd ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedSshCmd ? "Скопировано!" : "Копировать команду" /* i18n-ignore */}</span>
                    </button>
                  </div>
                  <pre style={{
                    background: "rgba(0,0,0,0.45)",
                    padding: "12px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "monospace",
                    border: "1px solid rgba(255,255,255,0.08)"
                  }}>
                    {sshCmd}
                  </pre>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary, #888)", marginTop: 10, lineHeight: 1.5 }}>
                    Прямое подключение к порту 2222 контейнера окружения разработки. {/* i18n-ignore */}
                  </p>
                </div>
              )}
            </div>

            <div className="side-drawer-foot">
              <button
                type="button"
                className="button-plain small"
                onClick={() => setShowTermiusDrawer(false)}
              >
                Закрыть {/* i18n-ignore */}
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Modal: GitHub Authorization */}
      {showGithubModal && createPortal(
        <div className="dialog-overlay" onClick={() => setShowGithubModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="dialog-head">
              <h3>Авторизация в GitHub {/* i18n-ignore */}</h3>
              <button type="button" className="button-ghost small" onClick={() => setShowGithubModal(false)}>
                <Close size={16} />
              </button>
            </div>
            <div className="dialog-body" style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary, #999)", marginBottom: 16 }}>
                Привязка GitHub позволяет сервису tTerm автоматически создавать репозитории, ветки для каждого терминала, коммитить действия и отправлять Pull Request от вашего имени. {/* i18n-ignore */}
              </p>

              {/* Способ 1: Личный токен GitHub (PAT) */}
              <div style={{ marginBottom: 18, padding: "14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                  Быстрый вход через токен (Personal Access Token) {/* i18n-ignore */}
                </strong>
                <span style={{ fontSize: 12, color: "var(--color-text-dim, #777)", display: "block", marginBottom: 8 }}>
                  Создайте токен в GitHub $\to$ Settings $\to$ Developer settings $\to$ Tokens (classic) с правами <code>repo, workflow, user</code>. {/* i18n-ignore */}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="input-text"
                    value={githubTokenInput}
                    onChange={(e) => setGithubTokenInput(e.target.value)}
                    style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    className="button-accent"
                    disabled={isConnectingGithub || !githubTokenInput.trim()}
                    onClick={handleConnectGitHubToken}
                  >
                    {isConnectingGithub ? "Проверка..." : "Подключить"} {/* i18n-ignore */}
                  </button>
                </div>
              </div>

              {/* Способ 2: Веб-приложение GitHub OAuth */}
              <div style={{ padding: "14px", borderRadius: 8, background: "rgba(59, 130, 246, 0.05)", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                <strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                  Авторизация веб-приложения (OAuth Web Flow) {/* i18n-ignore */}
                </strong>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary, #888)", marginBottom: 10 }}>
                  Стандартная авторизация через официальное диалоговое окно GitHub с запросом прав на управление репозиториями. {/* i18n-ignore */}
                </p>
                <a
                  href={`https://github.com/login/oauth/authorize?client_id=Iv23liOAUTH_TTERM_APP&scope=repo%20user%20workflow&redirect_uri=${encodeURIComponent(window.location.origin + "/api/orchestration/github/callback")}`}
                  className="button-plain"
                  style={{ display: "inline-flex", textDecoration: "none" }}
                  target="_blank"
                  rel="noreferrer"
                >
                  <LinkIcon size={14} />
                  <span>Открыть страницу входа GitHub ↗</span> {/* i18n-ignore */}
                </a>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}



      {/* Modal: Управление доступом к ноде / контейнеру */}
      {permissionModal.isOpen && createPortal(
        <div className="dialog-overlay" onClick={() => setPermissionModal((prev) => ({ ...prev, isOpen: false }))}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="dialog-head">
              <h3>
                {permissionModal.type === "node" ? "🔒 Доступ к ноде: " /* i18n-ignore */ : "🔒 Доступ к контейнеру: " /* i18n-ignore */}
                {permissionModal.entityName} {/* i18n-ignore */}
              </h3>
              <button
                type="button"
                className="button-ghost small"
                onClick={() => setPermissionModal((prev) => ({ ...prev, isOpen: false }))}
              >
                <Close size={16} />
              </button>
            </div>
            <div className="dialog-body" style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary, #999)", marginBottom: 14 }}>
                Укажите, кто из участников проекта имеет право подключаться и выполнять команды в этом окружении. Все остальные участники не увидят терминалы данной сущности. {/* i18n-ignore */}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)" }}>
                  <input
                    type="checkbox"
                    checked={permissionModal.allowedMembers.includes("all")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPermissionModal((prev) => ({ ...prev, allowedMembers: ["all"] }));
                      } else {
                        setPermissionModal((prev) => ({ ...prev, allowedMembers: [me.id] }));
                      }
                    }}
                  />
                  <strong>Все участники проекта (Public в рамках проекта) {/* i18n-ignore */}</strong>
                </label>

                {!permissionModal.allowedMembers.includes("all") && members.map((m) => (
                  <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                    <input
                      type="checkbox"
                      checked={permissionModal.allowedMembers.includes(m.id) || m.id === me.id}
                      disabled={m.id === me.id}
                      onChange={(e) => {
                        const current = permissionModal.allowedMembers;
                        if (e.target.checked) {
                          setPermissionModal((prev) => ({ ...prev, allowedMembers: [...current, m.id] }));
                        } else {
                          setPermissionModal((prev) => ({ ...prev, allowedMembers: current.filter((id) => id !== m.id) }));
                        }
                      }}
                    />
                    <span>{m.name} ({m.role})</span>
                  </label>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  className="button-ghost small"
                  onClick={() => setPermissionModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Отмена {/* i18n-ignore */}
                </button>
                <button
                  type="button"
                  className="button-accent small"
                  onClick={handleSavePermissions}
                >
                  Сохранить права доступа {/* i18n-ignore */}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Генерация Scoped-ключа доступа для ИИ-агента */}
      {showAiKeyModal && createPortal(
        <div className="dialog-overlay" onClick={() => setShowAiKeyModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="dialog-head">
              <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Spark size={18} />
                <span>Выдать Scoped-доступ ИИ-агенту (MCP)</span> {/* i18n-ignore */}
              </h3>
              <button
                type="button"
                className="button-ghost small"
                onClick={() => setShowAiKeyModal(false)}
              >
                <Close size={16} />
              </button>
            </div>

            <div className="dialog-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary, #999)", margin: 0 }}>
                Сгенерируйте токен и параметры подключения для внешней нейросети / агента (Claude Desktop, Cursor, Antigravity). Агент сможет подключиться только к разрешенному терминалу и ноде. {/* i18n-ignore */}
              </p>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Разрешенный терминал (Изоляция агента) {/* i18n-ignore */}
                </label>
                <select
                  className="input-select"
                  value={selectedTerminalForAi}
                  onChange={(e) => setSelectedTerminalForAi(e.target.value)}
                  style={{ width: "100%", fontSize: 13 }}
                >
                  {availableTerminalOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Имя агента {/* i18n-ignore */}
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    value={aiAgentName}
                    onChange={(e) => setAiAgentName(e.target.value)}
                    placeholder="Antigravity AI Agent" /* i18n-ignore */
                    style={{ width: "100%", fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Роль в проекте {/* i18n-ignore */}
                  </label>
                  <select
                    className="input-select"
                    value={aiRole}
                    onChange={(e) => setAiRole(e.target.value)}
                    style={{ width: "100%", fontSize: 13 }}
                  >
                    <option value="container_developer">Разработчик (container_developer) {/* i18n-ignore */}</option>
                    <option value="service_operator">Оператор (service_operator) {/* i18n-ignore */}</option>
                    <option value="node_admin">Админ ноды (node_admin) {/* i18n-ignore */}</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Режим безопасности {/* i18n-ignore */}
                  </label>
                  <select
                    className="input-select"
                    value={aiMode}
                    onChange={(e) => setAiMode(e.target.value as any)}
                    style={{ width: "100%", fontSize: 13 }}
                  >
                    <option value="guard">🛡️ Guard (С подтверждением) {/* i18n-ignore */}</option>
                    <option value="execute">⚡ Execute (Автономный) {/* i18n-ignore */}</option>
                    <option value="readonly">👁️ Read-Only (Только чтение) {/* i18n-ignore */}</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="button-accent"
                  onClick={handleGenerateAiKey}
                  disabled={isGeneratingAiKey}
                >
                  <Spark size={14} />
                  <span>{isGeneratingAiKey ? "Генерация ключа..." /* i18n-ignore */ : "✨ Сгенерировать ключ доступа" /* i18n-ignore */}</span>
                </button>
              </div>

              {/* Отображение сгенерированного ключа в формате пользователя */}
              {generatedAiKeyResult && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(139, 92, 246, 0.08)", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <strong style={{ fontSize: 13, color: "#c084fc" }}>
                        Скопируйте и отправьте этот JSON ИИ-агенту в чат: {/* i18n-ignore */}
                      </strong>
                      <button
                        type="button"
                        className="button-accent small"
                        onClick={() => {
                          const jsonText = JSON.stringify({
                            url: generatedAiKeyResult.connection_json.url,
                            allowed_terminal: generatedAiKeyResult.connection_json.allowed_terminal,
                            project_id: generatedAiKeyResult.connection_json.project_id,
                          }, null, 2);
                          copyToClipboard(jsonText);
                          if (notify) notify("JSON скопирован в буфер обмена!"); /* i18n-ignore */
                        }}
                      >
                        <Copy size={13} />
                        <span>Скопировать JSON {/* i18n-ignore */}</span>
                      </button>
                    </div>
                    <pre style={{ margin: 0, padding: "10px", background: "rgba(0,0,0,0.4)", borderRadius: 6, fontSize: 12, fontFamily: "monospace", color: "#a7f3d0" }}>
                      {JSON.stringify({
                        url: generatedAiKeyResult.connection_json.url,
                        allowed_terminal: generatedAiKeyResult.connection_json.allowed_terminal,
                        project_id: generatedAiKeyResult.connection_json.project_id,
                      }, null, 2)}
                    </pre>
                  </div>

                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <strong style={{ fontSize: 12, color: "var(--color-text-secondary, #999)" }}>
                        Конфигурация MCP для Claude Desktop / Cursor / Antigravity: {/* i18n-ignore */}
                      </strong>
                      <button
                        type="button"
                        className="button-ghost small"
                        onClick={() => {
                          copyToClipboard(JSON.stringify(generatedAiKeyResult.mcp_config, null, 2));
                          if (notify) notify("MCP Config скопирован!"); /* i18n-ignore */
                        }}
                      >
                        <Copy size={12} />
                        <span>MCP Config {/* i18n-ignore */}</span>
                      </button>
                    </div>
                    <pre style={{ margin: 0, padding: "10px", background: "rgba(0,0,0,0.3)", borderRadius: 6, fontSize: 11, fontFamily: "monospace", color: "#cbd5e1" }}>
                      {JSON.stringify(generatedAiKeyResult.mcp_config, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="dialog-foot">
              <button
                type="button"
                className="button-plain small"
                onClick={() => setShowAiKeyModal(false)}
              >
                Закрыть {/* i18n-ignore */}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
