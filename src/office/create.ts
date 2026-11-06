import { createIsoScene } from './iso';
import type { OfficeLayout } from './layout';
import { createPixelScene } from './pixel';
import type { OfficeScene, SceneOptions } from './scene-types';

export type ViewMode = '3d' | '2d';

/** Tạo cảnh văn phòng theo chế độ: 3D isometric hoặc 2D pixel art. Cả hai dùng chung bộ mô phỏng và giao diện OfficeScene. */
export function createOfficeScene(mode: ViewMode, host: HTMLElement, layout: OfficeLayout, options: SceneOptions): OfficeScene {
  return mode === '2d' ? createPixelScene(host, layout, options) : createIsoScene(host, layout, options);
}
