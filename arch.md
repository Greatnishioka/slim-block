# 4方向重力スライムパズル — アーキテクチャ設計書

対象: [spec.md](spec.md) のMVPを実装するための設計。
この文書は「何を作るか」ではなく「どう作るか」を定義する。仕様の解釈が必要だった箇所は §13 に判断根拠をまとめた。

---

## 1. 設計の中心にある1つの決定

仕様 §22 が言う最重要ポイントは、巨大なセル集合が障害物へ衝突したときに **流れて・分かれて・再結合する** ことである。
これを成立させるために、本設計は次の1点を全体の土台に置く。

> **スライム塊は剛体ではない。塊とは「移動後のセル集合に対して連結成分を計算した結果」に過ぎない。**

つまり、

- 移動処理が扱うのは **セル単位** であり、塊という単位は移動ロジックに一切登場しない
- 融合も分裂も専用処理を持たない。移動が終わってから連結成分を数え直すだけ
- 塊IDは毎ターン作り直される揮発値であり、スコア計算と描画にしか使わない

仕様 §8「特別な融合操作は存在しない」と §10「連結成分を再計算することで分裂を表現する」は、この一貫した帰結になる。

---

## 2. 技術選定

結論を先に書く。

```
TypeScript + Vite + React 19
盤面は DOM + CSS transform / transition で描画する（Canvas は使わない）
ランタイム依存は react / react-dom のみ
```

仕様 §20 は「TypeScript + Canvas 2D、Reactは必須ではない」としているが、**実装量を最小化するという観点では逆の結論になる。** 理由を以下に示す。

### 2.1 ゲームエンジンは使わない

| 候補 | 却下理由 |
|---|---|
| **Phaser 3** | スプライト・アセットローダー・物理・パーティクル・シーン管理を提供するが、このゲームが必要とするのは「同色の矩形を格子上で動かす」ことだけ。仕様 §21 のとおり物理エンジンも使わない。得られるものに対して、約1MBのランタイムとフレームワーク固有の書き方を学ぶコストが見合わない |
| **PixiJS** | 高速なWebGLレンダラだが、描画対象は最大でも 16×12 = 192 個の矩形。Canvas 2D でもDOMでも余裕で60fpsが出る規模で、WebGLを持ち出す必要がない |
| **Matter.js 等の物理** | 仕様 §21 が明確に禁じている。必要なのは決定論であり、物理的なもっともらしさではない |

**ゲームエンジンの価値は、アセット・スプライト・物理・多数のオブジェクトにある。このゲームはそのどれも持たない。**

### 2.2 Canvas をやめて DOM で描く

これが今回いちばん実装量を減らす判断である。

Canvas 2D で書くと、次のコードをすべて自分で書くことになる。

- `requestAnimationFrame` ループ
- セルごとの `from → to` 位置補間（イージング含む）
- 毎フレームの全消去と再描画
- DPR対応とリサイズ時の再計算
- 吸い込み演出の進行度管理と変形計算

DOM + CSS なら、これらは次のように消える。

| Canvasで書く必要があるもの | DOMでの代替 | 書く量 |
|---|---|---|
| 位置の補間ループ | `transition: transform 55ms linear` | CSS 1行 |
| 再描画 | Reactの差分更新 | 0行 |
| 要素の生成・削除の管理 | `key={cell.id}` による差分 | 0行 |
| 吸い込み演出 | `.draining` クラス + transform/opacity | CSS 数行 |
| DPR・にじみ対策 | 不要（DOMはベクタ） | 0行 |

`transform` と `opacity` のアニメーションはコンポジタで処理されるため、192要素でも負荷にならない。
**スライムの見た目が矩形の集合であること自体が、DOM描画と完全に噛み合っている。**

さらに、「塊を一体に見せる」メタボール表現（§8.3）も、CSSの goo フィルタのほうが Canvas での実装より簡単に到達できる。

### 2.3 React を選ぶ理由

素のTypeScriptでDOMを扱うと、「セルのdivを生成し、消し、位置を更新する」同期コードを手で書くことになる。これは地味に量があり、バグの出やすい箇所でもある。Reactはこれを丸ごと消す。

