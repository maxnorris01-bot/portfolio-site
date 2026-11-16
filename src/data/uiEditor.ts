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
      text: 'UI Editor lets you paste or upload your own HTML or SVG, click an element and change its text, size, colours or position from the ribbon above the preview or by dragging.',
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

/** Widths of the three views in portrait, in CSS px. Desktop is the engine's desktop size; Tablet is view-only. */
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
  review: (n: number) => `Review unlinked (${n})`,
  reviewList: 'Unlinked edits',
  file: 'File',
  copy: 'Copy code',
  download: 'Download',
  code: 'Updated code',
  result: 'Edit result',
  preview: 'Preview',
  previewHint: 'Click an element to select it. Drag it to move it, or drag a handle to resize it. With an element selected, the arrow keys nudge it by 1 px (10 px with Shift). Handles are for the pointer; the ribbon controls and the arrow keys do the same from the keyboard.',
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
  linkTo: (other: string) => `Link to ${other}`,
  linkHint: 'On: a size change also scales the other size by the same ratio. Off: the change applies to this size only and is listed under Review unlinked.',
  svgLink: 'An SVG has one size, so every edit applies everywhere.',
  tablet: 'Tablet is a view-only width, so its settings and handles are switched off. Switch to Desktop or Phone to edit.',
  viewOnly: 'This size is view-only, so its settings and handles are switched off: turn the phone upright, or switch to Desktop, to edit.',
  dot: (env: string) => `Unlinked: applies to ${env} only`,
  groups: { text: 'Text', box: 'Box', colours: 'Colours', position: 'Position' },
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
  expand: (label: string) => `Expand ${label}`,
  collapse: (label: string) => `Collapse ${label}`,
  stepTip: (label: string, step: number, unit: string) => `${label}: click for ${step} ${unit}, Shift for ${step * 10}, hold to repeat`,
  widthUnit: 'Width unit',
  mixed: 'mixed',
  sides: ['top', 'right', 'bottom', 'left'],
  /** The short word drawn beside a control; the accessible name is the full label. */
  caps: { 'Font size': 'Size', 'Text colour': 'Text', Width: 'W', Height: 'H', Padding: 'Pad', Margin: 'Mar', Background: 'Fill', 'Border colour': 'Line', 'Border width': 'Thick', 'Border radius': 'Round', 'Nudge X': 'X', 'Nudge Y': 'Y' } as Record<string, string>,
  pick: (label: string) => `Pick ${label.toLowerCase()}`,
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
  downloaded: (file: string) => `Saved ${file}.`,
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
    { name: 'Adapt', detail: 'With Link on, a size change on Desktop also scales the page’s own Phone values by the same ratio, and the other way round; colours, fonts and order apply everywhere. With Link off, a change applies to the size you are in and is listed under Review unlinked. Dragging an element to move it is always unlinked in this version; smarter phone adaptation of moves is planned for a later version.' },
    { name: 'Export', detail: 'Copy or download the updated code. Every character you did not change stays as you wrote it, and only the lines for your edits are added. Undo all your edits and the code is byte for byte the original. There is no change list: the code is the result.' },
  ],
  measuredTitle: 'What is measured, and what is not',
  measured: [
    'Measured by the engine’s own test gate, not by this page: on 10 test pages, 40 of 40 scripted edits gave the right value in a real browser, changed nothing else and made the smallest possible change to the text. On five real files from other authors (two email templates, a Bootstrap one-page site and two SVGs), 18 of 20 edits passed and the other two were refused with a true reason.',
    'Desktop and Phone linking was scored separately, on 20 scripted edits over nine test pages. Its first scored run missed on two of the 20 and its second on one; it was then re-scored under two later rule changes. Treat it as less proven than single edits.',
    'This page has its own scripted mouse test: 20 actions on the three samples in Chromium, scored by script (docs/ui-editor-gate-rules.md in the site’s repository).',
    'Not measured: real people using it, Safari or Firefox, touch dragging, JavaScript-driven pages, or any page outside those test pages. The test pages and this page’s test were written by the same person and tool that built the engine and the page.',
  ],
}

/** The limits, in plain words (from the engine's list of known limits). */
export const limits = {
  title: 'Limits',
  items: [
    'The preview runs with scripts off, so content that JavaScript builds or changes will not show, and cannot be edited.',
    'External fonts, images from other sites and any CSS you do not supply are missing: text uses fallback fonts and unsupplied styles are not applied.',
    'React, Vue and other bundled or minified app code are not supported in this version: it edits static HTML and SVG source.',
    'Only max-width and min-width media features are understood. Other conditions (dark mode, print, orientation) are left as you wrote them.',
    'Desktop and Phone upright are the editable sizes. Tablet is view-only, and so is a phone turned sideways. In between, the page’s own rules decide.',
    'Min-width, max-width, min-height, max-height, aspect-ratio, percentages and viewport units (vw, vh) are left as the page wrote them, with a note when a Phone or Desktop value could not be scaled.',
    'A flex item that grows (flex-grow above 0, for example flex: 1) cannot be sized exactly, so a resize or width change on it is refused.',
    'Dragging an element to move it applies to one size only (the one you are in), and it is listed under Review unlinked.',
    'One element at a time: a shared class is never changed for everyone, and an element the browser invents (such as an implied table body) cannot be edited.',
    'An edit the engine cannot make safely is refused with the reason, and nothing changes. Examples: an element under a transformed parent, an SVG element reused through use or defs, or a style that fights with an !important rule.',
    'Tested in Chromium only. The numbers above come from the engine’s own test gate and a handful of real files, not from wide use.',
  ],
}

/** "Data and credits". */
export const credits = {
  title: 'Data and credits',
  items: [
    'No external data: nothing is fetched or sent anywhere. Your code stays in your browser and is gone when you close the tab.',
    'The three samples (a landing page, an HTML email and an SVG chart) are original, written for this tool.',
    'The editing engine is the author’s own code, kept in a private repository for now and shipped in this site as one built file. It bundles parse5 (reads HTML and SVG, with source positions) and postcss (reads CSS), with their small helpers; their licences are in src/ui-editor/vendor/THIRD-PARTY-NOTICES.md in the site’s repository.',
    'Engine caveats: SVG is read by the HTML parser, so SVG that is only valid as XML can be split wrongly; broken markup is read the way the parser reads it; a stylesheet without a final newline gets one before the added rules.',
  ],
}
