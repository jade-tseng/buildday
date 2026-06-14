// AboutSection — the scroll-down "page". The hero above stays an instrument;
// this is its dossier. Copy in the planetary-computation / rewilding register
// (UI.md §1, §11): technosphere chrome (mono, Space Grotesk, blue) fused with
// the biosphere voice (Newsreader serif, green/amber semantics).
import "../styles/about.css";

interface Block {
  num: string;
  eyebrow: string;
  heading: React.ReactNode;
  body: React.ReactNode;
}

const BLOCKS: Block[] = [
  {
    num: "01",
    eyebrow: "The Problem",
    heading: (
      <>
        We can model the climate to the decade and the genome to the base
        pair. We have <em className="t-anomaly">no planetary-scale intelligence</em>{" "}
        on living ecosystems.
      </>
    ),
    body: (
      <>
        Where does a habitat repeat across the planet? Where could a species
        persist but has never been logged? Which protected coastline has a
        hidden twin an ocean away? These questions are answerable in principle
        and unanswered in practice. The Earth's life-support systems are the
        one planetary layer we still read locally, one survey at a time.
      </>
    ),
  },
  {
    num: "02",
    eyebrow: "Who It's For",
    heading: (
      <>
        The people who most need a planet-wide answer have the least tooling to
        ask for one.
      </>
    ),
    body: (
      <>
        An NGO scoping a restoration site, a UN body drawing protection
        boundaries, a researcher comparing reefs across hemispheres — each works
        from local or regional datasets, stitched together by hand. To ask a
        question of the <em className="t-signal">whole planet</em> today is to
        spend months reconciling surveys that were never built to be compared.
        The data exists. The instrument to query it across the entire surface of
        the Earth does not.
      </>
    ),
  },
  {
    num: "03",
    eyebrow: "How It Reads The Planet",
    heading: <>The engine never looks for the species. It looks for the place.</>,
    body: (
      <>
        Geospatial foundation models compress every ten metres of the Earth's
        surface into a <em className="t-signal">64-dimensional embedding</em> — a
        single unit-length vector encoding water, season, terrain, and the
        texture of a living system, learned across a year of satellite passes.
        Naming a habitat resolves to one such vector; the engine then runs a{" "}
        <em className="t-signal">nearest-neighbour search</em> across the planet
        by cosine similarity over that embedding manifold, scoring every cell on
        Earth by how closely its fingerprint matches and thinning the top hits so
        they don't cluster.
      </>
    ),
  },
];

export default function AboutSection() {
  const toTop = () => {
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <section className="about" id="about" aria-label="About Rewilding Earth">
      <div className="about-inner">
        {/* thesis — the warmest line on a cold screen (§11) */}
        <header className="about-manifest">
          <p className="eyebrow about-manifest-eyebrow">
            <span className="t-signal">◷</span>&nbsp; A terminal on the planet's
            nervous system
          </p>
          <h2 className="about-thesis serif">
            The Earth has grown a sensing skin of satellites. Now you can ask the
            planet about itself...
          </h2>
        </header>

        {BLOCKS.map((b) => (
          <article className="about-block" key={b.num}>
            <div className="about-block-label mono">
              <span className="about-num">§&nbsp;{b.num}</span>
              <span className="about-eyebrow">{b.eyebrow}</span>
            </div>
            <h3 className="about-heading serif">{b.heading}</h3>
            <p className="about-body serif">{b.body}</p>
          </article>
        ))}

        {/* return to the instrument */}
        <footer className="about-foot">
          <button className="about-up mono" onClick={toTop}>
            ↑&nbsp; BACK TO THE INSTRUMENT
          </button>
        </footer>
      </div>
    </section>
  );
}
