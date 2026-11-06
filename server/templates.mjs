import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatterFile } from './frontmatter.mjs';
import { UserError } from './errors.mjs';

/**
 * Mẫu việc: tệp `templates/<id>.md` (và `local/templates/<id>.md`, ghi đè theo id) dùng lại cho yêu cầu hoặc việc lớn.
 * Frontmatter: name, description, kind (epic | job), team (bắt buộc với job), fields (danh sách ô cần điền),
 * title (tiêu đề, có thể chứa {{khóa}}), acceptance (tiêu chí, có thể chứa {{khóa}}). Thân tệp là nội dung giao việc.
 */

const KEY = /^[a-z][a-z0-9_]{0,31}$/;
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
export const MAX_FIELD_LENGTH = 5000;

function placeholdersOf(text) {
  return [...String(text).matchAll(PLACEHOLDER)].map((m) => m[1]);
}

function parseTemplate(file, id) {
  const { data, body } = readFrontmatterFile(file);
  const where = `Mẫu "${id}"`;
  const name = String(data.name ?? '').trim();
  if (!name) throw new Error(`${where}: thiếu name.`);
  const kind = data.kind;
  if (kind !== 'epic' && kind !== 'job') throw new Error(`${where}: kind phải là "epic" hoặc "job".`);
  const team = data.team === undefined ? null : String(data.team);
  if (kind === 'job' && !team) throw new Error(`${where}: mẫu kind "job" cần khai team.`);
  if (!body) throw new Error(`${where}: thiếu nội dung giao việc (phần sau frontmatter).`);

  const rawFields = data.fields ?? [];
  if (!Array.isArray(rawFields)) throw new Error(`${where}: fields phải là một danh sách.`);
  const fields = rawFields.map((f) => {
    const key = String(f?.key ?? '');
    if (!KEY.test(key)) throw new Error(`${where}: khóa ô "${key}" không hợp lệ (chữ thường không dấu, số, gạch dưới).`);
    return {
      key,
      label: String(f.label ?? key),
      placeholder: String(f.placeholder ?? ''),
      required: f.required !== false,
      multiline: f.multiline === true,
    };
  });
  const keys = fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${where}: có khóa ô bị trùng.`);

  const title = String(data.title ?? name);
  const acceptance = String(data.acceptance ?? '').trim();
  for (const text of [title, body, acceptance]) {
    for (const key of placeholdersOf(text)) {
      if (!keys.includes(key)) throw new Error(`${where}: dùng {{${key}}} nhưng chưa khai trong fields.`);
    }
  }
  return { id, name, description: String(data.description ?? ''), kind, team, fields, title, prompt: body, acceptance };
}

function readDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ id: f.slice(0, -3), file: path.join(dir, f) }));
}

/** Nạp mẫu; mẫu trong thư mục local ghi đè mẫu cùng id. Mẫu hỏng bị bỏ qua và ghi vào `errors`. */
export function loadTemplates({ dir, localDir }) {
  const byId = new Map();
  const errors = [];
  for (const entry of [...readDir(dir), ...readDir(localDir)]) {
    try {
      byId.set(entry.id, { ...parseTemplate(entry.file, entry.id), source: entry.file.startsWith(localDir ?? '\0') ? 'local' : 'builtin' });
    } catch (err) {
      errors.push(err.message);
      // Mẫu local hỏng không được che mẫu gốc cùng id bằng một mẫu rỗng: giữ bản đã nạp được.
    }
  }
  return { templates: [...byId.values()], errors };
}

/** Điền giá trị vào mẫu. Giá trị không bao giờ được diễn giải lại (không mở rộng {{...}} trong giá trị). */
export function renderTemplate(template, values = {}) {
  const given = values && typeof values === 'object' ? values : {};
  const clean = {};
  for (const field of template.fields) {
    const raw = given[field.key];
    const text = raw === undefined || raw === null ? '' : String(raw).trim();
    if (!text && field.required) throw new UserError(`Mẫu "${template.name}": thiếu "${field.label}".`);
    if (text.length > MAX_FIELD_LENGTH) throw new UserError(`Mẫu "${template.name}": "${field.label}" quá dài (tối đa ${MAX_FIELD_LENGTH} ký tự).`);
    clean[field.key] = text;
  }
  const fill = (text) => String(text).replace(PLACEHOLDER, (_, key) => clean[key] ?? '');
  return {
    kind: template.kind,
    team: template.team,
    title: fill(template.title).replace(/\s+/g, ' ').trim().slice(0, 200),
    prompt: fill(template.prompt).trim(),
    acceptance: fill(template.acceptance).trim(),
  };
}

export function templateSummary(template) {
  const { id, name, description, kind, team, fields, source } = template;
  return { id, name, description, kind, team, fields, source };
}
