import { Link, Navigate } from "react-router-dom";
import { useDiscordSignIn, useMe, useStatus } from "../lib/queries";

const REPO = "https://github.com/raYhanryd/chapter-ping";

export function Landing() {
  const me = useMe();
  const status = useStatus();
  const signIn = useDiscordSignIn();

  if (me.isSuccess) return <Navigate to="/dashboard" replace />;

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
            <h1 className="landing-title">Chapter alerts that land in Discord</h1>
            <p className="landing-lede">
              Track the series you read on weebcentral. When a new chapter appears, Chapter Ping posts
              it to your channel. No refresh loop, no feeds to babysit.
            </p>

            <div className="landing-actions">
              <button type="button" className="btn btn-primary" onClick={() => void signIn.start()} disabled={signIn.pending}>
                {signIn.pending ? "Opening Discord…" : "Continue with Discord"}
              </button>
              <span className="landing-note">Free while in launch capacity. No credit card.</span>
            </div>

            {signIn.error ? (
              <p className="field-error" role="alert">
                {signIn.error}
              </p>
            ) : null}

            <p className="capacity num">
              {status.isError
                ? "Capacity is unavailable right now."
                : status.data
                  ? `${status.data.accountsUsed} of ${status.data.accountsMax} launch spots in use.`
                  : "Checking availability…"}
            </p>
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
