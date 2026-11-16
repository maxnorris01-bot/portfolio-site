import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { labels, sampleDescriptions } from '../src/data/uiEditor.ts'
import { MINI, miniatureScale } from '../src/ui-editor/miniature.ts'
import { SAMPLE_FILES } from '../src/ui-editor/samples/manifest.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

test('every sample in the manifest has a card title and one line of description, and no sample is missing from either', () => {
  const ids = SAMPLE_FILES.map((s) => s.id)
  assert.deepEqual(Object.keys(sampleDescriptions).sort(), [...ids].sort())
  assert.deepEqual(Object.keys(labels.samples).sort(), [...ids].sort())
  for (const id of ids) {
    const d = sampleDescriptions[id]
    assert.ok(d.length >= 20 && d.length <= 90, `${id}: ${d.length} characters`)
    assert.doesNotMatch(d, /\n/)
    assert.match(d, /^[A-Z].*\.$/, `${id} is one sentence`)
  }
})

test('the miniature is the sample at the Desktop width, and its scale is the frame width over 1280', () => {
  assert.deepEqual({ ...MINI }, { width: 1280, height: 800 })
  assert.equal(miniatureScale(1280), 1)
  assert.equal(miniatureScale(320), 0.25)
  assert.ok(Math.abs(miniatureScale(352) - 0.275) < 1e-9)
  assert.equal(miniatureScale(0), 0.25, 'a frame not measured yet gets the default')
  assert.ok(miniatureScale(300) * MINI.width === 300)
})

test('a miniature is a scripts-off, unclickable, lazy frame built from the engine\'s previewSource', () => {
  const g = read('src/ui-editor/Gallery.tsx')
  assert.match(g, /previewSource\(/)
  assert.match(g, /sandbox="allow-same-origin"/)
  assert.doesNotMatch(g, /allow-scripts/)
  assert.match(g, /loading="lazy"/)
  assert.match(read('src/ui-editor/UiEditorTool.css'), /\.ue-mini iframe \{[^}]*pointer-events: none/)
  assert.match(g, /data-sample-card/)
  assert.match(g, /e\.key === 'Enter'/)
})

test('the tool shows the controls only once something is open: the bar group, stage, panel and code area are all behind the open document', () => {
  const t = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(t, /\{hasDoc && \(\s*<>/)
  assert.match(t, /\{hasDoc && \(\s*<div className="ue-work">/)
  assert.match(t, /\{hasDoc && \(\s*<details/)
  assert.match(t, /const showGallery = !hasDoc \|\| galleryOpen/)
  assert.doesNotMatch(t, /<select id="ue-sample"/, 'the old Sample dropdown is gone')
  assert.equal(labels.samplesButton, 'Samples')
})