加えて、**`SlimeCell.id`（§4）がそのまま React の `key` になる。** セルに安定IDを振るという設計は、もともとアニメーション追跡のために必要だったものだが、これがReactの差分アルゴリズムと自然に噛み合う。融合しても分裂しても、セルのDOM要素は同一性を保ったまま移動する。

Svelte 5 のほうが記述量はさらに少なくなるが、React を採る。エコシステムと情報量が多く、仕様 §20 が挙げる「AIコーディングエージェントで生成・修正しやすい」という採用理由に最も合致するため。

**ただし React が担当するのは描画層だけである。** ゲームロジックは §3 のとおり React を一切知らない純粋な TypeScript に隔離する。Reactを後から別のものに差し替えても `core/` は1行も変わらない。

### 2.4 使わないもの

状態管理ライブラリ（Redux / Zustand 等）、アニメーションライブラリ（Framer Motion 等）、UIコンポーネントライブラリ、ルーター。
グローバル状態は1画面ぶんしかなく、アニメーションはCSSで足り、UIはボタン4つとテキスト2行しかない。依存を足すほうが読む量が増える。

---

## 3. レイヤ構成

依存は上から下への一方向のみ。`core` は DOM・React・時間・乱数のいずれにも依存しない純粋関数群とする。これはテスト容易性のためだけでなく、仕様 §21 の決定論要件（同じ盤面・同じ方向なら必ず同じ結果）をコンパイラで守らせるためである。

```
┌─────────────────────────────────────────┐
│ main.tsx            起動・マウントのみ    │
├─────────────────────────────────────────┤
│ ui/         React コンポーネント（描画）   │  DOM / CSS
├─────────────────────────────────────────┤
│ game/       セッション状態・状態機械・再生 │  可変状態はここだけ
├─────────────────────────────────────────┤
│ core/       純粋ロジック（副作用なし）     │  ← テストの主対象
└─────────────────────────────────────────┘
```

### ディレクトリ

```
src/
  core/                   ← React も DOM も知らない
    types.ts              型と定数（Dir, Terrain, Board）
    board.ts              Board の生成・複製・座標ヘルパ
    gravity.ts            ★ 重力シミュレーション（本体）
    clusters.ts           連結成分の計算
    drain.ts              回収判定
    score.ts              スコア計算
    simulate.ts           1ターンを phases 列にまとめる公開API
  game/
    useGameSession.ts     状態機械・手数・スコア・リトライ（フック）
    playback.ts           phases 列をビュー状態の時系列へ変換して再生
    stage.ts              ステージJSONのパースと検証
  ui/
    App.tsx
    Board.tsx             盤面コンテナ
    TerrainLayer.tsx      静的タイル（memo化）
    SlimeLayer.tsx        スライムセル
    Hud.tsx               SCORE / MOVES
    Controls.tsx          4方向ボタン
    useKeyboard.ts        キーボード入力
    styles.css
  main.tsx
stages/
  index.json  stage-01.json … stage-05.json
tests/
  gravity.test.ts  clusters.test.ts  simulate.test.ts  determinism.test.ts
```

テストは Vitest。Reactコンポーネントのテストは書かない（§11）。

---

## 4. データモデル

```ts
// core/types.ts

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
};

export const enum Terrain {
  Empty    = 0,
  Wall     = 1,  // 外周・内壁
  Obstacle = 2,  // 内部障害物
  Drain    = 3,  // 回収口
}

export interface Board {
  readonly width: number;
  readonly height: number;
  readonly terrain: Uint8Array;   // 不変。length = w*h
  cells: SlimeCell[];             // 可変。スライムセルの集合
  occupancy: Int32Array;          // idx -> cellId、空きは -1
}

export interface SlimeCell {
  readonly id: number;  // 生成時に割り当て、回収されるまで不変。React の key も兼ねる
  idx: number;          // y * width + x
}
```

**座標は1次元 index (`idx = y * width + x`) に統一する。** 2次元配列やオブジェクト座標は使わない。重力方向の隣接セルが `idx + dy * width + dx` の単純加算になり、シミュレーションの内側ループが素直になるため。境界の回り込みは外周を必ず `Wall` にすることで防ぐ（仕様 §6「マップ外周についても壁として扱う」）。

