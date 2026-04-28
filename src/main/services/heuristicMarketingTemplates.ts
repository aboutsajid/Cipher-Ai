export function buildPricingPageTsxTemplate(title: string): string {
    return `import "./App.css";

const plans = [
  {
    name: "Starter",
    price: "$19",
    description: "For solo launches that need a clean starting point.",
    features: ["1 project", "Basic analytics", "Email support"]
  },
  {
    name: "Growth",
    price: "$49",
    description: "For teams that want stronger collaboration and faster iteration.",
    features: ["5 projects", "Team seats", "Priority support"],
    featured: true
  },
  {
    name: "Scale",
    price: "$99",
    description: "For product teams shipping multiple launch surfaces.",
    features: ["Unlimited projects", "Advanced controls", "Dedicated onboarding"]
  }
];

const comparisons = [
  { label: "Launch-ready hero", starter: "Included", growth: "Included", scale: "Included" },
  { label: "Plan comparison", starter: "Basic", growth: "Detailed", scale: "Detailed" },
  { label: "Contact CTA", starter: "Email", growth: "Priority", scale: "Dedicated" }
];

function App() {
  return (
    <main className="pricing-shell">
      <section className="pricing-hero">
        <div className="pricing-copy">
          <p className="eyebrow">Built with Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">
            A pricing page with a clear hero section, three pricing cards, a comparison table, and a contact CTA.
          </p>
          <div className="hero-actions">
            <a className="primary" href="#plans">See pricing</a>
            <a className="secondary" href="#contact">Contact sales</a>
          </div>
        </div>
        <aside className="pricing-hero-aside">
          <span className="hero-aside-label">Comparison snapshot</span>
          <strong>Pick a plan that fits the stage you are in.</strong>
          <p>Start simple, move fast, and keep an upgrade path visible from the first screen.</p>
        </aside>
      </section>

      <section id="plans" className="pricing-grid">
        {plans.map((plan) => (
          <article key={plan.name} className={\`pricing-card\${plan.featured ? " featured" : ""}\`}>
            <p className="plan-name">{plan.name}</p>
            <h2>{plan.price}<span>/mo</span></h2>
            <p>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <a href="#contact">{plan.featured ? "Talk to sales" : "Choose plan"}</a>
          </article>
        ))}
      </section>

      <section className="comparison-card">
        <div className="section-heading">
          <p className="eyebrow">Comparison</p>
          <h2>Compare the plans quickly.</h2>
        </div>
        <div className="comparison-table">
          <div className="comparison-head">
            <span>Feature</span>
            <span>Starter</span>
            <span>Growth</span>
            <span>Scale</span>
          </div>
          {comparisons.map((item) => (
            <div key={item.label} className="comparison-row">
              <span>{item.label}</span>
              <span>{item.starter}</span>
              <span>{item.growth}</span>
              <span>{item.scale}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="contact-cta">
        <div>
          <p className="eyebrow">Contact CTA</p>
          <h2>Need a tailored rollout?</h2>
          <p>Contact sales for onboarding, migration help, and pricing guidance for larger teams.</p>
        </div>
        <a href="mailto:sales@cipher.local">Contact sales</a>
      </section>
    </main>
  );
}

export default App;
`;
}

