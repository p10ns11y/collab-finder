import path from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri sets TAURI_PLATFORM / TAURI_ENV when bundling the desktop shell.
// A plain `vite build` / `vite` is the public web preview and must not ship
// operator profile, project or constraint files.
const isTauriBuild = Boolean(process.env.TAURI_PLATFORM || process.env.TAURI_ENV)

function webPreviewFixturePlugin(): Plugin {
  const fixtures = path.resolve(__dirname, 'src/web/fixtures')
  const map = new Map([
    [
      path.resolve(__dirname, 'data/distillation/curation/profile-and-strategy.md'),
      path.join(fixtures, 'profile-and-strategy.md'),
    ],
    [
      path.resolve(__dirname, 'data/distillation/curation/candidate-constraints-compact.txt'),
      path.join(fixtures, 'candidate-constraints-compact.txt'),
    ],
    [
      path.resolve(__dirname, 'data/distillation/public-projects-focused-flatten.json'),
      path.join(fixtures, 'public-projects-focused-flatten.json'),
    ],
  ])
  return {
    name: 'web-preview-fixtures',
    enforce: 'pre',
    resolveId(source, importer) {
      if (isTauriBuild || !importer || !source) return null
      const queryIndex = source.indexOf('?')
      const bare = queryIndex === -1 ? source : source.slice(0, queryIndex)
      const query = queryIndex === -1 ? '' : source.slice(queryIndex)
      const importerDir = path.dirname(importer.split('?')[0])
      const abs = path.resolve(importerDir, bare)
      const dest = map.get(abs)
      if (!dest) return null
      return dest + query
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [webPreviewFixturePlugin(), react()],
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
