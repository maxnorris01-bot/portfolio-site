import type { ReactNode } from 'react'
import './PageHeader.css'

type Props = {
  /** The page's one h1. */
  title: ReactNode
  /** Small mono line above the lead (a kind of page, a project label). */
  eyebrow?: ReactNode
  /** One or two sentences under the title. */
  lead?: ReactNode
  /** Beside the title on the same line where it fits (tags, a badge). */
  titleMeta?: ReactNode
  /** The right-hand area from 1100px up (stats, actions, an illustration); under the title block when narrower. */
  aside?: ReactNode
  /** Under the lead: buttons, tags. */
  children?: ReactNode
  /** Narrow right-hand area (an illustration) instead of the wide one (stats). */
  asideSize?: 'wide' | 'narrow'
  /** When stacked (under 1100px), show the aside above the title block. */
  asideFirst?: boolean
  /** Let the lead run the full width of its column (the tool header's does) instead of the reading width. */
  fullLead?: boolean
  className?: string
}

/** The page header every page shares: title, optional lead and eyebrow, optional right-hand area. */
export default function PageHeader({ title, eyebrow, lead, titleMeta, aside, children, asideSize = 'wide', asideFirst = false, fullLead = false, className }: Props) {
  const classes = ['page-header', `is-aside-${asideSize}`, asideFirst ? 'is-aside-first' : '', fullLead ? 'is-lead-full' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <header className={classes}>
      <div className="page-header-main">
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {titleMeta}
        </div>
        {(eyebrow || lead) && (
          <div className="page-sub-row">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {lead && <p className="page-lede">{lead}</p>}
          </div>
        )}
        {children}
      </div>
      {aside && <div className="page-header-aside">{aside}</div>}
    </header>
  )
}