export function buildPricingPageCssTemplate(): string {
    return `.pricing-shell {
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
  padding: 48px 0 72px;
  display: grid;
  gap: 24px;
}

.pricing-hero,
.comparison-card,
.contact-cta,
.pricing-card {
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.08);
}

.pricing-hero {
  display: grid;
  grid-template-columns: 1.5fr 0.9fr;
  gap: 24px;
  padding: 36px;
}

.pricing-copy h1 {
  margin: 0;
  font-size: clamp(3rem, 6vw, 4.75rem);
  line-height: 0.95;
}

.lede {
  margin: 18px 0 0;
  font-size: 1.15rem;
  line-height: 1.8;
  color: #475569;
  max-width: 56ch;
}

.eyebrow,
.hero-aside-label,
.plan-name {
  margin: 0 0 14px;
  font-size: 0.82rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #4361ee;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}

.hero-actions a,
.pricing-card a,
.contact-cta a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  border-radius: 999px;
  padding: 14px 20px;
  font-weight: 700;
}

.hero-actions .primary,
.contact-cta a,
.pricing-card.featured a {
  background: #1f3a8a;
  color: #fff;
}

.hero-actions .secondary,
.pricing-card a {
  background: #e2e8f0;
  color: #1e293b;
}

.pricing-hero-aside {
  background: #1e2f55;
  color: #e2e8f0;
  border-radius: 24px;
  padding: 24px;
}

.pricing-hero-aside strong {
  display: block;
  margin-bottom: 16px;
  font-size: 2rem;
  line-height: 1.1;
  color: #fff;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.pricing-card {
  padding: 28px;
}

.pricing-card.featured {
  border-color: rgba(67, 97, 238, 0.45);
  transform: translateY(-6px);
}

.pricing-card h2 {
  margin: 0 0 12px;
  font-size: 2.5rem;
}

.pricing-card h2 span {
  font-size: 1rem;
  color: #64748b;
}

.pricing-card ul {
  margin: 20px 0;
  padding-left: 18px;
  color: #475569;
  line-height: 1.8;
}

.comparison-card,
.contact-cta {
  padding: 30px 32px;
}

.comparison-table {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

.comparison-head,
.comparison-row {
  display: grid;
  grid-template-columns: 1.4fr repeat(3, 1fr);
  gap: 16px;
  padding: 14px 0;
}

.comparison-head {
  font-weight: 700;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}

.comparison-row {
  color: #475569;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.contact-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.contact-cta h2 {
  margin: 0 0 10px;
  font-size: clamp(2rem, 4vw, 2.8rem);
}

@media (max-width: 980px) {
  .pricing-shell {
    width: min(100% - 32px, 1120px);
    padding: 28px 0 56px;
  }

  .pricing-hero,
  .pricing-grid,
  .contact-cta,
  .comparison-head,
  .comparison-row {
    grid-template-columns: 1fr;
  }

  .pricing-hero {
    padding: 24px;
  }

  .comparison-head {
    display: none;
  }

  .comparison-row {
    padding: 16px;
    border-radius: 18px;
    background: rgba(241, 245, 249, 0.85);
  }
}
`;
}

export function buildAnnouncementPageTsxTemplate(title: string): string {
    return `import "./App.css";

const updates = [
  {
    title: "Faster rollout checks",
    detail: "Review launch readiness with clearer signals before shipping changes."
  },
  {
    title: "Sharper team visibility",
    detail: "Highlight major updates in a format that product, design, and engineering can all scan quickly."
  },
  {
    title: "Safer follow-through",
    detail: "Keep a visible path from announcement to adoption with a direct contact CTA."
  }
];

const timeline = [
  { phase: "Internal preview", date: "Week 1", detail: "Validate messaging, QA the experience, and collect team feedback." },
  { phase: "Limited rollout", date: "Week 2", detail: "Release to a smaller audience and confirm adoption signals." },
  { phase: "Full launch", date: "Week 4", detail: "Publish broadly with support, docs, and follow-up communication ready." }
];

function App() {
  return (
    <main className="announce-shell">
      <section className="announce-hero">
        <div className="announce-copy">
          <p className="eyebrow">Built with Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">
            A feature announcement page with a strong hero section, three update cards, a rollout timeline, and a contact CTA.
          </p>
          <div className="announce-actions">
            <a className="primary" href="#updates">See updates</a>
            <a className="secondary" href="#contact">Contact the team</a>
          </div>
        </div>
        <aside className="announce-aside">
          <span className="hero-aside-label">Release snapshot</span>
          <strong>Ship a cleaner announcement with a visible rollout plan.</strong>
          <p>Make the value clear first, then show what changes, when it rolls out, and who to contact.</p>
        </aside>
      </section>

      <section id="updates" className="announce-cards">
        {updates.map((update) => (
          <article key={update.title} className="announce-card">
            <h2>{update.title}</h2>
            <p>{update.detail}</p>
          </article>
        ))}
      </section>

      <section className="timeline-card">
        <div className="section-heading">
          <p className="eyebrow">Rollout timeline</p>
          <h2>How this update rolls out.</h2>
        </div>
        <div className="timeline-list">
          {timeline.map((item) => (
            <article key={item.phase} className="timeline-item">
              <span>{item.date}</span>
              <strong>{item.phase}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="contact" className="contact-cta">
        <div>
          <p className="eyebrow">Contact CTA</p>
          <h2>Need rollout support?</h2>
          <p>Contact the product team for launch planning, messaging alignment, and stakeholder updates.</p>
        </div>
        <a href="mailto:launch@cipher.local">Contact the team</a>
      </section>
    </main>
  );
}

export default App;
`;
}

