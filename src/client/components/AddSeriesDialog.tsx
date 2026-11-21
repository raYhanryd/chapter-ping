import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, messageFor, type PreviewResponse, type SeriesSearchResult } from "../lib/api";
import { queryKeys, useDestinations, useSeriesSearch } from "../lib/queries";
import { Dialog, useToast } from "./ui";

export function AddSeriesDialog({
  open,
  onClose,
  initialUrl,
}: {
  open: boolean;
  onClose: () => void;
  /** Seeds the check when the dialog is opened from a shared series page. */
  initialUrl?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const destinations = useDestinations();
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl ?? "");
    setQuery("");
    setDebouncedQuery("");
    setPreview(null);
    setDestinationId("");
    setError(null);
  }, [open, initialUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const search = useSeriesSearch(debouncedQuery, open);

  useEffect(() => {
    if (destinationId || !destinations.data?.destinations.length) return;
    setDestinationId(destinations.data.destinations[0]?.id ?? "");
  }, [destinationId, destinations.data]);

  const check = useMutation({
    mutationFn: api.previewSeries,
    onSuccess: (data) => {
      setPreview(data);
      setError(null);
    },
    onError: (cause) => setError(messageFor(cause, "Could not read that link.")),
  });

  // A shared link opens straight into the preview, so the only choice left is
  // where the alerts go.
  const seeded = useRef("");
  useEffect(() => {
    if (!open) {
      seeded.current = "";
      return;
    }
    if (!initialUrl || seeded.current === initialUrl) return;
    seeded.current = initialUrl;
    check.mutate(initialUrl);
  }, [open, initialUrl, check]);

  const add = useMutation({
    mutationFn: () => api.addSeries(url.trim(), destinationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.series });
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast("Series added.");
      onClose();
    },
    onError: (cause) => {
      setError(messageFor(cause, "Could not add this series. Try again."));
    },
  });

  function choose(result: SeriesSearchResult) {
    setUrl(result.siteUrl);
    setError(null);
    check.mutate(result.siteUrl);
  }

  function submitCheck(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) {
      setError("Paste a weebcentral series link first.");
      return;
    }
    setError(null);
    check.mutate(url.trim());
  }

  function submitAdd(event: FormEvent) {
    event.preventDefault();
    if (!destinationId) {
      setError("Choose where alerts should go.");
      return;
    }
    setError(null);
    add.mutate();
  }

  const latest = preview?.series.latest;
  const noDestinations = destinations.data !== undefined && destinations.data.destinations.length === 0;

  return (
    <Dialog open={open} title="Add series" onClose={onClose} wide>
      {noDestinations ? (
        <div className="banner banner-warn" role="alert">
          <strong>Add a Discord destination first.</strong>
          <span>Alerts need a channel to land in. Add a webhook, then come back to pick a series.</span>
          <span>
            <Link className="quiet-link" to="/destinations" onClick={onClose}>
              Add a destination
            </Link>
          </span>
        </div>
      ) : (
        <>
          <div className="field series-search">
            <label htmlFor="series-search">Search weebcentral</label>
            <input
              id="series-search"
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="One Piece, Blue Lock, Solo Leveling…"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="field-help">Browse what is popular, or type a title. Pick one to check it.</p>
          </div>

          {search.isError ? (
            <p className="field-help">Search is unavailable right now. Paste a link below instead.</p>
          ) : null}

          {search.data && search.data.items.length > 0 ? (
            <ul className="series-results" aria-label="Search results">
              {search.data.items.map((result) => (
                <li key={result.externalId}>
                  <button
                    type="button"
                    className="series-result"
                    aria-pressed={preview?.series.externalId === result.externalId}
                    onClick={() => choose(result)}
                  >
                    {result.coverUrl ? (
                      <img src={result.coverUrl} alt="" width={400} height={600} loading="lazy" />
                    ) : (
                      <span className="series-result-blank" aria-hidden="true" />
                    )}
                    <span className="series-result-title">{result.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <form className="dialog-form" onSubmit={submitCheck}>
            <div className="field">
              <label htmlFor="series-url">Weebcentral link</label>
              <input
                id="series-url"
                className="input"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setPreview(null);
                  setError(null);
                }}
                placeholder="https://weebcentral.com/series/…"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={error ? "series-url-error" : undefined}
              />
              <p className="field-help">Or paste the series page you already read on weebcentral.</p>
            </div>
            <div className="dialog-actions">
              <button type="submit" className="btn btn-secondary" disabled={check.isPending || add.isPending}>
                {check.isPending ? "Checking…" : "Check series"}
              </button>
            </div>
          </form>

          {error ? (
            <p className="field-error" id="series-url-error" role="alert">
              {error}
            </p>
          ) : null}

          {preview && latest ? (
            <div className="preview-block">
              <div className="preview-card">
                <p className="preview-title">{preview.series.title}</p>
                <p className="preview-chapter num">{latest.label}</p>
                <p className="preview-copy">{latest.title}</p>
                <a className="quiet-link" href={preview.series.siteUrl} target="_blank" rel="noreferrer">
                  Open on weebcentral
                </a>
              </div>

              {preview.alreadyTracked ? (
                <p className="banner banner-info" role="status">
                  You already track this series.
                </p>
              ) : (
                <form className="dialog-form" onSubmit={submitAdd}>
                  <div className="field">
                    <label htmlFor="series-destination">Send alerts to</label>
                    <select
                      id="series-destination"
                      className="select"
                      value={destinationId}
                      onChange={(event) => setDestinationId(event.target.value)}
                    >
                      {destinations.data?.destinations.map((destination) => (
                        <option key={destination.id} value={destination.id}>
                          {destination.label}
                          {destination.status === "disabled" ? " (disabled)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="dialog-actions">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={add.isPending || !destinationId}
                    >
                      {add.isPending ? "Adding…" : "Add series"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
