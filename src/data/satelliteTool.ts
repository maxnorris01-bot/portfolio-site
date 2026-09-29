// Static snapshot of the screening tool's latest report. Shaped so it can be
// replaced with values parsed from the pipeline's report JSON later.

export type RiskLevel = 'high' | 'moderate' | 'low'

export interface SatelliteToolReport {
  repoUrl: string
  techStack: string[]
  objectsScreened: number
  conjunctionsFlagged: number
  closestActiveApproachKm: number
  kdTreeSpeedup: number
  riskBreakdown: Record<RiskLevel, number>
  scalingTestObjects: number
}

export const satelliteTool: SatelliteToolReport = {
  repoUrl: 'https://github.com/maxnorris01-bot/satellite-conjunction-screening',
  techStack: ['Python', 'SGP4', 'scipy cKDTree', 'CelesTrak'],
  objectsScreened: 1995,
  conjunctionsFlagged: 509,
  closestActiveApproachKm: 1.29,
  kdTreeSpeedup: 9,
  riskBreakdown: {
    high: 0,
    moderate: 31,
    low: 478,
  },
  scalingTestObjects: 18526,
}
