// 確定済みの TurnResult を、ビュー状態の時系列として再生する（arch.md §6.3, §8.2）。
// core はアニメーション完了を待たない設計なので、ここで再生する内容はすでに確定済みの
// 結果であり、速度を変えてもスキップしても core 側の状態には一切影響しない。

import type { Board } from '../core/types';
import { Terrain } from '../core/types';
import type { Phase, TurnResult } from '../core/simulate';
import { xOf, yOf } from '../core/board';

export interface ViewCell {
  id: number;
  x: number;
  y: number;
  draining?: boolean;
  /** draining中だけ設定。塊のサイズに応じて可変（大きいほど長く。App.tsx側でtransition-durationに使う）。 */
  drainMs?: number;
}

const TICK_MS = 55;
const MAX_SETTLE_MS = 700; // 塊が大きく tick 数が多くても、総再生時間はここに収める

// 吸い込み演出の所要時間。塊が大きいほど長く、ただし上限は設ける（spec.md §13）。
const DRAIN_BASE_MS = 200;
const DRAIN_PER_CELL_MS = 24;
const DRAIN_MAX_MS = 620;

function countTicks(phases: Phase[]): number {
  return phases.reduce((sum, p) => (p.kind === 'settle' ? sum + p.ticks.length : sum), 0);
}

/** 盤面上の回収口タイルの重心。吸い込み演出でスライムが向かう先として使う。 */
function drainTarget(board: Board): { x: number; y: number } | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let idx = 0; idx < board.terrain.length; idx++) {
    if (board.terrain[idx] === Terrain.Drain) {
      sumX += xOf(board, idx);
      sumY += yOf(board, idx);
      count++;
    }
  }
  if (count === 0) return null;
  return { x: sumX / count, y: sumY / count };
}

export interface PlaybackCallbacks {
  onFrame: (view: ViewCell[]) => void;
  onScore?: (gained: number) => void;
  onDone: () => void;
}

/** 再生を開始し、途中キャンセル用の関数を返す。 */
export function playTurn(result: TurnResult, board: Board, startView: ViewCell[], callbacks: PlaybackCallbacks): () => void {
  const byId = new Map(startView.map((v) => [v.id, { ...v }]));
  const ticks = countTicks(result.phases);
  const tickMs = ticks > 0 ? Math.max(18, Math.min(TICK_MS, MAX_SETTLE_MS / ticks)) : TICK_MS;
  const target = drainTarget(board); // 回収口の位置は盤面生成後は不変なので、ここで一度だけ計算すればよい

  let phaseIndex = 0;
  let tickIndex = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const emit = () => callbacks.onFrame([...byId.values()]);

  function runSettleStep(phase: Extract<Phase, { kind: 'settle' }>) {
    const tick = phase.ticks[tickIndex];
    for (const move of tick.moves) {
      const v = byId.get(move.cellId);
      if (v) {
        v.x = xOf(board, move.to);
        v.y = yOf(board, move.to);
      }
    }
    emit();
    tickIndex++;
    if (tickIndex >= phase.ticks.length) {
      phaseIndex++;
      tickIndex = 0;
    }
    timer = setTimeout(step, tickMs);
  }

  function runDrainStep(phase: Extract<Phase, { kind: 'drain' }>) {
    const totalCells = phase.clusters.reduce((sum, c) => sum + c.size, 0);
    const duration = Math.min(DRAIN_MAX_MS, DRAIN_BASE_MS + totalCells * DRAIN_PER_CELL_MS);

    // 触れた塊「全体」を、回収口へ向けて吸い込む。個々のセルがどこにあっても、
    // 全員がこのフェーズで一斉に目標地点へ動きながら縮んで消える（spec.md §12, §13）。
    for (const cluster of phase.clusters) {
      for (const id of cluster.cellIds) {
        const v = byId.get(id);
        if (!v) continue;
        v.draining = true;
        v.drainMs = duration;
        if (target) {
          v.x = target.x;
          v.y = target.y;
        }
      }
    }
    emit();
    callbacks.onScore?.(phase.gained);

    timer = setTimeout(() => {
      for (const cluster of phase.clusters) {
        for (const id of cluster.cellIds) byId.delete(id);
      }
      emit();
      phaseIndex++;
      step();
    }, duration);
  }

  function step() {
    if (cancelled) return;
    const phase = result.phases[phaseIndex];
    if (!phase) {
      callbacks.onDone();
      return;
    }
    if (phase.kind === 'settle') runSettleStep(phase);
    else runDrainStep(phase);
  }

  step();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

export function toView(board: Board): ViewCell[] {
  return board.cells.map((c) => ({ id: c.id, x: xOf(board, c.idx), y: yOf(board, c.idx) }));
}
