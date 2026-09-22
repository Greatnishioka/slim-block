import { describe, expect, it } from 'vitest';
import { simulateTurn } from '../src/core/simulate';
import { scoreOf } from '../src/core/score';
import { parse } from './support';

describe('スコア', () => {
  it('score = 100 × n²', () => {
    expect(scoreOf(1)).toBe(100);
    expect(scoreOf(2)).toBe(400);
    expect(scoreOf(5)).toBe(2500);
    expect(scoreOf(10)).toBe(10000);
  });

  it('同じ総量でも、分割回収より一括回収の方が高得点になる', () => {
    const bulk = scoreOf(10);
    const split = scoreOf(5) + scoreOf(5);
    expect(bulk).toBeGreaterThan(split);
    expect(bulk).toBe(10000);
    expect(split).toBe(5000);
  });
});

describe('simulateTurn', () => {
  it('回収口に触れた塊全体を回収し、スコアを加算する', () => {
    const board = parse(`
      #####
      #oo.#
      #...#
      #.@.#
      #####
    `);
    const result = simulateTurn(board, 'down');
    expect(board.cells.length).toBe(0);
    expect(result.cleared).toBe(true);
    expect(result.gainedScore).toBe(scoreOf(2)); // 2セルが1塊のまま回収される
    expect(result.phases.some((p) => p.kind === 'drain')).toBe(true);
  });

  it('何も動かず回収もされない入力は空のphasesを返す（手数を消費させないため）', () => {
    // oは既に左壁に接しているので 'left' 入力では何も動かない
    const board = parse(`
      #####
      #o..#
      #####
    `);
    const result = simulateTurn(board, 'left');
    expect(result.phases).toHaveLength(0);
    expect(result.gainedScore).toBe(0);
  });

  it('移動中に回収口へ触れた時点で回収する（停止を待たない）', () => {
    // 回収口の真下は空いており、そのまま落とせば床まで通り過ぎてしまう配置。
    // 「停止後だけ判定」なら回収されないが、「毎tick判定」なら通過した瞬間に回収される。
    const board = parse(`
      #####
      #o..#
      #@..#
      #...#
      #####
    `);
    const result = simulateTurn(board, 'down');
    expect(board.cells.length).toBe(0);
    expect(result.cleared).toBe(true);
    expect(result.gainedScore).toBe(scoreOf(1));
  });

  it('カスケード: 回収で浮いたセルが落ちて、さらに回収される（1回の入力で2段階のsettle/drain）', () => {
    // 縦の通路の奥(A)にだけ最短でドレインへ辿り着けるスライムを配置し、
    // 手前(B)は直下がドレインの真横で塞がれていて、Aが消えるまでそこを通れない。
    // spec.md §12「塊全体を回収対象とする」を経て、Aの消滅がBの経路を開けるカスケードになる。
    const board = parse(`
      ####
      #o.#
      #..#
      #..#
      #..#
      #..#
      #..#
      #.o#
      ##@#
      ####
    `);
    const result = simulateTurn(board, 'down');

    const drainPhases = result.phases.filter((p) => p.kind === 'drain');
    expect(drainPhases).toHaveLength(2);
    expect(drainPhases.every((p) => p.kind === 'drain' && p.clusters[0].size === 1)).toBe(true);

    expect(result.gainedScore).toBe(scoreOf(1) + scoreOf(1));
    expect(result.cleared).toBe(true);
    expect(board.cells.length).toBe(0);
  });
});
