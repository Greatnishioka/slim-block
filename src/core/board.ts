import type { Board, SlimeCell } from './types';
import { Terrain, isSolid } from './types';

export const idxOf = (width: number, x: number, y: number): number => y * width + x;
export const xOf = (board: Board, idx: number): number => idx % board.width;
export const yOf = (board: Board, idx: number): number => Math.floor(idx / board.width);

export const inBounds = (board: Board, x: number, y: number): boolean =>
  x >= 0 && x < board.width && y >= 0 && y < board.height;

/** 範囲内・非Solid・非占有のときだけ true。core全体の唯一の「移動可否」判定。 */
export function isOpen(board: Board, idx: number): boolean {
  if (idx < 0 || idx >= board.terrain.length) return false;
  return !isSolid(board.terrain[idx] as Terrain) && board.occupancy[idx] === -1;
}

/**
 * 重力に直交する方向への1マス（横流れの「真横」判定用）。
 * side が ±1（水平方向）のときは行をまたがないことを確認する。
 * side が ±width（垂直方向）のときは idx の加減算だけで列がずれないので追加チェック不要。
 * arch.md §5.4 の注記に対応。
 */
export function isOpenLateral(board: Board, from: number, side: number): boolean {
  const to = from + side;
  if (Math.abs(side) === 1 && yOf(board, from) !== yOf(board, to)) return false;
  return isOpen(board, to);
}

/** セルを新しい位置へ移動する。occupancy と cell.idx を必ず同時に更新する（arch.md §4）。 */
export function moveCell(board: Board, cell: SlimeCell, toIdx: number): void {
  board.occupancy[cell.idx] = -1;
  cell.idx = toIdx;
  board.occupancy[toIdx] = cell.id;
}

/** 指定した id 集合のセルを盤面から取り除く（回収用。M2で使用）。 */
export function removeCells(board: Board, ids: ReadonlySet<number>): void {
  board.cells = board.cells.filter((cell) => {
    if (!ids.has(cell.id)) return true;
    board.occupancy[cell.idx] = -1;
    return false;
  });
}

/** board を複製する。terrain は不変なので参照を共有してよい。 */
export function cloneBoard(board: Board): Board {
  return {
    width: board.width,
    height: board.height,
    terrain: board.terrain,
    cells: board.cells.map((c) => ({ id: c.id, idx: c.idx })),
    occupancy: board.occupancy.slice(),
  };
}

const TILE_CHARS: Record<string, Terrain> = {
  '.': Terrain.Empty,
  '#': Terrain.Wall,
  X: Terrain.Obstacle,
  '@': Terrain.Drain,
  o: Terrain.Empty, // 'o' はタイルとしては EMPTY。スライムセルは別レイヤーで追加する
};

/**
 * ASCIIレイアウトから Board を生成する。
 * テストとステージ読み込み（game/stage.ts, M3）の両方から使う共通の正式フォーマット
 * （arch.md §9。座標配列ではなくASCIIを採用した理由も同節を参照）。
 *
 *   .  EMPTY
 *   #  WALL
 *   X  OBSTACLE
 *   @  DRAIN
 *   o  EMPTY + スライムセル1個
 *
 * 各行の長さが不一致、または未知の文字が含まれる場合は例外を投げる。
 * 外周がすべて壁であることの検証はここでは行わない（呼び出し側の責務。stage.ts参照）。
 */
export function parseBoard(lines: readonly string[]): Board {
  if (lines.length === 0) throw new Error('parseBoard: レイアウトが空です');
  const height = lines.length;
  const width = lines[0].length;

  for (let y = 0; y < height; y++) {
    if (lines[y].length !== width) {
      throw new Error(`parseBoard: ${y}行目の長さが不一致です（期待 ${width}, 実際 ${lines[y].length}）`);
    }
  }

  const terrain = new Uint8Array(width * height);
  const occupancy = new Int32Array(width * height).fill(-1);
  const cells: SlimeCell[] = [];
  let nextId = 0; // parseBoard呼び出しごとにローカル。同一レイアウトの2回のparseは同一結果になる（決定論）

  for (let y = 0; y < height; y++) {
    const row = lines[y];
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const terrainValue = TILE_CHARS[ch];
      if (terrainValue === undefined) {
        throw new Error(`parseBoard: 未知のタイル '${ch}' (x=${x}, y=${y})`);
      }
      const idx = idxOf(width, x, y);
      terrain[idx] = terrainValue;
      if (ch === 'o') {
        const id = nextId++;
        cells.push({ id, idx });
        occupancy[idx] = id;
      }
    }
  }

  return { width, height, terrain, cells, occupancy };
}
