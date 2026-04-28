export function buildStaticDashboardCssTemplate(): string {
    return `:root {
  --ink: #10233a;
  --muted: #5e7089;
  --panel: rgba(255, 255, 255, 0.94);
  --line: rgba(15, 23, 42, 0.08);
  --accent: #1d4ed8;
  --canvas: linear-gradient(180deg, #eef6ff 0%, #f8fafc 56%, #eff4ff 100%);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--canvas);
}

.dashboard-shell {
  width: min(1140px, calc(100% - 40px));
  margin: 0 auto;
  padding: 40px 0 72px;
}

.dashboard-hero,
.stat-card,
.panel {
  border: 1px solid var(--line);
  border-radius: 28px;
  background: var(--panel);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.dashboard-hero {
  padding: 32px;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.78rem;
  color: var(--accent);
}

h1, h2, p { margin-top: 0; }
.lede { color: var(--muted); max-width: 56ch; line-height: 1.7; margin-bottom: 0; }

button {
  font: inherit;
  border: none;
  border-radius: 999px;
  padding: 13px 18px;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin: 22px 0;
}

.stat-card,
.panel {
  padding: 22px;
}

.stat-card strong {
  display: block;
  font-size: 2rem;
  margin: 8px 0;
}

.stat-card span,
.panel-head span {
  color: var(--muted);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr;
  gap: 18px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.bars {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
  min-height: 220px;
}

.bar {
  border-radius: 18px 18px 10px 10px;
  background: linear-gradient(180deg, #2563eb 0%, #7dd3fc 100%);
}

.activity-list {
  display: grid;
  gap: 12px;
}

.activity-item {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

@media (max-width: 860px) {
  .stats-grid,
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-hero {
    align-items: start;
    flex-direction: column;
  }
}
`;
}

export function buildStaticCrudCssTemplate(): string {
    return `:root {
  --ink: #16253b;
  --muted: #627289;
  --panel: rgba(255, 255, 255, 0.95);
  --line: rgba(15, 23, 42, 0.1);
  --accent: #7c2d12;
  --canvas: linear-gradient(180deg, #fff7ed 0%, #fffbf5 48%, #f8fafc 100%);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--canvas);
}

.crud-shell {
  width: min(1140px, calc(100% - 40px));
  margin: 0 auto;
  padding: 40px 0 72px;
}

.crud-hero,
.panel,
.record-item {
  border-radius: 28px;
  border: 1px solid var(--line);
  background: var(--panel);
  box-shadow: 0 22px 58px rgba(15, 23, 42, 0.08);
}

.crud-hero,
.panel {
  padding: 24px;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.78rem;
  color: var(--accent);
}

.lede { color: var(--muted); max-width: 56ch; line-height: 1.7; }

.crud-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: 18px;
}

.panel-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

label {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  font-weight: 600;
}

input,
select,
button {
  font: inherit;
}

input,
select {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 13px 14px;
  background: rgba(248, 250, 252, 0.92);
}

button {
  border: none;
  border-radius: 999px;
  padding: 13px 18px;
  background: #9a3412;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.search-field {
  min-width: 220px;
  margin: 0;
}

.records-list {
  display: grid;
  gap: 12px;
}

.record-item {
  padding: 16px 18px;
}

.record-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.record-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: #ffedd5;
  color: #9a3412;
  font-size: 0.82rem;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.ghost {
  background: #e2e8f0;
  color: #16253b;
}

@media (max-width: 860px) {
  .crud-grid {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
  }

  .search-field {
    width: 100%;
  }
}
`;
}

