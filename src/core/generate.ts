// 障害物・スライム・回収口をランダム生成し、solver.ts で「実際に全回収できる手順が
// 存在する」ことを確認できた盤面だけを返す。見つからなければ盤面を作り直す。
// これにより「詰む盤面」が生成されることはない（ソルバーが見つけた手順がその証拠になる）。
//
// 回収口は部屋の内部に単独で置かない。外周の壁の一部を開けて、そこから外側へ
// 3×3の部屋（ポケット）を張り出させる形にする。中空に浮いた1マスの的より、
// 壁に接続された広い受け皿の方が狙いやすいため。

import type { Board, Dir } from './types';
import { parseBoard } from './board';
import type { Rng } from './rng';
import { mulberry32, pick, randInt } from './rng';
import { solve } from './solver';

export interface GenerateOptions {
  width?: number;
  height?: number;
  seed?: number;
  /** 障害物の矩形を置こうと試みる回数（実際に置けた数はこれ以下になる）。 */
  obstacleAttempts?: number;
  /** スライムのグループ数（1グループ=1〜4セルの小さな矩形）。 */
  slimeGroupCount?: number;
  /** 回収口ポケットの一辺のサイズ（既定3×3）。 */
  pocketSize?: number;
  maxSolveDepth?: number;
  maxSolveStates?: number;
  /** 解ける盤面が見つかるまで生成をやり直す回数の上限。 */
  maxGenerationAttempts?: number;
}

export interface GeneratedLevel {
  board: Board;
  layout: string[];
  seed: number;
  attempts: number;
  /** ソルバーが実際に見つけたクリア手順の一例（検証・デバッグ用）。 */
  solution: Dir[];
}

interface Shape {
  w: number;
  h: number;
}

// 1×1を出やすくする重み付け。最大でも2×2までに収める
// （「基本は1×1、大きくても1×2/2×2まで」というリクエストに合わせる）。
const SLIME_SHAPES: readonly Shape[] = [
  { w: 1, h: 1 },
  { w: 1, h: 1 },
  { w: 1, h: 1 },
  { w: 1, h: 2 },
  { w: 2, h: 1 },
  { w: 2, h: 2 },
];

function inInterior(width: number, height: number, x: number, y: number): boolean {
  return x > 0 && x < width - 1 && y > 0 && y < height - 1;
}

function isEmptyRect(grid: string[][], width: number, height: number, x0: number, y0: number, w: number, h: number): boolean {
  if (x0 < 1 || y0 < 1 || x0 + w > width - 1 || y0 + h > height - 1) return false;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (!inInterior(width, height, x, y) || grid[y][x] !== '.') return false;
    }
  }
  return true;
}

function paintRect(grid: string[][], x0: number, y0: number, w: number, h: number, ch: string): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) grid[y][x] = ch;
  }
}

