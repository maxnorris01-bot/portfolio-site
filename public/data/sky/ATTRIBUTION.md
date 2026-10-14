# milkyway-2k.jpg: source, licence and processing

**What it is:** the Milky Way band behind the satellite view's stars: a 2048 x 1024 JPEG
(450 kB) of the whole sky in celestial (J2000) coordinates, plate carree, centred on
0 h right ascension with RA increasing to the left.

**Source:** NASA Scientific Visualization Studio, "Deep Star Maps 2020", visualization
4851 (https://svs.gsfc.nasa.gov/4851): `milkyway_2020_4k.exr` (celestial, bright stars
removed; 4096 x 2048, 34.7 MB), retrieved 2026-10-12. It's built from Gaia DR2, Hipparcos-2
and Tycho-2 star positions, brightnesses and colours.

**Licence:** NASA SVS content is in the public domain unless otherwise noted
(https://svs.gsfc.nasa.gov/help/), free to use for any purpose. This item is not marked
otherwise. Credit is requested: "NASA/Goddard Space Flight Center Scientific
Visualization Studio. Gaia DR2: ESA/Gaia/DPAC." The site shows it in the footnote while
the band is on screen.

**Processing:** EXR to 8-bit PNG with macOS `sips`, then resized to 2048 x 1024 and
saved as JPEG at quality 0.95 with a 0.8 px blur (the band is smooth, and a dark map blocks visibly when magnified) in a headless browser canvas (no other change). The shader
(`MilkyWay` in `src/globe/space.ts`) samples it by J2000 direction and adds a gain of 1.7.
