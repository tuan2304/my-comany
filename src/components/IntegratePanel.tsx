'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { IntegrationInfo } from '@/lib/types';

interface Props {
  kind: 'task' | 'job' | 'epic';
  id: number;
}

/**
 * "Đưa vào dự án": gộp nhánh company/... của một việc đã xong vào nhánh đang mở ở thư mục dự án.
 * Nơi gọi đặt `key` theo việc và trạng thái để khối này được tạo lại (xem trước mới) khi chúng đổi. Chỉ chạy khi bạn bấm. Hệ thống kiểm tra trước (thư mục dự án sạch, không xung đột) và nói rõ vì sao chưa đưa được.
 */
export default function IntegratePanel({ kind, id }: Props) {
  const [info, setInfo] = useState<IntegrationInfo | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api<IntegrationInfo>(`/api/integrate/${kind}/${id}`));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không kiểm tra được.');
    }
  }, [kind, id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/integrate/${kind}/${id}`, { method: 'POST' });
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đưa vào dự án thất bại.');
      setConfirming(false);
    } finally {
      setBusy(false);
      await load();
    }
  }

  if (loadError) return <p className="error">{loadError}</p>;
  if (!info || info.state === 'not_ready' || !info.branch) return null;

  if (info.state === 'integrated') {
    const done = info.integration;
    return (
      <section className="integrate">
        <h3>Đã đưa vào dự án</h3>
        <p className="ok-text">
          {done
            ? <>Đã gộp <code>{done.branch}</code> vào nhánh <code>{done.target}</code> lúc {new Date(done.merged_at).toLocaleString('vi-VN')}{done.commit_id ? <> (commit <code>{done.commit_id.slice(0, 8)}</code>)</> : null}. Chưa push.</>
            : <>{info.reason}</>}
        </p>
      </section>
    );
  }

  if (info.state === 'missing') {
    return (
      <section className="integrate">
        <h3>Đưa vào dự án</h3>
        <p className="muted">{info.reason}</p>
      </section>
    );
  }

  const target = info.target ?? 'nhánh hiện tại';
  const list = info.state === 'conflict' ? info.conflictFiles : info.state === 'blocked' ? info.dirtyFiles : info.files;
  return (
    <section className={`integrate ${info.state === 'ready' ? 'ready' : ''}`}>
      <h3>Đưa vào dự án</h3>
      {info.state === 'ready' ? (
        <p>
          Gộp nhánh <code>{info.branch}</code> vào nhánh <code>{target}</code> đang mở ở thư mục dự án ({info.files.length} file). Không push gì lên mạng.
        </p>
      ) : (
        <p className="notice">{info.reason}</p>
      )}
      {list.length > 0 && (
        <details>
          <summary>{info.state === 'conflict' ? 'File xung đột' : info.state === 'blocked' ? 'File đang thay đổi ở dự án' : 'File sẽ đưa vào'} ({list.length})</summary>
          <ul className="files">{list.map((f) => <li key={f}>{f}</li>)}</ul>
        </details>
      )}
      {info.state === 'ready' && info.stat && <pre className="stat-pre">{info.stat}</pre>}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {info.state === 'ready' && !confirming && (
          <button type="button" onClick={() => setConfirming(true)}>Đưa vào dự án</button>
        )}
        {info.state === 'ready' && confirming && (
          <>
            <button type="button" disabled={busy} onClick={() => void run()}>{busy ? 'Đang gộp…' : `Xác nhận gộp vào ${target}`}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Hủy</button>
          </>
        )}
        {info.state !== 'ready' && (
          <button type="button" className="secondary" onClick={() => void load()}>Kiểm tra lại</button>
        )}
      </div>
    </section>
  );
}
