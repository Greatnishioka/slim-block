import { describe, expect, it } from 'vitest';
import { solve } from '../src/core/solver';
import { simulateTurn } from '../src/core/simulate';
import { parse } from './support';

describe('solve', () => {
  it('既に空の盤面はsolvable', () => {
    const board = parse(`
      #####
      #...#
      #####
    `);
    const result = solve(board);
    expect(result.solvable).toBe(true);
    expect(result.moves).toEqual([]);
  });

  it('回収口へ辿り着ける盤面はsolvableで、実際に手順通りに動かすとクリアできる', () => {
    const layout = `
      #######
      #o.o..#
      #.....#
      #....@#
      #######
    `;
    const board = parse(layout);
    const result = solve(board);
    expect(result.solvable).toBe(true);
    expect(result.moves).toBeDefined();

    // 見つかった手順を実際に適用すると、本当に全回収できることを確認する
    const verifyBoard = parse(layout);
    for (const dir of result.moves!) {
      simulateTurn(verifyBoard, dir);
    }
    expect(verifyBoard.cells.length).toBe(0);
  });

  it('回収口が存在しない盤面はsolvableにならない', () => {
    const board = parse(`
      #####
      #o..#
      #...#
      #####
    `);
    const result = solve(board);
    expect(result.solvable).toBe(false);
  });
});
