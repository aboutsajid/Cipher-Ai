export function buildKanbanBoardTsxTemplate(title: string): string {
    return `import { useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type LaneId = "todo" | "in-progress" | "done";

type Card = {
  id: number;
  title: string;
  lane: LaneId;
};

const initialCards: Card[] = [
  { id: 1, title: "Draft launch checklist", lane: "todo" },
  { id: 2, title: "Review release notes", lane: "in-progress" },
  { id: 3, title: "Ship onboarding copy", lane: "done" }
];

const lanes: Array<{ id: LaneId; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "in-progress", label: "In Progress" },
  { id: "done", label: "Done" }
];

function App() {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [draft, setDraft] = useState("");

  function addTask(event: FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setCards((current) => [...current, { id: Date.now(), title, lane: "todo" }]);
    setDraft("");
  }

  function moveCard(cardId: number, lane: LaneId) {
    setCards((current) => current.map((card) => card.id === cardId ? { ...card, lane } : card));
  }

  return (
    <main className="kanban-shell">
      <section className="kanban-header">
        <div>
          <p className="eyebrow">Workflow board</p>
          <h1>${title}</h1>
          <p className="lede">Track incoming work, shift priorities, and move tasks cleanly between lanes.</p>
        </div>
        <form className="task-form" onSubmit={addTask}>
          <label htmlFor="task-title">Add task</label>
          <div className="task-form-row">
            <input
              id="task-title"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Prepare launch assets"
            />
            <button type="submit">Add task</button>
          </div>
        </form>
      </section>

      <section className="kanban-grid">
        {lanes.map((lane) => (
          <article key={lane.id} className="kanban-lane">
            <header>
              <h2>{lane.label}</h2>
              <span>{cards.filter((card) => card.lane === lane.id).length}</span>
            </header>
            <div className="kanban-cards">
              {cards.filter((card) => card.lane === lane.id).map((card) => (
                <div key={card.id} className="kanban-card">
                  <strong>{card.title}</strong>
                  <div className="kanban-actions">
                    {lanes.filter((target) => target.id !== card.lane).map((target) => (
                      <button key={target.id} type="button" onClick={() => moveCard(card.id, target.id)}>
                        Move to {target.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
`;
  }

export function buildKanbanBoardCssTemplate(): string {
    return `.kanban-shell {
  min-height: 100vh;
  padding: 40px;
  background:
    radial-gradient(circle at top left, rgba(255, 196, 94, 0.18), transparent 28%),
    linear-gradient(180deg, #f5f1e8 0%, #e7edf3 100%);
  color: #162033;
}

.kanban-header {
  display: grid;
  grid-template-columns: 1.3fr minmax(280px, 360px);
  gap: 24px;
  align-items: start;
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.8rem;
  color: #a04d24;
}

.kanban-header h1,
.kanban-lane h2 {
  margin: 0;
}

.lede {
  margin: 12px 0 0;
  max-width: 56ch;
  line-height: 1.7;
  color: #465467;
}

.task-form,
.kanban-lane {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(22, 32, 51, 0.08);
  border-radius: 28px;
  padding: 22px;
  box-shadow: 0 24px 60px rgba(22, 32, 51, 0.08);
}

.task-form label {
  display: block;
  margin-bottom: 10px;
  font-weight: 700;
}

.task-form-row {
  display: flex;
  gap: 12px;
}

.task-form input {
  flex: 1;
  border: 1px solid rgba(22, 32, 51, 0.15);
  border-radius: 16px;
  padding: 14px 16px;
  font: inherit;
}

.task-form button,
.kanban-actions button {
  border: none;
  border-radius: 999px;
  padding: 12px 16px;
  font: inherit;
  font-weight: 700;
  background: #162033;
  color: #fff;
  cursor: pointer;
}

.kanban-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.kanban-lane header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.kanban-lane header span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #f0ede6;
  font-weight: 700;
}

.kanban-cards {
  display: grid;
  gap: 14px;
}

.kanban-card {
  border-radius: 20px;
  padding: 16px;
  background: #f8fafc;
  border: 1px solid rgba(22, 32, 51, 0.08);
}

.kanban-card strong {
  display: block;
  margin-bottom: 14px;
}

.kanban-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.kanban-actions button {
  background: #e8eef5;
  color: #162033;
}

@media (max-width: 980px) {
  .kanban-header,
  .kanban-grid {
    grid-template-columns: 1fr;
  }

  .kanban-shell {
    padding: 24px;
  }

  .task-form-row {
    flex-direction: column;
  }
}
`;
  }

