import { parseBoard } from '../src/core/board';
import type { Board } from '../src/core/types';

/** テンプレート文字列の共通インデントを取り除き、行配列にする。 */
export function dedent(str: string): string[] {
  const lines = str.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.match(/^\s*/)![0].length);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;

  return lines.map((l) => l.slice(indent));
}

/** ASCIIレイアウトのテンプレート文字列から直接 Board を作る、テスト専用のショートハンド。 */
export function parse(str: string): Board {
  return parseBoard(dedent(str));
}
