import { useEffect, useState } from "react";
import type {
  CalendarView,
  DayTemplate,
  Settings,
  TimeBlock,
  TimeGranularity,
} from "../types";
import { Icon } from "./Icon";
import { Modal } from "./ui";
import type { NotificationPermissionState } from "../lib/notifications";

type TemplateKey = "workday" | "weekend";

function updateTemplate(
  settings: Settings,
  key: TemplateKey,
  patch: Partial<DayTemplate>,
): Settings {
  return {
    ...settings,
    [key]: { ...settings[key], ...patch },
  };
}

function updateBlock(
  settings: Settings,
  key: TemplateKey,
  index: number,
  patch: Partial<TimeBlock>,
): Settings {
  const blocks = settings[key].blocks.map((block, blockIndex) =>
    blockIndex === index ? { ...block, ...patch } : block,
  );
  return updateTemplate(settings, key, { blocks });
}

function addBlock(settings: Settings, key: TemplateKey): Settings {
  const blocks = [
    ...settings[key].blocks,
    { start: "09:00", end: "12:00", label: "专注时间" },
  ];
  return updateTemplate(settings, key, { blocks });
}

function removeBlock(
  settings: Settings,
  key: TemplateKey,
  index: number,
): Settings {
  return updateTemplate(settings, key, {
    blocks: settings[key].blocks.filter((_, blockIndex) => blockIndex !== index),
  });
}

