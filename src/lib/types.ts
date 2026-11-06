export type TaskStatus = 'queued' | 'running' | 'paused_quota' | 'waiting_answer' | 'submitted' | 'done' | 'failed' | 'stopped';

export type TaskKind = 'work' | 'plan' | 'review' | 'dplan' | 'dreview' | 'answer';

export type JobStatus = 'draft' | 'waiting' | 'planning' | 'running' | 'integrating' | 'done' | 'attention' | 'failed' | 'stopped';

export type EpicStatus =
  | 'planning' | 'awaiting_plan' | 'running' | 'integrating' | 'reviewing'
  | 'awaiting_result' | 'done' | 'attention' | 'failed' | 'stopped' | 'rejected';

export interface Epic {
  id: number;
  title: string;
  prompt: string;
  acceptance: string;
  director: string;
  status: EpicStatus;
  contract: string | null;
  plan_summary: string | null;
  plan_feedback: string | null;
  result_feedback: string | null;
  verdict: string | null;
  final_report: string | null;
  summary: string | null;
  error: string | null;
  base_commit: string | null;
  merge_branch: string | null;
  merge_worktree: string | null;
  conflict_files: string | null;
  plan_task_id: number | null;
  round: number;
  replans: number;
  created_at: number;
  finished_at: number | null;
}

export interface FeedEvent {
  id: number;
  task_id: number;
  ts: number;
  kind: string;
  summary: string;
  member: string;
  task_title: string;
  task_kind: TaskKind;
}

export interface WorkerLoad {
  name: string;
  title: string;
  model: string;
  strengths: string[];
  active: number;
  queued: number;
  free: number;
  cap: number;
  open: { id: number; title: string; status: string; job_id: number | null }[];
}

export interface TeamLoad {
  id: string;
  name: string;
  lead: string | null;
  workers: WorkerLoad[];
}

export interface Job {
  id: number;
  title: string;
  prompt: string;
  acceptance: string;
  team: string;
  lead: string;
  status: JobStatus;
  summary: string | null;
  error: string | null;
  base_commit: string | null;
  merge_branch: string | null;
  merge_worktree: string | null;
  conflict_files: string | null;
  plan_task_id: number | null;
  epic_id: number | null;
  depends_on: string | null;
  round: number;
  created_at: number;
  finished_at: number | null;
}

export interface Task {
  id: number;
  title: string;
  prompt: string;
  acceptance: string;
  team: string;
  member: string;
  role: string;
  status: TaskStatus;
  model: string | null;
  effort: string | null;
  level: 'auto' | 'easy' | 'normal' | 'hard';
  level_source: 'auto' | 'user';
  level_reason: string | null;
  escalations: number;
  kind: TaskKind;
  job_id: number | null;
  epic_id: number | null;
  subject_id: number | null;
  revisions: number;
  review_feedback: string | null;
  files: string | null;
  verdict: string | null;
  session_id: string | null;
  worktree: string | null;
  branch: string | null;
  attempts: number;
  result: string | null;
  error: string | null;
  changed_files: string | null;
  turns: number;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  est_cost_usd: number;
  resume_at: number | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface TaskEvent {
  id: number;
  task_id: number;
  ts: number;
  kind: string;
  summary: string;
}

export interface Member {
  name: string;
  role: string;
  title: string;
  model: string;
  effort: string;
  strengths: string[];
  isLead: boolean;
}

export interface TeamLimits {
  max_active_per_member: number;
  max_queue_per_member: number;
  max_revisions: number;
  max_subtasks: number;
}

export interface TeamSummary {
  id: string;
  name: string;
  lead: string | null;
  limits?: TeamLimits;
  members: Member[];
}

export interface RateLimitWindow {
  utilization: number | null;
  resetsAt: number | null;
}

export interface RateLimit {
  status: string;
  blocked: boolean;
  type: string | null;
  resetsAt: number | null;
  windows: Record<string, RateLimitWindow>;
  seenAt: number;
}

export interface CompanyState {
  maxConcurrent: number;
  running: number[];
  queued: number;
  pausedUntil: number;
  pauseReason: string | null;
  manualPause: boolean;
  rateLimit: RateLimit | null;
}

export interface AppState {
  project: { name: string; root: string; hasProfile: boolean; stack: string[] };
  teams: TeamSummary[];
  company: CompanyState;
  configError: string | null;
}

// ---- Mẫu việc và việc định kỳ (giai đoạn 6) ----

export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  multiline: boolean;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  kind: 'epic' | 'job';
  team: string | null;
  fields: TemplateField[];
  source: 'builtin' | 'local';
}

export interface FilledTemplate {
  kind: 'epic' | 'job';
  team: string | null;
  title: string;
  prompt: string;
  acceptance: string;
}

export interface ScheduleRun {
  kind: 'epic' | 'job';
  id: number;
}

export interface Schedule {
  id: number;
  name: string;
  template: string;
  params: Record<string, string>;
  days: number[];
  at_time: string;
  enabled: boolean;
  max_per_day: number;
  runs_today: number;
  last_run_at: number | null;
  last_ref: ScheduleRun | null;
  last_error: string | null;
  open_run: (ScheduleRun & { status: string }) | null;
  next_run_at: number | null;
}

// ---- Báo cáo tuần ----

export interface ReportBucket {
  finished: number;
  work_done: number;
  work_failed: number;
  work_stopped: number;
  revisions: number;
  turns: number;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  est_cost_usd: number;
}

export interface WeeklyReport {
  week: string;
  next_week: string;
  current_week: string;
  from: number;
  to: number;
  total: ReportBucket;
  previous: ReportBucket & { week: string };
  teams: (ReportBucket & { id: string; name: string })[];
  members: (ReportBucket & { team: string; member: string; lead_runs: number; answers: number })[];
  jobs: { finished: number; by_status: Record<string, number> };
  epics: { finished: number; by_status: Record<string, number>; rework_rounds: number };
  quota: {
    samples: number;
    peak_five_hour: number | null;
    peak_seven_day: number | null;
    last_five_hour: number | null;
    last_seven_day: number | null;
    blocked_events: number;
  };
}
