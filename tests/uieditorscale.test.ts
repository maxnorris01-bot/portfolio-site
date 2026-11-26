import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { HEIGHT_MARGIN, fitScale, frameSize, toCss } from '../src/ui-editor/devices.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not ${b}`)

test('toCss divides a screen distance by the scale, for several scales', () => {
  assert.equal(toCss(40, 1), 40)
  assert.equal(toCss(40, 0.5), 80)
  near(toCss(40, 0.75), 53.3333333333)
  near(toCss(40, 0.8393), 40 / 0.8393)
  near(toCss(-40, 0.7078), -40 / 0.7078)
  assert.equal(toCss(0, 0.3), 0)
  near(toCss(40, 1.25), 32)
})

test('toCss leaves a distance alone when the scale is unknown (zero or less)', () => {
  assert.equal(toCss(40, 0), 40)
  assert.equal(toCss(40, -1), 40)
})

test('a device that fits is not scaled; one that does not is shrunk by the tighter side, never enlarged', () => {
  const phone = frameSize('Phone', 'portrait', 0)
  assert.equal(fitScale({ frameWidth: phone.width, frameHeight: phone.height, areaWidth: 1400, availableHeight: 1080 - HEIGHT_MARGIN, framed: true }), 1)
  // 1366 x 768: the height is the tight side (752 over 896)
  near(fitScale({ frameWidth: phone.width, frameHeight: phone.height, areaWidth: 960, availableHeight: 768 - HEIGHT_MARGIN, framed: true }), 752 / 896)
  // a narrow room: the width is the tight side
  near(fitScale({ frameWidth: phone.width, frameHeight: phone.height, areaWidth: 207, availableHeight: 2000, framed: true }), 0.5)
  // never above 1
  assert.equal(fitScale({ frameWidth: 400, frameHeight: 400, areaWidth: 4000, availableHeight: 4000, framed: true }), 1)
})

test('the 1920 x 1080 window shows Desktop, Phone and Tablet at scale 1 (the gate relies on it), and 1366 x 768 shrinks Desktop and Phone', () => {
  const avail = (h: number) => h - HEIGHT_MARGIN
  const area1920 = 1836 - 360 - 24 - 2 - 32 // container, panel column, gap, area border, area padding (UiEditorTool.css)
  const area1366 = 1366 - 2 * 27 - 328 - 24 - 2 - 32
  const desktop = frameSize('Desktop', 'portrait', 2400)
  const phone = frameSize('Phone', 'portrait', 0)
  const tabletP = frameSize('Tablet', 'portrait', 0)
  const tabletL = frameSize('Tablet', 'landscape', 0)
  assert.equal(fitScale({ frameWidth: desktop.width, frameHeight: desktop.height, areaWidth: area1920, availableHeight: avail(1080), framed: false }), 1, 'Desktop at 1920 x 1080')
  assert.equal(fitScale({ frameWidth: phone.width, frameHeight: phone.height, areaWidth: area1920, availableHeight: avail(1080), framed: true }), 1, 'Phone at 1920 x 1080')
  assert.equal(fitScale({ frameWidth: tabletP.width, frameHeight: tabletP.height, areaWidth: area1920, availableHeight: avail(1080), framed: true }), 1, 'Tablet portrait at 1920 x 1080')
  assert.equal(fitScale({ frameWidth: tabletL.width, frameHeight: tabletL.height, areaWidth: area1920, availableHeight: avail(1080), framed: true }), 1, 'Tablet landscape at 1920 x 1080')
  assert.ok(fitScale({ frameWidth: desktop.width, frameHeight: desktop.height, areaWidth: area1366, availableHeight: avail(768), framed: false }) < 1, 'Desktop at 1366 x 768')
  assert.ok(fitScale({ frameWidth: phone.width, frameHeight: phone.height, areaWidth: area1366, availableHeight: avail(768), framed: true }) < 1, 'Phone at 1366 x 768')
})

test('Desktop is scaled by its width only: its height is the page\'s and the page scrolls', () => {
  const s = fitScale({ frameWidth: 1280, frameHeight: 5000, areaWidth: 1280, availableHeight: 700, framed: false })
  assert.equal(s, 1)
  near(fitScale({ frameWidth: 1280, frameHeight: 5000, areaWidth: 640, availableHeight: 700, framed: false }), 0.5)
})

test('a room that has not been measured yet leaves the scale at 1', () => {
  assert.equal(fitScale({ frameWidth: 1280, frameHeight: 900, areaWidth: 0, availableHeight: 0, framed: true }), 1)
  assert.equal(fitScale({ frameWidth: 0, frameHeight: 0, areaWidth: 500, availableHeight: 500, framed: true }), 1)
})

test('the stage converts every pointer path to CSS px: the press, the hover, the drag in progress and the release all go through toCss, and no handler subtracts a start by hand', () => {
  const stage = read('src/ui-editor/Stage.tsx')
  assert.match(stage, /import \{[^}]*\btoCss\b[^}]*\} from '\.\/devices'/)
  // press, hover (2 coordinates each), drag in progress (2), release (2)
  assert.ok((stage.match(/toCss\(/g) ?? []).length >= 10)
  // the release and the drag read the distance only through toCss
  assert.doesNotMatch(stage, /Math\.round\(e\.clientX - d\.startX\)/)
  assert.doesNotMatch(stage, /const dx = e\.clientX - d\.startX/)
  assert.match(stage, /Math\.round\(toCss\(e\.clientX - d\.startX, k\)\)/)
  // the layer sits inside the scaled wrapper
  assert.ok(stage.indexOf('data-device-scale') < stage.indexOf('className={`ue-overlay'))
  assert.match(stage, /transform: scale < 1 \? `scale\(\$\{scale\}\)` : undefined/)
  assert.match(read('src/ui-editor/UiEditorTool.css'), /transform-origin: top center/)
})

test('the copy says what the scaling does, and the existing words the earlier tests look for are still there', () => {
  const data = read('src/data/uiEditor.ts')
  assert.match(data, /never scaled: in a small window the whole frame is shrunk to fit/)
  assert.match(data, /Desktop, Tablet and Phone upright are editable; turned sideways they are view-only/)
})
