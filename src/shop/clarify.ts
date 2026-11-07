// The clarifying questions' state (stage Q2): what the server last said, and what the visitor has chosen on this page.
// Pure functions, so the reducer, the answer list and the panel's mode are tested without a browser.
import { clarifyAny } from './copy.ts'
import type { Clarify, ClarifyAnswer, ClarifyOption, ClarifyQuestion } from './types.ts'

export const NO_PREFERENCE = 'no_preference'

/** Why the panel says something quiet: the questions closed under it, the post failed (retry or ignore), or the server stopped taking posts. */
export type ClarifyNote = 'closed' | 'failed' | 'limit' | null

export type ClarifyUi = {
  /** The server's latest clarify object (from a poll or an answers response). */
  server: Clarify
  /** Question id to the chosen option value. null: cleared here. Absent: not touched here (the server's answer, if any, shows). */
  selected: Record<string, string | null>
  /** "Show results" was pressed (or the server says it was). */
  submitted: boolean
  note: ClarifyNote
}

export type ClarifyAction =
  | { type: 'server'; clarify: Clarify }
  | { type: 'select'; id: string; value: string | null }
  | { type: 'submitted'; value: boolean }
  | { type: 'note'; note: ClarifyNote }

export function clarifyReduce(ui: ClarifyUi | null, action: ClarifyAction): ClarifyUi | null {
  switch (action.type) {
    case 'server': {
      const c = action.clarify
      return { server: c, selected: ui?.selected ?? {}, submitted: (ui?.submitted ?? false) || c.submitted, note: ui?.note ?? null }
    }
    case 'select':
      return ui ? { ...ui, selected: { ...ui.selected, [action.id]: action.value } } : ui
    case 'submitted':
      return ui ? { ...ui, submitted: action.value } : ui
    case 'note':
      return ui ? { ...ui, note: action.note } : ui
  }
}

/** The option value chosen for a question: this page's choice, else what the server holds, else none. */
export function chosen(ui: ClarifyUi, questionId: string): string | null {
  if (questionId in ui.selected) return ui.selected[questionId]
  return ui.server.answers.find((a) => a.question_id === questionId)?.option_value ?? null
}

/** The panel is shown only for questions the server is holding the search for. */
export function panelVisible(ui: ClarifyUi | null | undefined): ui is ClarifyUi {
  return !!ui && ui.server.state === 'ready' && ui.server.questions.length > 0
}

/** Tiles are disabled once the answers are final: applied, submitted, or the server said the questions closed. */
export function panelLocked(ui: ClarifyUi): boolean {
  return ui.server.applied || ui.submitted || ui.note === 'closed'
}

/**
 * The answers to post: every question with a choice. A question cleared here that the server has an answer for goes as "no_preference"
 * (the server keeps the last answer, so this is how it is taken back); a cleared question it never had is left out.
 */
export function answersToPost(ui: ClarifyUi, posted: ReadonlySet<string>): ClarifyAnswer[] {
  const out: ClarifyAnswer[] = []
  for (const q of ui.server.questions) {
    const value = chosen(ui, q.id)
    if (value !== null) out.push({ question_id: q.id, option_value: value })
    else if (posted.has(q.id) || ui.server.answers.some((a) => a.question_id === q.id)) out.push({ question_id: q.id, option_value: NO_PREFERENCE })
  }
  return out
}

/** Whether an option is expected to get a picture: while the server is still checking pictures, every option might; afterwards only those with a URL. */
export function expectsPicture(clarify: Clarify, picture: string | null): boolean {
  return picture !== null || clarify.pictures_state === 'pending'
}

// ---- the stepper: one question at a time ----

/** The pause between choosing and moving on, so the choice is seen. */
export const ADVANCE_MS = 250

/** The question to show first: the first one without an answer, else the first. */
export function firstUnanswered(ui: ClarifyUi): number {
  const i = ui.server.questions.findIndex((q) => chosen(ui, q.id) === null)
  return i === -1 ? 0 : i
}

/** The question to move to after answering `current`: the next unanswered one after it; null on the last question or when none follows. */
export function nextStep(ui: ClarifyUi, current: number): number | null {
  const qs = ui.server.questions
  for (let i = current + 1; i < qs.length; i++) if (chosen(ui, qs[i].id) === null) return i
  return null
}

/** Keeps a step inside the list (questions can arrive or change under it). */
export const clampStep = (step: number, count: number): number => Math.max(0, Math.min(step, count - 1))

/** How far above the window's bottom edge the panel's top may be before the page scrolls it into view. */
export const SCROLL_BOTTOM_MARGIN = 120

/**
 * Whether to scroll the panel into view when the questions first arrive: the visitor has not scrolled, and the panel starts near or below
 * the window's bottom (its top is below the bottom minus 120px) or runs past it (its bottom is below the window). The aim is the whole panel in view.
 */
