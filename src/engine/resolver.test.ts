/**
 * Tests for the catalog and the question-flow resolver.
 *
 * These double as documentation: each `it(...)` says in plain English what must
 * always be true. If you add looks to tools/looks/looks.src.txt and one of these
 * fails, the failure message tells you what to fix.
 */
import { describe, expect, it } from "vitest";
import { CATALOG, LOOKS } from "../data/catalog";
import { SHOWS } from "../data/shows";
import { CATEGORIES, TYPE_COPY, LENGTH_COPY, categoriesFor } from "../data/wardrobe";
import { COLORS } from "../data/types";
import type { Section } from "../data/types";
import { bestFor, facetOptions, getPiece, matchesAnswers, narrow, nextStep, piecesIn } from "./resolver";

const SECTIONS: Section[] = ["menswear", "womenswear"];

/** Licences our photos may use (all allow reuse with credit). */
const OK_LICENCES = /^(CC BY(-SA)? [234]\.0|CC0|Public domain)$/;

describe("catalog integrity", () => {
  it("has unique ids", () => {
    const ids = CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only known colours", () => {
    for (const piece of CATALOG) expect(COLORS[piece.color], piece.id).toBeDefined();
  });

  it("hot-links every runway photo from Wikimedia (nothing downloaded) with a sane frame", () => {
    for (const look of LOOKS) {
      const { photo, frame } = look;
      expect(photo.src, look.id).toMatch(/^https:\/\/(thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/\{w\}px-[^/]+$/);
      expect(photo.width, look.id).toBeGreaterThan(500); // at least one standard thumbnail width fits
      expect(photo.height, look.id).toBeGreaterThan(0);
      const [left, top, width, height] = frame;
      expect(width, look.id).toBeGreaterThan(0.1);
      expect(height, look.id).toBeGreaterThan(0.1);
      expect(top, look.id).toBeGreaterThanOrEqual(0);
      expect(top + height, look.id).toBeLessThanOrEqual(1.0001);
      // The frame is 2:3 in pixels…
      expect((width * photo.width) / (height * photo.height), look.id).toBeCloseTo(2 / 3, 2);
      // …and may overhang the sides of a narrow photo only by the missing width.
      expect(left, look.id).toBeGreaterThan(-0.5);
      expect(left + width, look.id).toBeLessThan(1.5);
    }
  });

  it("credits every photo with an author, an open licence and a source link", () => {
    for (const look of LOOKS) {
      const c = look.credit;
      expect(c.author, look.id).toBeTruthy();
      expect(c.title, look.id).toBeTruthy();
      expect(c.license, `${look.id} licence "${c.license}"`).toMatch(OK_LICENCES);
      expect(c.licenseUrl, look.id).toMatch(/^https?:\/\//);
      expect(c.source, look.id).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
  });

  it("never uses the same photo twice", () => {
    const titles = LOOKS.map((l) => l.credit.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("links every look to a known show", () => {
    for (const look of LOOKS) expect(SHOWS[look.show], `${look.id} show "${look.show}"`).toBeDefined();
  });

  it("gives every piece a sensible crop inside its photo", () => {
    for (const piece of CATALOG) {
      const [x0, y0, x1, y1] = piece.crop;
      expect(x0, piece.id).toBeGreaterThanOrEqual(0);
      expect(y0, piece.id).toBeGreaterThanOrEqual(0);
      expect(x1, piece.id).toBeLessThanOrEqual(100);
      expect(y1, piece.id).toBeLessThanOrEqual(100);
      // Big enough to show something (at least ~8% of the photo's height and width).
      expect(x1 - x0, piece.id).toBeGreaterThan(8);
      expect(y1 - y0, piece.id).toBeGreaterThan(8);
    }
  });

  it("keeps the figure position of every look inside its photo", () => {
    for (const look of LOOKS) {
      const [top, bottom, x] = look.fig;
      expect(top, look.id).toBeLessThan(bottom);
      expect(x, look.id).toBeGreaterThan(5);
      expect(x, look.id).toBeLessThan(95);
    }
  });

  it("has wording for every `type` and `length` value (so labels read well)", () => {
    for (const piece of CATALOG) {
      if (piece.type) expect(TYPE_COPY[piece.type], `${piece.id} type "${piece.type}"`).toBeDefined();
      if (piece.length) expect(LENGTH_COPY[piece.length], `${piece.id} length "${piece.length}"`).toBeDefined();
    }
  });

  it("gives every piece at least one vibe and a formality of 1–5", () => {
    for (const piece of CATALOG) {
      expect(piece.vibes.length, piece.id).toBeGreaterThan(0);
      expect(piece.formality, piece.id).toBeGreaterThanOrEqual(1);
      expect(piece.formality, piece.id).toBeLessThanOrEqual(5);
    }
  });
});

describe("question flow", () => {
  for (const section of SECTIONS) {
    it(`${section}: every listed category has pieces and a first question`, () => {
      for (const cat of categoriesFor(section)) {
        expect(piecesIn(section, cat.id).length, `${section}/${cat.id} pieces`).toBeGreaterThan(0);
        expect(nextStep(section, cat.id, {}, []), `${section}/${cat.id} first question`).not.toBeNull();
      }
    });
  }

  it("asks the signature 'slim fit or baggy?' with all three fits for womenswear shirts", () => {
    const values = facetOptions("womenswear", "shirts", "fit", {}).map((o) => o.value);
    expect(values).toEqual(["slim", "regular", "baggy"]);
  });

  it("can ask 'Whose runway?' — options are real houses", () => {
    const houses = facetOptions("womenswear", "jackets", "house", {}).map((o) => o.value);
    expect(houses.length).toBeGreaterThan(3);
    expect(houses).toContain("max-mara");
  });

  it("only offers options that really have a photo behind them", () => {
    for (const section of SECTIONS) {
      for (const cat of categoriesFor(section)) {
        for (const key of CATEGORIES[cat.id].chain) {
          for (const opt of facetOptions(section, cat.id, key, {})) {
            const piece = bestFor(section, cat.id, { [key]: opt.value });
            expect(piece, `${section}/${cat.id}/${key}=${opt.value}`).toBeDefined();
            expect(matchesAnswers(piece!, { [key]: opt.value })).toBe(true);
          }
        }
      }
    }
  });

  it("narrows later questions to what exists after earlier answers", () => {
    const all = facetOptions("womenswear", "shirts", "tone", {}).map((o) => o.value);
    const afterBaggy = facetOptions("womenswear", "shirts", "tone", { fit: "baggy" }).map((o) => o.value);
    expect(afterBaggy.length).toBeGreaterThan(0);
    for (const tone of afterBaggy) expect(all).toContain(tone);
    // …and every remaining piece really is baggy.
    for (const piece of narrow("womenswear", "shirts", { fit: "baggy" })) expect(piece.fit).toBe("baggy");
  });

  it("finishes the chain eventually (never loops)", () => {
    const answers: Record<string, string> = {};
    const handled: string[] = [];
    for (let i = 0; i < 10; i++) {
      const step = nextStep("womenswear", "dresses", answers, handled as never[]);
      if (!step) return; // done
      answers[step.key] = step.options[0].value;
      handled.push(step.key);
    }
    throw new Error("question chain did not terminate");
  });

  it("looks pieces up by id", () => {
    const first = CATALOG[0];
    expect(getPiece(first.id)).toBe(first);
    expect(getPiece("os14-01/shirts")?.category).toBe("shirts");
    expect(getPiece("nope")).toBeUndefined();
  });
});