export function buildDashboardCssTemplate(): string {
    return `.dashboard-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  background:
    radial-gradient(circle at top left, rgba(95, 140, 255, 0.24), transparent 22%),
    radial-gradient(circle at top right, rgba(88, 208, 180, 0.14), transparent 20%),
    linear-gradient(180deg, #f4f7fd 0%, #eef2f8 100%);
  color: #162033;
}

.dashboard-sidebar {
  padding: 30px 26px;
  border-right: 1px solid rgba(22, 32, 51, 0.08);
  background: rgba(16, 26, 44, 0.95);
  color: #edf2ff;
}

.dashboard-sidebar h1 {
  margin: 0 0 22px;
  font-size: 32px;
}

.dashboard-sidebar nav {
  display: grid;
  gap: 12px;
}

.dashboard-sidebar a {
  color: inherit;
  text-decoration: none;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
}

.dashboard-main {
  padding: 30px;
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #6f86c9;
}

.dashboard-header,
.metric-card,
.panel {
  border: 1px solid rgba(20, 32, 51, 0.08);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 22px 72px rgba(17, 25, 39, 0.08);
  backdrop-filter: blur(12px);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 24px;
}

.dashboard-header h2,
.panel-header h3 {
  margin: 0;
}

.dashboard-header p {
  margin: 10px 0 0;
  max-width: 620px;
  color: #617089;
  line-height: 1.7;
}

.dashboard-header button {
  border: 0;
  border-radius: 999px;
  padding: 14px 20px;
  font: inherit;
  font-weight: 700;
  background: #162033;
  color: #fff;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.filter-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.filter-field {
  display: grid;
  gap: 8px;
  color: #4f5d78;
}

.filter-field span {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.filter-field select,
.filter-field input {
  width: 100%;
  border: 1px solid rgba(20, 32, 51, 0.12);
  border-radius: 16px;
  padding: 13px 14px;
  font: inherit;
  color: #162033;
  background: rgba(255, 255, 255, 0.92);
}

.metric-card {
  padding: 20px;
}

.metric-card span,
.panel-header span {
  color: #6b7a94;
}

.metric-card strong {
  display: block;
  margin-top: 12px;
  font-size: 34px;
}

.metric-card p {
  margin: 10px 0 0;
  font-weight: 700;
}

.metric-up {
  color: #18875f;
}

.metric-down {
  color: #b42318;
}

.content-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
  margin-top: 18px;
}

.content-grid-secondary {
  grid-template-columns: 1fr 0.9fr;
}

.panel {
  padding: 22px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.chart-bars {
  height: 280px;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  align-items: end;
}

.chart-bars div {
  border-radius: 18px 18px 8px 8px;
  background: linear-gradient(180deg, #3b64e6 0%, #8db8ff 100%);
}

.activity-panel ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 14px;
  color: #4f5d78;
}

.team-list {
  display: grid;
  gap: 12px;
}

.team-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(244, 247, 253, 0.95);
  border: 1px solid rgba(20, 32, 51, 0.06);
}

.team-row strong,
.signal-copy {
  color: #162033;
}

.deals-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.deal-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(244, 247, 253, 0.95);
  border: 1px solid rgba(20, 32, 51, 0.06);
}

.deal-row p,
.deals-empty {
  margin: 4px 0 0;
  color: #60708d;
}

.deal-row span {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(24, 135, 95, 0.1);
  color: #18875f;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.team-row p {
  margin: 4px 0 0;
  color: #60708d;
}

.team-row span {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(59, 100, 230, 0.1);
  color: #3154cf;
  font-size: 12px;
  font-weight: 700;
}

.signal-copy {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
}

@media (max-width: 920px) {
  .dashboard-shell {
    grid-template-columns: 1fr;
  }

  .metric-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .filter-bar {
    grid-template-columns: 1fr;
  }

  .dashboard-header {
    flex-direction: column;
    align-items: start;
  }
}
`;
}

export function buildDashboardIndexCssTemplate(): string {
    return `:root {
  font-family: "Segoe UI", "Aptos", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #162033;
  background: #eef2f8;
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
`;
}

