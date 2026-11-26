// Every name and string of the UI Editor page, in one place, so a rename is one line (like satelliteTool.ts for the satellite tool).
// The page is behind a flag (uiEditorFlag.ts) until Max releases it. Labels that the gate's UI contract names (docs/ui-editor-gate-rules.md)
// are tested against this file (tests/uieditor*.test.ts).

export interface UiEditorInfo {
  /** The tool's name: the nav button, the Home planet, the page title and the tab title. */
  name: string
  /** The page's address. */
  route: string
  /** Two sentences, in the style of the other Home cards (Max approves the wording before release). */
  planet: { text: string; compact: string }[]
  /** Where the "View on GitHub" button goes; null (no button) while the engine repository is private. */
  repoUrl: string | null
  /** The browser tab title and meta description while the page is open. */
  pageTitle: string
  pageDescription: string
}

export const uiEditor: UiEditorInfo = {
  name: 'UI Editor',
  route: '/ui-editor',
  planet: [
    {
      text: 'UI Editor lets you paste or upload your own HTML or SVG, click an element and change its text, size, colours or position from a ribbon or by dragging.',
      compact: 'UI Editor lets you paste your own HTML or SVG, click an element and change it from a ribbon or by dragging.',
    },
    {
      text: 'It writes each change back into your own code and leaves every other line as you wrote it, then you copy or download the updated code. Everything runs in your browser.',
      compact: 'It writes each change back into your code and leaves every other line alone. Everything runs in your browser.',
    },
  ],
  repoUrl: null,
  pageTitle: 'UI Editor — Max Norris',
  pageDescription: 'Paste or upload your own HTML or SVG, click an element and change it from a ribbon or by dragging, then copy the updated code. Runs entirely in your browser.',
}

/** The chips under the title (the same kind of list as SatPOV's and ShopAI's). Only what is true: the page is React, the engine is TypeScript,
 *  and the vendored engine bundles parse5 (reads HTML and SVG) and postcss (reads CSS) (src/ui-editor/vendor/README.md). */
export const techStack = ['TypeScript', 'React', 'parse5', 'postcss']

/** One line for each sample card in the gallery (the samples' ids are in src/ui-editor/samples/manifest.ts). */
export const sampleDescriptions = {
  landing: 'A hero, three cards and a footer, with its own stylesheet.',
  email: 'A table-based newsletter with a narrow-screen rule.',
  chart: 'A small bar chart drawn as SVG, one bar a weekday.',
}

/** The page's header and the sections under the editor. */
export const uiEditorPage = {
  lead: 'Paste or upload your own HTML or SVG, click an element and change it from a ribbon or by dragging, then copy the updated code. It runs entirely in your browser.',
  howLink: 'How it works and limits',
  githubLabel: 'View on GitHub ↗',
}

/** Widths of the three views in portrait, in CSS px. Desktop is the engine's desktop size. */
export const VIEW_WIDTHS = { Desktop: 1280, Tablet: 768, Phone: 390 } as const
/** Heights of the Tablet and Phone screens in portrait, in CSS px (turned sideways, width and height swap). Desktop has no fixed height. */
export const DEVICE_HEIGHTS = { Tablet: 1024, Phone: 844 } as const
/** Under the stage in the Phone view. */
export const deviceNote = 'Previewed at a typical phone width (390 px). Other phones show the same code at their own width.'
/** Most that Paste and Upload accept together, in bytes. */
export const MAX_BYTES = 1_000_000

