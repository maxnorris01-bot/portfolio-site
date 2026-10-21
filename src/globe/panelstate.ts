// What the overlay panel shows: exactly one state at a time, decided from what
// is selected. Pure, so it is tested; the component only renders the answer.
//
//  - browse: nothing selected. The filters (colour tabs, legend, name filters,
//    stations, Day/night). In the Sky view this is also where "Your sky" (the
//    location controls, the Sky view's own settings) lives: there is nothing
//    to choose a location with otherwise.
//  - object: a satellite, station, conjunction pair or Sky-view body is
//    selected. Only that selection's information and its actions.
//  - pov: the Satellite (point-of-view) mode with nothing in the sky selected.
//    Only that mode's information and controls.
//  - star: something in the satellite view's sky is selected (a star, a Gaia
//    star, a constellation, the Sun, Moon or a planet). Only its card.

export type PanelState = 'browse' | 'object' | 'pov' | 'star'
export type ObjectPanel = 'inspected' | 'focus' | 'station' | 'body'

export interface PanelInputs {
  viewMode: 'globe' | 'sky' | 'pov'
  /** A catalogue object is selected (clicked). */
  inspected: boolean
  /** A near-miss pair is being replayed. */
  focus: boolean
  /** A station chip is active. */
  station: boolean
  /** The Sun, Moon or a planet is selected in the Sky view. */
  skyBody: boolean
  /** In the satellite view: a star, Gaia star, constellation, Sun, Moon or planet is selected. */
  spaceSelection: boolean
}

export interface PanelChoice {
  state: PanelState
  /** In the object state, which one card shows (a selection wins over a station or pair, so there is never more than one). */
  object: ObjectPanel | null
}

export function panelState(i: PanelInputs): PanelChoice {
  if (i.viewMode === 'pov') return { state: i.spaceSelection ? 'star' : 'pov', object: null }
  const object: ObjectPanel | null = i.inspected ? 'inspected' : i.skyBody ? 'body' : i.focus ? 'focus' : i.station ? 'station' : null
  return object ? { state: 'object', object } : { state: 'browse', object: null }
}
