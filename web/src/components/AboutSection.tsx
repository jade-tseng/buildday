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
    eyebrow: "The Lineage",
    heading: (
      <>
        Rewilding Earth sits where{" "}
        <em className="t-signal">planetary computation</em> meets{" "}
        <em className="t-bio">rewilding</em>.
      </>
    ),
    body: (
      <>
        From planetary computation — Bratton, Antikythera — comes the premise:
        the Earth, wrapped in a skin of satellites and sensors, has begun to
        perceive and model <em>itself</em>. The first image of a black hole was
        made by linking telescopes across the planet and letting the Earth's own
        rotation turn the lens. From rewilding comes the conviction that
        ecosystems recover when we restore the conditions they need and step
        back. We join the two: an instrument that reads the planet's own sensing
        skin to find where the conditions for life already exist — so that
        protection and restoration can follow the evidence, not the borders of a
        dataset.
      </>
    ),
  },
  {
    num: "04",
    eyebrow: "How It Reads The Planet",
    heading: <>The engine never looks for the species. It looks for the place.</>,
    body: (
      <>
        Satellite embeddings compress every ten metres of the Earth's surface
        into a fingerprint of its conditions — water, season, terrain, the
        texture of a living system. Name a habitat and the tool retrieves its
        nearest neighbours worldwide, then checks each against real occurrence
        records:{" "}
        <em className="t-bio">green where the records run thick</em>,{" "}
        <em className="t-anomaly">amber where the conditions are right but the
        records haven't caught up yet</em>. The satellite cannot see the kelp. It
        reads the ocean the kelp needs — and then it looks for that same ocean
        everywhere else.
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
            The Earth has grown a sensing skin of satellites. This is an
            instrument plugged into it — built to ask the planet where life like
            this can live.
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
          <p className="about-lineage mono">
            In the lineage of planetary computation · Bratton / Antikythera ·
            and global rewilding initiatives. Engine: nearest-neighbour
            retrieval over AlphaEarth satellite embeddings, verified against open
            occurrence records.
          </p>
        </footer>
      </div>
    </section>
  );
}
