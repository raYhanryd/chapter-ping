import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import {
  ConfirmDialog,
  Dialog,
  EmptyBlock,
  ErrorBlock,
  LoadingRows,
  Page,
  StatusChip,
  useToast,
} from "../components/ui";
import { api, messageFor, type Destination } from "../lib/api";
import { formatRelative } from "../lib/format";
import { queryKeys, useDestinations } from "../lib/queries";

export function Destinations() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const destinations = useDestinations();
  const [form, setForm] = useState<{ mode: "add" } | { mode: "replace"; destination: Destination } | null>(
    null,
  );
  const [removing, setRemoving] = useState<Destination | null>(null);

  const test = useMutation({
    mutationFn: api.testDestination,
    onSuccess: () => toast("Test message sent."),
    onError: (cause) => toast(messageFor(cause, "The test message did not go through.")),
  });

  async function remove() {
    if (!removing) return;
    await api.removeDestination(removing.id);
    queryClient.invalidateQueries({ queryKey: queryKeys.destinations });
    toast("Destination removed.");
  }

  const items = destinations.data?.destinations ?? [];
  const disabled = items.filter((destination) => destination.status === "disabled");

  return (
    <Page
      title="Destinations"
      intro="The Discord channels that receive alerts, and the webhooks behind them."
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setForm({ mode: "add" })}>
          Add destination
        </button>
      }
    >
      {disabled.map((destination) => (
        <div className="banner banner-warn" role="status" key={destination.id}>
          <strong>This webhook is disabled.</strong>
          <span>
            {destination.label}: {destination.lastError ?? "Discord did not accept it."}
          </span>
          <span>Replace its webhook to turn alerts back on.</span>
        </div>
      ))}

      {destinations.isPending ? <LoadingRows rows={3} columns={4} /> : null}

      {destinations.isError ? (
        <ErrorBlock message="Could not load your destinations." onRetry={() => void destinations.refetch()} />
      ) : null}

      {destinations.data && items.length === 0 ? (
        <EmptyBlock>
          No destinations yet. Add the webhook for the channel where alerts should land.
        </EmptyBlock>
      ) : null}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Your Discord destinations</caption>
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Channel</th>
                <th scope="col">Status</th>
                <th scope="col">Last checked</th>
                <th scope="col">Last error</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((destination) => (
                <tr key={destination.id}>
                  <td data-label="Label">
                    <span className="table-title">{destination.label}</span>
                    {destination.roleId ? <span className="row-note">Mentions a role</span> : null}
                  </td>
                  <td data-label="Channel">
                    <span className="channel-id num" title={destination.channelId ?? undefined}>
                      {destination.channelName ??
                        (destination.channelId ? `Channel …${destination.channelId.slice(-4)}` : "Unknown channel")}
                    </span>
                  </td>
                  <td data-label="Status">
                    <StatusChip status={destination.status} />
                    {destination.inUseBy > 0 ? (
                      <span className="row-note">{destination.inUseBy} series</span>
                    ) : null}
                  </td>
                  <td data-label="Last checked" className="num">
                    {formatRelative(destination.lastCheckedAt)}
                  </td>
                  <td data-label="Last error">{destination.lastError ?? "—"}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Send test to ${destination.label}`}
                      onClick={() => test.mutate(destination.id)}
                      disabled={test.isPending}
                    >
                      Send test
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Replace webhook for ${destination.label}`}
                      onClick={() => setForm({ mode: "replace", destination })}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Remove destination ${destination.label}`}
                      onClick={() => setRemoving(destination)}
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

      <DestinationDialog
        open={form !== null}
        destination={form?.mode === "replace" ? form.destination : undefined}
        onClose={() => setForm(null)}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Remove destination?"
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={remove}
      >
        <p>
          The saved webhook is deleted. Series still using {removing?.label ?? "it"} must move to another
          destination first.
        </p>
      </ConfirmDialog>
    </Page>
  );
}

function DestinationDialog({
  open,
  destination,
  onClose,
}: {
  open: boolean;
  destination?: Destination;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel(destination?.label ?? "");
    setWebhookUrl("");
    setRoleId(destination?.roleId ?? "");
    setError(null);
  }, [open, destination]);

  const save = useMutation({
    mutationFn: async () => {
      const normalizedRole = roleId.replace(/\D/g, "");
      if (destination) {
        return api.updateDestination(destination.id, {
          label,
          roleId: normalizedRole,
          ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
        });
      }
      return api.addDestination({ label, webhookUrl: webhookUrl.trim(), roleId: normalizedRole });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.destinations });
      toast("Destination saved.");
      onClose();
    },
    onError: (cause) => setError(messageFor(cause, "Could not save this destination.")),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!webhookUrl.trim()) {
      setError("Paste the Discord webhook URL.");
      return;
    }
    setError(null);
    save.mutate();
  }

  return (
    <Dialog
      open={open}
      title={destination ? "Replace webhook" : "Add destination"}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="destination-label">Label</label>
          <input
            id="destination-label"
            className="input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Main channel"
            maxLength={80}
          />
        </div>
        <div className="field">
          <label htmlFor="destination-url">Webhook URL</label>
          <input
            id="destination-url"
            className="input"
            type="password"
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="field-help">Stored encrypted. We check it with Discord before saving.</p>
        </div>
        <div className="field">
          <label htmlFor="destination-role">Role ID (optional)</label>
          <input
            id="destination-role"
            className="input"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            placeholder="123456789012345678"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="field-help">Mention this role with each alert. Paste an ID or a role mention.</p>
        </div>

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? "Checking…" : "Save destination"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
