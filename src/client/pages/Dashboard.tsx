import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AddSeriesDialog } from "../components/AddSeriesDialog";
import {
  CapacityLine,
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
import { queryKeys, useSeries } from "../lib/queries";

export function Dashboard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const series = useSeries();
  const [params, setParams] = useSearchParams();
  const addId = params.get("add") ?? "";
  const [adding, setAdding] = useState(Boolean(addId));
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.updateSeries(id, active),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.series });
      toast(result.subscription.active ? "Series resumed." : "Series paused.");
    },
    onError: (cause) => toast(messageFor(cause, "Could not change that series.")),
  });

  async function removeSeries() {
    if (!removing) return;
    await api.removeSeries(removing.id);
    queryClient.invalidateQueries({ queryKey: queryKeys.series });
    queryClient.invalidateQueries({ queryKey: queryKeys.me });
    toast("Series removed.");
  }

  function closeAdd() {
    setAdding(false);
    // Drop the handoff param so reopening the dialog starts clean.
    if (addId) setParams({}, { replace: true });
  }

  const addButton = (
    <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
      Add series
    </button>
  );

  return (
    <Page
      title="Your series"
      intro="Every series you follow, with the next check and where alerts go."
      meta={<CapacityLine />}
      actions={addButton}
    >
      {series.isPending ? <LoadingRows rows={4} columns={5} /> : null}

      {series.isError ? (
        <ErrorBlock message="Could not load your series." onRetry={() => void series.refetch()} />
      ) : null}

      {series.data && series.data.items.length === 0 ? (
        <EmptyBlock
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              Add series
            </button>
          }
        >
          No series yet. Search for the first one to start tracking.
        </EmptyBlock>
      ) : null}

      {series.data && series.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Your tracked series</caption>
            <thead>
              <tr>
                <th scope="col">Series</th>
                <th scope="col">Latest chapter</th>
                <th scope="col">Destination</th>
                <th scope="col">Next check</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {series.data.items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Series">
                    <Link className="table-title" to={`/series/${item.id}`}>
                      {item.title}
                    </Link>
                  </td>
                  <td data-label="Latest chapter">
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
                  </td>
                  <td data-label="Destination">{item.destination.label}</td>
                  <td data-label="Next check" className="num">
                    {item.active ? formatRelative(item.nextCheckAt) : "—"}
                  </td>
                  <td data-label="Status">
                    <StatusChip status={item.active ? "active" : "paused"} />
                    {item.lastError ? <span className="row-note">Last check failed</span> : null}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`${item.active ? "Pause" : "Resume"} ${item.title}`}
                      onClick={() => toggle.mutate({ id: item.id, active: !item.active })}
                      disabled={toggle.isPending}
                    >
                      {item.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => setRemoving({ id: item.id, title: item.title })}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <AddSeriesDialog
        open={adding}
        onClose={closeAdd}
        initialUrl={addId ? addId : undefined}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Remove series?"
        confirmLabel="Remove series"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={removeSeries}
      >
        <p>
          Stop tracking {removing?.title ?? "this series"}? Its delivery history stays for 30 days.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
