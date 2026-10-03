// Distance formatting shared by the panels and the engine's on-globe labels.
export function formatKm(km: number): string {
  return `${km.toLocaleString('en-US', { maximumFractionDigits: km < 1 ? 3 : km < 100 ? 1 : 0 })} km`
}
