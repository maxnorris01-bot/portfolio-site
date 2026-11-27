// The edit list is the state (docs/ui-editor-gate-rules.md, brief: "the edit list is the state"): Undo pops the last edit, Redo puts it back,
// Reset clears the list. The preview and the export are always recomputed by replaying the ordered list on the ORIGINAL source, so the same
// list gives the same code. Pure, so it runs under node (tests/uieditorstate.test.ts).
import { customEdits, resetView, type Edit, type Environment } from './vendor/engine.js'

/**
 * A reset of one small view (Phone or Tablet) is an entry of the history of its own: it takes that view's custom edits out of what the engine replays, but they stay in the history
 * before it, so one Undo puts back exactly the list that was there and one Redo takes them out again. It is never sent to the engine (`effectiveEdits` folds it away).
 */
export type ViewReset = { op: 'resetView'; environment: 'phone' | 'tablet' }
/** What the history holds: the engine's edits and the view resets between them. */
export type Entry = Edit | ViewReset

export interface EditList {
  edits: Entry[]
  /** Undone edits, the most recently undone last. */
  redo: Entry[]
}

export const emptyList = (): EditList => ({ edits: [], redo: [] })

export type ListAction = { type: 'apply'; edit: Edit } | { type: 'resetView'; environment: 'phone' | 'tablet' } | { type: 'undo' } | { type: 'redo' } | { type: 'reset' }

export const canUndo = (s: EditList) => s.edits.length > 0
export const canRedo = (s: EditList) => s.redo.length > 0

type Offset = Extract<Edit, { op: 'offset' }>

const sameScope = (a: Offset, b: Offset) => a.target === b.target && (a.environment ?? 'desktop') === (b.environment ?? 'desktop') && (a.link ?? true) === (b.link ?? true)

/**
 * Two moves of the same element in a row (a drag after a drag, or a run of arrow-key nudges) are one move: the engine composes each
 * offset as another translate, so repeating them would pile up `translate(1px, 0) translate(1px, 0) ...` in the visitor's code. The
 * pair becomes one edit (the sum); a pair that cancels out leaves no edit at all.
 */
export function mergeOffsets(last: Entry | undefined, next: Edit): Edit | null | undefined {
  if (!last || last.op !== 'offset' || next.op !== 'offset' || !sameScope(last, next)) return undefined
  const dx = last.dx + next.dx, dy = last.dy + next.dy
  return dx === 0 && dy === 0 ? null : { ...next, dx, dy }
}

/** The edits the engine replays: the history with every view reset applied where it stands (the edits of that view before it are dropped, content edits never are). */
export function effectiveEdits(entries: readonly Entry[]): Edit[] {
  let out: Edit[] = []
  for (const e of entries) {
    if (e.op === 'resetView') out = resetView(out, e.environment)
    else out.push(e)
  }
  return out
}

/** How many custom edits a small view has now (a view reset or the content edits never count): the "customised" mark and the Reset button read it. */
export const customCount = (entries: readonly Entry[], environment: Environment): number => customEdits(effectiveEdits(entries), environment).length

export function listReduce(s: EditList, a: ListAction): EditList {
  switch (a.type) {
    case 'resetView':
      // A view with nothing custom has nothing to reset: no empty entry in the history.
      return customCount(s.edits, a.environment) === 0 ? s : { edits: [...s.edits, { op: 'resetView', environment: a.environment }], redo: [] }
    case 'apply': {
      const merged = mergeOffsets(s.edits[s.edits.length - 1], a.edit)
      if (merged === undefined) return { edits: [...s.edits, a.edit], redo: [] }
      return { edits: merged === null ? s.edits.slice(0, -1) : [...s.edits.slice(0, -1), merged], redo: [] }
    }
    case 'undo':
      return s.edits.length ? { edits: s.edits.slice(0, -1), redo: [...s.redo, s.edits[s.edits.length - 1]] } : s
    case 'redo':
      return s.redo.length ? { edits: [...s.edits, s.redo[s.redo.length - 1]], redo: s.redo.slice(0, -1) } : s
    case 'reset':
      return emptyList()
  }
}
