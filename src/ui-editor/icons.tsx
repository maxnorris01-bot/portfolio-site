// The toolbar's icons: small inline SVGs drawn for this tool in one style (24 grid, shown at 20 px, 1.75 stroke, currentColor, round ends).
// No icon library. Each icon is decoration: the button it sits in carries the accessible name (aria-label) and the tooltip (title).
import type { ReactNode } from 'react'

export type IconName = 'desktop' | 'tablet' | 'phone' | 'undo' | 'redo' | 'reset' | 'review' | 'copy' | 'download' | 'rotate' | 'alignLeft' | 'alignCentre' | 'alignRight' | 'alignJustify' | 'moveUp' | 'moveDown' | 'grid' | 'snap' | 'chevron' | 'bucket' | 'pencil' | 'textGrow' | 'textShrink' | 'letterA' | 'italic' | 'underline' | 'lineSpacing' | 'shadow' | 'insert' | 'comment'

const PATHS: Record<IconName, ReactNode> = {
  desktop: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  tablet: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  // A page with a revert arrow in its corner (not the arrows of Undo and Redo, nor the turning device of Rotate).
  reset: <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5M13 3l5 5v2.5M17.5 21a4.5 4.5 0 1 0-3.2-7.7M14 13v3.2h3.2" />,
  review: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-.8.8M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l.8-.8M3.5 3.5l17 17" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  // The ribbon's own: text alignment, order, the grid and snap.
  alignLeft: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  alignCentre: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  alignRight: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  alignJustify: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  moveUp: <path d="M12 19V6M6 11l6-6 6 6" />,
  moveDown: <path d="M12 5v13M6 13l6 6 6-6" />,
  // Grid: a square cut in nine; Snap: a crosshair, something landing on a point.
  grid: <path d="M4 4h16v16H4zM4 9.33h16M4 14.67h16M9.33 4v16M14.67 4v16" />,
  snap: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21" />
    </>
  ),
  // Round 6 (the PowerPoint-style ribbon): a menu's chevron, the bucket of Shape Fill, the pencil of Shape Outline, the letter A of the text colour, grow and shrink, italic,
  // underline, line spacing and the shadow of Shape Effects. Drawn in the same style as the rest.
  chevron: <path d="m7 10 5 5 5-5" />,
  bucket: <path d="M6 12 12 4l6.5 7.5-5.5 5.5a2.5 2.5 0 0 1-3.5 0zM6 12h12.5M20 15c1 1.5 1 2.5 0 3.5s-2 .5-2-1 1-2 2-2.5z" />,
  pencil: <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />,
  letterA: <path d="M5 19 12 4l7 15M8.2 13.5h7.6" />,
  textGrow: <path d="M3 19 8.5 6 14 19M5 14.5h7M18 10V4M15 7h6" />,
  textShrink: <path d="M3 19 8.5 6 14 19M5 14.5h7M15 7h6" />,
  italic: <path d="M10 4h8M6 20h8M14 4 10 20" />,
  underline: <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20.5h14" />,
  lineSpacing: <path d="M10 6h10M10 12h10M10 18h10M5 8V4M3 6l2-2 2 2M5 16v4M3 18l2 2 2-2" />,
  shadow: (
    <>
      <rect x="4" y="4" width="11" height="11" rx="1.5" />
      <path d="M18 9v10H9" />
    </>
  ),
  // Comment (stage 2): a speech bubble.
  comment: <path d="M5 5h14v10h-8l-4.5 4V15H5z" />,
  // Insert (round 1): a plus in a rounded square.
  insert: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  // A device outline with a small curved arrow over it.
  rotate: (
    <>
      <rect x="8" y="10" width="8" height="11" rx="1.5" />
      <path d="M6 7.5a8 8 0 0 1 12 0M18.3 4v3.8h-3.6" />
    </>
  ),
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ue-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}

interface Props {
  icon: IconName
  /** The accessible name and the tooltip: exactly the text the gate and the page use for the control. */
  label: string
  disabled?: boolean
  pressed?: boolean
  expanded?: boolean
  /** A small count drawn on the corner (Review unlinked); it is not part of the name's text in the DOM, the label carries it. */
  badge?: number
  /** A word shown beside the icon (Rotate, from round 2). */
  text?: string
  /** Show the label itself beside the icon (the view buttons, Copy code, Download and Reset all, from round 3). */
  showLabel?: boolean
  /** The words to show when the label is longer than they are (Review unlinked: the name carries the count, the words do not; round 4). */
  words?: string
  /** The tooltip, when it says more than the name (the name is the aria-label, and the tooltip then becomes the accessible description). */
  tip?: string
  /** Stage 2: marks the button that opens a popover, so the popover can give the focus back to it and ignore its click. */
  opens?: 'comment' | 'notes'
  onClick: () => void
}

/** An icon button: aria-label for the name, title for the visible tooltip, a focus ring from the stylesheet. */
export function IconButton({ icon, label, tip, disabled, pressed, expanded, badge, text, showLabel, words, opens, onClick }: Props) {
  const word = text ?? words ?? (showLabel ? label : undefined)
  return (
    <button type="button" data-opens={opens} className={`btn btn-secondary ue-icon${word ? ' has-text' : ''}`} aria-label={label} title={tip ?? label} disabled={disabled} aria-pressed={pressed} aria-expanded={expanded} onClick={onClick}>
      <Icon name={icon} />
      {word && <span className="ue-icon-text">{word}</span>}
      {badge ? (
        <span className="ue-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  )
}
