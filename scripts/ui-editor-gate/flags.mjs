// Pass-line item 3 (docs/ui-editor-gate-rules.md): the flag verified on production-style builds served with `vite preview`.
//   node scripts/ui-editor-gate/flags.mjs [--out dir]
// Builds the site twice (VITE_SHOW_UI_EDITOR unset, then "true") into a temporary folder and, in headless Chromium, checks for each:
//   OFF  no UI Editor nav link, no fourth planet, /ui-editor shows the NotFound page, and no request for the page's chunk
//   ON   the nav link, four planets, /ui-editor loads the page (its chunk is requested only there), noindex meta, the page's tab title
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const args = process.argv.slice(2)
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(root, 'scripts/ui-editor-gate/out')
let chromium
try {
  const require = createRequire(import.meta.url)
  ;({ chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)))
} catch { console.error('needs Playwright (set PLAYWRIGHT_DIR).'); process.exit(2) }

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }

async function serve(flag, port) {
  const dir = join(out, flag ? 'dist-on' : 'dist-off')
  mkdirSync(dir, { recursive: true })
  const env = { ...process.env }
  delete env.VITE_SHOW_UI_EDITOR
  if (flag) env.VITE_SHOW_UI_EDITOR = 'true'
  const b = spawnSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir'], { cwd: root, env, encoding: 'utf8' })
  if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(1) }
  const chunk = readdirSync(join(dir, 'assets')).filter((f) => /^UiEditor.*\.js$/.test(f))
  const main = readdirSync(join(dir, 'assets')).filter((f) => /^index-.*\.js$/.test(f))
  const srv = spawn('npx', ['vite', 'preview', '--outDir', dir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)) }
  return { srv, chunk, main, dir }
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const flag of [false, true]) {
  const port = flag ? 4181 : 4180
  const { srv, chunk } = await serve(flag, port)
  const tag = flag ? 'ON ' : 'OFF'
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    const requested = []
    page.on('request', (r) => { if (/UiEditor/.test(r.url())) requested.push(r.url()) })
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
    await page.waitForSelector('.home-slot-live')
    const nav = (await page.locator('header.nav a, header.nav button').allInnerTexts()).filter((t) => t !== 'MAX NORRIS')
    const planets = await page.locator('.solar-planet').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    const homeText = await page.locator('body').innerText()
    check(`${tag} nav: ${nav.join(', ')}`, flag ? nav.includes('UI Editor') && nav.indexOf('UI Editor') === nav.length - 1 : !nav.includes('UI Editor') && nav.length === 5)
    check(`${tag} Home planets: ${planets.join(', ')}`, flag ? planets.length === 4 && planets[3] === 'UI Editor' : planets.length === 3)
    check(`${tag} nothing about it on Home`, flag ? true : !/UI Editor/i.test(homeText))
    check(`${tag} Home did not request the page's chunk`, requested.length === 0, requested.join(' '))
    const home = await page.content()
    check(`${tag} no noindex meta on Home`, !/name="robots"/.test(home))
    await page.goto(`http://127.0.0.1:${port}/ui-editor`, { waitUntil: 'load' })
    if (flag) {
      await page.waitForSelector('.ue-tool')
      check(`${tag} /ui-editor loads the page (chunk ${chunk.join(', ')})`, requested.length > 0 && (await page.title()).startsWith('UI Editor'), `requested ${requested.length}, title "${await page.title()}"`)
      check(`${tag} noindex meta while mounted`, (await page.locator('meta[name="robots"][content="noindex"]').count()) === 1)
      await page.getByRole('link', { name: 'Home' }).first().click()
      await page.waitForSelector('.home-slot-live')
      check(`${tag} noindex meta gone after leaving`, (await page.locator('meta[name="robots"]').count()) === 0)
    } else {
      await page.waitForSelector('.page-title')
      check(`${tag} /ui-editor is the NotFound page`, (await page.locator('.page-title').innerText()) === 'Page not found')
      check(`${tag} the page's chunk was not requested (a chunk file in the build: ${chunk.length ? chunk.join(', ') : 'none'})`, requested.length === 0, requested.join(' '))
      check(`${tag} no noindex meta`, (await page.locator('meta[name="robots"]').count()) === 0)
    }
    await ctx.close()
  } finally { srv.kill() }
}
await browser.close()
const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length} of ${results.length} checks passed`)
process.exit(bad.length ? 1 : 0)
