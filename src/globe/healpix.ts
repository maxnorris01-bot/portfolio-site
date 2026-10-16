// HEALPix (Gorski et al. 2005) in the few pieces the sky needs: the pixel
// of a direction and a pixel's centre (nested scheme, for the star tiles and
// the glow atlas), ring and nested conversions, and bilinear interpolation
// (to turn the glow atlas's 0.46 degree pixels into a smooth map). Pure, and
// checked against astropy-healpix reference values in the tests.
//
// Directions are RA and Dec in degrees (ICRS / J2000).

const DEG = Math.PI / 180

const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7]

export const nsideOf = (order: number) => 2 ** order
export const pixelCount = (order: number) => 12 * 4 ** order

// Spread the bits of a 16-bit integer to the even positions of a 32-bit one.
function spread(v: number): number {
  v &= 0xffff
  v = (v | (v << 8)) & 0x00ff00ff
  v = (v | (v << 4)) & 0x0f0f0f0f
  v = (v | (v << 2)) & 0x33333333
  v = (v | (v << 1)) & 0x55555555
  return v
}

function compact(v: number): number {
  v &= 0x55555555
  v = (v | (v >> 1)) & 0x33333333
  v = (v | (v >> 2)) & 0x0f0f0f0f
  v = (v | (v >> 4)) & 0x00ff00ff
  v = (v | (v >> 8)) & 0x0000ffff
  return v
}

/** The nested pixel number containing a direction. */
export function ang2pixNest(order: number, raDeg: number, decDeg: number): number {
  const nside = nsideOf(order)
  const z = Math.sin(decDeg * DEG)
  const za = Math.abs(z)
  let phi = (((raDeg % 360) + 360) % 360) * DEG
  if (phi >= 2 * Math.PI) phi = 0
  const tt = phi / (Math.PI / 2) // [0, 4)
  let face: number
  let ix: number
  let iy: number
  if (za <= 2 / 3) {
    const temp1 = nside * (0.5 + tt)
    const temp2 = nside * z * 0.75
    const jp = Math.floor(temp1 - temp2) // ascending edge line index
    const jm = Math.floor(temp1 + temp2) // descending edge line index
    const ifp = Math.floor(jp / nside)
    const ifm = Math.floor(jm / nside)
    face = ifp === ifm ? ifp | 4 : ifp < ifm ? ifp : ifm + 8
    ix = jm & (nside - 1)
    iy = nside - (jp & (nside - 1)) - 1
  } else {
    const ntt = Math.min(Math.floor(tt), 3)
    const tp = tt - ntt
    const tmp = nside * Math.sqrt(3 * (1 - za))
    const jp = Math.min(Math.floor(tp * tmp), nside - 1)
    const jm = Math.min(Math.floor((1 - tp) * tmp), nside - 1)
    if (z >= 0) {
      face = ntt
      ix = nside - jm - 1
      iy = nside - jp - 1
    } else {
      face = ntt + 8
      ix = jp
      iy = jm
    }
  }
  return face * nside * nside + spread(ix) + 2 * spread(iy)
}

/** The centre of a nested pixel: RA and Dec in degrees. */
export function pix2angNest(order: number, ipix: number): { ra: number; dec: number } {
  const nside = nsideOf(order)
  const npface = nside * nside
  const face = Math.floor(ipix / npface)
  const rem = ipix - face * npface
  const ix = compact(rem)
  const iy = compact(rem >> 1)
  const jr = JRLL[face] * nside - ix - iy - 1
  let nr: number
  let z: number
  let kshift: number
  if (jr < nside) {
    nr = jr
    z = 1 - (nr * nr) / (3 * nside * nside)
    kshift = 0
  } else if (jr > 3 * nside) {
    nr = 4 * nside - jr
    z = (nr * nr) / (3 * nside * nside) - 1
    kshift = 0
  } else {
    nr = nside
    z = ((2 * nside - jr) * 2) / (3 * nside)
    kshift = (jr - nside) & 1
  }
  let jp = Math.floor((JPLL[face] * nr + ix - iy + 1 + kshift) / 2)
  if (jp > 4 * nside) jp -= 4 * nside
  if (jp < 1) jp += 4 * nside
  const phi = (jp - (kshift + 1) * 0.5) * ((Math.PI / 2) / nr)
  return { ra: phi / DEG, dec: Math.asin(Math.max(-1, Math.min(1, z))) / DEG }
}

