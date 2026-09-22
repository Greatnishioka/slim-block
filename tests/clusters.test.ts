import { describe, expect, it } from 'vitest';
import { findClusters } from '../src/core/clusters';
import { parse } from './support';

// spec.md §7.2 の例に対応する。
describe('連結成分の判定', () => {
  it('上下左右で接続していれば1塊（L字）', () => {
    const board = parse(`
      ####
      #oo#
      #.o#
      ####
    `);
    expect(findClusters(board)).toHaveLength(1);
  });

  it('斜め方向だけの接触は同じ塊として扱わない', () => {
    const board = parse(`
      ####
      #o.#
      #.o#
      ####
    `);
    const clusters = findClusters(board);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.size === 1)).toBe(true);
  });
});
