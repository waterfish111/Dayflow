import type {
  CalendarView,
  ScheduleItem,
  Settings,
  TimeGranularity,
} from "../types";
import {
  addDays,
  formatFullDate,
  formatMonthTitle,
  formatWeekRange,
  todayKey,
  toDateKey,
  weekDates,
} from "../lib/date";
import { DayView, MonthView, WeekView } from "./CalendarViews";
import { Icon } from "./Icon";

export function CalendarPanel({
  view,
  setView,
  anchor,
  setAnchor,
  tasks,
  settings,
  onEditTask,
  onToggleComplete,
  onMoveTask,
  onAddTask,
  onGranularityChange,
}: {
  view: CalendarView;
  setView: (view: CalendarView) => void;
  anchor: Date;
  setAnchor: (date: Date) => void;
  tasks: ScheduleItem[];
  settings: Settings;
  onEditTask: (task: ScheduleItem) => void;
  onToggleComplete: (taskId: string) => void;
  onMoveTask: (taskId: string, dateKey: string, start?: string) => void;
  onAddTask: (dateKey: string, start?: string) => void;
  onGranularityChange: (value: TimeGranularity) => void;
}) {
  const title =
    view === "day"
      ? formatFullDate(anchor)
      : view === "week"
        ? formatWeekRange(weekDates(anchor))
        : formatMonthTitle(anchor);

  const move = (direction: -1 | 1) => {
    if (view === "day") setAnchor(addDays(anchor, direction));
    else if (view === "week") setAnchor(addDays(anchor, direction * 7));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1));
  };

  return (
    <section className="calendar-card">
      <div className="calendar-head">
        <div>
          <div className="calendar-eyebrow">CALENDAR</div>
          <h2>{title}</h2>
        </div>
        <div className="calendar-controls">
          <div className="view-tabs" role="tablist" aria-label="日历视图">
            {(["day", "week", "month"] as CalendarView[]).map((option) => (
              <button
                key={option}
                className={`view-tab ${view === option ? "is-active" : ""}`}
                onClick={() => setView(option)}
                role="tab"
                aria-selected={view === option}
              >
                {option === "day" ? "日" : option === "week" ? "周" : "月"}
              </button>
            ))}
          </div>
          <select
            className="granularity-select"
            value={settings.granularity}
            onChange={(event) =>
              onGranularityChange(Number(event.target.value) as TimeGranularity)
            }
            aria-label="时间粒度"
          >
            <option value={15}>15 分钟</option>
            <option value={30}>30 分钟</option>
            <option value={60}>60 分钟</option>
          </select>
          <div className="nav-group">
            <button
              className="icon-button"
              onClick={() => move(-1)}
              aria-label="上一段"
            >
              <Icon name="chevron-left" />
            </button>
            <button
              className="button button--ghost button--small"
              onClick={() => {
                setAnchor(new Date());
              }}
            >
              今天
            </button>
            <button
              className="icon-button"
              onClick={() => move(1)}
              aria-label="下一段"
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        </div>
      </div>

      <div className="calendar-body">
        {view === "week" ? (
          <WeekView
            anchor={anchor}
            tasks={tasks}
            onEditTask={onEditTask}
            onToggleComplete={onToggleComplete}
            onMoveTask={onMoveTask}
            onAddTask={onAddTask}
            onSelectDay={(dateKey) => {
              setAnchor(new Date(`${dateKey}T12:00:00`));
              setView("day");
            }}
          />
        ) : null}
        {view === "day" ? (
          <DayView
            anchor={anchor}
            tasks={tasks}
            onEditTask={onEditTask}
            onToggleComplete={onToggleComplete}
            onMoveTask={onMoveTask}
            onAddTask={onAddTask}
            granularity={settings.granularity}
          />
        ) : null}
        {view === "month" ? (
          <MonthView
            anchor={anchor}
            tasks={tasks}
            onSelectDay={(dateKey) => {
              setAnchor(new Date(`${dateKey}T12:00:00`));
              setView("day");
            }}
            onEditTask={onEditTask}
            onToggleComplete={onToggleComplete}
            onMoveTask={onMoveTask}
          />
        ) : null}
      </div>

      <div className="calendar-footnote">
        <span>
          <Icon name="clock" size={14} />
          每天最多 {Math.round(
            (isWeekend(anchor) ? settings.weekend.maxMinutes : settings.workday.maxMinutes) / 60,
          )} 小时
        </span>
        <span>
          默认视图：{view === "week" ? "本周" : view === "day" ? "当天" : "本月"}
        </span>
        <span className="calendar-today-hint">{toDateKey(new Date()) === todayKey() ? "今天" : ""}</span>
      </div>
    </section>
  );
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
