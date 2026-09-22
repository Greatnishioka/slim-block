import { defineConfig } from 'vitest/config';

// core/ の純粋ロジックのみを対象にする（DOM不要のため node 環境で十分）。
// arch.md §11: React コンポーネントのテストは書かない。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
