'use client';

import type { TemplateInfo } from '@/lib/types';

interface Props {
  template: TemplateInfo;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

/** Các ô cần điền của một mẫu việc (dùng cho cả form giao việc và form đặt lịch). */
export default function TemplateFields({ template, values, onChange }: Props) {
  if (template.fields.length === 0) return <p className="muted">Mẫu này không cần điền gì thêm.</p>;
  return (
    <>
      {template.fields.map((field) => (
        <label key={field.key}>
          {field.label} {!field.required && <span className="muted">(không bắt buộc)</span>}
          {field.multiline ? (
            <textarea
              value={values[field.key] ?? ''}
              rows={3}
              placeholder={field.placeholder}
              onChange={(e) => onChange({ ...values, [field.key]: e.target.value })}
            />
          ) : (
            <input
              value={values[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => onChange({ ...values, [field.key]: e.target.value })}
            />
          )}
        </label>
      ))}
    </>
  );
}
