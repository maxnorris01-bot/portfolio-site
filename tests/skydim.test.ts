import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  SKY_DIM_DEFAULT,
  dimFactors,
  earthAngularRadius,
  earthInView,
  earthViewFraction,
  easeToward,
  stepSkyDim,
  sunlitWeight,
  type SkyDimState,
} from '../src/globe/skydim.ts'
import { StarField, createStarMaterial } from '../src/globe/space.ts'
import { NO_ROTATION, type StarCatalog } from '../src/globe/stars.ts'
import type { Vec3 } from '../src/globe/pov.ts'

const DEG = Math.PI / 180
const R_LEO = 1.067 // about 430 km up
const rho = earthAngularRadius(R_LEO)
const nadir: Vec3 = [0, 0, -1]
/** A view axis `deg` away from nadir, in the x-z plane. */
const axisAt = (deg: number): Vec3 => [Math.sin(deg * DEG), 0, -Math.cos(deg * DEG)]
const e = (deg: number, fov: number) => earthInView(earthViewFraction(axisAt(deg), nadir, rho, fov))

test('the Earth\'s angular radius from a satellite: asin(1/r)', () => {
  assert.ok(Math.abs(rho / DEG - 69.6) < 0.2) // from about 430 km
  assert.equal(earthAngularRadius(1), Math.PI / 2) // at the surface
  assert.ok(Math.abs(earthAngularRadius(6.6) / DEG - 8.7) < 0.1) // geostationary
})

test('looking at the Earth: e is 1 well inside the disc, between at the limb, 0 clearly outside', () => {
  const fov = 70
  assert.equal(e(0, fov), 1) // straight down
  assert.equal(e(0.5 * (rho / DEG), fov), 1) // half way to the limb
  const limb = e(rho / DEG, fov)
  assert.ok(limb > 0.3 && limb < 0.95, `limb ${limb}`) // half the view is Earth
  assert.equal(e(1.1 * (rho / DEG) + 40, fov), 0) // well outside: dark sky
  assert.equal(e(180, fov), 0) // straight out
  // Never rises as the view turns away from the Earth.
  let last = 1
  for (let a = 0; a <= 180; a += 5) {
    const v = e(a, fov)
    assert.ok(v <= last + 1e-9, `rising at ${a}`)
    last = v
  }
})

test('field of view counts: a very narrow view on the disc is all Earth; a very wide one just outside the limb still has a lot', () => {
  // Narrow (0.5 degrees) just inside the limb: all Earth, e = 1. Just outside: none.
  assert.equal(e(rho / DEG - 2, 0.5), 1)
  assert.equal(e(rho / DEG + 2, 0.5), 0)
  // Wide (120 degrees) centred 10 degrees outside the limb: much of the view is Earth.
  const wideOutside = e(rho / DEG + 10, 120)
  const narrowOutside = e(rho / DEG + 10, 20)
  assert.ok(wideOutside > 0.5, `wide ${wideOutside}`)
  assert.equal(narrowOutside, 0)
  // Looking out (anti-nadir) there is no Earth at 120 degrees either; forward (90 degrees) at 70 only a sliver.
  assert.equal(e(180, 120), 0)
  assert.ok(e(90, 70) < 0.4)
})

test('from geostationary the Earth is small: only a view pointed at it dims the sky much', () => {
  const rg = earthAngularRadius(6.6)
  const f = (deg: number, fov: number) => earthInView(earthViewFraction(axisAt(deg), nadir, rg, fov))
  assert.equal(f(0, 5), 1)
  assert.ok(f(0, 70) < 0.35) // the disc is 17 degrees across in a 70 degree view: 6% of it
  assert.ok(f(30, 70) < 0.01)
})

test('the day/night blend: sunlit below, night weight on the dark side, smooth through the terminator', () => {
  assert.equal(sunlitWeight(1), 1)
  assert.equal(sunlitWeight(0.5), 1)
  assert.equal(sunlitWeight(-0.5), 0)
  assert.equal(sunlitWeight(-1), 0)
  const mid = sunlitWeight(0.05)
  assert.ok(mid > 0.2 && mid < 0.9)
  let last = sunlitWeight(-1)
  for (let c = -1; c <= 1; c += 0.01) {
    const w = sunlitWeight(c)
    assert.ok(w >= last - 1e-12)
    assert.ok(w - last < 0.05, `a jump at ${c}`) // no pop
    last = w
  }
})

