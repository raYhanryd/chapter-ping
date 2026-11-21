import { Link, Navigate } from "react-router-dom";
import { useDiscordSignIn, useMe, useStatus } from "../lib/queries";

const REPO = "https://github.com/raYhanryd/chapter-ping";

const STEPS = [
  {
    title: "Sign in with Discord",
    body: "One click, no password. We ask Discord for your name and avatar and nothing else.",
  },
  {
    title: "Add a channel",
    body: "Create a webhook in the Discord channel you want pinged, paste it in, and optionally name a role to mention.",
  },
  {
    title: "Pick your series",
    body: "Search weebcentral from inside Chapter Ping, choose a cover, and send it to a channel.",
  },
  {
    title: "Get the ping",
    body: "New chapters are checked every 30 minutes and posted once. No duplicates, no refreshing.",
  },
];

const FEATURES = [
  {
    title: "Search without leaving",
    body: "Look up any series with its cover and title inside the app. No second tab, no copying links.",
  },
  {
    title: "Five series per account",
    body: "Enough for the ones you actually follow, and it keeps every check fast for everyone.",
  },
  {
    title: "Two Discord destinations",
    body: "Send different series to different channels, each with its own optional role ping.",
  },
  {
    title: "A real delivery log",
    body: "Every send, retry and failure is recorded with its chapter, channel and timestamp.",
  },
  {
    title: "Test before you trust it",
    body: "Fire a test message at any destination to confirm the webhook and role work first.",
  },
  {
    title: "Delete anything",
    body: "Remove a series, a destination or your whole account from Settings. Deleted means deleted.",
  },
];

const LIMITS = [
  { label: "Accounts in the launch", value: "100" },
  { label: "Series per account", value: "5" },
  { label: "Discord destinations", value: "2" },
  { label: "Active series, all accounts", value: "150" },
  { label: "Check interval", value: "Every 30 minutes" },
  { label: "Price", value: "Free, no card" },
];

const QUESTIONS = [
  {
    title: "Is it really free?",
    body: "Yes. There is no paid tier, no card and no ads. The 100-account cap is what keeps it running on a free tier.",
  },
  {
    title: "What does it ask Discord for?",
    body: "Your name and avatar. Not your email, not your server list, not your messages.",
  },
  {
    title: "What happens when the spots fill?",
    body: "Sign-in keeps working, but new accounts wait on a list and are let in as places free up. Existing accounts keep their series and channels.",
  },
  {
    title: "Where do the alerts go?",
    body: "To a webhook you create in your own Discord channel. It is stored encrypted and never shown back to you.",
  },
];

