'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { FilledTemplate, TemplateInfo } from '@/lib/types';
import TemplateFields from './TemplateFields';

interface Props {
  kind: 'epic' | 'job';
  /** Với việc lớn: chỉ hiện mẫu của team đang chọn hoặc mẫu không gắn team. */
  onFill: (filled: FilledTemplate) => void;
}

/** Chọn một mẫu việc, điền các ô, rồi đổ nội dung vào form bên dưới để bạn xem và sửa trước khi giao. */
export default function TemplatePicker({ kind, onFill }: Props) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [chosenId, setChosenId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api<{ templates: TemplateInfo[] }>('/api/templates')
        .then((r) => { if (live) setTemplates(r.templates.filter((t) => t.kind === kind)); })
        .catch(() => { if (live) setTemplates([]); });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind]);

  const chosen = templates.find((t) => t.id === chosenId) ?? null;
  if (templates.length === 0) return null;

  async function fill() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const { filled } = await api<{ filled: FilledTemplate }>(`/api/templates/${chosen.id}/render`, { method: 'POST', body: { values } });
      onFill(filled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không điền được mẫu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="template-picker">
      <summary>Dùng mẫu có sẵn</summary>
      <div className="form">
        <label>
          Mẫu
          <select value={chosenId} onChange={(e) => { setChosenId(e.target.value); setValues({}); setError(null); }}>
            <option value="">Chọn một mẫu...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        {chosen && (
          <>
            {chosen.description && <p className="muted">{chosen.description}</p>}
            <TemplateFields template={chosen} values={values} onChange={setValues} />
            {error && <p className="error" role="alert">{error}</p>}
            <button type="button" className="secondary" disabled={busy} onClick={() => void fill()}>
              {busy ? 'Đang điền...' : 'Điền vào form bên dưới'}
            </button>
          </>
        )}
      </div>
    </details>
  );
}
