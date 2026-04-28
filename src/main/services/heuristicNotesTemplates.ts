export interface NotesTemplateOptions {
  wantsSearch: boolean;
  wantsDelete: boolean;
  wantsAdd: boolean;
}

export function buildNotesAppTsxTemplate(title: string, options: NotesTemplateOptions): string {
    const deleteHandler = options.wantsDelete
      ? `
  const handleDelete = (noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
  };
`
      : "";

    const deleteButton = options.wantsDelete
      ? `<button type="button" className="ghost" onClick={() => handleDelete(note.id)}>Delete</button>`
      : "";

    return `import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

const initialNotes: Note[] = [
  {
    id: "1",
    title: "Ship the first draft",
    body: "Focus on a reliable add, search, and delete flow before polishing extras.",
    createdAt: "Today"
  },
  {
    id: "2",
    title: "Keep the interface calm",
    body: "Use clear sections, strong spacing, and obvious actions.",
    createdAt: "Today"
  }
];

function App() {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((note) =>
      note.title.toLowerCase().includes(needle) || note.body.toLowerCase().includes(needle)
    );
  }, [notes, query]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) return;

    setNotes((current) => [
      {
        id: crypto.randomUUID(),
        title: trimmedTitle,
        body: trimmedBody,
        createdAt: new Date().toLocaleDateString()
      },
      ...current
    ]);
    setTitle("");
    setBody("");
  };
${deleteHandler}

  return (
    <main className="notes-shell">
      <section className="notes-hero">
        <p className="eyebrow">Notes workspace</p>
        <h1>${title}</h1>
        <p className="lede">A focused notes workspace with quick capture, filtering, and clean review.</p>
      </section>

      <section className="notes-grid">
        <form className="composer-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <h2>Capture a note</h2>
            <span>${options.wantsAdd ? "Add enabled" : "Quick draft"}</span>
          </div>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Roadmap, bug, idea..."
            />
          </label>
          <label>
            Details
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              placeholder="Write the details you want to keep..."
            />
          </label>
          <button type="submit">Save note</button>
        </form>

        <section className="list-card">
          <div className="section-heading">
            <div>
              <h2>Notes</h2>
              <span>{filteredNotes.length} visible</span>
            </div>
            <label className="search-field">
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="${options.wantsSearch ? "Search notes..." : "Filter notes..."}"
              />
            </label>
          </div>

          <div className="notes-list">
            {filteredNotes.length === 0 ? (
              <article className="note-card empty">
                <h3>No matches</h3>
                <p>Try a different search term or add a fresh note.</p>
              </article>
            ) : (
              filteredNotes.map((note) => (
                <article key={note.id} className="note-card">
                  <div className="note-card-top">
                    <div>
                      <p className="note-date">{note.createdAt}</p>
                      <h3>{note.title}</h3>
                    </div>
                    ${deleteButton}
                  </div>
                  <p>{note.body}</p>
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

export function buildStaticNotesHtmlTemplate(title: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="notes-shell">
      <section class="notes-hero">
        <p class="eyebrow">Notes workspace</p>
        <h1>${title}</h1>
        <p class="lede">A focused static notes workspace with quick capture, filtering, and clean review.</p>
      </section>

      <section class="notes-grid">
        <form class="composer-card" id="note-form">
          <div class="section-heading">
            <h2>Capture a note</h2>
            <span>Quick draft</span>
          </div>
          <label>
            Title
            <input id="note-title" placeholder="Roadmap, bug, idea..." />
          </label>
          <label>
            Details
            <textarea id="note-body" rows="6" placeholder="Write the details you want to keep..."></textarea>
          </label>
          <button type="submit">Save note</button>
        </form>

        <section class="list-card">
          <div class="section-heading notes-head">
            <div>
              <h2>Notes</h2>
              <span id="notes-count">2 visible</span>
            </div>
            <label class="search-field">
              Search
              <input id="notes-search" placeholder="Search notes..." />
            </label>
          </div>
          <div class="notes-list" id="notes-list"></div>
        </section>
      </section>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`;
}

export function buildStaticNotesCssTemplate(): string {
    return `:root {
  color-scheme: light;
  --ink: #132238;
  --muted: #5f6f82;
  --panel: rgba(255, 255, 255, 0.94);
  --line: rgba(15, 23, 42, 0.08);
  --accent: #0f766e;
  --accent-strong: #115e59;
  --canvas: radial-gradient(circle at top left, #dff7f2 0%, #f5efe4 48%, #f7fafc 100%);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--canvas);
}

.notes-shell {
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: 40px 0 72px;
}

.notes-hero,
.composer-card,
.list-card,
.note-card {
  border: 1px solid var(--line);
  border-radius: 28px;
  background: var(--panel);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.notes-hero {
  padding: 36px;
  margin-bottom: 22px;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.78rem;
  color: var(--accent);
}

.notes-hero h1,
.section-heading h2,
.note-card h3 {
  margin: 0;
}

.lede {
  margin: 14px 0 0;
  max-width: 56ch;
  line-height: 1.7;
  color: var(--muted);
}

.notes-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: 22px;
}

.composer-card,
.list-card {
  padding: 24px;
}

.section-heading,
.notes-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

label {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  font-weight: 600;
}

input,
textarea,
button {
  font: inherit;
}

input,
textarea {
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
  background: var(--accent-strong);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.search-field {
  min-width: 220px;
  margin: 0;
}

.notes-list {
  display: grid;
  gap: 14px;
}

.note-card {
  padding: 18px;
}

.note-card-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.note-date {
  margin: 0 0 6px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.note-actions {
  display: flex;
  gap: 10px;
}

.note-actions button {
  padding: 9px 14px;
  background: #e2e8f0;
  color: #132238;
}

.empty {
  text-align: center;
  color: var(--muted);
}

@media (max-width: 840px) {
  .notes-grid {
    grid-template-columns: 1fr;
  }

  .notes-head {
    flex-direction: column;
  }

  .search-field {
    width: 100%;
  }
}
`;
}

