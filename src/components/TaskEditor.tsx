import { useEffect, useMemo, useState } from "react";
import type {
  ItemKind,
  Priority,
  RecurrenceType,
  ScheduleItem,
} from "../types";
import {
  addMinutesToTime,
  durationBetween,
  minutesFromTime,
} from "../lib/date";
import { createId } from "../lib/id";
import { Icon } from "./Icon";
import { Modal, PriorityDot } from "./ui";

export function TaskEditor({
  open,
  task,
  initialDate,
  initialStart,
  categories,
  onClose,
  onSave,
  onDelete,
  onUnschedule,
}: {
  open: boolean;
  task: ScheduleItem | null;
  initialDate?: string;
  initialStart?: string;
  categories: string[];
  onClose: () => void;
  onSave: (task: ScheduleItem) => void;
  onDelete: (taskId: string) => void;
  onUnschedule: (taskId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ItemKind>("task");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState(60);
  const [priority, setPriority] = useState<Priority>("medium");
  const [category, setCategory] = useState(categories[0] ?? "工作");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("23:59");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");
  const [locked, setLocked] = useState(false);
  const [recurrenceType, setRecurrenceType] =
    useState<RecurrenceType>("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [intervalDays, setIntervalDays] = useState(2);
  const [error, setError] = useState("");

  const initialCategory = useMemo(
    () => categories[0] ?? "工作",
    [categories],
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    if (task) {
      setTitle(task.title);
      setKind(task.kind);
      setDate(task.date ?? "");
      setStart(task.start ?? "");
      setEnd(task.end ?? "");
      setDuration(
        task.start && task.end
          ? Math.max(15, durationBetween(task.start, task.end))
          : task.estimatedMinutes || 60,
      );
      setPriority(task.priority);
      setCategory(
        categories.includes(task.category) ? task.category : initialCategory,
      );
      const deadline = task.deadline?.split("T");
      setDeadlineDate(deadline?.[0] ?? "");
      setDeadlineTime(deadline?.[1] ?? "23:59");
      setNotes(task.notes ?? "");
      setLocation(task.location ?? "");
      setLink(task.link ?? "");
      setLocked(task.locked);
      setRecurrenceType(task.recurrence?.type ?? "none");
      setRecurrenceUntil(task.recurrence?.until ?? "");
      setIntervalDays(task.recurrence?.intervalDays ?? 2);
    } else {
      setTitle("");
      setKind("task");
      setDate(initialDate ?? "");
      setStart(initialStart ?? "");
      setEnd(initialStart ? addMinutesToTime(initialStart, 60) : "");
      setDuration(60);
      setPriority("medium");
      setCategory(initialCategory);
      setDeadlineDate("");
      setDeadlineTime("23:59");
      setNotes("");
      setLocation("");
      setLink("");
      setLocked(false);
      setRecurrenceType("none");
      setRecurrenceUntil("");
      setIntervalDays(2);
    }
  }, [open, task, initialDate, initialStart, categories, initialCategory]);

  const updateStart = (value: string) => {
    setStart(value);
    if (value && duration > 0) {
      setEnd(addMinutesToTime(value, duration));
    }
  };

  const updateEnd = (value: string) => {
    setEnd(value);
    if (start && value && minutesFromTime(value) > minutesFromTime(start)) {
      setDuration(durationBetween(start, value));
    }
  };

  const updateDuration = (value: number) => {
    setDuration(value);
    if (start) {
      setEnd(addMinutesToTime(start, value));
    }
  };

  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("给这件事起一个标题。");
      return;
    }
    if (kind === "event" && (!date || !start || !end)) {
      setError("会议或固定日程需要日期、开始时间和结束时间。");
      return;
    }
    if (start && !date) {
      setError("填写开始时间前，先选择日期。");
      return;
    }
    if (start && end && minutesFromTime(end) <= minutesFromTime(start)) {
      setError("结束时间需要晚于开始时间。");
      return;
    }

    const resolvedEnd =
      start && !end ? addMinutesToTime(start, duration) : end;
    const estimatedMinutes =
      start && resolvedEnd
        ? Math.max(15, durationBetween(start, resolvedEnd))
        : Math.max(15, duration);
    const now = new Date().toISOString();
    const next: ScheduleItem = {
      id: task?.id ?? createId("task"),
      title: cleanTitle,
      kind,
      date: date || undefined,
      start: start || undefined,
      end: resolvedEnd || undefined,
      preferredStart: task?.preferredStart,
      estimatedMinutes,
      priority,
      category,
      deadline: deadlineDate
        ? `${deadlineDate}T${deadlineTime || "23:59"}`
        : undefined,
      notes: notes.trim() || undefined,
      location: location.trim() || undefined,
      link: link.trim() || undefined,
      locked,
      completed: task?.completed ?? false,
      recurrence:
        recurrenceType === "none"
          ? undefined
          : {
              type: recurrenceType,
              intervalDays:
                recurrenceType === "interval" ? Math.max(1, intervalDays) : undefined,
              until: recurrenceUntil || undefined,
            },
      recurrenceGroupId: task?.recurrenceGroupId,
      source: task?.source ?? "manual",
      createdAt: task?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(next);
  };

  return (
    <Modal
      open={open}
      title={task ? "编辑日程" : "新建日程"}
      subtitle="日期留空会留在待办池；固定会议建议勾选锁定。"
      onClose={onClose}
      wide
    >
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field field--full">
          <span>标题</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：完成季度报告初稿"
            autoFocus
          />
        </label>

        <div className="field field--full">
          <span>类型</span>
          <div className="segmented">
            {(["task", "event"] as ItemKind[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`segment ${kind === value ? "is-active" : ""}`}
                onClick={() => {
                  setKind(value);
                  if (value === "event") setLocked(true);
                }}
              >
                {value === "task" ? "任务" : "固定会议 / 日程"}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>日期</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>

        <label className="field">
          <span>分类</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>开始时间</span>
          <input
            type="time"
            step={900}
            value={start}
            onChange={(event) => updateStart(event.target.value)}
          />
        </label>

        <label className="field">
          <span>结束时间</span>
          <input
            type="time"
            step={900}
            value={end}
            onChange={(event) => updateEnd(event.target.value)}
          />
        </label>

        <label className="field">
          <span>预计时长</span>
          <select
            value={duration}
            onChange={(event) => updateDuration(Number(event.target.value))}
          >
            {[15, 30, 45, 60, 90, 120, 180, 240].map((value) => (
              <option key={value} value={value}>
                {value < 60 ? `${value} 分钟` : `${value / 60} 小时`}
              </option>
            ))}
          </select>
        </label>

        <div className="field field--full">
          <span>优先级</span>
          <div className="priority-picker">
            {(["high", "medium", "low"] as Priority[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`priority-choice ${priority === value ? "is-active" : ""}`}
                onClick={() => setPriority(value)}
              >
                <PriorityDot priority={value} />
                {value === "high" ? "高" : value === "medium" ? "中" : "低"}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>截止日期</span>
          <input
            type="date"
            value={deadlineDate}
            onChange={(event) => setDeadlineDate(event.target.value)}
          />
        </label>

        <label className="field">
          <span>截止时间</span>
          <input
            type="time"
            value={deadlineTime}
            onChange={(event) => setDeadlineTime(event.target.value)}
            disabled={!deadlineDate}
          />
        </label>

        <label className="field">
          <span>重复</span>
          <select
            value={recurrenceType}
            onChange={(event) =>
              setRecurrenceType(event.target.value as RecurrenceType)
            }
          >
            <option value="none">不重复</option>
            <option value="daily">每天</option>
            <option value="weekdays">每个工作日</option>
            <option value="weekly">每周同一天</option>
            <option value="interval">每隔几天</option>
          </select>
        </label>

        <label className="field">
          <span>重复到</span>
          <input
            type="date"
            value={recurrenceUntil}
            onChange={(event) => setRecurrenceUntil(event.target.value)}
            disabled={recurrenceType === "none"}
          />
        </label>

        {recurrenceType === "interval" ? (
          <label className="field">
            <span>间隔天数</span>
            <input
              type="number"
              min={1}
              max={30}
              value={intervalDays}
              onChange={(event) => setIntervalDays(Number(event.target.value))}
            />
          </label>
        ) : null}

        <label className="field field--full">
          <span>备注</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="补充一点上下文，之后更容易想起来。"
          />
        </label>

        <label className="field">
          <span>地点</span>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="可选"
          />
        </label>

        <label className="field">
          <span>链接</span>
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="可选"
          />
        </label>

        <label className="toggle-row field--full">
          <input
            type="checkbox"
            checked={locked}
            onChange={(event) => setLocked(event.target.checked)}
          />
          <span>
            <strong>锁定时间</strong>
            <small>锁定后，自动排期不会移动这件事。</small>
          </span>
        </label>

        {error ? (
          <div className="inline-error field--full">
            <Icon name="alert" size={16} />
            {error}
          </div>
        ) : null}

        <div className="editor-actions field--full">
          <div className="editor-actions-left">
            {task ? (
              <button
                type="button"
                className="button button--danger-ghost"
                onClick={() => {
                  if (window.confirm(`删除「${task.title}」？`)) {
                    onDelete(task.id);
                  }
                }}
              >
                <Icon name="trash" size={16} />
                删除
              </button>
            ) : null}
            {task?.date && task.kind === "task" && !task.locked ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => onUnschedule(task.id)}
              >
                <Icon name="inbox" size={16} />
                移入待办池
              </button>
            ) : null}
          </div>
          <div className="editor-actions-right">
            <button type="button" className="button button--ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="button button--primary">
              <Icon name="check" size={17} />
              保存
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
