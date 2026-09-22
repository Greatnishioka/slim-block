// 連結成分の計算（arch.md §6.1）。
// 上下左右4近傍のみで連結を判定する。斜めだけで接するセルは同じ塊として扱わない（spec.md §7.2）。
// 「塊」という単位はここにしか存在しない。移動ロジック（gravity.ts）はセル単位でしか動かず、
// 塊は移動が終わった後にこの関数が数え直した結果に過ぎない（arch.md §1）。

import type { Board, SlimeCell } from './types';
import { Terrain } from './types';
import { xOf, yOf } from './board';

export interface Cluster {
  cellIds: number[]; // idx昇順
  size: number;
  touchesDrain: boolean;
}

function neighborSteps(board: Board, idx: number): number[] {
  const x = xOf(board, idx);
  const y = yOf(board, idx);
  const steps: number[] = [];
  if (x > 0) steps.push(-1);
  if (x < board.width - 1) steps.push(1);
  if (y > 0) steps.push(-board.width);
  if (y < board.height - 1) steps.push(board.width);
  return steps;
}

/**
 * 現在の board.cells から連結成分（＝スライム塊）を求める。
 * 探索開始点・結果の配列順ともに idx 昇順で固定し、決定論を保つ（arch.md §6.1）。
 */
export function findClusters(board: Board): Cluster[] {
  const byIdx = new Map<number, SlimeCell>();
  for (const cell of board.cells) byIdx.set(cell.idx, cell);

  const startPoints = [...board.cells].sort((a, b) => a.idx - b.idx);
  const visited = new Set<number>(); // by cell.id
  const clusters: Cluster[] = [];

  for (const start of startPoints) {
    if (visited.has(start.id)) continue;

    const queue: SlimeCell[] = [start];
    visited.add(start.id);
    const cellIds: number[] = [];
    let touchesDrain = false;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      cellIds.push(cur.id);
      if ((board.terrain[cur.idx] as Terrain) === Terrain.Drain) touchesDrain = true;

      for (const step of neighborSteps(board, cur.idx)) {
        const neighbor = byIdx.get(cur.idx + step);
        if (neighbor && !visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          queue.push(neighbor);
        }
      }
    }

    cellIds.sort((a, b) => a - b);
    clusters.push({ cellIds, size: cellIds.length, touchesDrain });
  }

  return clusters;
}
