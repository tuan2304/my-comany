#!/usr/bin/env node
/**
 * Cầu nối MCP (stdio) giữa một tiến trình `claude` và máy chủ công ty. Claude Code khởi động file này
 * theo --mcp-config; mỗi công cụ được chuyển tiếp qua HTTP tới máy chủ cục bộ kèm mã thông báo riêng
 * của lượt làm việc. Danh sách công cụ lấy từ máy chủ nên chỉ có một nơi định nghĩa (agent-tools.mjs).
 *
 * Giao thức: JSON-RPC 2.0, mỗi dòng một thông điệp. Chỉ ghi JSON hợp lệ ra stdout; log ghi ra stderr.
 */
import readline from 'node:readline';

const API = process.env.COMPANY_API_URL;
const TOKEN = process.env.COMPANY_RUN_TOKEN;
const DEFAULT_PROTOCOL = '2025-06-18';

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const log = (text) => process.stderr.write(`[company-bridge] ${text}\n`);

async function api(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.text) throw new Error(data.error ?? `Máy chủ công ty trả lỗi ${res.status}`);
  return data;
}

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;
  try {
    switch (method) {
      case 'initialize':
        return send({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL,
            capabilities: { tools: {} },
            serverInfo: { name: 'company', version: '0.1.0' },
          },
        });
      case 'ping':
        return send({ jsonrpc: '2.0', id, result: {} });
      case 'tools/list': {
        const { tools } = await api('/api/agent/tools');
        return send({ jsonrpc: '2.0', id, result: { tools } });
      }
      case 'tools/call': {
        const reply = await api('/api/agent/call', { name: params?.name, arguments: params?.arguments ?? {} });
        return send({
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: String(reply.text ?? '') }], isError: Boolean(reply.isError) },
        });
      }
      default:
        if (isRequest) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Không hỗ trợ phương thức ${method}` } });
        return undefined; // thông báo (notification) thì bỏ qua
    }
  } catch (err) {
    log(`lỗi khi xử lý ${method}: ${err.message}`);
    if (isRequest) {
      if (method === 'tools/call') {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Lỗi: ${err.message}` }], isError: true } });
      }
      return send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } });
    }
    return undefined;
  }
}

if (!API || !TOKEN) {
  log('Thiếu COMPANY_API_URL hoặc COMPANY_RUN_TOKEN.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin });
const pending = new Set();
rl.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    log('bỏ qua dòng không phải JSON');
    return;
  }
  const work = handle(message).finally(() => pending.delete(work));
  pending.add(work);
});
rl.on('close', async () => {
  await Promise.allSettled([...pending]);
  process.exit(0);
});
