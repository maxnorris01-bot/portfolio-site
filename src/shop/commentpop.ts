// The comment popover under a card's rating buttons, as pure rules: which card has it open (only one at a time), what closes it, and
// whether it opens below the buttons or flips above them near the bottom of the window. Pure, so tests drive it without a browser.

export type CommentPopState = { openId: string | null }
export type CommentPopEvent =
  | { type: 'rate'; id: string; rating: string | null; viaKey?: boolean }
  | { type: 'open'; id: string }
  | { type: 'escape' }
  | { type: 'outside' }
  | { type: 'blur' }
  | { type: 'close' }

export const COMMENT_POP_CLOSED: CommentPopState = { openId: null }

/**
 * Choosing a rating opens that card's popover (and closes any other). Clearing the rating closes it. Arrow keys inside the rating group only
 * change the rating: they keep the popover open when it already is, and never open one (focus must stay on the radio group).
 */
export function commentPopStep(s: CommentPopState, e: CommentPopEvent): CommentPopState {
  switch (e.type) {
    case 'rate':
      if (e.rating === null) return s.openId === e.id ? COMMENT_POP_CLOSED : s
      return e.viaKey ? s : { openId: e.id }
    case 'open':
      return { openId: e.id }
    case 'escape':
    case 'outside':
    case 'blur':
    case 'close':
      return s.openId === null ? s : COMMENT_POP_CLOSED
  }
}

/** The one reserved line under the rating buttons: a link to add or edit the comment, or nothing before the card is rated. */
export function commentLinkLabel(rated: boolean, comment: string): string | null {
  if (!rated) return null
  return comment.trim() ? 'Comment saved' : 'Add a comment'
}

/** Below the buttons unless it would run off the bottom of the window and there is more room above. Numbers are viewport pixels. */
export function popoverPlacement(args: { buttonsTop: number; buttonsBottom: number; height: number; viewportHeight: number; margin?: number }): 'below' | 'above' {
  const margin = args.margin ?? 8
  const roomBelow = args.viewportHeight - args.buttonsBottom - margin
  const roomAbove = args.buttonsTop - margin
  return args.height > roomBelow && roomAbove > roomBelow ? 'above' : 'below'
}
