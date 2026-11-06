'use client';

import { useEffect, useRef } from 'react';
import {
  formatClock, formatCountdown, formatDuration, formatTokens, KIND_LABEL, LEVEL_LABEL, STATUS_LABEL, TASK_KIND_LABEL,
} from '@/lib/format';
import type { Task, TaskEvent } from '@/lib/types';

interface Props {
  task: Task | null;
  events: TaskEvent[];
  now: number;
  onStop: (id: number) => void;
}

function parseFiles(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function TaskDetail({ task, events, now, onStop }: Props) {
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length, task?.id]);

  if (!task) {
    return (
      <div className="card empty">
        <p>Chọn một việc ở danh sách để xem chi tiết, hoặc giao việc mới.</p>
      </div>
    );
  }

  const active = task.status === 'running' || task.status === 'queued' || task.status === 'paused_quota' || task.status === 'waiting_answer';
  const files = parseFiles(task.changed_files);
  const allTokens = task.input_tokens + task.output_tokens + task.cache_read_tokens + task.cache_creation_tokens;

  return (
    <div className="card detail">
      <div className="detail-head">
        <div>
          <h2>#{task.id} {task.title}</h2>
          <p className="muted">
            {task.kind !== 'work' ? `${TASK_KIND_LABEL[task.kind]} · ` : ''}
            {task.member} · {task.role} · {task.model ?? '?'}{task.effort ? ` (${task.effort})` : ''}
            {task.job_id ? ` · thuộc việc lớn #${task.job_id}` : ''}
          </p>
        </div>
        <span className={`chip status-${task.status}`}>{STATUS_LABEL[task.status]}</span>
      </div>

      {task.status === 'paused_quota' && task.resume_at && now > 0 && (
        <p className="notice">Hết hạn mức Pro. Làm tiếp sau {formatCountdown(task.resume_at, now)}.</p>
      )}
      <p className="muted">
        Độ khó: <strong>{LEVEL_LABEL[task.level] ?? task.level}</strong>
        {task.level_source === 'auto' ? ' (hệ thống tự đánh giá)' : ' (bạn chọn)'}
        {task.level_reason ? `. ${task.level_reason}` : ''}
        {task.escalations > 0 ? ` Đã được nâng model ${task.escalations} lần vì việc chưa xong.` : ''}
      </p>
      {task.error && task.status !== 'stopped' && <p className="error">{task.error}</p>}

      <dl className="meta">
        <div><dt>Nhánh</dt><dd>{task.branch ?? '—'}</dd></div>
        <div><dt>Lượt</dt><dd>{task.turns}</dd></div>
        <div><dt>Lần chạy</dt><dd>{task.attempts}</dd></div>
        {task.kind === 'work' && task.job_id !== null && <div><dt>Bị trả lại</dt><dd>{task.revisions} lần</dd></div>}
        <div><dt>Thời gian</dt><dd>{task.duration_ms ? formatDuration(task.duration_ms) : '—'}</dd></div>
        <div><dt>Token (tổng)</dt><dd>{formatTokens(allTokens)}</dd></div>
        <div><dt>Token ra</dt><dd>{formatTokens(task.output_tokens)}</dd></div>
        <div><dt>Ước tính giá API</dt><dd title="Chỉ để so sánh mức dùng. Bạn dùng gói Pro nên không bị tính khoản này.">${task.est_cost_usd.toFixed(3)}</dd></div>
      </dl>

      {active && (
        <button type="button" className="danger" onClick={() => onStop(task.id)}>Dừng việc này</button>
      )}

      {task.result && (
        <section>
          <h3>Kết quả</h3>
          <pre className="result">{task.result}</pre>
        </section>
      )}
      {files.length > 0 && (
        <section>
          <h3>File thay đổi ({files.length})</h3>
          <ul className="files">{files.map((f) => <li key={f}>{f}</li>)}</ul>
          <p className="muted">Nằm trên nhánh {task.branch}, chưa push. Xem bằng <code>git diff {task.branch}</code>.</p>
        </section>
      )}

      <section>
        <h3>Nhật ký</h3>
        <ol className="log" ref={logRef}>
          {events.length === 0 && <li className="muted">Chưa có sự kiện.</li>}
          {events.map((e) => (
            <li key={e.id} className={`kind-${e.kind}`}>
              <time>{formatClock(e.ts)}</time>
              <span className="kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
              <span className="text">{e.summary}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
