import type { NotificationPermissionState } from "../lib/notifications";
import { formatFullDate } from "../lib/date";
import { Icon } from "./Icon";

export function Header({
  onOpenSettings,
  onEnableNotifications,
  notificationState,
  onFocusPlanner,
}: {
  onOpenSettings: () => void;
  onEnableNotifications: () => void;
  notificationState: NotificationPermissionState;
  onFocusPlanner: () => void;
}) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="sun" size={22} />
        </span>
        <div>
          <div className="brand-name">Dayflow</div>
          <div className="brand-sub">把一天，排成想要的样子</div>
        </div>
      </div>

      <div className="header-date">{formatFullDate(new Date())}</div>

      <div className="header-actions">
        <button className="button button--ghost header-ai" onClick={onFocusPlanner}>
          <Icon name="sparkles" size={18} />
          <span>自然语言计划</span>
        </button>
        <button
          className="icon-button notification-button"
          onClick={onEnableNotifications}
          title={
            notificationState === "granted"
              ? "通知已开启"
              : notificationState === "unsupported"
                ? "当前浏览器不支持通知"
                : "开启通知"
          }
          aria-label="通知设置"
        >
          <Icon name="bell" />
          <span
            className={`notification-dot ${
              notificationState === "granted" ? "is-on" : ""
            }`}
          />
        </button>
        <button
          className="icon-button"
          onClick={onOpenSettings}
          title="设置"
          aria-label="设置"
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}
