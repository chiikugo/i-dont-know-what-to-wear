/**
 * Tests for the outfit-in-progress state machine (state/draft.ts).
 * Read them top to bottom and you have the whole user journey.
 */
import { describe, expect, it } from "vitest";
import { CATALOG } from "../data/catalog";
import { CATEGORIES, categoriesFor } from "../data/wardrobe";
import { facetOptions, getPiece } from "../engine/resolver";

// Real runway pieces the tests lean on (see tools/looks/looks.src.txt).
const MENS_SHIRT = "os14-01/shirts"; // Oliver Spencer coral pinstripe shirt
const MENS_TEE = "aa14-04/tshirts"; // Astrid Andersen ivory tank
const MENS_BAGGY_TOP = "aa14-11/hoodies-pullover"; // Astrid Andersen white anorak
import {
  addableSlots,
  alternativesFor,
  answer,
  changeCategory,
  commit,
  currentStep,
  draftPieces,
  fillSlot,
  focusSlot,
  isComplete,
  newDraft,
  omitSlot,
  previewPiece,
  reopen,
  replaceSlot,
  restoreSlot,
  shuffle,
  skip,
  startFromCategory,
  startFromPiece,
  stepBack,
  swapSlot,
  toggleLock,
  validateDraft,
} from "./draft";

describe("starting from a category", () => {
  it("focuses the slot and asks the first question (fit, for shirts)", () => {
    const d = startFromCategory("womenswear", "shirts");
    expect(d.focus).toBe("top");
    expect(d.anchor).toBe("top");
    expect(currentStep(d)?.key).toBe("fit");
    expect(currentStep(d)?.options.map((o) => o.value)).toEqual(["slim", "regular", "baggy"]);
  });

  it("previews a piece that matches the answers so far", () => {
    let d = startFromCategory("womenswear", "shirts");
    d = answer(d, "fit", "baggy");
    expect(previewPiece(d)?.fit).toBe("baggy");
    expect(currentStep(d)?.key).toBe("tone");
  });
});

describe("the question flow", () => {
  it("moves on to the next question after each answer and eventually finishes", () => {
    let d = startFromCategory("womenswear", "dresses");
    const asked: string[] = [];
    for (let i = 0; i < 6; i++) {
      const step = currentStep(d);
      if (!step) break;
      asked.push(step.key);
      d = answer(d, step.key, step.options[0].value);
    }
    expect(asked.length).toBeGreaterThan(0);
    expect(currentStep(d)).toBeNull();
  });

  it("lets the user skip a question", () => {
    let d = startFromCategory("womenswear", "shirts");
    d = skip(d, "fit");
    expect(currentStep(d)?.key).toBe("tone");
    expect(d.slots.top?.answers.fit).toBeUndefined();
  });

  it("skips a question automatically when there is nothing to choose between", () => {
    // Find a first answer after which the NEXT question in the chain has only
    // one possible answer left (e.g. every remaining piece is the same tone).
    // The flow must jump straight past that question.
    for (const section of ["womenswear", "menswear"] as const) {
      for (const cat of categoriesFor(section)) {
        const [first, second] = CATEGORIES[cat.id].chain;
        for (const option of facetOptions(section, cat.id, first, {})) {
          if (facetOptions(section, cat.id, second, { [first]: option.value }).length !== 1) continue;
          let d = startFromCategory(section, cat.id);
          if (currentStep(d)?.key !== first) continue;
          d = answer(d, first, option.value);
          expect(currentStep(d)?.key, `${section}/${cat.id} ${first}=${option.value}`).not.toBe(second);
          return;
        }
      }
    }
    throw new Error("no category has a one-option follow-up question to test with");
  });

  it("steps back to the previous question", () => {
    let d = startFromCategory("womenswear", "shirts");
    d = answer(d, "fit", "baggy");
    expect(currentStep(d)?.key).not.toBe("fit");
    d = stepBack(d);
    expect(currentStep(d)?.key).toBe("fit");
    expect(d.slots.top?.answers.fit).toBeUndefined();
  });

  it("forgets later answers when you reopen an earlier question", () => {
    let d = startFromCategory("womenswear", "shirts");
    d = answer(d, "fit", "baggy");
    d = answer(d, "tone", currentStep(d)!.options[0].value);
    d = reopen(d, "fit");
    expect(d.slots.top?.answers).toEqual({});
    expect(currentStep(d)?.key).toBe("fit");
  });

  it("can switch category within the same slot", () => {
    let d = startFromCategory("womenswear", "shirts");
    d = changeCategory(d, "sweaters"); // also a top
    expect(d.slots.top?.category).toBe("sweaters");
    d = changeCategory(d, "pants"); // a bottom — ignored
    expect(d.slots.top?.category).toBe("sweaters");
  });
});

