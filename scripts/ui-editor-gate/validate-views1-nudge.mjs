// Views round 1: validates the hand-derived expected values of specs-views1-nudge.json ("truth") in plain Chromium WITHOUT the engine.
//   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/validate-views1.mjs
// For each truth entry the original page (a sample or a fixture of reference/) gets its `referenceCss` appended (hand-written, plain CSS; no engine, no editor) and the computed value of
// each check is read at each width and compared with the expected one (lengths in px within 0.05 px, everything else exactly). Exit 1 when any value differs.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
let chromium
try {
  const require = createRequire(import.meta.url)
  ;({ chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)))
} catch { console.error('needs Playwright (set PLAYWRIGHT_DIR).'); process.exit(2) }

const file = JSON.parse(readFileSync(join(here, 'specs-views1-nudge.json'), 'utf8'))
const samples = join(root, 'src', 'ui-editor', 'samples')
const pages = {
  landing: (css) => ({ 'landing.html': readFileSync(join(samples, 'landing.html'), 'utf8'), 'landing.css': readFileSync(join(samples, 'landing.css'), 'utf8') + (css ? `\n${css}\n` : '') }),
  tab900: (css) => ({ 'page.html': readFileSync(join(here, 'reference/views1-tab900.html'), 'utf8').replace('</head>', css ? `<style>${css}</style>\n</head>` : '</head>') }),
  bp768: (css) => ({ 'page.html': readFileSync(join(here, 'reference/views1-bp768.html'), 'utf8').replace('</head>', css ? `<style>${css}</style>\n</head>` : '</head>') }),
}
const served = new Map()
const srv = createServer((q, r) => {
  const f = decodeURIComponent(new URL(q.url, 'http://x').pathname.slice(1))
  if (!served.has(f)) { r.statusCode = 404; return r.end() }
  r.setHeader('content-type', f.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8')
  r.end(served.get(f))
})
await new Promise((res) => srv.listen(0, '127.0.0.1', res))
const port = srv.address().port
const browser = await chromium.launch({ headless: true })
const same = (have, want) => (/^-?[\d.]+px$/.test(want) && have && /^-?[\d.]+px$/.test(have) ? Math.abs(parseFloat(have) - parseFloat(want)) <= 0.05 : have === want)
let bad = 0, n = 0
for (const [id, t] of Object.entries(file.truth)) {
  const files = pages[t.page](t.referenceCss)
  for (const [f, text] of Object.entries(files)) served.set(f, text)
  const entry = Object.keys(files).find((f) => f.endsWith('.html'))
  const problems = []
  const widths = [...new Set(t.checks.flatMap((c) => Object.keys(c.at)))]
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: Number(w), height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`http://127.0.0.1:${port}/${entry}`)
    for (const c of t.checks) {
      if (!(w in c.at)) continue
      const have = await page.evaluate(([s, p]) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : null }, [c.sel, c.prop])
      n++
      if (!same(have, c.at[w])) problems.push(`${c.sel} ${c.prop} @${w}: ${have}, expected ${c.at[w]}`)
    }
    await ctx.close()
  }
  bad += problems.length
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${id} (${t.page}) ${t.checks.length} checks, ${widths.length} widths${problems.length ? '\n      ' + problems.join('\n      ') : ''}`)
}
await browser.close()
srv.close()
console.log(`\n${n - bad} of ${n} values equal the hand-written reference in plain Chromium`)
process.exit(bad ? 1 : 0)
