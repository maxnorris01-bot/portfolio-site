import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const dir = new URL('../src/shop/icons/', import.meta.url)
const vocabPath = join(homedir(), 'Desktop/Projects/shop-icon-vocabulary.json')
let keys: string[] = []
try {
  const vocab = JSON.parse(readFileSync(vocabPath, 'utf8')) as { icons: Record<string, Record<string, string[]>> }
  keys = Object.values(vocab.icons).flatMap((g) => Object.keys(g))
} catch {
  // The vocabulary lives outside the repo; without it, check every drawing that is here.
  keys = readdirSync(dir).filter((f) => f.endsWith('.svg') && !f.startsWith('_')).map((f) => f.slice(0, -4))
}

const FORBIDDEN = [/<script/i, /<style/i, /<image/i, /<foreignObject/i, /<filter/i, /Gradient/i, /href\s*=/i, /<text/i, /<tspan/i, /font/i, /currentColor/i, /\bon\w+\s*=/i]
const ALLOWED = new Set(['#0b1b33', '#e85d3f', '#eceae2', 'none'])

test('there are drawings to check', () => assert.ok(keys.length > 60))

for (const key of keys) {
  test(`icon ${key}`, () => {
    const svg = readFileSync(new URL(`${key}.svg`, dir), 'utf8')
    assert.ok(svg.startsWith('<svg'), 'starts with <svg>')
    assert.ok(svg.includes('viewBox="0 0 96 96"'), 'viewBox 0 0 96 96')
    const root = svg.match(/<svg[^>]*>/)![0]
    assert.ok(!/\swidth=/.test(root) && !/\sheight=/.test(root), 'no width/height on the root')
    assert.ok(svg.trimEnd().endsWith('</svg>'), 'closes </svg>')
    assert.ok(Buffer.byteLength(svg) < 4096, 'under 4 KB')
    for (const re of FORBIDDEN) assert.ok(!re.test(svg), `forbidden ${re}`)
    // well formed: every tag is balanced (self-closing or explicit)
    const stack: string[] = []
    for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
      if (m[3]) continue
      if (m[1]) assert.equal(stack.pop(), m[2], 'balanced tags')
      else stack.push(m[2])
    }
    assert.equal(stack.length, 0, 'balanced tags')
    for (const m of svg.matchAll(/(?:fill|stroke)="([^"]*)"/g)) assert.ok(ALLOWED.has(m[1].toLowerCase()), `colour ${m[1]}`)
    assert.ok(svg.includes('#E85D3F'), 'has the coral accent')
  })
}