export function buildAnnouncementPageCssTemplate(): string {
    return `.announce-shell {
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
  padding: 48px 0 72px;
  display: grid;
  gap: 24px;
}

.announce-hero,
.announce-card,
.timeline-card,
.contact-cta {
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.08);
}

.announce-hero {
  display: grid;
  grid-template-columns: 1.45fr 0.85fr;
  gap: 24px;
  padding: 36px;
}

.announce-copy h1 {
  margin: 0;
  font-size: clamp(3rem, 6vw, 4.6rem);
  line-height: 0.95;
}

.lede {
  margin: 18px 0 0;
  font-size: 1.1rem;
  line-height: 1.8;
  color: #475569;
  max-width: 58ch;
}

.eyebrow,
.hero-aside-label {
  margin: 0 0 14px;
  font-size: 0.82rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #4361ee;
}

.announce-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}

.announce-actions a,
.contact-cta a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  border-radius: 999px;
  padding: 14px 20px;
  font-weight: 700;
}

.announce-actions .primary,
.contact-cta a {
  background: #1f3a8a;
  color: #fff;
}

.announce-actions .secondary {
  background: #e2e8f0;
  color: #1e293b;
}

.announce-aside {
  background: #1e2f55;
  color: #e2e8f0;
  border-radius: 24px;
  padding: 24px;
}

.announce-aside strong {
  display: block;
  margin-bottom: 16px;
  font-size: 2rem;
  line-height: 1.1;
  color: #fff;
}

.announce-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.announce-card,
.timeline-card,
.contact-cta {
  padding: 28px;
}

.announce-card h2,
.timeline-card h2,
.contact-cta h2 {
  margin: 0 0 12px;
}

.announce-card p,
.timeline-item p,
.contact-cta p {
  color: #475569;
  line-height: 1.75;
}

.timeline-list {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.timeline-item {
  display: grid;
  gap: 6px;
  padding: 18px 20px;
  border-radius: 20px;
  background: rgba(241, 245, 249, 0.78);
}

.timeline-item span {
  font-size: 0.82rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4361ee;
}

.timeline-item strong {
  font-size: 1.15rem;
  color: #1e293b;
}

.contact-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

@media (max-width: 980px) {
  .announce-shell {
    width: min(100% - 32px, 1120px);
    padding: 28px 0 56px;
  }

  .announce-hero,
  .announce-cards,
  .contact-cta {
    grid-template-columns: 1fr;
  }

  .announce-hero {
    padding: 24px;
  }
}
`;
}

export function buildLandingPageTsxTemplate(title: string): string {
    return `import "./App.css";

const highlights = [
  { value: "3 days", label: "to launch campaign-ready copy" },
  { value: "12 sections", label: "that already tell a clean story" },
  { value: "94%", label: "preview-ready polish out of the box" }
];

const features = [
  { title: "Message with momentum", text: "Hero, proof, and CTA blocks are composed to feel intentional instead of placeholder-heavy." },
  { title: "Designed to scan", text: "Big typography, clean spacing, and soft surfaces make the page feel presentable in preview immediately." },
  { title: "Structured for iteration", text: "Each section is ready for product-specific copy, brand color tuning, and launch edits." }
];

function App() {
  return (
    <main className="landing-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Built with Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">
            A sharper landing page starter with stronger hierarchy, richer surfaces, and a preview that feels closer to a real launch draft.
          </p>
          <div className="hero-actions">
            <button type="button">Start free</button>
            <a href="#details">See the features</a>
            <a href="#contact">Contact sales</a>
          </div>
        </div>

        <aside className="hero-aside">
          <span className="hero-aside-label">Launch snapshot</span>
          <strong>Ready to position</strong>
          <p>Use this shell for product launches, studio pages, founder announcements, or campaign microsites.</p>
          <div className="hero-pulse">
            <span></span>
            Preview-friendly
          </div>
        </aside>
      </section>

      <section className="stats-strip">
        {highlights.map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className="section-head">
        <p className="eyebrow">Features</p>
        <h2>Feature cards that explain the value fast.</h2>
      </section>

      <section id="details" className="feature-grid">
        {features.map((item) => (
          <article key={item.title} className="feature-card">
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="story">
        <div>
          <p className="eyebrow">Why it lands better</p>
          <h2>Intentional launch framing beats a blank starter.</h2>
        </div>
        <p>
          The page opens with a strong frame, reinforces trust with clean metrics, and uses benefit cards that feel like a real draft instead of generic filler text.
        </p>
      </section>

      <section id="contact" className="contact-card">
        <div>
          <p className="eyebrow">Contact</p>
          <h2>Ready to turn this into a launch-ready contact CTA?</h2>
          <p className="contact-copy">Talk to the team, request a walkthrough, or line up the next revision directly from this contact section.</p>
        </div>
        <div className="contact-actions">
          <button type="button">Contact sales</button>
          <a href="mailto:hello@${title.toLowerCase().replace(/\s+/g, "")}.com">hello@${title.toLowerCase().replace(/\s+/g, "")}.com</a>
        </div>
      </section>
    </main>
  );
}

export default App;
`;
}

