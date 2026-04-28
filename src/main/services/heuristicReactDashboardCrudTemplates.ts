interface DashboardTemplateContent {
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
}

interface CrudTemplateContent {
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

export function buildDashboardTsxTemplate(title: string, content: DashboardTemplateContent): string {
  return `import { useState } from "react";
import "./App.css";

const metrics = ${JSON.stringify(content.metrics, null, 2)} as const;

const activities = ${JSON.stringify(content.activities, null, 2)};

const team = ${JSON.stringify(content.team, null, 2)} as const;

const deals = ${JSON.stringify(content.deals, null, 2)} as const;

const regions = ${JSON.stringify(content.regions, null, 2)} as const;

const chartHeights = ${JSON.stringify(content.chartHeights)};

function App() {
  const [regionFilter, setRegionFilter] = useState<string>(regions[0] ?? "All regions");
  const [query, setQuery] = useState("");
  const visibleDeals = deals.filter((deal) => {
    const matchesRegion = regionFilter === (regions[0] ?? "All regions") || deal.region === regionFilter;
    const needle = query.trim().toLowerCase();
    if (!needle) return matchesRegion;
    return matchesRegion && [deal.name, deal.region, deal.stage, deal.value].some((value) =>
      value.toLowerCase().includes(needle)
    );
  });

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <p className="eyebrow">${content.sidebarEyebrow}</p>
        <h1>${title}</h1>
        <nav>
          <a href="#overview">${content.nav[0] ?? "Overview"}</a>
          <a href="#pipeline">${content.nav[1] ?? "Pipeline"}</a>
          <a href="#activity">${content.nav[2] ?? "Activity"}</a>
          <a href="#team">${content.nav[3] ?? "Team"}</a>
        </nav>
      </aside>

      <section className="dashboard-main">
        <header id="overview" className="dashboard-header">
          <div>
            <p className="eyebrow">${content.headerEyebrow}</p>
            <h2>${content.headerTitle}</h2>
            <p>${content.headerCopy}</p>
          </div>
          <button type="button">${content.buttonLabel}</button>
        </header>

        <section className="filter-bar">
          <label className="filter-field">
            <span>${content.filterLabel}</span>
            <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
              {regions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>
          <label className="filter-field search-field">
            <span>${content.searchLabel}</span>
            <input
              type="search"
              value={query}
              placeholder="${content.searchPlaceholder}"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </section>

        <section className="metric-grid">
          {metrics.map((metric) => (
            <article key={metric.label} className="metric-card">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p className={metric.tone === "up" ? "metric-up" : "metric-down"}>{metric.change} vs last period</p>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article id="pipeline" className="panel chart-panel">
            <div className="panel-header">
              <h3>${content.chartTitle}</h3>
              <span>${content.chartRange}</span>
            </div>
            <div className="chart-bars">
              {chartHeights.map((height, index) => (
                <div key={index} style={{ height }}></div>
              ))}
            </div>
          </article>

          <article id="activity" className="panel activity-panel">
            <div className="panel-header">
              <h3>${content.activityTitle}</h3>
              <span>${content.activityBadge}</span>
            </div>
            <ul>
              {activities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="content-grid content-grid-secondary">
          <article id="team" className="panel team-panel">
            <div className="panel-header">
              <h3>${content.teamTitle}</h3>
              <span>${content.teamBadge}</span>
            </div>
            <div className="team-list">
              {team.map((person) => (
                <article key={person.name} className="team-row">
                  <div>
                    <strong>{person.name}</strong>
                    <p>{person.role}</p>
                  </div>
                  <span>{person.status}</span>
                </article>
              ))}
            </div>
          </article>

          <article className="panel deals-panel">
            <div className="panel-header">
              <h3>${content.dealsTitle}</h3>
              <span>${content.dealsBadge}</span>
            </div>
            <ul className="deals-list">
              {visibleDeals.length === 0 ? (
                <li className="deals-empty">No deals match the current filter.</li>
              ) : (
                visibleDeals.map((deal) => (
                  <li key={deal.name} className="deal-row">
                    <div>
                      <strong>{deal.name}</strong>
                      <p>{deal.region} Â· {deal.stage}</p>
                    </div>
                    <span>{deal.value}</span>
                  </li>
                ))
              )}
            </ul>
            <p className="signal-copy">${content.dealsSummary}</p>
          </article>
        </section>
      </section>
    </main>
  );
}

export default App;
`;
}

export function buildCrudAppTsxTemplate(
  title: string,
  content: CrudTemplateContent,
  pluralDisplayLabel: string
): string {
  return `import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type RecordItem = {
  id: string;
  name: string;
  category: string;
  owner: string;
  status: "Active" | "Review" | "Archived";
};

type RecordDraft = Omit<RecordItem, "id">;

const initialRecords: RecordItem[] = ${JSON.stringify(content.initialRecords, null, 2)};

const emptyDraft: RecordDraft = { name: "", category: "", owner: "", status: "Active" };

function App() {
  const [records, setRecords] = useState<RecordItem[]>(initialRecords);
  const [draft, setDraft] = useState<RecordDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      [record.name, record.category, record.owner, record.status].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [records, query]);

  const activeCount = records.filter((record) => record.status === "Active").length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = draft.name.trim();
    const nextCategory = draft.category.trim();
    const nextOwner = draft.owner.trim();
    if (!nextName || !nextCategory || !nextOwner) return;

    if (editingId) {
      setRecords((current) =>
        current.map((record) =>
          record.id === editingId
            ? { ...record, name: nextName, category: nextCategory, owner: nextOwner, status: draft.status }
            : record
        )
      );
    } else {
      setRecords((current) => [
        {
          id: crypto.randomUUID(),
          name: nextName,
          category: nextCategory,
          owner: nextOwner,
          status: draft.status
        },
        ...current
      ]);
    }

    setDraft(emptyDraft);
    setEditingId(null);
  };

  const handleEdit = (record: RecordItem) => {
    setDraft({
      name: record.name,
      category: record.category,
      owner: record.owner,
      status: record.status
    });
    setEditingId(record.id);
  };

  const handleDelete = (recordId: string) => {
    setRecords((current) => current.filter((record) => record.id !== recordId));
    if (editingId === recordId) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
  };

  return (
    <main className="crud-shell">
      <section className="crud-hero">
        <div>
          <p className="eyebrow">${content.eyebrow}</p>
          <h1>${title}</h1>
          <p className="lede">${content.lede}</p>
        </div>
        <div className="hero-stats">
          <article>
            <span>Total records</span>
            <strong>{records.length}</strong>
          </article>
          <article>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </article>
        </div>
      </section>

      <section className="crud-grid">
        <form className="editor-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <h2>{editingId ? "Edit ${content.singularLabel}" : "Create ${content.singularLabel}"}</h2>
              <span>{editingId ? "Update the selected item" : "Capture a new item quickly"}</span>
            </div>
            {editingId ? (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>

          <label>
            ${content.nameLabel}
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="${content.namePlaceholder}"
            />
          </label>

          <label>
            ${content.categoryLabel}
            <input
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              placeholder="${content.categoryPlaceholder}"
            />
          </label>

          <label>
            ${content.ownerLabel}
            <input
              value={draft.owner}
              onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))}
              placeholder="${content.ownerPlaceholder}"
            />
          </label>

          <label>
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({ ...current, status: event.target.value as RecordItem["status"] }))
              }
            >
              <option value="Active">Active</option>
              <option value="Review">Review</option>
              <option value="Archived">Archived</option>
            </select>
          </label>

          <button type="submit">{editingId ? "Save changes" : "Add ${content.singularLabel}"}</button>
        </form>

        <section className="records-card">
          <div className="section-heading records-heading">
            <div>
              <h2>${pluralDisplayLabel}</h2>
              <span>{visibleRecords.length} visible</span>
            </div>
            <label className="search-field">
              ${content.searchLabel}
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by ${content.nameLabel.toLowerCase()}, ${content.ownerLabel.toLowerCase()}, or status"
              />
            </label>
          </div>

          <div className="records-table">
            <div className="records-table-head">
              <span>${content.nameLabel}</span>
              <span>${content.categoryLabel}</span>
              <span>${content.ownerLabel}</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {visibleRecords.length === 0 ? (
              <div className="records-empty">No ${content.pluralLabel} match the current filter.</div>
            ) : (
              visibleRecords.map((record) => (
                <article key={record.id} className="record-row">
                  <strong>{record.name}</strong>
                  <span>{record.category}</span>
                  <span>{record.owner}</span>
                  <span className={\`status-badge status-\${record.status.toLowerCase()}\`}>{record.status}</span>
                  <div className="row-actions">
                    <button type="button" className="ghost" onClick={() => handleEdit(record)}>
                      Edit
                    </button>
                    <button type="button" className="ghost danger" onClick={() => handleDelete(record.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
`;
}

export function buildVendorPaymentsCrudAppTsxTemplate(title: string): string {
  return `import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type PaymentStatus = "Pending" | "Due soon" | "Paid";

type VendorPayment = {
  id: string;
  vendor: string;
  amount: string;
  dueDate: string;
  status: PaymentStatus;
};

type VendorDraft = Omit<VendorPayment, "id">;

const initialPayments: VendorPayment[] = [
  { id: "1", vendor: "Northwind Supply", amount: "$2,400", dueDate: "2026-04-09", status: "Pending" },
  { id: "2", vendor: "Harbor Freight Co.", amount: "$860", dueDate: "2026-04-07", status: "Due soon" },
  { id: "3", vendor: "Blue Mesa Logistics", amount: "$1,120", dueDate: "2026-04-03", status: "Paid" }
];

const emptyDraft: VendorDraft = { vendor: "", amount: "", dueDate: "", status: "Pending" };

function App() {
  const [payments, setPayments] = useState<VendorPayment[]>(initialPayments);
  const [draft, setDraft] = useState<VendorDraft>(emptyDraft);
  const [query, setQuery] = useState("");

  const visiblePayments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return payments;
    return payments.filter((payment) =>
      [payment.vendor, payment.amount, payment.dueDate, payment.status].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [payments, query]);

  const paidCount = payments.filter((payment) => payment.status === "Paid").length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const vendor = draft.vendor.trim();
    const amount = draft.amount.trim();
    const dueDate = draft.dueDate.trim();
    if (!vendor || !amount || !dueDate) return;

    setPayments((current) => [
      {
        id: crypto.randomUUID(),
        vendor,
        amount,
        dueDate,
        status: draft.status
      },
      ...current
    ]);
    setDraft(emptyDraft);
  };

  const handleMarkPaid = (paymentId: string) => {
    setPayments((current) =>
      current.map((payment) =>
        payment.id === paymentId ? { ...payment, status: "Paid" } : payment
      )
    );
  };

  return (
    <main className="crud-shell">
      <section className="crud-hero">
        <div>
          <p className="eyebrow">Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">Track vendor payouts, spot what is due next, and mark invoices paid from one compact workspace.</p>
        </div>
        <div className="hero-stats">
          <article>
            <span>Total vendors</span>
            <strong>{payments.length}</strong>
          </article>
          <article>
            <span>Paid</span>
            <strong>{paidCount}</strong>
          </article>
        </div>
      </section>

      <section className="crud-grid">
        <form className="editor-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <h2>Add vendor payment</h2>
              <span>Capture the next due payment and keep the table current.</span>
            </div>
          </div>

          <label>
            Vendor
            <input
              value={draft.vendor}
              onChange={(event) => setDraft((current) => ({ ...current, vendor: event.target.value }))}
              placeholder="Vendor name"
            />
          </label>

          <label>
            Amount
            <input
              value={draft.amount}
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
              placeholder="$1,250"
            />
          </label>

          <label>
            Due date
            <input
              type="date"
              value={draft.dueDate}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </label>

          <label>
            Payment status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({ ...current, status: event.target.value as PaymentStatus }))
              }
            >
              <option value="Pending">Pending</option>
              <option value="Due soon">Due soon</option>
              <option value="Paid">Paid</option>
            </select>
          </label>

          <button type="submit">Add payment</button>
        </form>

        <section className="records-card">
          <div className="section-heading records-heading">
            <div>
              <h2>Vendor payments</h2>
              <span>{visiblePayments.length} visible</span>
            </div>
            <label className="search-field">
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by vendor, amount, due date, or status"
              />
            </label>
          </div>

          <div className="records-table">
            <div className="records-table-head">
              <span>Vendor</span>
              <span>Amount</span>
              <span>Due date</span>
              <span>Payment status</span>
              <span>Actions</span>
            </div>
            {visiblePayments.length === 0 ? (
              <div className="records-empty">No vendor payments match the current filter.</div>
            ) : (
              visiblePayments.map((payment) => (
                <article key={payment.id} className="record-row">
                  <strong>{payment.vendor}</strong>
                  <span>{payment.amount}</span>
                  <span>{payment.dueDate}</span>
                  <span className={\`status-badge status-\${payment.status.toLowerCase().replace(/\\s+/g, "-")}\`}>
                    {payment.status}
                  </span>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => handleMarkPaid(payment.id)}
                      disabled={payment.status === "Paid"}
                    >
                      Mark paid
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
`;
}
