// Static facts about the screening project. Live run numbers (counts, risk
// breakdown, near misses) come from GET /api/satellite/summary instead.

export interface SatelliteToolInfo {
  repoUrl: string
  techStack: string[]
  kdTreeSpeedup: number
}

export const satelliteTool: SatelliteToolInfo = {
  repoUrl: 'https://github.com/maxnorris01-bot/satellite-conjunction-screening',
  techStack: ['Python', 'SGP4', 'scipy cKDTree', 'CelesTrak'],
  kdTreeSpeedup: 9,
}
