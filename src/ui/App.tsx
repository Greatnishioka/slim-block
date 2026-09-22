import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board } from '../core/types';
import { Terrain } from '../core/types';
import { xOf, yOf } from '../core/board';
import { generateSolvableLevel, type GeneratedLevel } from '../core/generate';
import { useKeyboard } from './useKeyboard';
import { useGameSession } from '../game/useGameSession';

const WIDTH = 20;
const HEIGHT = 20;

export default function App() {
  const [seed, setSeed] = useState(() => Date.now() >>> 0);
  return <Game key={seed} seed={seed} onRegenerate={() => setSeed(Date.now() >>> 0)} />;
}

/**
 * seedが変わったら key 経由で丸ごと再マウントされ、生成状態も useGameSession の内部状態も
 * ゼロから作り直される（React の「keyでリセットする」定石。arch.md の状態機械はそのまま活かせる）。
 */
function Game({ seed, onRegenerate }: { seed: number; onRegenerate: () => void }) {
  const [level, setLevel] = useState<GeneratedLevel | null>(null);

  useEffect(() => {
    // useEffect内で行うことで、生成が終わるまで先に「生成中…」を描画できる。
    // solverによる検証は最大でも1秒未満で終わる想定（core/generate.ts参照）。
    const generated = generateSolvableLevel({ width: WIDTH, height: HEIGHT, seed });
    setLevel(generated);
  }, [seed]);

  if (!level) {
    return (
      <div className="app">
        <div className="hint">盤面を生成中…</div>
      </div>
    );
  }

  return <GameBoard board={level.board} seed={seed} onRegenerate={onRegenerate} />;
}

function GameBoard({ board, seed, onRegenerate }: { board: Board; seed: number; onRegenerate: () => void }) {
  const boardRef = useRef(board);
  const { status, view, score, moves, input, retry } = useGameSession(boardRef.current);
  useKeyboard(input, retry);

  const terrainTiles = useMemo(() => {
    const tiles: { idx: number; x: number; y: number; kind: 'wall' | 'obstacle' | 'drain' }[] = [];
    for (let idx = 0; idx < boardRef.current.terrain.length; idx++) {
      const t = boardRef.current.terrain[idx];
      if (t === Terrain.Wall) tiles.push({ idx, x: xOf(boardRef.current, idx), y: yOf(boardRef.current, idx), kind: 'wall' });
      else if (t === Terrain.Obstacle)
        tiles.push({ idx, x: xOf(boardRef.current, idx), y: yOf(boardRef.current, idx), kind: 'obstacle' });
      else if (t === Terrain.Drain) tiles.push({ idx, x: xOf(boardRef.current, idx), y: yOf(boardRef.current, idx), kind: 'drain' });
    }
    return tiles;
  }, []);

  const busy = status !== 'IDLE';

  return (
    <div className="app">
      <div className="hud">
        <span>SCORE {score.toLocaleString()}</span>
        <span>MOVES {moves}</span>
        <span className="seed" title="この盤面の乱数シード">
          #{seed}
        </span>
      </div>

      <div
        className="board"
        style={{ ['--cols' as string]: WIDTH, ['--rows' as string]: HEIGHT } as React.CSSProperties}
      >
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
            className={`slime${cell.draining ? ' draining' : ''}`}
            style={{ transform: `translate(calc(var(--cell) * ${cell.x}), calc(var(--cell) * ${cell.y}))` }}
          />
        ))}

        {status === 'CLEARED' && (
          <div className="cleared-overlay">
            <div>CLEAR!</div>
            <button onPointerDown={retry}>もう一度遊ぶ (R)</button>
            <button onPointerDown={onRegenerate}>新しい盤面</button>
          </div>
        )}

        {status === 'STUCK' && (
          <div className="cleared-overlay stuck">
            <div>詰みました…</div>
            <p>残りのセルからは、もう全回収できません</p>
            <button onPointerDown={retry}>リトライ (R)</button>
            <button onPointerDown={onRegenerate}>新しい盤面</button>
          </div>
        )}
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
        <div className="controls-row">
          <button className="retry" onPointerDown={retry}>
            リトライ (R)
          </button>
          <button className="retry" onPointerDown={onRegenerate}>
            新しい盤面
          </button>
        </div>
      </div>
    </div>
  );
}
