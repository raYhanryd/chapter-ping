import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ConfirmDialog,
  EmptyBlock,
  ErrorBlock,
  LoadingRows,
  Page,
  StatusChip,
  useToast,
} from "../components/ui";
import { api, messageFor } from "../lib/api";
import { formatRelative } from "../lib/format";
import { queryKeys, useSeries, useSeriesActivity } from "../lib/queries";

export function SeriesDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const series = useSeries();
  const activity = useSeriesActivity(id);
  const [removing, setRemoving] = useState(false);
  const item = series.data?.items.find((entry) => entry.id === id);

  const toggle = useMutation({
    mutationFn: (active: boolean) => api.updateSeries(id, active),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.series });
      toast(result.subscription.active ? "Series resumed." : "Series paused.");
    },
    onError: (cause) => toast(messageFor(cause, "Could not change that series.")),
  });

  async function copyLink(seriesId: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${seriesId}`);
      toast("Link copied.");
    } catch {
      toast("Could not copy the link.");
    }
  }

  async function remove() {
    await api.removeSeries(id);
    queryClient.invalidateQueries({ queryKey: queryKeys.series });
    queryClient.invalidateQueries({ queryKey: queryKeys.me });
    toast("Series removed.");
    navigate("/dashboard");
  }

  if (series.isPending) {
    return (
      <Page title="Series">
        <LoadingRows rows={3} columns={3} />
      </Page>
    );
  }

  if (series.isError) {
    return (
      <Page title="Series">
        <ErrorBlock message="Could not load this series." onRetry={() => void series.refetch()} />
      </Page>
    );
  }

  if (!item) {
    return (
      <Page title="Series">
        <EmptyBlock
          action={
            <Link className="btn btn-secondary" to="/dashboard">
              Back to your series
            </Link>
          }
        >
          That series is not in your list.
        </EmptyBlock>
      </Page>
    );
  }

  return (
    <Page
      title={item.title}
      intro="The release you are following, its schedule, and the last ten delivery attempts."
      actions={
        <>
          <a className="btn btn-secondary" href={item.siteUrl} target="_blank" rel="noreferrer">
            Open on weebcentral
          </a>
          <button type="button" className="btn btn-secondary" onClick={() => void copyLink(item.seriesId)}>
            Copy link
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => toggle.mutate(!item.active)}
            disabled={toggle.isPending}
          >
            {item.active ? "Pause" : "Resume"}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setRemoving(true)}>
            Remove
          </button>
        </>
      }
    >
      <dl className="detail-grid">
        <div className="detail-item">
          <dt>Latest chapter</dt>
          <dd>
            {item.latestChapter ? (
              item.latestChapter.url ? (
                <a href={item.latestChapter.url} target="_blank" rel="noreferrer">
                  {item.latestChapter.label}
                </a>
              ) : (
                item.latestChapter.label
              )
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="detail-item">
          <dt>Status</dt>
          <dd>
            <StatusChip status={item.active ? "active" : "paused"} />
          </dd>
        </div>
        <div className="detail-item">
          <dt>Destination</dt>
          <dd>{item.destination.label}</dd>
        </div>
        <div className="detail-item">
          <dt>Last checked</dt>
          <dd className="num">{formatRelative(item.lastCheckedAt)}</dd>
        </div>
        <div className="detail-item">
          <dt>Next check</dt>
          <dd className="num">{item.active ? formatRelative(item.nextCheckAt) : "—"}</dd>
        </div>
      </dl>

      {item.lastError ? (
        <p className="banner banner-warn" role="status">
          The last check did not finish: {item.lastError}
        </p>
      ) : null}

      <section className="detail-section">
        <h2>Delivery history</h2>
        {activity.isPending ? <LoadingRows rows={3} columns={3} /> : null}
        {activity.isError ? (
          <ErrorBlock message="Could not load this series' history." onRetry={() => void activity.refetch()} />
        ) : null}
        {activity.data && activity.data.items.length === 0 ? (
          <EmptyBlock>No deliveries for this series yet.</EmptyBlock>
        ) : null}
        {activity.data && activity.data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Delivery history for {item.title}</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Chapter</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Status</th>
                  <th scope="col">Error</th>
                </tr>
              </thead>
              <tbody>
                {activity.data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Time" className="num">
                      {formatRelative(entry.sentAt ?? entry.createdAt)}
                    </td>
                    <td data-label="Chapter">{entry.chapter.label}</td>
                    <td data-label="Destination">{entry.destination.label}</td>
                    <td data-label="Status">
                      <StatusChip status={entry.status} />
                    </td>
                    <td data-label="Error">{entry.lastError ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={removing}
        title="Remove series?"
        confirmLabel="Remove series"
        danger
        onClose={() => setRemoving(false)}
        onConfirm={remove}
      >
        <p>Stop tracking {item.title}? Its delivery history stays for 30 days.</p>
      </ConfirmDialog>
    </Page>
  );
}