`occupancy` を `cells` と二重に持つのは、`isOpen()` を O(1) にするため。両者は必ず同時に更新する。更新は `board.ts` の `moveCell()` / `removeCell()` に閉じ込め、外部から直接書き換えない。

### WALL と OBSTACLE を衝突判定上は区別しない

仕様は両者を別のタイルとして定義するが、挙動を読むと差がない。壁は「完全に停止させる」（§6）、障害物も通過不可で流れを分岐させる（§10）。**分岐は障害物の特殊効果ではなく、砂モデルの横流れが勝手に起こす副作用である。**

よって:

```ts
export const isSolid = (t: Terrain) => t === Terrain.Wall || t === Terrain.Obstacle;
```

区別は **描画とステージ作者の意図表現のみ**に残す。ロジックを2種類持たない。

### Drain は「通行可能な床タイル」

回収口はスライムを止めない。スライムは Drain セルの上に乗り、その位置で停止したときに回収される。
したがって **Drain は必ず、重力方向の先が Solid になる位置に置く**（例: 床の直上）。空中に浮いた Drain はスライムが素通りする。これはステージ作成時の規約とし、`stage.ts` の検証で警告する。

---

## 5. ★ 重力シミュレーション（core/gravity.ts）

本設計の核。**砂＋横流れモデル**を採用する。

### 5.1 1 tick のルール

盤面全体を1マスぶん進める単位を **tick** と呼ぶ。1回の重力入力は、動けるセルがなくなるまで tick を繰り返した結果である。

各セルについて、次の順に判定する。

1. **直進**: 重力方向の隣が空いていれば、そこへ移動する。
2. **横流れ**: 直進できない場合、重力方向に対する左右それぞれについて、**真横が空いており、かつ斜め前方も空いている**なら斜め前方へ移動する。
3. どちらも不可なら、この tick では動かない。

横流れの条件に「真横が空いている」を含めるのは、**壁の角を斜めにすり抜けるのを防ぐため**である。これがないと、隙間のない壁をスライムが通過してしまう。

```
凡例: ● = 対象セル, □ = 空, █ = Solid, 重力 = ↓

直進:        横流れ成立:     横流れ不成立（角抜け防止）:
  ●             ●□             ●█
  □             █□             █□
```

### 5.2 走査順序

**重力の下流側から走査する。** 下流のセルが先に動いて空きを作るため、積み重なったセル列が1 tick で列ごと1マス進む。上流から走査すると先頭が詰まって1 tick に1セルしか動かず、大きな塊の落下が極端に遅くなる。

```ts
function scanOrder(board: Board, dir: Dir): number[] {
  // cells を「重力方向にもっとも進んでいる順」に並べた cellId 配列。
  // down  → y の降順、up → y の昇順、right → x の降順、left → x の昇順
  // 同値の並びは idx 昇順で固定する（決定論のため）
}
```

同値順を `idx` 昇順で固定するのは、`cells` 配列の格納順にシミュレーション結果が依存しないようにするため。

### 5.3 左右のどちらへ流すか

両側とも横流れ可能なとき、どちらを選ぶかで結果が変わる。常に左優先にすると山が左へ偏って見た目が不自然になる。

**tick の番号の偶奇で優先側を切り替える。**

```ts
const preferLeft = (tickIndex % 2) === 0;
```

`tickIndex` はシミュレーション状態の一部なので決定論は保たれる（仕様 §21 を満たす）。かつ tick ごとに左右が入れ替わるため、山は左右対称に崩れる。
将来より自然な挙動が必要になれば「左右それぞれの落下可能深さを比較して深い側を選ぶ」に差し替えられるよう、この判定は `chooseSide()` として切り出しておく。

### 5.4 疑似コード

