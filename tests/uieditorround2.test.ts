import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** The drawing of each icon in icons.tsx: the text between its key and the next key (JSX is not run under node, so the source is read). */
function iconDrawings(): Record<string, string> {
  const src = read('src/ui-editor/icons.tsx')
  const body = src.slice(src.indexOf('const PATHS'), src.indexOf('export function Icon('))
  const keys = [...body.matchAll(/^ {2}(\w+): /gm)]
  const out: Record<string, string> = {}
  keys.forEach((m, i) => {
    const end = i + 1 < keys.length ? keys[i + 1].index : body.length
    out[m[1]] = body.slice(m.index + m[0].length, end).replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim()
  })
  return out
}

test('no two toolbar icons share a drawing, and Reset all, Undo, Redo and Rotate are four different shapes', () => {
  const d = iconDrawings()
  assert.ok(Object.keys(d).length >= 10, Object.keys(d).join())
  const seen = new Map<string, string>()
  for (const [k, v] of Object.entries(d)) {
    assert.ok(v.length > 10, `${k} has a drawing`)
    assert.ok(!seen.has(v), `${k} draws the same as ${seen.get(v)}`)
    seen.set(v, k)
  }
  const paths = (k: string) => [...d[k].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join('|')
  assert.equal(new Set(['undo', 'redo', 'reset', 'rotate'].map(paths)).size, 4)
})

test('Rotate is drawn as a device outline with a curved arrow, and is the one icon button that shows its word', () => {
  const d = iconDrawings()
  assert.match(d.rotate, /<rect /, 'a device outline')
  assert.match(d.rotate, /<path /, 'and an arrow')
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /icon="rotate" label=\{labels\.rotate\} text=\{labels\.rotate\}/)
  assert.equal((tool.match(/ text=\{/g) ?? []).length, 1, 'only Rotate has a visible label')
})

test('the Samples button closes the paste area: with it open, Samples shows the gallery again, and the paste area takes the gallery\'s place while it is open', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const fn = tool.slice(tool.indexOf('const onSamples = () => {'), tool.indexOf('const onFiles'))
  assert.match(fn, /if \(pasteOpen\) \{\s*setPasteOpen\(false\)\s*setGalleryOpen\(true\)/)
  assert.match(tool, /const galleryShown = showGallery && !pasteOpen/)
})
