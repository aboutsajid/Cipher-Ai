import type { AgentSoakScenario } from "./agentSoak";
import { normalizeAgentSoakScenarios } from "./agentSoak";

const RAW_AGENT_SOAK_SCENARIOS: AgentSoakScenario[] = [
  {
    id: "landing.fintech-hero",
    category: "static-web",
    title: "Fintech marketing landing page",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:landing.fintech-hero] Build a polished static landing page for a fintech startup with a hero section, trust indicators, pricing cards, and a contact CTA."
  },
  {
    id: "landing.event-countdown",
    category: "static-web",
    title: "Event launch countdown page",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:landing.event-countdown] Create a launch countdown microsite for a developer conference with schedule highlights, speakers, and an email signup CTA."
  },
  {
    id: "landing.saas-pricing",
    category: "static-web",
    title: "SaaS pricing launch page",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:landing.saas-pricing] Build a static SaaS pricing page with tier cards, feature comparison highlights, customer quotes, and a start-trial CTA."
  },
  {
    id: "landing.restaurant-showcase",
    category: "static-web",
    title: "Restaurant showcase landing page",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:landing.restaurant-showcase] Create a polished restaurant landing page with hero imagery, menu highlights, reservation CTA, and customer testimonials."
  },
  {
    id: "landing.real-estate-launch",
    category: "static-web",
    title: "Real estate launch landing page",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:landing.real-estate-launch] Build a polished real estate launch landing page with featured listings, neighborhood highlights, agent trust signals, and a book-a-tour CTA."
  },
  {
    id: "notes.daily-journal",
    category: "interactive-web",
    title: "Daily journal notes app",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:notes.daily-journal] Make a notes app for daily journal entries where I can add, edit, and save entries with visible saved state in the UI."
  },
  {
    id: "crud.inventory-tracker",
    category: "interactive-web",
    title: "Inventory CRUD tracker",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:crud.inventory-tracker] Build an inventory tracker app where I can create, update, and remove products with quantity and status fields."
  },
  {
    id: "crud.shift-planner",
    category: "interactive-web",
    title: "Shift planner CRUD app",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:crud.shift-planner] Create a staff shift planner where I can add, edit, and remove shifts with employee, day, and status fields, and see the saved schedule in the UI."
  },
  {
    id: "crud.feedback-board",
    category: "interactive-web",
    title: "Feedback board app",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:crud.feedback-board] Build a feedback board app where I can add, edit, and remove product feedback cards with status, owner, and priority fields."
  },
  {
    id: "crud.issue-tracker",
    category: "interactive-web",
    title: "Issue tracker app",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:crud.issue-tracker] Build an issue tracker app where I can create, update, and remove issues with severity, assignee, and current status fields."
  },
  {
    id: "react.analytics-dashboard",
    category: "react-web",
    title: "Analytics operations dashboard",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:react.analytics-dashboard] Create a responsive analytics dashboard with KPI cards, a recent activity feed, and filter controls for timeframe and team."
  },
  {
    id: "react.kanban-board",
    category: "react-web",
    title: "Team kanban board",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:react.kanban-board] Build a kanban task board with todo, in progress, and done columns plus add-task input and status changes."
  },
  {
    id: "react.support-ops-dashboard",
    category: "react-web",
    title: "Support operations dashboard",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:react.support-ops-dashboard] Create a React support operations dashboard with KPI cards, ticket status filters, and a recent conversations panel."
  },
  {
    id: "react.project-timeline",
    category: "react-web",
    title: "Project timeline dashboard",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:react.project-timeline] Build a React project timeline dashboard with milestone cards, owner filters, progress summaries, and a recent updates panel."
  },
  {
    id: "react.revenue-command-center",
    category: "react-web",
    title: "Revenue command center dashboard",
    expectedArtifactType: "web-app",
    prompt: "[SOAK:react.revenue-command-center] Create a React revenue dashboard with KPI cards, pipeline stage summaries, region filters, and a recent deals panel."
  },
  {
    id: "desktop.voice-notes",
    category: "desktop-app",
    title: "Voice notes desktop shell",
    expectedArtifactType: "desktop-app",
    prompt: "[SOAK:desktop.voice-notes] Create a desktop voice-notes workspace with a sidebar, recording list, and a clear start recording action."
  },
  {
    id: "desktop.snippet-manager",
    category: "desktop-app",
    title: "Snippet manager desktop shell",
    expectedArtifactType: "desktop-app",
    prompt: "[SOAK:desktop.snippet-manager] Create a desktop snippet manager workspace with a sidebar, snippet list, tag filters, and a clear create-snippet action."
  },
  {
    id: "desktop.incident-desk",
    category: "desktop-app",
    title: "Incident desk desktop shell",
    expectedArtifactType: "desktop-app",
    prompt: "[SOAK:desktop.incident-desk] Create a desktop incident desk workspace with a sidebar, incident queue, severity filters, and a clear create-incident action."
  },
  {
    id: "api.expense-service",
    category: "api-service",
    title: "Expense approval API",
    expectedArtifactType: "api-service",
    prompt: "[SOAK:api.expense-service] Build a small API service for expense approvals with endpoints to list requests, create a request, and approve or reject one."
  },
  {
    id: "api.booking-service",
    category: "api-service",
    title: "Booking status API",
    expectedArtifactType: "api-service",
    prompt: "[SOAK:api.booking-service] Build a small API service for room bookings with endpoints to list bookings, create a booking, and cancel or confirm one."
  },
  {
    id: "api.ticket-service",
    category: "api-service",
    title: "Support ticket API",
    expectedArtifactType: "api-service",
    prompt: "[SOAK:api.ticket-service] Build a small API service for support tickets with endpoints to list tickets, create a ticket, assign an owner, and close a ticket."
  },
  {
    id: "api.invoice-service",
    category: "api-service",
    title: "Invoice workflow API",
    expectedArtifactType: "api-service",
    prompt: "[SOAK:api.invoice-service] Build a small API service for invoice workflows with endpoints to list invoices, create an invoice, approve one, and mark one as paid."
  },
  {
    id: "tool.markdown-cli",
    category: "developer-tool",
    title: "Markdown summary CLI",
    expectedArtifactType: "script-tool",
    prompt: "[SOAK:tool.markdown-cli] Create a command-line tool that reads a markdown file and prints a compact section summary to the terminal."
  },
  {
    id: "tool.csv-report-cli",
    category: "developer-tool",
    title: "CSV report CLI",
    expectedArtifactType: "script-tool",
    prompt: "[SOAK:tool.csv-report-cli] Create a command-line tool that reads a CSV file and prints a compact terminal report with row counts and column summaries."
  },
  {
    id: "tool.log-summary-cli",
    category: "developer-tool",
    title: "Log summary CLI",
    expectedArtifactType: "script-tool",
    prompt: "[SOAK:tool.log-summary-cli] Create a command-line tool that reads a log file and prints a compact terminal summary with level counts, top repeated messages, and a time range."
  },
  {
    id: "library.date-utils",
    category: "library",
    title: "Date utility package",
    expectedArtifactType: "library",
    prompt: "[SOAK:library.date-utils] Create a small reusable TypeScript date utility library with formatting, range labeling, and relative-time helpers."
  },
  {
    id: "library.string-format",
    category: "library",
    title: "String formatting utility package",
    expectedArtifactType: "library",
    prompt: "[SOAK:library.string-format] Create a small reusable TypeScript string formatting library with slugify, title-case, truncation, and token interpolation helpers."
  },
  {
    id: "library.money-format",
    category: "library",
    title: "Money formatting utility package",
    expectedArtifactType: "library",
    prompt: "[SOAK:library.money-format] Create a small reusable TypeScript money formatting library with currency formatting, compact totals, signed deltas, and percentage helpers."
  }
];

export const AGENT_SOAK_SCENARIOS = normalizeAgentSoakScenarios(RAW_AGENT_SOAK_SCENARIOS);
