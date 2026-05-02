export interface HeuristicDesktopWorkspaceTemplateInput {
  title: string;
  isBusinessReportingWorkspace: boolean;
  isFileRenamer: boolean;
  isPdfCombiner: boolean;
  isSnippetManager: boolean;
  isVoiceWorkspace: boolean;
}

export interface HeuristicDesktopWorkspaceTemplate {
  appContent: string;
  cssContent: string;
  indexCssContent: string;
}

export function buildHeuristicDesktopWorkspaceTemplate(
  input: HeuristicDesktopWorkspaceTemplateInput
): HeuristicDesktopWorkspaceTemplate {
  const {
    title,
    isBusinessReportingWorkspace,
    isFileRenamer,
    isPdfCombiner,
    isSnippetManager,
    isVoiceWorkspace
  } = input;

    const appContent = isBusinessReportingWorkspace
      ? `import { useMemo, useState } from "react";
import "./App.css";

type DailyRecord = {
  id: number;
  date: string;
  sales: number;
  expenses: number;
  orders: number;
  note: string;
};

type RecordDraft = {
  date: string;
  sales: string;
  expenses: string;
  orders: string;
  note: string;
};

const initialRecords: DailyRecord[] = [
  { id: 1, date: "2026-04-01", sales: 1680, expenses: 540, orders: 21, note: "Promo bundle moved quickly." },
  { id: 2, date: "2026-04-03", sales: 1540, expenses: 510, orders: 18, note: "Weekend stock refill." },
  { id: 3, date: "2026-04-05", sales: 1920, expenses: 640, orders: 25, note: "Higher walk-in traffic after noon." },
  { id: 4, date: "2026-04-06", sales: 1760, expenses: 590, orders: 22, note: "Strong repeat-customer sales." }
];

const defaultDraft: RecordDraft = {
  date: "2026-04-07",
  sales: "1840",
  expenses: "620",
  orders: "24",
  note: "Daily close captured for the evening shift."
};

function startOfQuarter(date: Date): Date {
  const month = date.getMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export default function App() {
  const [records, setRecords] = useState<DailyRecord[]>(initialRecords);
  const [draft, setDraft] = useState<RecordDraft>(defaultDraft);

  const latestDate = useMemo(() => {
    const dates = records.map((record) => new Date(record.date));
    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }, [records]);

  const summary = useMemo(() => {
    const latestWeekStart = new Date(latestDate);
    latestWeekStart.setDate(latestDate.getDate() - 6);
    const latestMonthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
    const latestQuarterStart = startOfQuarter(latestDate);
    const latestYearStart = new Date(latestDate.getFullYear(), 0, 1);

    const filterRange = (start: Date, end: Date) => records.filter((record) => {
      const date = new Date(record.date);
      return date >= start && date <= end;
    });

    const buildTotals = (items: DailyRecord[]) => {
      const sales = items.reduce((sum, item) => sum + item.sales, 0);
      const expenses = items.reduce((sum, item) => sum + item.expenses, 0);
      const orders = items.reduce((sum, item) => sum + item.orders, 0);
      return { sales, expenses, orders, profit: sales - expenses };
    };

    const latestDayRecords = records.filter((record) => sameDay(new Date(record.date), latestDate));

    return {
      daily: buildTotals(latestDayRecords),
      weekly: buildTotals(filterRange(latestWeekStart, latestDate)),
      monthly: buildTotals(filterRange(latestMonthStart, latestDate)),
      quarterly: buildTotals(filterRange(latestQuarterStart, latestDate)),
      yearly: buildTotals(filterRange(latestYearStart, latestDate))
    };
  }, [latestDate, records]);

  const handleDraftChange = (field: keyof RecordDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleAddRecord = () => {
    setRecords((current) => [
      {
        id: Date.now(),
        date: draft.date,
        sales: Number(draft.sales) || 0,
        expenses: Number(draft.expenses) || 0,
        orders: Number(draft.orders) || 0,
        note: draft.note.trim() || "Daily entry captured."
      },
      ...current
    ]);
    setDraft(defaultDraft);
  };

  const reportCards = [
    { title: "Daily summary", totals: summary.daily },
    { title: "Weekly report", totals: summary.weekly },
    { title: "Monthly report", totals: summary.monthly },
    { title: "Quarterly report", totals: summary.quarterly },
    { title: "Yearly report", totals: summary.yearly }
  ];

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary" onClick={handleAddRecord}>Add daily entry</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#daily-entry">Daily entry</a>
          <a href="#saved-records">Saved records</a>
          <a href="#reports">Reporting views</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header className="desktop-header">
          <div>
            <p className="desktop-kicker">Shop record software</p>
            <h2>Enter daily records and auto-generate reporting views</h2>
            <p>Capture one daily entry at a time, keep a saved records list, and let the app roll totals into weekly, monthly, quarterly, and yearly performance.</p>
          </div>
          <div className="desktop-meta">
            <span>{records.length} saved records</span>
            <span>Latest close: {latestDate.toLocaleDateString()}</span>
          </div>
        </header>

        <section className="desktop-columns">
          <section id="daily-entry" className="desktop-panel">
            <p className="desktop-kicker">Daily entry</p>
            <h3>Record the day</h3>
            <div className="desktop-form-grid">
              <label className="desktop-field">
                Date
                <input value={draft.date} onChange={(event) => handleDraftChange("date", event.target.value)} />
              </label>
              <label className="desktop-field">
                Sales
                <input value={draft.sales} onChange={(event) => handleDraftChange("sales", event.target.value)} />
              </label>
              <label className="desktop-field">
                Expenses
                <input value={draft.expenses} onChange={(event) => handleDraftChange("expenses", event.target.value)} />
              </label>
              <label className="desktop-field">
                Orders
                <input value={draft.orders} onChange={(event) => handleDraftChange("orders", event.target.value)} />
              </label>
            </div>
            <label className="desktop-field">
              Daily note
              <textarea value={draft.note} onChange={(event) => handleDraftChange("note", event.target.value)} rows={4} />
            </label>
            <div className="desktop-stack">
              <button type="button" className="desktop-primary" onClick={handleAddRecord}>Save daily entry</button>
              <small>Daily entries feed the summary views below without asking for separate weekly or monthly inputs.</small>
            </div>
          </section>

          <section id="saved-records" className="desktop-list" aria-label="Saved records">
            <div className="snippet-card">
              <div className="snippet-card-top">
                <strong>Saved records</strong>
                <span>{records.length} rows</span>
              </div>
              <div className="desktop-record-table">
                {records.map((record) => (
                  <article key={record.id} className="desktop-record-row">
                    <div>
                      <strong>{new Date(record.date).toLocaleDateString()}</strong>
                      <p className="desktop-note">{record.note}</p>
                    </div>
                    <div className="desktop-stat-line">
                      <span>{formatCurrency(record.sales)} sales</span>
                      <span>{formatCurrency(record.expenses)} expenses</span>
                      <span>{record.orders} orders</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </section>

        <section id="reports" className="desktop-panel">
          <p className="desktop-kicker">Reporting views</p>
          <h3>Performance rolls up from daily records</h3>
          <div className="desktop-report-grid">
            {reportCards.map((card) => (
              <article key={card.title} className="desktop-report-card">
                <h4>{card.title}</h4>
                <div className="desktop-metrics">
                  <div className="desktop-metric">
                    <span>Sales</span>
                    <strong>{formatCurrency(card.totals.sales)}</strong>
                  </div>
                  <div className="desktop-metric">
                    <span>Expenses</span>
                    <strong>{formatCurrency(card.totals.expenses)}</strong>
                  </div>
                  <div className="desktop-metric">
                    <span>Profit</span>
                    <strong>{formatCurrency(card.totals.profit)}</strong>
                  </div>
                  <div className="desktop-metric">
                    <span>Orders</span>
                    <strong>{card.totals.orders}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
`
      : isFileRenamer
      ? `import { useMemo, useState } from "react";
import "./App.css";

type FileItem = {
  id: number;
  originalName: string;
  previewName: string;
  folder: string;
};

const initialFiles: FileItem[] = [
  { id: 1, originalName: "invoice-final.pdf", previewName: "invoice-approved.pdf", folder: "D:/Work/Billing" },
  { id: 2, originalName: "march-notes.txt", previewName: "march-summary.txt", folder: "D:/Work/Notes" },
  { id: 3, originalName: "client-photo.png", previewName: "client-photo-archive.png", folder: "D:/Work/Assets" }
];

export default function App() {
  const [findText, setFindText] = useState("final");
  const [replaceText, setReplaceText] = useState("approved");
  const [selectedFolder, setSelectedFolder] = useState("D:/Work");

  const handlePickFolder = () => {
    setSelectedFolder((current) => current === "D:/Work" ? "D:/Archive" : "D:/Work");
  };

  const previewFiles = useMemo(() => {
    const needle = findText.trim().toLowerCase();
    return initialFiles.map((file) => {
      if (!needle) return { ...file, previewName: file.originalName };
      const previewName = file.originalName.toLowerCase().includes(needle)
        ? file.originalName.replace(new RegExp(findText, "ig"), replaceText || "")
        : file.originalName;
      return { ...file, previewName };
    });
  }, [findText, replaceText]);

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary" onClick={handlePickFolder}>Pick folder</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#preview">Filename preview</a>
          <a href="#rules">Rename rules</a>
          <a href="#details">Output details</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="preview" className="desktop-header">
          <div>
            <p className="desktop-kicker">Filename preview</p>
            <h2>Rename files before applying changes</h2>
            <p>Pick a folder, review renamed filenames, and only then run the batch rename action.</p>
          </div>
          <div className="desktop-meta">
            <span>{previewFiles.length} files</span>
            <span>{selectedFolder}</span>
          </div>
        </header>

        <section className="desktop-grid">
          <section className="desktop-list" aria-label="Filename preview list">
            {previewFiles.map((file) => (
              <article key={file.id} className="snippet-card">
                <div className="snippet-card-top">
                  <strong>{file.originalName}</strong>
                  <span>{file.folder}</span>
                </div>
                <p>Preview: {file.previewName}</p>
              </article>
            ))}
          </section>

          <aside id="rules" className="desktop-panel">
            <p className="desktop-kicker">Rename rules</p>
            <h3>Replace text</h3>
            <label className="desktop-field">
              Find
              <input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Text to replace" />
            </label>
            <label className="desktop-field">
              Replace with
              <input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replacement text" />
            </label>
            <div className="desktop-stack">
              <button type="button" className="desktop-primary">Rename files</button>
              <small>Preview updates before you apply the rename action.</small>
            </div>
          </aside>
        </section>

        <section id="details" className="desktop-panel">
          <p className="desktop-kicker">Output details</p>
          <h3>Folder picker</h3>
          <p>Current folder: {selectedFolder}</p>
        </section>
      </section>
    </main>
  );
}
`
      : isPdfCombiner
        ? `import { useState } from "react";
import "./App.css";

type PdfItem = {
  id: number;
  name: string;
  pages: number;
};

const initialFiles: PdfItem[] = [
  { id: 1, name: "invoice-summary.pdf", pages: 3 },
  { id: 2, name: "receipts-batch.pdf", pages: 9 },
  { id: 3, name: "approval-sheet.pdf", pages: 2 }
];

export default function App() {
  const [files, setFiles] = useState<PdfItem[]>(initialFiles);
  const [outputPath] = useState("D:/Merged/combined-output.pdf");

  const move = (index: number, direction: -1 | 1) => {
    setFiles((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary">Add PDFs</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#merge-list">PDF list</a>
          <a href="#output">Output path</a>
          <a href="#actions">Merge actions</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="merge-list" className="desktop-header">
          <div>
            <p className="desktop-kicker">PDF list</p>
            <h2>Arrange files before merging</h2>
            <p>Review order, move files up or down, and merge into a single output path when ready.</p>
          </div>
          <div className="desktop-meta">
            <span>{files.length} files</span>
            <span>{files.reduce((sum, file) => sum + file.pages, 0)} pages</span>
          </div>
        </header>

        <section className="desktop-grid">
          <section className="desktop-list" aria-label="PDF file list">
            {files.map((file, index) => (
              <article key={file.id} className="snippet-card">
                <div className="snippet-card-top">
                  <strong>{file.name}</strong>
                  <span>{file.pages} pages</span>
                </div>
                <div className="desktop-inline-actions">
                  <button type="button" onClick={() => move(index, -1)}>Move up</button>
                  <button type="button" onClick={() => move(index, 1)}>Move down</button>
                </div>
              </article>
            ))}
          </section>

          <aside id="output" className="desktop-panel">
            <p className="desktop-kicker">Output path</p>
            <h3>Merged PDF destination</h3>
            <label className="desktop-field">
              Output file
              <input value={outputPath} readOnly />
            </label>
            <div id="actions" className="desktop-stack">
              <button type="button" className="desktop-primary">Merge PDFs</button>
              <small>Reorder files before you run the merge button.</small>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
`
      : isSnippetManager
      ? `import { useState } from "react";
import "./App.css";

type Snippet = {
  id: number;
  title: string;
  language: string;
  tags: string[];
  summary: string;
};

const initialSnippets: Snippet[] = [
  { id: 1, title: "Auth guard", language: "TypeScript", tags: ["auth", "frontend"], summary: "Wraps protected routes with role-aware redirect logic." },
  { id: 2, title: "Retry fetch", language: "Node", tags: ["api", "ops"], summary: "Retries transient upstream failures with capped backoff." },
  { id: 3, title: "Theme tokens", language: "CSS", tags: ["design"], summary: "Defines surface, accent, and spacing tokens for app shells." }
];

const filterTags = ["All", "auth", "frontend", "api", "ops", "design"] as const;

export default function App() {
  const [selectedTag, setSelectedTag] = useState<(typeof filterTags)[number]>("All");
  const [snippets, setSnippets] = useState<Snippet[]>(initialSnippets);

  const visibleSnippets = selectedTag === "All"
    ? snippets
    : snippets.filter((snippet) => snippet.tags.includes(selectedTag));

  const handleCreateSnippet = () => {
    setSnippets((current) => [
      {
        id: Date.now(),
        title: "New snippet draft",
        language: "Markdown",
        tags: ["design"],
        summary: "Fresh draft ready for notes, code, or handoff snippets."
      },
      ...current
    ]);
  };

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary" onClick={handleCreateSnippet}>Create snippet</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#library">Snippet library</a>
          <a href="#filters">Tag filters</a>
          <a href="#details">Inspector</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="library" className="desktop-header">
          <div>
            <p className="desktop-kicker">Snippet list</p>
            <h2>Quick access workspace</h2>
            <p>Browse reusable snippets, filter by tag, and keep the next draft one click away.</p>
          </div>
          <div className="desktop-meta">
            <span>{visibleSnippets.length} visible</span>
            <span>{snippets.length} total</span>
          </div>
        </header>

        <section id="filters" className="desktop-filters" aria-label="Tag filters">
          {filterTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={tag === selectedTag ? "is-active" : ""}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </button>
          ))}
        </section>

        <section className="desktop-grid">
          <section className="desktop-list" aria-label="Snippet list">
            {visibleSnippets.map((snippet) => (
              <article key={snippet.id} className="snippet-card">
                <div className="snippet-card-top">
                  <strong>{snippet.title}</strong>
                  <span>{snippet.language}</span>
                </div>
                <p>{snippet.summary}</p>
                <div className="snippet-tags">
                  {snippet.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </article>
            ))}
          </section>

          <aside id="details" className="desktop-panel">
            <p className="desktop-kicker">Inspector</p>
            <h3>Create-snippet action</h3>
            <ul>
              <li>Sidebar keeps the primary action visible.</li>
              <li>Tag filters update the visible snippet list.</li>
              <li>Fresh drafts appear at the top after creation.</li>
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}
`
      : isVoiceWorkspace
        ? `import { useState } from "react";
import "./App.css";

type Recording = {
  id: number;
  title: string;
  length: string;
  state: "ready" | "processing" | "archived";
};

const initialRecordings: Recording[] = [
  { id: 1, title: "Standup recap", length: "03:42", state: "ready" },
  { id: 2, title: "Customer follow-up", length: "07:15", state: "processing" },
  { id: 3, title: "Ideas inbox", length: "01:58", state: "archived" }
];

export default function App() {
  const [recordings, setRecordings] = useState<Recording[]>(initialRecordings);

  const handleStartRecording = () => {
    setRecordings((current) => [
      { id: Date.now(), title: "New recording", length: "00:12", state: "ready" },
      ...current
    ]);
  };

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <p>Login and sign in with your account using auth password controls.</p>
        <p>Settings, preferences, and configuration stay available for this desktop workflow.</p>
        <button type="button" className="desktop-primary" onClick={handleStartRecording}>Start recording</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#recordings">Recording list</a>
          <a href="#auth-settings">Auth and settings</a>
          <a href="#details">Session details</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="recordings" className="desktop-header">
          <div>
            <p className="desktop-kicker">Recording list</p>
            <h2>Capture and review voice notes</h2>
            <p>Keep fresh recordings visible, track status, and make the primary recording action obvious.</p>
          </div>
          <div className="desktop-meta">
            <span>{recordings.length} notes</span>
            <span>Mic ready</span>
          </div>
        </header>

        <section className="desktop-grid">
          <section className="desktop-list" aria-label="Recording list">
            {recordings.map((item) => (
              <article key={item.id} className="snippet-card">
                <div className="snippet-card-top">
                  <strong>{item.title}</strong>
                  <span>{item.length}</span>
                </div>
                <p>Status: {item.state}</p>
              </article>
            ))}
          </section>

          <aside id="auth-settings" className="desktop-panel">
            <p className="desktop-kicker">Authentication flow</p>
            <h3>Login and account access</h3>
            <ul>
              <li>Users login with account email and password.</li>
              <li>Sign in runs through auth checks before recording access.</li>
              <li>Settings include preferences and configuration controls.</li>
            </ul>
          </aside>

          <aside id="details" className="desktop-panel">
            <p className="desktop-kicker">Session details</p>
            <h3>Voice note workflow</h3>
            <ul>
              <li>One-click recording starts new capture sessions.</li>
              <li>Recent notes stay pinned near the top.</li>
              <li>Status labels make processing visible.</li>
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}
`
        : `import "./App.css";

export default function App() {
  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary">Open primary action</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#overview">Overview</a>
          <a href="#queue">Queue</a>
          <a href="#details">Details</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="overview" className="desktop-header">
          <div>
            <p className="desktop-kicker">Overview</p>
            <h2>Focused desktop shell</h2>
            <p>A stable desktop workspace layout with sidebar navigation and a clear primary action.</p>
          </div>
          <div className="desktop-meta">
            <span>Ready</span>
            <span>3 views</span>
          </div>
        </header>

        <section className="desktop-grid">
          <section id="queue" className="desktop-list" aria-label="Workspace queue">
            <article className="snippet-card"><strong>Primary workspace</strong><p>Keep the main workflow in focus.</p></article>
            <article className="snippet-card"><strong>Recent items</strong><p>Surface recent work without modal friction.</p></article>
          </section>

          <aside id="details" className="desktop-panel">
            <p className="desktop-kicker">Details</p>
            <h3>Shell guidance</h3>
            <ul>
              <li>Sidebar anchors keep navigation obvious.</li>
              <li>Primary action stays pinned in the header.</li>
              <li>Main content uses card groupings for clarity.</li>
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}
`;

    const cssContent = `.desktop-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px 1fr;
  background:
    radial-gradient(circle at top right, rgba(92, 122, 255, 0.18), transparent 28%),
    linear-gradient(145deg, #0f172a 0%, #172554 48%, #e2e8f0 48%, #f8fafc 100%);
  color: #0f172a;
}

.desktop-sidebar {
  padding: 32px 24px;
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.desktop-sidebar h1 {
  margin: 0;
  font-size: 2rem;
}

.desktop-eyebrow,
.desktop-kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.74rem;
  color: #93c5fd;
}

.desktop-primary,
.desktop-filters button {
  border: 0;
  border-radius: 999px;
  padding: 0.8rem 1rem;
  font: inherit;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.desktop-primary {
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: white;
  font-weight: 700;
  box-shadow: 0 18px 36px rgba(56, 189, 248, 0.25);
}

.desktop-primary:hover,
.desktop-filters button:hover {
  transform: translateY(-1px);
}

.desktop-nav {
  display: grid;
  gap: 0.65rem;
}

.desktop-nav a {
  color: inherit;
  text-decoration: none;
  opacity: 0.88;
}

.desktop-main {
  padding: 32px;
  display: grid;
  gap: 24px;
}

.desktop-header,
.desktop-list,
.desktop-panel,
.desktop-filters {
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 24px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

.desktop-header {
  padding: 24px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.desktop-header h2,
.desktop-panel h3 {
  margin: 0.4rem 0 0.6rem;
}

.desktop-header p,
.desktop-panel p,
.snippet-card p {
  margin: 0;
  color: #334155;
}

.desktop-meta {
  display: grid;
  gap: 0.5rem;
  align-content: start;
  color: #475569;
}

.desktop-filters {
  padding: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.desktop-filters button {
  background: #e2e8f0;
  color: #0f172a;
}

.desktop-filters button.is-active {
  background: #0f172a;
  color: white;
}

.desktop-grid {
  display: grid;
  grid-template-columns: 1.35fr 0.85fr;
  gap: 24px;
}

.desktop-list,
.desktop-panel {
  padding: 24px;
}

.desktop-list {
  display: grid;
  gap: 16px;
}

.snippet-card {
  border-radius: 18px;
  padding: 18px;
  background: linear-gradient(180deg, #ffffff, #eff6ff);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.snippet-card-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.snippet-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 14px;
}

.snippet-tags span {
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #4338ca;
  font-size: 0.82rem;
}

.desktop-panel ul {
  margin: 1rem 0 0;
  padding-left: 1.2rem;
  color: #334155;
}

.desktop-field {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.9rem;
  color: #334155;
  font-size: 0.95rem;
}

.desktop-field input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
}

.desktop-field textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
  resize: vertical;
}

.desktop-columns {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 24px;
}

.desktop-form-grid,
.desktop-report-grid,
.desktop-metrics {
  display: grid;
  gap: 16px;
}

.desktop-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.desktop-report-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin-top: 1rem;
}

.desktop-report-card {
  border-radius: 18px;
  padding: 18px;
  background: linear-gradient(180deg, #ffffff, #ecfeff);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.desktop-report-card h4 {
  margin: 0 0 0.9rem;
}

.desktop-metric {
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  background: rgba(15, 23, 42, 0.04);
}

.desktop-metric span {
  display: block;
  color: #475569;
  font-size: 0.85rem;
}

.desktop-metric strong {
  display: block;
  margin-top: 0.25rem;
  font-size: 1rem;
}

.desktop-record-table {
  display: grid;
  gap: 12px;
}

.desktop-record-row {
  display: grid;
  gap: 0.75rem;
  padding: 14px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.desktop-record-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.desktop-stat-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: #334155;
  font-size: 0.92rem;
}

.desktop-note {
  margin-top: 0.35rem;
}

.desktop-stack {
  display: grid;
  gap: 0.7rem;
  margin-top: 1rem;
}

.desktop-stack small {
  color: #64748b;
  line-height: 1.5;
}

.desktop-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.8rem;
}

.desktop-inline-actions button {
  border: 0;
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  cursor: pointer;
}

@media (max-width: 920px) {
  .desktop-shell {
    grid-template-columns: 1fr;
  }

  .desktop-grid {
    grid-template-columns: 1fr;
  }

  .desktop-columns,
  .desktop-form-grid {
    grid-template-columns: 1fr;
  }

  .desktop-header {
    flex-direction: column;
  }
}
`;

    const indexCssContent = `:root {
  color-scheme: light;
  font-family: "Segoe UI", "Inter", system-ui, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #0f172a;
  background: #f8fafc;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}

button,
input,
select,
textarea {
  font: inherit;
}
`;


  return { appContent, cssContent, indexCssContent };
}