/** Controls and labels. The gate drives the page by these names. */
export const labels = {
  bar: 'Editor controls',
  sample: 'Sample',
  samplesButton: 'Samples',
  gallery: 'Sample gallery',
  galleryHint: 'Pick a sample to start, or paste or upload your own HTML or SVG.',
  samples: { landing: 'Landing page', email: 'HTML email', chart: 'SVG chart' },
  paste: 'Paste',
  fullWidth: 'Full width',
  ownCode: 'Your own code',
  ownCodeDesc: 'Paste or upload your own HTML or SVG, up to 1 MB.',
  upload: 'Upload',
  view: 'View',
  desktop: 'Desktop',
  tablet: 'Tablet',
  phone: 'Phone',
  undo: 'Undo',
  redo: 'Redo',
  resetAll: 'Reset all',
  rotate: 'Rotate',
  /** Insert round 1: the Insert menu in the quick bar, and Edit text and Delete in the selection strip. The names are exactly these; each tooltip starts with a verb. */
  insert: 'Insert',
  insertTip: 'Open the list of things you can insert.',
  insertTipSvg: 'Insert is for HTML pages: an SVG cannot take new elements.',
  insertTipTablet: 'Tablet turned sideways is view-only: turn it upright, or switch to Desktop or Phone, to insert.',
  insertTipViewOnly: 'This size is view-only: turn the phone upright, or switch to Desktop, to insert.',
  /** Insert round 1, stage 2: Comment in the quick bar, Notes in the strip, Include comments by Download, and the popovers' words. */
  comment: 'Comment',
  commentTip: 'Open a note for the AI about this element.',
  commentTipNone: 'Select an element first: the note is about it.',
  commentTipViewOnly: 'This size is view-only: turn the phone upright, or switch to Desktop, to add a note.',
  commentTipTablet: 'Tablet turned sideways is view-only: turn it upright, or switch to Desktop or Phone, to add a note.',
  notes: 'Notes',
  notesTip: 'List the notes for the AI.',
  includeComments: 'Include comments',
  includeCommentsTip: 'Keep the notes for the AI in the code you copy and download.',
  noteField: 'Note for the AI',
  pageNoteField: 'Note for the AI',
  save: 'Save',
  deleteNote: 'Delete note',
  edit: 'Edit',
  addPageNote: 'Add a note for the whole page',
  deletePageNote: 'Delete page note',
  notesList: 'Notes',
  noteName: (n: number) => `Note ${n}`,
  editText: 'Edit text',
  editTextTip: 'Edit the text of this element (also F2 or a double-click).',
  elementText: 'Element text',
  deleteElement: 'Delete',
  deleteTip: 'Use this or the Delete key to remove the element.',
  /** Tooltips: verb first, the name unchanged (the accessible name is the label; the tooltip then becomes the accessible description). */
  undoTip: 'Undo the last edit',
  redoTip: 'Redo the edit you undid',
  resetTip: 'Reset every edit and go back to the original',
  rotateTip: 'Turn the device sideways or upright',
  viewTip: (name: string) => `Show the ${name} size`,
  file: 'File',
  copy: 'Copy code',
  /** The tooltips (and so the accessible descriptions) of Copy code and Download name the file they act on; the accessible names stay `Copy code` and `Download`. */
  copyTip: (file: string) => `Copy ${file} to the clipboard`,
  /** The header of one code section, and the word on its Copy button. */
  copyWord: 'Copy',
  download: 'Download',
  downloadTip: (files: string[]) => (files.length > 1 ? `Download all ${files.length} files: ${files.join(' and ')}` : `Download ${files[0] ?? 'the file'}`),
  code: 'Updated code',
  result: 'Edit result',
  preview: 'Preview',
  previewHint: 'Click an element to select it. Drag it to move it, or drag a handle to resize it. Double-click an element, or press F2, to change its text; the Delete key removes it. With an element selected, the arrow keys nudge it by 1 px (10 px with Shift). Handles are for the pointer; the ribbon controls and the arrow keys do the same from the keyboard.',
  discard: 'Discard edits',
  keep: 'Keep editing',
  openPaste: 'Open pasted code',
  cancel: 'Cancel',
  pasteMarkup: 'HTML or SVG',
  pasteCss: 'Companion CSS (optional)',
  pasteTitle: 'Paste code',
  tool: 'Editor',
  confirm: 'Confirm',
  replaceText: 'Replace what is open? Your edits will be lost.',
  resetText: 'Reset every edit and go back to the original?',
}

