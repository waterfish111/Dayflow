import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AppState,
  CalendarView,
  DraftItem,
  ParsedItem,
  ScheduleItem,
  Settings,
  TimeGranularity,
} from "./types";
import { loadDeepSeekKey, loadState, saveDeepSeekKey, saveState } from "./data/storage";
import { parseWithAI } from "./lib/ai";
import {
  checkReminders,
  notificationPermission,
  registerServiceWorker,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "./lib/notifications";
import {
  autoSchedule,
  expandRecurrence,
  isTaskScheduled,
} from "./lib/scheduler";
import { createId } from "./lib/id";
import {
  addMinutesToTime,
  durationBetween,
  formatDurationCompact,
  todayKey,
} from "./lib/date";
import { AIPlanner } from "./components/AIPlanner";
import { CalendarPanel } from "./components/CalendarPanel";
import { DraftReview } from "./components/DraftReview";
import { Header } from "./components/Header";
import { SettingsPanel } from "./components/SettingsPanel";
import { TaskEditor } from "./components/TaskEditor";
import { TaskPool } from "./components/TaskPool";
import { Toast, type ToastMessage } from "./components/Toast";
import { Icon } from "./components/Icon";

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [view, setView] = useState<CalendarView>(
    () => state.settings.defaultView,
  );
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTask, setEditorTask] = useState<ScheduleItem | null>(null);
  const [editorDate, setEditorDate] = useState<string | undefined>();
  const [editorStart, setEditorStart] = useState<string | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deepseekKey, setDeepseekKey] = useState(() => loadDeepSeekKey());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [draftQuestions, setDraftQuestions] = useState<string[]>([]);
  const [draftSummary, setDraftSummary] = useState("");
  const [notificationState, setNotificationState] =
    useState<NotificationPermissionState>(() => notificationPermission());
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const plannerRef = useRef<HTMLTextAreaElement | null>(null);
  const stateRef = useRef(state);
  const lastTextRef = useRef("");
  const aiAbortRef = useRef<AbortController | null>(null);
  const toastIdRef = useRef(0);

  const showToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "success") => {
      toastIdRef.current += 1;
      setToast({ id: toastIdRef.current, text, tone });
    },
    [],
  );

  useEffect(() => {
    saveState(state);
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (import.meta.env.PROD) registerServiceWorker();
  }, []);

  useEffect(() => {
    void checkReminders(stateRef.current);
    const timer = window.setInterval(() => {
      void checkReminders(stateRef.current);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const scheduledTasks = useMemo(
    () => state.tasks.filter(isTaskScheduled),
    [state.tasks],
  );
  const poolTasks = useMemo(
    () => state.tasks.filter((task) => !isTaskScheduled(task)),
    [state.tasks],
  );
  const todayTasks = useMemo(
    () =>
      state.tasks.filter(
        (task) => task.date === todayKey() && !task.completed,
      ),
    [state.tasks],
  );
  const todayMinutes = useMemo(
    () =>
      todayTasks.reduce(
        (total, task) =>
          total +
          (task.start && task.end
            ? durationBetween(task.start, task.end)
            : task.estimatedMinutes || 0),
        0,
      ),
    [todayTasks],
  );

  const openNewTask = (dateKey?: string, start?: string) => {
    setEditorTask(null);
    setEditorDate(dateKey);
    setEditorStart(start);
    setEditorOpen(true);
  };

  const openTask = (task: ScheduleItem) => {
    setEditorTask(task);
    setEditorDate(task.date);
    setEditorStart(task.start);
    setEditorOpen(true);
  };

  const handleSaveTask = (task: ScheduleItem) => {
    const exists = state.tasks.some((item) => item.id === task.id);
    const nextTasks = exists
      ? state.tasks.map((item) => (item.id === task.id ? task : item))
      : [...state.tasks, ...expandRecurrence(task)];

    setState((previous) => ({
      ...previous,
      tasks: nextTasks,
      updatedAt: new Date().toISOString(),
    }));
    setEditorOpen(false);
    setEditorTask(null);
    showToast(
      exists
        ? "日程已更新"
        : isTaskScheduled(task)
          ? "已加入日历"
          : "已加入待办池",
    );
  };

  const handleDeleteTask = (taskId: string) => {
    setState((previous) => ({
      ...previous,
      tasks: previous.tasks.filter((task) => task.id !== taskId),
      updatedAt: new Date().toISOString(),
    }));
    setEditorOpen(false);
    setEditorTask(null);
    showToast("日程已删除", "info");
  };

  const handleToggleComplete = (taskId: string) => {
    setState((previous) => ({
      ...previous,
      tasks: previous.tasks.map((task) =>
        task.id === taskId
          ? { ...task, completed: !task.completed, updatedAt: new Date().toISOString() }
          : task,
      ),
    }));
  };

  const handleMoveTask = (
    taskId: string,
    dateKey: string,
    start?: string,
  ) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (task.locked) {
      showToast("这件事已锁定，先解锁才能移动", "info");
      return;
    }
    const now = new Date().toISOString();
    if (start) {
      const duration =
        task.start && task.end
          ? durationBetween(task.start, task.end)
          : task.estimatedMinutes || 60;
      const end = addMinutesToTime(start, duration);
      setState((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) =>
          item.id === taskId
            ? {
                ...item,
                date: dateKey,
                start,
                end,
                updatedAt: now,
              }
            : item,
        ),
        updatedAt: now,
      }));
      showToast(`已移动到 ${start}`);
    } else {
      setState((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) =>
          item.id === taskId
            ? { ...item, date: dateKey, updatedAt: now }
            : item,
        ),
        updatedAt: now,
      }));
      showToast("已移动到新的日期");
    }
  };

  const handleScheduleOne = (taskId: string) => {
    const result = autoSchedule(state.tasks, state.settings, {
      taskIds: [taskId],
      horizonDays: 21,
    });
    setState((previous) => ({
      ...previous,
      tasks: result.tasks,
      updatedAt: new Date().toISOString(),
    }));
    if (result.warnings.length > 0) {
      showToast(result.warnings[0].message, "error");
    } else {
      showToast("已排入日历");
    }
  };

  const handleUnscheduleTask = (taskId: string) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (task.kind === "event") {
      showToast("固定日程不能移入待办池", "info");
      return;
    }
    if (task.locked) {
      showToast("这件事已锁定，先解锁才能移入待办池", "info");
      return;
    }

    const estimatedMinutes =
      task.start && task.end
        ? durationBetween(task.start, task.end)
        : task.estimatedMinutes;
    const now = new Date().toISOString();
    setState((previous) => ({
      ...previous,
      tasks: previous.tasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              date: undefined,
              start: undefined,
              end: undefined,
              preferredStart: undefined,
              estimatedMinutes,
              updatedAt: now,
            }
          : item,
      ),
      updatedAt: now,
    }));
    setEditorOpen(false);
    setEditorTask(null);
    showToast("已移入待办池");
  };

  const handleAutoSchedule = () => {
    const ids = poolTasks.map((task) => task.id);
    if (ids.length === 0) {
      showToast("待办池里还没有任务", "info");
      return;
    }
    const result = autoSchedule(state.tasks, state.settings, {
      taskIds: ids,
      horizonDays: 21,
    });
    setState((previous) => ({
      ...previous,
      tasks: result.tasks,
      updatedAt: new Date().toISOString(),
    }));
    if (result.warnings.length > 0) {
      showToast(
        `已排入部分任务，${result.warnings.length} 项暂时没有空档`,
        "error",
      );
    } else {
      showToast(`已为 ${ids.length} 项任务寻找空档`);
    }
  };

  const handleAIRequest = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    lastTextRef.current = clean;
    setAiLoading(true);
    setAiError("");

    try {
      const result = await parseWithAI(
        clean,
        stateRef.current.settings,
        deepseekKey,
        controller.signal,
      );
      const items: DraftItem[] = result.items.map((item) => ({
        ...item,
        draftId: createId("draft"),
        selected: (item.confidence ?? 0.5) >= 0.7,
        confidence: item.confidence ?? 0.5,
      }));
      setDraftItems(items);
      setDraftQuestions(result.questions);
      setDraftSummary(result.summary ?? "");
      setDraftOpen(true);
      if (items.length === 0 && result.questions.length === 0) {
        showToast("AI 没有解析出日程，请写得更具体一些", "error");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      const message =
        error instanceof Error ? error.message : "AI 解析失败，请稍后再试";
      setAiError(message);
      showToast(message, "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleDraft = (draftId: string) => {
    setDraftItems((items) =>
      items.map((item) =>
        item.draftId === draftId ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  const handleReask = (answer: string) => {
    if (!answer.trim()) return;
    void handleAIRequest(
      `${lastTextRef.current}\n补充说明：${answer.trim()}`,
    );
  };

  const handleConfirmDraft = () => {
    const selected = draftItems.filter((item) => item.selected);
    const valid: ParsedItem[] = [];
    let skippedEvents = 0;

    for (const item of selected) {
      if (
        !item.pool &&
        item.kind === "event" &&
        (!item.date || !item.start || !item.end)
      ) {
        skippedEvents += 1;
        continue;
      }
      valid.push(item);
    }

    if (valid.length === 0) {
      showToast("至少选择一条信息完整的日程", "error");
      return;
    }

    const now = new Date().toISOString();
    const newTasks: ScheduleItem[] = [];
    const poolTaskIds = new Set<string>();

    for (const item of valid) {
      const id = createId("task");
      const forcePool = Boolean(item.pool);
      if (forcePool) poolTaskIds.add(id);
      const start = forcePool ? undefined : item.start;
      const end = forcePool ? undefined : item.end;
      const category =
        item.category && state.settings.categories.includes(item.category)
          ? item.category
          : state.settings.categories[0] ?? "其他";
      newTasks.push({
        id,
        title: item.title.trim() || "未命名任务",
        kind: forcePool ? "task" : item.kind,
        date: forcePool ? undefined : item.date,
        start,
        end,
        preferredStart: !forcePool && !item.date && start ? start : undefined,
        estimatedMinutes:
          item.estimatedMinutes ??
          (start && end ? Math.max(15, durationBetween(start, end)) : 60),
        priority: item.priority,
        category,
        deadline: item.deadline,
        notes: item.notes,
        location: item.location,
        link: item.link,
        locked: forcePool
          ? false
          : item.kind === "event"
            ? true
            : Boolean(item.locked),
        completed: false,
        recurrence:
          item.recurrence && item.recurrence.type !== "none"
            ? item.recurrence
            : undefined,
        source: "ai",
        createdAt: now,
        updatedAt: now,
      });
    }

    const schedulingIds = newTasks
      .filter(
        (task) => !poolTaskIds.has(task.id) && !isTaskScheduled(task),
      )
      .map((task) => task.id);
    const result = autoSchedule(
      [...state.tasks, ...newTasks],
      state.settings,
      {
        taskIds: schedulingIds,
        horizonDays: 21,
      },
    );
    const newIds = new Set(newTasks.map((task) => task.id));
    const finalTasks: ScheduleItem[] = [];

    for (const task of result.tasks) {
      if (
        newIds.has(task.id) &&
        task.recurrence &&
        task.recurrence.type !== "none"
      ) {
        finalTasks.push(...expandRecurrence(task));
      } else {
        finalTasks.push(task);
      }
    }

    setState((previous) => ({
      ...previous,
      tasks: finalTasks,
      updatedAt: new Date().toISOString(),
    }));
    setDraftOpen(false);
    setDraftItems([]);
    setDraftQuestions([]);
    setDraftSummary("");

    if (skippedEvents > 0) {
      showToast(
        `${skippedEvents} 条固定日程缺少日期或时间，未写入；其余已写入`,
        "error",
      );
    } else if (result.warnings.length > 0) {
      showToast(
        `计划已写入，${result.warnings.length} 项暂时留在待办池`,
        "error",
      );
    } else if (poolTaskIds.size > 0 && newTasks.length > poolTaskIds.size) {
      showToast(
        `已写入日历，${poolTaskIds.size} 项放入待办池`,
      );
    } else if (poolTaskIds.size > 0) {
      showToast("已加入待办池");
    } else {
      showToast("计划已写入日历");
    }
  };

  const handleSaveSettings = (settings: Settings) => {
    setState((previous) => ({
      ...previous,
      settings,
      updatedAt: new Date().toISOString(),
    }));
    setView(settings.defaultView);
    setSettingsOpen(false);
    showToast("设置已保存");
  };

  const handleSaveKey = (value: string) => {
    saveDeepSeekKey(value);
    setDeepseekKey(value);
  };

  const handleGranularityChange = (value: TimeGranularity) => {
    setState((previous) => ({
      ...previous,
      settings: { ...previous.settings, granularity: value },
      updatedAt: new Date().toISOString(),
    }));
  };

  const enableNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotificationState(result);
    if (result === "granted") {
      showToast("系统通知已开启");
      void checkReminders(stateRef.current);
    } else if (result === "denied") {
      showToast("通知权限被拒绝，可以在浏览器设置里重新开启", "error");
    } else if (result === "unsupported") {
      showToast("当前浏览器不支持系统通知", "error");
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchorElement = document.createElement("a");
    anchorElement.href = url;
    anchorElement.download = `dayflow-${todayKey()}.json`;
    anchorElement.click();
    URL.revokeObjectURL(url);
    showToast("已导出 JSON 备份");
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />

      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onEnableNotifications={enableNotifications}
        notificationState={notificationState}
        onFocusPlanner={() => {
          plannerRef.current?.focus();
          plannerRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }}
      />

      <main className="app-main">
        <AIPlanner
          onParse={(text) => void handleAIRequest(text)}
          loading={aiLoading}
          error={aiError}
          hasApiKey={Boolean(deepseekKey)}
          onOpenSettings={() => setSettingsOpen(true)}
          inputRef={plannerRef}
        />

        <div className="today-strip">
          <div className="today-stat">
            <span className="today-stat-label">今天</span>
            <strong>{todayTasks.length}</strong>
            <span>个安排</span>
          </div>
          <div className="today-stat">
            <span className="today-stat-label">已排时长</span>
            <strong>{formatDurationCompact(todayMinutes)}</strong>
          </div>
          <div className="today-stat">
            <span className="today-stat-label">待办池</span>
            <strong>{poolTasks.length}</strong>
            <span>项</span>
          </div>
          <div className="today-stat today-stat--accent">
            <span className="today-stat-label">
              <Icon name="sparkles" size={14} />
              AI 边界
            </span>
            <span>只出草案，确认后写入</span>
          </div>
        </div>

        <div className="workspace-grid">
          <CalendarPanel
            view={view}
            setView={setView}
            anchor={anchor}
            setAnchor={setAnchor}
            tasks={scheduledTasks}
            settings={state.settings}
            onEditTask={openTask}
            onToggleComplete={handleToggleComplete}
            onMoveTask={handleMoveTask}
            onAddTask={(dateKey, start) => openNewTask(dateKey, start)}
            onGranularityChange={handleGranularityChange}
          />
          <TaskPool
            tasks={poolTasks}
            settings={state.settings}
            onAddTask={() => openNewTask()}
            onEditTask={openTask}
            onScheduleOne={handleScheduleOne}
            onAutoSchedule={handleAutoSchedule}
            onToggleComplete={handleToggleComplete}
            onUnscheduleTask={handleUnscheduleTask}
          />
        </div>

        <footer className="app-footer">
          <span>Dayflow · 第一版</span>
          <span>
            <Icon name="target" size={13} />
            确定性排期 + AI 草案 + 本地优先
          </span>
          <span>数据保存在当前浏览器</span>
        </footer>
      </main>

      <TaskEditor
        open={editorOpen}
        task={editorTask}
        initialDate={editorDate}
        initialStart={editorStart}
        categories={state.settings.categories}
        onClose={() => {
          setEditorOpen(false);
          setEditorTask(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        onUnschedule={handleUnscheduleTask}
      />

      <SettingsPanel
        open={settingsOpen}
        settings={state.settings}
        deepseekKey={deepseekKey}
        notificationState={notificationState}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onSaveKey={handleSaveKey}
        onEnableNotifications={enableNotifications}
        onExport={handleExport}
      />

      <DraftReview
        open={draftOpen}
        items={draftItems}
        questions={draftQuestions}
        summary={draftSummary}
        loading={aiLoading}
        onToggle={handleToggleDraft}
        onConfirm={handleConfirmDraft}
        onClose={() => setDraftOpen(false)}
        onReask={handleReask}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
