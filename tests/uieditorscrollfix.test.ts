import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { clipToScreen, scrollKeyDelta } from '../src/ui-editor/geometry.ts'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('the keys that scroll a screen: a page for PageDown and Space (up with Shift), the whole page for End and Home, nothing for the arrows', () => {
  assert.equal(scrollKeyDelta('PageDown', false, 800), 720)
  assert.equal(scrollKeyDelta('PageUp', false, 800), -720)
  assert.equal(scrollKeyDelta(' ', false, 800), 720)
  assert.equal(scrollKeyDelta(' ', true, 800), -720)
  assert.ok((scrollKeyDelta('End', false, 800) ?? 0) > 100000)
  assert.ok((scrollKeyDelta('Home', false, 800) ?? 0) < -100000)
  for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Tab', 'a']) assert.equal(scrollKeyDelta(k, false, 800), null, `${k} is the nudge or nothing`)
})

test('an outline is clipped to the screen plus a few px: whole when it is on it, cut at an edge, nothing when it is off it', () => {
  const screen = { w: 390, h: 844 }
  // an element wholly on the screen: the polygon is larger than its box on every side (nothing is cut)
  assert.equal(clipToScreen({ left: 20, top: 100, width: 100, height: 50 }, screen.w, screen.h, 6), 'polygon(-26px -106px, 376px -106px, 376px 750px, -26px 750px)')
  // straddling the top edge by 30 px: cut 6 px above the screen (the top of the polygon is at 30 - 6 = 24 px below the box's own top)
  assert.equal(clipToScreen({ left: 0, top: -30, width: 390, height: 66 }, screen.w, screen.h, 6), 'polygon(-6px 24px, 396px 24px, 396px 880px, -6px 880px)')
  // wholly below the screen: the box starts 100 px under its bottom, so the polygon lies above the box: nothing is drawn of it
  const below = clipToScreen({ left: 0, top: 944, width: 390, height: 66 }, screen.w, screen.h, 6)
  assert.equal(below, 'polygon(-6px -950px, 396px -950px, 396px -94px, -6px -94px)')
  assert.equal(clipToScreen({ left: 0, top: 0, width: 10, height: 10 }, 0, 0, 0), 'polygon(0 0, 0 0, 0 0)', 'a screen with no size shows nothing')
})

test('the page keeps the scroll listener in the capture phase, scrolls the preview from the keys, clips the outline and keeps the scroll across a replay', () => {
  const stage = read('src/ui-editor/Stage.tsx')
  assert.match(stage, /doc\.addEventListener\('scroll', measure, \{ passive: true, capture: true \}\)/)
  assert.match(stage, /doc\.removeEventListener\('scroll', measure, \{ capture: true \}\)/)
  assert.match(stage, /scrollKeyDelta\(e\.key, e\.shiftKey, win\.innerHeight\)/)
  assert.match(stage, /clipPath: screenClip\(selBox\)/)
  assert.match(stage, /clipPath: screenClip\(hover\)/)
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /r\.session\.preview\.doc\.defaultView\?\.scrollTo\(was\.scrollX, was\.scrollY\)/)
})

test('scroll fix 2: a frame loop re-measures the outline when the scroll position, the element or the scale changed, only while something is selected and the tab is visible', () => {
  const stage = read('src/ui-editor/Stage.tsx')
  const loop = stage.slice(stage.indexOf('// A frame loop while something is selected'), stage.indexOf('// The pointer layer covers the frame, so the wheel'))
  assert.match(loop, /if \(selected === null\) return/, 'nothing selected: no loop')
  assert.match(loop, /sessionRef\.current/, 'the live session is read every frame, never captured once')
  assert.match(loop, /win\.scrollX\}\|\$\{win\.scrollY\}/)
  assert.match(loop, /if \(now !== last\) \{[\s\S]*measureNow\.current\?\.\(\)/, 'measure only when something changed')
  assert.match(loop, /document\.hidden/)
  assert.match(loop, /visibilitychange/)
  assert.match(loop, /cancelAnimationFrame\(id\)/, 'stops on clear, hide and unmount')
  assert.equal((loop.match(/requestAnimationFrame\(/g) ?? []).length, 2, 'one start and one re-request: one loop')
  assert.match(stage, /doc\.addEventListener\('scroll', measure, \{ passive: true, capture: true \}\)/, 'the scroll listener stays')
})
