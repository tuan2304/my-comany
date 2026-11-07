// Dùng ở app/layout.tsx (server component), nên tách khỏi theme.ts có hook của client.
/** Chạy trong <head> trước khi vẽ trang, để không bị nháy sáng/tối: đọc lựa chọn đã lưu, không có thì theo hệ điều hành. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('my-company.theme');if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})();`;

