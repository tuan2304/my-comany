import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Công cụ nằm lồng trong dự án của bạn (.my-company/), nên chỉ rõ gốc để Next
// không nhầm sang lockfile của dự án chứa nó.
const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: root,
  turbopack: { root },
};

export default nextConfig;
