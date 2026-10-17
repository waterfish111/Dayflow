import { useEffect, type ReactNode } from "react";
import type { Priority } from "../types";
import { Icon } from "./Icon";

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
};

export function PriorityDot({
  priority,
  withLabel = false,
}: {
  priority: Priority;
  withLabel?: boolean;
}) {
  return (
    <span className={`priority ${withLabel ? "priority--labeled" : ""}`}>
      <span className={`priority-dot priority-${priority}`} />
      {withLabel ? <span>{PRIORITY_LABEL[priority]}</span> : null}
    </span>
  );
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? "modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
