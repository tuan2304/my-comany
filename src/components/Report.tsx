'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { WeeklyReport } from '@/lib/types';

interface Props {
  /** Đổi khi trạng thái việc đổi: báo cáo được tải lại. */
  signature: string;
}

const pct = (v: number | null) => (v === null ? 'chưa có dữ liệu' : `${Math.round(v * 100)}%`);
const hours = (ms: number) => (ms / 3_600_000).toFixed(1);
const num = (n: number) => Math.round(n).toLocaleString('vi-VN');

function Delta({ now, before }: { now: number; before: number }) {
  if (now === before) return <span className="muted">bằng tuần trước</span>;
  const diff = now - before;
  return <span className={diff > 0 ? 'delta up' : 'delta down'}>{diff > 0 ? '+' : ''}{num(diff)} so với tuần trước</span>;
}

export default function Report({ signature }: Props) {
  const [week, setWeek] = useState<string | null>(null);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api<{ report: WeeklyReport }>(`/api/report${week ? `?week=${encodeURIComponent(week)}` : ''}`)
        .then((r) => {
          if (live) {
            setReport(r.report);
            setError(null);
          }
        })
        .catch((err) => {
          if (live) setError(err instanceof Error ? err.message : 'Không tải được báo cáo.');
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [week, signature]);

  if (error) return <p className="banner error" role="alert">{error}</p>;
  if (!report) return <p className="muted">Đang tải báo cáo...</p>;

  const day = (ts: number) => new Date(ts).toLocaleDateString('vi-VN');
  const t = report.total;
  const maxDone = Math.max(1, ...report.teams.map((x) => x.work_done));
  const isCurrent = report.week === report.current_week;

  return (
    <div className="report">
      <div className="card form">
        <div className="report-head">
          <div>
            <h2>Báo cáo tuần {report.week}</h2>
            <p className="muted">{day(report.from)} đến {day(report.to - 1)}{isCurrent ? ' (tuần này, chưa hết)' : ''}</p>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setWeek(report.previous.week)}>← Tuần trước</button>
            <button
              type="button"
              className="secondary"
              disabled={isCurrent}
              onClick={() => setWeek(report.next_week === report.current_week ? null : report.next_week)}
            >
              Tuần sau →
            </button>
            <a className="button" href={`/api/report?week=${encodeURIComponent(report.week)}&format=md`} download>Tải Markdown</a>
          </div>
        </div>

        <div className="stats">
          <div className="stat"><strong>{t.work_done}</strong><span>việc làm đã xong</span><Delta now={t.work_done} before={report.previous.work_done} /></div>
          <div className="stat"><strong>{report.jobs.finished}</strong><span>việc lớn kết thúc</span></div>
          <div className="stat"><strong>{report.epics.finished}</strong><span>yêu cầu kết thúc</span></div>
          <div className="stat"><strong>{t.revisions}</strong><span>lần bị trả bài</span></div>
          <div className="stat"><strong>{hours(t.duration_ms)} giờ</strong><span>thời gian chạy</span></div>
          <div className="stat"><strong>{num(t.output_tokens)}</strong><span>token ra</span></div>
        </div>
        <p className="muted">
          Giá API ước tính ${t.est_cost_usd.toFixed(2)}: chỉ để so sánh giữa các team, bạn dùng gói Pro nên không bị tính khoản này. Lỗi {t.work_failed}, bị dừng {t.work_stopped}.
        </p>
      </div>

      <div className="card">
        <h2>Hạn mức Pro</h2>
        {report.quota.samples === 0 ? (
          <p className="muted">Chưa có dữ liệu hạn mức trong tuần này. Số liệu được ghi từ khi có chức năng báo cáo, mỗi 10 phút một mẫu khi công ty đang chạy.</p>
        ) : (
          <p>
            Đỉnh theo 5 giờ: <strong>{pct(report.quota.peak_five_hour)}</strong> · đỉnh theo 7 ngày: <strong>{pct(report.quota.peak_seven_day)}</strong> · mức cuối tuần: {pct(report.quota.last_seven_day)} · số lần chạm trần: {report.quota.blocked_events}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Theo team</h2>
        {report.teams.length === 0 && <p className="muted">Không có việc nào kết thúc trong tuần này.</p>}
        <ul className="bars">
          {report.teams.map((team) => (
            <li key={team.id}>
              <div className="bar-label">
                <span>{team.name}</span>
                <span className="muted">{team.work_done} việc xong · {team.revisions} lần bị trả · {hours(team.duration_ms)} giờ · {num(team.output_tokens)} token ra</span>
              </div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(team.work_done / maxDone) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Ai làm nhiều nhất</h2>
        {report.members.length === 0 && <p className="muted">Chưa có ai.</p>}
        {report.members.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Người</th><th>Team</th><th>Việc xong</th><th>Bị trả</th><th>Lượt duyệt/kế hoạch</th><th>Token ra</th></tr>
              </thead>
              <tbody>
                {report.members.slice(0, 10).map((m, i) => (
                  <tr key={`${m.team}-${m.member}`}>
                    <td>{i + 1}</td>
                    <td>{m.member}</td>
                    <td>{report.teams.find((x) => x.id === m.team)?.name ?? m.team}</td>
                    <td>{m.work_done}</td>
                    <td>{m.revisions}</td>
                    <td>{m.lead_runs}</td>
                    <td>{num(m.output_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
