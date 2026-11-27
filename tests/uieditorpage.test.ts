import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { credits, how, labels, limits, messages, panel, paragraphs, uiEditor, uiEditorPage, VIEW_WIDTHS } from '../src/data/uiEditor.ts'
import { SAMPLE_FILES } from '../src/ui-editor/samples/manifest.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

test('the controls the gate drives are named as docs/ui-editor-gate-rules.md says', () => {
  assert.deepEqual([labels.sample, labels.paste, labels.upload, labels.view, labels.desktop, labels.tablet, labels.phone, labels.undo, labels.redo, labels.resetAll, labels.file, labels.copy, labels.download, labels.code, labels.result, labels.discard, labels.keep], ['Sample', 'Paste', 'Upload', 'View', 'Desktop', 'Tablet', 'Phone', 'Undo', 'Redo', 'Reset all', 'File', 'Copy code', 'Download', 'Updated code', 'Edit result', 'Discard edits', 'Keep editing'])
  assert.deepEqual(labels.samples, { landing: 'Landing page', email: 'HTML email', chart: 'SVG chart' })
  assert.deepEqual([panel.fontSize, panel.width, panel.height, panel.moveUp, panel.moveDown], ['Font size', 'Width', 'Height', 'Move up', 'Move down'])
  assert.deepEqual(VIEW_WIDTHS, { Desktop: 1280, Tablet: 768, Phone: 390 })
  assert.deepEqual(SAMPLE_FILES.map((s) => s.id), Object.keys(labels.samples))
  assert.match(panel.tablet, /view-only/)
})

test('the limits text mentions each limit of the brief', () => {
  const all = limits.items.join('\n').toLowerCase()
  for (const part of ['scripts off', 'javascript', 'external fonts', 'css you do not supply', 'react', 'max-width', 'min-width', 'desktop, tablet and phone upright are editable', 'turned sideways', 'phone breakpoint is 768', 'min-height', 'aspect-ratio', 'percentages', 'viewport units', 'flex item that grows', 'refused', 'covers every width above phone', 'chromium']) assert.ok(all.includes(part), part)
  assert.ok(limits.items.length >= 10)
})

test('How it works: five steps, says Phone and Tablet follow Desktop and that a change made in Phone or Tablet applies to that view only, and says what is measured and what is not; the keyboard alternative to handles is stated', () => {
  assert.deepEqual(how.steps.map((s) => s.name), ['Open', 'Preview', 'Edit', 'Adapt', 'Export'])
  const adapt = how.steps[3].detail
  assert.match(adapt, /start as your Desktop setup scaled in proportion/)
  assert.match(adapt, /applies to that view only/)
  assert.match(how.steps[1].detail, /never scaled/)
  assert.ok(how.measured.some((m) => /Not measured/.test(m)))
  assert.match(labels.previewHint, /Handles are for the pointer/)
  assert.match(labels.previewHint, /arrow keys/)
})

test('Data and credits says nothing is fetched, the samples are original, names the engine caveats; the GitHub button goes to the public engine repository', () => {
  const all = credits.items.join('\n')
  assert.match(all, /No external data/)
  assert.match(all, /original/)
  assert.ok(all.includes('The editing engine is the author’s own code, in its own public repository on GitHub, and shipped in this site as one built file.'))
  assert.doesNotMatch(JSON.stringify([credits, how, limits, paragraphs, uiEditor, uiEditorPage]), /private repository/i, 'no string of the page calls the engine repository private')
  assert.match(all, /caveats/)
  assert.equal(uiEditor.repoUrl, 'https://github.com/maxnorris01-bot/ui-editor')
  assert.match(uiEditorPage.githubLabel, /View on GitHub/)
  assert.match(read('src/pages/UiEditor.tsx'), /uiEditor\.repoUrl \?/)
  assert.ok(messages.badType.includes('.html') && /1 MB/.test(messages.tooBig))
})

test('no email address or phone number anywhere in the page, its data, its samples or its notes (the vendored licence copies leave authors\' addresses out)', () => {
  const mine = [...walk(join(root, 'src/ui-editor')), ...walk(join(root, 'src/pages')).filter((f) => /UiEditor/.test(f)), join(root, 'src/data/uiEditor.ts'), join(root, 'docs/ui-editor-gate-rules.md')].filter((f) => !f.endsWith('engine.js'))
  for (const f of mine) {
    const t = readFileSync(f, 'utf8')
    assert.doesNotMatch(t, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, `email in ${f}`)
    assert.doesNotMatch(t, /(?<![\d.])\+?\d{3}[\s.-]\d{3,4}[\s.-]\d{4}(?![\d.])|\(\d{3}\)\s?\d{3}-\d{4}/, `phone number in ${f}`)
  }
})

test('the samples are each under about 6 KB, and the scripts-off, no-network rules hold: no script element or network call in the page code', () => {
  for (const s of SAMPLE_FILES) {
    const size = [s.file, ...s.companions].reduce((n, f) => n + statSync(join(root, 'src/ui-editor/samples', f)).size, 0)
    assert.ok(size < 6144, `${s.id} ${size} bytes`)
  }
  for (const f of walk(join(root, 'src/ui-editor')).filter((p) => /\.(ts|tsx)$/.test(p))) {
    const t = readFileSync(f, 'utf8')
    assert.doesNotMatch(t, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|allow-scripts/, f)
  }
  assert.doesNotMatch(read('src/ui-editor/vendor/README.md'), /allow-scripts/)
})
