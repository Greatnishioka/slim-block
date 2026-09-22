// 回収判定（arch.md §6.2）。
// 安定（settle完了）した盤面に対して、1セルでも回収口に触れている塊は塊全体を回収する
// （spec.md §12「その塊全体を回収対象とする」）。

import type { Board } from './types';
import type { Cluster } from './clusters';
import { findClusters } from './clusters';
import { removeCells } from './board';

/** 回収口に触れている塊をすべて盤面から取り除き、回収した塊の一覧を返す。 */
export function collectDrained(board: Board): Cluster[] {
  const clusters = findClusters(board);
  const drained = clusters.filter((c) => c.touchesDrain);
  if (drained.length === 0) return [];

  const ids = new Set<number>();
  for (const cluster of drained) {
    for (const id of cluster.cellIds) ids.add(id);
  }
  removeCells(board, ids);

  return drained;
}
