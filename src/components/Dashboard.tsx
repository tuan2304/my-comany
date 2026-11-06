'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, reloadForLogin } from '@/lib/api';
import { EPIC_STATUS_LABEL, JOB_STATUS_LABEL, STATUS_LABEL } from '@/lib/format';
import { chime, newKeys, notifyMessage, readNotifyMode, readSoundPreference, titleFor, writeNotifyMode, writeSoundPreference, type NotifyMode } from '@/lib/notify';
import { disableNotifications, enableNotifications, notificationsSupported, resyncPush, showLocalNotification } from '@/lib/push';
import { ownerRequests } from '@/office/status';
import type { AppState, CompanyState, Epic, Job, Task, TaskEvent } from '@/lib/types';
import Board from './Board';
import EpicDetail from './EpicDetail';
import EpicForm from './EpicForm';
import FeedPanel from './FeedPanel';
import JobDetail from './JobDetail';
import JobForm from './JobForm';
import QuotaPanel from './QuotaPanel';
import Report from './Report';
import Schedules from './Schedules';
import TaskDetail from './TaskDetail';
import TaskForm from './TaskForm';
import TeamLoadPanel from './TeamLoadPanel';

// Cảnh 3D chỉ chạy ở trình duyệt và khá nặng (three.js) nên chỉ tải khi bạn mở tab này.
const Office3D = dynamic(() => import('./Office3D'), {
  ssr: false,
  loading: () => <p className="muted">Đang tải văn phòng 3D...</p>,
});

const MAX_EVENTS_PER_TASK = 600;

function upsertById<T extends { id: number }>(list: T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index < 0) return [item, ...list].sort((a, b) => b.id - a.id);
  const next = list.slice();
  next[index] = item;
  return next;
}

function mergeEvents(a: TaskEvent[], b: TaskEvent[]): TaskEvent[] {
  const byId = new Map<number, TaskEvent>();
  for (const e of [...a, ...b]) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) => x.id - y.id).slice(-MAX_EVENTS_PER_TASK);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Có lỗi xảy ra.';
}

type Mode = 'epic' | 'job' | 'task';
type View = 'work' | 'office' | 'board' | 'load' | 'feed' | 'schedules' | 'report';
type EpicAction = 'approve-plan' | 'reject-plan' | 'approve-result' | 'reject-result' | 'stop';

const VIEWS: { id: View; label: string }[] = [
  { id: 'work', label: 'Công việc' },
  { id: 'office', label: 'Văn phòng' },
  { id: 'board', label: 'Bảng kanban' },
  { id: 'load', label: 'Tải của team' },
  { id: 'feed', label: 'Nhật ký hội thoại' },
  { id: 'schedules', label: 'Mẫu & lịch' },
  { id: 'report', label: 'Báo cáo' },
];

