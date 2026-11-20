import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { messageFor } from "../lib/api";
import { useMe, useSeries } from "../lib/queries";

const statusLabels: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "moss" },
  paused: { label: "Paused", tone: "muted" },
  sent: { label: "Sent", tone: "moss" },
  retry: { label: "Retrying", tone: "amber" },
  failed: { label: "Failed", tone: "danger" },
  pending: { label: "Queued", tone: "ink" },
  skipped: { label: "Skipped", tone: "muted" },
  disabled: { label: "Disabled", tone: "danger" },
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const entry = statusLabels[status] ?? { label: status, tone: "muted" };
  return (
    <span className={`status status-${entry.tone}`}>
      {label ?? entry.label}
    </span>
  );
}

interface PageProps {
  title: string;
  intro?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Page({ title, intro, meta, actions, children }: PageProps) {
  return (
    <div className="page-inner">
      <header className="page-head">
        <div className="page-heading">
          <h1>{title}</h1>
          {intro ? <p className="page-intro">{intro}</p> : null}
          {meta}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function CapacityLine() {
  const me = useMe();
  const series = useSeries();
  if (!me.data || !series.data) return null;
  const { capacity } = me.data;
  return (
    <p className="capacity num">
      {series.data.items.length} of {capacity.seriesPerUser} series. {capacity.accountsUsed} of{" "}
      {capacity.accountsMax} launch spots in use.
    </p>
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function Dialog({ open, title, onClose, children, wide = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      previousFocus.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={wide ? "dialog dialog-wide" : "dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="dialog-close" aria-label="Close dialog" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  requireText?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  requireText,
  danger = false,
}: ConfirmDialogProps) {
  const inputId = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
      setPending(false);
    }
  }, [open]);

  const blocked = pending || (requireText !== undefined && text !== requireText);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(messageFor(cause, "Something went wrong. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        {children}
        {requireText ? (
          <div className="field">
            <label htmlFor={inputId}>Type {requireText} to confirm</label>
            <input
              id={inputId}
              className="input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="submit"
            className={danger ? "btn btn-danger" : "btn btn-primary"}
            disabled={blocked}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function EmptyBlock({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="state state-empty">
      <p>{children}</p>
      {action ? <div className="state-action">{action}</div> : null}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <div className="state-action">
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function LoadingRows({ rows = 3, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="state state-loading" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, row) => (
        <div className="skeleton-row" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <span className="skeleton-bar" key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const show = useCallback((next: string) => setMessage(next), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <div className="toast" role="status">
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
