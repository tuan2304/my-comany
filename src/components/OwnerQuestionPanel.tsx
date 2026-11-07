'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { OwnerQuestion } from '@/lib/types';

interface Props {
  questionId: number;
  asker: string;
}

/**
 * Nhân viên đang hỏi chính bạn (công cụ ask_owner) và chờ trả lời. Bạn chọn một phương án, tự viết câu trả lời,
 * hoặc để nhân viên tự quyết. Nơi gọi đặt `key` theo mã câu hỏi để khối này tạo lại khi có câu hỏi khác.
 */
export default function OwnerQuestionPanel({ questionId, asker }: Props) {
  const [data, setData] = useState<{ question: OwnerQuestion } | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<{ question: OwnerQuestion }>(`/api/questions/${questionId}`));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không đọc được câu hỏi.');
    }
  }, [questionId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function send(body: { answer?: string; decline?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/questions/${questionId}/answer`, { method: 'POST', body });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi câu trả lời thất bại.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="error">{loadError}</p>;
  if (!data || data.question.status !== 'open') return null;
  const q = data.question;

  return (
    <section className="failure ask" aria-label="Nhân viên đang hỏi bạn">
      <h3>{asker} đang hỏi bạn</h3>
      <p className="why">{q.text}</p>
      {q.options.length > 0 && (
        <>
          <p><strong>Chọn nhanh một phương án:</strong></p>
          <div className="options">
            {q.options.map((o) => (
              <button key={o} type="button" disabled={busy} onClick={() => void send({ answer: o })}>{o}</button>
            ))}
          </div>
        </>
      )}
      <label>
        Hoặc tự viết câu trả lời
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Nêu rõ bạn chọn gì và vì sao, nhân viên sẽ làm tiếp theo câu trả lời này."
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" disabled={busy || answer.trim().length === 0} onClick={() => void send({ answer })}>
          {busy ? 'Đang gửi…' : 'Gửi câu trả lời'}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void send({ decline: true })}>
          Để {asker} tự quyết
        </button>
      </div>
    </section>
  );
}
