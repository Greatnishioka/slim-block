// spec.md §14: score = 100 × n²（nは一度に回収した塊のセル数）。
// 分割回収より一括回収の方が高得点になることでゲームのリスク・リターン構造が成立する。
export const scoreOf = (n: number): number => 100 * n * n;
