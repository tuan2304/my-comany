'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import type { ContestOption, ContestView } from '@/lib/types';
import IntegratePanel from './IntegratePanel';
import { Overlay } from './ui';

interface Props {
  jobId: number;
  /** Có hàm này thì hiện dạng cửa sổ phủ lên văn phòng (bấm vào Trưởng nhóm); không có thì hiện ngay trong trang chi tiết việc lớn. */
  onClose?: () => void;
  /** Gọi ngay khi chọn xong (việc lớn đổi trạng thái nên nơi gọi cần giữ cửa sổ này mở để chủ đọc kết quả). */
  onChosen?: () => void;
}

const PHASE_TEXT: Record<ContestView['status'], string> = {
  splitting: 'Trưởng nhóm đang giao việc cho hai người.',
  working: 'Hai người đang làm song song, chưa nộp xong.',
  capturing: 'Hai bản đã nộp, hệ thống đang chụp ảnh giao diện.',
  ready: 'Hai bản đã sẵn sàng.',
  chosen: 'Đã chọn.',
};

/**
 * Thi đấu skill: hai bản của cùng một việc, chấm mù (chưa chọn thì không biết bản nào của ai, dùng skill nào).
 * Chọn xong mới lộ danh tính và bộ skill, và nhánh được chọn đi vào luồng "Đưa vào dự án" như mọi việc lớn.
 */
export default function ContestPanel({ jobId, onClose, onChosen }: Props) {
  const [view, setView] = useState<ContestView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { contest } = await api<{ contest: ContestView }>(`/api/jobs/${jobId}/contest`);
      setView(contest);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không tải được cuộc thi.');
    }
  }, [jobId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function choose(option: number) {
    setBusy(true);
    setError(null);
    onChosen?.();
    try {
      const { contest } = await api<{ contest: ContestView }>(`/api/jobs/${jobId}/contest/choose`, { method: 'POST', body: { option } });
      setView(contest);
      setPick(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không chọn được.');
      setPick(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const chosen = view?.status === 'chosen';
  const body = (
    <section className="contest" aria-label="Thi đấu skill">
      <div className="contest-head">
        {!onClose && <h3>{view ? `So sánh hai bản: ${view.title}` : 'So sánh hai bản'}</h3>}
        <p className="muted">
          {onClose && view ? `${view.title}. ` : ''}
          {chosen
            ? 'Đã chọn. Hai bản được mở danh tính bên dưới.'
            : 'Hai bản dưới đây làm cùng một việc, đã được ẩn danh và xáo thứ tự. Chọn bản bạn thấy đẹp và dễ dùng hơn.'}
        </p>
      </div>

      {loadError && <p className="error" role="alert">{loadError}</p>}
      {view && view.status !== 'ready' && view.status !== 'chosen' && <p className="notice">{PHASE_TEXT[view.status]}</p>}

      {view && view.options.length > 0 && (
        <div className="contest-grid">
          {view.options.map((o: ContestOption) => (
            <article key={o.option} className={`contest-card ${o.winner ? 'winner' : ''}`} data-testid={`contest-option-${o.option}`}>
              <h4>
                Phương án {o.option}
                {chosen && o.winner && <span className="chip status-done"> Đã chọn</span>}
              </h4>
              {o.images.length > 0 ? (
                <div className="contest-shots">
                  {o.images.map((img) => (
                    <figure key={img.page}>
                      <button type="button" className="contest-shot" onClick={() => setZoom(img.src)} aria-label={`Phóng to ảnh trang ${img.page}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh data URL do máy chủ chụp, không qua tối ưu ảnh của Next */}
                        <img src={img.src} alt={`Phương án ${o.option}, trang ${img.page}`} />
                      </button>
                      <figcaption className="muted">{img.page}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="notice">{o.shotError ?? 'Không có ảnh chụp.'}</p>
              )}
              <p className="muted">{o.changedFiles} file thay đổi</p>
              {chosen && (
                <div className="contest-reveal">
                  <p><strong>{o.member}</strong> · skill: {o.skills?.join(', ')}</p>
                  {o.report && <details><summary>Báo cáo của {o.member}</summary><pre className="stat-pre">{o.report}</pre></details>}
                </div>
              )}
              {!chosen && view.status === 'ready' && (
                pick === o.option ? (
                  <div className="actions">
                    <button type="button" disabled={busy} onClick={() => void choose(o.option)}>{busy ? 'Đang gộp…' : `Xác nhận chọn phương án ${o.option}`}</button>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setPick(null)}>Hủy</button>
                  </div>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setPick(o.option)}>Chọn phương án {o.option}</button>
                )
              )}
            </article>
          ))}
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {view && !chosen && view.status === 'ready' && (
        <p className="muted">Chọn xong, nhánh của bản được chọn mới được gộp; bản còn lại vẫn nằm trong nhánh riêng của nó, không bị xóa.</p>
      )}

      {chosen && view?.winnerSkills && (
        <div className="contest-result">
          <p>
            Bộ skill thắng: <strong>{view.winnerSkills.join(' + ')}</strong>. Muốn dùng làm mặc định cho Lập trình viên Frontend, hãy sửa mục <code>skills:</code> trong{' '}
            <code>teams/frontend/frontend-dev.md</code> (hệ thống không tự đổi). Một lần thi chỉ là một mẫu, nên đừng coi là kết luận chắc chắn.
          </p>
          <IntegratePanel key={`job:${jobId}:${view.jobStatus}`} kind="job" id={jobId} />
        </div>
      )}
      {zoom && (
        <div className="contest-zoom" role="dialog" aria-label="Ảnh phóng to" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- xem chú thích ở trên */}
          <img src={zoom} alt="Ảnh phóng to" />
        </div>
      )}
    </section>
  );

  if (!onClose) return body;
  // Đưa ra ngoài cảnh văn phòng (portal) để nằm trên thanh nút dưới cùng và dùng chung khung Overlay (Esc, giữ tiêu điểm bàn phím).
  if (typeof document === 'undefined') return null;
  return createPortal(<Overlay title="So sánh hai bản" onClose={onClose} size="xl">{body}</Overlay>, document.body);
}
