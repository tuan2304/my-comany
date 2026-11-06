/** Thông báo khi có việc chờ chính bạn: số trên tiêu đề tab và một tiếng chuông nhẹ. */

const SOUND_KEY = 'my-company.sound';
const NOTIFY_KEY = 'my-company.notify';

/** Cách nhận thông báo trên thiết bị này: tắt, đẩy từ máy chủ (kể cả khi đóng trang), hoặc chỉ khi trang còn mở. */
export type NotifyMode = 'off' | 'local' | 'push';

export function readNotifyMode(): NotifyMode {
  try {
    const value = window.localStorage.getItem(NOTIFY_KEY);
    return value === 'local' || value === 'push' ? value : 'off';
  } catch {
    return 'off';
  }
}

export function writeNotifyMode(mode: NotifyMode): void {
  try {
    window.localStorage.setItem(NOTIFY_KEY, mode);
  } catch {
    // không lưu được: lần sau mở lại về mặc định (tắt)
  }
}

/** Nội dung thông báo cho một việc chờ bạn. Cùng chữ với thông báo đẩy của máy chủ (tests/push.test.mjs kiểm hai bên khớp nhau). */
export function notifyMessage(request: { kind: string; id: number; title: string; status: string }): { tag: string; title: string; body: string } {
  const titles: Record<string, string> = { awaiting_plan: 'Cần bạn duyệt kế hoạch', awaiting_result: 'Cần bạn duyệt kết quả', attention: 'Cần bạn xem' };
  const flat = request.title.replace(/\s+/g, ' ').trim();
  return {
    tag: `${request.kind}:${request.id}:${request.status}`,
    title: titles[request.status] ?? 'Cần bạn quyết',
    body: flat.length > 120 ? `${flat.slice(0, 119)}…` : flat,
  };
}

/** Tiêu đề tab: "(2) Cần bạn quyết · My Company" khi có việc chờ bạn, còn không thì giữ nguyên. */
export function titleFor(base: string, waiting: number): string {
  return waiting > 0 ? `(${waiting}) Cần bạn quyết · ${base}` : base;
}

/** Những việc mới chờ bạn so với lần trước (so theo khóa gồm cả trạng thái, nên cùng một yêu cầu chuyển từ chờ duyệt kế hoạch sang chờ duyệt kết quả cũng tính là mới). */
export function newKeys(prev: ReadonlySet<string>, next: readonly string[]): string[] {
  return next.filter((key) => !prev.has(key));
}

export function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSoundPreference(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // trình duyệt chặn lưu trữ: bỏ qua, lần sau mở lại sẽ về mặc định (bật)
  }
}

let audio: AudioContext | null = null;

/** Hai nốt ngắn, âm lượng nhỏ. Trình duyệt chặn âm thanh khi bạn chưa bấm gì trên trang thì lặng lẽ bỏ qua. */
export function chime(): void {
  try {
    audio = audio ?? new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const start = audio.currentTime;
    [660, 880].forEach((freq, i) => {
      if (!audio) return;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.12, start + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.16 + 0.38);
      osc.connect(gain).connect(audio.destination);
      osc.start(start + i * 0.16);
      osc.stop(start + i * 0.16 + 0.4);
    });
  } catch {
    // không có âm thanh: bỏ qua
  }
}
