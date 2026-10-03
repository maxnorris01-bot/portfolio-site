// Real collision history, for context on what the risk tiers mean (Phase 1c).
// Facts as researched in satellite-conjunction-screening's working notes
// (2026-10-03, sources linked below). Fragment counts "today" come from the
// loaded catalog, not hard-coded, since debris keeps re-entering.

const fmt = (n: number) => n.toLocaleString('en-US')

interface Props {
  /** Live counts by name group (iridium33deb, cosmos2251deb, fengyun1cdeb). */
  counts: Record<string, number>
  /** Conjunctions flagged in the latest run, if known. */
  conjunctionsFlagged?: number
  /** Show only these name groups on the globe. */
  onShow: (groupKeys: string[]) => void
}

export default function CollisionHistory({ counts, conjunctionsFlagged, onShow }: Props) {
  const iridium = counts.iridium33deb ?? 0
  const cosmos = counts.cosmos2251deb ?? 0
  const fengyun = counts.fengyun1cdeb ?? 0

  return (
    <section className="globe-history" aria-labelledby="globe-history-title">
      <h3 id="globe-history-title">For context: the real record</h3>
      <p className="globe-history-lede">
        Exactly one accidental collision between two intact satellites has ever been confirmed.
        This tool flags{' '}
        {conjunctionsFlagged ? fmt(conjunctionsFlagged) : 'tens of thousands of'} close approaches
        in a single day&apos;s run: its risk tiers are a stated screening heuristic, not a
        probability that a collision will happen.
      </p>
      <div className="globe-history-events">
        <article className="globe-history-event">
          <p className="globe-history-date">10 February 2009</p>
          <h4>Iridium 33 and Cosmos 2251</h4>
          <p className="globe-history-tag">Accidental collision</p>
          <p>
            The communications satellite Iridium 33 and the Russian satellite Cosmos 2251
            collided at about 780 km altitude, at nearly right angles, over northern Russia: the
            first confirmed accidental collision between two intact satellites. By 2012, 598
            Iridium 33 and 1,603 Cosmos 2251 fragments had been catalogued. {fmt(iridium)} and{' '}
            {fmt(cosmos)} are still in the catalog shown above; the rest have re-entered the
            atmosphere.
          </p>
          <button
            type="button"
            className="globe-button-light"
            onClick={() => onShow(['iridium33deb', 'cosmos2251deb'])}
          >
            Show this debris on the globe
          </button>
        </article>
        <article className="globe-history-event">
          <p className="globe-history-date">11 January 2007</p>
          <h4>Fengyun-1C</h4>
          <p className="globe-history-tag is-deliberate">Deliberate missile test, not a collision</p>
          <p>
            China deliberately destroyed its own Fengyun-1C weather satellite with a missile in
            an anti-satellite (ASAT) test, at about 860 km altitude. It created more
            than 3,000 trackable fragments; {fmt(fengyun)} are still in the catalog shown above.
          </p>
          <button
            type="button"
            className="globe-button-light"
            onClick={() => onShow(['fengyun1cdeb'])}
          >
            Show this debris on the globe
          </button>
        </article>
      </div>
      <p className="globe-history-sources">
        Sources:{' '}
        <a href="https://www.celestrak.org/events/collision/" target="_blank" rel="noreferrer">
          CelesTrak, Iridium 33/Cosmos 2251 collision
        </a>
        ;{' '}
        <a
          href="https://en.wikipedia.org/wiki/2007_Chinese_anti-satellite_missile_test"
          target="_blank"
          rel="noreferrer"
        >
          Wikipedia, 2007 Chinese anti-satellite missile test
        </a>
        .
      </p>
    </section>
  )
}
