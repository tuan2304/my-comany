// Trình duyệt giả cho test: đọc --screenshot=<file> và địa chỉ trang, tải trang rồi ghi "ảnh" (PNG tối thiểu + nội dung trang).
import fs from 'node:fs';

const args = process.argv.slice(2);
const shot = args.find((a) => a.startsWith('--screenshot=')).slice('--screenshot='.length);
const url = args.at(-1);
if (process.env.FAKE_BROWSER_FAIL) process.exit(1);
const text = await (await fetch(url)).text();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(shot, Buffer.concat([png, Buffer.from(text)]));
