import { describe, expect, it } from 'vitest';
import { generateSolvableLevel } from '../src/core/generate';
import { simulateTurn } from '../src/core/simulate';
import { solve } from '../src/core/solver';
import { Terrain } from '../src/core/types';

describe('generateSolvableLevel', () => {
  it('同じseedなら毎回同じ盤面になる（決定論）', () => {
    const a = generateSolvableLevel({ seed: 42 });
    const b = generateSolvableLevel({ seed: 42 });
    expect(a.layout).toEqual(b.layout);
  });

  it('生成した盤面は、返ってきた手順どおりに動かすと実際に全回収できる', () => {
    const level = generateSolvableLevel({ seed: 123 });
    for (const dir of level.solution) {
      simulateTurn(level.board, dir);
    }
    expect(level.board.cells.length).toBe(0);
  });

  it('複数シードで生成しても、solverで再検証すると必ずsolvableになる', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const level = generateSolvableLevel({ seed });
      const result = solve(level.board);
      expect(result.solvable).toBe(true);
    }
  });

  it('回収口は内部に浮かせず、外周に接続した3×3のポケットとして配置する', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const level = generateSolvableLevel({ seed, width: 20, height: 20, pocketSize: 3 });
      const { board } = level;

      // ポケットぶん(pocketSize-1)だけ、どちらかの辺が元の20より大きくなっている。
      const grew = [board.width - 20, board.height - 20];
      expect(grew.some((d) => d === 2)).toBe(true);
      expect(grew.every((d) => d === 0 || d === 2)).toBe(true);

      // 回収口はちょうど9マス（3×3）。
      let drainCount = 0;
      for (let idx = 0; idx < board.terrain.length; idx++) {
        if (board.terrain[idx] === Terrain.Drain) drainCount++;
      }
      expect(drainCount).toBe(9);
    }
  });
});