/** The editing ribbon. A field's `prop` is the CSS property it writes (SVG has its own mapping in the ribbon). */
export const panel = {
  title: 'Selected element',
  ribbon: 'Formatting ribbon',
  none: 'Click an element to edit it',
  tablet: 'Tablet turned sideways is view-only, so its settings and handles are switched off. Turn it upright, or switch to Desktop or Phone, to edit.',
  viewOnly: 'This size is view-only, so its settings and handles are switched off: turn the phone upright, or switch to Desktop, to edit.',
  /** The strip above the ribbon, and the seven groups of one ribbon (the group's name sits under its controls). */
  strip: 'Selected element',
  pathLabel: 'Selected element path',
  selectParent: 'Select parent',
  selectParentTip: 'Use the parent of this element as the selection (Alt+Up Arrow).',
  pathName: (label: string) => `Select ${label}`,
  pathTip: (label: string) => `Use the ${label} element that holds this one as the selection.`,
  groups: { font: 'Font', paragraph: 'Paragraph', size: 'Size', shape: 'Shape', shapeStyles: 'Shape Styles', spacing: 'Spacing', arrange: 'Arrange', grid: 'Grid' },
  fonts: 'Font family',
  fontSize: 'Font size',
  fontWeight: 'Font weight',
  textColour: 'Text colour',
  alignment: 'Alignment',
  width: 'Width',
  height: 'Height',
  padding: 'Padding',
  margin: 'Margin',
  background: 'Background',
  borderColour: 'Border colour',
  borderWidth: 'Border width',
  borderRadius: 'Border radius',
  moveUp: 'Move up',
  moveDown: 'Move down',
  nudgeX: 'Nudge X',
  nudgeY: 'Nudge Y',
  nudgeHint: 'Pixels to move by; press Enter.',
  decrease: (label: string) => `Decrease ${label}`,
  increase: (label: string) => `Increase ${label}`,
  /** The Sides button of Padding and Margin: it opens a small popover with the four sides. */
  sides: 'Sides',
  sidesName: (label: string) => `${label} sides`,
  sidesTip: (label: string) => `Edit each side of ${label.toLowerCase()}`,
  stepTip: (label: string, step: number, unit: string) => `${label}: click for ${step} ${unit}, Shift for ${step * 10}, hold to repeat`,
  widthUnit: 'Width unit',
  mixed: 'mixed',
  sideNames: ['top', 'right', 'bottom', 'left'],
  /** The visible label above each control, in plain words (round 4): the control's accessible name is the key and stays as it was. */
  ctl: { 'Font family': 'Font family', 'Font size': 'Font size', 'Font weight': 'Weight', 'Text colour': 'Text colour', Width: 'Width', Height: 'Height', Padding: 'Padding', Margin: 'Margin', Background: 'Fill colour', 'Border colour': 'Line colour', 'Border width': 'Line thickness', 'Border radius': 'Corner rounding', 'Nudge X': 'Nudge X', 'Nudge Y': 'Nudge Y' } as Record<string, string>,
  unitLabel: 'Unit',
  /** Round 6 (PowerPoint-style ribbon): the words beside the number boxes (the control's accessible name is unchanged), the menus and their tooltips. */
  rowLabels: { Height: 'Height', Width: 'Width', 'Border radius': 'Corner radius', Padding: 'Padding', Margin: 'Margin', nudge: 'Nudge' } as Record<string, string>,
  fontColour: 'Font colour',
  fontColourTip: 'Open the colours for the text.',
  fontSizePresets: 'Font size presets',
  fontSizePresetsTip: 'Open the list of font sizes.',
  shapeFill: 'Shape Fill',
  shapeFillTip: 'Open the fill colours for this shape.',
  shapeOutline: 'Shape Outline',
  shapeOutlineTip: 'Open the outline colour, weight and dashes.',
  pageColours: 'Page colours',
  standardColours: 'Standard colours',
  /** Round 7b: the grid, the recent colours and the picker of every colour menu. */
  colourGrid: 'Colour grid',
  recentColours: 'Recent colours',
  pickColour: 'Pick any colour…',
  gridName: (hex: string) => `Grid ${hex}`,
  recentName: (hex: string) => `Recent ${hex}`,
  pickColourTip: 'Open the browser\'s colour picker; the colour is applied when you confirm it.',
  italic: 'Italic',
  italicTip: 'Make the text italic or upright again.',
  underline: 'Underline',
  underlineTip: 'Make the text underlined or plain again.',
  lineSpacing: 'Line spacing',
  lineSpacingTip: 'Choose the space between lines.',
  gradient: 'Gradient',
  fromColour: 'From colour',
  toColour: 'To colour',
  noGradient: 'No gradient',
  shapeEffects: 'Shape Effects',
  shapeEffectsTip: 'Open the shadow choices for this shape.',
  effectsWord: 'Effects',
  noFill: 'No fill',
  noOutline: 'No outline',
  moreColours: 'More colours…',
  weight: 'Weight',
  dashes: 'Dashes',
  weightItem: (n: number) => `${n} px`,
  hexTip: 'Type a colour as #rgb or #rrggbb, then press Enter.',
  /** The caption under each alignment button. */
  alignCaptions: { 'Align left': 'Left', 'Align centre': 'Centre', 'Align right': 'Right', Justify: 'Justify', 'Anchor start': 'Start', 'Anchor middle': 'Middle', 'Anchor end': 'End' } as Record<string, string>,
  /** Tooltips: short, verb first. */
  alignTips: { 'Align left': 'Align the text to the left.', 'Align centre': 'Align the text to the centre.', 'Align right': 'Align the text to the right.', Justify: 'Justify the text to both edges.', 'Anchor start': 'Align the text so it starts at its anchor point.', 'Anchor middle': 'Align the text around its anchor point.', 'Anchor end': 'Align the text so it ends at its anchor point.' } as Record<string, string>,
  alignTip: (name: string): string => panel.alignTips[name] ?? `Align the text: ${name.toLowerCase()}.`,
  typeTip: (name: string): string => (/^Nudge/.test(name) ? 'Type how many pixels to move by, then press Enter.' : `Type the ${name.toLowerCase()}, then press Enter.`),
  fontTip: (stack: string): string => (stack ? `Choose the font for this text. Now: ${stack}.` : 'Choose the font for this text.'),
  weightTip: 'Choose how heavy the text is.',
  colourTip: 'Type a colour such as #1d3557 or a colour name, then press Enter.',
  pickTip: (label: string): string => `Pick a ${label.toLowerCase()} from the colour picker.`,
  unitTip: (u: string): string => (u === '%' ? 'Show and type the width as a share of the parent.' : 'Show and type the width in pixels.'),
  pick: (label: string) => `Pick ${label.toLowerCase()}`,
  /** Grid and snap (Layout > Grid): both off at every page load; the spacing is in px. */
  grid: 'Grid',
  gridTip: 'Show or hide the grid over the preview',
  snap: 'Snap',
  snapTip: 'Snap moves and resizes to the grid; hold Alt while dragging to skip it',
  gridSpacing: 'Grid spacing',
  gridSpacingTip: 'Choose the distance between grid lines',
  spacings: [4, 8, 16, 32],
  spacingOption: (n: number) => `${n} px`,
  snapNoteSvg: 'Snap is for HTML pages. SVG moves use the drawing’s own units.',
  moveUpTip: 'Move this element earlier in the page order.',
  moveDownTip: 'Move this element later in the page order.',
  aligns: ['left', 'center', 'right', 'justify'],
  svgAligns: ['start', 'middle', 'end'],
}

