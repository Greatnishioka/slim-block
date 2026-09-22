// core/ は DOM・React・時間・乱数のいずれにも依存しない純粋なロジック層とする。
// arch.md §3

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

// const enum は避ける（Vite/esbuild の isolatedModules と相性が悪いため。arch.md §5.4 注記）。
export const Terrain = {
  Empty: 0,
  Wall: 1,
  Obstacle: 2,
  Drain: 3,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

// WALL と OBSTACLE は衝突判定上区別しない。区別は描画のみ（arch.md §4）。
export const isSolid = (t: Terrain): boolean => t === Terrain.Wall || t === Terrain.Obstacle;

export interface SlimeCell {
  readonly id: number; // 生成時に割り当て、回収されるまで不変。Reactのkeyも兼ねる（想定）
  idx: number; // y * width + x
}

export interface Board {
  readonly width: number;
  readonly height: number;
  readonly terrain: Uint8Array; // 不変。length = width*height
  cells: SlimeCell[]; // 可変
  occupancy: Int32Array; // idx -> cellId、空きは -1
}