describe("building the whole look from one piece", () => {
  it("commit() locks the piece and the engine fills the rest", () => {
    let d = startFromCategory("womenswear", "shirts");
    d = answer(d, "fit", "baggy");
    d = commit(d);

    expect(d.focus).toBeNull();
    const pieces = draftPieces(d);
    expect(pieces.top?.fit).toBe("baggy");
    expect(d.slots.top?.locked).toBe(true);
    expect(d.slots.top?.origin).toBe("user");
    expect(pieces.bottom && pieces.shoes).toBeTruthy();
    expect(d.slots.bottom?.origin).toBe("engine");
    expect(isComplete(d)).toBe(true);
  });

  it("startFromPiece() lands straight on a complete board", () => {
    const d = startFromPiece("womenswear", CATALOG.find((p) => p.category === "dresses" && p.section === "womenswear")!);
    expect(d.focus).toBeNull();
    expect(d.slots.onepiece?.locked).toBe(true);
    expect(d.slots.top).toBeUndefined();
    expect(isComplete(d)).toBe(true);
  });

  it("re-picks engine slots when the anchor changes, but never the locked ones", () => {
    let d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    const shoesBefore = d.slots.shoes!.pieceId;
    d = toggleLock(d, "shoes"); // pin the shoes
    d = { ...d, slots: { ...d.slots, top: { ...d.slots.top!, pieceId: getPiece(MENS_BAGGY_TOP)!.id } } };
    d = shuffle(d);
    expect(d.slots.shoes!.pieceId).toBe(shoesBefore);
    expect(d.slots.top!.pieceId).toBe(MENS_BAGGY_TOP);
  });

  it("shuffle() changes engine picks", () => {
    const base = startFromPiece("menswear", getPiece(MENS_TEE)!);
    const ids = (d: ReturnType<typeof shuffle>) => Object.values(d.slots).map((s) => s!.pieceId).sort().join();
    const seen = new Set([ids(base)]);
    let d = base;
    for (let i = 0; i < 8; i++) {
      d = shuffle(d);
      seen.add(ids(d));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("board actions", () => {
  it("swapSlot() replaces a piece and never goes back to a rejected one", () => {
    let d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    const original = d.slots.shoes!.pieceId;
    const first = swapSlot(d, "shoes");
    expect(first.replaced?.id).toBe(original);
    expect(first.next?.id).not.toBe(original);

    d = first.draft;
    const second = swapSlot(d, "shoes");
    expect([original, first.next!.id]).not.toContain(second.next?.id);
  });

  it("can delete a card and add it back (it stays deleted through a shuffle)", () => {
    let d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    expect(d.slots.accessory).toBeDefined();
    d = omitSlot(d, "accessory");
    expect(d.slots.accessory).toBeUndefined();
    d = shuffle(d);
    expect(d.slots.accessory).toBeUndefined(); // stays off through a shuffle
    d = restoreSlot(d, "accessory");
    expect(d.slots.accessory).toBeDefined();
  });

  it("can delete ANY card — the look is then incomplete until it's added back", () => {
    let d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    expect(isComplete(d)).toBe(true);
    d = omitSlot(d, "shoes");
    expect(d.slots.shoes).toBeUndefined();
    expect(isComplete(d)).toBe(false);
    expect(addableSlots(d)).toContain("shoes");
  });

  it("adding a card back fills only that slot and leaves the rest alone", () => {
    const start = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    const before = draftPieces(start);
    const d = fillSlot(omitSlot(start, "shoes"), "shoes");
    const after = draftPieces(d);
    expect(after.shoes).toBeDefined();
    expect(after.top?.id).toBe(before.top?.id);
    expect(after.bottom?.id).toBe(before.bottom?.id);
    expect(d.omitted).not.toContain("shoes");
  });

  it("deleting a dress offers separates (and a dress again), never both at once", () => {
    const dress = CATALOG.find((p) => p.category === "dresses" && p.section === "womenswear")!;
    let d = startFromPiece("womenswear", dress);
    d = omitSlot(d, "onepiece");
    expect(addableSlots(d)).toEqual(expect.arrayContaining(["top", "bottom", "onepiece"]));
    d = fillSlot(d, "top");
    expect(draftPieces(d).top).toBeDefined();
    expect(draftPieces(d).onepiece).toBeUndefined();
    expect(addableSlots(d)).not.toContain("onepiece"); // a top is in: no dress on offer
  });

  it("'Change' offers alternatives and makes the chosen one your (locked) pick", () => {
    const d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    const current = draftPieces(d).bottom!;
    const options = alternativesFor(d, "bottom");
    expect(options.length).toBeGreaterThan(1);
    expect(options.map((p) => p.id)).not.toContain(current.id);
    expect(new Set(options.map((p) => p.look)).size).toBe(options.length); // one per photo
    const changed = replaceSlot(d, "bottom", options[0]);
    expect(draftPieces(changed).bottom?.id).toBe(options[0].id);
    expect(changed.slots.bottom).toMatchObject({ locked: true, origin: "user" });
    expect(changed.slots.bottom?.rejected).toContain(current.id);
    expect(alternativesFor(changed, "bottom").map((p) => p.id)).not.toContain(current.id);
  });

  it("refuses to put a piece in the wrong slot", () => {
    const d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    const shoe = CATALOG.find((p) => p.category === "shoes")!;
    expect(replaceSlot(d, "top", shoe)).toBe(d);
  });

  it("can re-open a slot for refining without changing it until you answer", () => {
    let d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    const bottom = d.slots.bottom!.pieceId;
    d = focusSlot(d, "bottom");
    expect(d.focus).toBe("bottom");
    expect(previewPiece(d)?.id).toBe(bottom);
    expect(currentStep(d)).not.toBeNull();
  });
});

describe("loading a saved draft safely", () => {
  it("accepts a valid draft", () => {
    const d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    const restored = validateDraft(JSON.parse(JSON.stringify(d)));
    expect(restored).not.toBeNull();
    expect(draftPieces(restored!).top?.id).toBe(MENS_SHIRT);
  });

  it("rejects junk and drops pieces that no longer exist", () => {
    expect(validateDraft(null)).toBeNull();
    expect(validateDraft({ version: 2 })).toBeNull();
    const d = startFromPiece("menswear", getPiece(MENS_SHIRT)!);
    const corrupt = JSON.parse(JSON.stringify(d));
    corrupt.slots.bottom.pieceId = "deleted-piece";
    const restored = validateDraft(corrupt)!;
    expect(restored.slots.bottom).toBeUndefined();
    expect(restored.slots.top).toBeDefined();
  });

  it("remembers where a look started (the top card of the stack)", () => {
    const piece = getPiece(MENS_SHIRT)!;
    expect(startFromPiece("menswear", piece).origin).toEqual({ kind: "piece", pieceId: MENS_SHIRT });
    const cover = {
      id: "vogue-runway:abc",
      title: "Street style",
      image: "https://assets.vogue.com/photos/x/master/w_640,c_limit/a.jpg",
      url: "https://www.vogue.com/slideshow/x",
      sourceName: "Vogue Runway",
      kind: "street",
    };
    const d = startFromPiece("menswear", piece, undefined, { kind: "live", item: cover });
    const restored = validateDraft(JSON.parse(JSON.stringify(d)))!;
    expect(restored.origin).toEqual({ kind: "live", item: cover });
  });

  it("drops a saved origin that doesn't make sense (unknown look, non-https picture)", () => {
    const d = JSON.parse(JSON.stringify(startFromPiece("menswear", getPiece(MENS_SHIRT)!)));
    d.origin = { kind: "look", lookId: "no-such-look" };
    expect(validateDraft(d)!.origin).toBeUndefined();
    d.origin = { kind: "live", item: { id: "x", image: "javascript:alert(1)", url: "https://a.b/" } };
    expect(validateDraft(d)!.origin).toBeUndefined();
  });

  it("starts empty", () => {
    const d = newDraft("womenswear");
    expect(isComplete(d)).toBe(false);
    expect(draftPieces(d)).toEqual({});
  });
});
