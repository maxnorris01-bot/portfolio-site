# UI Editor page gate: rules (LOCKED in Step 0)

Written 2026-11-15, before any page code. After the commit that adds this file, the rules, the three samples
(`src/ui-editor/samples/`) and the specs (`scripts/ui-editor-gate/specs.json`) are never edited. If a rule turns out to
be wrong, it is recorded and Max decides. Sections marked **(mine)** are operational definitions I wrote. The
samples and the specs were written by Claude Code, the same agent that builds the page: that is a limit of this gate,
not a hidden fact.

The question the gate asks: does the visitor-facing editor do what a person at a mouse would expect, and is what it
shows the same as what it exports? Everything below is scored by script: no hand-judging.

## 1. What is scored

20 scripted real-mouse actions (`specs.json`, S01 to S20) on the three shipped samples, in headless Chromium
(`page.mouse` for pointer actions, real clicks and typing in the panel), on the real built page. Each action runs on a
fresh page load, with no retries. The host window is 1920 x 1080 so the 1280 px Desktop preview needs no horizontal
scroll **(mine)**.

Every action gets one outcome:

- **PASS**: every applicable check P1 to P5 passed.
- **REFUSED**: only for the two designed refusals (S15, S16): the engine's true reason is shown as the page's message,
  and nothing was applied (preview, export, Undo and Redo, the Review count all as before).
- **FAIL**: anything else, including a refusal anywhere else.

## 2. The five checks

**P1, the preview matches the expected value.** The spec names numbers a browser can measure on the preview
(`getBoundingClientRect` and computed style inside the preview iframe) without the engine: for example "the element's
left edge moved by 40 +-1.5 px". Tolerances: 1.5 px for a value that comes from a pointer drag, 0.6 px for a value
derived from a ratio, 0.05 px for a typed font size **(mine)**. Widths other than the current one are measured by
setting the iframe's width for the measurement and putting it back **(mine)**.

**P2, the export matches the preview.** The exported files (the files the Download button saves, the user-visible
artifact) are served from a temporary local server under their original names and loaded in a separate fresh headless
page. For every element, paired by document order, at each of the widths the spec lists (1280, B+1, B and 390, where
B is the page's own phone breakpoint: 640 for the landing page, 480 for the email; the SVG has no breakpoint and is
measured at 1280 and 390): the bounding box matches within 1 px and every computed property matches exactly, except
that the layout-resolved size properties (`width`, `height`, `inline-size`, `block-size`, `perspective-origin`,
`transform-origin`) match within 1 px **(mine)**. The fresh page's viewport is the preview's size.

**P3, nothing else changed.** Before and after the action, every element's computed style (every property) and bounding
box are dumped at the spec's widths. The target is excluded. Every other element must be identical within 1 px, except
where the spec's class allows a difference. The classes are the engine project's E4 classes, restated here **(mine)**:

- `none`: nothing may differ (used for refusals, Undo, Reset, view changes, selection).
- `descendants`: descendants of the target may differ in anything (inheritance and reflow).
- `flow`: `descendants`, plus, for the target's ancestors, the target's following siblings, and the following siblings
  of any ancestor (and all their descendants): the bounding box and the layout-resolved properties named in P2. A
  sibling's colour, font, margin or any specified property may never differ.
- `reorder`: `descendants`, plus the same layout-resolved allowance for every child of the target's parent and all
  their descendants, and for the parent's following siblings and ancestors.
- `svg-ancestors`: `descendants`, plus the bounding box (only) of the target's ancestors.

Amendments 1 and 2 of the engine project's responsive rules are in force: for `flow` and `reorder`, the preceding
siblings of the target and of each ancestor, and all their descendants, get the layout-resolved allowance when their
container is a table row (`tr`) or a flex or grid container in the original document at the width being tested; and a
missing final newline on the original file is not a change.

