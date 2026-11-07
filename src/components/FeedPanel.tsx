'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatClock, KIND_LABEL } from '@/lib/format';
import type { FeedEvent } from '@/lib/types';

/** Nhật ký hội thoại giữa các tầng: giao việc, duyệt bài, trả bài, lệnh gọi công cụ của công ty. `signature` đổi thì tải lại. */
export default function FeedPanel({ signature, onSelectTask }: { signature: string; onSelectTask: (id: number) => void }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ events: FeedEvent[] }>('/api/feed?limit=120')
        .then((data) => {
          if (!cancelled) {
            setEvents(data.events);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được nhật ký.');
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signature]);

  return (
    <div>
      <p className="muted">Giao việc, duyệt bài, trả bài và lệnh công cụ giữa các tầng. Mới nhất ở trên; bấm một dòng để xem lượt làm việc đó.</p>
      {error && <p className="error">{error}</p>}
      <ol className="log feed">
        {events.length === 0 && <li className="muted">Chưa có sự kiện.</li>}
        {events.map((e) => (
          <li key={e.id} className={`kind-${e.kind}`}>
            <time>{formatClock(e.ts)}</time>
            <span className="kind">{e.member}</span>
            <button type="button" className="linklike" onClick={() => onSelectTask(e.task_id)}>
              <strong>{e.kind === 'tool' ? 'Công cụ' : KIND_LABEL[e.kind] ?? e.kind}:</strong> {e.summary}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
