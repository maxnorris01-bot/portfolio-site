# The UI Editor ribbon: how it is laid out, and what was taken from the mockup

Max found the round 4 ribbon "confusing and messy" and drew a better one (`~/Desktop/Projects/ribbon-mockup/ribbon.html` and `ribbon.css`, read-only, not part of this repository). Round 5 follows its
structure and the Office ribbon rules (fixed-height bands, the group's name under it, consistent control heights, large buttons only for the most used commands, visible labels, thin rules
between groups). It does NOT copy the mockup's pixel sizes where they conflict with the locked specs (the mockup's 30 px controls, 96 x 70 large buttons and 205 px wide fields).

What was wrong in round 4: the groups stretched to fill the width but their contents were centred inside them, so empty gaps opened; the two bands had no shared column edges, so their
separators did not line up (at 1280 px band 2's Spacing ended at 393 while band 1's Font ended at 374); the quick bar, strip, ribbon and status line were four separate bordered boxes.

What it is now (`src/ui-editor/UiEditorTool.css`, rules in `docs/ui-editor-gate-rules-round5.md`):

- **One card** with one border; the quick bar, the strip, the ribbon and the status line are its four parts with hairline rules between them.
- **A column grid.** Column weights are each group's measured natural content width plus 28 px: Font 290, Paragraph 200, Size 209, Shape 288, Spacing 197, Arrange 296, Grid 260 (sum 1740).
  One band of seven columns from 1760 px of ribbon; two bands on four shared columns from 1000 to 1759 px (Spacing under Font, Arrange under Paragraph and Size together, Grid under Shape);
  stacked, 44 px controls below 1000 px.
- **Left-aligned, top-aligned groups** (14 px padding), each control's 12 px label directly above it on its left edge, the group's name (11 px) on the bottom line of the band.
- **Sizes**: small controls 26 px, large buttons 72 x 58, number fields 72 px, control text 13 px.

The mockup's one idea that is not in the page: nothing. Its quick bar had no Copy code, a file picker or code sections; those changes are round 5's items 2 and 3.
