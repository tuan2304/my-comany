'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABEL } from '@/lib/format';
import type { TaskStatus, TeamLoad } from '@/lib/types';

/** Bảng tải của từng team: ai đang làm gì, hàng chờ bao nhiêu, còn nhận thêm được mấy việc. `signature` đổi thì tải lại. */
export default function TeamLoadPanel({ signature }: { signature: string }) {
  const [teams, setTeams] = useState<TeamLoad[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ teams: TeamLoad[] }>('/api/workload')
        .then((data) => {
          if (!cancelled) {
            setTeams(data.teams);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được bảng tải.');
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signature]);

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="loadgrid">
        {teams.filter((t) => t.workers.length > 0).map((team) => (
          <section key={team.id} className="loadteam">
            <h3>{team.name} <span className="muted">· Trưởng nhóm {team.lead}</span></h3>
            {team.workers.map((w) => {
              const used = w.active + w.queued;
              const pct = Math.round((used / Math.max(w.cap, 1)) * 100);
              return (
                <div key={w.name} className="worker">
                  <div className="meter-label">
                    <span><strong>{w.name}</strong> · {w.title} · {w.model}</span>
                    <span>{used}/{w.cap} {w.free === 0 ? '· đầy' : `· còn ${w.free}`}</span>
                  </div>
                  <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`fill ${pct >= 100 ? 'hot' : pct >= 66 ? 'warm' : ''}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  {w.open.length === 0 ? <p className="muted">Đang rảnh</p> : (
                    <ul className="list-plain">
                      {w.open.map((t) => <li key={t.id} className="muted">#{t.id} {t.title} ({STATUS_LABEL[t.status as TaskStatus] ?? t.status})</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ))}
        {teams.length === 0 && !error && <p className="muted">Đang tải...</p>}
      </div>
    </div>
  );
}
