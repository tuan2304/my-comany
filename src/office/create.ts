import { createIsoScene } from './iso';
import type { OfficeLayout } from './layout';
import { createPixelScene } from './pixel';
import type { OfficeScene, SceneOptions } from './scene-types';
import type { OfficeSim } from './sim';

export type ViewMode = '3d' | '2d';

/**
 * Tạo cảnh văn phòng của một tầng theo chế độ: 3D isometric hoặc 2D pixel art nhìn từ trên xuống. Cả hai dùng chung giao diện
 * OfficeScene và CHUNG một bộ mô phỏng `sim` do bên gọi giữ, nên đổi 3D ↔ 2D thì mọi người vẫn đứng đúng chỗ đang đứng.
 */
export function createOfficeScene(mode: ViewMode, host: HTMLElement, layout: OfficeLayout, options: SceneOptions, sim: OfficeSim): OfficeScene {
  return mode === '2d' ? createPixelScene(host, layout, options, sim) : createIsoScene(host, layout, options, sim);
}
