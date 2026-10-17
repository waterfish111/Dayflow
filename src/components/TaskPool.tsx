import { useMemo, useState } from "react";
import type { ScheduleItem, Settings } from "../types";
import { formatDeadline, formatDuration } from "../lib/date";
import { sortForPool, taskDuration } from "../lib/scheduler";
import { Icon } from "./Icon";
import { EmptyState, PriorityDot } from "./ui";

export function TaskPool({
  tasks,
  settings,
  onAddTask,
  onEditTask,
  onScheduleOne,
  onAutoSchedule,
  onToggleComplete,
}: {
  tasks: ScheduleItem[];
  settings: Settings;
  onAddTask: () => void;
  onEditTask: (task: ScheduleItem) => void;
  onScheduleOne: (taskId: string) => void;
  onAutoSchedule: () => void;
  onToggleComplete: (taskId: string) => void;
}) {
  const [filter, setFilter] = useState("全部");
  const filtered = useMemo(() => {
    const list =
      filter === "全部"
        ? tasks
        : tasks.filter((task) => task.category === filter);
    return [...list].sort(sortForPool);
  }, [tasks, filter]);

  return (
    <aside className="pool-card">
      <div className="pool-head">
        <div>
          <div className="calendar-eyebrow">INBOX</div>
          <h2>待办池</h2>
        </div>
        <span className="pool-count">{tasks.length}</span>
      </div>

      <p className="pool-intro">
        先记下来，再决定放进哪一天。未锁定的任务可以被 AI 建议移动。
      </p>

      <div className="pool-toolbar">
        <div className="filter-chips">
          {["全部", ...settings.categories].map((category) => (
            <button
              key={category}
              className={`chip chip--filter ${
                filter === category ? "is-active" : ""
              }`}
              onClick={() => setFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="pool-actions">
        <button className="button button--primary button--small" onClick={onAddTask}>
          <Icon name="plus" size={16} />
          添加任务
        </button>
        <button
          className="button button--ghost button--small"
          onClick={onAutoSchedule}
          disabled={tasks.length === 0}
        >
          <Icon name="sparkles" size={15} />
          自动排期
        </button>
      </div>

      <div className="pool-list">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Icon name="inbox" size={26} />}
            title={tasks.length === 0 ? "待办池是空的" : "这个分类还没有任务"}
            description={
              tasks.length === 0
                ? "把还没想好时间的事先放进来，之后让排期引擎帮你找空档。"
                : "换个分类看看，或者添加一条新任务。"
            }
          />
        ) : (
          filtered.map((task) => (
            <div
              key={task.id}
              className={`pool-item ${task.completed ? "is-completed" : ""}`}
              onClick={() => onEditTask(task)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onEditTask(task);
                }
              }}
            >
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
              <div className="pool-item-main">
                <div className="pool-item-title">
                  <PriorityDot priority={task.priority} />
                  <strong>{task.title}</strong>
                </div>
                <div className="pool-item-meta">
                  <span>
                    <Icon name="clock" size={13} />
                    {formatDuration(taskDuration(task))}
                  </span>
                  <span className="meta-dot">·</span>
                  <span>{task.category}</span>
                  {task.deadline ? (
                    <>
                      <span className="meta-dot">·</span>
                      <span className="deadline-text">
                        截止 {formatDeadline(task.deadline)}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="pool-item-actions">
                {task.locked ? (
                  <span className="lock-mark" title="已锁定">
                    <Icon name="lock" size={13} />
                  </span>
                ) : null}
                <button
                  className="icon-button icon-button--small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onScheduleOne(task.id);
                  }}
                  title="排入日历"
                  aria-label="排入日历"
                >
                  <Icon name="calendar-plus" size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="pool-foot">
        <span>
          <Icon name="lock" size={13} />
          锁定任务不会被自动移动
        </span>
        <span>{tasks.filter((task) => task.priority === "high").length} 项高优先级</span>
      </div>
    </aside>
  );
}
