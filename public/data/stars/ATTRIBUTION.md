# hipparcos.bin: source, licence and decision

**What it is:** the satellite view's star field, 118,217 stars (V -1.44 to 14.08) with
positions, V magnitudes and B-V colours, built by `scripts/build-hipparcos.mjs`
(format documented there). Proper motions applied to J2000 axes at epoch 2026.0.

**Source:** the Hipparcos Catalogue, main catalogue `hip_main.dat`, from the official
CDS/VizieR copy (catalogue I/239, one of the distribution points listed by ESA at
https://www.cosmos.esa.int/web/hipparcos/catalogues):
https://cdsarc.cds.unistra.fr/ftp/I/239/hip_main.dat (53,316,318 bytes, 118,218
records), retrieved 2026-10-12 01:38 UTC.

**Version:** The Hipparcos and Tycho Catalogues, ESA 1997 (ESA SP-1200), the original
1997 release.

**Licence:** CC BY-NC 3.0 IGO (https://creativecommons.org/licenses/by-nc/3.0/igo/), as
stated by ESA. The terms require the credit "Credit: ESA". Citation: ESA, 1997, The
Hipparcos and Tycho Catalogues, ESA SP-1200.

**Decision:** the site owner chose this catalogue on 2026-10-12, on the basis that this
portfolio is strictly non-commercial (a personal portfolio, no revenue, no ads, no paid
features). The site shows the credit and a non-commercial note in the footnote while
the stars are on screen.

**If the site ever becomes commercial, this file must be replaced.** A public-domain
fallback is the Yale Bright Star Catalogue (5th edition, about 9,100 naked-eye stars);
the app reads any file in this format through the StarCatalog interface in
`src/globe/stars.ts`, so swapping it needs no code changes.
