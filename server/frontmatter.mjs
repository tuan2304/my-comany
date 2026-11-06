import fs from 'node:fs';
import YAML from 'yaml';

/** Tách "---\n<yaml>\n---\n<nội dung>" thành { data, body }. */
export function parseFrontmatter(text) {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: normalized.trim() };
  const data = YAML.parse(match[1]) ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Phần frontmatter phải là một đối tượng YAML');
  }
  return { data, body: match[2].trim() };
}

export function readFrontmatterFile(file) {
  try {
    return parseFrontmatter(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Không đọc được ${file}: ${err.message}`, { cause: err });
  }
}
