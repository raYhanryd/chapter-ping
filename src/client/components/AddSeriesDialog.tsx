import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, messageFor, type PreviewResponse } from "../lib/api";
import { queryKeys, useDestinations } from "../lib/queries";
import { Dialog, useToast } from "./ui";

export function AddSeriesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const destinations = useDestinations();
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setPreview(null);
    setDestinationId("");
    setError(null);
  }, [open]);

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

  return (
    <Dialog open={open} title="Add series" onClose={onClose} wide>
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
          <p className="field-help">Paste the series page you already read on weebcentral.</p>
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
                {destinations.data?.destinations.length ? (
                  <select
                    id="series-destination"
                    className="select"
                    value={destinationId}
                    onChange={(event) => setDestinationId(event.target.value)}
                  >
                    {destinations.data.destinations.map((destination) => (
                      <option key={destination.id} value={destination.id}>
                        {destination.label}
                        {destination.status === "disabled" ? " (disabled)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="field-help">
                    No destinations yet. <Link to="/destinations">Add a webhook first</Link>.
                  </p>
                )}
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
    </Dialog>
  );
}
