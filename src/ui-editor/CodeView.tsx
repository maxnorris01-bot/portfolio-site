import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { codeView as C, labels } from '../data/uiEditor'
import { changeOfLine, linesOf, tickShare, type Hunk } from './diff'

export interface CodeViewHandle {
  /** The code box (for selecting its text by hand when the clipboard is not available). */
  box: () => HTMLElement | null
}

interface Props {
  file: string
  /** The header (the file and its number of changes) and the accessible name of this section's Copy button (round 5: one section per file, each with its own Copy). */
  header: string
  copyName: string
  onCopy: () => void
  /** The updated file, as exported: the text is shown whole, line by line, and Copy and Download give exactly this. */
  text: string
  /** The changes of this file against the file as it was opened: their lines are marked. */
  hunks: Hunk[]
  /** The changes of all the files together (the counter reads "k of total"), the one last visited (0: none), and how many changes come before this file's own. */
  total: number
  current: number
  offset: number
  /** A change of this file to scroll to and flash (it was just visited); `nonce` changes with every visit. */
  target: { change: number; nonce: number } | null
  /** A tick of the change map: the change's number in this file. */
  onJump: (change: number) => void
}

/**
 * The updated code, the whole file, with the lines that changed or were added against the original tinted AND marked with a "+" in the left margin
 * (not colour alone); where lines were removed a thin marker sits between the lines. Previous and Next change walk the changes of ALL the files (the
 * tool switches the shown file when the next change is in another one), scroll to the change and flash it; a narrow change map beside the code has one
 * tick per change of the shown file, placed in proportion to its line number.
 * Plain: nothing in here is part of the text (the gutter, markers and ticks are not selectable), so selecting the code by hand copies the file.
 */
const CodeView = forwardRef<CodeViewHandle, Props>(function CodeView({ file, header, copyName, onCopy, text, hunks, total, current, offset, target, onJump }, ref) {
  const box = useRef<HTMLDivElement>(null)
  const section = useRef<HTMLElement>(null)
  useImperativeHandle(ref, () => ({ box: () => box.current }), [])
  const lines = useMemo(() => linesOf(text), [text])

  // A visit (Next, Previous or a tick) scrolls the change into the middle of the box and flashes it. This view is made new for each file, so a visit that
  // switched the file finds its change here when the view is first drawn.
  useLayoutEffect(() => {
    const b = box.current
    if (!target || !b) return
    // The section itself is brought into the window (the sections are stacked, so the change may be in one further down).
    section.current?.scrollIntoView({ block: 'nearest' })
    const el = b.querySelector<HTMLElement>(`[data-line][data-change="${target.change}"]`) ?? b.querySelector<HTMLElement>(`[data-removed][data-change="${target.change}"]`)
    if (el) b.scrollTo({ top: Math.max(0, el.offsetTop - b.clientHeight / 2 + el.offsetHeight / 2), behavior: 'auto' })
    // The flash is a class put on the change's lines for a moment (the DOM, not state: nothing else needs to know).
    const lit = [...b.querySelectorAll<HTMLElement>(`[data-line][data-change="${target.change}"]`)]
    lit.forEach((l) => l.classList.add('is-flash'))
    const timer = window.setTimeout(() => lit.forEach((l) => l.classList.remove('is-flash')), 1400)
    return () => {
      window.clearTimeout(timer)
      lit.forEach((l) => l.classList.remove('is-flash'))
    }
  }, [target?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows: ReactNode[] = []
  lines.forEach((t, i) => {
    const n = i + 1
    hunks.forEach((h, idx) => {
      if (h.removed > 0 && h.after === n - 1) rows.push(<Removed key={`r${idx}`} after={h.after} change={idx + 1} count={h.removed} />)
    })
    const k = changeOfLine(hunks, n)
    rows.push(
      <div key={n} className="ue-line" data-line={n} data-change={k ?? undefined}>
        <span className="ue-gut" aria-hidden="true">
          {n}
        </span>
        <span className="ue-mk" aria-hidden="true" {...(k !== null ? { 'data-margin-marker': '', title: C.changedLine } : {})}>
          {k !== null ? '+' : ''}
        </span>
        <span className="ue-ct" data-code-text>
          {t}
        </span>
      </div>,
    )
  })
  // Lines removed after the last line.
  hunks.forEach((h, idx) => {
    if (h.removed > 0 && h.after >= lines.length) rows.push(<Removed key={`r${idx}`} after={h.after} change={idx + 1} count={h.removed} />)
  })

  return (
    <section ref={section} className="ue-codeview" data-code-section data-file={file}>
      <div className="ue-sechead">
        <span className="ue-sectitle" data-section-header>
          {header}
        </span>
        <button type="button" className="btn btn-secondary ue-copy" aria-label={copyName} title={labels.copyTip(file)} onClick={onCopy}>
          {labels.copyWord}
        </button>
      </div>
      <div className="ue-codebody">
        <div ref={box} className="ue-codebox" data-code-view data-file={file} tabIndex={0} role="region" aria-label={`${labels.code}: ${file}`}>
          {rows}
        </div>
        <div className="ue-map" data-change-map>
          {hunks.map((h, idx) => (
            <button key={idx} type="button" className={`ue-tick${current === offset + idx + 1 ? ' is-current' : ''}`} style={{ top: `${tickShare(h, lines.length) * 100}%` }} aria-label={C.tick(offset + idx + 1, total)} title={C.tick(offset + idx + 1, total)} onClick={() => onJump(idx + 1)} />
          ))}
        </div>
      </div>
    </section>
  )
})

/** A thin marker between two lines where lines of the original were removed (they are not shown as text). */
function Removed({ after, change, count }: { after: number; change: number; count: number }) {
  const label = C.removed(count)
  return (
    <div className="ue-removed" data-removed data-removed-after={after} data-change={change} role="img" aria-label={label} title={label}>
      <span className="ue-rm" aria-hidden="true">
        −
      </span>
    </div>
  )
}

export default CodeView
