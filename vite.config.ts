import { defineConfig } from 'vite';

export default defineConfig({
  // クライアントをルートに(shared/ は ../shared として import される)
  root: 'client',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 駒画像はWebP最適化済みのためインライン化しない
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
  },
});