Because a reorder changes document order, elements are paired by a stable key: the nearest id (the element's own or
an ancestor's) plus the tag path below it, else the tag path from the root **(mine)**. All the reordered elements in
the samples carry ids.

**P4, minimal diff.** A line diff of each file (original against export): changed lines of a file are
`max(removed, added)`. Only the files the spec lists may differ; every other file must be byte-identical. A spec gives
its budget as the most changed lines allowed. A reorder must also be a pure permutation of whole lines (the multiset of
removed lines equals the multiset of added lines). A spec with no edit has budget 0 and the export must be
byte-identical to the original.

The budgets were set from a dry run of the engine's own edit on the locked samples, before any page code existed
(they are the engine's own minimal output, not a guess): this lets P4 fail on a single extra line, which the scorer
check in Step 1 needs. The dry run also confirmed that each designed scenario exists (both refusals refuse, with the
reasons below). No value or spec was changed after seeing a result.

**P5, the UI state is right.** The panel value (a labelled field's text), the link dot, the Review unlinked count,
the enabled state of Undo and Redo, the message text, the selected element's label, the view buttons and the
preview's width, as the spec lists.

## 3. The UI contract the gate relies on (mine)

The page must expose these, by accessible name or the listed attribute. They are the page's own UI, not test-only
hooks, except the `data-` attributes.

- Sample picker: a `select` named "Sample" (option values `landing`, `email`, `chart`).
- View switcher: buttons "Desktop", "Tablet" and "Phone" in a group named "View" (`aria-pressed`). A visible
  environment label: `[data-env]` reads "Desktop", "Tablet" or "Phone".
- Top bar buttons: "Paste", "Upload", "Undo", "Redo", "Reset all", "Review unlinked (N)", "Copy code", "Download",
  and a `select` named "File" (the files of the sample; Copy code and Download act on the chosen file).
- Preview: `iframe[title="Preview"]`, `sandbox="allow-same-origin"`. Overlay: `[data-hover]`, `[data-selection]`
  and `[data-handle="n|ne|e|se|s|sw|w|nw"]` (host elements, positioned from the element's bounding rect).
- Panel: `[data-selected-label]` (for example "h1 #headline"); fields named "Font family", "Font size",
  "Font weight", "Text colour", "Alignment", "Width", "Height", "Padding", "Margin", "Background",
  "Border colour", "Border width", "Border radius", "Nudge X", "Nudge Y"; each field's row is
  `[data-field="<css property>"]` and holds `[data-dot]` when the value is unlinked ("position" for the nudge
  row); buttons "Move up" and "Move down"; a checkbox "Link to Phone" (while on Desktop) or "Link to Desktop"
  (while on Phone).
- Messages: one `role="status"` region named "Edit result".
- A confirm bar when edits would be discarded: buttons "Discard edits" and "Keep editing".
- Code: a read-only text area per file under "Updated code" (the select-the-text fallback for Copy).
- Download names: the main file as `<name>-edited.<ext>`; a companion stylesheet under its own name (so the page's
  link to it still works).

## 4. The pass line (all must hold)

1. At least **18 of 20 PASS** and **zero FAIL** (the two designed refusals are REFUSED, not FAIL, and count toward
   the 20; so 18 PASS + 2 REFUSED is the minimum, with every other outcome a miss).
2. Regression: every existing `npm test` result as in the Step 1 baseline (no test that passed now fails; the
   skipped ones stay skipped), `tsc -b`, `eslint` and `vite build` clean.
3. Flag OFF verified on a production-style build served with `vite preview` (no nav link, no planet, `/ui-editor` shows
   the NotFound page, the lazy chunk is not requested), and flag ON verified likewise.
4. `check:layout` (the full sweep) shows no new misses beyond ones explained in `check-layout.expected.json`, for the
   new page and for Home with four planets.
5. The scorer check (Step 1) passed.
6. No-op: loading each sample and exporting with no edits gives the original bytes (every file).

## 5. Decided in advance

Any miss on the pass line means the page FAILS. The report says so plainly, does **not** tune rules or specs, and names
the cheapest next test. A change made after the scored run is a labelled iteration: both runs are kept. The pass line
does not move.

## 6. Known limits of this gate

Written by the agent that builds the page; Chromium only; a scripted mouse, not a person; no touch; Safari and
Firefox untested; the samples are small and original (real pages are the engine project's own earlier gate).
