// The panel's line on how many stars are showing and how the streamed ones are doing. Pure, so it is tested.

export interface GaiaReadout {
  state: string
  drawn: number
  tilesLoaded: number
  tilesInView: number
  inFlight: number
  budget: number
}

export function starsReadout(
  hipparcos: number,
  gaia: GaiaReadout | undefined,
): string {
  const n = (x: number) => x.toLocaleString('en-US')
  if (!gaia || gaia.state === 'off' || gaia.state === 'loading') return `Stars: ${n(hipparcos)} Hipparcos. Loading the Gaia star index…`
  if (gaia.state === 'unavailable') {
    return `The streamed Gaia stars aren't available right now, so the sky shows the ${n(hipparcos)} Hipparcos stars only.`
  }
  if (gaia.tilesInView === 0 && gaia.drawn === 0) {
    return `Stars: ${n(hipparcos)} Hipparcos. Gaia stars stream in as you zoom (fainter stars appear below about 15°).`
  }
  const loading = gaia.inFlight > 0 ? ` · ${gaia.inFlight} loading` : ''
  return `Stars: ${n(hipparcos)} Hipparcos + ${n(gaia.drawn)} Gaia drawn (${gaia.tilesLoaded} tiles${loading}; budget ${n(gaia.budget)}).`
}

