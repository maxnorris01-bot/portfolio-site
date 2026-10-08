// Shared globe types. No runtime imports, so the page can use these without
// pulling three.js or satellite.js into its chunk.

// 'current' is objects/current.json; otherwise a retained YYYY-MM-DD snapshot.
export type DatasetKey = 'current' | (string & {})

export interface CatalogObject {
  norad_id: number
  name: string
  /**
   * COSPAR designator, "YYYY-NNNA" (launch year, launch number, piece). Added
   * to objects/current.json on 2026-10-07; older dated snapshots lack it.
   */
  international_designator?: string | null
  tle_line1: string
  tle_line2: string
  element_epoch_utc: string
  satcat_owner: { code: string; name: string } | null
  object_type: string | null
  active_payload: boolean
}

export interface ObjectsFile {
  schema_version: number
  run_id: string
  generated_at_utc: string
  object_count: number
  objects: CatalogObject[]
}

// A near-miss to replay on the globe: both objects at the conjunction's TCA,
// using the dataset the near-miss came from.
export interface FocusRequest {
  datasetKey: DatasetKey
  aId: number
  bId: number
  aName: string
  bName: string
  tcaUtc: string
  missKm: number
}
