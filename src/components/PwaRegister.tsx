'use client';

import { useEffect } from 'react';

/** Đăng ký service worker (chỉ chạy được trên HTTPS hoặc localhost). Lỗi đăng ký không ảnh hưởng gì tới ứng dụng. */
export default function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
