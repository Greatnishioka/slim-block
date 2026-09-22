// 確定済みの TurnResult を、ビュー状態の時系列として再生する（arch.md §6.3, §8.2）。
// core はアニメーション完了を待たない設計なので、ここで再生する内容はすでに確定済みの
// 結果であり、速度を変えてもスキップしても core 側の状態には一切影響しない。
//
// M2では演出を最小限にする（arch.md §12 M2: 「アニメーションはまだtickを等速で描くだけで
// よい」）。吸い込み演出の強化（塊サイズに応じた変形・シェイク等）はM4で行う。

import type { Board } from '../core/types';
import type { Phase, TurnResult } from '../core/simulate';
import { xOf, yOf } from '../core/board';

export interface ViewCell {
  id: number;
  x: number;
  y: number;
  draining?: boolean;
}

const TICK_MS = 55;
const DRAIN_MS = 220;
const MAX_SETTLE_MS = 700; // 塊が大きく tick 数が多くても、総再生時間はここに収める

function countTicks(phases: Phase[]): number {
  return phases.reduce((sum, p) => (p.kind === 'settle' ? sum + p.ticks.length : sum), 0);
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
    for (const cluster of phase.clusters) {
      for (const id of cluster.cellIds) {
        const v = byId.get(id);
        if (v) v.draining = true;
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
    }, DRAIN_MS);
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
