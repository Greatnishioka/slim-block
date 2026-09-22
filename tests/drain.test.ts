import { describe, expect, it } from 'vitest';
import { settle } from '../src/core/gravity';
import { collectDrained } from '../src/core/drain';
import { parse } from './support';

describe('回収', () => {
  it('回収口に触れた塊は全体が回収され、触れていない塊は残る', () => {
    const board = parse(`
      #########
      #o.....o#
      #o.....o#
      #@......#
      #########
    `);
    settle(board, 'down');
    expect(board.cells.length).toBe(4);

    const drained = collectDrained(board);
    expect(drained).toHaveLength(1);
    expect(drained[0].size).toBe(2);
    expect(board.cells.length).toBe(2); // 回収口に触れていない右側の塊だけ残る
  });

  it('回収口に触れる塊がなければ何も回収しない', () => {
    const board = parse(`
      #####
      #o..#
      #@..#
      #####
    `);
    // oは(1,1)、回収口は(1,2)。settleしていないので触れていない。
    expect(collectDrained(board)).toHaveLength(0);
    expect(board.cells.length).toBe(1);
  });
});
