// 「重力の向きが変わる」のではなく「箱そのものが傾く」という見せ方にするための、
// 盤面コンテナの回転角度を計算するだけの純粋関数群。
// ゲームロジック（core/）は一切関与しない。あくまで盤面 <div> に
// transform: rotate() をかけるための数値計算。

import type { Dir } from '../core/types';

// down を基準(0deg)にして、right→90, up→180, left→270 の順で一周する円環にしてある。
// この並びは「時計回りに90度ずつ」という単一方向の回転として矛盾なく繋がる
// （例: down→right→up→left→down は常に+90ずつ進む一方向の回転）。
export const CANONICAL_ANGLE: Record<Dir, number> = {
  down: 0,
  right: 90,
  up: 180,
  left: 270,
};

/**
 * from(deg) から to(deg) へ回転するときの、最短経路の角度差を [-180, 180] で返す。
 * 現在の累積回転角 rotation に対して `rotation += shortestDelta(...)` していけば、
 * 0↔360の境界をまたいでも常に短い側へ滑らかに回転し続けられる
 * （逆回りに一周してしまう、といった不自然なアニメーションを避けられる）。
 */
export function shortestDelta(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}