export function buildStaticNotesJsTemplate(title: string, options: NotesTemplateOptions): string {
    void title;
    const deleteEnabled = options.wantsDelete ? "true" : "false";
    const searchPlaceholder = options.wantsSearch ? "Search notes..." : "Filter notes...";
    return `const state = {
  allowDelete: ${deleteEnabled},
  notes: [
    {
      id: "1",
      title: "Ship the first draft",
      body: "Focus on a reliable add, search, and delete flow before polishing extras.",
      createdAt: "Today"
    },
    {
      id: "2",
      title: "Keep the interface calm",
      body: "Use clear sections, strong spacing, and obvious actions.",
      createdAt: "Today"
    }
  ]
};

const listEl = document.getElementById("notes-list");
const countEl = document.getElementById("notes-count");
const formEl = document.getElementById("note-form");
const titleEl = document.getElementById("note-title");
const bodyEl = document.getElementById("note-body");
const searchEl = document.getElementById("notes-search");

if (searchEl) {
  searchEl.placeholder = "${searchPlaceholder}";
}

function renderNotes() {
  if (!listEl || !countEl || !searchEl) return;
  const query = String(searchEl.value || "").trim().toLowerCase();
  const visible = state.notes.filter((note) => {
    if (!query) return true;
    return note.title.toLowerCase().includes(query) || note.body.toLowerCase().includes(query);
  });

  countEl.textContent = visible.length + " visible";
  if (visible.length === 0) {
    listEl.innerHTML = '<article class="note-card empty"><h3>No matches</h3><p>Try a different search term or add a fresh note.</p></article>';
    return;
  }

  listEl.innerHTML = visible.map((note) => {
    const action = state.allowDelete
      ? '<div class="note-actions"><button type="button" data-note-delete="' + note.id + '">Delete</button></div>'
      : "";
    return '<article class="note-card"><div class="note-card-top"><div><p class="note-date">' + note.createdAt + '</p><h3>' + note.title + '</h3></div>' + action + '</div><p>' + note.body + '</p></article>';
  }).join("");

  if (state.allowDelete) {
    listEl.querySelectorAll("[data-note-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-note-delete");
        state.notes = state.notes.filter((note) => note.id !== targetId);
        renderNotes();
      });
    });
  }
}

if (formEl && titleEl && bodyEl) {
  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = String(titleEl.value || "").trim();
    const body = String(bodyEl.value || "").trim();
    if (!title || !body) return;
    state.notes.unshift({
      id: String(Date.now()),
      title,
      body,
      createdAt: new Date().toLocaleDateString()
    });
    titleEl.value = "";
    bodyEl.value = "";
    renderNotes();
  });
}

searchEl?.addEventListener("input", renderNotes);
renderNotes();
`;
}

export function buildNotesAppCssTemplate(): string {
    return `.notes-shell {
  min-height: 100vh;
  padding: 48px 24px 64px;
  background:
    radial-gradient(circle at top left, rgba(253, 214, 146, 0.55), transparent 28%),
    radial-gradient(circle at top right, rgba(121, 172, 255, 0.35), transparent 24%),
    linear-gradient(180deg, #fffdf7 0%, #f2f5ff 100%);
  color: #162033;
}

.notes-hero,
.notes-grid {
  width: min(1100px, 100%);
  margin: 0 auto;
}

.notes-hero {
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #4162d8;
}

.lede {
  max-width: 640px;
  font-size: 18px;
  line-height: 1.7;
  color: #51607c;
}

.notes-grid {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.composer-card,
.list-card,
.note-card {
  border: 1px solid rgba(22, 32, 51, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 80px rgba(19, 29, 47, 0.08);
}

.composer-card,
.list-card {
  padding: 24px;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.section-heading span,
.note-date {
  font-size: 13px;
  font-weight: 600;
  color: #6d7a92;
}

.composer-card label,
.search-field {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #26334d;
}

.composer-card label + label {
  margin-top: 16px;
}

input,
textarea,
button {
  font: inherit;
}

input,
textarea {
  width: 100%;
  margin-top: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(35, 49, 77, 0.12);
  border-radius: 18px;
  background: rgba(248, 250, 255, 0.96);
  color: #162033;
  box-sizing: border-box;
}

textarea {
  resize: vertical;
  min-height: 140px;
}

button {
  border: 0;
  border-radius: 999px;
  padding: 14px 20px;
  margin-top: 18px;
  font-weight: 700;
  background: #162033;
  color: #fff;
  cursor: pointer;
}

button.ghost {
  margin-top: 0;
  padding: 10px 14px;
  background: rgba(22, 32, 51, 0.08);
  color: #162033;
}

.notes-list {
  display: grid;
  gap: 16px;
}

.note-card {
  padding: 18px;
}

.note-card h3,
.section-heading h2 {
  margin: 0;
}

.note-card-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.note-card p {
  margin: 0;
  line-height: 1.7;
  color: #4f5d78;
}

.note-card.empty {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.64);
}

@media (max-width: 860px) {
  .notes-grid {
    grid-template-columns: 1fr;
  }

  .notes-shell {
    padding-inline: 16px;
  }
}
`;
}

export function buildNotesIndexCssTemplate(): string {
    return `:root {
  font-family: "Segoe UI", "SF Pro Display", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #162033;
  background: #fffdf7;
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

a {
  color: inherit;
}
`;
}

