/**
 * Tests for the outfit engine: "give it one piece, get back a whole look".
 */
import { describe, expect, it } from "vitest";
import { CATALOG } from "../data/catalog";
import type { Piece, Slot } from "../data/types";
import { pairReasons, pairScore } from "./compat";
import { composeLook, rankAlternatives } from "./composer";
import { getPiece, inSection, slotOfPiece } from "./resolver";

const piece = (id: string): Piece => {
  const p = getPiece(id);
  if (!p) throw new Error(`missing piece ${id}`);
  return p;
};

// Pieces the tests lean on (all from real runway looks — see tools/looks/looks.src.txt).
const MENS_SHIRT = "os14-01/shirts"; // Oliver Spencer coral pinstripe shirt (slim)
const MENS_TEE = "aa14-04/tshirts"; // Astrid Andersen ivory tank (baggy, sporty)
const MENS_BAGGY_TOP = "aa14-11/hoodies-pullover"; // white nylon anorak (baggy, sporty/minimal — not street)
const aDress = () => CATALOG.find((p) => p.category === "dresses" && p.section === "womenswear")!;

/** All slots of a composed look that have a piece. */
const filled = (pieces: Partial<Record<Slot, Piece>>) =>
  Object.entries(pieces).filter(([, p]) => p) as [Slot, Piece][];

