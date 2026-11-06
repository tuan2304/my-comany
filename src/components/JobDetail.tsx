'use client';

import { JOB_STATUS_LABEL, STATUS_LABEL, TASK_KIND_LABEL } from '@/lib/format';
import type { Job, Task } from '@/lib/types';

interface Props {
  job: Job;
  tasks: Task[];
  selectedTaskId: number | null;
  onSelectTask: (id: number) => void;
  onStop: (id: number) => void;
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function TaskRow({ task, selected, onSelect }: { task: Task; selected: boolean; onSelect: (id: number) => void }) {
  const files = parseList(task.files);
  return (
    <li>
      <button type="button" className={`row ${selected ? 'selected' : ''}`} onClick={() => onSelect(task.id)}>
        <span className="row-title">#{task.id} {task.title}</span>
        <span className="row-sub">
          {task.member}
          {task.kind === 'work' && files.length > 0 ? ` · ${files.join(', ')}` : ''}
          {task.revisions > 0 ? ` · bị trả ${task.revisions} lần` : ''}
          {task.model ? ` · ${task.model}` : ''}
        </span>
        <span className={`chip status-${task.status}`}>{STATUS_LABEL[task.status]}</span>
      </button>
    </li>
  );
}

export default function JobDetail({ job, tasks, selectedTaskId, onSelectTask, onStop }: Props) {
  const plan = tasks.filter((t) => t.kind === 'plan');
  const work = tasks.filter((t) => t.kind === 'work');
  const reviews = tasks.filter((t) => t.kind === 'review');
  const active = !['done', 'attention', 'failed', 'stopped'].includes(job.status);
  const conflicts = parseList(job.conflict_files);

  return (
    <div className="card detail">
      <div className="detail-head">
        <div>
          <h2>Việc lớn #{job.id}: {job.title}</h2>
          <p className="muted">Trưởng nhóm: {job.lead} · team {job.team}</p>
        </div>
        <span className={`chip job-${job.status}`}>{JOB_STATUS_LABEL[job.status]}</span>
      </div>

      {job.error && <p className={job.status === 'attention' ? 'notice' : 'error'}>{job.error}</p>}
      {conflicts.length > 0 && (
        <p className="notice">File xung đột khi gộp: {conflicts.join(', ')}. Hãy mở các nhánh trong dự án và gộp tay, hoặc giao lại việc.</p>
      )}
      {job.merge_branch && (
        <p>
          Đã gộp các việc đã duyệt vào nhánh <code>{job.merge_branch}</code> (chưa push). Xem bằng <code>git diff {job.base_commit?.slice(0, 8) ?? 'main'} {job.merge_branch}</code>.
        </p>
      )}
      {active && <button type="button" className="danger" onClick={() => onStop(job.id)}>Dừng cả việc lớn</button>}

      <section>
        <h3>Việc con ({work.length})</h3>
        {work.length === 0 && <p className="muted">Trưởng nhóm chưa giao việc con nào.</p>}
        <ul className="list-plain">{work.map((t) => <TaskRow key={t.id} task={t} selected={t.id === selectedTaskId} onSelect={onSelectTask} />)}</ul>
      </section>

      <section>
        <h3>Lượt của Trưởng nhóm ({plan.length + reviews.length})</h3>
        <ul className="list-plain">
          {[...plan, ...reviews].map((t) => (
            <li key={t.id}>
              <button type="button" className={`row ${t.id === selectedTaskId ? 'selected' : ''}`} onClick={() => onSelectTask(t.id)}>
                <span className="row-title">#{t.id} {TASK_KIND_LABEL[t.kind]}{t.kind === 'review' && t.subject_id ? ` việc #${t.subject_id}` : ''}</span>
                <span className="row-sub">
                  {t.member} · {t.model}
                  {t.verdict ? ` · ${t.verdict === 'approve' ? 'đã duyệt' : t.verdict === 'reject' ? 'trả lại' : 'trả lần cuối'}` : ''}
                </span>
                <span className={`chip status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {job.summary && (
        <section>
          <h3>Báo cáo</h3>
          <pre className="result">{job.summary}</pre>
        </section>
      )}
    </div>
  );
}
