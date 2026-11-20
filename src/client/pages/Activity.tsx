import { Link, useSearchParams } from "react-router-dom";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingRows,
  Page,
  StatusChip,
} from "../components/ui";
import { formatRelative } from "../lib/format";
import { useActivity } from "../lib/queries";

const statusOptions = [
  { value: "", label: "All activity" },
  { value: "sent", label: "Sent" },
  { value: "retry", label: "Retrying" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Queued" },
  { value: "skipped", label: "Skipped" },
];

export function Activity() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const activity = useActivity(status || undefined);
  const items = activity.data?.pages.flatMap((page) => page.items) ?? [];

  function changeStatus(next: string) {
    const updated = new URLSearchParams(params);
    if (next) updated.set("status", next);
    else updated.delete("status");
    setParams(updated);
  }

  return (
    <Page
      title="Activity"
      intro="The last 30 days of alerts, newest first."
      actions={
        <div className="filter-field">
          <label htmlFor="activity-status">Show status</label>
          <select
            id="activity-status"
            className="select"
            value={status}
            onChange={(event) => changeStatus(event.target.value)}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {activity.isPending ? <LoadingRows rows={5} columns={5} /> : null}

      {activity.isError ? (
        <ErrorBlock message="Could not load activity." onRetry={() => void activity.refetch()} />
      ) : null}

      {activity.data && items.length === 0 ? (
        <EmptyBlock>No activity for this filter yet.</EmptyBlock>
      ) : null}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Delivery activity</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Series and chapter</th>
                <th scope="col">Destination</th>
                <th scope="col">Status</th>
                <th scope="col">Error</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Time" className="num">
                    {formatRelative(item.sentAt ?? item.createdAt)}
                  </td>
                  <td data-label="Series and chapter">
                    <Link className="table-title" to={`/series/${item.series.id}`}>
                      {item.series.title}
                    </Link>
                    <span className="row-note">
                      {item.chapter.url ? (
                        <a href={item.chapter.url} target="_blank" rel="noreferrer">
                          {item.chapter.label}
                        </a>
                      ) : (
                        item.chapter.label
                      )}
                    </span>
                  </td>
                  <td data-label="Destination">{item.destination.label}</td>
                  <td data-label="Status">
                    <StatusChip status={item.status} />
                    {item.attempts > 1 ? <span className="row-note">{item.attempts} attempts</span> : null}
                  </td>
                  <td data-label="Error">{item.lastError ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activity.hasNextPage ? (
        <div className="load-more">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void activity.fetchNextPage()}
            disabled={activity.isFetchingNextPage}
          >
            {activity.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </Page>
  );
}
