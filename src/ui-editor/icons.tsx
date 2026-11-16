// The toolbar's icons: small inline SVGs drawn for this tool in one style (24 grid, shown at 20 px, 1.75 stroke, currentColor, round ends).
// No icon library. Each icon is decoration: the button it sits in carries the accessible name (aria-label) and the tooltip (title).
import type { ReactNode } from 'react'

export type IconName = 'desktop' | 'tablet' | 'phone' | 'undo' | 'redo' | 'reset' | 'review' | 'copy' | 'download' | 'rotate' | 'alignLeft' | 'alignCentre' | 'alignRight' | 'alignJustify' | 'moveUp' | 'moveDown' | 'expand'

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
  // The ribbon's own: text alignment, order and the expand chevron.
  alignLeft: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  alignCentre: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  alignRight: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  alignJustify: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  moveUp: <path d="M12 19V6M6 11l6-6 6 6" />,
  moveDown: <path d="M12 5v13M6 13l6 6 6-6" />,
  expand: <path d="m6 9 6 6 6-6" />,
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
  /** A word shown beside the icon (only Rotate has one). */
  text?: string
  onClick: () => void
}

/** An icon button: aria-label for the name, title for the visible tooltip, a focus ring from the stylesheet. */
export function IconButton({ icon, label, disabled, pressed, expanded, badge, text, onClick }: Props) {
  return (
    <button type="button" className={`btn btn-secondary ue-icon${text ? ' has-text' : ''}`} aria-label={label} title={label} disabled={disabled} aria-pressed={pressed} aria-expanded={expanded} onClick={onClick}>
      <Icon name={icon} />
      {text && <span className="ue-icon-text">{text}</span>}
      {badge ? (
        <span className="ue-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  )
}
