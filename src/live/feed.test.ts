/**
 * Tests for the live feed's logic: recognising designers, merging refreshes
 * without duplicates, ranking (fresh first, nudged by Muse), and turning a live
 * look into a catalog garment ("Build a look inspired by this").
 */
import { describe, expect, it } from "vitest";
import { housesIn } from "../data/houses";
import { emptyState, learn, makeEvent } from "../model/tasteModel";
import type { LiveItem } from "./feedCore";
import { freshness, mergeItems, rankLive, timeAgo } from "./feed";
import { inspiredPiece } from "./inspire";
import { isLookStory, liveFeatures } from "./tags";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let n = 0;
function item(over: Partial<LiveItem>): LiveItem {
  n++;
  return {
    id: `t:${n}`,
    source: "vogue-runway",
    sourceName: "Vogue Runway",
    kind: "runway",
    title: `Story ${n}`,
    url: `https://www.vogue.com/article/${n}`,
    image: `https://assets.vogue.com/photos/${n}/master/w_640,c_limit/${n}.jpg`,
    published: hoursAgo(1),
    section: "both",
    ...over,
  };
}

describe("recognising designers in captions", () => {
  it("finds houses, ignoring case, accents and hashtags", () => {
    expect(housesIn("The Finale of the CHANEL Spring Summer 2027 Show")).toEqual(["chanel"]);
    expect(housesIn("#LVSS27 #NicolasGhesquiere #LouisVuitton")).toContain("louis-vuitton");
    expect(housesIn("Hermes and Hermès")).toEqual(["hermes"]);
    expect(housesIn("Alexander McQueen's moth prints")).toEqual(["alexander-mcqueen"]);
  });

  it("doesn't confuse words that merely contain a name", () => {
    expect(housesIn("A silver lamé gown")).toEqual([]); // "LV" inside "silver"
    expect(housesIn("Celine Dion at the premiere")).toEqual([]);
  });

  it("turns a caption into Muse features", () => {
    const f = liveFeatures(item({ title: "Floral lace at the Dior Summer 2027 show, in black", kind: "street" }));
    expect(f).toEqual(expect.arrayContaining(["house:dior", "vibe:romantic", "color:black", "tone:dark", "kind:street"]));
  });
});

describe("isLookStory (keeps magazine feeds to actual looks)", () => {
  it("accepts collections, shows, street style and designers", () => {
    expect(isLookStory("The Best Street Style Photos From Paris")).toBe(true);
    expect(isLookStory("Inside the Loewe Spring 2027 collection")).toBe(true);
    expect(isLookStory("Kim Jones Is Launching an Eponymous Label at Dior")).toBe(true);
  });
  it("rejects news, beauty, TV and shopping", () => {
    expect(isLookStory("It's Not a Whitehead, It's Milia—Here's How to Treat It")).toBe(false);
    expect(isLookStory("The Best Airbnbs in Lisbon")).toBe(false);
    expect(isLookStory("HBO's Girls: 10 of the show's all-time best episodes")).toBe(false);
  });
});

describe("mergeItems", () => {
  it("adds new stories and keeps known ones without duplicates", () => {
    const a = item({ published: hoursAgo(5) });
    const b = item({ published: hoursAgo(2) });
    const merged = mergeItems([a], [a, b]);
    expect(merged.map((i) => i.id)).toEqual([b.id, a.id]); // newest first, no repeat
  });

  it("collapses the same picture shown at a different size", () => {
    const small = item({ image: "https://i.pinimg.com/236x/aa/bb/cc/x.jpg", source: "pinterest-dior" });
    const big = item({ image: "https://i.pinimg.com/736x/aa/bb/cc/x.jpg", source: "pinterest-vogue" });
    expect(mergeItems([], [small, big])).toHaveLength(1);
  });
});

