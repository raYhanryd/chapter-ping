import { useState } from "react";

interface SignInResponse {
  url?: string;
  error?: { message?: string };
}

async function startDiscordSignIn(): Promise<string> {
  const response = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "discord" }),
  });

  const body = (await response.json().catch(() => ({}))) as SignInResponse;
  if (!response.ok || !body.url) {
    throw new Error(body.error?.message ?? "Discord sign-in could not start. Try again.");
  }
  return body.url;
}

export function App() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setPending(true);
    setError(null);
    try {
      const url = await startDiscordSignIn();
      window.location.assign(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord sign-in could not start. Try again.");
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="label">Chapter Tracker</p>
      <h1 className="display text-5xl leading-[1.05]">
        Your manga releases, without the refresh loop.
      </h1>
      <p className="max-w-xl text-base text-[var(--ink-soft)]">
        Track weebcentral series. Get a clean Discord alert when a new chapter lands.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSignIn}
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--accent)] px-5 text-base font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Opening Discord…" : "Continue with Discord"}
        </button>
        <span className="label">Free while in launch capacity. No credit card.</span>
      </div>
      {error ? (
        <p role="alert" className="text-base text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <hr className="rule" />
      <p className="label">Foundation milestone - the dashboard arrives in Milestone 5.</p>
    </main>
  );
}
