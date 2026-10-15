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

## hipparcos-details.bin: the same catalogue, more fields

Built by the same script from the same `hip_main.dat` (CDS/VizieR I/239, retrieved
2026-10-12): the Hipparcos number, trigonometric parallax and its standard error, spectral
type and the variability flag and type, for the same 118,217 stars in the same order
(1,096,433 bytes, 714 kB gzipped). It's fetched only when a star is selected or searched
for, and read through `src/globe/stardetails.ts`. The licence and credit are the star
file's: CC BY-NC 3.0 IGO, "Credit: ESA", a non-commercial site.

Values shown on the star card from it are the catalogue's own (HIP number, parallax,
spectral type, B-V, V magnitude); distance, temperature and luminosity are estimates the
card labels as such (methods in `stardetails.ts`).

## iau-names.json: IAU star names

410 proper names of stars with a Hipparcos number (12 kB), built by
`scripts/build-star-names.mjs` from the IAU Working Group on Star Names' "IAU Catalog of
Star Names" (IAU-CSN), file `IAU-CSN.txt` as published by the WGSN secretary at
https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt (71,800 bytes, last updated
2022-04-04 per its header, retrieved 2026-10-14 04:49 UTC). The WGSN's own page
(https://exopla.net/star-names/modern-iau-star-names/) states the star names are
scientific standards, free to use and not subject to copyright, and the file asks users to
cite the IAU's official version at https://www.iau.org/public/themes/naming_stars/ (IAU
products are released under Creative Commons Attribution). 40 of the file's names (exoplanet
host stars without a Hipparcos number) are left out. The IAU has named further stars since
that file's date; those aren't included until a newer machine-readable file is published.
The footnote credits "IAU Catalog of Star Names (WGSN)" while names are on screen.
