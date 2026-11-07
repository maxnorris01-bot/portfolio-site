import assert from 'node:assert/strict'
import { test } from 'node:test'
import { popoverStep, POPOVER_CLOSED, type PopoverEvent, type PopoverState } from '../src/shop/popover.ts'

const run = (events: PopoverEvent[], from: PopoverState = POPOVER_CLOSED) => events.reduce(popoverStep, from)

test('usage popover: hover or keyboard focus opens it, leaving or blurring closes it', () => {
  assert.deepEqual(run(['enter']), { open: true, pinned: false })
  assert.deepEqual(run(['enter', 'leave']), POPOVER_CLOSED)
  assert.deepEqual(run(['focus']), { open: true, pinned: false })
  assert.deepEqual(run(['focus', 'blur']), POPOVER_CLOSED)
})

test('usage popover: a click or tap pins it open (touch sends enter, then click); another click closes it', () => {
  assert.deepEqual(run(['click']), { open: true, pinned: true })
  assert.deepEqual(run(['enter', 'click']), { open: true, pinned: true })
  assert.deepEqual(run(['enter', 'click', 'leave']), { open: true, pinned: true }, 'the pointer leaving does not close a pinned popover')
  assert.deepEqual(run(['enter', 'click', 'blur']), { open: true, pinned: true })
  assert.deepEqual(run(['enter', 'click', 'click']), POPOVER_CLOSED)
})

test('usage popover: Esc or a click outside closes it, pinned or not, and does nothing when closed', () => {
  for (const ev of ['escape', 'outside'] as const) {
    assert.deepEqual(run(['click', ev]), POPOVER_CLOSED)
    assert.deepEqual(run(['enter', ev]), POPOVER_CLOSED)
    assert.deepEqual(run([ev]), POPOVER_CLOSED)
  }
})

test('usage chip source: aria-expanded, aria-controls, a dialog popover, Esc and outside-click listeners, focus back to the button on Esc', async () => {
  const { readFileSync } = await import('node:fs')
  const tsx = readFileSync(new URL('../src/shop/UsageChip.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /aria-expanded=\{state\.open\}/)
  assert.match(tsx, /aria-controls=\{popId\}/)
  assert.match(tsx, /role="dialog"/)
  assert.match(tsx, /e\.key !== 'Escape'/)
  assert.match(tsx, /addEventListener\('pointerdown', onDown\)/)
  assert.match(tsx, /button\.current\?\.focus\(\)/)
  assert.match(tsx, /onMouseEnter/)
  assert.match(tsx, /onFocus/)
  assert.match(tsx, /onClick=\{\(\) => send\('click'\)\}/)
})