/** The updated code view (the whole file, changed lines marked, Previous and Next change, the change map). */
export const codeView = {
  previous: 'Previous change',
  next: 'Next change',
  changedLine: 'Changed or added line',
  removed: (n: number) => (n === 1 ? '1 line removed here' : `${n} lines removed here`),
  tick: (k: number, n: number) => `Change ${k} of ${n}`,
}

/** What the page says after an action. */
export const messages = {
  refused: 'Not applied:',
  applied: (what: string) => `Applied: ${what}.`,
  noteLead: 'Left alone:',
  copied: (file: string) => `Copied ${file}.`,
  copyFailed: 'Could not copy automatically. The code is selected under Updated code: press Ctrl+C (Cmd+C on a Mac).',
  downloaded: (names: string) => `Saved ${names}.`,
  /** Said when the dragged west or north edge could not follow the pointer (round 5): the old behaviour was used. */
  edgeFallback: { west: 'The left edge could not follow the pointer for this element, so its right edge moved instead.', north: 'The top edge could not follow the pointer for this element, so its bottom edge moved instead.' },
  opened: (name: string) => `Opened ${name}.`,
  badType: 'Only .html, .htm, .svg and one optional .css file can be opened here.',
  tooMany: 'Choose one HTML or SVG file, and at most one .css file with it.',
  needMarkup: 'Add the HTML or SVG file as well: a stylesheet cannot be edited on its own.',
  tooBig: 'That is over the 1 MB limit for what is opened here, so it was not opened.',
  nothingPasted: 'Paste some HTML or SVG first.',
  cannotOpen: (why: string) => `That could not be opened in the preview: ${why}`,
  script: 'This page has a script. Scripts never run in the preview, so anything they build or change will not appear.',
  missingCss: (href: string) => `This page links to the stylesheet "${href}", which was not supplied, so those styles are missing from the preview. Add it with Upload or Paste.`,
  unusedCss: (name: string) => `The stylesheet "${name}" is not linked from the page, so it has no effect on the preview.`,
  badValue: (label: string) => `Not applied: that is not a value ${label} can take.`,
  /** Insert round 1: placing, and what an insert, a text edit and a Delete say. */
  placing: (what: string) => `Click where the ${what} should go, or press Escape to cancel.`,
  placingCancelled: 'Cancelled: nothing was inserted.',
  inserted: (what: string) => `Applied: inserted a ${what}.`,
  removed: 'Applied: removed the element.',
  textChanged: 'Applied: changed the text.',
  noteSaved: 'Applied: note saved.',
  noteDeleted: 'Applied: note deleted.',
  cannotEditText: 'Not applied:',
  notAColour: 'Not applied: that is not a colour. Type #rgb or #rrggbb.',
  doubleNeedsThree: 'Not applied: a double line needs a weight of 3 px or more.',
  replayFailed: 'The edits could not be replayed, so the editor went back to the original.',
  working: 'Working…',
  undone: 'Undid the last edit.',
  redone: 'Redid the edit.',
  reset: 'Reset: the code is the original again.',
}

