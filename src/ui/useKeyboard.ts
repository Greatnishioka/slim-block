import { useEffect, useRef } from 'react';
import type { Turn } from './tilt';

// 「4方向から選ぶ」のではなく「今の状態から箱を左右に回す」操作にしたので、
// キーも左右（および回転の向きが直感的に対応するA/D）だけを扱う。
const KEY_MAP: Record<string, Turn> = {
  ArrowLeft: 'ccw',
  KeyA: 'ccw',
  ArrowRight: 'cw',
  KeyD: 'cw',
};

/**
 * 左右キー入力を onRotate に、'R' キーを onRetry に渡す。キーリピートは無視し、
 * 左右キーのみ preventDefault する（ページスクロールの抑止。arch.md §10）。
 * ハンドラは ref 経由で毎レンダー最新化し、リスナーの張り直しは行わない。
 */
export function useKeyboard(onRotate: (turn: Turn) => void, onRetry?: () => void): void {
  const rotateRef = useRef(onRotate);
  const retryRef = useRef(onRetry);
  useEffect(() => {
    rotateRef.current = onRotate;
    retryRef.current = onRetry;
  }, [onRotate, onRetry]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.code === 'KeyR') {
        retryRef.current?.();
        return;
      }
      const turn = KEY_MAP[e.code];
      if (!turn) return;
      e.preventDefault();
      rotateRef.current(turn);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