export function SettingsPanel({
  open,
  settings,
  deepseekKey,
  notificationState,
  onClose,
  onSave,
  onSaveKey,
  onEnableNotifications,
  onExport,
}: {
  open: boolean;
  settings: Settings;
  deepseekKey: string;
  notificationState: NotificationPermissionState;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  onSaveKey: (key: string) => void;
  onEnableNotifications: () => void;
  onExport: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [keyDraft, setKeyDraft] = useState(deepseekKey);
  const [showKey, setShowKey] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(JSON.parse(JSON.stringify(settings)) as Settings);
    setKeyDraft(deepseekKey);
    setShowKey(false);
    setNewCategory("");
  }, [open, settings, deepseekKey]);

  const templateSection = (key: TemplateKey, title: string, note: string) => {
    const template = draft[key];
    return (
      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h3>{title}</h3>
            <p>{note}</p>
          </div>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setDraft(addBlock(draft, key))}
          >
            <Icon name="plus" size={14} />
            添加时段
          </button>
        </div>
        <div className="settings-inline">
          <label className="field">
            <span>起床</span>
            <input
              type="time"
              value={template.wake}
              onChange={(event) =>
                setDraft(
                  updateTemplate(draft, key, { wake: event.target.value }),
                )
              }
            />
          </label>
          <label className="field">
            <span>睡觉</span>
            <input
              type="time"
              value={template.sleep}
              onChange={(event) =>
                setDraft(
                  updateTemplate(draft, key, { sleep: event.target.value }),
                )
              }
            />
          </label>
          <label className="field">
            <span>每日上限（分钟）</span>
            <input
              type="number"
              min={30}
              max={960}
              step={30}
              value={template.maxMinutes}
              onChange={(event) =>
                setDraft(
                  updateTemplate(draft, key, {
                    maxMinutes: Math.max(30, Number(event.target.value)),
                  }),
                )
              }
            />
          </label>
        </div>
        <div className="block-list">
          {template.blocks.map((block, index) => (
            <div className="block-row" key={`${key}-${index}`}>
              <input
                type="time"
                value={block.start}
                onChange={(event) =>
                  setDraft(
                    updateBlock(draft, key, index, {
                      start: event.target.value,
                    }),
                  )
                }
                aria-label="时段开始"
              />
              <span className="block-dash">–</span>
              <input
                type="time"
                value={block.end}
                onChange={(event) =>
                  setDraft(
                    updateBlock(draft, key, index, {
                      end: event.target.value,
                    }),
                  )
                }
                aria-label="时段结束"
              />
              <input
                className="block-label"
                value={block.label ?? ""}
                onChange={(event) =>
                  setDraft(
                    updateBlock(draft, key, index, {
                      label: event.target.value,
                    }),
                  )
                }
                placeholder="时段名称"
                aria-label="时段名称"
              />
              <button
                type="button"
                className="icon-button icon-button--small"
                onClick={() => setDraft(removeBlock(draft, key, index))}
                aria-label="删除时段"
              >
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}
          {template.blocks.length === 0 ? (
            <p className="settings-muted">
              还没有可用时段，排期会使用起床到睡觉之间的时间。
            </p>
          ) : null}
        </div>
      </section>
    );
  };

  return (
    <Modal
      open={open}
      title="设置"
      subtitle="这些设置只保存在当前浏览器，之后可以迁移到云端账号。"
      onClose={onClose}
      wide
    >
      <div className="settings-body">
        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3>日历</h3>
              <p>决定打开应用时看到的视图和拖动时的最小时间单位。</p>
            </div>
          </div>
          <div className="settings-inline">
            <label className="field">
              <span>默认视图</span>
              <select
                value={draft.defaultView}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    defaultView: event.target.value as CalendarView,
                  })
                }
              >
                <option value="week">本周</option>
                <option value="day">当天</option>
                <option value="month">本月</option>
              </select>
            </label>
            <label className="field">
              <span>时间粒度</span>
              <select
                value={draft.granularity}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    granularity: Number(event.target.value) as TimeGranularity,
                  })
                }
              >
                <option value={15}>15 分钟</option>
                <option value={30}>30 分钟</option>
                <option value={60}>60 分钟</option>
              </select>
            </label>
            <label className="field">
              <span>任务间缓冲（分钟）</span>
              <input
                type="number"
                min={0}
                max={60}
                step={5}
                value={draft.bufferMinutes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    bufferMinutes: Math.max(0, Number(event.target.value)),
                  })
                }
              />
            </label>
          </div>
        </section>

        {templateSection("workday", "工作日作息", "排期只会把任务放进这些可用时段。")}
        {templateSection("weekend", "周末作息", "周末可以和工作日完全不同。")}

        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3>提醒</h3>
              <p>每天汇总今天的任务；固定日程和截止任务提前两小时提醒。</p>
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={onEnableNotifications}
            >
              <Icon name="bell" size={15} />
              {notificationState === "granted"
                ? "通知已开启"
                : notificationState === "unsupported"
                  ? "浏览器不支持"
                  : "开启系统通知"}
            </button>
          </div>
          <div className="settings-inline">
            <label className="field">
              <span>每日汇总</span>
              <input
                type="time"
                value={draft.digestTime}
                onChange={(event) =>
                  setDraft({ ...draft, digestTime: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>免打扰开始</span>
              <input
                type="time"
                value={draft.dndStart}
                onChange={(event) =>
                  setDraft({ ...draft, dndStart: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>免打扰结束</span>
              <input
                type="time"
                value={draft.dndEnd}
                onChange={(event) =>
                  setDraft({ ...draft, dndEnd: event.target.value })
                }
              />
            </label>
          </div>
          <p className="settings-muted">
            网页通知需要 HTTPS；手机通过局域网 HTTP 打开时，系统通知可能不可用。
          </p>
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3>分类</h3>
              <p>用在任务标签和筛选里，可以自由增删。</p>
            </div>
          </div>
          <div className="category-editor">
            {draft.categories.map((category) => (
              <span className="category-tag" key={category}>
                {category}
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      categories: draft.categories.filter(
                        (item) => item !== category,
                      ),
                    })
                  }
                  aria-label={`删除分类 ${category}`}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            <div className="category-add">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const value = newCategory.trim();
                    if (value && !draft.categories.includes(value)) {
                      setDraft({
                        ...draft,
                        categories: [...draft.categories, value],
                      });
                      setNewCategory("");
                    }
                  }
                }}
                placeholder="新分类"
              />
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => {
                  const value = newCategory.trim();
                  if (value && !draft.categories.includes(value)) {
                    setDraft({
                      ...draft,
                      categories: [...draft.categories, value],
                    });
                    setNewCategory("");
                  }
                }}
              >
                添加
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3>DeepSeek</h3>
              <p>每个使用者填自己的 Key；它只保存在本机浏览器，不会写入项目代码。</p>
            </div>
          </div>
          <label className="field field--full">
            <span>API Key</span>
            <div className="key-input">
              <input
                type={showKey ? "text" : "password"}
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder="sk-..."
                autoComplete="off"
              />
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </label>
          <label className="field">
            <span>模型</span>
            <select
              value={draft.aiModel}
              onChange={(event) =>
                setDraft({ ...draft, aiModel: event.target.value })
              }
            >
              <option value="deepseek-chat">deepseek-chat（默认）</option>
              <option value="deepseek-reasoner">deepseek-reasoner（更慢）</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3>数据</h3>
              <p>当前版本用浏览器本地存储，导出后可用于备份或迁移。</p>
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={onExport}
            >
              <Icon name="download" size={15} />
              导出 JSON
            </button>
          </div>
        </section>
      </div>

      <div className="settings-actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            onSaveKey(keyDraft.trim());
            onSave(draft);
          }}
        >
          <Icon name="check" size={17} />
          保存设置
        </button>
      </div>
    </Modal>
  );
}