/** "How it works": five steps in the Search-pipeline style, then what is measured and what is not. */
export const how = {
  title: 'How it works',
  steps: [
    { name: 'Open', detail: 'Paste, upload or pick a sample. The editor reads your text once to learn where every element and style rule starts and ends, so later it can change only those characters.' },
    { name: 'Preview', detail: 'Your page shows in a sandboxed frame with scripts off, at its real size: Desktop 1280 px, or Tablet 768 px or Phone 390 px in a plain device outline you can turn sideways. Your page is never scaled: in a small window the whole frame is shrunk to fit, and every pointer movement is converted back to your page’s own pixels, so a 40 px drag moves an element 40 px.' },
    { name: 'Edit', detail: 'Click one element. Change it from the ribbon above the preview, or drag its handles or the element. The engine decides where the change goes: the element’s own style, a rule that matches only that element, or a new rule at the end of your stylesheet. A class shared by several elements is never edited in place.' },
    { name: 'Adapt', detail: 'Phone and Tablet start as your Desktop setup scaled in proportion to their screens, and follow it. A change made in Desktop reaches all three: sizes in proportion, colours, fonts, order and text as they are, except what you customised in Phone or Tablet. A change made in Phone or Tablet applies to that view only, and a later Desktop change does not override it. Dragging an element to move it follows the same rule: in Phone or Tablet it moves it there only, in Desktop it covers every width above the Phone breakpoint, so the Tablet range too.' },
    { name: 'Export', detail: 'Copy or download the updated code. Every character you did not change stays as you wrote it, and only the lines for your edits are added. Undo all your edits and the code is byte for byte the original. The updated code view marks every line that changed against your original, and you can step from change to change.' },
  ],
  measuredTitle: 'What is measured, and what is not',
  measured: [
    'Measured by the engine’s own test gate, not by this page: on 10 test pages, 40 of 40 scripted edits gave the right value in a real browser, changed nothing else and made the smallest possible change to the text.',
    'On five real files from other authors (two email templates, a Bootstrap one-page site and two SVGs), 18 of 20 edits passed and the other two were refused with a true reason.',
    'The three views were scored separately, on 45 scripted edits over 17 test pages: 44 gave the right value in a real browser and one was refused with a true reason (a page whose own Phone breakpoint is 768 px has no Tablet range).',
    'That was one scored run. Treat it as less proven than single edits.',
    'This page has its own scripted mouse test: 20 actions on the three samples in Chromium, scored by script (docs/ui-editor-gate-rules.md in the site’s repository).',
    'Not measured: real people using it, Safari or Firefox, touch dragging, JavaScript-driven pages, or any page outside those test pages. The test pages and this page’s test were written by the same person and tool that built the engine and the page.',
  ],
}

