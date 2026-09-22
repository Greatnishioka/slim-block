// 障害物・スライム・回収口をランダム生成し、solver.ts で「実際に全回収できる手順が
// 存在する」ことを確認できた盤面だけを返す。見つからなければ盤面を作り直す。
// これにより「詰む盤面」が生成されることはない（ソルバーが見つけた手順がその証拠になる）。

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

/** 障害物・回収口・スライムをランダム配置した候補レイアウトを1つ作る（解けるかは未検証）。 */
function buildCandidateLayout(
  width: number,
  height: number,
  rng: Rng,
  obstacleAttempts: number,
  slimeGroupCount: number,
): string[] | null {
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

  // 回収口: 空いているマスからランダムに1つ選ぶ。
  const drainCandidates: { x: number; y: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] === '.') drainCandidates.push({ x, y });
    }
  }
  if (drainCandidates.length === 0) return null;
  const drain = pick(rng, drainCandidates);
  grid[drain.y][drain.x] = '@';

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
    maxSolveDepth = 24,
    maxSolveStates = 4000,
    maxGenerationAttempts = 80,
  } = options;

  for (let attempt = 0; attempt < maxGenerationAttempts; attempt++) {
    const rng = mulberry32((seed + attempt * 7919) >>> 0);
    const layout = buildCandidateLayout(width, height, rng, obstacleAttempts, slimeGroupCount);
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