export function buildKanbanBoardIndexCssTemplate(): string {
    return `:root {
  font-family: "Segoe UI", "Aptos", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #162033;
  background: #edf2f7;
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

export function buildStaticKanbanHtmlTemplate(title: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="kanban-shell">
      <section class="kanban-header">
        <div>
          <p class="eyebrow">Workflow board</p>
          <h1>${title}</h1>
          <p class="lede">Track tasks and move them between todo, in progress, and done.</p>
        </div>
        <form id="task-form" class="task-form">
          <label for="task-title">Add task</label>
          <div class="task-form-row">
            <input id="task-title" placeholder="Prepare launch assets" />
            <button type="submit">Add task</button>
          </div>
        </form>
      </section>
      <section class="kanban-grid">
        <article class="kanban-lane"><header><h2>Todo</h2><span id="todo-count">1</span></header><div id="todo-list" class="kanban-cards"></div></article>
        <article class="kanban-lane"><header><h2>In Progress</h2><span id="progress-count">1</span></header><div id="progress-list" class="kanban-cards"></div></article>
        <article class="kanban-lane"><header><h2>Done</h2><span id="done-count">1</span></header><div id="done-list" class="kanban-cards"></div></article>
      </section>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
  }

export function buildStaticKanbanCssTemplate(): string {
  return buildKanbanBoardCssTemplate();
}

export function buildStaticKanbanJsTemplate(): string {
    return `const state = [
  { id: 1, title: "Draft checklist", lane: "todo" },
  { id: 2, title: "Review blockers", lane: "progress" },
  { id: 3, title: "Publish recap", lane: "done" }
];

const lanes = {
  todo: document.getElementById("todo-list"),
  progress: document.getElementById("progress-list"),
  done: document.getElementById("done-list")
};

function moveCard(id, lane) {
  const card = state.find((entry) => entry.id === id);
  if (!card) return;
  card.lane = lane;
  renderBoard();
}

function renderBoard() {
  Object.values(lanes).forEach((lane) => {
    if (lane) lane.replaceChildren();
  });

  state.forEach((card) => {
    const wrapper = document.createElement("div");
    wrapper.className = "kanban-card";

    const title = document.createElement("strong");
    title.textContent = card.title;
    wrapper.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "kanban-actions";
    [["todo", "Todo"], ["progress", "In Progress"], ["done", "Done"]]
      .filter(([lane]) => lane !== card.lane)
      .forEach(([lane, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Move to " + label;
        button.addEventListener("click", () => moveCard(card.id, lane));
        actions.appendChild(button);
      });

    wrapper.appendChild(actions);
    lanes[card.lane]?.appendChild(wrapper);
  });

  document.getElementById("todo-count").textContent = String(state.filter((card) => card.lane === "todo").length);
  document.getElementById("progress-count").textContent = String(state.filter((card) => card.lane === "progress").length);
  document.getElementById("done-count").textContent = String(state.filter((card) => card.lane === "done").length);
}

document.getElementById("task-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("task-title");
  const title = input?.value?.trim();
  if (!title) return;
  state.push({ id: Date.now(), title, lane: "todo" });
  input.value = "";
  renderBoard();
});

renderBoard();
`;
  }

