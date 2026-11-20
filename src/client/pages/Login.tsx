import { Link, Navigate, useSearchParams } from "react-router-dom";
import { safeNextPath } from "../lib/navigation";
import { useDiscordSignIn, useMe } from "../lib/queries";

export function Login() {
  const me = useMe();
  const [params] = useSearchParams();
  const signIn = useDiscordSignIn();
  const failed = params.has("error");
  const next = safeNextPath(params.get("next"));

  if (me.isSuccess) return <Navigate to={next} replace />;

  const error = signIn.error ?? (failed ? "Discord sign-in did not finish. Try again." : null);

  return (
    <div className="auth-shell">
      <header className="site-head">
        <Link className="wordmark" to="/">
          Chapter Ping
        </Link>
      </header>

      <main className="auth-panel">
        <h1>Sign in with Discord</h1>
        <p>
          We ask Discord for your name and avatar, nothing else. You will come back here signed in, with
          your series and destinations waiting.
        </p>

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => void signIn.start(next)}
          disabled={signIn.pending}
        >
          {signIn.pending ? "Opening Discord…" : "Continue with Discord"}
        </button>

        <Link className="quiet-link" to="/">
          Back to the front page
        </Link>
      </main>
    </div>
  );
}
