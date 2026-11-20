import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog, ErrorBlock, LoadingRows, Page } from "../components/ui";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useMe } from "../lib/queries";

const REPO = "https://github.com/raYhanryd/chapter-tracker-web";

export function Settings() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  if (me.isPending) {
    return (
      <Page title="Settings">
        <LoadingRows rows={3} columns={2} />
      </Page>
    );
  }

  if (me.isError) {
    return (
      <Page title="Settings">
        <ErrorBlock message="Could not load your account." onRetry={() => void me.refetch()} />
      </Page>
    );
  }

  const { user, capacity, createdAt } = me.data;
  const displayName = user.name || "Discord member";

  async function deleteAccount() {
    await api.deleteAccount("DELETE");
    queryClient.clear();
    navigate("/");
  }

  return (
    <Page title="Settings" intro="Your account, your limits, and the way out.">
      <section className="settings-block">
        <h2>Account</h2>
        <div className="identity">
          {user.image ? (
            <img className="avatar avatar-lg" src={user.image} alt="" width={44} height={44} />
          ) : (
            <span className="avatar avatar-lg avatar-fallback" aria-hidden="true">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <p className="identity-name">{displayName}</p>
            <p className="identity-meta">Joined {formatDate(createdAt)}</p>
          </div>
        </div>
      </section>

      <section className="settings-block">
        <h2>Capacity</h2>
        <p className="capacity num">
          {capacity.accountsUsed} of {capacity.accountsMax} launch spots in use. {capacity.activeSeries} of{" "}
          {capacity.activeSeriesMax} tracked series are active across the service.
        </p>
        <p>
          This account can track {capacity.seriesPerUser} series across {capacity.destinationsPerUser}{" "}
          destinations. Paused series stay in your list but do not use a check slot.
        </p>
      </section>

      <section className="settings-block">
        <h2>Privacy</h2>
        <p>
          Read the <a href={`${REPO}/blob/main/PRIVACY.md`}>privacy policy</a> and{" "}
          <a href={`${REPO}/blob/main/TERMS.md`}>terms</a>. Deleting your account removes your sessions,
          subscriptions, destinations and deliveries. Shared series metadata stays for other readers.
        </p>
      </section>

      <section className="settings-block settings-danger">
        <h2>Delete account</h2>
        <p>This cannot be undone. Your data is removed immediately.</p>
        <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>
          Delete account
        </button>
      </section>

      <ConfirmDialog
        open={deleting}
        title="Delete account?"
        confirmLabel="Delete account and data"
        requireText="DELETE"
        danger
        onClose={() => setDeleting(false)}
        onConfirm={deleteAccount}
      >
        <p>
          Your sessions, series, destinations and delivery history are deleted. Shared series metadata
          is kept for other readers.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
