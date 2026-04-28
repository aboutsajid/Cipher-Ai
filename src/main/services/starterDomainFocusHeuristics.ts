import type { AgentArtifactType } from "../../shared/types";

export type BuilderMode = "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
export type WorkspaceKind = "static" | "react" | "generic";

export type StarterProfile =
  | "react-web-app"
  | "react-dashboard"
  | "react-crud"
  | "react-kanban"
  | "react-notes"
  | "static-marketing"
  | "electron-desktop"
  | "node-api-service"
  | "node-cli"
  | "node-library"
  | "workspace-change";

export type DomainFocus =
  | "operations"
  | "crm"
  | "inventory"
  | "scheduling"
  | "finance"
  | "admin"
  | "generic";

export function inferStarterProfile(
  promptArtifact: AgentArtifactType | null,
  builderMode: BuilderMode,
  workspaceKind: WorkspaceKind
): StarterProfile {
  if (promptArtifact === "desktop-app") return "electron-desktop";
  if (promptArtifact === "api-service") return "node-api-service";
  if (promptArtifact === "script-tool") return "node-cli";
  if (promptArtifact === "library") return "node-library";
  if (builderMode === "dashboard") return "react-dashboard";
  if (builderMode === "crud") return "react-crud";
  if (builderMode === "kanban") return "react-kanban";
  if (builderMode === "notes") return "react-notes";
  if (builderMode === "landing" || workspaceKind === "static") return "static-marketing";
  if (workspaceKind === "react") return "react-web-app";
  return "workspace-change";
}

export function describeStarterProfile(profile: StarterProfile): string {
  switch (profile) {
    case "react-dashboard":
      return "React dashboard starter";
    case "react-crud":
      return "React CRUD starter";
    case "react-kanban":
      return "React kanban starter";
    case "react-notes":
      return "React notes starter";
    case "static-marketing":
      return "Static marketing starter";
    case "electron-desktop":
      return "Electron desktop starter";
    case "node-api-service":
      return "Node API starter";
    case "node-cli":
      return "Node CLI starter";
    case "node-library":
      return "Node library starter";
    case "react-web-app":
      return "React app starter";
    default:
      return "Workspace change plan";
  }
}

export function inferDomainFocus(
  prompt: string,
  starterProfile: StarterProfile,
  promptArtifact: AgentArtifactType | null
): DomainFocus {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (!normalized) return "generic";
  if (/\b(crm|lead|customer|client|sales pipeline|opportunit(?:y|ies)|account manager)\b/.test(normalized)) {
    return "crm";
  }
  if (/\b(inventory|stock|warehouse|sku|purchase order|supplier|suppliers|catalog)\b/.test(normalized)) {
    return "inventory";
  }
  if (/\b(schedule|scheduling|calendar|appointment|booking|roster|technician visit|dispatch)\b/.test(normalized)) {
    return "scheduling";
  }
  if (/\b(finance|financial|revenue|expense|budget|cash flow|invoice|billing|payments?)\b/.test(normalized)) {
    return "finance";
  }
  if (/\b(operations|incident|escalation|wallboard|service desk|support queue|sla|uptime)\b/.test(normalized)) {
    return "operations";
  }
  if (/\b(admin|internal tool|back office|moderation|approval|permissions?)\b/.test(normalized)) {
    return "admin";
  }
  if (starterProfile === "node-api-service" && /\b(ticket|support|queue)\b/.test(normalized)) {
    return "operations";
  }
  if (promptArtifact === "desktop-app" && /\b(shop|store|retail)\b/.test(normalized)) {
    return "inventory";
  }
  return "generic";
}

export function describeDomainFocus(domainFocus: DomainFocus): string {
  switch (domainFocus) {
    case "operations":
      return "operations";
    case "crm":
      return "CRM";
    case "inventory":
      return "inventory";
    case "scheduling":
      return "scheduling";
    case "finance":
      return "finance";
    case "admin":
      return "internal admin";
    default:
      return "general";
  }
}
