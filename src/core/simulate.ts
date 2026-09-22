// core/ の唯一の公開エントリポイント（arch.md §6.3）。
// board を破壊的に更新しつつ、再生用のタイムライン(phases)を同時に返す。
// 描画層はこの phases を再生するだけでよく、core はアニメーション完了を待たない。

import type { Board, Dir } from './types';
import type { Tick } from './gravity';
import { stepOnce } from './gravity';
import type { Cluster } from './clusters';
import { collectDrained } from './drain';
import { scoreOf } from './score';

export type Phase = { kind: 'settle'; ticks: Tick[] } | { kind: 'drain'; clusters: Cluster[]; gained: number };

export interface TurnResult {
  phases: Phase[];
  gainedScore: number;
  cleared: boolean;
}

/**
 * 1回の重力入力の全結果を計算する。
 *
 * 回収判定は「完全に停止してから」ではなく、**毎tickの直後**に行う。移動中に塊の一部が
 * 回収口へ触れた瞬間、その場で塊全体を回収する（停止を待たない）。回収でセルが消えると
 * 残りのセルの連結・支えが変わるため、そのままtickを続ければカスケードも自然に内包される。
 * spec.md §12「到達した場合」を、最終静止位置ではなく移動過程全体に対して解釈している。
 */
export function simulateTurn(board: Board, dir: Dir): TurnResult {
  const phases: Phase[] = [];
  let gainedScore = 0;
  let pendingTicks: Tick[] = [];
  let tickIndex = 0;

  const flushSettle = () => {
    if (pendingTicks.length > 0) {
      phases.push({ kind: 'settle', ticks: pendingTicks });
      pendingTicks = [];
    }
  };

  const tryDrain = () => {
    const drained = collectDrained(board);
    if (drained.length === 0) return;
    flushSettle();
    const gained = drained.reduce((sum, c) => sum + scoreOf(c.size), 0);
    gainedScore += gained;
    phases.push({ kind: 'drain', clusters: drained, gained });
    tickIndex = 0; // 盤面が変わったので、左右優先の偶奇もこの時点から仕切り直す
  };

  tryDrain(); // 入力前から回収口に触れている塊があれば、動かす前に回収する

  const safetyLimit = board.width * board.height * board.width * board.height; // 十分に大きい安全弁
  for (let guard = 0; guard < safetyLimit; guard++) {
    const tick = stepOnce(board, dir, tickIndex++);
    if (!tick) break;
    pendingTicks.push(tick);
    tryDrain();
  }
  flushSettle();

  return { phases, gainedScore, cleared: board.cells.length === 0 };
}
