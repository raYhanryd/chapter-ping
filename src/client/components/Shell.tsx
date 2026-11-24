import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, ApiClientError } from "../lib/api";
import { useMe } from "../lib/queries";
import { ErrorBlock, useToast } from "./ui";

const sections = [
  { to: "/dashboard", label: "Series" },
  { to: "/destinations", label: "Destinations" },
  { to: "/activity", label: "Activity" },
  { to: "/settings", label: "Settings" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const endingSession = useRef(false);
  const markSessionEnding = useCallback(() => {
    endingSession.current = true;
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  // Any data query that loses its session goes through the same login redirect,
  // not just the /api/me query. Clearing the cache prevents stale account data
  // from being shown after the next sign-in.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      const error = event.action.error;
      if (endingSession.current) return;
      if (!(error instanceof ApiClientError) || error.status !== 401) return;

      queryClient.removeQueries();
      const next = `${location.pathname}${location.search}`;
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    });
  }, [queryClient, navigate, location.pathname, location.search]);

  const signOut = useMutation({
    mutationFn: api.signOut,
    onSuccess: () => {
      // Mark the session end before clearing; otherwise the shell's 401 handler
      // can redirect to /login while the intentional sign-out is still settling.
      markSessionEnding();
      queryClient.clear();
      navigate("/", { replace: true });
    },
    onError: () => toast("Could not sign out. Try again."),
  });

  if (me.isPending) {
    return (
      <div className="app-loading" aria-busy="true" aria-label="Loading your account">
        <div className="skeleton-page" />
      </div>
    );
  }

  if (me.isError) {
    if (endingSession.current) {
      return (
        <div className="app-loading" aria-busy="true" aria-label="Signing out">
          <div className="skeleton-page" />
        </div>
      );
    }
    if (me.error instanceof ApiClientError && me.error.status === 401) {
      const next = `${location.pathname}${location.search}`;
      return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
    }
    return (
      <div className="app-fallback">
        <ErrorBlock message="Could not load your account." onRetry={() => void me.refetch()} />
      </div>
    );
  }

  const name = me.data.user.name || "Discord member";
  const links = me.data.admin ? [...sections, { to: "/admin", label: "Admin" }] : sections;

  return (
    <div className="app-shell">
      <aside className="rail">
        <NavLink className="wordmark" to="/dashboard">
          Chapter Ping
        </NavLink>

        <nav className="rail-nav" aria-label="Primary">
          {links.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              className={({ isActive }) => (isActive ? "rail-link is-active" : "rail-link")}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>

        <div className="rail-foot" ref={menuRef}>
          <button
            type="button"
            className="account-button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {me.data.user.image ? (
              <img className="avatar" src={me.data.user.image} alt="" width={28} height={28} />
            ) : (
              <span className="avatar avatar-fallback" aria-hidden="true">
                {initials(name)}
              </span>
            )}
            <span className="account-name">{name}</span>
          </button>
          {menuOpen ? (
            <div className="account-menu">
              <p className="account-meta">Signed in with Discord</p>
              <button
                type="button"
                className="account-action"
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
              >
                {signOut.isPending ? "Signing out…" : "Sign out"}
              </button>
            </div>
          ) : null}
          <p className="rail-note">Free while in launch capacity.</p>
        </div>
      </aside>

      <main className="page">
        <Outlet context={{ markSessionEnding }} />
      </main>

      <nav className="mobile-nav" aria-label="Mobile">
        {links.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) => (isActive ? "mobile-link is-active" : "mobile-link")}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
