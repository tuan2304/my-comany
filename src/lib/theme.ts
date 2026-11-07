'use client';

import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

export const THEME_KEY = 'my-company.theme';

function read(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // trình duyệt chặn lưu trữ: chỉ không nhớ được lựa chọn
  }
}

/** Chủ đề đang dùng (sáng = cảnh ban ngày, tối = cảnh ban đêm). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'dark');
}
