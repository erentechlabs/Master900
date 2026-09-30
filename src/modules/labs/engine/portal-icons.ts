/**
 * Icon names that portal-simulation labs may use (lucide-react export names). The renderer maps each name to a
 * component (src/components/labs/portal/icon-map.ts is typed against this list so it stays complete).
 */
export const PORTAL_ICON_NAMES = [
  "Home", "LayoutDashboard", "LayoutGrid", "Plus", "Monitor", "MonitorCog", "MonitorCheck", "Server", "ServerCog", "HardDrive",
  "Network", "Globe", "Shield", "ShieldCheck", "ShieldAlert", "ShieldPlus", "ShieldBan", "Lock", "LockOpen", "KeyRound",
  "Key", "Users", "User", "UserPlus", "UserCheck", "UserCog", "UserX", "IdCard", "Fingerprint", "Boxes",
  "Box", "Container", "Database", "DatabaseZap", "DatabaseBackup", "Table", "Table2", "Sheet", "FolderOpen", "Folder",
  "FolderGit2", "File", "FileText", "FileCode", "FileJson", "FileLock", "FileSearch", "FileSpreadsheet", "GitBranch", "GitPullRequest",
  "GitCommitHorizontal", "GitMerge", "GitFork", "CircleDot", "Play", "Square", "Pause", "Power", "PowerOff", "RotateCw",
  "RefreshCw", "Trash2", "Settings", "Settings2", "SlidersHorizontal", "Bell", "Search", "Terminal", "SquareTerminal", "Cloud",
  "CloudCog", "CloudUpload", "Cpu", "MemoryStick", "Activity", "ChartColumn", "ChartBar", "ChartLine", "ChartPie", "Gauge",
  "TrendingUp", "Wallet", "Coins", "CreditCard", "Receipt", "Tag", "Tags", "ClipboardCheck", "ClipboardList", "ListChecks",
  "ListTodo", "ListFilter", "Workflow", "Zap", "Bot", "MessageSquare", "MessagesSquare", "Sparkles", "Brain", "Eye",
  "EyeOff", "Scale", "Gavel", "ScrollText", "Smartphone", "Laptop", "Mail", "Inbox", "Send", "Calendar",
  "Clock", "Timer", "Package", "Layers", "Rocket", "Wrench", "Hammer", "TriangleAlert", "CircleCheck", "CircleX",
  "Info", "Link", "ExternalLink", "Download", "Upload", "Copy", "Pencil", "SquarePen", "Save", "Filter",
  "Star", "BookOpen", "Library", "Notebook", "Building2", "Briefcase", "Code", "CodeXml", "Braces", "Webhook",
  "Plug", "Cable", "Router", "Radar", "Siren", "Bug", "Flag", "Archive", "History", "Image",
  "ScanText", "ScanEye", "Mic", "Languages", "SquareKanban", "Milestone", "Megaphone", "Lightbulb", "Target", "Handshake",
  "Waypoints", "Route", "Split", "Merge", "Ticket", "Headset", "AppWindow", "Blocks", "Puzzle", "Wand2",
  "BadgeCheck", "CircleUser", "Landmark", "Share2", "AtSign", "Hash",
] as const;

export type PortalIconName = (typeof PORTAL_ICON_NAMES)[number];
