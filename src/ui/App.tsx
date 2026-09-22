import { useMemo, useRef, useState } from 'react';
import type { Board, Dir } from '../core/types';
import { Terrain } from '../core/types';
import { parseBoard, xOf, yOf } from '../core/board';
import { settle, type Tick } from '../core/gravity';
import { findClusters } from '../core/clusters';
import { buildDemoLayout } from './demoLayout';
import { useKeyboard } from './useKeyboard';

const WIDTH = 20;
const HEIGHT = 20;
const TICK_MS = 55;

interface ViewCell {
  id: number;
  x: number;
  y: number;
}

function toView(board: Board): ViewCell[] {
  return board.cells.map((c) => ({ id: c.id, x: xOf(board, c.idx), y: yOf(board, c.idx) }));
}

/**
 * 確定済みの Tick 列を、ビュー状態の時系列として再生する。
 * board は既に最終状態まで進んでいる前提で、view 側だけを tick ごとに追従させる。
 * これは arch.md §6.3, §8.2 の「core はアニメーション完了を待たない」設計をM1で先取りしたもの。
 * 本実装は game/playback.ts（M2）へ引き継がれる想定の仮実装。
 */
function playTicks(
  ticks: Tick[],
  board: Board,
  startView: ViewCell[],
  onFrame: (view: ViewCell[]) => void,
  onDone: () => void,
): () => void {
  const byId = new Map(startView.map((v) => [v.id, { ...v }]));
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function step() {
    if (i >= ticks.length) {
      onDone();
      return;
    }
    const tick = ticks[i++];
    for (const move of tick.moves) {
      const v = byId.get(move.cellId);
      if (v) {
        v.x = xOf(board, move.to);
        v.y = yOf(board, move.to);
      }
    }
    onFrame([...byId.values()]);
    timer = setTimeout(step, TICK_MS);
  }
  step();

  return () => {
    if (timer) clearTimeout(timer);
  };
}

export default function App() {
  const boardRef = useRef<Board | null>(null);
  if (!boardRef.current) {
    boardRef.current = parseBoard(buildDemoLayout(WIDTH, HEIGHT));
  }
  const board = boardRef.current;

  const [view, setView] = useState<ViewCell[]>(() => toView(board));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [clusterCount, setClusterCount] = useState(() => findClusters(board).length);

  function input(dir: Dir) {
    if (busyRef.current) return;
    const ticks = settle(board, dir);
    if (ticks.length === 0) return; // 何も動かない入力は無視する（arch.md §7）
    busyRef.current = true;
    setBusy(true);
    playTicks(ticks, board, view, setView, () => {
      busyRef.current = false;
      setBusy(false);
      setClusterCount(findClusters(board).length);
    });
  }

  useKeyboard(input);

  const terrainTiles = useMemo(() => {
    const tiles: { idx: number; x: number; y: number; kind: 'wall' | 'obstacle' }[] = [];
    for (let idx = 0; idx < board.terrain.length; idx++) {
      const t = board.terrain[idx];
      if (t === Terrain.Wall) tiles.push({ idx, x: xOf(board, idx), y: yOf(board, idx), kind: 'wall' });
      else if (t === Terrain.Obstacle) tiles.push({ idx, x: xOf(board, idx), y: yOf(board, idx), kind: 'obstacle' });
    }
    return tiles;
  }, [board]);

  return (
    <div className="app">
      <div className="hint">
        M1 PoC — 矢印キー / WASD で重力方向を切り替え（塊: {clusterCount}）
      </div>

      <div className="board" style={{ ['--cols' as string]: WIDTH, ['--rows' as string]: HEIGHT } as React.CSSProperties}>
        {terrainTiles.map((t) => (
          <div
            key={t.idx}
            className={`tile ${t.kind}`}
            style={{ transform: `translate(calc(var(--cell) * ${t.x}), calc(var(--cell) * ${t.y}))` }}
          />
        ))}

        {view.map((cell) => (
          <div
            key={cell.id}
            className="slime"
            style={{ transform: `translate(calc(var(--cell) * ${cell.x}), calc(var(--cell) * ${cell.y}))` }}
          />
        ))}
      </div>

      <div className="controls">
        <button aria-label="上方向へ重力" disabled={busy} onPointerDown={() => input('up')}>
          ↑
        </button>
        <div className="controls-row">
          <button aria-label="左方向へ重力" disabled={busy} onPointerDown={() => input('left')}>
            ←
          </button>
          <button aria-label="下方向へ重力" disabled={busy} onPointerDown={() => input('down')}>
            ↓
          </button>
          <button aria-label="右方向へ重力" disabled={busy} onPointerDown={() => input('right')}>
            →
          </button>
        </div>
      </div>
    </div>
  );
}
