export type Priority = "high" | "medium" | "low";
export type ItemKind = "task" | "event";
export type CalendarView = "day" | "week" | "month";
export type TimeGranularity = 15 | 30 | 60;

export type RecurrenceType =
  | "none"
  | "daily"
  | "weekdays"
  | "weekly"
  | "interval";

export type Recurrence = {
  type: RecurrenceType;
  intervalDays?: number;
  weekdays?: number[];
  until?: string;
};

export type ScheduleItem = {
  id: string;
  title: string;
  kind: ItemKind;
  date?: string;
  start?: string;
  end?: string;
  preferredStart?: string;
  estimatedMinutes: number;
  priority: Priority;
  category: string;
  deadline?: string;
  notes?: string;
  location?: string;
  link?: string;
  locked: boolean;
  completed: boolean;
  recurrence?: Recurrence;
  recurrenceGroupId?: string;
  source: "manual" | "ai";
  createdAt: string;
  updatedAt: string;
};

export type TimeBlock = {
  start: string;
  end: string;
  label?: string;
};

export type DayTemplate = {
  wake: string;
  sleep: string;
  maxMinutes: number;
  blocks: TimeBlock[];
};

export type Settings = {
  workday: DayTemplate;
  weekend: DayTemplate;
  granularity: TimeGranularity;
  defaultView: CalendarView;
  bufferMinutes: number;
  dndStart: string;
  dndEnd: string;
  digestTime: string;
  categories: string[];
  aiModel: string;
};

export type AppState = {
  version: 1;
  tasks: ScheduleItem[];
  settings: Settings;
  updatedAt: string;
};

export type ParsedItem = {
  title: string;
  kind: ItemKind;
  pool?: boolean;
  date?: string;
  start?: string;
  end?: string;
  estimatedMinutes?: number;
  priority: Priority;
  category?: string;
  deadline?: string;
  locked?: boolean;
  notes?: string;
  location?: string;
  link?: string;
  recurrence?: Recurrence;
  confidence?: number;
  assumptions?: string[];
};

export type AiParseResult = {
  items: ParsedItem[];
  questions: string[];
  summary?: string;
};

export type DraftItem = ParsedItem & {
  draftId: string;
  selected: boolean;
  confidence: number;
};

export type ScheduleWarning = {
  taskId: string;
  message: string;
};
