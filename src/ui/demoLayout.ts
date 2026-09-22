// M1 PoC専用のデモ盤面。arch.md §12 M1: 「20×20程度のグリッド、1種類のスライム、
// 1本の縦長障害物、4方向重力」だけを検証する。ステージデータ駆動化はM3で行う。

export function buildDemoLayout(width: number, height: number): string[] {
  const grid: string[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));

  for (let x = 0; x < width; x++) {
    grid[0][x] = '#';
    grid[height - 1][x] = '#';
  }
  for (let y = 0; y < height; y++) {
    grid[y][0] = '#';
    grid[y][width - 1] = '#';
  }

  // 縦長の内部障害物（中央やや下）
  const obsX = Math.floor(width / 2);
  const obsTop = Math.floor(height * 0.5);
  const obsBottom = Math.floor(height * 0.7);
  for (let y = obsTop; y <= obsBottom; y++) grid[y][obsX] = 'X';

  // スライムの塊（上部）。最大25個（5×5）に収め、障害物の柱をまたぐ幅にして
  // 落下時に分裂する様子が見えるようにする。
  const SLIME_SIZE = 5; // 5×5 = 25セル
  const slimeTop = 2;
  const slimeBottom = slimeTop + SLIME_SIZE - 1;
  const slimeLeft = obsX - Math.floor(SLIME_SIZE / 2);
  const slimeRight = slimeLeft + SLIME_SIZE - 1;
  for (let y = slimeTop; y <= slimeBottom; y++) {
    for (let x = slimeLeft; x <= slimeRight; x++) grid[y][x] = 'o';
  }

  return grid.map((row) => row.join(''));
}
