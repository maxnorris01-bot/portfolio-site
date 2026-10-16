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

## constellations.json and constellation-bounds.json: constellations

Built by `scripts/build-constellations.mjs`. Both files load only when the Constellations
toggle (or a star's constellation button) is first used.

**Figures (`constellations.json`, 10 kB, 4.4 kB gzipped).** The stick figures are
`data/constellations.lines.json` from **d3-celestial** by Olaf Frohn,
https://github.com/ofrohn/d3-celestial, commit `7e720a3de062059d4c5400a379146a601d9010e0`
(2022-07-05), retrieved 2026-10-14. Its licence is the 3-clause BSD licence, "Copyright (c)
2015, Olaf Frohn", which permits use and redistribution with the notice retained (a copy is
in `LICENSE-d3-celestial.txt` beside this file) and without using the author's name to
endorse the site. The library's data readme lists its constellation lines as "IAU
Constellation page ... name positions and some line modifications by me"; it does not say
which earlier figure set the lines started from, and the figures themselves are
conventional, not defined by the IAU. The file stores each figure as lists of Hipparcos
numbers: the converter matched each line vertex to the nearest star of `hipparcos.bin`
(all 893 vertices matched; median 0.000 degrees, largest 0.025). The credit shown on
screen while figures are drawn: "Constellation figures: d3-celestial (O. Frohn, BSD-3-Clause)".

Alternatives that were evaluated and not used: the Stellarium "western" sky culture
(HIP-numbered lines; its description says "Text and data: CC BY-SA" with no version, in a
repository that carries an AGPL-3.0 licence file, so the data file would have to be
share-alike and the terms are not clear); GPL data was not used.

**Boundaries (`constellation-bounds.json`, 43 kB, 18 kB gzipped).** Not from a third
party's file: rebuilt from the Delporte table that `astronomy-engine`'s `Constellation()`
searches (MIT licence, the same table the star card uses), as polylines on the sky in
J2000, so the drawn boundary always agrees with the card. The IAU boundaries (Delporte,
1930) are a scientific standard. Areas in `constellations.json` are computed exactly from
the same table and match the IAU's published areas (checked for ten constellations).

## Streamed Gaia stars and the Milky Way glow (not in this folder)

The satellite view also streams Gaia DR3 stars brighter than G = 13 (7,251,917 stars, the
ones the Hipparcos file doesn't already draw) and draws a Milky Way glow built from Gaia. The
data is not in this repository: it is built by `scripts/star_data/` in
`satellite-conjunction-screening` and served from the public bucket under `stars/v1/`
(`manifest.json`, `tiles/`, `details/`, `glow-o7.jpg`, `glow.json`; format in that repo's
`docs/star-data-format.md`). The app reads the base URL from `src/globe/stardataurl.ts`
(`VITE_STAR_DATA_URL` in a build, `?stars=` on the dev server). If it can't be loaded the sky
shows the Hipparcos stars only, and says so in the panel.

- **Credit shown on screen** while streamed stars or the glow are visible: "Credit: ESA,
  Gaia DPAC", Gaia DR3 (Gaia Collaboration, 2022), licence CC BY-NC 3.0 IGO
  (https://creativecommons.org/licenses/by-nc/3.0/igo/), with the note that the data were
  adapted (selected, moved to epoch 2026.0, packed). The full text is in the manifest's
  `attribution`. This site is strictly non-commercial; commercial use would need ESA's
  authorisation (data.licences@esa.int), as for Hipparcos.
- **G and V.** Gaia magnitudes are converted to the Johnson V the sky is drawn in with the Gaia
  EDR3 documentation's relation G - V = -0.02704 + 0.01424 c - 0.2156 c^2 + 0.01426 c^3, c =
  BP-RP (Riello et al. 2021, A&A 649, A3; documentation section 5.5.1, Table 5.7), and, past
  its range (c above 2.4), a line through medians measured on 117,026 stars that are in both
  catalogues. The B-V used for the colour ramp is the medians of the same stars in 19 BP-RP
  bins (`src/globe/gaiacolour.ts`).
- **SIMBAD.** A selected Gaia star's name, type and spectral type come from SIMBAD (CDS) with one
  request per selection; the footnote carries CDS's acknowledgement while a result is shown:
  "This research has made use of the SIMBAD database, CDS, Strasbourg Astronomical
  Observatory, France" (Wenger et al. 2000).
- **The NASA SVS Milky Way picture** (`milkyway-2k.jpg`, public domain, "Deep Star Maps 2020")
  that this glow replaces has been removed from the site, with its footnote credit.
