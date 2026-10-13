import { useMemo, useState } from "react";
import {
  categories,
  looks,
  sourceLinks,
  type CategoryId,
  type Look,
} from "./data/catalog";

export default function App() {
  const [category, setCategory] = useState<CategoryId>("shirts");
  const [open, setOpen] = useState<Look | null>(null);
  const [picked, setPicked] = useState<Look[]>([]);

  const items = useMemo(
    () => looks.filter((look) => look.category === category),
    [category]
  );

  const activeLabel = categories.find((c) => c.id === category)?.label ?? "";
  const pickedIds = new Set(picked.map((p) => p.id));

  function togglePick(look: Look) {
    setPicked((current) => {
      const exists = current.some((item) => item.id === look.id);
      if (exists) return current.filter((item) => item.id !== look.id);
      const withoutSameCategory = current.filter(
        (item) => item.category !== look.category
      );
      return [...withoutSameCategory, look];
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="mark">
          What to <span>Wear</span>
        </div>
        <nav>
          <span>Pick</span>
          <span>Looks</span>
          <span>Sources</span>
        </nav>
      </header>

      <section className="hero">
        <p className="kicker">A closet, not a feed</p>
        <h1>
          I don&apos;t know <em>what to wear</em>
        </h1>
        <p className="lede">
          Choose a category, pick a piece, then open similar looks on Pinterest,
          Unsplash, Google, or ASOS. Photos come from Unsplash so we stay on
          public, attributed imagery instead of scraping boards.
        </p>
      </section>

      <div className="categories">
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={cat.id === category ? "cat active" : "cat"}
            onClick={() => setCategory(cat.id)}
            type="button"
          >
            <strong>{cat.label}</strong>
            <span>{cat.hint}</span>
          </button>
        ))}
      </div>

      <section className="grid-wrap">
        <div className="grid-head">
          <h2>{activeLabel}</h2>
          <p>Tap a look to inspect and pick it for today.</p>
        </div>
        <div className="grid">
          {items.map((look) => (
            <button
              key={look.id}
              className={pickedIds.has(look.id) ? "card picked" : "card"}
              onClick={() => setOpen(look)}
              type="button"
            >
              <img src={look.image} alt={look.title} />
              <figcaption>
                <h3>{look.title}</h3>
                <div className="meta">{look.vibe}</div>
              </figcaption>
            </button>
          ))}
        </div>
      </section>

      {open && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <article className="sheet" onClick={(e) => e.stopPropagation()}>
            <img src={open.image} alt={open.title} />
            <div className="sheet-body">
              <p className="kicker">{open.vibe}</p>
              <h2>{open.title}</h2>
              <p className="credit">
                Photo by{" "}
                <a href={open.photographerUrl} target="_blank" rel="noreferrer">
                  {open.photographer}
                </a>{" "}
                on Unsplash
              </p>
              <div className="sources">
                {sourceLinks(open.query).map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <button className="pick" type="button" onClick={() => togglePick(open)}>
                {pickedIds.has(open.id) ? "Remove from today" : "Pick this"}
              </button>
              <button className="close" type="button" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </article>
        </div>
      )}

      {picked.length > 0 && (
        <aside className="tray">
          <h3>Today</h3>
          <div className="picks">
            {picked.map((look) => (
              <img key={look.id} src={look.image} alt={look.title} title={look.title} />
            ))}
          </div>
          <button className="clear" type="button" onClick={() => setPicked([])}>
            Clear
          </button>
        </aside>
      )}
    </div>
  );
}
