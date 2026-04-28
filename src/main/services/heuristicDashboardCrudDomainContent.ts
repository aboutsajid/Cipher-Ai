export type HeuristicDomainFocus =
  | "operations"
  | "crm"
  | "inventory"
  | "scheduling"
  | "finance"
  | "admin"
  | "generic";

export interface DashboardDomainContent {
  sidebarEyebrow: string;
  headerEyebrow: string;
  headerTitle: string;
  headerCopy: string;
  buttonLabel: string;
  chartTitle: string;
  chartRange: string;
  activityTitle: string;
  activityBadge: string;
  teamTitle: string;
  teamBadge: string;
  signalTitle: string;
  signalBadge: string;
  signalCopy: string;
  filterLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  dealsTitle: string;
  dealsBadge: string;
  dealsSummary: string;
  nav: string[];
  regions: string[];
  metrics: Array<{ label: string; value: string; change: string; tone: "up" | "down" }>;
  activities: string[];
  team: Array<{ name: string; role: string; status: string }>;
  deals: Array<{ name: string; region: string; stage: string; value: string }>;
  chartHeights: string[];
  staticLede: string;
  staticButtonLabel: string;
  staticTrendTitle: string;
  staticTrendBadge: string;
  staticActivityTitle: string;
  staticActivityBadge: string;
  staticStats: Array<{ label: string; value: string | number; delta: string }>;
  staticTrend: number[];
  staticActivity: string[];
}

export interface CrudDomainContent {
  eyebrow: string;
  lede: string;
  singularLabel: string;
  pluralLabel: string;
  nameLabel: string;
  categoryLabel: string;
  ownerLabel: string;
  searchLabel: string;
  namePlaceholder: string;
  categoryPlaceholder: string;
  ownerPlaceholder: string;
  initialRecords: Array<{ id: string; name: string; category: string; owner: string; status: "Active" | "Review" | "Archived" }>;
}