// ---- ring scheme, for interpolation ----

/** Ring `ir` (1..4 nside - 1): first pixel (ring numbering), pixels in the ring and whether it's shifted by half a pixel. */
function ringInfo(nside: number, ir: number): { start: number; n: number; shifted: boolean } {
  const npix = 12 * nside * nside
  const ncap = 2 * nside * (nside - 1)
  if (ir < nside) return { start: 2 * ir * (ir - 1), n: 4 * ir, shifted: true }
  if (ir <= 3 * nside) {
    return { start: ncap + (ir - nside) * 4 * nside, n: 4 * nside, shifted: ((ir - nside) & 1) === 0 }
  }
  const i = 4 * nside - ir
  return { start: npix - 2 * i * (i + 1), n: 4 * i, shifted: true }
}

/** Ring number (1..4 nside - 1) of the last ring at or above a colatitude's z = cos(theta), 0 if above the first. */
function ringAbove(nside: number, z: number): number {
  const za = Math.abs(z)
  if (za <= 2 / 3) return Math.floor(nside * (2 - 1.5 * z))
  const irp = Math.floor(nside * Math.sqrt(3 * (1 - za)))
  return z > 0 ? irp : 4 * nside - irp - 1
}

/** Convert a ring-scheme pixel number to the nested scheme. */
export function ring2nest(order: number, ring: number): number {
  const nside = nsideOf(order)
  const npix = pixelCount(order)
  const ncap = 2 * nside * (nside - 1)
  let iring: number
  let iphi: number
  let kshift: number
  let nr: number
  let face: number
  if (ring < ncap) {
    iring = Math.floor((1 + Math.floor(Math.sqrt(1 + 2 * ring))) / 2)
    iphi = ring + 1 - 2 * iring * (iring - 1)
    kshift = 0
    nr = iring
    face = Math.floor((iphi - 1) / nr)
  } else if (ring < npix - ncap) {
    const ip = ring - ncap
    iring = Math.floor(ip / (4 * nside)) + nside
    iphi = (ip % (4 * nside)) + 1
    kshift = (iring + nside) & 1
    nr = nside
    const ire = iring - nside + 1
    const irm = 2 * nside + 2 - ire
    const ifm = Math.floor((iphi - Math.floor(ire / 2) + nside - 1) / nside)
    const ifp = Math.floor((iphi - Math.floor(irm / 2) + nside - 1) / nside)
    face = ifp === ifm ? ifp | 4 : ifp < ifm ? ifp : ifm + 8
  } else {
    const ip = npix - ring
    iring = Math.floor((1 + Math.floor(Math.sqrt(2 * ip - 1))) / 2)
    iphi = 4 * iring + 1 - (ip - 2 * iring * (iring - 1))
    kshift = 0
    nr = iring
    iring = 2 * nside * 2 - iring
    face = 8 + Math.floor((iphi - 1) / nr)
  }
  const irt = iring - JRLL[face] * nside + 1
  let ipt = 2 * iphi - JPLL[face] * nr - kshift - 1
  if (ipt >= 2 * nside) ipt -= 8 * nside
  const ix = (ipt - irt) >> 1
  const iy = (-(ipt + irt)) >> 1
  return face * nside * nside + spread(ix) + 2 * spread(iy)
}

/**
 * Bilinear interpolation weights at a direction: the four surrounding pixel
 * centres (two rings, two pixels in each) as nested pixel numbers and
 * weights that sum to 1. Near a pole the nearest ring is replaced by the
 * four pixels around the pole, as healpix does.
 */
