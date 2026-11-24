import { Link } from "react-router-dom";
import { EmptyBlock, ErrorBlock, LoadingRows, Page, StatusChip } from "../components/ui";
import { ApiClientError } from "../lib/api";
import { formatDate, formatDateTime, formatRelative } from "../lib/format";
import { useAdminOverview } from "../lib/queries";

const runTone: Record<string, { status: string; label: string }> = {
  ok: { status: "sent", label: "Complete" },
  error: { status: "failed", label: "Failed" },
  running: { status: "pending", label: "Running" },
};

function LedgerRow({ label, value }: { label: string; value: number }) {
  return (
    <li>
      <span>{label}</span>
      <span className="ledger-leader" aria-hidden="true" />
      <span className="ledger-value num">{value}</span>
    </li>
  );
}

export function Admin() {
  const overview = useAdminOverview();

  if (overview.isPending) {
    return (
      <Page title="Service desk">
        <LoadingRows rows={4} columns={5} />
      </Page>
    );
  }

  if (overview.isError) {
    const forbidden = overview.error instanceof ApiClientError && overview.error.status === 403;
    return (
      <Page title="Service desk">
        {forbidden ? (
          <EmptyBlock>
            This page belongs to the owner account. <Link to="/dashboard">Back to your series</Link>.
          </EmptyBlock>
        ) : (
          <ErrorBlock message="Could not load the service desk." onRetry={() => void overview.refetch()} />
        )}
      </Page>
    );
  }

  const { stats, users, topSeries, runs } = overview.data;
  const latest = runs[0];
  const cronTone = stats.cron.healthy
    ? { status: "active", label: "On schedule" }
    : { status: "failed", label: "Behind" };

  return (
    <Page
      title="Service desk"
      intro="Every account, every alert, and what the cron is doing right now."
      meta={
        <p className="capacity">
          {stats.cron.lastRunAt
            ? `Last check ran ${formatRelative(stats.cron.lastRunAt)}.`
            : "No cron run has been recorded yet."}{" "}
          {stats.series.withErrors > 0
            ? `${stats.series.withErrors} tracked ${stats.series.withErrors === 1 ? "series has" : "series have"} an open feed error.`
            : "No feed errors are open."}
        </p>
      }
    >
      <section className="figures" aria-label="Service totals">
        <div className="figure">
          <span className="figure-value num">{stats.users}</span>
          <span className="figure-label">accounts</span>
          <span className="figure-note">{stats.newUsers7d} joined this week</span>
        </div>
        <div className="figure">
          <span className="figure-value num">{stats.series.active}</span>
          <span className="figure-label">series tracked</span>
          <span className="figure-note">{stats.chapters} chapters on file</span>
        </div>
        <div className="figure">
          <span className="figure-value num">{stats.deliveries.sent24h}</span>
          <span className="figure-label">alerts sent</span>
          <span className="figure-note">in the last 24 hours</span>
        </div>
        <div className="figure">
          <span className="figure-value num">{stats.deliveries.failed24h}</span>
          <span className="figure-label">failed</span>
          <span className="figure-note">in the last 24 hours</span>
        </div>
      </section>

      <div className="admin-columns">
        <section className="admin-panel">
          <h2>Readers</h2>
          <p className="admin-panel-note">
            {stats.users} {stats.users === 1 ? "account" : "accounts"}, newest first. The Discord id is the
            sign-in identity, so it is the one to quote in a support message.
          </p>

          {users.length === 0 ? (
            <p className="admin-panel-note">No accounts yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table admin-table">
                <caption className="sr-only">Every Chapter Ping account</caption>
                <thead>
                  <tr>
                    <th scope="col">Reader</th>
                    <th scope="col">Joined</th>
                    <th scope="col">Series</th>
                    <th scope="col">Channels</th>
                    <th scope="col">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td data-label="Reader">
                        <span className="table-title">{user.name}</span>
                        <span className="discord-id num">{user.discordId ?? "No Discord id"}</span>
                        {user.waitlisted ? <span className="row-note">On the waitlist</span> : null}
                      </td>
                      <td data-label="Joined" className="num">
                        {formatDate(user.createdAt)}
                      </td>
                      <td data-label="Series" className="num">
                        {user.seriesActive} of {user.seriesTotal}
                      </td>
                      <td data-label="Channels" className="num">
                        {user.destinations}
                      </td>
                      <td data-label="Last seen" className="num">
                        {formatRelative(user.lastSeenAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="admin-side">
          <section className="admin-panel">
            <h2>Delivery ledger</h2>
            <ul className="ledger">
              <LedgerRow label="Sent" value={stats.deliveries.sent24h} />
              <LedgerRow label="Retrying" value={stats.deliveries.retry24h} />
              <LedgerRow label="Failed" value={stats.deliveries.failed24h} />
              <LedgerRow label="Queued" value={stats.deliveries.pending24h} />
            </ul>
            <p className="admin-footnote">
              Last 24 hours. Since launch: {stats.deliveries.sentTotal} sent, {stats.deliveries.failedTotal}{" "}
              failed, {stats.deliveries.pending} still queued.
            </p>
          </section>

          <section className="admin-panel">
            <h2>Most tracked</h2>
            {topSeries.length === 0 ? (
              <p className="admin-panel-note">Nobody is tracking a series yet.</p>
            ) : (
              <ul className="ledger">
                {topSeries.map((series) => (
                  <li key={series.id}>
                    <span>{series.title}</span>
                    <span className="ledger-leader" aria-hidden="true" />
                    <span className="ledger-value num">{series.subscribers}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-panel">
            <h2>Cron</h2>
            <p className="admin-panel-note">
              <StatusChip status={cronTone.status} label={cronTone.label} /> Last run{" "}
              {formatRelative(stats.cron.lastRunAt)}.
            </p>
            {latest ? (
              <ul className="ledger">
                <LedgerRow label="Feeds checked" value={latest.feedsChecked} />
                <LedgerRow label="Chapters found" value={latest.chaptersFound} />
                <LedgerRow label="Alerts sent" value={latest.deliveriesSent} />
                <LedgerRow label="Errors" value={latest.errors} />
              </ul>
            ) : (
              <p className="admin-panel-note">No cron runs recorded.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="admin-panel admin-runs">
        <h2>Recent runs</h2>
        {runs.length === 0 ? (
          <p className="admin-panel-note">The cron has not run yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Recent cron runs</caption>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Status</th>
                  <th scope="col">Feeds</th>
                  <th scope="col">Chapters</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Errors</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const tone = runTone[run.status] ?? { status: "pending", label: run.status };
                  return (
                    <tr key={run.id}>
                      <td data-label="Started" className="num">
                        {formatDateTime(run.startedAt)}
                      </td>
                      <td data-label="Status">
                        <StatusChip status={tone.status} label={tone.label} />
                      </td>
                      <td data-label="Feeds" className="num">
                        {run.feedsChecked}
                      </td>
                      <td data-label="Chapters" className="num">
                        {run.chaptersFound}
                      </td>
                      <td data-label="Sent" className="num">
                        {run.deliveriesSent}
                      </td>
                      <td data-label="Errors" className="num">
                        {run.errors}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  );
}