export function buildDashboardDomainContentForFocus(domainFocus: HeuristicDomainFocus): DashboardDomainContent {
  switch (domainFocus) {
    case "finance":
      return {
        sidebarEyebrow: "Finance cockpit",
        headerEyebrow: "Finance snapshot",
        headerTitle: "Cash, collections, and burn at a glance.",
        headerCopy: "Track revenue health, overdue invoices, and budget drift without flipping between spreadsheets.",
        buttonLabel: "Export forecast",
        chartTitle: "Collections trend",
        chartRange: "Last 6 weeks",
        activityTitle: "Recent finance activity",
        activityBadge: "Ledger sync",
        teamTitle: "Finance owners",
        teamBadge: "This week",
        signalTitle: "Financial signal",
        signalBadge: "Top movement",
        signalCopy: "Collections improved after the latest invoice reminder run, while discretionary spend stayed inside the monthly target.",
        filterLabel: "Region filter",
        searchLabel: "Find a deal",
        searchPlaceholder: "Search account, stage, or region",
        dealsTitle: "Recent deals",
        dealsBadge: "7-day view",
        dealsSummary: "The latest wins skew toward EMEA renewals, while North America still carries the largest open enterprise expansion.",
        nav: ["Overview", "Collections", "Activity", "Owners"],
        regions: ["All regions", "North America", "EMEA", "APAC"],
        metrics: [
          { label: "Revenue", value: "$428k", change: "+8.2%", tone: "up" },
          { label: "Overdue invoices", value: "19", change: "-5", tone: "up" },
          { label: "Budget variance", value: "2.1%", change: "-0.6%", tone: "up" }
        ],
        activities: [
          "Collections team cleared six overdue accounts before noon.",
          "The budget review flagged one campaign above forecasted spend.",
          "Finance approved the updated vendor payment run.",
          "Quarter-close checklist is ready for final sign-off."
        ],
        team: [
          { name: "Aisha", role: "Controller", status: "On track" },
          { name: "Mina", role: "Collections lead", status: "Following up" },
          { name: "Zayd", role: "FP&A", status: "Forecasting" }
        ],
        deals: [
          { name: "Northstar Renewal", region: "EMEA", stage: "Verbal commit", value: "$86k" },
          { name: "Helio Expansion", region: "North America", stage: "Procurement", value: "$54k" },
          { name: "Atlas Rollout", region: "APAC", stage: "Forecast", value: "$41k" },
          { name: "Luma Recovery", region: "EMEA", stage: "Collections", value: "$19k" }
        ],
        chartHeights: ["48%", "58%", "68%", "64%", "80%", "72%"],
        staticLede: "A responsive static finance dashboard with cash, collections, and budget visibility.",
        staticButtonLabel: "Refresh finance view",
        staticTrendTitle: "Collections trend",
        staticTrendBadge: "Stable",
        staticActivityTitle: "Finance activity",
        staticActivityBadge: "Live",
        staticStats: [
          { label: "Revenue run-rate", value: "$428k", delta: "+8%" },
          { label: "Invoices due", value: 19, delta: "-5" },
          { label: "Budget variance", value: "2.1%", delta: "-0.6%" },
          { label: "Payment runs", value: 3, delta: "+1" }
        ],
        staticTrend: [60, 74, 69, 88, 92, 86],
        staticActivity: [
          "Collections sent the second reminder batch to overdue accounts.",
          "AP scheduled the next vendor payment release for tomorrow morning.",
          "Finance leadership approved the revised operating budget.",
          "Month-close exceptions dropped below the escalation threshold."
        ]
      };
    case "operations":
      return {
        sidebarEyebrow: "Operations hub",
        headerEyebrow: "Ops snapshot",
        headerTitle: "Clarity for the queue, fast.",
        headerCopy: "Scan incidents, SLA risk, and escalation load without digging through tabs or chat threads.",
        buttonLabel: "Export handoff",
        chartTitle: "Incident load",
        chartRange: "Last 24 hours",
        activityTitle: "Recent incidents",
        activityBadge: "Live feed",
        teamTitle: "Shift owners",
        teamBadge: "Current rotation",
        signalTitle: "Top escalation",
        signalBadge: "Right now",
        signalCopy: "Escalations dropped after the latest queue rebalance, but one regional incident still needs senior review before handoff.",
        filterLabel: "Region filter",
        searchLabel: "Search queue",
        searchPlaceholder: "Search incident, queue, or region",
        dealsTitle: "Priority queue",
        dealsBadge: "Needs review",
        dealsSummary: "Use the queue filters to narrow regional load before the next dispatch handoff.",
        nav: ["Overview", "Queue", "Activity", "Shift"],
        regions: ["All regions", "North", "Central", "South"],
        metrics: [
          { label: "Open incidents", value: "14", change: "-3", tone: "up" },
          { label: "SLA at risk", value: "4", change: "-1", tone: "up" },
          { label: "Resolved today", value: "29", change: "+7", tone: "up" }
        ],
        activities: [
          "Priority queue dropped below the morning escalation threshold.",
          "Incident INC-482 moved to vendor investigation with notes attached.",
          "The overnight shift cleared the oldest backlog batch.",
          "Customer comms went out for the payment gateway disruption."
        ],
        team: [
          { name: "Aisha", role: "Ops lead", status: "Coordinating" },
          { name: "Mina", role: "Service desk", status: "Reviewing" },
          { name: "Zayd", role: "Escalation manager", status: "Escalated" }
        ],
        deals: [
          { name: "Gateway incident", region: "North", stage: "Escalated", value: "P1" },
          { name: "Dispatch backlog", region: "Central", stage: "Queued", value: "18 jobs" },
          { name: "Vendor outage", region: "South", stage: "Investigating", value: "P2" },
          { name: "SLA breach watch", region: "North", stage: "Monitoring", value: "4 at risk" }
        ],
        chartHeights: ["42%", "56%", "74%", "61%", "88%", "70%"],
        staticLede: "A responsive static dashboard with incidents, service health, and a compact operational summary.",
        staticButtonLabel: "Refresh queue",
        staticTrendTitle: "Incident trend",
        staticTrendBadge: "Stable",
        staticActivityTitle: "Operational activity",
        staticActivityBadge: "Live",
        staticStats: [
          { label: "Open incidents", value: 14, delta: "-3" },
          { label: "Escalations", value: 5, delta: "-1" },
          { label: "SLA risk", value: "3.2%", delta: "-0.4%" },
          { label: "Resolved today", value: 29, delta: "+7" }
        ],
        staticTrend: [58, 78, 66, 92, 81, 108],
        staticActivity: [
          "Ops flagged two stale incidents and resolved one automatically.",
          "Dispatch handed a regional outage to the network team.",
          "The service desk cleared the overnight inbox triage queue.",
          "The latest smoke run passed before the release handoff."
        ]
      };
    default:
      return {
        sidebarEyebrow: "Operations hub",
        headerEyebrow: "Operations snapshot",
        headerTitle: "Clarity for the team, fast.",
        headerCopy: "One place to scan performance, momentum, and the next actions without digging through tabs.",
        buttonLabel: "Export report",
        chartTitle: "Pipeline",
        chartRange: "Last 30 days",
        activityTitle: "Recent activity",
        activityBadge: "Live feed",
        teamTitle: "Team focus",
        teamBadge: "This week",
        signalTitle: "What changed",
        signalBadge: "Top signal",
        signalCopy: "Conversion improved after the latest onboarding update, while support load stayed flat. The current setup is stable enough to scale spend.",
        filterLabel: "Region filter",
        searchLabel: "Search pipeline",
        searchPlaceholder: "Search account, owner, or stage",
        dealsTitle: "Recent deals",
        dealsBadge: "Fresh activity",
        dealsSummary: "The recent pipeline view keeps open expansion, renewals, and at-risk deals in one scan-friendly list.",
        nav: ["Overview", "Pipeline", "Activity", "Team"],
        regions: ["All regions", "North America", "EMEA", "APAC"],
        metrics: [
          { label: "Revenue", value: "$128k", change: "+12.4%", tone: "up" },
          { label: "Active users", value: "8,421", change: "+6.8%", tone: "up" },
          { label: "Conversion", value: "4.7%", change: "+0.9%", tone: "up" }
        ],
        activities: [
          "Enterprise lead upgraded to annual plan",
          "Marketing campaign reached target CPA",
          "Customer success cleared 18 open tickets",
          "New release health checks passed"
        ],
        team: [
          { name: "Aisha", role: "Ops lead", status: "On track" },
          { name: "Mina", role: "Customer success", status: "Reviewing" },
          { name: "Zayd", role: "Growth", status: "Shipping" }
        ],
        deals: [
          { name: "Bluebird expansion", region: "North America", stage: "Proposal", value: "$38k" },
          { name: "Meridian renewal", region: "EMEA", stage: "Commit", value: "$22k" },
          { name: "Sunline pilot", region: "APAC", stage: "Discovery", value: "$16k" },
          { name: "Oakridge upsell", region: "North America", stage: "Negotiation", value: "$29k" }
        ],
        chartHeights: ["42%", "56%", "74%", "61%", "88%", "70%"],
        staticLede: "A responsive static dashboard with metrics, activity, and a compact operational summary.",
        staticButtonLabel: "Refresh metrics",
        staticTrendTitle: "Pipeline trend",
        staticTrendBadge: "Stable",
        staticActivityTitle: "Recent activity",
        staticActivityBadge: "Live",
        staticStats: [
          { label: "Qualified leads", value: 128, delta: "+14%" },
          { label: "Active projects", value: 18, delta: "+3" },
          { label: "Conversion", value: "6.4%", delta: "+0.8%" },
          { label: "Open issues", value: 7, delta: "-2" }
        ],
        staticTrend: [58, 78, 66, 92, 81, 108],
        staticActivity: [
          "Design review cleared for the next release candidate.",
          "Ops flagged two stale incidents and resolved one automatically.",
          "Product accepted the new onboarding sequence.",
          "Support queue dropped below the daily target."
        ]
      };
  }
}