/** The limits, in plain words (from the engine's list of known limits). */
export const limits = {
  title: 'Limits',
  /** One sentence each. The page shows them in `groups`: consecutive sentences joined into six short paragraphs, so a reader sees six items. */
  items: [
    'The preview runs with scripts off, so content that JavaScript builds cannot show or be edited.',
    'External fonts, images from other sites and any CSS you do not supply are missing.',
    'Fonts show only if your computer has them.',
    'React, Vue and other bundled or minified code are not supported.',
    'Only max-width and min-width media features are understood; dark mode, print and orientation are left as written.',
    'Desktop, Tablet and Phone upright are editable; turned sideways they are view-only.',
    'A Tablet change on a page whose Phone breakpoint is 768 px is refused: make it in Phone.',
    'Min-width, max-width, min-height, max-height, aspect-ratio, percentages and viewport units are left as the page wrote them, and the editor does not always say so.',
    'A flex item that grows (flex-grow above 0, such as flex: 1) cannot be sized exactly, so resizing it is refused.',
    'Dragging an element to move it applies to the view you drag in; Desktop covers every width above Phone.',
    // Verified with the engine before it was written (docs/ui-editor-baseline-round4.md): an east drag on a left-anchored element lands its right edge on the line, and on the
    // element fixed to the right of its row the right edge does not move at all.
    'With Snap on, a dragged edge lands on a grid line only when that edge can move; an element fixed to the right of its row keeps its right edge.',
    // Insert round 1 (engine limits, docs/known-limits.md of the engine): flow placement only; text editing needs an element without child elements; Delete leaves the page's own rules.
    'Insert goes before, after or inside the element you point at, in HTML only.',
    'Text editing refuses an element with child elements, and line breaks.',
    'Delete keeps the page’s own rules; links to a removed id are not checked.',
    'Notes are comments; two hyphens in a row get a space.',
    'One element at a time: a shared class is never changed for everyone.',
    'An edit the engine cannot make safely is refused, with the reason.',
    'Examples: a transformed parent, an SVG element reused through use or defs, or an !important rule.',
    'Tested in Chromium only.',
  ],
  /** How many consecutive sentences make each paragraph shown. */
  groups: [4, 3, 2, 2, 4, 4],
}

/** The paragraphs a list shows: `items` joined in runs of the given sizes (every item once, in order). */
export function paragraphs(items: string[], groups: number[]): string[] {
  const out: string[] = []
  let at = 0
  for (const n of groups) {
    out.push(items.slice(at, at + n).join(' '))
    at += n
  }
  if (at < items.length) out.push(items.slice(at).join(' '))
  return out
}

/** "Data and credits". */
export const credits = {
  title: 'Data and credits',
  items: [
    'No external data: nothing is fetched or sent anywhere. Your code stays in your browser and is gone when you close the tab.',
    'The three samples (a landing page, an HTML email and an SVG chart) are original, written for this tool.',
    'The editing engine is the author’s own code, kept in a private repository for now and shipped in this site as one built file. It bundles parse5 (reads HTML and SVG, with source positions) and postcss (reads CSS); their licences are in src/ui-editor/vendor/THIRD-PARTY-NOTICES.md in the site’s repository.',
    'Engine caveats: SVG is read by the HTML parser, so SVG that is only valid as XML can be split wrongly; broken markup is read the way the parser reads it; a stylesheet without a final newline gets one before the added rules.',
  ],
}
