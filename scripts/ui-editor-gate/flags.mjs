// Release gate, R01 (docs/ui-editor-gate-rules-release.md section 4): the production-style build with NO environment variable, served with `vite preview`.
//   node scripts/ui-editor-gate/flags.mjs [--out dir] [--root repo-folder]
// Builds the site once with VITE_SHOW_UI_EDITOR unset (and once with it set to "false", only to compare the two) into a folder and checks, in headless Chromium: 12 checks.
// (Before the release this script built twice, flag unset and "true", and checked the OFF build too: 16 checks; those checks are retired, see the rules file 3.3.)
// --root runs it on another copy of the repo (a git worktree with a node_modules link): the scorer check applies faults there.
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const root = resolve(opt('--root', join(here, '..', '..')))
const out = resolve(opt('--out', join(here, 'out')))
let chromium
try {
  const require = createRequire(import.meta.url)
  ;({ chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)))
} catch { console.error('needs Playwright (set PLAYWRIGHT_DIR).'); process.exit(2) }

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }

const walk = (dir, base = dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p, base) : [p.slice(base.length + 1)] }).sort()

function build(dirName, variable) {
  const dir = join(out, dirName)
  mkdirSync(dir, { recursive: true })
  const env = { ...process.env }
  delete env.VITE_SHOW_UI_EDITOR
  if (variable !== undefined) env.VITE_SHOW_UI_EDITOR = variable
  const b = spawnSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir'], { cwd: root, env, encoding: 'utf8' })
  if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(1) }
  return dir
}

const dir = build('dist-novar')
const dirFalse = build('dist-false', 'false')
const port = 4180
const env = { ...process.env }
delete env.VITE_SHOW_UI_EDITOR
const chunk = readdirSync(join(dir, 'assets')).filter((f) => /^UiEditor.*\.js$/.test(f))
const srv = spawn('npx', ['vite', 'preview', '--outDir', dir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'ignore' })
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)) }

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const requested = []
  page.on('request', (r) => { if (/UiEditor/.test(r.url())) requested.push(r.url()) })
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
  await page.waitForSelector('.home-slot-live')
  const nav = (await page.locator('header.nav a, header.nav button').allInnerTexts()).filter((t) => t !== 'MAX NORRIS')
  const planets = await page.locator('.solar-planet').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  const bodyText = await page.locator('body').textContent()
  check(`1 nav: ${nav.join(', ')}`, nav.length === 6 && nav[5] === 'UI Editor')
  check(`2 Home planets: ${planets.join(', ')}`, planets.length === 4 && planets[3] === 'UI Editor')
  check('3 the Backend row has the UI Editor sentence', bodyText.includes(' UI Editor runs in your browser.'))
  check("4 Home did not request the page's chunk", requested.length === 0, requested.join(' '))
  check('5 no robots meta on Home', (await page.locator('meta[name="robots"]').count()) === 0)
  await page.goto(`http://127.0.0.1:${port}/ui-editor`, { waitUntil: 'load' })
  await page.waitForSelector('.ue-tool')
  check(`6 /ui-editor loads the page (chunk ${chunk.join(', ')})`, requested.length > 0 && (await page.title()).startsWith('UI Editor'), `requested ${requested.length}, title "${await page.title()}"`)
  check('7 no robots meta while the page is mounted', (await page.locator('meta[name="robots"]').count()) === 0)
  await page.getByRole('link', { name: 'Home' }).first().click()
  await page.waitForSelector('.home-slot-live')
  check('8 no robots meta after leaving it', (await page.locator('meta[name="robots"]').count()) === 0)
  await ctx.close()
} finally { srv.kill(); await browser.close() }

const files = walk(dir)
const textual = files.filter((f) => /\.(js|css|html|json|svg|txt|map|webmanifest)$/.test(f))
const hits = textual.filter((f) => /noindex/i.test(readFileSync(join(dir, f), 'utf8')))
check('9 no "noindex" in any text file of dist', hits.length === 0, hits.join(' '))
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
const shop = vercel.headers?.find((h) => h.source === '/api/shop/:path*')
check('10 vercel.json has no X-Robots-Tag and still has the shop header', !/x-robots-tag/i.test(JSON.stringify(vercel)) && shop?.headers?.[0]?.key === 'x-vercel-enable-rewrite-caching')
const other = walk(dirFalse)
const same = JSON.stringify(files) === JSON.stringify(other) && files.every((f) => readFileSync(join(dir, f)).equals(readFileSync(join(dirFalse, f))))
check('11 a build with VITE_SHOW_UI_EDITOR=false is byte for byte the no-variable build', same)
check('12 the built index.html has no robots meta', !/<meta[^>]*name=["']robots/i.test(readFileSync(join(dir, 'index.html'), 'utf8')))

const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length} of ${results.length} checks passed`)
process.exit(bad.length ? 1 : 0)
