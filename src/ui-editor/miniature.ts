// The sample gallery's miniatures: each is the real sample, shown at its real Desktop width in a non-interactive, scripts-off frame and scaled
// down with CSS to fit its card. Pure, so it runs under node (tests/uieditorgallery.test.ts).

/** The miniature's own viewport, in CSS px: the Desktop width the editor uses, and the preview's usual height (the same 16:10 as the card's frame). */
export const MINI = { width: 1280, height: 800 } as const

/** The CSS scale that fits a miniature into a card frame of this width (px). A frame that is not measured yet (0) gets a small default. */
export function miniatureScale(frameWidth: number): number {
  return frameWidth > 0 ? frameWidth / MINI.width : 0.25
}