```ts
export interface Move { cellId: number; from: number; to: number }
export interface Tick { moves: Move[] }

export function stepOnce(board: Board, dir: Dir, tickIndex: number): Tick | null {
  const { dx, dy } = DELTA[dir];
  const fwd  = dy * board.width + dx;
  const side = dx === 0 ? 1 : board.width;      // 重力に直交する方向の1マス
  const preferLeft = (tickIndex % 2) === 0;
  const sides = preferLeft ? [-side, +side] : [+side, -side];

  const moves: Move[] = [];

  for (const cellId of scanOrder(board, dir)) {
    const from = board.cells[cellId].idx;

    // 1. 直進
    if (isOpen(board, from + fwd)) {
      moveCell(board, cellId, from + fwd);
      moves.push({ cellId, from, to: from + fwd });
      continue;
    }

    // 2. 横流れ
    for (const s of sides) {
      const lateral  = from + s;
      const diagonal = from + s + fwd;
      if (isOpen(board, lateral) && isOpen(board, diagonal)) {
        moveCell(board, cellId, diagonal);
        moves.push({ cellId, from, to: diagonal });
        break;
      }
    }
  }

  return moves.length > 0 ? { moves } : null;
}

export function settle(board: Board, dir: Dir): Tick[] {
  const ticks: Tick[] = [];
  const limit = board.width * board.height * 2;   // 安全弁
  for (let i = 0; i < limit; i++) {
    const t = stepOnce(board, dir, i);
    if (!t) break;
    ticks.push(t);
  }
  return ticks;
}
```

`isOpen(board, idx)` は「範囲内 かつ `!isSolid(terrain[idx])` かつ `occupancy[idx] === -1`」。

> **横流れは行をまたぐ加算に注意。** 左右移動時の `side = width` は上下方向の隣接なので問題ないが、上下重力時の `side = 1` は行末で隣の行へ回り込む。`from` と `from + s` が同じ行（または同じ列）にあることを検査するヘルパ `isOpenLateral(board, from, s)` を用意する。

### 5.5 粘性（後から効かせるためのフック）

砂モデルをそのまま使うと、平坦な床の上でスライムが薄く広がりすぎ、「塊を育てる」というゲーム性が弱まる可能性がある。実際に遊んでみないと適正が分からないので、**横流れの可否判定だけを差し替え可能にしておく**。

```ts
export type SlideRule = (board: Board, cellId: number, dir: Dir) => boolean;
export const sandRule: SlideRule = () => true;  // MVPの既定
// 例: 「重力方向に2セル以上積み上がっているときだけ流れる」など後から追加できる
```

MVPは `sandRule` 固定。チューニングが必要になった時点で `settle()` の引数に渡す。

---

## 6. 連結成分と回収

### 6.1 連結成分（core/clusters.ts）

上下左右4近傍のみで連結を判定する（仕様 §7.2。斜めは連結しない）。

```ts
export interface Cluster {
  cellIds: number[];
  size: number;        // = cellIds.length
  touchesDrain: boolean;
}

export function findClusters(board: Board): Cluster[];
```

`occupancy` を使った幅優先探索。探索開始点は `idx` 昇順で選び、結果の配列順も決定論的にする。計算量は O(セル数)。

### 6.2 回収（core/drain.ts）

安定（`settle` 完了）した時点で連結成分を計算し、**1セルでも Drain の上にある塊は、塊全体を回収する**（仕様 §12）。

```ts
export function collectDrained(board: Board): Cluster[];  // 回収した塊を返し、board から削除する
```

### 6.3 カスケード

塊を回収すると、その塊が支えていたセルが宙に浮く。重力は入力後も働き続けているはずなので、**回収後にもう一度安定させ、再び回収判定を行う**。これを変化がなくなるまで繰り返す。これを1回の入力＝1手として扱う（仕様 §16 の MOVES は入力回数）。

```ts
// core/simulate.ts
export type Phase =
  | { kind: 'settle'; ticks: Tick[] }
  | { kind: 'drain';  clusters: Cluster[]; gained: number };

export interface TurnResult {
  phases: Phase[];        // 再生順。描画層はこれを読むだけ
  gainedScore: number;
  cleared: boolean;       // このターンで全セル回収したか
}

export function simulateTurn(board: Board, dir: Dir): TurnResult {
  const phases: Phase[] = [];
  let gained = 0;

  for (;;) {
    const ticks = settle(board, dir);
    if (ticks.length > 0) phases.push({ kind: 'settle', ticks });

    const drained = collectDrained(board);
    if (drained.length === 0) break;

    const g = drained.reduce((s, c) => s + scoreOf(c.size), 0);
    gained += g;
    phases.push({ kind: 'drain', clusters: drained, gained: g });
  }

  return { phases, gainedScore: gained, cleared: board.cells.length === 0 };
}
```

