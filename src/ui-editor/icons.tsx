// The toolbar's icons: small inline SVGs drawn for this tool in one style (24 grid, shown at 20 px, 1.75 stroke, currentColor, round ends).
// No icon library. Each icon is decoration: the button it sits in carries the accessible name (aria-label) and the tooltip (title).
import type { ReactNode } from 'react'

export type IconName = 'desktop' | 'tablet' | 'phone' | 'undo' | 'redo' | 'reset' | 'review' | 'copy' | 'download' | 'rotate'

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
  reset: <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5" />,
  review: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-.8.8M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l.8-.8M3.5 3.5l17 17" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  rotate: <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5" />,
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
  onClick: () => void
}

/** An icon button: aria-label for the name, title for the visible tooltip, a focus ring from the stylesheet. */
export function IconButton({ icon, label, disabled, pressed, expanded, badge, onClick }: Props) {
  return (
    <button type="button" className="btn btn-secondary ue-icon" aria-label={label} title={label} disabled={disabled} aria-pressed={pressed} aria-expanded={expanded} onClick={onClick}>
      <Icon name={icon} />
      {badge ? (
        <span className="ue-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  )
}
