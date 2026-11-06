'use client';

import { useMemo, useState } from 'react';
import type { Task, TeamSummary } from '@/lib/types';

interface Props {
  tasks: Task[];
  teams: TeamSummary[];
  onSelect: (task: Task) => void;
}

const COLUMNS: { title: string; statuses: Task['status'][] }[] = [
  { title: 'Đang chờ', statuses: ['queued', 'paused_quota', 'waiting_answer'] },
  { title: 'Đang làm', statuses: ['running'] },
  { title: 'Chờ duyệt', statuses: ['submitted'] },
  { title: 'Xong', statuses: ['done'] },
  { title: 'Lỗi / dừng', statuses: ['failed', 'stopped'] },
];

/** Bảng kanban các việc "làm" của nhân viên, lọc theo team hoặc theo người. */
export default function Board({ tasks, teams, onSelect }: Props) {
  const [team, setTeam] = useState('');
  const [member, setMember] = useState('');

  const people = useMemo(
    () => teams.filter((t) => !team || t.id === team).flatMap((t) => t.members.filter((m) => !m.isLead).map((m) => m.name)),
    [teams, team],
  );
  const shown = useMemo(
    () => tasks.filter((t) => t.kind === 'work' && (!team || t.team === team) && (!member || t.member === member)),
    [tasks, team, member],
  );

  return (
    <div className="card">
      <div className="detail-head">
        <h2>Bảng kanban ({shown.length} việc)</h2>
        <div className="actions">
          <select value={team} onChange={(e) => { setTeam(e.target.value); setMember(''); }} aria-label="Lọc theo team">
            <option value="">Mọi team</option>
            {teams.filter((t) => t.members.some((m) => !m.isLead)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={member} onChange={(e) => setMember(e.target.value)} aria-label="Lọc theo người">
            <option value="">Mọi người</option>
            {people.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <div className="board">
        {COLUMNS.map((col) => {
          const items = shown.filter((t) => col.statuses.includes(t.status)).sort((a, b) => b.id - a.id);
          return (
            <section key={col.title} className="column" aria-label={col.title}>
              <h3>{col.title} <span className="muted">({items.length})</span></h3>
              {items.map((t) => (
                <button key={t.id} type="button" className="cardlet" onClick={() => onSelect(t)}>
                  <span className="row-title">#{t.id} {t.title}</span>
                  <span className="row-sub">{t.member} · {t.model ?? '?'}{t.revisions > 0 ? ` · bị trả ${t.revisions} lần` : ''}</span>
                </button>
              ))}
              {items.length === 0 && <p className="muted">Trống</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