`simulateTurn` は `board` を破壊的に更新し、**最終盤面と再生用タイムラインを同時に返す**。これが `core` の唯一の公開エントリポイントである。

この形にすることで、**ロジックはアニメーション完了を待たない。** ターン開始時点で結果が確定しており、描画層は確定済みの履歴を再生しているだけになる。アニメーション速度を変えても、途中でスキップしても、ゲーム状態は一切変わらない。

### 6.4 スコア（core/score.ts）

```ts
export const scoreOf = (n: number) => 100 * n * n;   // 仕様 §14
```

---

## 7. ゲーム状態機械（game/useGameSession.ts）

可変状態を持つのはこのフックだけ。

```
  LOADING ──> IDLE ──入力──> ANIMATING ──> IDLE
                ↑                          │
                └────────── リトライ ───────┤
                                           └─> CLEARED
```

| 状態 | 入力受付 | 説明 |
|---|---|---|
| `LOADING` | × | ステージJSONの読み込み・検証 |
| `IDLE` | ○ | 次の重力入力を待つ |
| `ANIMATING` | × | `phases` を再生中。仕様 §4「移動が完全に終了するまで次の入力は受け付けない」 |
| `CLEARED` | 次へ/リトライのみ | 全セル回収 |

`Board` は **ref に置き、React の state にしない。** `Uint8Array` と可変配列を持つ構造で、Reactの不変性前提と噛み合わないため。Reactが描くのは §8.1 の `ViewState` だけとする。

```ts
function input(dir: Dir) {
  if (statusRef.current !== 'IDLE') return;       // 入力ロック
  const result = simulateTurn(boardRef.current, dir);
  if (result.phases.length === 0) return;         // 何も動かないなら手数を消費しない
  setMoves(m => m + 1);
  setStatus('ANIMATING');
  playback.play(result, {
    onFrame: setView,                             // ビュー状態を差し替えるだけ
    onScore: g => setScore(s => s + g),
    onEnd:   () => setStatus(result.cleared ? 'CLEARED' : 'IDLE'),
  });
}
```

盤面が1ミリも変化しない入力で手数を消費させない（`phases.length === 0` の早期リターン）のは、壁に押し付けた方向を再入力したときに MOVES だけ増えるのを防ぐため。

ステージ読み込み時の初期 `Board` を保持しておき、`R` キーでリトライできるようにする。MVPでは Undo は実装しないが、`core` が純粋で `Board` を複製可能なため、ターン前に `cloneBoard()` を積むだけで後から追加できる。

---

## 8. 描画とアニメーション（ui/）

### 8.1 Reactが描くもの

Reactには「現在表示すべき状態」だけを渡す。アニメーションの補間はCSSに任せる。

```ts
export interface ViewCell {
  id: number;
  x: number; y: number;
  edges: number;              // 塊の外周ビット（上下左右の4bit）
  drain?: { tx: number; ty: number; ms: number };  // 吸い込み中なら回収口の座標と所要時間
}
export interface ViewState {
  cells: ViewCell[];
  popups: { id: number; x: number; y: number; score: number }[];
}
```

コンポーネント構成:

```
App
 └ GameScreen
     ├ Hud           SCORE / MOVES
     ├ Board
     │   ├ TerrainLayer   静的タイル。React.memo でステージ変更時のみ再描画
     │   └ SlimeLayer     ViewState.cells を描く
     └ Controls      4方向ボタン
```

### 8.2 位置のアニメーション

セルは盤面コンテナ内の絶対配置とし、`transform` だけで動かす（`left`/`top` を使うとレイアウトが再計算され、コンポジタに乗らない）。

```tsx
<div
  key={cell.id}                                   // ← core の SlimeCell.id
  className="slime"
  style={{ transform: `translate(${cell.x * CELL}px, ${cell.y * CELL}px)` }}
/>
```

```css
.slime {
  position: absolute;
  width: var(--cell); height: var(--cell);
  transition: transform var(--tick-ms) linear;
  will-change: transform;
}
```