describe("composeLook", () => {
  it("builds a full outfit from a single menswear shirt", () => {
    const anchor = piece(MENS_SHIRT);
    const { pieces } = composeLook({ section: "menswear", fixed: { top: anchor } });

    expect(pieces.top).toBe(anchor); // the anchor is never replaced
    expect(pieces.bottom).toBeDefined();
    expect(pieces.shoes).toBeDefined();
    expect(pieces.layer).toBeDefined();
    expect(pieces.accessory).toBeDefined();
    expect(pieces.onepiece).toBeUndefined(); // separates, not a dress
  });

  it("never uses the same piece twice, and stays inside the section", () => {
    for (const anchor of CATALOG.filter((p) => p.section === "womenswear").slice(0, 40)) {
      const slot = slotOfPiece(anchor);
      const { pieces } = composeLook({ section: "womenswear", fixed: { [slot]: anchor } });
      const ids = filled(pieces).map(([, p]) => p.id);
      expect(new Set(ids).size, anchor.id).toBe(ids.length);
      for (const [, p] of filled(pieces)) expect(inSection(p, "womenswear"), p.id).toBe(true);
    }
  });

  it("does not add a top or bottom when the anchor is a dress", () => {
    const dress = aDress();
    const { pieces } = composeLook({ section: "womenswear", fixed: { onepiece: dress } });
    expect(pieces.onepiece).toBe(dress);
    expect(pieces.top).toBeUndefined();
    expect(pieces.bottom).toBeUndefined();
    expect(pieces.shoes).toBeDefined();
  });

  it("respects omitted slots", () => {
    const { pieces } = composeLook({
      section: "menswear",
      fixed: { top: piece(MENS_SHIRT) },
      omitted: ["accessory", "layer"],
    });
    expect(pieces.accessory).toBeUndefined();
    expect(pieces.layer).toBeUndefined();
    expect(pieces.shoes).toBeDefined();
  });

  it("is deterministic for the same seed and varies with a different seed", () => {
    const input = { section: "menswear" as const, fixed: { top: piece(MENS_TEE) } };
    const a = composeLook({ ...input, seed: 3 });
    const b = composeLook({ ...input, seed: 3 });
    expect(filled(a.pieces).map(([, p]) => p.id)).toEqual(filled(b.pieces).map(([, p]) => p.id));

    const ids = (seed: number) =>
      filled(composeLook({ ...input, seed }).pieces)
        .map(([, p]) => p.id)
        .join();
    const variants = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(ids));
    expect(variants.size).toBeGreaterThan(1); // shuffle really changes something
  });

  it("keeps the dress code coherent (within two notches of the anchor)", () => {
    for (const anchor of CATALOG.filter((p) => ["shirts", "tshirts", "sweaters"].includes(p.category))) {
      const section = anchor.section === "womenswear" ? "womenswear" : "menswear";
      const { pieces } = composeLook({ section, fixed: { top: anchor } });
      for (const [slot, p] of filled(pieces)) {
        if (slot === "accessory") continue; // accessories are deliberately flexible
        expect(Math.abs(p.formality - anchor.formality), `${anchor.id} + ${p.id}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("balances a baggy, non-street top with something less voluminous", () => {
    const { pieces } = composeLook({ section: "menswear", fixed: { top: piece(MENS_BAGGY_TOP) } });
    expect(pieces.bottom?.fit).not.toBe("baggy");
  });

  it("explains its picks", () => {
    const { why } = composeLook({ section: "menswear", fixed: { top: piece(MENS_SHIRT) } });
    expect(Object.keys(why).length).toBeGreaterThan(0);
    for (const reasons of Object.values(why)) expect(reasons!.length).toBeLessThanOrEqual(2);
  });

  it("lets taste tip the balance", () => {
    const anchor = piece(MENS_SHIRT);
    // A "taste" that adores one specific bottom should win unless rules disagree strongly.
    const target = CATALOG.find((p) => p.category === "pants" && p.section === "menswear" && p.look !== anchor.look)!;
    const liked = composeLook({
      section: "menswear",
      fixed: { top: anchor },
      taste: (p) => (p.id === target.id ? 50 : 0),
    });
    expect(liked.pieces.bottom?.id).toBe(target.id);
  });
});

describe("compatibility rules", () => {
  it("prefers slim + baggy over baggy + baggy (when not street)", () => {
    const baggyTop = piece(MENS_BAGGY_TOP); // baggy, sporty/minimal
    const slimBottom = CATALOG.find((p) => p.category === "pants" && p.fit === "slim" && p.color === "black")!;
    const baggyBottom = CATALOG.find((p) => p.category === "pants" && p.fit === "baggy" && p.color === "black")!;
    expect(pairScore(baggyTop, "top", slimBottom, "bottom")).toBeGreaterThan(
      pairScore(baggyTop, "top", baggyBottom, "bottom"),
    );
  });

  it("penalises two different statement colours", () => {
    const red = CATALOG.find((p) => p.color === "red")!;
    const cobalt = CATALOG.find((p) => p.color === "cobalt")!;
    const reasons = pairReasons(red, "top", cobalt, "bottom").map((r) => r.text);
    expect(reasons).toContain("Two statement colours compete");
  });

  it("treats one bold colour head to toe as a choice, not a clash", () => {
    const reds = CATALOG.filter((p) => p.color === "red");
    const reasons = pairReasons(reds[0], "top", reds[1], "bottom").map((r) => r.text);
    expect(reasons).toContain("One bold colour, head to toe");
  });

  it("lets a matching print set through, but not two unrelated prints", () => {
    const prints = CATALOG.filter((p) => p.color === "print");
    const sameLook = prints.find((p) => prints.some((q) => q !== p && q.look === p.look))!;
    const partner = prints.find((q) => q !== sameLook && q.look === sameLook.look)!;
    const stranger = prints.find((q) => q.look !== sameLook.look)!;
    expect(pairReasons(sameLook, "top", partner, "bottom").map((r) => r.text)).toContain("A matching print set");
    expect(pairReasons(sameLook, "top", stranger, "bottom").map((r) => r.text)).toContain("Two prints compete");
  });

  it("rewards pieces that walked together on the runway", () => {
    const look = CATALOG.find((p) => p.category === "pants")!;
    const top = CATALOG.find((p) => p.look === look.look && p.id !== look.id)!;
    expect(pairReasons(top, "layer", look, "bottom").map((r) => r.text)).toContain("Styled together on the runway");
  });

  it("flags a hoodie under tailoring", () => {
    const hoodie = CATALOG.find((p) => p.category === "hoodies")!;
    const blazer = CATALOG.find((p) => p.type === "blazer")!;
    const texts = pairReasons(hoodie, "top", blazer, "layer").map((r) => r.text);
    expect(texts).toContain("A hoodie under tailoring fights itself");
  });
});

describe("rankAlternatives", () => {
  it("returns swap candidates for a slot, best first, excluding pieces already worn", () => {
    const { pieces } = composeLook({ section: "menswear", fixed: { top: piece(MENS_SHIRT) } });
    const alts = rankAlternatives("menswear", "shoes", pieces);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.some((a) => a.piece.id === pieces.shoes!.id)).toBe(false);
  });
});
