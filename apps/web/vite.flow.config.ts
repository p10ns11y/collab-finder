import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: false,
    target: 'es2022',
    modulePreload: false,
    emptyOutDir: false,
    rollupOptions: { input: { flow: 'flow/index.html' } },
  },
});
