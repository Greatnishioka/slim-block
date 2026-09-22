import { useEffect, useRef } from 'react';
import type { Dir } from '../core/types';

const KEY_MAP: Record<string, Dir> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

/**
 * 方向キー入力を onDir に渡す。キーリピートは無視し、方向キーのみ preventDefault する
 * （ページスクロールの抑止。arch.md §10）。
 * onDir は ref 経由で毎レンダー最新化し、リスナーの張り直しは行わない。
 */
export function useKeyboard(onDir: (dir: Dir) => void): void {
  const handlerRef = useRef(onDir);
  useEffect(() => {
    handlerRef.current = onDir;
  }, [onDir]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const dir = KEY_MAP[e.code];
      if (!dir) return;
      e.preventDefault();
      handlerRef.current(dir);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
