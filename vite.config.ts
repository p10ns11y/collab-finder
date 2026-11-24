import path from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Demo fixtures are an explicit opt-in for the public web preview.
 * Use `pnpm build:web` (`vite build --mode web-preview`) or `WEB_PREVIEW=1`.
 * The default `pnpm build`, including Tauri 2's `beforeBuildCommand`, keeps
 * the real operator files. Tauri 2 sets TAURI_ENV_PLATFORM, not TAURI_PLATFORM.
 */
function isWebPreview(mode: string): boolean {
  return mode === 'web-preview' || process.env.WEB_PREVIEW === '1'
}

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
      if (!importer || !source) return null
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

function isStandingAnswersId(id: string): boolean {
  return /standing-answers/i.test(id) || id.includes('STANDING_ANSWERS')
}

function standingAnswersGuardPlugin(): Plugin {
  const refuse = (id: string): never => {
    throw new Error(`standing-answers must never enter the client bundle: ${path.basename(id)}`)
  }
  return {
    name: 'standing-answers-guard',
    enforce: 'pre',
    resolveId(source) {
      if (isStandingAnswersId(source)) refuse(source)
      return null
    },
    load(id) {
      if (isStandingAnswersId(id)) refuse(id)
      return null
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const webPreview = isWebPreview(mode)
  const tauriPlatform = process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM
  const tauriDebug = process.env.TAURI_ENV_DEBUG || process.env.TAURI_DEBUG
  return {
    plugins: [standingAnswersGuardPlugin(), ...(webPreview ? [webPreviewFixturePlugin()] : []), react()],
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
      outDir: webPreview && mode === 'web-preview' ? 'dist-web' : 'dist',
      emptyOutDir: true,
      // Tauri uses Chromium on Windows and WebKit on macOS and Linux
      target: tauriPlatform == 'windows' ? 'chrome105' : 'safari13',
      // don't minify for debug builds
      minify: !tauriDebug ? 'esbuild' : false,
      // produce sourcemaps for debug builds
      sourcemap: !!tauriDebug,
    },
  }
})
