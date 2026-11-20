import { Link, Navigate } from "react-router-dom";
import { useMe, useStatus } from "../lib/queries";

export function Waitlist() {
  const me = useMe();
  const status = useStatus();

  if (me.isSuccess && !me.data.waitlisted) return <Navigate to="/dashboard" replace />;
  if (!me.isSuccess && status.data?.acceptingUsers) return <Navigate to="/login" replace />;
  if (me.isPending) {
    return (
      <div className="auth-shell" aria-busy="true" aria-label="Loading">
        <div className="skeleton-page" />
      </div>
    );
  }

  const signedIn = me.isSuccess;
  const counts = status.data
    ? `${status.data.accountsUsed} of ${status.data.accountsMax} launch spots in use.`
    : "Checking availability…";

  return (
    <div className="auth-shell">
      <header className="site-head">
        <Link className="wordmark" to="/">
          Chapter Tracker
        </Link>
      </header>

      <main className="auth-panel auth-panel-wide">
        <p className="capacity num">{counts}</p>
        <h1>{signedIn ? "You're on the waitlist." : "Launch capacity is full"}</h1>
        {signedIn ? (
          <p>
            Your account is saved. When a spot opens, sign in and add your first series. Your place is
            kept by your Discord account.
          </p>
        ) : (
          <p>
            The free launch runs on a fixed number of accounts and tracked series. Existing accounts are
            unaffected. Sign-in reopens when a spot frees up.
          </p>
        )}

        {signedIn ? (
          <Link className="btn btn-primary btn-block" to="/dashboard">
            Back to your series
          </Link>
        ) : (
          <>
            <Link className="btn btn-primary btn-block" to="/login">
              Continue with Discord
            </Link>
            <Link className="quiet-link" to="/">
              Back to the front page
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