export function buildStaticLandingHtmlTemplate(title: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="landing-shell">
      <section class="hero-card">
        <div class="hero-copy">
          <p class="eyebrow">Built with Cipher Workspace</p>
          <h1>${title}</h1>
          <p class="lede">A stronger static landing page starter with better hierarchy, richer cards, and a more presentable preview state.</p>
          <div class="hero-actions">
            <button id="cta" type="button">Start free</button>
            <a href="#details">See the features</a>
            <a href="#contact">Contact sales</a>
          </div>
        </div>

        <aside class="hero-aside">
          <span class="hero-aside-label">Launch snapshot</span>
          <strong>Ready to position</strong>
          <p>Use this shell for campaigns, product announcements, studio sites, or early launch drafts.</p>
          <div class="hero-pulse"><span></span>Preview-friendly</div>
        </aside>
      </section>

      <section class="stats-strip">
        <div><strong>3 days</strong><span>to campaign-ready copy</span></div>
        <div><strong>12 sections</strong><span>that already tell a clear story</span></div>
        <div><strong>94%</strong><span>preview polish from the first run</span></div>
      </section>

      <section class="section-head">
        <p class="eyebrow">Features</p>
        <h2>Feature cards that explain the value fast.</h2>
      </section>

      <section id="details" class="feature-grid">
        <article class="feature-card"><h2>Message with momentum</h2><p>Hero, proof, and CTA blocks are composed to feel intentional instead of placeholder-heavy.</p></article>
        <article class="feature-card"><h2>Designed to scan</h2><p>Large typography, balanced spacing, and soft surfaces make the page feel presentation-ready.</p></article>
        <article class="feature-card"><h2>Structured for iteration</h2><p>Each section is ready for product-specific copy, brand tuning, and launch refinement.</p></article>
      </section>

      <section class="story">
        <div>
          <p class="eyebrow">Why it lands better</p>
          <h2>Intentional launch framing beats a blank starter.</h2>
        </div>
        <p id="status">This starter opens with a strong frame, reinforces trust quickly, and gives you a cleaner preview before product-specific edits.</p>
      </section>

      <section id="contact" class="contact-card">
        <div>
          <p class="eyebrow">Contact</p>
          <h2>Ready to turn this into a launch-ready contact CTA?</h2>
          <p class="contact-copy">Talk to the team, request a walkthrough, or line up the next revision directly from this contact section.</p>
        </div>
        <div class="contact-actions">
          <button type="button">Contact sales</button>
          <a href="mailto:hello@${title.toLowerCase().replace(/\s+/g, "")}.com">hello@${title.toLowerCase().replace(/\s+/g, "")}.com</a>
        </div>
      </section>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
}

