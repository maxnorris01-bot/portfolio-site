# The UI Editor ribbon: how it is laid out, and what was taken from PowerPoint

Round 4 gave one ribbon with seven groups; round 5 laid them on a shared column grid and still left a lot of unused space, because every control kept its natural width. Max said it was "a little
better, but a lot of unused space" and asked for it to follow how PowerPoint sets up its controls "exactly like that". Round 6 does (`src/ui-editor/Ribbon.tsx`, `Menu.tsx`, `UiEditorTool.css`; rules
in `docs/ui-editor-gate-rules-round6.md`).

## What it is now

- **One card** with one border: the quick bar, the strip, the ribbon and the status line, with hairline rules between them (round 5, unchanged).
- **One band of seven two-row groups**, in the order Font, Paragraph, Size, Shape Styles, Spacing, Arrange, Grid. Every control is 28 px high, the rows are 5 px apart, a group has 8 px of
  padding and its name (12 px, muted) under it, so the band is 95 px high (96 at most).
- **The fill rule.** In every row the last control ends at the group's inner right edge, neighbours are at most 8 px apart, and every row has a control that stretches (a text box, a dropdown, a number
  box, a menu button, or a row of icon buttons that share the width as a segmented control). Only icon buttons (28 px), row labels, the px/% toggle, the Sides buttons and the font colour button
  (58 px) keep a width. Nothing is centred and no row has dead space at its right, at any width from 1000 up.
- **The columns share the width by weight (`fr`); each is also never narrower than its weight in px.** The weights are what each group needs, measured at its two rows' smallest (the number boxes
  are 70 px, the menu buttons as wide as their words): Font 225, Paragraph 143, Size 182, Shape Styles 273, Spacing 187, Arrange 205, Grid 133 (`RIBBON_COLUMNS` in `ribbonfields.ts`, sum 1348).
  The brief's starting weights (255, 140, 150, 215, 175, 190, 165, sum 1290) could not hold: the Size group would be 150 px wide, and its second row needs 165 (a label, a number box that shows
  `1236.5px`, and the px/% toggle). With those minimums one band needs a ribbon of 1352 px or more.
- **Wide** (the ribbon is 1352 px or more): one band, at the gate's 1440 and 1920 host widths (ribbons of 1375 and 1834 px). **Medium** (1000 to 1351 px, so the gate's 1290 is here: a ribbon of 1231 px):
  two bands on four shared column edges, Spacing under Font, Arrange under Paragraph and Size together, Grid under Shape Styles. **Narrow** (under 1000 px, a window of about 1047 px or less): the groups
  stack, every control, spin arrow and menu item is at least 44 x 44.
- **Menus.** `Menu.tsx` is the one primitive: a button with `aria-haspopup` and `aria-expanded`, a `role="menu"` drawn in `<body>` (the ribbon's container would otherwise contain it), arrow keys,
  Enter, Escape and an outside click that give the focus back to the button, Right and Left for submenus, the current value marked with `aria-checked`, kept inside the window.
- **Number boxes** (`NumBox`): the number is a real text input (typing `52` writes `52px`; a second typed value commits too, which the round 5 box did not do) with two spin arrows that are not tab stops
  (the arrow keys step it, Shift times ten, a held arrow repeats). The font size box is 62 px with the presets arrow where the spin arrows would be, and grow and shrink buttons beside it.
- **What an SVG element does not have is drawn switched off** (Padding and Margin for a shape, the Effects menu), so the ribbon keeps the same controls and no group is left empty.

## PowerPoint's control, ours, and where we differ

| PowerPoint | Ours | Deviation and why |
|---|---|---|
| Home > Font: font name box | `Font family` dropdown (stretches) | No free text: the page offers the page's own family first and twelve others, and writes the whole stack. |
| Font size box with a list, Increase and Decrease Font Size | `Font size` box (62 px) with the presets arrow (12 to 72), `Increase Font size` and `Decrease Font size` buttons | The same. Step 1 px, Shift times ten, hold to repeat. |
| Bold button | `Font weight` dropdown (100 to 900) | CSS has nine weights, not one switch; the dropdown keeps all of them. |
| Italic, Underline | `Italic`, `Underline` toggles (Part B2) | The same; they show pressed from the element's computed style, also when the page's own rule sets it. |
| Font colour (A with a bar, chevron) | `Font colour` (58 px, A with a bar, chevron), opening the colour menu | The same. |
| Paragraph: alignment | `Alignment` as a segmented row (left, centre, right, justify; start, middle, end for SVG text) | Icon-only like PowerPoint's; names and tooltips unchanged. |
| Line spacing | `Line spacing` menu (1.0, 1.15, 1.5, 2.0) (Part B3) | A unitless `line-height`. PowerPoint's other choices (Exactly, Multiple, spacing before and after) are not here. |
| Format > Size: Height and Width spin boxes | `Height` and `Width` number boxes; Width has the `px` and `%` toggle | The toggle and the snap to `100%` are our own: a web page's width is often a share of its parent. |
| Shape Fill gallery (theme colours, standard colours, No Fill, More Fill Colours, Gradient) | `Shape Fill` menu: `Page colours` (the document's own, up to 16), `Standard colours` (8), `No fill`, `More colours…`, `Gradient` (Part B4) | Page colours stand in for the theme colours: a web page has no theme, so the document's own colours are read. The hex box sits inside More colours… (PowerPoint's dialog has a hex box too) and takes `#rgb` or `#rrggbb` only. Gradient is two colours and four directions, written as a `linear-gradient`; PowerPoint's gradient stops, angle and types are not here. |
| Shape Outline gallery (colours, No Outline, Weight, Dashes, Arrows) | `Shape Outline` menu: the same colour groups, `No outline`, `Weight` (1, 2, 3, 4, 6, 8 px), `Dashes` (Solid, Dotted, Dashed, Double) | CSS borders have no dash-dot dashes, and weights are in px, not points; there are no arrows. Choosing a weight on an element with no visible line writes the width and a solid style, so the line shows. A double line needs 3 px. |
| Shape Effects gallery (Shadow, Reflection, Glow, ...) | `Shape Effects` menu: None, Subtle, Medium, Strong (Part B1) | A `box-shadow` only. Reflection, glow and 3-D have no plain CSS equivalent. |
| Shape corner (the yellow handle) | `Corner radius` number box (step 2 px) | Our own: CSS has a radius, PowerPoint has a handle. |
| Arrange: Bring Forward, Send Backward | `Move up`, `Move down` | They reorder the element among its siblings in the page. |
| Arrange: nudge with arrow keys | `Nudge` with `Nudge X` and `Nudge Y` number boxes | Our own: typed pixels. |
| (none) | `Spacing`: `Padding` and `Margin` number boxes with `Sides` | Our own: the CSS box model has no PowerPoint equivalent. |
| View > Gridlines, Snap to Grid, grid spacing | `Grid`, `Snap`, `Grid spacing` (4, 8, 16, 32 px) | The same idea; both are off at every page load and are the page's, not the document's. |

## What was wrong in round 5, and what stayed

Round 5 sized each group from a shared column grid (290, 200, 209, 288, 197, 296, 260, with 14 px padding and 72 x 58 large buttons) and left every control at its natural width, so a row ended well short of
its group's edge. Round 6 keeps the card, the strip with the selection path, the code sections, the single Download and the west and north resize, and replaces the groups. Gate checks written for the
round 5 groups (V01, V02, V04 and parts of V09, U01, U03, U05, T03, U06, R04, R09) are retired by the locked round 6 rules and replaced by W01 to W04.
