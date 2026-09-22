import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// M5でGitHub Pagesへ配置する際は base を '/slim-block/' 等に設定する。
export default defineConfig({
  plugins: [react()],
});