test('the defaults: sunlit nadir glow ×0.20 stars ×0.45, night glow ×0.50 stars ×0.75; none with no Earth', () => {
  assert.deepEqual(SKY_DIM_DEFAULT, { glowSunlit: 0.2, starsSunlit: 0.45, glowNight: 0.5, starsNight: 0.75 })
  const near = (a: { glow: number; stars: number }, glow: number, stars: number) =>
    assert.ok(Math.abs(a.glow - glow) < 1e-12 && Math.abs(a.stars - stars) < 1e-12, JSON.stringify(a))
  near(dimFactors(1, 1), 0.2, 0.45)
  near(dimFactors(1, 0), 0.5, 0.75)
  assert.deepEqual(dimFactors(0, 1), { glow: 1, stars: 1 })
  assert.deepEqual(dimFactors(0, 0), { glow: 1, stars: 1 })
  const half = dimFactors(0.5, 1)
  assert.ok(Math.abs(half.glow - 0.6) < 1e-12 && Math.abs(half.stars - 0.725) < 1e-12) // mix(1, target, e)
  const dusk = dimFactors(1, 0.5)
  assert.ok(Math.abs(dusk.glow - 0.35) < 1e-12) // halfway between the day and night targets
  // Retunable: another set of targets takes effect.
  near(dimFactors(1, 1, { glowSunlit: 0.1, starsSunlit: 0.3, glowNight: 0.4, starsNight: 0.6 }), 0.1, 0.3)
})

test('smoothing: about 400 ms, monotone, never overshoots; gentler (slower) for reduced motion; snaps once close', () => {
  let v = 1
  let t = 0
  const frames: number[] = []
  while (Math.abs(v - 0.2) > 0.01 && t < 5) {
    v = easeToward(v, 0.2, 1 / 60, false)
    t += 1 / 60
    frames.push(v)
  }
  assert.ok(frames.every((x, i) => i === 0 || x <= frames[i - 1]))
  assert.ok(frames.every((x) => x >= 0.2))
  // 63% of the way after one time constant (0.4 s): 1 - 0.8 * 0.63 = 0.49.
  let w = 1
  for (let i = 0; i < 24; i++) w = easeToward(w, 0.2, 1 / 60, false)
  assert.ok(Math.abs(w - (0.2 + 0.8 * Math.exp(-1))) < 0.02, `after 0.4 s ${w}`)
  // Reduced motion is slower still, and never a jump.
  let slow = 1
  for (let i = 0; i < 24; i++) slow = easeToward(slow, 0.2, 1 / 60, true)
  assert.ok(slow > w)
  assert.ok(Math.abs(slow - 1) < 0.5)
  assert.equal(easeToward(0.2004, 0.2, 0.016, false), 0.2)
  // Frame rate independence: the same time passes the same.
  let a = 1
  let b = 1
  for (let i = 0; i < 30; i++) a = easeToward(a, 0.2, 1 / 30, false)
  for (let i = 0; i < 60; i++) b = easeToward(b, 0.2, 1 / 60, false)
  assert.ok(Math.abs(a - b) < 1e-6)
})

test('a frame: dim looking down on the sunlit side, less on the night side, none looking out; first frame starts there, no fade-in', () => {
  const cam: Vec3 = [0, 0, R_LEO] // above the +z point of the Earth
  const down: Vec3 = [0, 0, -1]
  const out: Vec3 = [0, 0, 1]
  const sunOver: Vec3 = [0, 0, 1] // the Sun over the sub-satellite point
  const sunAway: Vec3 = [0, 0, -1]
  const day = stepSkyDim(null, cam, down, sunOver, 120, 0, false)
  assert.ok(Math.abs(day.glow - 0.2) < 1e-9 && Math.abs(day.stars - 0.45) < 1e-9 && day.e === 1 && day.lit === 1)
  const night = stepSkyDim(null, cam, down, sunAway, 120, 0, false)
  assert.ok(Math.abs(night.glow - 0.5) < 1e-9 && Math.abs(night.stars - 0.75) < 1e-9)
  const dark = stepSkyDim(null, cam, out, sunOver, 120, 0, false)
  assert.deepEqual([dark.glow, dark.stars, dark.e], [1, 1, 0])
  // Turning from Down to Out while dragging: the factors ease, never jump (60 fps, a 1 s swing).
  let s: SkyDimState | null = dark
  let prevGlow = 1
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * 180
    s = stepSkyDim(s, cam, [Math.sin((180 - a) * DEG), 0, -Math.cos((180 - a) * DEG)], sunOver, 120, 1 / 60, false)
    assert.ok(Math.abs(s.glow - prevGlow) < 0.05, `a jump of ${Math.abs(s.glow - prevGlow)} at frame ${i}`)
    prevGlow = s.glow
  }
  // Held looking out for two more seconds: back to full brightness.
  for (let i = 0; i < 120; i++) s = stepSkyDim(s, cam, out, sunOver, 120, 1 / 60, false)
  assert.ok(s!.glow > 0.99 && s!.stars > 0.99, `back to ${s!.glow}`)
})

