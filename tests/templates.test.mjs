import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTemplates, renderTemplate } from '../server/templates.mjs';
import { REPO, removeDir, tmpDir } from './helpers.mjs';

const BUILTIN = path.join(REPO, 'templates');

const write = (dir, name, text) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
};

const minimal = (extra = '') => `---\nname: Mẫu thử\nkind: epic\nfields:\n  - { key: ten, label: Tên }\n${extra}title: "Việc {{ten}}"\n---\nLàm {{ten}}.\n`;

test('bốn mẫu gửi kèm đều nạp được và điền được', () => {
  const { templates, errors } = loadTemplates({ dir: BUILTIN });
  assert.deepEqual(errors, []);
  assert.deepEqual(templates.map((t) => t.id).sort(), ['kiem-tra-build', 'sua-loi', 'viet-bao-cao', 'viet-tinh-nang']);

  const bug = templates.find((t) => t.id === 'sua-loi');
  const filled = renderTemplate(bug, { mo_ta: 'Nút lưu không bấm được' });
  assert.equal(filled.kind, 'epic');
  assert.equal(filled.title, 'Sửa lỗi: Nút lưu không bấm được');
  assert.match(filled.prompt, /## Mô tả lỗi\nNút lưu không bấm được/);
  assert.match(filled.acceptance, /test tự động/);

  const build = templates.find((t) => t.id === 'kiem-tra-build');
  assert.equal(build.kind, 'job');
  assert.equal(build.team, 'quality');
  assert.equal(renderTemplate(build, {}).team, 'quality');
});

test('thiếu ô bắt buộc, ô quá dài thì báo lỗi dễ hiểu; ô tùy chọn để trống được', () => {
  const { templates } = loadTemplates({ dir: BUILTIN });
  const bug = templates.find((t) => t.id === 'sua-loi');
  assert.throws(() => renderTemplate(bug, { mo_ta: '   ' }), /thiếu "Mô tả lỗi"/);
  assert.throws(() => renderTemplate(bug, { mo_ta: 'x'.repeat(5001) }), /quá dài/);
  assert.doesNotThrow(() => renderTemplate(bug, { mo_ta: 'ổn', cach_tai_hien: '' }));
});

test('giá trị người dùng nhập không bị diễn giải lại như mẫu ({{...}} và $ giữ nguyên)', () => {
  const dir = tmpDir();
  try {
    write(dir, 'a.md', minimal());
    const { templates } = loadTemplates({ dir });
    const filled = renderTemplate(templates[0], { ten: '{{ten}} $& $1 {{khac}}' });
    assert.equal(filled.title, 'Việc {{ten}} $& $1 {{khac}}');
    assert.equal(filled.prompt, 'Làm {{ten}} $& $1 {{khac}}.');
  } finally {
    removeDir(dir);
  }
});

test('mẫu local ghi đè mẫu gốc cùng id; mẫu hỏng bị bỏ qua và báo lỗi, không che mẫu gốc', () => {
  const dir = tmpDir();
  try {
    const builtin = path.join(dir, 'b');
    const local = path.join(dir, 'l');
    write(builtin, 'a.md', minimal());
    write(builtin, 'c.md', minimal());
    write(local, 'a.md', minimal().replace('Mẫu thử', 'Mẫu local'));
    write(local, 'c.md', '---\nname: hỏng\nkind: lạ\n---\nx\n');
    write(local, 'd.md', '---\nname: Cần team\nkind: job\n---\nx\n');
    write(local, 'e.md', minimal().replace('Làm {{ten}}.', 'Làm {{ten}} và {{lạ}} {{khong_khai}}.'));
    const { templates, errors } = loadTemplates({ dir: builtin, localDir: local });

    const a = templates.find((t) => t.id === 'a');
    assert.equal(a.name, 'Mẫu local');
    assert.equal(a.source, 'local');
    assert.equal(templates.find((t) => t.id === 'c').name, 'Mẫu thử', 'mẫu local hỏng không được che mẫu gốc');
    assert.equal(templates.some((t) => t.id === 'd' || t.id === 'e'), false);
    assert.equal(errors.length, 3);
    assert.ok(errors.some((e) => /kind phải là/.test(e)));
    assert.ok(errors.some((e) => /cần khai team/.test(e)));
    assert.ok(errors.some((e) => /chưa khai trong fields/.test(e)));
  } finally {
    removeDir(dir);
  }
});

test('khóa ô sai định dạng hoặc trùng bị từ chối', () => {
  const dir = tmpDir();
  try {
    write(dir, 'x.md', minimal().replace('key: ten', 'key: Tên'));
    write(dir, 'y.md', minimal().replace('fields:\n', 'fields:\n  - { key: ten, label: Lại }\n'));
    const { templates, errors } = loadTemplates({ dir });
    assert.equal(templates.length, 0);
    assert.equal(errors.length, 2);
  } finally {
    removeDir(dir);
  }
});
