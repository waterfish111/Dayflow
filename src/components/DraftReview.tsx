import { useEffect, useMemo, useState } from "react";
import type { DraftItem, ScheduleItem, Settings } from "../types";
import {
  durationBetween,
  formatDeadline,
  relativeDateLabel,
} from "../lib/date";
import { autoSchedule, isTaskScheduled } from "../lib/scheduler";
import { Icon } from "./Icon";
import { Modal, PriorityDot } from "./ui";

type DemoInfo = { remaining: number; limit: number };

type PreviewSlot = { date: string; start: string; end: string };

export function DraftReview({
  open,
  items,
  questions,
  summary,
  loading,
  tasks,
  settings,
  demo,
  onToggle,
  onConfirm,
  onClose,
  onReask,
}: {
  open: boolean;
  items: DraftItem[];
  questions: string[];
  summary: string;
  loading: boolean;
  tasks: ScheduleItem[];
  settings: Settings;
  demo: DemoInfo | null;
  onToggle: (draftId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onReask: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const selectedCount = items.filter((item) => item.selected).length;

  // 真正写入时会调用一次 autoSchedule；这里用同样的参数先跑一遍，
  // 把结果当「预计时间」显示给用户，确认前就能看到会排到哪。
  const previews = useMemo(() => {
    const result = new Map<string, PreviewSlot | null>();
    const pending = items.filter(
      (item) =>
        item.selected &&
        !item.pool &&
        !(item.date && item.start && item.end),
    );
    if (pending.length === 0) return result;

    const now = new Date().toISOString();
    const pseudo: ScheduleItem[] = pending.map((item) => ({
      id: `preview:${item.draftId}`,
      title: item.title,
      kind: item.kind,
      date: item.date,
      start: item.start,
      end: item.end,
      preferredStart: !item.date && item.start ? item.start : undefined,
      estimatedMinutes:
        item.estimatedMinutes ??
        (item.start && item.end
          ? Math.max(15, durationBetween(item.start, item.end))
          : 60),
      priority: item.priority,
      category:
        item.category && settings.categories.includes(item.category)
          ? item.category
          : settings.categories[0] ?? "其他",
      deadline: item.deadline,
      locked: false,
      completed: false,
      recurrence: undefined,
      source: "ai",
      createdAt: now,
      updatedAt: now,
    }));

    const scheduled = autoSchedule([...tasks, ...pseudo], settings, {
      taskIds: pseudo.map((task) => task.id),
      horizonDays: 21,
    });
    const placed = new Map(scheduled.tasks.map((task) => [task.id, task]));

    for (const task of pseudo) {
      const next = placed.get(task.id);
      result.set(
        task.id.slice("preview:".length),
        next && isTaskScheduled(next)
          ? { date: next.date!, start: next.start!, end: next.end! }
          : null,
      );
    }
    return result;
  }, [items, tasks, settings]);

  const timeLabel = (item: DraftItem) => {
    if (item.pool) return "待办池 · 不排期";
    if (item.date) {
      return `${item.date}${item.start ? ` ${item.start}` : ""}${
        item.end ? `–${item.end}` : ""
      }`;
    }
    if (item.kind === "event") return "固定日程缺少时间，确认时会跳过";
    if (!item.selected) return "未选中，不会写入";
    if (!previews.has(item.draftId)) return "由排期引擎安排";
    const slot = previews.get(item.draftId);
    if (!slot) return "暂时没有空档，会留在待办池";
    return `预计 ${relativeDateLabel(slot.date)} ${slot.start}–${slot.end}`;
  };

  useEffect(() => {
    if (open) setAnswer("");
  }, [open]);

  return (
    <Modal
      open={open}
      title="计划草案"
      subtitle="确认前不会写入正式日历。低把握的条目需要你单独勾选。"
      onClose={onClose}
      wide
    >
      <div className="draft-body">
        {summary ? (
          <div className="draft-summary">
            <Icon name="sparkles" size={16} />
            {summary}
          </div>
        ) : null}

        {questions.length > 0 ? (
          <div className="draft-questions">
            <div className="draft-questions-title">
              <Icon name="alert" size={16} />
              AI 还需要确认几件事
            </div>
            <ul>
              {questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
            <textarea
              rows={2}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="补充说明，例如：作业预计 3 小时，晚上 7 点开始。"
            />
            <button
              className="button button--ghost button--small"
              onClick={() => onReask(answer)}
              disabled={!answer.trim() || loading}
            >
              <Icon name="refresh" size={15} />
              补充后重新解析
            </button>
          </div>
        ) : null}

        <div className="draft-list">
          {items.length === 0 ? (
            <div className="draft-empty">
              AI 没有解析出可写入的日程。可以补充更具体的时间或时长后重试。
            </div>
          ) : (
            items.map((item) => {
              const lowConfidence = item.confidence < 0.7;
              return (
                <label
                  key={item.draftId}
                  className={`draft-item ${item.selected ? "is-selected" : ""} ${
                    lowConfidence ? "is-low-confidence" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => onToggle(item.draftId)}
                  />
                  <div className="draft-item-main">
                    <div className="draft-item-title">
                      <PriorityDot priority={item.priority} />
                      <strong>{item.title}</strong>
                      <span className={`draft-kind draft-kind--${item.kind}`}>
                        {item.kind === "event" ? "固定日程" : "任务"}
                      </span>
                      {item.pool ? (
                        <span className="draft-kind draft-kind--pool">
                          待办池
                        </span>
                      ) : null}
                      {lowConfidence ? (
                        <span className="confidence-badge">需确认</span>
                      ) : (
                        <span className="confidence-badge confidence-badge--good">
                          {Math.round(item.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="draft-item-meta">
                      <span>
                        <Icon name="calendar" size={13} />
                        {timeLabel(item)}
                      </span>
                      {item.estimatedMinutes ? (
                        <span>
                          <Icon name="clock" size={13} />
                          {item.estimatedMinutes} 分钟
                        </span>
                      ) : null}
                      {item.category ? <span>{item.category}</span> : null}
                      {item.deadline ? (
                        <span>截止 {formatDeadline(item.deadline)}</span>
                      ) : null}
                    </div>
                    {item.assumptions && item.assumptions.length > 0 ? (
                      <div className="draft-assumptions">
                        假设：{item.assumptions.join("；")}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="draft-actions">
        <span className="draft-selected">
          已选择 {selectedCount} / {items.length} 项
          {demo ? ` · 演示额度剩余 ${demo.remaining} 次` : ""}
        </span>
        <div className="editor-actions-right">
          <button className="button button--ghost" onClick={onClose} disabled={loading}>
            放弃草案
          </button>
          <button
            className="button button--primary"
            onClick={onConfirm}
            disabled={selectedCount === 0 || loading}
          >
            <Icon name="check" size={17} />
            确认并写入日历
          </button>
        </div>
      </div>
    </Modal>
  );
}
