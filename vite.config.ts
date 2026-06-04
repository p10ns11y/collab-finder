import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@ports': path.resolve(__dirname, 'src/ports'),
      '@adapters': path.resolve(__dirname, 'src/adapters'),
      '@runtime': path.resolve(__dirname, 'src/runtime'),
      '@view': path.resolve(__dirname, 'src/view'),
      '@data': path.resolve(__dirname, 'data'),
    },
  },
  // Tauri expects a fixed port in dev
  server: {
    port: 5173,
    strictPort: true,
    // Tauri dev server needs host for some setups
    host: '127.0.0.1',
  },
  // to access the Tauri environment variables set by the CLI with process.env.TAURI_*
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
