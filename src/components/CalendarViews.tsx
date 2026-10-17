import type { ScheduleItem, Settings, TimeGranularity } from "../types";
import {
  addDays,
  formatMonthDay,
  formatMonthTitle,
  formatWeekRange,
  isToday,
  minutesFromTime,
  monthMatrix,
  rangeHours,
  timeFromMinutes,
  toDateKey,
  WEEKDAYS_SHORT_CN,
  weekDates,
} from "../lib/date";
import { Icon } from "./Icon";
import { PriorityDot } from "./ui";

type TaskActionProps = {
  onEditTask: (task: ScheduleItem) => void;
  onToggleComplete: (taskId: string) => void;
  onMoveTask: (taskId: string, dateKey: string, start?: string) => void;
};

function CalendarItemChip({
  task,
  compact,
  onEditTask,
  onToggleComplete,
  onMoveTask,
}: TaskActionProps & {
  task: ScheduleItem;
  compact?: boolean;
}) {
  return (
    <div
      className={`calendar-item ${task.completed ? "is-completed" : ""} ${
        task.kind === "event" ? "is-event" : ""
      }`}
      role="button"
      tabIndex={0}
      draggable={!task.locked}
      onDragStart={(event) => {
        if (task.locked) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/dayflow-task", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={(event) => {
        event.stopPropagation();
        onEditTask(task);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEditTask(task);
        }
      }}
    >
      {!compact ? (
        <button
          className={`check-circle ${task.completed ? "is-checked" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleComplete(task.id);
          }}
          aria-label={task.completed ? "标记未完成" : "标记完成"}
        >
          {task.completed ? <Icon name="check" size={11} /> : null}
        </button>
      ) : null}
      <PriorityDot priority={task.priority} />
      <div className="calendar-item-copy">
        {!compact && task.start ? (
          <span className="calendar-item-time">
            {task.start}
            {task.end ? `–${task.end}` : ""}
          </span>
        ) : null}
        <span className="calendar-item-title">{task.title}</span>
      </div>
      {task.locked ? (
        <span className="lock-mark" title="已锁定">
          <Icon name="lock" size={12} />
        </span>
      ) : null}
    </div>
  );
}

export function WeekView({
  anchor,
  tasks,
  onEditTask,
  onToggleComplete,
  onMoveTask,
  onAddTask,
  onSelectDay,
}: TaskActionProps & {
  anchor: Date;
  tasks: ScheduleItem[];
  onAddTask: (dateKey: string) => void;
  onSelectDay: (dateKey: string) => void;
}) {
  const dates = weekDates(anchor);

  return (
    <div className="week-view">
      <div className="week-range-label">{formatWeekRange(dates)}</div>
      <div className="week-grid">
        {dates.map((date) => {
          const key = toDateKey(date);
          const items = tasks
            .filter((task) => task.date === key)
            .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
          return (
            <section
              key={key}
              className={`week-day ${isToday(date) ? "is-today" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData(
                  "text/dayflow-task",
                );
                if (taskId) onMoveTask(taskId, key);
              }}
            >
              <button
                className="week-day-head"
                onClick={() => onSelectDay(key)}
              >
                <span className="week-day-name">
                  {WEEKDAYS_SHORT_CN[date.getDay()]}
                </span>
                <span className="week-day-number">{date.getDate()}</span>
              </button>
              <div className="week-day-body">
                {items.length === 0 ? (
                  <div className="week-empty">空白</div>
                ) : (
                  items.map((task) => (
                    <CalendarItemChip
                      key={task.id}
                      task={task}
                      onEditTask={onEditTask}
                      onToggleComplete={onToggleComplete}
                      onMoveTask={onMoveTask}
                    />
                  ))
                )}
                <button
                  className="week-add"
                  onClick={() => onAddTask(key)}
                  aria-label={`在 ${formatMonthDay(date)} 添加任务`}
                >
                  <Icon name="plus" size={14} />
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const HOUR_HEIGHT = 64;
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;

export function DayView({
  anchor,
  tasks,
  onEditTask,
  onToggleComplete,
  onMoveTask,
  onAddTask,
  granularity,
}: TaskActionProps & {
  anchor: Date;
  tasks: ScheduleItem[];
  onAddTask: (dateKey: string, start?: string) => void;
  granularity: TimeGranularity;
}) {
  const dateKey = toDateKey(anchor);
  const items = tasks
    .filter((task) => task.date === dateKey && task.start && task.end)
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  const hours = rangeHours(DAY_START_HOUR, DAY_END_HOUR);
  const now = new Date();
  const nowTop =
    ((now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60) / 60) *
    HOUR_HEIGHT;

  return (
    <div className="day-view">
      <div className="day-summary">
        <span>{formatMonthDay(anchor)}</span>
        <span className="day-summary-muted">
          {items.length > 0 ? `${items.length} 个安排` : "还没有安排"}
        </span>
      </div>
      <div className="day-scroll">
        <div className="day-timeline">
          <div className="day-hours">
            {hours.map((hour) => (
              <div
                key={hour}
                className="day-hour-label"
                style={{ height: HOUR_HEIGHT }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div
            className="day-grid"
            style={{ height: hours.length * HOUR_HEIGHT }}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const y = event.clientY - rect.top;
              const rawMinutes = DAY_START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
              const snapped =
                Math.round(rawMinutes / granularity) * granularity;
              onAddTask(
                dateKey,
                timeFromMinutes(Math.min(snapped, 23 * 60 + 45)),
              );
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData(
                "text/dayflow-task",
              );
              if (!taskId) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const y = event.clientY - rect.top;
              const rawMinutes =
                DAY_START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
              const snapped =
                Math.round(rawMinutes / granularity) * granularity;
              onMoveTask(
                taskId,
                dateKey,
                timeFromMinutes(Math.min(snapped, 23 * 60 + 45)),
              );
            }}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="day-hour-line"
                style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT }}
              />
            ))}
            {isToday(anchor) && nowTop >= 0 && nowTop <= hours.length * HOUR_HEIGHT ? (
              <div className="now-line" style={{ top: nowTop }}>
                <span>现在</span>
              </div>
            ) : null}
            {items.map((task, index) => {
              const start = minutesFromTime(task.start ?? "00:00");
              const end = minutesFromTime(task.end ?? task.start ?? "00:00");
              const top = Math.max(
                0,
                ((start - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT,
              );
              const height = Math.max(36, ((end - start) / 60) * HOUR_HEIGHT - 5);
              return (
                <div
                  key={task.id}
                  className={`timeline-block ${
                    task.completed ? "is-completed" : ""
                  } ${task.kind === "event" ? "is-event" : ""}`}
                  draggable={!task.locked}
                  onDragStart={(event) => {
                    if (task.locked) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData(
                      "text/dayflow-task",
                      task.id,
                    );
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  style={{
                    top,
                    height,
                    left: 8 + index * 5,
                    right: 8,
                    zIndex: 2 + index,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditTask(task);
                  }}
                >
                  <div className="timeline-block-head">
                    <PriorityDot priority={task.priority} />
                    <span>{task.start}–{task.end}</span>
                    {task.locked ? <Icon name="lock" size={12} /> : null}
                  </div>
                  <strong>{task.title}</strong>
                  <div className="timeline-block-meta">
                    {task.category}
                    {task.deadline ? ` · 截止 ${task.deadline.split("T")[0]}` : ""}
                  </div>
                  <button
                    className={`check-circle check-circle--floating ${
                      task.completed ? "is-checked" : ""
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleComplete(task.id);
                    }}
                    aria-label={task.completed ? "标记未完成" : "标记完成"}
                  >
                    {task.completed ? <Icon name="check" size={11} /> : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonthView({
  anchor,
  tasks,
  onSelectDay,
  onEditTask,
  onToggleComplete,
  onMoveTask,
}: TaskActionProps & {
  anchor: Date;
  tasks: ScheduleItem[];
  onSelectDay: (dateKey: string) => void;
}) {
  const dates = monthMatrix(anchor);
  const month = anchor.getMonth();

  return (
    <div className="month-view">
      <div className="month-title">{formatMonthTitle(anchor)}</div>
      <div className="month-weekdays">
        {WEEKDAYS_SHORT_CN.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="month-grid">
        {dates.map((date) => {
          const key = toDateKey(date);
          const items = tasks
            .filter((task) => task.date === key)
            .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
          const outside = date.getMonth() !== month;
          return (
            <button
              key={key}
              className={`month-cell ${outside ? "is-outside" : ""} ${
                isToday(date) ? "is-today" : ""
              }`}
              onClick={() => onSelectDay(key)}
            >
              <span className="month-date">{date.getDate()}</span>
              <div className="month-items">
                {items.slice(0, 3).map((task) => (
                  <span
                    key={task.id}
                    className={`month-task ${task.completed ? "is-completed" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditTask(task);
                    }}
                  >
                    <PriorityDot priority={task.priority} />
                    <span>{task.title}</span>
                  </span>
                ))}
                {items.length > 3 ? (
                  <span className="month-more">+{items.length - 3}</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      <div className="month-legend">
        <span><PriorityDot priority="high" /> 高</span>
        <span><PriorityDot priority="medium" /> 中</span>
        <span><PriorityDot priority="low" /> 低</span>
        <span className="month-legend-hint">点击日期进入日视图</span>
      </div>
    </div>
  );
}
