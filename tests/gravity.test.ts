import { describe, expect, it } from 'vitest';
import { xOf, yOf } from '../src/core/board';
import { settle } from '../src/core/gravity';
import { findClusters } from '../src/core/clusters';
import type { Dir } from '../src/core/types';
import { parse } from './support';

const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

// spec.md §22 のPoCケース: 上部に横長のスライム、その下に縦長の障害物。
// 障害物には床までの隙間がなく、左右の山が完全に独立するようにしてある。
const SPLIT_LAYOUT = `
  ##########
  #.oooooo.#
  #.oooooo.#
  #....XX..#
  #....XX..#
  ##########
`;

describe('直進落下', () => {
  it('1セルが4方向それぞれ壁まで落ちる', () => {
    for (const dir of DIRS) {
      const board = parse(`
        #####
        #...#
        #.o.#
        #...#
        #####
      `);
      settle(board, dir);
      expect(board.cells).toHaveLength(1);
      const [cell] = board.cells;
      const x = xOf(board, cell.idx);
      const y = yOf(board, cell.idx);
      if (dir === 'up') expect(y).toBe(1);
      if (dir === 'down') expect(y).toBe(3);
      if (dir === 'left') expect(x).toBe(1);
      if (dir === 'right') expect(x).toBe(3);
    }
  });
});

describe('保存則', () => {
  it('どの入力でもセル総数が変化しない（融合でセル数が失われることはない）', () => {
    const layout = `
      ##########
      #o.o..X..#
      #oo...X..#
      #.....X..#
      #..o.....#
      #......oo#
      ##########
    `;
    for (const dir of DIRS) {
      const board = parse(layout);
      const before = board.cells.length;
      settle(board, dir);
      expect(board.cells.length).toBe(before);
    }
  });
});

describe('壁抜けなし', () => {
  it('真横が塞がっている場合、斜めの空きがあってもすり抜けない', () => {
    // 直下(1,2)は壁、右(2,1)も壁、左(0,1)は外周壁。斜め先の(2,2)は空いているが、
    // 真横が塞がっているため横流れの条件(isOpenLateral)を満たさず、動けないはず。
    const board = parse(`
      ####
      #o##
      ##.#
      ####
    `);
    const ticks = settle(board, 'down');
    expect(ticks).toHaveLength(0);
    const [cell] = board.cells;
    expect(xOf(board, cell.idx)).toBe(1);
    expect(yOf(board, cell.idx)).toBe(1);
  });
});

describe('融合', () => {
  it('離れた2塊が接触すると1つの連結成分になる', () => {
    const board = parse(`
      ######
      #o..o#
      ######
    `);
    settle(board, 'left');
    const clusters = findClusters(board);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].size).toBe(2);
  });
});

describe('分裂', () => {
  it('大きな塊が障害物によって2つに分かれる（spec.md §22のPoCケース）', () => {
    const board = parse(SPLIT_LAYOUT);
    const totalBefore = board.cells.length;
    expect(totalBefore).toBe(12);

    settle(board, 'down');
    const clusters = findClusters(board);

    expect(clusters).toHaveLength(2);
    expect(clusters.reduce((sum, c) => sum + c.size, 0)).toBe(12);
  });
});

describe('再融合', () => {
  it('分裂したスライムが横方向の重力で再び1塊になる', () => {
    // 1段厚の障害物なら、その真上の行が常に横流れの逃げ道になるため、
    // 1回の重力入力だけで確実に再結合できる（2段以上の障害物では逃げ道の形状次第で
    // 再結合に複数回の入力が必要になることもある。これは分厚い塊ほど地形に分断されやすい
    // という仕様のリスク・リターン構造そのものであり、バグではない）。
    const board = parse(`
      #######
      #.....#
      #o.X.o#
      #######
    `);
    expect(findClusters(board)).toHaveLength(2);

    settle(board, 'right');
    const clusters = findClusters(board);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].size).toBe(2);
  });
});

describe('決定論', () => {
  it('同じ盤面・同じ入力列を2回流すと、最終盤面が完全に一致する', () => {
    const dirs: Dir[] = ['down', 'left', 'up', 'right', 'down'];

    function run() {
      const board = parse(SPLIT_LAYOUT);
      for (const d of dirs) settle(board, d);
      return {
        occupancy: [...board.cells].map((c) => c.idx).sort((a, b) => a - b),
        clusterSizes: findClusters(board)
          .map((c) => c.size)
          .sort((a, b) => a - b),
      };
    }

    expect(run()).toEqual(run());
  });
});

describe('停止性', () => {
  it('settle は安全弁の回数に到達せず終了する', () => {
    const board = parse(SPLIT_LAYOUT);
    const limit = board.width * board.height * 2;
    const ticks = settle(board, 'down');
    expect(ticks.length).toBeLessThan(limit);
  });
});