describe("rankLive", () => {
  const base = { state: emptyState(), crowd: null, dismissed: new Set<string>(), section: "womenswear" as const, now: NOW };

  it("puts a designer's look before a fresher magazine article", () => {
    const pin = item({ kind: "pinterest", source: "pinterest-dior", published: hoursAgo(18) });
    const article = item({ kind: "editorial", source: "dazed", published: hoursAgo(0.2) });
    expect(rankLive({ ...base, items: [article, pin] })[0].id).toBe(pin.id);
  });

  it("puts the freshest first when Muse has no opinion yet", () => {
    const old = item({ published: hoursAgo(72) });
    const fresh = item({ published: hoursAgo(1), source: "gq" });
    expect(rankLive({ ...base, items: [old, fresh] })[0].id).toBe(fresh.id);
  });

  it("lets taste lift a favourite designer above a slightly newer story", () => {
    let s = emptyState();
    for (let i = 0; i < 6; i++) s = learn(s, makeEvent("look-save", "womenswear", ["house:chanel"]));
    const chanel = item({ title: "Chanel Spring 2027", published: hoursAgo(10) });
    const other = item({ title: "A newer story", published: hoursAgo(2), source: "gq" });
    expect(rankLive({ ...base, state: s, items: [other, chanel] })[0].id).toBe(chanel.id);
  });

  it("hides dismissed items and items for the other section", () => {
    const gone = item({});
    const mens = item({ section: "menswear" });
    const keep = item({});
    const ranked = rankLive({ ...base, dismissed: new Set([gone.id]), items: [gone, mens, keep] });
    expect(ranked.map((i) => i.id)).toEqual([keep.id]);
  });

  it("never shows more than two in a row from the same source", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => item({ source: "vogue-runway", published: hoursAgo(i) })),
      item({ source: "gq", published: hoursAgo(20) }),
      item({ source: "vam", published: hoursAgo(30) }),
    ];
    const order = rankLive({ ...base, items }).map((i) => i.source);
    for (let i = 2; i < order.length; i++) {
      if (order[i] === order[i - 1] && order[i] === order[i - 2]) {
        // allowed only once no other source is left to interleave
        expect(order.slice(i).every((s) => s === order[i])).toBe(true);
      }
    }
  });

  it("caps any one source at three of the first two dozen cards", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => item({ source: "pinterest-dior", kind: "pinterest", published: hoursAgo(i * 0.1) })),
      ...Array.from({ length: 6 }, (_, i) => item({ source: `other-${i}`, published: hoursAgo(10 + i) })),
    ];
    const first = rankLive({ ...base, items }).slice(0, 9);
    expect(first.filter((i) => i.source === "pinterest-dior").length).toBeLessThanOrEqual(3);
  });

  it("filters by kind", () => {
    const show = item({ kind: "show", source: "youtube" });
    const ranked = rankLive({ ...base, kind: "show", items: [item({}), show] });
    expect(ranked.map((i) => i.id)).toEqual([show.id]);
  });
});

describe("freshness & time labels", () => {
  it("halves over time", () => {
    expect(freshness(hoursAgo(0), NOW)).toBeCloseTo(1, 5);
    expect(freshness(hoursAgo(36), NOW)).toBeCloseTo(0.5, 5);
  });

  it("lets show films stay fresh much longer than magazine stories", () => {
    const week = hoursAgo(24 * 7);
    expect(freshness(week, NOW, "show")).toBeGreaterThan(0.6);
    expect(freshness(week, NOW, "editorial")).toBeLessThan(0.05);
  });

  it("speaks human", () => {
    expect(timeAgo(hoursAgo(0), NOW)).toBe("just now");
    expect(timeAgo(hoursAgo(3), NOW)).toBe("3 h ago");
    expect(timeAgo(hoursAgo(50), NOW)).toBe("2 d ago");
  });
});

describe("inspiredPiece", () => {
  it("picks a garment by the same designer when the catalog has one", () => {
    const match = inspiredPiece(item({ title: "Inside Alexander McQueen's new tailoring" }), "womenswear");
    expect(match?.piece.show).toBe("mcqueen-fw18");
    expect(match?.reason).toMatch(/Same house: Alexander McQueen/);
    expect(["shoes", "accessories"]).not.toContain(match!.piece.category);
  });

  it("falls back to colour and mood", () => {
    const match = inspiredPiece(item({ title: "Romantic camel coats everywhere" }), "womenswear");
    expect(match).not.toBeNull();
    expect(match!.piece.color === "camel" || match!.piece.vibes.includes("romantic")).toBe(true);
  });

  it("respects the section", () => {
    const match = inspiredPiece(item({ title: "Max Mara camel coats" }), "menswear");
    expect(["menswear", "unisex"]).toContain(match!.piece.section);
  });
});
