import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { SAMPLE_FILES } from '../src/ui-editor/samples/manifest.ts'

const dir = new URL('../src/ui-editor/vendor/', import.meta.url)
const read = (f: string) => readFileSync(new URL(f, dir), 'utf8')
const COMMIT = 'a5f954a610cfdf2693fadd2a7b105b4acf59a9e3'

type Engine = {
  createModel: (source: string, kind: 'html' | 'svg', companions?: Record<string, string>, file?: string) => { primary: { elements: unknown[]; source: string }; sheets: unknown[] }
  sources: (model: unknown) => Record<string, string>
  exportFiles: (s: Record<string, string>, p: unknown[]) => Record<string, string>
  breakpointOf: (model: unknown) => number
  emptyState: () => { pins: unknown[] }
}
const engine = (await import(new URL('engine.js', dir).href)) as Engine & Record<string, unknown>

test('the vendored engine is one built file whose header names the source commit and the build command, and it has not been edited by hand', () => {
  const js = read('engine.js')
  const head = js.split('\n')[0]
  assert.match(head, new RegExp(`commit ${COMMIT}`))
  assert.match(head, /esbuild engine\/src\/index\.ts --bundle --format=esm --platform=browser --target=es2022 --minify --legal-comments=none/)
  const readme = read('README.md')
  assert.ok(readme.includes(COMMIT))
  assert.ok(readme.includes(createHash('sha256').update(js).digest('hex')), 'the README\'s SHA-256 is the file\'s: rebuild, do not edit')
  assert.ok(readme.includes(String(Buffer.byteLength(js).toLocaleString('en-US'))))
  assert.match(readme, /Do not edit `engine\.js` by hand/)
  assert.ok(read('THIRD-PARTY-NOTICES.md').includes('## parse5'))
})

test('the engine is not a dependency of the site: it is the vendored file and nothing else', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ')
  assert.doesNotMatch(all, /ui-editor|parse5|postcss|esbuild|playwright/)
})

test('the types are strict (no any) and name every function the engine exports', () => {
  const dts = read('engine.d.ts')
  assert.doesNotMatch(dts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /\bany\b/, 'no `any` in the types (comments aside)')
  const declared = [...dts.matchAll(/^export function (\w+)/gm)].map((m) => m[1])
  assert.ok(declared.length >= 25, `${declared.length} declared functions`)
  for (const name of declared) assert.equal(typeof engine[name], 'function', `${name} is exported by engine.js`)
  const runtime = Object.keys(engine).filter((k) => typeof engine[k] === 'function')
  for (const name of runtime) assert.ok(declared.includes(name), `${name} is in engine.d.ts`)
})

test('no-op round trip in the engine: every sample, parsed and exported with no patches, is byte-identical', () => {
  for (const s of SAMPLE_FILES) {
    const dir = new URL('../src/ui-editor/samples/', import.meta.url)
    const files = Object.fromEntries([s.file, ...s.companions].map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]))
    const companions = Object.fromEntries(s.companions.map((f) => [f, files[f]]))
    const model = engine.createModel(files[s.file], s.kind, companions, s.file)
    assert.deepEqual(engine.exportFiles(engine.sources(model), []), files, s.id)
  }
})

test('the samples have the breakpoints the gate rules name: 640 for the landing page, 480 for the email, the default 767 for the SVG', () => {
  const dir = new URL('../src/ui-editor/samples/', import.meta.url)
  const bp = (id: string) => {
    const s = SAMPLE_FILES.find((x) => x.id === id)!
    const files = Object.fromEntries([s.file, ...s.companions].map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]))
    return engine.breakpointOf(engine.createModel(files[s.file], s.kind, Object.fromEntries(s.companions.map((f) => [f, files[f]])), s.file))
  }
  assert.deepEqual([bp('landing'), bp('email'), bp('chart')], [640, 480, 767])
})
