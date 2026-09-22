// ゲーム状態機械（arch.md §7）。可変状態を持つのはこのフックだけ。
//
//   IDLE ──入力──> ANIMATING ──> IDLE
//    ↑                          │
//    ├────────── リトライ ───────┤
//    │                          ├─> CLEARED
//    │                          └─> STUCK（残りのセルからは、もうクリアできないと判明）
//    └───────────────────────────┘
//
// Board は ref に置き、React の state にはしない（Uint8Array/可変配列を持つ構造で、
// Reactの不変性前提と噛み合わないため）。Reactが描くのは view（ViewCell[]）だけ。
//
// generate.ts のソルバーが保証するのは「初期盤面から見て、全回収できる手順が存在する」
// ことだけである。プレイヤーがその手順から外れた操作をした場合、途中の局面がもう
// 回収不可能になっていることはあり得る（Sokoban等と同じ）。それを黙って気づかせない
// のは不親切なので、残りセルが少ないときだけ毎手ソルバーで再検証し、詰みを検知する。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board, Dir } from '../core/types';
import { cloneBoard } from '../core/board';
import { simulateTurn } from '../core/simulate';
import { solve } from '../core/solver';
import { playTurn, toView, type ViewCell } from './playback';

export type SessionStatus = 'IDLE' | 'ANIMATING' | 'CLEARED' | 'STUCK';

// 残りセルが多いうちは状態空間が大きく毎手ソルバーを回すと重くなるため、
// 少なくなってから（＝コストが小さくなってから）だけ詰み検知を行う。
const STUCK_CHECK_MAX_CELLS = 10;

export interface GameSession {
  board: Board;
  status: SessionStatus;
  view: ViewCell[];
  score: number;
  moves: number;
  input: (dir: Dir) => void;
  retry: () => void;
}

export function useGameSession(initialBoard: Board): GameSession {
  const boardRef = useRef<Board>(initialBoard);
  const snapshotRef = useRef<Board>(cloneBoard(initialBoard));
  const statusRef = useRef<SessionStatus>('IDLE');
  const viewRef = useRef<ViewCell[]>(toView(initialBoard));
  const cancelRef = useRef<(() => void) | null>(null);

  const [status, setStatusState] = useState<SessionStatus>('IDLE');
  const [view, setViewState] = useState<ViewCell[]>(viewRef.current);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);

  const setStatus = useCallback((s: SessionStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const setView = useCallback((v: ViewCell[]) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  const input = useCallback(
    (dir: Dir) => {
      if (statusRef.current !== 'IDLE') return;

      const board = boardRef.current;
      const result = simulateTurn(board, dir);
      if (result.phases.length === 0) return; // 何も動かない入力は手数を消費しない（arch.md §7）

      setMoves((m) => m + 1);
      setStatus('ANIMATING');

      cancelRef.current = playTurn(result, board, viewRef.current, {
        onFrame: setView,
        onScore: (gained) => setScore((s) => s + gained),
        onDone: () => {
          if (result.cleared) {
            setStatus('CLEARED');
            return;
          }
          if (board.cells.length <= STUCK_CHECK_MAX_CELLS) {
            const check = solve(board, { maxDepth: 20, maxStates: 3000 });
            if (!check.solvable) {
              setStatus('STUCK');
              return;
            }
          }
          setStatus('IDLE');
        },
      });
    },
    [setStatus, setView],
  );

  const retry = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    const fresh = cloneBoard(snapshotRef.current);
    boardRef.current = fresh;
    setView(toView(fresh));
    setScore(0);
    setMoves(0);
    setStatus('IDLE');
  }, [setStatus, setView]);

  useEffect(() => () => cancelRef.current?.(), []);

  return { board: boardRef.current, status, view, score, moves, input, retry };
}
