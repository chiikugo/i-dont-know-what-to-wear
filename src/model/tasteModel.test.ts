/**
 * Tests for the taste model ("Muse") and the home-screen recommender.
 *
 * They check the *behaviour you'd expect from a learner*: liking things makes
 * similar things score higher, dismissing makes them score lower, the model is
 * a pure function of its event log, and the home page genuinely adapts.
 */
import { describe, expect, it } from "vitest";
import { CATALOG } from "../data/catalog";
import { buildCrowdPrior } from "./crowd";
import { featuresOf, optionFeatures } from "./features";
import { buildHomeFeed } from "./recommend";
import {
  emptyState,
  explain,
  learn,
  likelihood,
  makeEvent,
  replay,
  taste,
  topFeatures,
  uncertainty,
} from "./tasteModel";

const BAGGY = ["fit:baggy", "fitcat:baggy:pants"];
const SLIM = ["fit:slim", "fitcat:slim:pants"];

describe("learning", () => {
  it("starts neutral", () => {
    expect(likelihood(emptyState(), BAGGY)).toBeCloseTo(0.5, 5);
  });

  it("raises the score of features it keeps seeing liked", () => {
    let s = emptyState();
    for (let i = 0; i < 5; i++) s = learn(s, makeEvent("option", "menswear", BAGGY));
    expect(likelihood(s, BAGGY)).toBeGreaterThan(0.7);
    expect(likelihood(s, BAGGY)).toBeGreaterThan(likelihood(s, SLIM));
  });

  it("lowers the score of features that are dismissed", () => {
    let s = emptyState();
    for (let i = 0; i < 3; i++) s = learn(s, makeEvent("home-dismiss", "menswear", SLIM));
    expect(likelihood(s, SLIM)).toBeLessThan(0.4);
  });

  it("learns from options that were shown but not picked (gently)", () => {
    let s = learn(emptyState(), makeEvent("option", "menswear", ["fit:baggy"]));
    s = learn(s, makeEvent("option-skip", "menswear", ["fit:slim"]));
    expect(s.w["fit:baggy"]).toBeGreaterThan(0);
    expect(s.w["fit:slim"]).toBeLessThan(0);
    // a skip is a weaker signal than a pick
    expect(Math.abs(s.w["fit:slim"])).toBeLessThan(Math.abs(s.w["fit:baggy"]));
  });

  it("is a pure function: replaying the log gives the same model", () => {
    const events = [
      makeEvent("option", "menswear", BAGGY, 1),
      makeEvent("look-save", "menswear", ["vibe:street", "tone:dark"], 2),
      makeEvent("home-dismiss", "menswear", SLIM, 3),
    ];
    const incremental = events.reduce(learn, emptyState());
    expect(replay(events)).toEqual(incremental);
  });

  it("does not mutate the previous state", () => {
    const before = emptyState();
    learn(before, makeEvent("option", "menswear", BAGGY));
    expect(before).toEqual(emptyState());
  });

  it("becomes more certain about features it has seen", () => {
    const fresh = emptyState();
    const seen = learn(fresh, makeEvent("option", "menswear", BAGGY));
    expect(uncertainty(seen, BAGGY)).toBeLessThan(uncertainty(fresh, BAGGY));
  });

  it("reports what it has learned", () => {
    let s = emptyState();
    for (let i = 0; i < 4; i++) s = learn(s, makeEvent("option", "menswear", ["vibe:street"]));
    for (let i = 0; i < 4; i++) s = learn(s, makeEvent("home-dismiss", "menswear", ["vibe:classic"]));
    const { likes, dislikes } = topFeatures(s);
    expect(likes[0][0]).toBe("vibe:street");
    expect(dislikes[0][0]).toBe("vibe:classic");
  });
});

describe("explanations", () => {
  it("credits the user when their own taps drive the score", () => {
    let s = emptyState();
    for (let i = 0; i < 6; i++) s = learn(s, makeEvent("option", "menswear", ["vibe:street"]));
    const top = explain(s, ["vibe:street", "tone:dark"])[0];
    expect(top.feature).toBe("vibe:street");
    expect(top.source).toBe("you");
  });
});

describe("community prior", () => {
  it("gives positive weight to features liked more than average", () => {
    const prior = buildCrowdPrior([
      { feature: "fit:baggy", pos: 200, neg: 20, users: 30 },
      { feature: "fit:slim", pos: 40, neg: 120, users: 30 },
      { feature: "tone:dark", pos: 100, neg: 100, users: 30 },
    ])!;
    expect(prior.w["fit:baggy"]).toBeGreaterThan(0);
    expect(prior.w["fit:slim"]).toBeLessThan(0);
    expect(prior.users).toBe(30);
  });

  it("returns null when there is no data", () => {
    expect(buildCrowdPrior([])).toBeNull();
  });

  it("matters less once you've taught the model a lot", () => {
    const prior = buildCrowdPrior([{ feature: "fit:baggy", pos: 300, neg: 10, users: 20 }, { feature: "fit:slim", pos: 10, neg: 100, users: 20 }])!;
    const young = emptyState();
    let old = emptyState();
    for (let i = 0; i < 80; i++) old = learn(old, makeEvent("option", "menswear", ["tone:dark"]));
    const gapYoung = taste(young, ["fit:baggy"], prior) - taste(young, ["fit:slim"], prior);
    const gapOld = taste(old, ["fit:baggy"], prior) - taste(old, ["fit:slim"], prior);
    expect(gapYoung).toBeGreaterThan(gapOld);
  });
});

