// 「この盤面は本当に全回収できるか」を実際に探索して確認するソルバー。
//
// 手の選択肢は常に4方向だけで、1手ごとにセルは減るか同じ数のまま再配置されるだけ
// （増えることはない）。そのため状態空間は見た目ほど大きくならず、盤面重複を
// キー化して除外する探索で現実的な時間内に解ける（arch.md §21の決定論的シミュレーション
// を、探索にもそのまま使えるのが利点）。
//
// 探索はDFS（スタック）＋「その手でセルがより多く減る方向を優先する」ヒューリスティックを
// 使う。全滅させるパズルなので、貪欲に近い経路を先に試す方がBFSより大幅に速く解を見つける
// （実測: BFSでは手数10の盤面で3秒台かかるケースがあったが、この方式ではほぼ即時）。
//
// 生成した盤面が本当に「詰まない」ことを保証するのは、このソルバーで実際に
// クリア手順を1つ見つけられた場合のみとする。

import type { Board, Dir } from './types';
import { cloneBoard } from './board';
import { simulateTurn } from './simulate';

const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

function stateKey(board: Board): string {
  // 占有idxの集合だけが状態を決める（セルのidは無関係）。
  const idxs = board.cells.map((c) => c.idx).sort((a, b) => a - b);
  return idxs.join(',');
}

export interface SolveResult {
  solvable: boolean;
  /** 実際にクリアできる手順の一例（最短である保証はない）。 */
  moves?: Dir[];
  /** 探索した状態数（デバッグ・チューニング用）。 */
  statesExplored: number;
}

export interface SolveOptions {
  maxDepth?: number;
  maxStates?: number;
}

interface Frame {
  board: Board;
  moves: Dir[];
}

/** 全セル回収までの手順が存在するかを探索する。 */
export function solve(initialBoard: Board, options: SolveOptions = {}): SolveResult {
  const { maxDepth = 40, maxStates = 60000 } = options;

  const start = cloneBoard(initialBoard);
  if (start.cells.length === 0) return { solvable: true, moves: [], statesExplored: 0 };

  const visited = new Set<string>([stateKey(start)]);
  let statesExplored = 1;

  const stack: Frame[] = [{ board: start, moves: [] }];

  while (stack.length > 0) {
    const { board, moves } = stack.pop()!;
    if (moves.length >= maxDepth) continue;

    const candidates: { dir: Dir; board: Board; removed: number }[] = [];

    for (const dir of DIRS) {
      if (statesExplored >= maxStates) return { solvable: false, statesExplored };

      const candidate = cloneBoard(board);
      const before = candidate.cells.length;
      const result = simulateTurn(candidate, dir);
      if (result.phases.length === 0) continue; // 何も変わらない手は探索する価値がない

      const nextMoves = [...moves, dir];
      if (candidate.cells.length === 0) {
        return { solvable: true, moves: nextMoves, statesExplored };
      }

      const key = stateKey(candidate);
      if (visited.has(key)) continue;
      visited.add(key);
      statesExplored++;
      candidates.push({ dir, board: candidate, removed: before - candidate.cells.length });
    }

    // スタック(LIFO)なので、最後にpushした手が次にpopされる。
    // 「セルをより多く減らす手」を昇順ソートで最後にpushし、優先的に試す。
    candidates.sort((a, b) => a.removed - b.removed);
    for (const c of candidates) {
      stack.push({ board: c.board, moves: [...moves, c.dir] });
    }
  }

  return { solvable: false, statesExplored };
}