**`playback.ts` は tick ごとに `ViewState` を差し替えるだけでよい。** 位置が変わると CSS transition が `--tick-ms` かけて補間する。補間コードは1行も書かない。横流れによる斜め移動も、そのまま斜めに補間されて自然に見える。

イージングは `linear` とする。tickが連続する落下中に `ease` を使うと、1マスごとに減速して不自然になるため。

**再生時間の上限**: 大きな塊は tick 数が多く待ち時間が伸びる。総再生時間が上限（例 700ms）を超える場合、`--tick-ms` を圧縮する。ゲーム状態は既に確定しているので、速度を変えても結果に影響しない。

```ts
const tickMs = Math.max(18, Math.min(55, 700 / totalTicks));
```

### 8.3 スライムを「塊」に見せる

セルを個別の四角で描くと、プレイヤーは「何が1つの塊なのか」を読み取れない。これはこのゲームで最も重要な情報なので、描画で明示する。

**塗りと輪郭を分離する。**

1. セルは隣接方向へわずかにはみ出させて塗り、隣接セル同士が繋がって見えるようにする
2. `findClusters()` から求めた `edges` ビットを使い、**塊の外周にあたる辺だけ**にラインを描く。ある辺が外周かどうかは「その方向の隣にスライムセルがあるか」で判定できる

```
●●●  ←  塊の外周だけを線で囲む。内部の境界は描かない
●●●      分裂した瞬間、線が2つに割れてプレイヤーに伝わる
```

外周ラインは `box-shadow` の inset を辺ごとに合成して表現する（`edges` ビットから文字列を組み立てる）。

塊ごとに色を変えたくなるが、**やらない。** 連結成分のIDは毎ターン再計算される揮発値なので、色が毎ターン入れ替わって混乱を生む。色は単一、区別は輪郭線で行う。

メタボール的な質感が欲しくなったら、スライム層に SVG の goo フィルタ（`feGaussianBlur` + `feColorMatrix`）をかける手が使える。ただし外周ラインが潰れるうえ、`transform` アニメーションとの併用で負荷が出る。**M4 での任意課題とし、MVPの必須要件にはしない。**

### 8.4 吸い込み演出（仕様 §13）

`drain` フェーズでは、回収対象のセルに回収口への移動・縮小・フェードを同時にかける。塊サイズ `n` に応じて強化する。

```ts
const duration = 180 + Math.min(320, n * 28);   // ms
```

```css
.slime.draining {
  transition: transform var(--drain-ms) cubic-bezier(.5,0,.9,.4),
              opacity   var(--drain-ms) ease-in;
  opacity: 0;
}
```

`transform` に回収口への移動＋`scale` を設定する。仕様が言う「引き伸ばし」は、移動方向に非等方な `scale`（例 `scale(0.4, 1.3)`）をかけるだけで表現できる。

`n >= 8` で盤面コンテナに短いシェイクのCSSアニメーションを付け、獲得スコアを盤面上にポップアップさせる。

React側は、`drain` フェーズ開始時にセルへ `draining` クラスを付け、`duration` 経過後に `ViewState.cells` から取り除く。**回収済みセルをビュー状態に少しだけ残すのがポイント**で、`core` の `Board` からは既に消えている。ロジックとビューの寿命が違ってよい、というのがこの設計の利点でもある。

### 8.5 レイアウト

セルサイズは CSS 変数 1つで決める。

```css
.board {
  --cell: clamp(22px, min(9vw, 7vh), 48px);
  width:  calc(var(--cell) * var(--cols));
  height: calc(var(--cell) * var(--rows));
  position: relative;
}
```

仕様 §17 に従いUIは最小にし、盤面に画面を割く。モバイルでは盤面の下に4方向ボタンを配置し、親指が届く位置に置く。

---

## 9. ステージデータ（game/stage.ts）

仕様 §18 は座標配列の概念例を示すが、**ASCIIレイアウトを正式フォーマットとする。**
座標配列は人間が読めず、レベルデザインの試行錯誤ができない。ASCII なら JSON を直接編集して形が見え、生成も差分レビューも容易になる。

```json
{
  "id": "stage-03",
  "name": "分かれ道",
  "layout": [
    "##########",
    "#oo......#",
    "#oo......#",
    "#....X...#",
    "#....X...#",
    "#........#",
    "#.......@#",
    "##########"
  ],
  "par": { "moves": 5, "score": 1600 }
}
```