export function interpolateNest(order: number, raDeg: number, decDeg: number, pix: Int32Array | number[], wgt: Float64Array | number[]): void {
  const nside = nsideOf(order)
  const npix = pixelCount(order)
  const z = Math.sin(decDeg * DEG)
  const theta = Math.acos(Math.max(-1, Math.min(1, z)))
  const phi = (((raDeg % 360) + 360) % 360) * DEG
  const ir1 = ringAbove(nside, z)
  const ir2 = ir1 + 1
  const ring = [0, 0, 0, 0]
  const w = [0, 0, 0, 0]
  let theta1 = 0
  let theta2 = 0
  const side = (ir: number, a: number, b: number) => {
    const info = ringInfo(nside, ir)
    const zr = ir < nside ? 1 - (ir * ir) / (3 * nside * nside) : ir <= 3 * nside ? ((2 * nside - ir) * 2) / (3 * nside) : (-1) * (1 - ((4 * nside - ir) ** 2) / (3 * nside * nside))
    const th = Math.acos(zr)
    const dphi = (2 * Math.PI) / info.n
    const tmp = phi / dphi - (info.shifted ? 0.5 : 0)
    let i1 = Math.floor(tmp)
    const frac = tmp - i1
    w[a + 1] = frac
    w[a] = 1 - frac
    let i2 = i1 + 1
    if (i1 < 0) i1 += info.n
    if (i2 >= info.n) i2 -= info.n
    ring[a] = info.start + i1
    ring[b] = info.start + i2
    return th
  }
  if (ir1 > 0) theta1 = side(ir1, 0, 1)
  if (ir2 < 4 * nside) theta2 = side(ir2, 2, 3)
  if (ir1 === 0) {
    const wtheta = theta / theta2
    w[2] *= wtheta
    w[3] *= wtheta
    const fac = (1 - wtheta) * 0.25
    w[0] = fac
    w[1] = fac
    w[2] += fac
    w[3] += fac
    ring[0] = (ring[2] + 2) & 3
    ring[1] = (ring[3] + 2) & 3
  } else if (ir2 === 4 * nside) {
    const wtheta = (theta - theta1) / (Math.PI - theta1)
    w[0] *= 1 - wtheta
    w[1] *= 1 - wtheta
    const fac = wtheta * 0.25
    w[0] += fac
    w[1] += fac
    w[2] = fac
    w[3] = fac
    ring[2] = ((ring[0] + 2) & 3) + npix - 4
    ring[3] = ((ring[1] + 2) & 3) + npix - 4
  } else {
    const wtheta = (theta - theta1) / (theta2 - theta1)
    w[0] *= 1 - wtheta
    w[1] *= 1 - wtheta
    w[2] *= wtheta
    w[3] *= wtheta
  }
  for (let k = 0; k < 4; k++) {
    pix[k] = ring2nest(order, ring[k])
    wgt[k] = w[k]
  }
}

// ---- tile coverage ----

/** Angle between two directions (degrees), from their unit vectors. */
export function angleBetween(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const x = a[1] * b[2] - a[2] * b[1]
  const y = a[2] * b[0] - a[0] * b[2]
  const zz = a[0] * b[1] - a[1] * b[0]
  return Math.atan2(Math.hypot(x, y, zz), c) / DEG
}

const unit = (raDeg: number, decDeg: number): [number, number, number] => {
  const r = raDeg * DEG
  const d = decDeg * DEG
  return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]
}

export interface TileGeometry {
  /** Unit vector of the pixel centre, J2000. */
  centre: [number, number, number]
  /** An upper bound, degrees, on the angle from the centre to any point of the pixel. */
  radiusDeg: number
}

/**
 * The centre and a conservative radius of every pixel of an order: the
 * largest angle from the centre to the centres of its sub-pixels (`sub`
 * orders finer) plus those sub-pixels' own radius.
 */
export function tileGeometry(order: number, sub = 3): TileGeometry[] {
  const n = pixelCount(order)
  const fine = order + sub
  const per = 4 ** sub
  // A pixel of order k is within about 1.5 sizes of its centre; its sub-pixels' bound adds to the measured spread.
  const subRadius = (Math.sqrt((4 * Math.PI) / pixelCount(fine)) * 1.5) / DEG
  const out: TileGeometry[] = []
  for (let p = 0; p < n; p++) {
    const c = pix2angNest(order, p)
    const centre = unit(c.ra, c.dec)
    let widest = 0
    for (let k = 0; k < per; k++) {
      const s = pix2angNest(fine, p * per + k)
      widest = Math.max(widest, angleBetween(centre, unit(s.ra, s.dec)))
    }
    out.push({ centre, radiusDeg: widest + subRadius })
  }
  return out
}
