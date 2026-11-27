// Release gate (docs/ui-editor-gate-rules-release.md): reads the locked pass line and prints the verdict by script.
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/release.mjs --old-on <dist of main 8916e84 built with VITE_SHOW_UI_EDITOR=true> --old-layout <check-layout --home output of that build>
//        [--root <repo folder>] [--out <folder>] [--quick] [--gate-results <results.json of a whole run>] [--only R01,R02,R03,R04]
// Items (rules section 2): P1 tsc, eslint, build; P2 npm test counts; R01 flags.mjs 12 of 12; R02 byte comparison with the old ON build; R03 check-layout --home output equal to the old ON build's;
// R04 headless preview, one real edit; G whole gate (only T10 fails, the six flag-OFF specs RETIRED); S9 nothing changed that must not; S10 no flag or noindex string left.
// --quick leaves out P1, P2, R03 and S9 (the scorer check applies faults in a throwaway worktree, where those are not the question). --root runs everything on another copy of the repo.
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const flag = (n) => args.includes(n)
const root = resolve(opt('--root', join(here, '..', '..')))
const out = resolve(opt('--out', join(here, 'out', 'release')))
const oldOn = opt('--old-on'), oldLayout = opt('--old-layout'), gateResults = opt('--gate-results')
const quick = flag('--quick')
const only = opt('--only')?.split(',')
mkdirSync(out, { recursive: true })
const want = (id) => !only || only.includes(id)
const run = (cmd, a, o = {}) => spawnSync(cmd, a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, ...o })
const items = []
const item = (id, ok, detail) => { items.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`) }
const walk = (dir, base = dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p, base) : [p.slice(base.length + 1)] }).sort()

if (!quick && want('P1')) {
  const a = run('npx', ['tsc', '-b']), b = run('npx', ['eslint', '.']), c = run('npx', ['vite', 'build', '--outDir', join(out, 'dist-p1'), '--emptyOutDir'], { env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'VITE_SHOW_UI_EDITOR')) })
  item('P1', a.status === 0 && b.status === 0 && c.status === 0, `tsc ${a.status}, eslint ${b.status}, vite build with no variable ${c.status}`)
}
if (!quick && want('P2')) {
  const t = run('npm', ['test'])
  const n = (k) => Number(new RegExp(`^ℹ ${k} (\\d+)`, 'm').exec(t.stdout)?.[1])
  const got = { tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped') }
  item('P2', got.tests === 941 && got.pass === 925 && got.fail === 0 && got.skipped === 16, `npm test ${JSON.stringify(got)} (expected 941 / 925 / 0 / 16, amendment A1)`)
}
if (want('R01')) {
  const f = run('node', [join(here, 'flags.mjs'), '--root', root, '--out', join(out, 'flags')], { env: process.env, timeout: 600000 })
  const m = /(\d+) of (\d+) checks passed/.exec(f.stdout ?? '')
  const fails = (f.stdout ?? '').split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(6, 60))
  item('R01', f.status === 0 && !!m && m[1] === '12' && m[2] === '12', `flags.mjs ${m ? `${m[1]} of ${m[2]}` : 'no result'}${fails.length ? '; failed: ' + fails.join(' | ') : ''}`)
}
if (want('R02')) {
  const nowDir = join(out, 'flags', 'dist-novar')
  if (!oldOn || !existsSync(oldOn) || !existsSync(nowDir)) item('R02', false, 'needs --old-on and the R01 build')
  else {
    const HASHED = /([A-Za-z0-9_$.]+?)-[A-Za-z0-9_-]{8}\.(js|css)\b/g
    const unhash = (s) => s.replace(HASHED, '$1-HASH.$2')
    const unbuild = (s) => s.replace(/\b[0-9a-f]{7}\b(?=[`'", ]*\((?:local|preview|production)\))/g, 'BUILD')
    const textual = (p) => /\.(js|css|html|json|svg|txt|map)$/.test(p)
    const group = (d) => { const m = new Map(); for (const p of walk(d)) { const k = unhash(p); const c = textual(p) ? unbuild(unhash(readFileSync(join(d, p), 'utf8'))) : readFileSync(join(d, p)).toString('base64'); if (!m.has(k)) m.set(k, []); m.get(k).push(c) } for (const v of m.values()) v.sort(); return m }
    const A = group(oldOn), B = group(nowDir)
    const lists = JSON.stringify([...A.keys()]) === JSON.stringify([...B.keys()])
    const differ = [...A.keys()].filter((k) => { const w = B.get(k); const v = A.get(k); return w && (v.length !== w.length || v.some((x, i) => x !== w[i])) })
    const allowed = (k) => /^(assets\/)?(index-HASH\.js|UiEditor-HASH\.js)$/.test(k) || k === 'index.html'
    const unexpected = differ.filter((k) => !allowed(k))
    item('R02', lists && unexpected.length === 0, `file lists ${lists ? 'equal' : 'DIFFER'}; files that differ after hash and build-commit normalisation: ${differ.join(', ') || 'none'}${unexpected.length ? '; UNEXPECTED: ' + unexpected.join(', ') : ''}`)
  }
}
if (!quick && want('R03')) {
  if (!oldLayout || !existsSync(oldLayout)) item('R03', false, 'needs --old-layout')
  else {
    const env = { ...process.env }; delete env.VITE_SHOW_UI_EDITOR
    const r = run('node', [join(root, 'scripts', 'check-layout.mjs'), '--home'], { env, timeout: 600000 })
    writeOut('layout-new.txt', r.stdout + r.stderr)
    const same = (r.stdout + r.stderr).trim() === readFileSync(oldLayout, 'utf8').trim()
    item('R03', r.status === 0 && same, `check-layout --home exit ${r.status}; output ${same ? 'identical to' : 'DIFFERENT from'} the old ON build's`)
  }
}
if (want('R04')) {
  let chromium
  const require = createRequire(import.meta.url)
  ;({ chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)))
  const dist = join(out, 'flags', 'dist-novar'), port = 4182
  const env = { ...process.env }; delete env.VITE_SHOW_UI_EDITOR
  const srv = spawn('npx', ['vite', 'preview', '--outDir', dist, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)) }
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const notes = []
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
    await page.waitForSelector('.home-slot-live')
    const nav = (await page.locator('header.nav a, header.nav button').allInnerTexts()).filter((t) => t !== 'MAX NORRIS')
    notes.push(`nav ${nav.at(-1)}`)
    let ok = nav.at(-1) === 'UI Editor'
    await page.locator('.solar-planet[aria-label="UI Editor"]').click()
    const title = await page.locator('.home-title').first().innerText().catch(() => '')
    const card = await page.locator('.home-slot-live').innerText()
    ok = ok && /UI Editor/.test(card)
    notes.push(`Home card opens: ${/UI Editor/.test(card)}`)
    ok = ok && (await page.locator('meta[name="robots"]').count()) === 0
    await page.getByRole('link', { name: 'Open UI Editor' }).click()
    await page.waitForSelector('.ue-tool')
    await page.locator('[data-sample-card="landing"]').click()
    await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#headline'))
    await page.waitForTimeout(500)
    const where = () => page.evaluate(() => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const b = f.contentDocument.querySelector('#headline').getBoundingClientRect(); return { x: fr.left + (b.left + b.width / 2) * k, y: fr.top + (b.top + b.height / 2) * k, left: b.left } })
    const p0 = await where()
    await page.mouse.click(p0.x, p0.y)
    await page.waitForTimeout(400)
    for (let i = 0; i < 3; i++) { await page.locator('[data-ribbon] [data-spin="up"][data-for="Nudge X"]').click(); await page.waitForTimeout(300) }
    const p1 = await where()
    const moved = Math.abs(p1.left - p0.left)
    notes.push(`headline moved ${moved.toFixed(1)} px after three Nudge X clicks`)
    ok = ok && moved > 0.5
    const robots = await page.locator('meta[name="robots"]').count()
    notes.push(`robots meta on the page: ${robots}`)
    ok = ok && robots === 0 && (await page.title()).startsWith('UI Editor')
    await page.screenshot({ path: join(out, 'r04-ui-editor.png') })
    await ctx.close()
    item('R04', ok, notes.join('; '))
  } catch (e) { item('R04', false, `${notes.join('; ')}; ${String(e).split('\n')[0]}`) } finally { srv.kill(); await browser.close() }
}
if (want('G') && gateResults) {
  const g = JSON.parse(readFileSync(gateResults, 'utf8'))
  const by = Object.fromEntries(g.results.map((r) => [r.id, r.outcome]))
  const fails = g.results.filter((r) => r.outcome === 'FAIL').map((r) => r.id)
  const six = ['X32', 'Q09', 'H14', 'B10', 'L11', 'M09']
  const notRetired = six.filter((id) => by[id] !== 'RETIRED')
  item('G', fails.length === 1 && fails[0] === 'T10' && notRetired.length === 0, `whole gate: ${g.results.length} specs, FAIL ${fails.join(', ') || 'none'}; the six flag-OFF specs not RETIRED: ${notRetired.join(', ') || 'none'}`)
}
if (!quick && want('S9')) {
  const d = run('git', ['diff', '--name-only', 'main...HEAD']).stdout.split('\n').filter(Boolean)
  const bad = d.filter((f) => /^src\/ui-editor\/vendor\/|\.css$/.test(f) || /^docs\/ui-editor-gate-rules(?!-release)/.test(f) || /^scripts\/ui-editor-gate\/specs-(?!release)/.test(f))
  item('S9', bad.length === 0, `changed files that must not change (vendored engine, any CSS, old locked rules and specs): ${bad.join(', ') || 'none'}`)
}
if (want('S10')) {
  const bad = /VITE_SHOW_UI_EDITOR|UI_EDITOR_ON|isUiEditorOn|uiEditorFlag|useNoIndex|applyNoIndex|X-Robots-Tag|noindex/i
  const hits = []
  for (const dir of ['src', 'public']) for (const f of walk(join(root, dir))) if (/\.(ts|tsx|css|js|json|html|svg|txt|md)$/.test(f) && bad.test(readFileSync(join(root, dir, f), 'utf8'))) hits.push(`${dir}/${f}`)
  for (const f of ['index.html', 'vercel.json', 'vite.config.ts']) if (existsSync(join(root, f)) && bad.test(readFileSync(join(root, f), 'utf8'))) hits.push(f)
  item('S10', hits.length === 0, `flag or noindex strings left in src, public, index.html, vercel.json, vite.config: ${hits.join(', ') || 'none'}`)
}
const bad = items.filter((i) => !i.ok)
console.log(`\nRELEASE VERDICT: ${bad.length ? 'FAIL' : 'PASS'} (${items.length - bad.length} of ${items.length} items${bad.length ? '; failed: ' + bad.map((i) => i.id).join(', ') : ''})`)
process.exit(bad.length ? 1 : 0)

function writeOut(name, text) { writeFileSync(join(out, name), text) }
