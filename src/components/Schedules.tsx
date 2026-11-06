'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Schedule, TemplateInfo } from '@/lib/types';
import TemplateFields from './TemplateFields';

interface Props {
  /** Đổi khi trạng thái việc đổi, để tải lại "lần chạy trước còn mở không". */
  signature: string;
  onOpenRun: (kind: 'epic' | 'job', id: number) => void;
}

// Thứ trong tuần theo getDay(): 0 = Chủ nhật.
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
];
const WORKDAYS = [1, 2, 3, 4, 5];

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Có lỗi xảy ra.';
}

function daysText(days: number[]): string {
  if (days.length === 7) return 'mỗi ngày';
  if (days.length === 5 && WORKDAYS.every((d) => days.includes(d))) return 'thứ Hai đến thứ Sáu';
  return DAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(', ');
}

function whenText(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Schedules({ signature, onOpenRun }: Props) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateErrors, setTemplateErrors] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [atTime, setAtTime] = useState('08:30');
  const [days, setDays] = useState<number[]>(WORKDAYS);
  const [maxPerDay, setMaxPerDay] = useState(2);

  const loadSchedules = useCallback(async () => {
    try {
      const r = await api<{ schedules: Schedule[] }>('/api/schedules');
      setSchedules(r.schedules);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ templates: TemplateInfo[]; errors: string[] }>('/api/templates')
        .then((r) => { setTemplates(r.templates); setTemplateErrors(r.errors); })
        .catch((err) => setError(errorText(err)));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadSchedules(), 0);
    return () => clearTimeout(timer);
  }, [loadSchedules, signature]);

  const chosen = templates.find((t) => t.id === templateId) ?? null;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/schedules', { method: 'POST', body: { name, template: chosen.id, params: values, at_time: atTime, days, max_per_day: maxPerDay } });
      setName('');
      setValues({});
      await loadSchedules();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function action(id: number, what: 'enable' | 'disable' | 'run-now' | 'delete') {
    setError(null);
    try {
      await api(`/api/schedules/${id}/${what}`, { method: 'POST' });
      await loadSchedules();
    } catch (err) {
      setError(errorText(err));
      await loadSchedules();
    }
  }

  const nameOf = (id: string) => templates.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="grid">
      <section className="col">
        <form className="card form" onSubmit={create}>
          <h2>Đặt lịch cho một việc lặp lại</h2>
          <p className="muted">
            Lịch tạo ra luôn <strong>tắt</strong>; bạn bật tay. Khi bật, đến giờ công ty tự giao việc cho team và việc đó tốn hạn mức Pro dù bạn không có mặt.
            Để không đốt hạn mức: mỗi lịch chỉ có một lần chạy đang mở, bị bỏ qua khi công ty đang tạm dừng, có trần số lần mỗi ngày, và lỡ giờ quá 3 tiếng thì bỏ lượt.
          </p>
          <label>
            Tên lịch
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Ví dụ: Kiểm tra build mỗi sáng" required />
          </label>
          <label>
            Mẫu việc
            <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setValues({}); }} required>
              <option value="">Chọn một mẫu...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.kind === 'epic' ? 'yêu cầu' : `việc lớn cho ${t.team}`})</option>
              ))}
            </select>
          </label>
          {chosen && (
            <>
              {chosen.description && <p className="muted">{chosen.description}</p>}
              {chosen.kind === 'epic' && (
                <p className="muted">Mẫu này tạo một yêu cầu cho Giám đốc: nó vẫn dừng ở bước chờ bạn duyệt kế hoạch.</p>
              )}
              <TemplateFields template={chosen} values={values} onChange={setValues} />
            </>
          )}
          <label>
            Giờ chạy (giờ máy)
            <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} required />
          </label>
          <fieldset className="days">
            <legend>Các ngày</legend>
            {DAYS.map((d) => (
              <label key={d.value} className="check">
                <input
                  type="checkbox"
                  checked={days.includes(d.value)}
                  onChange={(e) => setDays((prev) => (e.target.checked ? [...prev, d.value] : prev.filter((x) => x !== d.value)))}
                />
                {d.label}
              </label>
            ))}
          </fieldset>
          <label>
            Tối đa mấy lần mỗi ngày
            <input type="number" min={1} max={10} value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={busy || !chosen || days.length === 0}>{busy ? 'Đang tạo...' : 'Tạo lịch (đang tắt)'}</button>
        </form>

        <div className="card list">
          <h2>Mẫu việc ({templates.length})</h2>
          <p className="muted">Mẫu là tệp trong thư mục <code>templates/</code>; thêm hoặc sửa mẫu riêng bằng tệp cùng tên trong <code>local/templates/</code>.</p>
          {templateErrors.map((e) => <p key={e} className="error">{e}</p>)}
          <ul>
            {templates.map((t) => (
              <li key={t.id} className="plain">
                <strong>{t.name}</strong> <span className="chip">{t.kind === 'epic' ? 'Yêu cầu' : `Việc lớn: ${t.team}`}</span>
                {t.source === 'local' && <span className="chip">riêng</span>}
                <div className="muted">{t.description}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="col">
        <div className="card list">
          <h2>Lịch ({schedules.length})</h2>
          {schedules.length === 0 && <p className="muted">Chưa có lịch nào.</p>}
          <ul>
            {schedules.map((s) => (
              <li key={s.id} className="plain schedule">
                <div className="schedule-head">
                  <strong>{s.name}</strong>
                  <span className={`chip ${s.enabled ? 'status-running' : ''}`}>{s.enabled ? 'Đang bật' : 'Đang tắt'}</span>
                </div>
                <div className="muted">
                  {nameOf(s.template)} · {s.at_time} {daysText(s.days)} · tối đa {s.max_per_day} lần/ngày (hôm nay đã {s.runs_today})
                </div>
                {s.enabled && s.next_run_at && <div className="muted">Lần kế tiếp: {whenText(s.next_run_at)}</div>}
                {s.last_run_at && <div className="muted">Lần giao gần nhất: {whenText(s.last_run_at)}</div>}
                {s.open_run && (
                  <div>
                    Đang có {s.open_run.kind === 'epic' ? 'yêu cầu' : 'việc lớn'}{' '}
                    <button type="button" className="linklike" onClick={() => onOpenRun(s.open_run!.kind, s.open_run!.id)}>#{s.open_run.id}</button> chưa xong nên không giao thêm.
                  </div>
                )}
                {s.last_error && <p className="error">Lần gần nhất không giao được: {s.last_error}</p>}
                <div className="actions">
                  <button type="button" className="secondary" onClick={() => void action(s.id, s.enabled ? 'disable' : 'enable')}>{s.enabled ? 'Tắt' : 'Bật'}</button>
                  <button type="button" className="secondary" disabled={Boolean(s.open_run)} onClick={() => void action(s.id, 'run-now')}>Chạy ngay</button>
                  <button type="button" className="danger" onClick={() => void action(s.id, 'delete')}>Xóa</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
