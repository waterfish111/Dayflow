import { useEffect } from "react";
import { Icon } from "./Icon";

export type ToastMessage = {
  id: number;
  text: string;
  tone?: "success" | "error" | "info";
};

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastMessage | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className={`toast toast--${toast.tone ?? "info"}`} role="status">
      <Icon
        name={toast.tone === "error" ? "alert" : "check"}
        size={17}
      />
      <span>{toast.text}</span>
      <button onClick={onClose} aria-label="关闭提示">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