| 文字 | 意味 |
|---|---|
| `.` | EMPTY |
| `#` | WALL |
| `X` | OBSTACLE（内部障害物。見た目のみ WALL と区別） |
| `@` | DRAIN |
| `o` | EMPTY + スライムセル1個 |

`width` / `height` は `layout` から導出するので JSON に書かない（二重管理による不整合を防ぐ）。
ステージは `import.meta.glob('/stages/*.json', { eager: true })` で静的に取り込む。`fetch` もローディング状態も不要になる。

### 検証（読み込み時に必ず実行）

- 全行の長さが一致すること
- 外周がすべて `#` であること（仕様 §6。シミュレーションの範囲外アクセス防止にも効く）
- `@` が1つ以上、`o` が1つ以上あること
- 未知の文字がないこと
- 【警告のみ】各 `@` について、4方向すべてが `.` の場合は「スライムが素通りする可能性」を警告する

検証失敗は例外を投げて起動時に落とす。不正ステージを黙って読み込むほうが危険なため。

ステージ一覧は `stages/index.json` に順序付き配列で持ち、クリア時に次のステージへ進む。

### MVP 5ステージの設計意図（仕様 §19）

| # | 学ばせること | 構成 |
|---|---|---|
| 1 | 重力と回収の対応づけ | スライム1〜2個、障害物なし、回収口1つ |
| 2 | 接触＝融合であること | 離れた2群を1方向の入力で衝突させられる配置 |
| 3 | 障害物が流れを割ること | 短い障害物1本。避けて通せば割れない |
| 4 | 大きいほど割れること | 幅の広い塊が必ず障害物に当たる配置 |
| 5 | 戦略の成立 | 危険地帯は小分けで通し、回収口の手前で合流させると最高得点になる配置 |

ステージ4と5は、**割らずに運ぶ経路が存在すること**を必ず手で確認する。存在しないと「大きくまとめる」選択肢が消え、ゲームのリスク・リターン構造（仕様 §1）が成立しない。

---

## 10. 入力（ui/）

- キーボード: `ArrowUp`/`W`、`ArrowDown`/`S`、`ArrowLeft`/`A`、`ArrowRight`/`D`。`R` でリトライ
- 画面上の4方向ボタン: `onPointerDown` で発火（`onClick` だとモバイルで約300msの遅延が出る）
- 盤面上のスワイプにも対応する（モバイルでボタンを押さずに遊べるほうが快適）

キーリピートは無視する（`event.repeat` で弾く）。同時入力は扱わない（仕様 §4）。
入力のロックは §7 の状態機械が一元的に担当し、UI側は状態を知らずに `input(dir)` を呼ぶだけでよい。
`preventDefault` は方向キーに対してのみ行い、ページスクロールを止める。

ボタンには `aria-label`（「上方向へ重力」など）を付け、`ANIMATING` 中は `disabled` にする。見た目のロック状態が入力ロックと一致していれば、プレイヤーは連打が無視された理由を理解できる。

---

## 11. テスト戦略

`core` が純粋なのでテストはすべてここに集中させる。**Reactコンポーネントのテストは書かない。** ロジックが `core` に隔離されている以上、UI層に検証すべき分岐がほとんど存在しないため。

盤面はASCIIで書き、ASCIIで検証する。これがなければ重力のテストは読めないものになる。

```ts
it('大きな塊が障害物で2つに分かれる', () => {
  const board = parse(`
    ##########
    #.oooooo.#
    #.oooooo.#
    #....XX..#
    #....XX..#
    #........#
    ##########
  `);
  settle(board, 'down');
  expect(findClusters(board).length).toBe(2);
});
```

必須のテストケース:

| 観点 | 内容 |
|---|---|
| 直進落下 | 1セルが壁まで落ちる。4方向すべて |
| 保存則 | **どの入力でもセル総数が変化しない**（仕様 §8「融合によってセル数が失われることはない」）。ランダム盤面×全方向で総当たり |
| 壁抜けなし | 角を斜めにすり抜けない。斜め1マスの隙間を通過しない |
| 融合 | 離れた2塊が接触して連結成分が1つになる |
| 分裂 | §22 の PoC ケース。障害物で2塊に分かれる |
| 再融合 | 分裂後に横方向の重力を入れると再び1塊になる |
| 回収 | Drain に触れた塊が全体ごと消える。触れていない塊は残る |
| カスケード | 回収で浮いたセルが落ちて、さらに回収される |
| スコア | `100n²`。分割回収より一括回収が高得点になることを数値で検証 |
| **決定論** | 同じ盤面・同じ入力列を2回流し、最終盤面とスコアが完全一致すること |
| 停止性 | どの盤面でも `settle` が安全弁に到達しない |

決定論テストと保存則テストは、リファクタリングの安全網として最も価値が高い。最初に書く。

---

## 12. 実装順序

仕様 §22 の指示どおり、**UIとステージを作り込む前に挙動を確定させる。**

**M1 — PoC（最優先）**
`core/types.ts` `board.ts` `gravity.ts` `clusters.ts` と、最小限のReactコンポーネント（セルのdivを並べるだけ）とキーボード入力。20×20固定、縦長障害物1本、スライムの矩形1つ。回収口もスコアもステージもHUDもない。
達成条件: 障害物で自然に割れ、横重力で再び融合する。**ここが納得いくまで次へ進まない。** 割れ方が不自然なら §5.3 の `chooseSide` と §5.5 の `SlideRule` を調整する。

**M2 — ゲームループ成立**
`drain.ts` `score.ts` `simulate.ts` `useGameSession.ts` `playback.ts`。回収・スコア・クリア判定・手数。
達成条件: 1ステージを最初から最後まで遊べる。

**M3 — データ駆動**
`stage.ts` と5ステージのJSON。ステージ追加でロジックを触らないこと（仕様 §18）を確認する。

**M4 — 手触り**
吸い込み演出、塊の輪郭線、HUD、モバイル操作、リトライ。仕様 §13 の演出強化はここ。goo フィルタを試すならここ。

**M5 — 仕上げ**
GitHub Pages へのデプロイ（Vite の `base` を `'/slim-block/'` に設定）、ステージ間遷移。

---

## 13. 仕様の解釈が必要だった点

| # | 論点 | 判断 |
|---|---|---|
| 1 | 移動モデル | セル単位の砂＋横流れ。塊は剛体として動かない。仕様 §10「回り込む」「連結成分を再計算する」がこれを要求している |
| 2 | WALL と OBSTACLE の差 | 衝突挙動は同一とし、描画のみ区別。仕様を読む限り機能差がなく、2系統のロジックを持つ理由がない |
| 3 | 左右どちらへ流れるか | 仕様に記述なし。tick の偶奇で切り替え、決定論を保ちつつ左右対称に崩す |
| 4 | Drain の通行可否 | 通行可能な床タイルとして扱い、安定後に回収判定。移動中の通過では回収しない。「安定後」のほうが結果を予測しやすく、仕様 §21 の思想に合う。素通りを避けるため Drain は床の直上に置く規約とし、検証で警告する |
| 5 | 回収後の再落下 | 仕様に記述なし。カスケードさせる。重力が働き続けている以上、浮いたまま止まるのは不自然 |
| 6 | 何も動かない入力 | MOVES を消費しない。仕様に記述なし |
| 7 | ステージ形式 | 座標配列（仕様 §18 の概念例）ではなく ASCII レイアウト。レベルデザインの反復可能性のため。「データから読み込める」という要件（§23）は満たす |
| 8 | **Canvas → DOM** | 仕様 §20 は Canvas 2D を推奨するが、DOM + CSS transition に変更。補間・再描画・要素管理のコードが丸ごと不要になり、描画対象が最大192個の矩形にすぎないため性能上の懸念もない（§2.2） |
| 9 | **React を採用** | 仕様 §20 は「Reactも必須ではない」とするが、DOM描画を選んだ結果、DOM同期コードを消すために採用する価値が生まれた。ロジックは `core/` に隔離するため、Reactを外しても中核は変わらない（§2.3） |

いずれも仕様を否定するものではないが、実装前に合意しておきたい箇所。特に 1・4・7・8 は後から変えると影響範囲が広い。