export function buildCrudAppCssTemplate(): string {
    return `.crud-shell {
  min-height: 100vh;
  padding: 44px 24px 64px;
  background:
    radial-gradient(circle at top left, rgba(87, 132, 255, 0.18), transparent 24%),
    radial-gradient(circle at top right, rgba(81, 212, 191, 0.18), transparent 20%),
    linear-gradient(180deg, #f5f8ff 0%, #eef3fb 100%);
  color: #152033;
}

.crud-hero,
.crud-grid {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.crud-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  margin-bottom: 26px;
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #4866df;
}

.crud-hero h1 {
  margin: 0 0 12px;
  font-size: clamp(2.3rem, 5vw, 3.8rem);
}

.lede {
  max-width: 680px;
  margin: 0;
  font-size: 18px;
  line-height: 1.7;
  color: #5b6983;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 14px;
}

.hero-stats article,
.editor-card,
.records-card {
  border: 1px solid rgba(21, 32, 51, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 80px rgba(20, 29, 44, 0.08);
}

.hero-stats article {
  padding: 18px 20px;
}

.hero-stats span {
  display: block;
  font-size: 13px;
  color: #6c7a93;
}

.hero-stats strong {
  display: block;
  margin-top: 8px;
  font-size: 28px;
}

.crud-grid {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.editor-card,
.records-card {
  padding: 24px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  margin-bottom: 18px;
}

.section-heading h2 {
  margin: 0 0 6px;
  font-size: 24px;
}

.section-heading span {
  font-size: 13px;
  color: #6d7a92;
}

.editor-card label,
.search-field {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #26334d;
}

.editor-card label + label {
  margin-top: 16px;
}

input,
select,
button {
  font: inherit;
}

input,
select {
  width: 100%;
  margin-top: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(35, 49, 77, 0.12);
  border-radius: 18px;
  background: rgba(248, 250, 255, 0.96);
  color: #152033;
  box-sizing: border-box;
}

button {
  border: 0;
  border-radius: 999px;
  padding: 14px 20px;
  margin-top: 18px;
  font-weight: 700;
  background: #152033;
  color: #fff;
  cursor: pointer;
}

button.ghost {
  margin-top: 0;
  padding: 10px 14px;
  background: rgba(21, 32, 51, 0.08);
  color: #152033;
}

button.ghost.danger {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
}

.records-heading {
  align-items: center;
}

.records-table {
  display: grid;
  gap: 12px;
}

.records-table-head,
.record-row {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr 0.9fr 0.8fr 1fr;
  gap: 12px;
  align-items: center;
}

.records-table-head {
  padding: 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #71809b;
}

.record-row {
  padding: 16px;
  border: 1px solid rgba(21, 32, 51, 0.08);
  border-radius: 22px;
  background: rgba(249, 251, 255, 0.95);
}

.record-row strong {
  font-size: 15px;
}

.record-row span {
  color: #596884;
}

.row-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-active {
  color: #0f8a57;
  background: rgba(15, 138, 87, 0.12);
}

.status-review {
  color: #9a6700;
  background: rgba(154, 103, 0, 0.12);
}

.status-archived {
  color: #5b6983;
  background: rgba(91, 105, 131, 0.12);
}

.records-empty {
  padding: 24px;
  border: 1px dashed rgba(21, 32, 51, 0.14);
  border-radius: 22px;
  color: #6c7a93;
  text-align: center;
}

@media (max-width: 980px) {
  .crud-hero,
  .crud-grid {
    grid-template-columns: 1fr;
  }

  .crud-hero {
    flex-direction: column;
    align-items: start;
  }

  .records-table-head {
    display: none;
  }

  .record-row {
    grid-template-columns: 1fr;
  }

  .row-actions {
    justify-content: flex-start;
  }
}
`;
}

export function buildCrudIndexCssTemplate(): string {
    return `:root {
  font-family: "Segoe UI", "Aptos", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #152033;
  background: #eef3fb;
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
`;
}

