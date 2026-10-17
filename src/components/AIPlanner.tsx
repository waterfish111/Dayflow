import { useRef, useState, type RefObject } from "react";
import { Icon } from "./Icon";

const EXAMPLES = [
  "周三下午 2 点到 4 点开会，周五晚上写作业，周日截止",
  "明天上午复习数学两小时，晚上跑步 30 分钟",
  "每天 19:00 学习英语 1 小时，持续到月底",
];

export function AIPlanner({
  onParse,
  loading,
  error,
  hasApiKey,
  onOpenSettings,
  inputRef,
}: {
  onParse: (text: string) => void;
  loading: boolean;
  error: string;
  hasApiKey: boolean;
  onOpenSettings: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState("");
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || loading) return;
    onParse(value);
  };

  return (
    <section className="planner-card">
      <div className="planner-topline">
        <span className="eyebrow">
          <Icon name="sparkles" size={15} />
          自然语言规划
        </span>
        <span className="planner-hint">AI 只出草案，确认后才写入</span>
      </div>

      <h1 className="planner-title">
        把今天要做的，
        <br />
        说成一句话。
      </h1>

      <div className="planner-input-wrap">
        <textarea
          ref={(node) => {
            localRef.current = node;
            inputRef.current = node;
          }}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="例如：这周周三有一场会议，下午 2 点到 4 点；周五晚上完成作业，截止周日。"
          rows={4}
          aria-label="用自然语言描述计划"
        />
        <button
          className="button button--primary planner-submit"
          onClick={submit}
          disabled={loading || !text.trim()}
        >
          {loading ? (
            <>
              <span className="spinner" />
              正在拆解
            </>
          ) : (
            <>
              <Icon name="sparkles" size={18} />
              生成计划草案
            </>
          )}
        </button>
      </div>

      <div className="planner-footer">
        <div className="example-chips">
          <span className="examples-label">试试：</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              className="chip"
              onClick={() => {
                setText(example);
                localRef.current?.focus();
              }}
            >
              {example.length > 22 ? `${example.slice(0, 22)}…` : example}
            </button>
          ))}
        </div>
        {!hasApiKey ? (
          <button className="text-button" onClick={onOpenSettings}>
            <Icon name="key" size={15} />
            先填入 DeepSeek Key
          </button>
        ) : (
          <span className="shortcut-hint">⌘ / Ctrl + Enter</span>
        )}
      </div>

      {error ? (
        <div className="inline-error">
          <Icon name="alert" size={16} />
          {error}
        </div>
      ) : null}
    </section>
  );
}