export function buildCrudDomainContentForFocus(domainFocus: HeuristicDomainFocus): CrudDomainContent {
  switch (domainFocus) {
    case "crm":
      return {
        eyebrow: "CRM workspace",
        lede: "Track accounts, pipeline stage, and ownership in one compact team workspace.",
        singularLabel: "account",
        pluralLabel: "accounts",
        nameLabel: "Account name",
        categoryLabel: "Pipeline stage",
        ownerLabel: "Account owner",
        searchLabel: "Search accounts",
        namePlaceholder: "Apex Holdings",
        categoryPlaceholder: "Discovery, proposal, renewal...",
        ownerPlaceholder: "Who owns the account?",
        initialRecords: [
          { id: "1", name: "Northwind Holdings", category: "Proposal", owner: "Aisha", status: "Active" },
          { id: "2", name: "Blue Mesa Retail", category: "Renewal", owner: "Zayd", status: "Review" },
          { id: "3", name: "Harbor Logistics", category: "Closed lost", owner: "Mina", status: "Archived" }
        ]
      };
    case "inventory":
      return {
        eyebrow: "Inventory workspace",
        lede: "Manage stock items, supplier ownership, and review queues without leaving the list view.",
        singularLabel: "item",
        pluralLabel: "items",
        nameLabel: "Item name",
        categoryLabel: "SKU or category",
        ownerLabel: "Supplier or owner",
        searchLabel: "Search items",
        namePlaceholder: "Warehouse scanner",
        categoryPlaceholder: "Peripheral, shelf B2, SKU-4421...",
        ownerPlaceholder: "Supplier or stock owner",
        initialRecords: [
          { id: "1", name: "Portable scanner", category: "SKU-4421", owner: "Northwind Supply", status: "Active" },
          { id: "2", name: "Packing labels", category: "Consumables", owner: "Mina", status: "Review" },
          { id: "3", name: "Returns bin", category: "Backroom", owner: "Zayd", status: "Archived" }
        ]
      };
    default:
      return {
        eyebrow: "Cipher Workspace",
        lede: "A focused CRUD workspace for managing records, reviewing ownership, and keeping the list organized.",
        singularLabel: "record",
        pluralLabel: "records",
        nameLabel: "Name",
        categoryLabel: "Category",
        ownerLabel: "Owner",
        searchLabel: "Search",
        namePlaceholder: "Project, client, asset...",
        categoryPlaceholder: "Sales, Ops, Finance...",
        ownerPlaceholder: "Who is responsible?",
        initialRecords: [
          { id: "1", name: "Northwind Pipeline", category: "Sales", owner: "Aisha", status: "Active" },
          { id: "2", name: "Q2 Hiring Plan", category: "People", owner: "Zayd", status: "Review" },
          { id: "3", name: "Support Audit", category: "Operations", owner: "Mina", status: "Archived" }
        ]
      };
  }
}
