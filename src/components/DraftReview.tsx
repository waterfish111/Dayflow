import { useEffect, useState } from "react";
import type { DraftItem } from "../types";
import { formatDeadline } from "../lib/date";
import { Icon } from "./Icon";
import { Modal, PriorityDot } from "./ui";

export function DraftReview({
  open,
  items,
  questions,
  summary,
  loading,
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
  onToggle: (draftId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onReask: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const selectedCount = items.filter((item) => item.selected).length;

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
                        {item.date
                          ? `${item.date}${item.start ? ` ${item.start}` : ""}${
                              item.end ? `–${item.end}` : ""
                            }`
                          : "由排期引擎安排"}
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
