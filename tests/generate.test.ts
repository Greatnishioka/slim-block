import { describe, expect, it } from 'vitest';
import { generateSolvableLevel } from '../src/core/generate';
import { simulateTurn } from '../src/core/simulate';
import { solve } from '../src/core/solver';

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
});
