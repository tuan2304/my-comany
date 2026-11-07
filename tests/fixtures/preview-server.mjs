// Máy chủ xem thử giả cho test thi đấu skill: trả về danh sách file ở thư mục hiện tại (để ảnh chụp của hai nhánh khác nhau).
import fs from 'node:fs';
import http from 'node:http';

const port = Number(process.argv[2]);
http
  .createServer((req, res) => {
    const files = fs.readdirSync(process.cwd()).filter((f) => f.startsWith('out-') || f === 'hello.txt').sort();
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body>${req.url} ${files.join(',')}</body></html>`);
  })
  .listen(port, '127.0.0.1');