export function buildStaticLandingCssTemplate(): string {
    return `.landing-shell {
  min-height: 100vh;
  padding: 34px 20px 72px;
  background:
    radial-gradient(circle at top left, rgba(100, 173, 255, 0.2), transparent 26%),
    radial-gradient(circle at top right, rgba(255, 196, 119, 0.28), transparent 22%),
    linear-gradient(180deg, #f7f8fc 0%, #edf3ff 100%);
  color: #132238;
}

.hero-card,
.section-head,
.stats-strip,
.feature-grid,
.story,
.contact-card {
  width: min(1140px, 100%);
  margin: 0 auto;
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) 320px;
  gap: 18px;
  align-items: stretch;
  padding: 18px;
  border: 1px solid rgba(19, 34, 56, 0.08);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 24px 80px rgba(17, 30, 48, 0.08);
  backdrop-filter: blur(14px);
}

.hero-copy {
  padding: 34px 18px 24px;
}

.hero-aside {
  padding: 24px;
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(20, 34, 56, 0.94), rgba(36, 57, 92, 0.9)),
    #132238;
  color: #ecf4ff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
}

.hero-aside-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(236, 244, 255, 0.64);
}

.hero-aside strong {
  font-size: 28px;
  line-height: 1.05;
}

.hero-aside p {
  margin: 0;
  line-height: 1.7;
  color: rgba(236, 244, 255, 0.78);
}

.hero-pulse {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
}

.hero-pulse span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #7be0c3;
  box-shadow: 0 0 0 6px rgba(123, 224, 195, 0.18);
}

.eyebrow {
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #4a67db;
}

.hero-card h1,
.story h2,
.feature-card h2 {
  margin: 0;
}

.hero-card h1 {
  max-width: 720px;
  font-size: clamp(52px, 8vw, 88px);
  line-height: 0.92;
  letter-spacing: -0.04em;
}

.lede {
  max-width: 700px;
  margin: 22px 0 0;
  font-size: 20px;
  line-height: 1.75;
  color: #4e5f7c;
}

.hero-actions {
  display: flex;
  gap: 14px;
  margin-top: 26px;
  align-items: center;
}

.hero-actions button,
.hero-actions a {
  border-radius: 999px;
  padding: 14px 24px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.hero-actions button {
  border: 0;
  background: linear-gradient(135deg, #132238 0%, #3558d6 100%);
  color: #fff;
  box-shadow: 0 18px 42px rgba(53, 88, 214, 0.26);
}

.hero-actions a {
  color: #132238;
  background: rgba(19, 34, 56, 0.08);
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.section-head {
  margin-top: 26px;
}

.stats-strip div,
.feature-card,
.story,
.contact-card {
  padding: 24px;
  border: 1px solid rgba(19, 34, 56, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 22px 72px rgba(20, 32, 51, 0.08);
  backdrop-filter: blur(12px);
}

.stats-strip strong {
  display: block;
  font-size: 36px;
}

.stats-strip span {
  color: #60708d;
  line-height: 1.6;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.feature-card p,
.story p {
  margin: 14px 0 0;
  line-height: 1.7;
  color: #51607c;
}

.story {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
  margin-top: 24px;
}

.contact-card {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 24px;
  margin-top: 24px;
}

.contact-copy {
  margin: 14px 0 0;
  line-height: 1.7;
  color: #51607c;
}

.contact-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 14px;
}

.contact-actions button,
.contact-actions a {
  border-radius: 999px;
  padding: 14px 24px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.contact-actions button {
  border: 0;
  background: linear-gradient(135deg, #132238 0%, #3558d6 100%);
  color: #fff;
  box-shadow: 0 18px 42px rgba(53, 88, 214, 0.26);
}

.contact-actions a {
  color: #132238;
  background: rgba(19, 34, 56, 0.08);
}

@media (max-width: 860px) {
  .hero-card,
  .section-head,
  .stats-strip,
  .feature-grid,
  .story,
  .contact-card {
    grid-template-columns: 1fr;
  }

  .hero-copy {
    padding: 28px 8px 16px;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
`;
}

export function buildStaticLandingJsTemplate(title: string): string {
    return `const ctaButton = document.getElementById("cta");
const statusEl = document.getElementById("status");

if (ctaButton && statusEl) {
  ctaButton.addEventListener("click", () => {
    statusEl.textContent = "${title} is now framed as a sharper launch-ready draft with stronger hierarchy and clearer proof blocks.";
  });
}
`;
}