export function shouldAutoScroll(o: { panelTop: number; panelBottom: number; viewportHeight: number; scrolled: boolean }): boolean {
  return !o.scrolled && (o.panelTop > o.viewportHeight - SCROLL_BOTTOM_MARGIN || o.panelBottom > o.viewportHeight)
}

/** What choosing `value` on the question at `step` does: the answer to record (null clears it: choosing the chosen option again) and where to move on to (never when clearing, never past the last question). */
export function choiceOutcome(ui: ClarifyUi, step: number, value: string): { answer: string | null; advanceTo: number | null } {
  const q = ui.server.questions[step]
  const clearing = chosen(ui, q.id) === value
  return { answer: clearing ? null : value, advanceTo: clearing ? null : nextStep(ui, step) }
}

/** The tile to focus after a key in a radio group of `count` tiles at `at`: the arrows move (and wrap), Home and End jump; any other key is null. Moving never chooses. */
export function roveTo(key: string, at: number, count: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (at + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (at - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

// ---- the picks so far (the panel's right column) ----

export type Pick = { id: string; question: string; label: string }

/** The answers chosen so far, in question order: the chosen option's label ("Any colour" for No preference). */
export function picks(ui: ClarifyUi): Pick[] {
  const out: Pick[] = []
  for (const q of ui.server.questions) {
    const value = chosen(ui, q.id)
    if (value === null) continue
    const option = q.options.find((o) => o.value === value)
    out.push({ id: q.id, question: q.text, label: option ? option.label : clarifyAny(q.dimension) })
  }
  return out
}

// ---- progressive questions (F2): the list can grow while the visitor answers ----

/** If more_coming does not clear in this long the visitor may press Show results anyway. */
export const MORE_WAIT_CAP_MS = 10_000

/** True while the visitor is on the last question that exists and the service says another is on its way (unless the wait cap passed). Show results waits then. */
export function waitingForMore(ui: ClarifyUi, step: number, capped: boolean): boolean {
  return ui.server.more_coming === true && step >= ui.server.questions.length - 1 && !capped
}

/** The step label: "2 of 3", or "2 of 3+" while more questions are coming. */
export function stepCount(step: number, total: number, more: boolean): string {
  return `${step + 1} of ${total}${more ? '+' : ''}`
}

/** Where to go when questions arrive under a visitor who had already answered the last one (they are waiting for it): the first new question; otherwise stay put. */
export function stepAfterGrowth(o: { step: number; before: number; after: number; answered: boolean }): number | null {
  return o.after > o.before && o.step === o.before - 1 && o.answered ? o.before : null
}

// ---- icons, swatches and pictures in the options (F2) ----

export type Visual =
  | { kind: 'swatch'; colors: string[] }
  | { kind: 'icon'; key: string }
  | { kind: 'picture'; url: string }
  | { kind: 'pending' }
  | { kind: 'none' }

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** One to three safe CSS hex colours (anything else is dropped, so a payload cannot inject styles). */
export function safeSwatches(swatches: readonly string[] | null | undefined): string[] {
  return (swatches ?? []).filter((c) => typeof c === 'string' && HEX.test(c)).slice(0, 3)
}

/** Whether the service expects pictures for the question: its own flag, else a guess from the dimension. */
export function pictureEligible(q: ClarifyQuestion): boolean {
  return q.picture_eligible ?? ['color', 'shape', 'style', 'size'].includes(q.dimension)
}

/**
 * What an option shows in its picture area. Swatches first, then a drawing that exists (`hasIcon`), then a verified picture; while the
 * service still checks pictures an eligible option with none of those reserves its area; anything else is text.
 */
export function optionVisual(clarify: Clarify, q: ClarifyQuestion, o: ClarifyOption, hasIcon: (key: string) => boolean): Visual {
  const colors = safeSwatches(o.swatches)
  if (colors.length > 0) return { kind: 'swatch', colors }
  if (o.icon && hasIcon(o.icon)) return { kind: 'icon', key: o.icon }
  if (o.picture_url) return { kind: 'picture', url: o.picture_url }
  if (clarify.pictures_state === 'pending' && pictureEligible(q) && !o.icon) return { kind: 'pending' }
  return { kind: 'none' }
}

/** Tiles when at least half the options have (or will have) a visual; otherwise a row of buttons. */
export function questionLayout(clarify: Clarify, q: ClarifyQuestion, hasIcon: (key: string) => boolean): 'tiles' | 'buttons' {
  const withVisual = q.options.filter((o) => optionVisual(clarify, q, o, hasIcon).kind !== 'none').length
  return withVisual > 0 && withVisual * 2 >= q.options.length ? 'tiles' : 'buttons'
}
