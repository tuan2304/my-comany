'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { TeamSummary, Task } from '@/lib/types';

interface Props {
  teams: TeamSummary[];
  disabled: boolean;
  onCreated: (task: Task) => void;
}

type Level = 'auto' | 'easy' | 'normal' | 'hard';

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'auto', label: 'Tự động (khuyên dùng): hệ thống tự đánh giá độ khó' },
  { value: 'easy', label: 'Ép mức Đơn giản: model thấp (haiku), nhanh, đỡ tốn hạn mức' },
  { value: 'normal', label: 'Ép mức Bình thường: theo model của vai trò' },
  { value: 'hard', label: 'Ép mức Khó: model cao (opus), tốn hạn mức hơn' },
];

export default function TaskForm({ teams, disabled, onCreated }: Props) {
  // Trưởng nhóm không nhận việc lẻ (không tự viết code): chỉ nhận việc lớn của cả team.
  const members = teams.flatMap((team) => team.members.filter((m) => !m.isLead).map((m) => ({ ...m, team: team.name })));
  const [member, setMember] = useState('');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [level, setLevel] = useState<Level>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = member || members[0]?.name || '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { task } = await api<{ task: Task }>('/api/tasks', {
        method: 'POST',
        body: { member: chosen, title, prompt, acceptance, level },
      });
      setTitle('');
      setPrompt('');
      setAcceptance('');
      onCreated(task);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không giao được việc.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Giao việc lẻ cho một nhân viên</h2>
      <label>
        Nhân viên
        <select value={chosen} onChange={(e) => setMember(e.target.value)} disabled={members.length === 0}>
          {members.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} · {m.title} · {m.team} ({m.model})
            </option>
          ))}
        </select>
      </label>
      <label>
        Độ khó <span className="muted">(để Tự động thì hệ thống chọn model cho bạn)</span>
        <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
          {LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label>
        Tiêu đề
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ví dụ: Thêm hàm tính tổng đơn hàng" required />
      </label>
      <label>
        Mô tả việc
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="Việc cần làm, ở file nào, ràng buộc gì..." required />
      </label>
      <label>
        Tiêu chí hoàn thành <span className="muted">(không bắt buộc)</span>
        <textarea value={acceptance} onChange={(e) => setAcceptance(e.target.value)} rows={3} placeholder="Ví dụ: test chạy qua, lint sạch" />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || disabled || members.length === 0}>
        {busy ? 'Đang giao...' : 'Giao việc'}
      </button>
      {disabled && <p className="muted">Hồ sơ dự án hoặc cấu hình team đang lỗi, xem thông báo phía trên.</p>}
    </form>
  );
}
