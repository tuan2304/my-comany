import type { Flow } from './flow';
import type { Lamp, PersonView, Place } from './status';

/** Giao diện chung của hai bộ vẽ văn phòng (3D isometric và 2D pixel art). */

export interface SceneDebug {
  people: Record<string, {
    place: Place; dest: Place; walking: boolean; x: number; z: number; seated: boolean; bubble: string; pile: number; lamp: Lamp;
    idle: Place | null; anim: string; facing: number;
  }>;
  papers: number;
  onBreak: boolean;
  beacon: boolean;
  sign: string;
}

export interface OfficeScene {
  /** Cập nhật tình trạng từng người (đèn, động tác, chồng giấy, bóng nói); người không có trong bảng coi như rảnh. */
  setViews: (views: Record<string, PersonView>) => void;
  /** Hết hạn mức Pro: cả công ty ra khu nghỉ tới thời điểm `until` (mili giây); null là hết giờ nghỉ. */
  setBreak: (until: number | null) => void;
  /** Số việc đang chờ chính bạn; lớn hơn 0 thì đèn trên bàn Chủ nhấp nháy. */
  setOwnerWaiting: (count: number) => void;
  /** Cho một tờ giấy bay từ `flow.from` tới `flow.to`. */
  sendFlow: (flow: Flow) => void;
  select: (name: string | null) => void;
  /** Vị trí (pixel, tính từ góc trên trái khung) của đầu mỗi người trên màn hình hiện tại; dùng để kiểm thử bằng trình duyệt. */
  screenPositions: () => Record<string, { x: number; y: number }>;
  /** Trạng thái bên trong, để kiểm thử bằng trình duyệt. */
  debug: () => SceneDebug;
  dispose: () => void;
}

export interface SceneOptions {
  dark: boolean;
  /** Người dùng bật "giảm chuyển động": nhân vật dịch chuyển tức thì, giấy hiện ở đích, không có dao động. */
  reducedMotion: boolean;
  onSelect: (name: string | null) => void;
}