describe("home recommendations", () => {
  const noDismissed = new Set<string>();

  it("returns rails full of pieces from the right section", () => {
    const feed = buildHomeFeed({ section: "womenswear", state: emptyState(), crowd: null, dismissed: noDismissed });
    expect(feed.rails.length).toBeGreaterThanOrEqual(2);
    for (const rail of feed.rails) {
      for (const item of rail.items) expect(["womenswear", "unisex"]).toContain(item.piece.section);
    }
  });

  it("adapts: after liking baggy street pieces, such pieces rise to the top", () => {
    // Teach the model using real pieces: tap baggy / street things repeatedly.
    const liked = CATALOG.filter(
      (p) => p.section === "menswear" && p.fit === "baggy" && p.vibes.includes("street"),
    );
    expect(liked.length).toBeGreaterThan(3);
    let s = emptyState();
    for (const p of liked.slice(0, 4)) s = learn(s, makeEvent("piece-keep", "menswear", featuresOf(p)));
    for (const p of liked.slice(0, 4)) s = learn(s, makeEvent("look-save", "menswear", featuresOf(p)));

    const before = buildHomeFeed({ section: "menswear", state: emptyState(), crowd: null, dismissed: noDismissed });
    const after = buildHomeFeed({ section: "menswear", state: s, crowd: null, dismissed: noDismissed });

    const score = (items: { piece: { fit: string; vibes: string[] } }[]) =>
      items.filter((i) => i.piece.fit === "baggy" || i.piece.vibes.includes("street")).length;
    expect(score(after.rails[0].items)).toBeGreaterThan(score(before.rails[0].items));
  });

  it("never recommends something the user dismissed", () => {
    const first = buildHomeFeed({ section: "menswear", state: emptyState(), crowd: null, dismissed: noDismissed });
    const victim = first.rails[0].items[0].piece.id;
    const again = buildHomeFeed({ section: "menswear", state: emptyState(), crowd: null, dismissed: new Set([victim]) });
    for (const rail of again.rails) expect(rail.items.map((i) => i.piece.id)).not.toContain(victim);
  });

  it("filters by mood when asked", () => {
    const feed = buildHomeFeed({ section: "menswear", state: emptyState(), crowd: null, dismissed: noDismissed, vibe: "edgy" });
    for (const rail of feed.rails) for (const i of rail.items) expect(i.piece.vibes).toContain("edgy");
  });

  it("builds option features that match piece features", () => {
    expect(optionFeatures("fit", "baggy", "pants")).toEqual(["fit:baggy", "fitcat:baggy:pants"]);
    expect(featuresOf(CATALOG[0])).toContain(`fit:${CATALOG[0].fit}`);
    expect(optionFeatures("house", "max-mara", "jackets")).toEqual(["house:max-mara"]);
  });
});

describe("runway-aware taste", () => {
  const noDismissed = new Set<string>();

  it("describes where a piece came from: its house, and street/archive/couture when relevant", () => {
    const maxMara = CATALOG.find((p) => p.show === "maxmara-fw19")!;
    expect(featuresOf(maxMara)).toContain("house:max-mara");
    expect(featuresOf(maxMara).some((f) => f.startsWith("kind:"))).toBe(false); // plain runway = no kind feature
    const street = CATALOG.find((p) => p.show.startsWith("street-"))!;
    expect(featuresOf(street)).toContain("kind:street");
    const archive = CATALOG.find((p) => p.show.startsWith("archive-"))!;
    expect(featuresOf(archive)).toContain("kind:archive");
  });

  it("learns a favourite designer, and the home page shows more of them", () => {
    const maxMara = CATALOG.filter((p) => p.show === "maxmara-fw19");
    let s = emptyState();
    for (const p of maxMara) s = learn(s, makeEvent("look-save", "womenswear", featuresOf(p)));
    expect(topFeatures(s, 10).likes.map(([f]) => f)).toContain("house:max-mara");

    const before = buildHomeFeed({ section: "womenswear", state: emptyState(), crowd: null, dismissed: noDismissed });
    const after = buildHomeFeed({ section: "womenswear", state: s, crowd: null, dismissed: noDismissed });
    const count = (looks: { look: { show: string } }[]) => looks.filter((l) => l.look.show === "maxmara-fw19").length;
    expect(count(after.looks)).toBeGreaterThanOrEqual(count(before.looks));
    expect(after.looks[0].look.show).toBe("maxmara-fw19");
  });

  it("fills the 'Off the runway' row with whole looks from the right section, at most two per show", () => {
    for (const section of ["womenswear", "menswear"] as const) {
      const feed = buildHomeFeed({ section, state: emptyState(), crowd: null, dismissed: noDismissed });
      expect(feed.looks.length, section).toBeGreaterThan(3);
      const perShow = new Map<string, number>();
      for (const { look } of feed.looks) {
        expect([section, "unisex"]).toContain(look.section);
        perShow.set(look.show, (perShow.get(look.show) ?? 0) + 1);
      }
      for (const [show, n] of perShow) expect(n, `${section}: ${show}`).toBeLessThanOrEqual(2);
    }
  });

  it("keeps every rail varied: never two pieces from one photo", () => {
    for (const section of ["womenswear", "menswear"] as const) {
      const feed = buildHomeFeed({ section, state: emptyState(), crowd: null, dismissed: noDismissed });
      for (const rail of feed.rails) {
        const looks = rail.items.map((i) => i.piece.look);
        expect(new Set(looks).size, `${section} / ${rail.id}`).toBe(looks.length);
      }
    }
  });
});
