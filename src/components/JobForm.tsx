'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Job, TeamSummary } from '@/lib/types';
import TemplatePicker from './TemplatePicker';

interface Props {
  teams: TeamSummary[];
  disabled: boolean;
  onCreated: (job: Job) => void;
}

export default function JobForm({ teams, disabled, onCreated }: Props) {
  const withLead = teams.filter((t) => t.lead && t.members.some((m) => !m.isLead));
  const [team, setTeam] = useState('');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [contest, setContest] = useState(false);
  const [setA, setSetA] = useState('impeccable, ui-ux-pro-max');
  const [setB, setSetB] = useState('design-taste-frontend, ui-ux-pro-max');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = team || withLead[0]?.id || '';
  const current = withLead.find((t) => t.id === chosen);
  const workers = current?.members.filter((m) => !m.isLead) ?? [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const names = (text: string) => text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      const { job } = await api<{ job: Job }>('/api/jobs', {
        method: 'POST',
        body: { team: chosen, title, prompt, acceptance, ...(contest ? { contest: { a: names(setA), b: names(setB) } } : {}) },
      });
      setTitle('');
      setPrompt('');
      setAcceptance('');
      onCreated(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không giao được việc lớn.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Giao việc lớn cho cả team</h2>
      <p className="muted">
        Trưởng nhóm sẽ đọc code, chia thành các việc con cho từng nhân viên, duyệt bài họ nộp (trả lại nếu chưa đạt) rồi gộp các nhánh đã duyệt.
      </p>
      <TemplatePicker
        kind="job"
        onFill={(f) => {
          if (f.team && withLead.some((t) => t.id === f.team)) setTeam(f.team);
          setTitle(f.title);
          setPrompt(f.prompt);
          setAcceptance(f.acceptance);
        }}
      />
      <label>
        Team
        <select value={chosen} onChange={(e) => setTeam(e.target.value)} disabled={withLead.length === 0}>
          {withLead.map((t) => (
            <option key={t.id} value={t.id}>{t.name} (Trưởng nhóm: {t.lead})</option>
          ))}
        </select>
      </label>
      {current && (
        <p className="muted">
          Nhân viên: {workers.map((m) => `${m.name} (${m.strengths.join(', ') || 'chung'})`).join('; ')}. Mỗi người tối đa {current.limits?.max_active_per_member ?? 1} việc đang làm
          và {current.limits?.max_queue_per_member ?? 2} việc chờ.
        </p>
      )}
      <label>
        Tiêu đề
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ví dụ: Thêm API quản lý đơn hàng" required />
      </label>
      <label>
        Mô tả việc lớn
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} placeholder="Mục tiêu, yêu cầu, ràng buộc. Trưởng nhóm sẽ tự đọc code để chia việc." required />
      </label>
      <label>
        Tiêu chí hoàn thành của cả việc <span className="muted">(không bắt buộc)</span>
        <textarea value={acceptance} onChange={(e) => setAcceptance(e.target.value)} rows={3} />
      </label>
      <label className="check">
        <input type="checkbox" checked={contest} onChange={(e) => setContest(e.target.checked)} disabled={workers.length < 2} />
        {' '}Thi đấu skill: hai người cùng làm một việc, mỗi người một bộ skill, bạn xem rồi chọn bản tốt hơn
      </label>
      {contest && (
        <>
          <p className="muted">
            Trưởng nhóm chọn hai người và giao cùng một đề bài; hệ thống gán ngẫu nhiên bộ skill và ẩn danh khi bạn xem. Tốn khoảng 2 lượt làm việc (một lượt mỗi người) trong hạn mức Pro.
            Ảnh chụp cần mục <code>preview</code> trong <code>local/project.md</code>; không có thì vẫn thi được nhưng không có ảnh.
          </p>
          <label>
            Bộ skill A <span className="muted">(cách nhau bằng dấu phẩy)</span>
            <input value={setA} onChange={(e) => setSetA(e.target.value)} required />
          </label>
          <label>
            Bộ skill B
            <input value={setB} onChange={(e) => setSetB(e.target.value)} required />
          </label>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || disabled || withLead.length === 0}>{busy ? 'Đang giao...' : 'Giao cho Trưởng nhóm'}</button>
    </form>
  );
}