export function buildLandingPageCssTemplate(): string {
    return `.landing-shell {
  min-height: 100vh;
  padding: 34px 20px 72px;
  background:
    radial-gradient(circle at top left, rgba(100, 173, 255, 0.2), transparent 26%),
    radial-gradient(circle at top right, rgba(255, 196, 119, 0.28), transparent 22%),
    linear-gradient(180deg, #f7f8fc 0%, #edf3ff 100%);
  color: #132238;
}

.hero-card,
.section-head,
.stats-strip,
.feature-grid,
.story,
.contact-card {
  width: min(1140px, 100%);
  margin: 0 auto;
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) 320px;
  gap: 18px;
  align-items: stretch;
  padding: 18px;
  border: 1px solid rgba(19, 34, 56, 0.08);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 24px 80px rgba(17, 30, 48, 0.08);
  backdrop-filter: blur(14px);
}

.hero-copy {
  padding: 34px 18px 24px;
}

.hero-aside {
  padding: 24px;
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(20, 34, 56, 0.94), rgba(36, 57, 92, 0.9)),
    #132238;
  color: #ecf4ff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
}

.hero-aside-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(236, 244, 255, 0.64);
}

.hero-aside strong {
  font-size: 28px;
  line-height: 1.05;
}

.hero-aside p {
  margin: 0;
  line-height: 1.7;
  color: rgba(236, 244, 255, 0.78);
}

.hero-pulse {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
}

.hero-pulse span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #7be0c3;
  box-shadow: 0 0 0 6px rgba(123, 224, 195, 0.18);
}

.eyebrow {
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #4a67db;
}

.hero-card h1,
.story h2,
.feature-card h2 {
  margin: 0;
}

.hero-card h1 {
  max-width: 720px;
  font-size: clamp(52px, 8vw, 88px);
  line-height: 0.92;
  letter-spacing: -0.04em;
}

.lede {
  max-width: 700px;
  margin: 22px 0 0;
  font-size: 20px;
  line-height: 1.75;
  color: #4e5f7c;
}

.hero-actions {
  display: flex;
  gap: 14px;
  margin-top: 26px;
  align-items: center;
}

.hero-actions button,
.hero-actions a {
  border-radius: 999px;
  padding: 14px 24px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.hero-actions button {
  border: 0;
  background: linear-gradient(135deg, #132238 0%, #3558d6 100%);
  color: #fff;
  box-shadow: 0 18px 42px rgba(53, 88, 214, 0.26);
}

.hero-actions a {
  color: #132238;
  background: rgba(19, 34, 56, 0.08);
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.section-head {
  margin-top: 26px;
}

.stats-strip div,
.feature-card,
.story,
.contact-card {
  padding: 24px;
  border: 1px solid rgba(19, 34, 56, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 22px 72px rgba(20, 32, 51, 0.08);
  backdrop-filter: blur(12px);
}

.stats-strip strong {
  display: block;
  font-size: 36px;
}

.stats-strip span {
  color: #60708d;
  line-height: 1.6;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.feature-card p,
.story p {
  margin: 14px 0 0;
  line-height: 1.7;
  color: #51607c;
}

.story {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
  margin-top: 24px;
}

.contact-card {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 24px;
  margin-top: 24px;
}

.contact-copy {
  margin: 14px 0 0;
  line-height: 1.7;
  color: #51607c;
}

.contact-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 14px;
}

.contact-actions button,
.contact-actions a {
  border-radius: 999px;
  padding: 14px 24px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.contact-actions button {
  border: 0;
  background: linear-gradient(135deg, #132238 0%, #3558d6 100%);
  color: #fff;
  box-shadow: 0 18px 42px rgba(53, 88, 214, 0.26);
}

.contact-actions a {
  color: #132238;
  background: rgba(19, 34, 56, 0.08);
}

@media (max-width: 860px) {
  .hero-card,
  .section-head,
  .stats-strip,
  .feature-grid,
  .story,
  .contact-card {
    grid-template-columns: 1fr;
  }

  .hero-copy {
    padding: 28px 8px 16px;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
`;
}

export function buildLandingIndexCssTemplate(): string {
    return `:root {
  font-family: "Segoe UI", "Aptos", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #142033;
  background: #fff8ef;
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

