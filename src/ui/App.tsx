import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Board, Dir } from '../core/types';
import { Terrain } from '../core/types';
import { xOf, yOf } from '../core/board';
import { generateSolvableLevel, type GeneratedLevel } from '../core/generate';
import { useKeyboard } from './useKeyboard';
import { useGameSession } from '../game/useGameSession';
import { CANONICAL_ANGLE, nextDir, shortestDelta, type Turn } from './tilt';

const WIDTH = 20;
const HEIGHT = 20;
const TILT_MS = 320; // styles.css の .board { transition: transform 320ms } と合わせる

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

  // 「重力が回る」のではなく「箱そのものが傾く」という見せ方にするための回転角度。
  // ゲームロジックには一切関与しない、純粋に表示上の状態（ui/tilt.ts）。
  const [rotation, setRotation] = useState(0);
  const lastDirRef = useRef<Dir>('down');
  const [tilting, setTilting] = useState(false);
  const tiltTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 「4方向から選ぶ」のではなく「今の状態から箱を左右に90度ずつ回す」操作にする。
  // 次の重力方向は、今の方向と回す向きから一意に決まる（ui/tilt.ts の nextDir）。
  const requestRotate = useCallback(
    (turn: Turn) => {
      if (tilting || status !== 'IDLE') return;

      const dir = nextDir(lastDirRef.current, turn);
      const delta = shortestDelta(CANONICAL_ANGLE[lastDirRef.current], CANONICAL_ANGLE[dir]);
      lastDirRef.current = dir;

      setRotation((r) => r + delta);
      setTilting(true);
      tiltTimerRef.current = setTimeout(() => {
        setTilting(false);
        input(dir);
      }, TILT_MS);
    },
    [tilting, status, input],
  );

  const requestRetry = useCallback(() => {
    if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
    setTilting(false);
    setRotation(0);
    lastDirRef.current = 'down';
    retry();
  }, [retry]);

  useKeyboard(requestRotate, requestRetry);
  useEffect(() => () => {
    if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
  }, []);

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

  const busy = tilting || status !== 'IDLE';

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
        className="board-frame"
        style={{ ['--cols' as string]: WIDTH, ['--rows' as string]: HEIGHT } as React.CSSProperties}
      >
        <div className="board" style={{ transform: `rotate(${rotation}deg)` }}>
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
        </div>

        {status === 'CLEARED' && (
          <div className="cleared-overlay">
            <div>CLEAR!</div>
            <button onPointerDown={requestRetry}>もう一度遊ぶ (R)</button>
            <button onPointerDown={onRegenerate}>新しい盤面</button>
          </div>
        )}

        {status === 'STUCK' && (
          <div className="cleared-overlay stuck">
            <div>詰みました…</div>
            <p>残りのセルからは、もう全回収できません</p>
            <button onPointerDown={requestRetry}>リトライ (R)</button>
            <button onPointerDown={onRegenerate}>新しい盤面</button>
          </div>
        )}
      </div>

      <div className="controls">
        <div className="controls-row">
          <button aria-label="箱を反時計回りに90度回転" disabled={busy} onPointerDown={() => requestRotate('ccw')}>
            ↺
          </button>
          <button aria-label="箱を時計回りに90度回転" disabled={busy} onPointerDown={() => requestRotate('cw')}>
            ↻
          </button>
        </div>
        <div className="controls-row">
          <button className="retry" onPointerDown={requestRetry}>
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