export default function Dashboard() {
  const [app, setApp] = useState<AppState | null>(null);
  const [company, setCompany] = useState<CompanyState | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [view, setView] = useState<View>('work');
  const [mode, setMode] = useState<Mode>('epic');
  const [selectedEpicId, setSelectedEpicId] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [eventsByTask, setEventsByTask] = useState<Record<number, TaskEvent[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(0);
  const [sound, setSound] = useState(true);
  const [remote, setRemote] = useState(false);
  const [notifyMode, setNotifyMode] = useState<NotifyMode>('off');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyNote, setNotifyNote] = useState<string | null>(null);
  const seenRequests = useRef<Set<string> | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSound(readSoundPreference()), 0);
    return () => clearTimeout(timer);
  }, []);

  // Thông báo: nhớ lựa chọn của thiết bị này. Chế độ đẩy thì đăng ký lại với máy chủ (phiên đăng nhập có thể đã đổi); quyền bị thu hồi thì về chế độ tắt.
  useEffect(() => {
    const timer = setTimeout(() => {
      const mode = readNotifyMode();
      const off = () => {
        writeNotifyMode('off');
        setNotifyMode('off');
      };
      if (mode === 'off') return;
      if (!notificationsSupported() || Notification.permission !== 'granted') return off();
      setNotifyMode(mode);
      if (mode === 'push') void resyncPush().then((ok) => { if (!ok) off(); });
      return undefined;
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const toggleNotify = useCallback(async () => {
    setNotifyBusy(true);
    setNotifyNote(null);
    try {
      if (notifyMode === 'off') {
        const result = await enableNotifications();
        writeNotifyMode(result.mode);
        setNotifyMode(result.mode);
        setNotifyNote(result.note);
      } else {
        await disableNotifications();
        writeNotifyMode('off');
        setNotifyMode('off');
      }
    } catch (err) {
      setNotifyNote(errorText(err));
    } finally {
      setNotifyBusy(false);
    }
  }, [notifyMode]);

  const testNotify = useCallback(async () => {
    setNotifyBusy(true);
    setNotifyNote(null);
    try {
      const result = await api<{ sent: number; removed: number; failed: number }>('/api/push/test', { method: 'POST' });
      setNotifyNote(result.sent > 0 ? `Đã gửi thử tới ${result.sent} thiết bị.` : 'Không gửi được tới thiết bị nào. Tắt rồi bật lại thông báo để đăng ký lại.');
    } catch (err) {
      setNotifyNote(errorText(err));
    } finally {
      setNotifyBusy(false);
    }
  }, []);

  // Đang vào qua cổng từ xa (có PIN)? Khi đó hiện nút Đăng xuất.
  useEffect(() => {
    let alive = true;
    api<{ remote: boolean }>('/api/me').then((me) => alive && setRemote(me.remote)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } finally {
      window.location.reload();
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [state, list, jobList, epicList] = await Promise.all([
        api<AppState>('/api/state'),
        api<{ tasks: Task[] }>('/api/tasks'),
        api<{ jobs: Job[] }>('/api/jobs'),
        api<{ epics: Epic[] }>('/api/epics'),
      ]);
      setApp(state);
      setCompany(state.company);
      setTasks(list.tasks);
      setJobs(jobList.jobs);
      setEpics(epicList.epics);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const source = new EventSource('/api/stream');
    let wasDown = false;
    source.onopen = () => {
      setConnected(true);
      if (wasDown) void refresh();
      wasDown = false;
    };
    source.onerror = () => {
      wasDown = true;
      setConnected(false);
      // EventSource không cho biết mã lỗi: hỏi thử /api/me, nếu phiên đã hết hạn thì về trang đăng nhập.
      fetch('/api/me', { cache: 'no-store' }).then((res) => { if (res.status === 401) reloadForLogin(); }).catch(() => {});
    };
    const parse = <T,>(e: Event) => JSON.parse((e as MessageEvent<string>).data) as T;
    source.addEventListener('state', (e) => setCompany(parse<CompanyState>(e)));
    source.addEventListener('task', (e) => {
      const task = parse<Task>(e);
      setTasks((prev) => upsertById(prev, task));
    });
    source.addEventListener('job', (e) => {
      const job = parse<Job>(e);
      setJobs((prev) => upsertById(prev, job));
    });
    source.addEventListener('epic', (e) => {
      const epic = parse<Epic>(e);
      setEpics((prev) => upsertById(prev, epic));
    });
    source.addEventListener('event', (e) => {
      const event = parse<TaskEvent>(e);
      setEventsByTask((prev) => ({ ...prev, [event.task_id]: mergeEvents(prev[event.task_id] ?? [], [event]) }));
    });
    return () => source.close();
  }, [refresh]);

  const selectTask = useCallback(async (id: number) => {
    setSelectedTaskId(id);
    try {
      const data = await api<{ task: Task; events: TaskEvent[] }>(`/api/tasks/${id}`);
      setEventsByTask((prev) => ({ ...prev, [id]: mergeEvents(data.events, prev[id] ?? []) }));
      setTasks((prev) => upsertById(prev, data.task));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const selectJob = useCallback(async (id: number, keepEpic = false) => {
    setSelectedJobId(id);
    setSelectedTaskId(null);
    if (!keepEpic) setSelectedEpicId(null);
    try {
      const data = await api<{ job: Job; tasks: Task[] }>(`/api/jobs/${id}`);
      setJobs((prev) => upsertById(prev, data.job));
      setTasks((prev) => data.tasks.reduce((list, t) => upsertById(list, t), prev));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const selectEpic = useCallback(async (id: number) => {
    setSelectedEpicId(id);
    setSelectedJobId(null);
    setSelectedTaskId(null);
    try {
      const data = await api<{ epic: Epic; jobs: Job[]; tasks: Task[] }>(`/api/epics/${id}`);
      setEpics((prev) => upsertById(prev, data.epic));
      setJobs((prev) => data.jobs.reduce((list, j) => upsertById(list, j), prev));
      setTasks((prev) => data.tasks.reduce((list, t) => upsertById(list, t), prev));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const selectLooseTask = useCallback(
    (id: number) => {
      setSelectedEpicId(null);
      setSelectedJobId(null);
      void selectTask(id);
    },
    [selectTask],
  );

  const openTaskFromAnywhere = useCallback(
    (id: number) => {
      setView('work');
      const task = tasks.find((t) => t.id === id);
      if (task?.job_id) {
        const job = jobs.find((j) => j.id === task.job_id);
        setSelectedEpicId(job?.epic_id ?? null);
        setSelectedJobId(task.job_id);
      } else if (task?.epic_id) {
        setSelectedEpicId(task.epic_id);
        setSelectedJobId(null);
      } else {
        setSelectedEpicId(null);
        setSelectedJobId(null);
      }
      void selectTask(id);
    },
    [tasks, jobs, selectTask],
  );

  const act = useCallback(async (path: string, body?: unknown) => {
    try {
      await api(path, { method: 'POST', body });
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const actEpic = useCallback(
    (id: number, action: EpicAction, feedback?: string) => void act(`/api/epics/${id}/${action}`, { feedback }),
    [act],
  );

  const selectedEpic = useMemo(() => epics.find((e) => e.id === selectedEpicId) ?? null, [epics, selectedEpicId]);
  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId) ?? null, [jobs, selectedJobId]);
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const epicJobs = useMemo(() => jobs.filter((j) => j.epic_id === selectedEpicId).sort((a, b) => a.id - b.id), [jobs, selectedEpicId]);
  const directorTasks = useMemo(() => tasks.filter((t) => t.epic_id === selectedEpicId).sort((a, b) => a.id - b.id), [tasks, selectedEpicId]);
  const jobTasks = useMemo(() => tasks.filter((t) => t.job_id === selectedJobId).sort((a, b) => a.id - b.id), [tasks, selectedJobId]);
  const looseJobs = useMemo(() => jobs.filter((j) => j.epic_id === null), [jobs]);
  const looseTasks = useMemo(() => tasks.filter((t) => t.job_id === null && t.epic_id === null), [tasks]);
  const signature = useMemo(
    () => [...tasks.map((t) => `${t.id}:${t.status}`), ...jobs.map((j) => `j${j.id}:${j.status}`), ...epics.map((e) => `e${e.id}:${e.status}`)].join(','),
    [tasks, jobs, epics],
  );
  // Dòng nhật ký công cụ gần nhất của từng việc đang chạy: văn phòng 3D dựa vào đây để biết ai đang đọc code, ai đang chạy lệnh.
  const lastTool = useMemo(() => {
    const out: Record<number, string> = {};
    for (const t of tasks) {
      if (t.status !== 'running') continue;
      const events = eventsByTask[t.id];
      if (!events) continue;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        if (events[i].kind === 'tool') {
          out[t.id] = events[i].summary;
          break;
        }
      }
    }
    return out;
  }, [tasks, eventsByTask]);
  const requests = useMemo(() => ownerRequests(epics, jobs), [epics, jobs]);
  const activeCount = company ? company.running.length : 0;
  const blocked = Boolean(app?.configError) || app?.teams.length === 0;
  const workTeams = app?.teams.filter((t) => t.lead && t.members.some((m) => !m.isLead)) ?? [];

  // Thông báo khi có việc chờ chính bạn: số trên tiêu đề tab, và một tiếng chuông cho việc MỚI (không rung chuông cho thứ đã chờ sẵn lúc mở trang).
  const requestKeys = useMemo(() => requests.map((r) => `${r.kind}:${r.id}:${r.status}`), [requests]);
  useEffect(() => {
    document.title = titleFor('My Company', requestKeys.length);
    return () => {
      document.title = titleFor('My Company', 0);
    };
  }, [requestKeys.length]);
  useEffect(() => {
    if (!app) return;
    const seen = seenRequests.current;
    seenRequests.current = new Set(requestKeys);
    const fresh = seen ? newKeys(seen, requestKeys) : [];
    if (sound && fresh.length > 0) chime();
    // Chế độ "chỉ khi mở trang": báo bằng thông báo của trình duyệt khi bạn đang ở tab khác. Chế độ đẩy do máy chủ lo.
    if (notifyMode === 'local' && document.hidden) {
      for (const request of requests) {
        if (fresh.includes(`${request.kind}:${request.id}:${request.status}`)) void showLocalNotification(notifyMessage(request));
      }
    }
  }, [app, requestKeys, requests, sound, notifyMode]);

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>My Company</h1>
          <p className="muted">{app ? `Dự án: ${app.project.name}${app.project.stack.length ? ` · ${app.project.stack.join(', ')}` : ''}` : 'Đang tải...'}</p>
        </div>
        <div className="actions">
          <span className={`chip ${connected ? 'status-done' : 'status-failed'}`}>{connected ? 'Đã kết nối' : 'Mất kết nối'}</span>
          {company && (
            <span className="chip">{activeCount}/{company.maxConcurrent} đang làm · {company.queued} chờ</span>
          )}
          {company && (
            <button type="button" className="secondary" onClick={() => void act('/api/pause', { paused: !company.manualPause })}>
              {company.manualPause ? 'Tiếp tục nhận việc' : 'Nhường chỗ (tạm dừng nhận việc mới)'}
            </button>
          )}
          <button
            type="button"
            className="secondary"
            aria-pressed={sound}
            title="Bật hoặc tắt tiếng chuông khi có việc chờ bạn quyết"
            onClick={() => { const next = !sound; setSound(next); writeSoundPreference(next); if (next) chime(); }}
          >
            {sound ? 'Chuông: bật' : 'Chuông: tắt'}
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={notifyMode !== 'off'}
            disabled={notifyBusy}
            title="Nhận thông báo khi có việc chờ bạn quyết, kể cả lúc đã đóng trang (cần cho phép trong trình duyệt)"
            onClick={() => void toggleNotify()}
          >
            {notifyMode === 'push' ? 'Thông báo: bật' : notifyMode === 'local' ? 'Thông báo: bật (khi mở trang)' : 'Thông báo: tắt'}
          </button>
          {notifyMode === 'push' && <button type="button" className="secondary" disabled={notifyBusy} onClick={() => void testNotify()}>Gửi thử</button>}
          <button type="button" className="danger" onClick={() => void act('/api/stop-all')}>Dừng tất cả</button>
          {remote && <button type="button" className="secondary" onClick={() => void logout()}>Đăng xuất</button>}
        </div>
      </header>

      {error && <p className="banner error" role="alert">{error}</p>}
      {notifyNote && <p className="banner notice" role="status">{notifyNote}</p>}
      {app?.configError && <p className="banner error">Cấu hình lỗi: {app.configError}</p>}
      {app && !app.project.hasProfile && (
        <p className="banner notice">
          Chưa có hồ sơ dự án. Chạy <code>npm run init</code> để tạo bản nháp tại <code>local/project.md</code>, sửa lại, rồi giao việc. Không có hồ sơ thì nhân viên không chạy được lệnh nào (kể cả test).
        </p>
      )}
      {company?.manualPause && <p className="banner notice">Đang tạm dừng nhận việc mới. Các việc đang làm vẫn chạy tiếp.</p>}
      {requests.length > 0 && (
        <section className="needs" aria-label="Cần bạn quyết">
          <h2>Cần bạn quyết ({requests.length})</h2>
          <ul>
            {requests.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <button
                  type="button"
                  className="need"
                  onClick={() => {
                    setView('work');
                    if (r.kind === 'epic') void selectEpic(r.id);
                    else void selectJob(r.id);
                  }}
                >
                  <span className="need-title">{r.kind === 'epic' ? 'Yêu cầu' : 'Việc lớn'} #{r.id} “{r.title}”</span>
                  <span className="need-sub">{r.kind === 'epic' ? EPIC_STATUS_LABEL[r.status as Epic['status']] : JOB_STATUS_LABEL[r.status as Job['status']]} · {r.who}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {company && <QuotaPanel company={company} now={now} />}

      <div className="tabs" role="tablist" aria-label="Chế độ xem">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'tab active' : 'tab'} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>

      {view === 'office' && app && (
        <Office3D
          teams={app.teams}
          tasks={tasks}
          jobs={jobs}
          epics={epics}
          lastTool={lastTool}
          pausedUntil={company?.pausedUntil ?? 0}
          now={now}
          onOpenTask={openTaskFromAnywhere}
        />
      )}
      {view === 'board' && app && <Board tasks={tasks} teams={app.teams} onSelect={(t) => openTaskFromAnywhere(t.id)} />}
      {view === 'load' && <TeamLoadPanel signature={signature} />}
      {view === 'feed' && <FeedPanel signature={signature} onSelectTask={openTaskFromAnywhere} />}
      {view === 'report' && <Report signature={signature} />}
      {view === 'schedules' && (
        <Schedules
          signature={signature}
          onOpenRun={(kind, id) => {
            setView('work');
            if (kind === 'epic') void selectEpic(id);
            else void selectJob(id);
          }}
        />
      )}

      {view === 'work' && (
        <div className="grid">
          <section className="col">
            <div className="tabs" role="tablist" aria-label="Loại việc cần giao">
              <button type="button" role="tab" aria-selected={mode === 'epic'} className={mode === 'epic' ? 'tab active' : 'tab'} onClick={() => setMode('epic')}>Yêu cầu cho công ty</button>
              <button type="button" role="tab" aria-selected={mode === 'job'} className={mode === 'job' ? 'tab active' : 'tab'} onClick={() => setMode('job')}>Việc lớn cho 1 team</button>
              <button type="button" role="tab" aria-selected={mode === 'task'} className={mode === 'task' ? 'tab active' : 'tab'} onClick={() => setMode('task')}>Việc lẻ</button>
            </div>
            {mode === 'epic' && <EpicForm disabled={blocked} onCreated={(epic) => { setEpics((prev) => upsertById(prev, epic)); void selectEpic(epic.id); }} />}
            {app && mode === 'job' && (
              <JobForm teams={workTeams} disabled={blocked} onCreated={(job) => { setJobs((prev) => upsertById(prev, job)); void selectJob(job.id); }} />
            )}
            {app && mode === 'task' && (
              <TaskForm teams={app.teams} disabled={blocked} onCreated={(t) => { setTasks((prev) => upsertById(prev, t)); selectLooseTask(t.id); }} />
            )}

            <div className="card list">
              <h2>Yêu cầu ({epics.length})</h2>
              {epics.length === 0 && <p className="muted">Chưa có yêu cầu nào.</p>}
              <ul>
                {epics.map((e) => (
                  <li key={e.id}>
                    <button type="button" className={`row ${e.id === selectedEpicId ? 'selected' : ''}`} onClick={() => void selectEpic(e.id)}>
                      <span className="row-title">#{e.id} {e.title}</span>
                      <span className="row-sub">Giám đốc {e.director}</span>
                      <span className={`chip epic-${e.status}`}>{EPIC_STATUS_LABEL[e.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card list">
              <h2>Việc lớn của một team ({looseJobs.length})</h2>
              {looseJobs.length === 0 && <p className="muted">Chưa có việc lớn nào.</p>}
              <ul>
                {looseJobs.map((j) => (
                  <li key={j.id}>
                    <button type="button" className={`row ${j.id === selectedJobId && selectedEpicId === null ? 'selected' : ''}`} onClick={() => void selectJob(j.id)}>
                      <span className="row-title">#{j.id} {j.title}</span>
                      <span className="row-sub">Trưởng nhóm {j.lead}</span>
                      <span className={`chip job-${j.status}`}>{JOB_STATUS_LABEL[j.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card list">
              <h2>Việc lẻ ({looseTasks.length})</h2>
              {looseTasks.length === 0 && <p className="muted">Chưa có việc lẻ nào.</p>}
              <ul>
                {looseTasks.map((t) => (
                  <li key={t.id}>
                    <button type="button" className={`row ${t.id === selectedTaskId && selectedJobId === null && selectedEpicId === null ? 'selected' : ''}`} onClick={() => selectLooseTask(t.id)}>
                      <span className="row-title">#{t.id} {t.title}</span>
                      <span className="row-sub">{t.member}</span>
                      <span className={`chip status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="col">
            {selectedEpic && (
              <EpicDetail
                epic={selectedEpic}
                jobs={epicJobs}
                directorTasks={directorTasks}
                selectedJobId={selectedJobId}
                selectedTaskId={selectedTaskId}
                onSelectJob={(id) => void selectJob(id, true)}
                onSelectTask={(id) => { setSelectedJobId(null); void selectTask(id); }}
                onAct={(action, feedback) => actEpic(selectedEpic.id, action, feedback)}
              />
            )}
            {selectedJob && (
              <JobDetail
                job={selectedJob}
                tasks={jobTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={(id) => void selectTask(id)}
                onStop={(id) => void act(`/api/jobs/${id}/stop`)}
              />
            )}
            {(selectedTask || (!selectedJob && !selectedEpic)) && (
              <TaskDetail
                task={selectedTask}
                events={selectedTask ? eventsByTask[selectedTask.id] ?? [] : []}
                now={now}
                onStop={(id) => void act(`/api/tasks/${id}/stop`)}
              />
            )}
          </section>
        </div>
      )}
    </main>
  );
}
