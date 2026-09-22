// ★ 重力シミュレーション本体（arch.md §5）。
// 「砂＋横流れモデル」— 塊は剛体として動かず、セル単位で直進または横流れするだけ。
// 融合・分裂は専用処理を持たない。移動後に clusters.ts が連結成分を数え直すだけで表現される（arch.md §1）。

import type { Board, Dir, SlimeCell } from './types';
import { DELTA } from './types';
import { isOpen, isOpenLateral, moveCell, xOf, yOf } from './board';

export interface Move {
  cellId: number;
  from: number;
  to: number;
}

export interface Tick {
  moves: Move[];
}

/**
 * 重力方向にもっとも進んでいる順にセルを並べる。
 * 下流側から動かすことで、積み重なったセル列が1 tickで列ごと1マス進む（arch.md §5.2）。
 * 同値の並びは idx 昇順で固定し、cells配列の格納順に結果が依存しないようにする（決定論）。
 */
function scanOrder(board: Board, dir: Dir): SlimeCell[] {
  const { dx, dy } = DELTA[dir];
  return [...board.cells].sort((a, b) => {
    const ax = xOf(board, a.idx);
    const ay = yOf(board, a.idx);
    const bx = xOf(board, b.idx);
    const by = yOf(board, b.idx);
    const aKey = dx !== 0 ? ax * dx : ay * dy;
    const bKey = dx !== 0 ? bx * dx : by * dy;
    if (aKey !== bKey) return bKey - aKey; // 降順：最も進んでいるセルを先に
    return a.idx - b.idx; // タイブレーク
  });
}

/**
 * 盤面全体を1マスぶん進める。
 * 各セルについて (1)直進 (2)横流れ の順に判定し、動いたセルがあれば Tick を返す。
 * 動けるセルが1つもなければ null（settle の終了条件）。
 * arch.md §5.1, §5.4
 */
export function stepOnce(board: Board, dir: Dir, tickIndex: number): Tick | null {
  const { dx, dy } = DELTA[dir];
  const fwd = dy * board.width + dx;
  const side = dx === 0 ? 1 : board.width;
  // tickの偶奇で優先側を切り替え、決定論を保ちつつ山が左右対称に崩れるようにする（arch.md §5.3）
  const preferLeft = tickIndex % 2 === 0;
  const sides = preferLeft ? [-side, side] : [side, -side];

  const moves: Move[] = [];

  for (const cell of scanOrder(board, dir)) {
    const from = cell.idx;

    // 1. 直進
    if (isOpen(board, from + fwd)) {
      moveCell(board, cell, from + fwd);
      moves.push({ cellId: cell.id, from, to: from + fwd });
      continue;
    }

    // 2. 横流れ（真横が空いていることを条件に含めることで、壁の角を斜めにすり抜けるのを防ぐ）
    for (const s of sides) {
      const diagonal = from + s + fwd;
      if (isOpenLateral(board, from, s) && isOpen(board, diagonal)) {
        moveCell(board, cell, diagonal);
        moves.push({ cellId: cell.id, from, to: diagonal });
        break;
      }
    }
  }

  return moves.length > 0 ? { moves } : null;
}

/**
 * 動けるセルがなくなるまで tick を繰り返す。1回の重力入力の完全な結果。
 * 安全弁: 盤面サイズの2倍を超えて tick が続くことは理論上ないはずだが、
 * ロジックの不備で無限ループに陥った場合に停止させる（arch.md §5.4, §11「停止性」）。
 */
export function settle(board: Board, dir: Dir): Tick[] {
  const ticks: Tick[] = [];
  const limit = board.width * board.height * 2;
  for (let i = 0; i < limit; i++) {
    const t = stepOnce(board, dir, i);
    if (!t) break;
    ticks.push(t);
  }
  return ticks;
}
