// Reconciling Gaia with the Hipparcos stars the sky already draws: Gaia's G
// magnitude to the Johnson V the star shader and the limiting-magnitude rule
// work in, and Gaia's BP-RP colour to the B-V the colour ramp (starColor)
// takes. Pure, so it is tested.
//
// Brightness: G becomes a V-equivalent, so Hipparcos stars are untouched and
// both layers share one limiting magnitude with no jump at the handover.
//   G - V = -0.02704 + 0.01424 c - 0.2156 c^2 + 0.01426 c^3,  c = BP-RP
// is the Gaia EDR3 documentation's relation (Riello et al. 2021, A&A 649,
// A3; "Gaia Early Data Release 3: Documentation", section 5.5.1, Table 5.7,
// sigma 0.030 mag), fitted over -0.5 < c < 2.75. Checked here on 117,026
// stars that are in both catalogues (the tiles drop these Hipparcos
// duplicates, so the check used the raw extraction, see the session notes):
// V(from G) minus the Hipparcos V has a median of +0.01 mag or less and a
// 16-84% spread of 0.05 mag or less for c below 2.4. Beyond 2.4 the cubic
// overshoots (it falls to -4.3 at c = 6; the data stay near -2.5), so the
// relation is replaced by a line through the measured medians, accurate to
// about 0.2 mag (the red M dwarfs and giants differ, as the documentation
// warns).
//
// Colour: B-V from BP-RP is the medians of the same 117,026 stars in 19 bins
// (scatter about 0.035 in B-V), made non-decreasing: Hipparcos B-V turns over
// near BP-RP 2.2 (it saturates for M giants), which would make the reddest
// stars bluer, so the table keeps climbing slowly and ends at 1.9, near where
// starColor stops (2.0).

export const NO_COLOUR_BPRP = 0.9 // a typical star's colour, for sources without BP-RP

const cubic = (c: number) => -0.02704 + 0.01424 * c - 0.2156 * c * c + 0.01426 * c * c * c

const RED_TAIL: readonly (readonly [number, number])[] = [
  [2.4, cubic(2.4)],
  [2.56, -1.09],
  [2.96, -1.32],
  [3.4, -1.59],
  [3.99, -1.96],
  [5.0, -2.4],
]

/** G - V for a star of this BP-RP colour. */
export function gMinusV(bprp: number): number {
  if (bprp <= 2.4) return cubic(Math.max(-0.5, bprp))
  if (bprp >= 5) return -2.4
  for (let i = 1; i < RED_TAIL.length; i++) {
    if (bprp <= RED_TAIL[i][0]) {
      const [x0, y0] = RED_TAIL[i - 1]
      const [x1, y1] = RED_TAIL[i]
      return y0 + ((y1 - y0) * (bprp - x0)) / (x1 - x0)
    }
  }
  return -2.4
}

/** The Johnson V a star of Gaia magnitude `g` and colour `bprp` would have. */
export const vFromG = (g: number, bprp: number) => g - gMinusV(bprp)

// BP-RP and B-V medians of the matched stars.
const BV_TABLE: readonly (readonly [number, number])[] = [
  [-0.349, -0.225],
  [-0.196, -0.138],
  [-0.055, -0.05],
  [0.075, 0.037],
  [0.224, 0.162],
  [0.408, 0.3],
  [0.615, 0.462],
  [0.779, 0.612],
  [1.025, 0.837],
  [1.197, 1.025],
  [1.383, 1.212],
  [1.626, 1.425],
  [1.924, 1.588],
  [2.23, 1.65],
  [3.0, 1.72],
  [4.0, 1.8],
  [5.5, 1.9],
]

/** The B-V a star of this BP-RP would have, for the colour ramp. */
export function bvFromBpRp(bprp: number): number {
  const t = BV_TABLE
  if (bprp <= t[0][0]) return t[0][1] + (bprp - t[0][0]) * 0.6 // blue end: slope of the first segment
  for (let i = 1; i < t.length; i++) {
    if (bprp <= t[i][0]) {
      const [x0, y0] = t[i - 1]
      const [x1, y1] = t[i]
      return y0 + ((y1 - y0) * (bprp - x0)) / (x1 - x0)
    }
  }
  return t[t.length - 1][1]
}