test('dimming changes only brightness: the same stars are loaded, shown and pickable; the Sun and bodies have no dim', () => {
  const cat: StarCatalog = {
    count: 3,
    dirJ2000: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    mag: new Float32Array([2, 5, 9]),
    bv: new Float32Array([0, 0.6, 1.4]),
    epoch: 2026,
    sortedByMagnitude: true,
  }
  const field = new StarField(cat, 1)
  field.setRotation(NO_ROTATION)
  field.update(30)
  const before = { limit: field.starMaterial.uniforms.limitMag.value, grow: field.starMaterial.uniforms.grow.value }
  const pickBefore = field.pickScored([1, 0, 0], 30, 600, 12)
  field.setDim(0.2)
  field.update(30)
  assert.equal(field.starMaterial.uniforms.dim.value, 0.2)
  assert.equal(field.starMaterial.uniforms.limitMag.value, before.limit)
  assert.equal(field.starMaterial.uniforms.grow.value, before.grow)
  assert.deepEqual(field.pickScored([1, 0, 0], 30, 600, 12), pickBefore) // selectable while dimmed
  assert.equal(field.count, 3)
  assert.equal(createStarMaterial(1).uniforms.dim.value, 1) // full brightness by default
  const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
  // Only the star shader and the glow take the dim; bodies, constellations and the selection do not.
  assert.match(src('globe/space.ts'), /\* narrow \* dim \* bright;/)
  assert.match(src('globe/glowlayer.ts'), /glowGain\(ctx\.fovDeg\) \* ctx\.dim/)
  for (const f of ['globe/spacebodies.ts', 'globe/constellationlayer.ts', 'globe/skybodies.ts']) assert.doesNotMatch(src(f), /\bdim\b|skydim/i, f)
})

test('only the satellite view dims: the Globe and Sky views never call it, and leaving the view resets it', () => {
  const engine = readFileSync(new URL('../src/globe/engine.ts', import.meta.url), 'utf8')
  const calls = engine.match(/stepSkyDim\(/g) ?? []
  assert.equal(calls.length, 1)
  // The one call sits in the satellite view's render, after its look is set up and before the space layer draws.
  const at = engine.indexOf('stepSkyDim(\n')
  const renderPov = engine.indexOf('private renderPov(')
  const nextMethod = engine.indexOf('\n  // Feed the tiles the camera', renderPov)
  assert.ok(renderPov > 0 && at > renderPov && (nextMethod < 0 || at < nextMethod), 'stepSkyDim is outside renderPov')
  assert.match(engine, /this\.space\?\.hide\(\)\n\s+this\.skyDimState = null/)
  // SpaceView.hide returns the multipliers to 1.
  assert.match(readFileSync(new URL('../src/globe/space.ts', import.meta.url), 'utf8'), /hide\(\) \{\n\s+this\.group\.visible = false\n\s+this\.dimGlow = 1\n\s+this\.dimStars = 1/)
})

test('the console hook: the engine carries skyDim with the default values, retunable', () => {
  const engine = readFileSync(new URL('../src/globe/engine.ts', import.meta.url), 'utf8')
  assert.match(engine, /skyDim: SkyDimTargets = \{ \.\.\.SKY_DIM_DEFAULT \}/)
  assert.match(engine, /this\.skyDim,\n\s+\)/) // passed to stepSkyDim each frame, so edits take effect at once
  assert.match(engine, /debugSkyDim\(\)/)
  const comp = readFileSync(new URL('../src/components/SatelliteGlobe.tsx', import.meta.url), 'utf8')
  assert.match(comp, /import\.meta\.env\.DEV \|\| debugMode\) Object\.assign\(window, \{ __globe: engine \}\)/)
  assert.match(comp, /const debugMode = new URLSearchParams\(window\.location\.search\)\.get\('debug'\) === '1'/)
  assert.match(comp, /debugEngine\?\.skyDim/)
})
