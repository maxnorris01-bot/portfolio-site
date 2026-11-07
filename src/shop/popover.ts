// The usage chip's popover as a tiny state machine: hover or keyboard focus shows it, a click or tap pins it open, Esc or a click outside
// closes it. Pure, so tests drive it without a browser.

export type PopoverState = { open: boolean; pinned: boolean }
export type PopoverEvent = 'enter' | 'leave' | 'focus' | 'blur' | 'click' | 'escape' | 'outside'

export const POPOVER_CLOSED: PopoverState = { open: false, pinned: false }

export function popoverStep(s: PopoverState, e: PopoverEvent): PopoverState {
  switch (e) {
    case 'enter':
    case 'focus':
      return { open: true, pinned: s.pinned }
    case 'leave':
    case 'blur':
      return s.pinned ? s : POPOVER_CLOSED
    case 'click':
      return s.pinned ? POPOVER_CLOSED : { open: true, pinned: true }
    case 'escape':
    case 'outside':
      return s.open ? POPOVER_CLOSED : s
  }
}
