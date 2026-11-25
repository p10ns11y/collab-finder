#!/usr/bin/env node
/**
 * Serve dist/, curl the first page, then walk each hash route in headless
 * Chrome with no Tauri runtime. Fails on a throw, a console error, or a
 * request to any host other than this preview server.
 *
 * Run after `pnpm build:web`: node scripts/web-preview-smoke.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, process.argv[2] || process.env.WEB_DIST || 'apps/desktop/dist-web')
if (!existsSync(dist)) {
  console.error('web-preview-smoke: web output is missing. Run pnpm build:web first.')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
}

const routes = [
  '/',
  '/#navigating',
  '/#discover',
  '/#pipeline',
  '/#mission',
  '/#sweden',
  '/#xplore',
  '/#network',
  '/#settings',
  '/#preferences',
]

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        let path = decodeURIComponent(url.pathname)
        if (path === '/') path = '/index.html'
        const file = join(dist, path)
        if (!file.startsWith(dist)) {
          res.writeHead(403)
          res.end()
          return
        }
        const body = await readFile(file).catch(async () => readFile(join(dist, 'index.html')))
        const type = MIME[extname(file)] || 'application/octet-stream'
        res.writeHead(200, { 'content-type': type })
        res.end(body)
      } catch (err) {
        res.writeHead(500)
        res.end(String(err))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve({ server, origin: `http://127.0.0.1:${addr.port}` })
    })
    server.on('error', reject)
  })
}

async function waitFor(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`timeout waiting for ${url}`)
}

async function startChrome(port) {
  const chromeBin = process.env.CHROME_BIN || 'google-chrome'
  const userData = `/tmp/cf-web-smoke-${process.pid}`
  const child = spawn(
    chromeBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  await waitFor(`http://127.0.0.1:${port}/json/version`)
  return child
}

async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  let nextId = 1
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data))
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
      return
    }
    if (msg.method) events.push(msg)
  })
  async function send(method, params = {}) {
    const id = nextId++
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    ws.send(JSON.stringify({ id, method, params }))
    return result
  }
  return { ws, send, events }
}

async function openPage(debugPort, url) {
  const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  }).then(async (r) => {
    const text = await r.text()
    try {
      return JSON.parse(text)
    } catch (cause) {
      throw new Error(`/json/new ${r.status}: ${text.slice(0, 200)}`)
    }
  })
  const session = await cdpSession(created.webSocketDebuggerUrl)
  await session.send('Runtime.enable')
  await session.send('Console.enable')
  await session.send('Log.enable')
  await session.send('Network.enable')
  await session.send('Page.enable')
  return { ...session, id: created.id, debugPort }
}

async function closePage(page) {
  page.ws.close()
  await fetch(`http://127.0.0.1:${page.debugPort}/json/close/${page.id}`).catch(() => {})
}

async function readPage(page) {
  // Allow React to paint and effects to run.
  await new Promise((r) => setTimeout(r, 800))
  const evalRes = await page.send('Runtime.evaluate', {
    expression: `({
      title: document.title,
      text: document.body ? document.body.innerText : '',
      html: document.documentElement ? document.documentElement.outerHTML : ''
    })`,
    returnByValue: true,
  })
  return evalRes.result.value
}

function isAllowedUrl(origin, raw) {
  if (
    !raw ||
    raw === 'about:blank' ||
    raw.startsWith('chrome://') ||
    raw.startsWith('chrome-extension://') ||
    raw.startsWith('devtools://')
  ) {
    return true
  }
  try {
    const u = new URL(raw)
    return u.origin === origin
  } catch {
    return false
  }
}

const { server, origin } = await startStaticServer()
const debugPort = 9223
let chrome
let failed = 0
const findings = []

try {
  const first = await fetch(origin + '/')
  const body = await first.text()
  console.log(`curl ${origin}/ -> ${first.status}, ${body.length} bytes`)
  if (first.status !== 200) {
    failed += 1
    findings.push(`curl / status ${first.status}`)
  }
  if (!body.includes('kanithanj.ai')) {
    failed += 1
    findings.push('curl / does not contain kanithanj.ai')
  }
  if (/Cannot read properties of undefined/.test(body)) {
    failed += 1
    findings.push('curl / contains the invoke crash text in the HTML shell')
  }

  chrome = await startChrome(debugPort)

  for (const route of routes) {
    const url = origin + route
    const page = await openPage(debugPort, url)
    const snapshot = await readPage(page)
    const consoleErrors = page.events
      .filter((e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Console.messageAdded' && ['error', 'assert'].includes(e.params?.message?.level)) ||
        (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'),
      )
      .map((e) => JSON.stringify(e.params).slice(0, 300))
    const blocked = page.events
      .filter((e) => e.method === 'Network.requestWillBeSent')
      .map((e) => e.params?.request?.url)
      .filter((u) => !isAllowedUrl(origin, u))

    const text = snapshot?.text || ''
    const title = snapshot?.title || ''
    console.log(`\n== ${route}`)
    console.log(`title: ${title}`)
    console.log(`first-screen text:\n${text.split('\n').slice(0, 12).join('\n')}`)

    if (title !== 'kanithanj.ai') {
      failed += 1
      findings.push(`${route} title is ${JSON.stringify(title)}`)
    }
    if (!text.includes('kanithanj.ai')) {
      failed += 1
      findings.push(`${route} body does not show kanithanj.ai`)
    }
    if (!text.includes('web preview')) {
      failed += 1
      findings.push(`${route} is missing the web preview notice`)
    }
    if (/Cannot read properties of undefined \(reading 'invoke'\)/.test(text)) {
      failed += 1
      findings.push(`${route} shows the invoke crash`)
    }
    if (/Something went wrong/.test(text)) {
      failed += 1
      findings.push(`${route} hit the error boundary`)
    }
    if (consoleErrors.length) {
      failed += 1
      findings.push(`${route} console errors: ${consoleErrors.join(' | ')}`)
    }
    if (blocked.length) {
      failed += 1
      findings.push(`${route} requested off-origin URLs: ${blocked.join(', ')}`)
    }
    await closePage(page)
  }
} catch (err) {
  failed += 1
  findings.push(String(err && err.stack ? err.stack : err))
} finally {
  if (chrome) chrome.kill('SIGTERM')
  server.close()
}

if (failed > 0) {
  console.error('\nFAIL web-preview-smoke:')
  for (const row of findings) console.error(' -', row)
  process.exit(1)
}
console.log('\nOK: web preview routes load with no throw, no console error, and no private endpoint calls')