export function Landing() {
  const me = useMe();
  const status = useStatus();
  const signIn = useDiscordSignIn();

  if (me.isSuccess) return <Navigate to="/dashboard" replace />;

  const used = status.data?.accountsUsed ?? 0;
  const max = status.data?.accountsMax ?? 0;
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const remaining = Math.max(0, max - used);

  return (
    <div className="landing-shell">
      <header className="site-head">
        <Link className="wordmark" to="/">
          Chapter Ping
        </Link>
        <Link className="quiet-link" to="/login">
          Sign in
        </Link>
      </header>

      <main className="landing">
        <section className="landing-hero">
          <div className="landing-copy">
            <p className="launch-badge">
              <span className="launch-dot" aria-hidden="true" />
              Free launch — first 100 accounts only
            </p>

            <h1 className="landing-title">Chapter alerts that land in Discord</h1>
            <p className="landing-lede">
              Chapter Ping watches the series you read on weebcentral and posts to Discord the moment a
              new chapter is out — chapter number, title and a link, with an optional role ping. Set it
              up once, then stop refreshing.
            </p>

            <div className="landing-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void signIn.start()}
                disabled={signIn.pending}
              >
                {signIn.pending ? "Opening Discord…" : "Continue with Discord"}
              </button>
              <span className="landing-note">No credit card, no ads, no server to run.</span>
            </div>

            {signIn.error ? (
              <p className="field-error" role="alert">
                {signIn.error}
              </p>
            ) : null}

            <div className="launch-capacity">
              {status.data ? (
                <>
                  <div
                    className="capacity-meter"
                    role="progressbar"
                    aria-label="Launch spots in use"
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-valuenow={used}
                  >
                    <span className="capacity-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="capacity num">
                    {`${used} of ${max} launch spots in use.`}
                  </p>
                  <p className="capacity-left">
                    {remaining === 0
                      ? "Launch capacity is full — new sign-ins join the waitlist."
                      : `${remaining} ${remaining === 1 ? "spot" : "spots"} left in the free launch.`}
                  </p>
                </>
              ) : (
                <p className="capacity">
                  {status.isError ? "Capacity is unavailable right now." : "Checking availability…"}
                </p>
              )}
            </div>
          </div>

          <aside className="specimen" aria-label="Example alert">
            <p className="specimen-label">Example alert</p>
            <div className="specimen-rule" />
            <p className="specimen-series">One Piece</p>
            <p className="specimen-chapter num">1132</p>
            <p className="specimen-copy">A new chapter is out.</p>
            <div className="specimen-foot">
              <span>Discord</span>
              <span className="num">Today, 10:00</span>
            </div>
          </aside>
        </section>

        <section className="landing-section" aria-labelledby="how-it-works">
          <header className="section-head">
            <p className="section-kicker num">01 — How it works</p>
            <h2 id="how-it-works">Set it up once, then forget it</h2>
            <p className="section-lede">
              Four short steps. After that the checks run on a schedule, whether the tab is open or not.
            </p>
          </header>

          <ol className="steps">
            {STEPS.map((step, index) => (
              <li className="step" key={step.title}>
                <span className="step-num num">{`0${index + 1}`}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="what-you-get">
          <header className="section-head">
            <p className="section-kicker num">02 — What you get</p>
            <h2 id="what-you-get">Everything the refresh loop was doing, done for you</h2>
            <p className="section-lede">
              A small, sharp tool rather than a dashboard: search, track, deliver, and show you what
              happened.
            </p>
          </header>

          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article className="feature" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" aria-labelledby="launch-limits">
          <div className="limits-panel">
            <div>
              <p className="section-kicker num">03 — Launch limits</p>
              <h2 id="launch-limits">A free launch, capped at 100 accounts</h2>
              <p className="limits-copy">
                Chapter Ping runs on a free tier, so the launch is deliberately small. The first 100
                Discord accounts get in. When those spots are gone, new sign-ins join a waitlist and are
                let in as places free up.
              </p>
              <p className="limits-copy">
                Nothing is charged, nothing is advertised, and nothing is sold. The caps are the deal.
              </p>
            </div>

            <dl className="limits-list">
              {LIMITS.map((limit) => (
                <div className="limit-row" key={limit.label}>
                  <dt>{limit.label}</dt>
                  <dd className="num">{limit.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="questions">
          <header className="section-head">
            <p className="section-kicker num">04 — Questions</p>
            <h2 id="questions">The short answers</h2>
          </header>

          <div className="faq">
            {QUESTIONS.map((question) => (
              <article className="faq-item" key={question.title}>
                <h3>{question.title}</h3>
                <p>{question.body}</p>
              </article>
            ))}
          </div>
        </section>

        <hr className="rule landing-rule" />

        <footer className="site-foot">
          <nav aria-label="Legal and source">
            <a href={`${REPO}/blob/main/PRIVACY.md`}>Privacy</a>
            <a href={`${REPO}/blob/main/TERMS.md`}>Terms</a>
            <a href={REPO}>Source</a>
          </nav>
          <p>Not affiliated with weebcentral or Discord.</p>
        </footer>
      </main>
    </div>
  );
}
