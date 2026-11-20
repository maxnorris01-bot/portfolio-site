// A screenshot-free measurement dump of the editor's ribbon geometry (round 5 baseline, docs/ui-editor-baseline-round5.md): at each host width, with the landing
// sample open and #card-build selected, the boxes of the quick bar, strip, ribbon bands, groups, controls, labels and the status line, as JSON and a short table.
//   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/geometry-dump.mjs --url http://127.0.0.1:4173/ui-editor [--out file.json]
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const args = process.argv.slice(2)
const url = args[args.indexOf('--url') + 1]
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const all = {}
for (const [w, h] of [[1000, 800], [1290, 800], [1440, 900], [1920, 1080]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage()
  await page.goto(url)
  await page.locator('[data-sample-card="landing"]').click()
  await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#card-build'))
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  await page.evaluate(() => { const f = document.querySelector('iframe[title="Preview"]'); const e = f.contentDocument.querySelector('#card-build'); window.scrollBy(0, f.getBoundingClientRect().top + e.getBoundingClientRect().top - innerHeight / 2) })
  const p = await page.evaluate(() => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const e = f.contentDocument.querySelector('#card-build').getBoundingClientRect(); return { x: fr.left + e.left + 14, y: fr.top + e.top + 14 } })
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(400)
  all[w] = await page.evaluate(() => {
    const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [+r.left.toFixed(1), +(r.top + scrollY).toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)] }
    const nameOf = (e) => e.getAttribute('aria-label') || e.textContent.trim()
    const groups = [...document.querySelectorAll('[data-ribbon-group]')].filter((g) => g.getClientRects().length)
    return {
      bar: R(document.querySelector('[role=group][aria-label="Editor controls"]')), strip: R(document.querySelector('[data-ribbon-strip]')), ribbon: R(document.querySelector('[data-ribbon]')), panel: R(document.querySelector('[data-ribbon-panel]')),
      status: R([...document.querySelectorAll('[role=status]')].find((e) => e.getAttribute('aria-label') === 'Edit result')), stage: R(document.querySelector('[data-stage-area]')),
      groups: groups.map((g) => ({ name: g.getAttribute('aria-label'), box: R(g), name_label: R(g.querySelector('[data-group-label]')), controls: [...g.querySelectorAll('button, input:not([type=hidden]), select')].filter((c) => c.getClientRects().length && !c.closest('[data-sides-popover]')).map((c) => [nameOf(c), R(c)]), labels: [...g.querySelectorAll('[data-ctl-label]')].map((l) => [l.textContent.trim(), R(l)]) })),
    }
  })
  await page.context().close()
}
if (out) writeFileSync(out, JSON.stringify(all, null, 1))
for (const [w, d] of Object.entries(all)) {
  const tops = [...new Set(d.groups.map((g) => Math.round(g.box[1] / 6)))]
  console.log(`${w}: bar ${d.bar?.join('x')} strip ${d.strip?.[3]} high, ribbon ${d.ribbon?.[2]} x ${d.ribbon?.[3]}, ${tops.length} band(s), status ${d.status?.[3]} high, stage top ${d.stage?.[1]}`)
  console.log('   groups: ' + d.groups.map((g) => `${g.name} ${g.box[0]}..${(g.box[0] + g.box[2]).toFixed(0)} (${g.box[2]})`).join('; '))
}
await b.close()
