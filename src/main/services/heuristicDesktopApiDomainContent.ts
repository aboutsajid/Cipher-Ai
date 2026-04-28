export type HeuristicDomainFocus =
  | "operations"
  | "crm"
  | "inventory"
  | "scheduling"
  | "finance"
  | "admin"
  | "generic";

export interface DesktopDomainContent {
  kicker: string;
  copy: string;
  modeValue: string;
  modeCopy: string;
  checklistTitle: string;
  checklistItems: string[];
  actionTitle: string;
  shortcuts: string[];
  activityTitle: string;
  activity: Array<{ label: string; detail: string }>;
}

export interface ApiEntityContent {
  singular: string;
  plural: string;
  collectionPath: string;
  primaryField: string;
  defaultPrimaryValue: string;
}

export function buildDesktopDomainContentForFocus(domainFocus: HeuristicDomainFocus): DesktopDomainContent {
  switch (domainFocus) {
    case "inventory":
      return {
        kicker: "Desktop inventory shell",
        copy: "A local-first workspace for stock reviews, receiving tasks, and store-floor inventory coordination.",
        modeValue: "Ready for item and supplier workflows",
        modeCopy: "Use this shell for purchase orders, stock counts, and replenishment views backed by local data or IPC.",
        checklistTitle: "Launch checklist",
        checklistItems: [
          "Map receiving, cycle-count, and reorder workflows",
          "Wire inventory persistence or barcode-connected data",
          "Keep packaging healthy for store-floor deployment"
        ],
        actionTitle: "Quick actions",
        shortcuts: ["Open stock board", "Review suppliers", "Prepare reorder"],
        activityTitle: "Recent activity",
        activity: [
          { label: "Receiving", detail: "12 inbound line items are ready for verification" },
          { label: "Shelf counts", detail: "Backroom count variance dropped below 2 percent" },
          { label: "Reorder prep", detail: "Three SKUs crossed the replenishment threshold" }
        ]
      };
    case "scheduling":
      return {
        kicker: "Desktop scheduling shell",
        copy: "A focused desktop shell for dispatch boards, technician appointments, and day-of schedule adjustments.",
        modeValue: "Ready for dispatch and booking flows",
        modeCopy: "Replace this shell with route planning, appointment details, and schedule conflict handling.",
        checklistTitle: "Launch checklist",
        checklistItems: [
          "Map booking, dispatch, and reschedule flows",
          "Wire appointments to local persistence or synced APIs",
          "Keep packaging healthy for dispatcher workstations"
        ],
        actionTitle: "Quick actions",
        shortcuts: ["Open dispatch board", "Review bookings", "Resolve conflicts"],
        activityTitle: "Recent activity",
        activity: [
          { label: "Dispatch", detail: "Seven technician visits are ready for route balancing" },
          { label: "Conflicts", detail: "Two overlapping bookings were flagged for reassignment" },
          { label: "Field updates", detail: "Morning appointment confirmations synced locally" }
        ]
      };
    default:
      return {
        kicker: "Desktop starter app",
        copy: "A focused local-first shell for operational workflows, offline review, and release-ready task handling.",
        modeValue: "Ready for domain-specific screens",
        modeCopy: "Replace this starter shell with the real product workflow, navigation, and data bindings.",
        checklistTitle: "Launch checklist",
        checklistItems: [
          "Map the main desktop workflow",
          "Wire real persistence or IPC data sources",
          "Keep packaging scripts healthy for Windows delivery"
        ],
        actionTitle: "Quick actions",
        shortcuts: ["Open workspace", "Review logs", "Prepare release"],
        activityTitle: "Recent activity",
        activity: [
          { label: "Inbox triage", detail: "7 local tasks ready for review" },
          { label: "Build status", detail: "Latest smoke run passed with preview ready" },
          { label: "Release prep", detail: "Installer, notes, and changelog still open" }
        ]
      };
  }
}

export function buildApiEntityForDomainFocus(domainFocus: HeuristicDomainFocus): ApiEntityContent {
  switch (domainFocus) {
    case "finance":
      return {
        singular: "invoice",
        plural: "invoices",
        collectionPath: "/invoices",
        primaryField: "customer",
        defaultPrimaryValue: "Acme Corp"
      };
    case "operations":
      return {
        singular: "ticket",
        plural: "tickets",
        collectionPath: "/tickets",
        primaryField: "subject",
        defaultPrimaryValue: "Login issue"
      };
    case "scheduling":
      return {
        singular: "booking",
        plural: "bookings",
        collectionPath: "/bookings",
        primaryField: "guest",
        defaultPrimaryValue: "Jordan Lee"
      };
    case "inventory":
      return {
        singular: "item",
        plural: "items",
        collectionPath: "/items",
        primaryField: "title",
        defaultPrimaryValue: "Portable scanner"
      };
    default:
      return {
        singular: "record",
        plural: "records",
        collectionPath: "/records",
        primaryField: "title",
        defaultPrimaryValue: "Sample item"
      };
  }
}
