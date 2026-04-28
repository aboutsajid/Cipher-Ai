export function inferArtifactTypeFromPrompt(
  normalizedPrompt: string
): "desktop-app" | "web-app" | "api-service" | "library" | "script-tool" | null {
  if (!normalizedPrompt) return null;
  if (looksLikeDesktopPrompt(normalizedPrompt)) return "desktop-app";
  if (looksLikeCrudAppPrompt(normalizedPrompt)) return "web-app";
  if (/\b(api|backend|server|endpoint|rest|graphql|express|fastify|hono|nest)\b/.test(normalizedPrompt)) return "api-service";
  if (/\b(library|sdk|package|module)\b/.test(normalizedPrompt)) return "library";
  if (/\b(script|cli|command line|automation|bot|cron|utility|tool)\b/.test(normalizedPrompt)) return "script-tool";
  if (/\b(web app|website|landing page|pricing page|frontend|dashboard|marketing site|marketing page|react app|vite app|kanban|task board|microsite|showcase page)\b/.test(normalizedPrompt)) return "web-app";
  return null;
}

export function looksLikeDesktopPrompt(normalizedPrompt: string): boolean {
  if (/\b(electron|tauri)\b/.test(normalizedPrompt)) return true;
  if (/\b(desktop app|desktop shell|desktop tool|desktop workspace|desktop client|desktop manager|snippet desk)\b/.test(normalizedPrompt)) {
    return true;
  }
  if (/\b(standalone app|standalone application|standalone desktop app|native app|native desktop app)\b/.test(normalizedPrompt)) {
    return true;
  }
  if (
    /\bwindows\b/.test(normalizedPrompt)
    && /\b(app|application|software|program|tool|utility|client|workspace|calculator|editor|manager|tracker)\b/.test(normalizedPrompt)
    && !/\b(website|site|landing page|pricing page|homepage|microsite|marketing page|showcase page|web app|frontend|browser)\b/.test(normalizedPrompt)
  ) {
    return true;
  }
  if (
    /\b(pc|computer|laptop)\b/.test(normalizedPrompt)
    && /\b(app|application|software|program|tool|utility|calculator|editor|manager|tracker)\b/.test(normalizedPrompt)
    && /\b(standalone|desktop|native|installed|installable)\b/.test(normalizedPrompt)
    && !/\b(website|site|landing page|pricing page|homepage|microsite|marketing page|showcase page|web app|frontend|browser)\b/.test(normalizedPrompt)
  ) {
    return true;
  }
  if (/\bdesktop\b/.test(normalizedPrompt) && !/\b(website|site|landing page|pricing page|homepage|microsite|marketing page|showcase page|web app|frontend|browser)\b/.test(normalizedPrompt)) {
    return true;
  }
  return false;
}

export function looksLikeCrudAppPrompt(normalizedPrompt: string): boolean {
  if (!normalizedPrompt) return false;
  const mentionsDashboard = /\b(dashboard|admin panel|analytics|wallboard|kpi|incident|escalation)\b/.test(normalizedPrompt);
  const reminderOnlyFollowups = /\bfollow-?up reminders?\b/.test(normalizedPrompt)
    && !/\b(add|create|edit|update|saved list|tracker|status|next contact date|owner assignment|mark (?:one )?(?:paid|packed|shipped|approved|resolved))\b/.test(normalizedPrompt);
  if (mentionsDashboard && reminderOnlyFollowups) {
    return false;
  }

  const directCrudSignals = [
    "crud",
    "inventory app",
    "contacts app",
    "admin tool",
    "admin console",
    "record manager",
    "tracker",
    "follow-up tracker",
    "follow up tracker",
    "customer follow-up",
    "customer follow up",
    "lead tracker",
    "outreach",
    "field service",
    "service visits",
    "visit tracker",
    "dispatch follow",
    "supplier dispute",
    "supplier disputes"
  ];
  if (directCrudSignals.some((term) => normalizedPrompt.includes(term))) {
    return true;
  }

  const mentionsCrudWorkspace = /\b(internal tool|admin console|admin workspace|operations workspace)\b/.test(normalizedPrompt);
  const mentionsStatefulCollection = /\b(table|issue list|main issue list|status|due date|due dates|resolution status|mark (?:one )?(?:paid|packed|shipped|approved|resolved)|vendor|vendors|payment status|visit|visits|technician|saved list|saved dispute list|owner assignment|assignment|dispute|disputes|team)\b/.test(normalizedPrompt);
  return mentionsCrudWorkspace && mentionsStatefulCollection;
}
