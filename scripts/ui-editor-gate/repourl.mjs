// GitHub button round (docs/ui-editor-gate-rules-repourl.md): the locked pass line, read by script.
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/repourl.mjs --baseline <dist of main e56687c> [--root <repo folder>] [--out <folder>] [--full]
// A the button (href, new tab, rel, keyboard focus and ring); B layout at five sizes against the baseline build; C the look against SatPOV's button. --full adds P1 (tsc, eslint, build) and P2 (npm test).
// --root runs on another copy of the repo (a throwaway git worktree with a node_modules link): the scorer check applies faults there.
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const root = resolve(opt('--root', join(here, '..', '..')))
const out = resolve(opt('--out', join(here, 'out', 'repourl')))
const baseline = opt('--baseline')
const URL_WANTED = 'https://github.com/maxnorris01-bot/ui-editor'
mkdirSync(out, { recursive: true })
const items = []
const item = (id, ok, detail) => { items.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`) }
const env = { ...process.env }; delete env.VITE_SHOW_UI_EDITOR

if (args.includes('--full')) {
  const a = spawnSync('npx', ['tsc', '-b'], { cwd: root, encoding: 'utf8' }), b = spawnSync('npx', ['eslint', '.'], { cwd: root, encoding: 'utf8' })
  const c = spawnSync('npx', ['vite', 'build', '--outDir', join(out, 'dist-p1'), '--emptyOutDir'], { cwd: root, encoding: 'utf8', env })
  item('P1', a.status === 0 && b.status === 0 && c.status === 0, `tsc ${a.status}, eslint ${b.status}, vite build ${c.status}`)
  const t = spawnSync('npm', ['test'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
  const n = (k) => Number(new RegExp(`^ℹ ${k} (\\d+)`, 'm').exec(t.stdout)?.[1])
  const got = { tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped') }
  item('P2', got.tests === 942 && got.pass === 926 && got.fail === 0 && got.skipped === 16, `npm test ${JSON.stringify(got)} (expected 942 / 926 / 0 / 16)`)
}

const dist = join(out, 'dist')
const bd = spawnSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], { cwd: root, encoding: 'utf8', env })
if (bd.status !== 0) { console.error(bd.stdout, bd.stderr); process.exit(1) }
const serve = async (dir, port) => {
  const srv = spawn('npx', ['vite', 'preview', '--outDir', dir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'ignore' })
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)) }
  return srv
}
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const servers = [await serve(dist, 4461)]
if (baseline && existsSync(baseline)) servers.push(await serve(baseline, 4462))
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const SIZES = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [1000, 800], [390, 844]] // 1000 is added by amendment A2 (the ribbon specs measure the page at 1000 px)
const measure = async (port, w, h) => {
  const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage()
  await p.goto(`http://127.0.0.1:${port}/ui-editor`); await p.waitForSelector('.ue-tool')
  const r = await p.evaluate(() => {
    const l = document.querySelector('.page-lede'), g = document.querySelector('.ue-github')
    const gr = g?.getBoundingClientRect()
    return { lines: Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight)), tool: document.querySelector('.ue-tool').getBoundingClientRect().top + scrollY, overflow: document.documentElement.scrollWidth - innerWidth, inside: gr ? gr.left >= 0 && gr.right <= innerWidth : false }
  })
  await p.context().close()
  return r
}
try {
  // A
  {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await p.goto('http://127.0.0.1:4461/ui-editor'); await p.waitForSelector('.ue-tool')
    const g = p.locator('a.ue-github')
    const n = await g.count()
    const a = n ? await g.evaluate((e) => ({ href: e.href, target: e.target, rel: e.rel })) : null
    let reached = false, ring = false
    if (n) {
      for (let i = 0; i < 80 && !reached; i++) { await p.keyboard.press('Tab'); reached = await g.evaluate((e) => e === document.activeElement) }
      if (reached) ring = await g.evaluate((e) => { const s = getComputedStyle(e); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none' })
    }
    const ok = !!a && a.href === URL_WANTED && a.target === '_blank' && /noreferrer/.test(a.rel) && reached && ring
    item('A', ok, `buttons ${n}; ${JSON.stringify(a)}; reached by Tab ${reached}; focus ring ${ring}`)
    await p.context().close()
  }
  // B
  {
    const rows = [], bad = []
    for (const [w, h] of SIZES) {
      const now = await measure(4461, w, h)
      const base = servers.length > 1 ? await measure(4462, w, h) : null
      rows.push(`${w}: ${now.lines} line(s), tool top ${now.tool.toFixed(2)}${base ? ` (main ${base.lines}, ${base.tool.toFixed(2)})` : ''}, overflow ${now.overflow}`)
      if (!base) bad.push('no baseline')
      else {
        if (now.lines !== base.lines) bad.push(`${w}: lead lines ${now.lines} against ${base.lines}`)
        if (w > 640 && Math.abs(now.tool - base.tool) > 0.5) bad.push(`${w}: tool top moved ${(now.tool - base.tool).toFixed(2)}`)
      }
      if (now.overflow > 0) bad.push(`${w}: horizontal overflow ${now.overflow}`)
      if (!now.inside) bad.push(`${w}: button outside the window or missing`)
    }
    item('B', bad.length === 0, `${rows.join(' | ')}${bad.length ? '; ' + bad.join('; ') : ''}`)
  }
  // C
  {
    const notes = [], bad = []
    for (const [w, h] of [[1280, 720], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } })
      const p = await ctx.newPage()
      const look = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return { cls: e.className, pad: c.padding, fs: c.fontSize, h: e.getBoundingClientRect().height } }, sel)
      await p.goto('http://127.0.0.1:4461/ui-editor'); await p.waitForSelector('.ue-tool')
      const mine = await look('a.ue-github')
      await p.goto('http://127.0.0.1:4461/satellite-conjunction-screening'); await p.waitForSelector('.sat-github')
      const sat = await look('.sat-github')
      notes.push(`${w}: ${JSON.stringify(mine && { pad: mine.pad, fs: mine.fs, h: mine.h })} against SatPOV ${JSON.stringify(sat && { pad: sat.pad, fs: sat.fs, h: sat.h })}`)
      if (!mine || !sat) bad.push(`${w}: a button is missing`)
      else {
        if (!/\bbtn btn-secondary\b/.test(mine.cls)) bad.push(`${w}: classes "${mine.cls}"`)
        if (mine.pad !== sat.pad || mine.fs !== sat.fs || Math.abs(mine.h - sat.h) > 1) bad.push(`${w}: not SatPOV's size`)
      }
      await ctx.close()
    }
    item('C', bad.length === 0, `${notes.join(' | ')}${bad.length ? '; ' + bad.join('; ') : ''}`)
  }
} finally { for (const s of servers) s.kill(); await browser.close() }
const bad = items.filter((i) => !i.ok)
console.log(`\nREPOURL VERDICT: ${bad.length ? 'FAIL' : 'PASS'} (${items.length - bad.length} of ${items.length} items${bad.length ? '; failed: ' + bad.map((i) => i.id).join(', ') : ''})`)
process.exit(bad.length ? 1 : 0)