/** 障害物とスライムだけを配置した「部屋」を1つ作る（回収口はまだない）。 */
function buildRoom(width: number, height: number, rng: Rng, obstacleAttempts: number, slimeGroupCount: number): string[][] | null {
  const grid: string[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
  for (let x = 0; x < width; x++) {
    grid[0][x] = '#';
    grid[height - 1][x] = '#';
  }
  for (let y = 0; y < height; y++) {
    grid[y][0] = '#';
    grid[y][width - 1] = '#';
  }

  // 障害物: 主に1マス幅の短い直線。太い(2マス厚)障害物は逃げ道を塞ぎやすいので稀にしか出さない。
  for (let i = 0; i < obstacleAttempts; i++) {
    const horizontal = rng() < 0.5;
    const thick = rng() < 0.12;
    const len = randInt(rng, 2, 5);
    const thickness = thick ? 2 : 1;
    const w = horizontal ? len : thickness;
    const h = horizontal ? thickness : len;
    const x0 = randInt(rng, 1, Math.max(1, width - 1 - w));
    const y0 = randInt(rng, 1, Math.max(1, height - 1 - h));
    if (!isEmptyRect(grid, width, height, x0, y0, w, h)) continue;
    paintRect(grid, x0, y0, w, h, 'X');
  }

  // スライム: 小さな矩形を空きマスへ散らして置く。
  let placed = 0;
  let tries = 0;
  while (placed < slimeGroupCount && tries < slimeGroupCount * 40) {
    tries++;
    const shape = pick(rng, SLIME_SHAPES);
    const rotate = rng() < 0.5;
    const w = rotate ? shape.h : shape.w;
    const h = rotate ? shape.w : shape.h;
    const x0 = randInt(rng, 1, Math.max(1, width - 1 - w));
    const y0 = randInt(rng, 1, Math.max(1, height - 1 - h));
    if (!isEmptyRect(grid, width, height, x0, y0, w, h)) continue;
    paintRect(grid, x0, y0, w, h, 'o');
    placed++;
  }
  if (placed === 0) return null;

  return grid;
}

type Edge = 'top' | 'bottom' | 'left' | 'right';
const EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

/**
 * 部屋の外周に、回収口ポケット（pocketSize×pocketSize、全マス回収口）を接続する。
 * 元の境界壁のうち接続部分だけを開け、そこから外側へ張り出す形にする
 * （「ゴールを枠外に、壁に接続する形で置く」というリクエストに対応）。
 * 新しく増える行/列は、ポケットの範囲以外はすべて壁で埋める
 * （境界と同じ見た目になり、張り出しの輪郭だけが開口部として見える）。
 */
function attachPocket(
  room: string[][],
  roomWidth: number,
  roomHeight: number,
  edge: Edge,
  pocketSize: number,
  offset: number,
): { grid: string[][]; width: number; height: number } {
  const extra = pocketSize - 1; // ポケットの1辺は元の境界壁を開けた分を含むので、増える行/列はpocketSize-1でよい

  if (edge === 'bottom' || edge === 'top') {
    const width = roomWidth;
    const height = roomHeight + extra;
    const grid: string[][] = Array.from({ length: height }, () => Array<string>(width).fill('#'));
    const roomY0 = edge === 'top' ? extra : 0;

    for (let y = 0; y < roomHeight; y++) {
      for (let x = 0; x < width; x++) grid[y + roomY0][x] = room[y][x];
    }

    const doorY = edge === 'top' ? extra : roomHeight - 1;
    for (let x = offset; x < offset + pocketSize; x++) grid[doorY][x] = '@';

    const pocketYs = edge === 'top' ? Array.from({ length: extra }, (_, i) => i) : Array.from({ length: extra }, (_, i) => roomHeight + i);
    for (const y of pocketYs) {
      for (let x = offset; x < offset + pocketSize; x++) grid[y][x] = '@';
    }

    return { grid, width, height };
  }

  // left / right
  const width = roomWidth + extra;
  const height = roomHeight;
  const grid: string[][] = Array.from({ length: height }, () => Array<string>(width).fill('#'));
  const roomX0 = edge === 'left' ? extra : 0;

  for (let y = 0; y < roomHeight; y++) {
    for (let x = 0; x < roomWidth; x++) grid[y][x + roomX0] = room[y][x];
  }

  const doorX = edge === 'left' ? extra : roomWidth - 1;
  for (let y = offset; y < offset + pocketSize; y++) grid[y][doorX] = '@';

  const pocketXs = edge === 'left' ? Array.from({ length: extra }, (_, i) => i) : Array.from({ length: extra }, (_, i) => roomWidth + i);
  for (const x of pocketXs) {
    for (let y = offset; y < offset + pocketSize; y++) grid[y][x] = '@';
  }

  return { grid, width, height };
}

/** 障害物・スライム・回収口ポケットをランダム配置した候補レイアウトを1つ作る（解けるかは未検証）。 */
function buildCandidateLayout(
  roomWidth: number,
  roomHeight: number,
  rng: Rng,
  obstacleAttempts: number,
  slimeGroupCount: number,
  pocketSize: number,
): string[] | null {
  const room = buildRoom(roomWidth, roomHeight, rng, obstacleAttempts, slimeGroupCount);
  if (!room) return null;

  const edge = pick(rng, EDGES);
  const span = edge === 'left' || edge === 'right' ? roomHeight : roomWidth;
  const maxOffset = span - 1 - pocketSize; // 両端の角(壁1マスぶん)を避けた範囲に収める
  if (maxOffset < 1) return null; // 部屋が小さすぎてポケットが置けない
  const offset = randInt(rng, 1, maxOffset);

  const { grid } = attachPocket(room, roomWidth, roomHeight, edge, pocketSize, offset);
  return grid.map((row) => row.join(''));
}

/**
 * 障害物・スライム・回収口をランダム生成し、solver.ts で実際にクリア手順が
 * 見つかった盤面だけを返す。既定の試行回数内に見つからなければ例外を投げる。
 */
export function generateSolvableLevel(options: GenerateOptions = {}): GeneratedLevel {
  const {
    width = 20,
    height = 20,
    seed = Date.now() >>> 0,
    obstacleAttempts = 12,
    slimeGroupCount = 10,
    pocketSize = 3,
    maxSolveDepth = 24,
    maxSolveStates = 4000,
    maxGenerationAttempts = 80,
  } = options;

  for (let attempt = 0; attempt < maxGenerationAttempts; attempt++) {
    const rng = mulberry32((seed + attempt * 7919) >>> 0);
    const layout = buildCandidateLayout(width, height, rng, obstacleAttempts, slimeGroupCount, pocketSize);
    if (!layout) continue;

    let board: Board;
    try {
      board = parseBoard(layout);
    } catch {
      continue;
    }
    if (board.cells.length === 0) continue;

    const result = solve(board, { maxDepth: maxSolveDepth, maxStates: maxSolveStates });
    if (result.solvable) {
      return { board, layout, seed, attempts: attempt + 1, solution: result.moves ?? [] };
    }
  }

  throw new Error(`generateSolvableLevel: ${maxGenerationAttempts}回試しても解ける盤面を生成できませんでした`);
}
