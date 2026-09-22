import { describe, expect, it } from 'vitest';
import { CANONICAL_ANGLE, CW_ORDER, nextDir, shortestDelta } from '../src/ui/tilt';
import type { Dir } from '../src/core/types';

describe('shortestDelta', () => {
  it('隣接する方向への遷移は常に+90（down→right→up→left→downの一方向）', () => {
    expect(shortestDelta(CANONICAL_ANGLE.down, CANONICAL_ANGLE.right)).toBe(90);
    expect(shortestDelta(CANONICAL_ANGLE.right, CANONICAL_ANGLE.up)).toBe(90);
    expect(shortestDelta(CANONICAL_ANGLE.up, CANONICAL_ANGLE.left)).toBe(90);
    expect(shortestDelta(CANONICAL_ANGLE.left, CANONICAL_ANGLE.down)).toBe(90); // 270→360(=0) の境界をまたぐ
  });

  it('逆方向への遷移は常に-90', () => {
    expect(shortestDelta(CANONICAL_ANGLE.down, CANONICAL_ANGLE.left)).toBe(-90);
    expect(shortestDelta(CANONICAL_ANGLE.left, CANONICAL_ANGLE.up)).toBe(-90);
  });

  it('正反対の方向への遷移は180', () => {
    expect(shortestDelta(CANONICAL_ANGLE.down, CANONICAL_ANGLE.up)).toBe(180);
    expect(shortestDelta(CANONICAL_ANGLE.right, CANONICAL_ANGLE.left)).toBe(180);
  });

  it('同じ方向なら0', () => {
    expect(shortestDelta(CANONICAL_ANGLE.down, CANONICAL_ANGLE.down)).toBe(0);
  });

  it('累積回転させても常に90度刻みで滑らかに繋がる（0↔360境界をまたいでも破綻しない）', () => {
    const order: (keyof typeof CANONICAL_ANGLE)[] = ['down', 'right', 'up', 'left', 'down', 'right'];
    let rotation = CANONICAL_ANGLE.down;
    for (let i = 1; i < order.length; i++) {
      const delta = shortestDelta(CANONICAL_ANGLE[order[i - 1]], CANONICAL_ANGLE[order[i]]);
      expect(Math.abs(delta)).toBe(90);
      rotation += delta;
    }
    expect(rotation).toBe(CANONICAL_ANGLE.down + 90 * (order.length - 1));
  });
});

describe('nextDir', () => {
  it('cwはCW_ORDERの並び通りに1つ進む', () => {
    for (let i = 0; i < CW_ORDER.length; i++) {
      const current = CW_ORDER[i];
      const expected = CW_ORDER[(i + 1) % CW_ORDER.length];
      expect(nextDir(current, 'cw')).toBe(expected);
    }
  });

  it('ccwはCW_ORDERの並び通りに1つ戻る', () => {
    for (let i = 0; i < CW_ORDER.length; i++) {
      const current = CW_ORDER[i];
      const expected = CW_ORDER[(i - 1 + CW_ORDER.length) % CW_ORDER.length];
      expect(nextDir(current, 'ccw')).toBe(expected);
    }
  });

  it('cw/ccwは互いに逆操作（cwしてccwすれば元に戻る）', () => {
    const dirs: Dir[] = ['down', 'right', 'up', 'left'];
    for (const d of dirs) {
      expect(nextDir(nextDir(d, 'cw'), 'ccw')).toBe(d);
      expect(nextDir(nextDir(d, 'ccw'), 'cw')).toBe(d);
    }
  });

  it('nextDirが返す方向は、必ずCANONICAL_ANGLE上でcw=+90/ccw=-90に対応する', () => {
    const dirs: Dir[] = ['down', 'right', 'up', 'left'];
    for (const d of dirs) {
      const cwDelta = shortestDelta(CANONICAL_ANGLE[d], CANONICAL_ANGLE[nextDir(d, 'cw')]);
      const ccwDelta = shortestDelta(CANONICAL_ANGLE[d], CANONICAL_ANGLE[nextDir(d, 'ccw')]);
      expect(cwDelta).toBe(90);
      expect(ccwDelta).toBe(-90);
    }
  });
});
