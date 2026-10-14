/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  data/catalog.ts — every garment the app knows about
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE IS
 *  The catalog is built from REAL RUNWAY LOOKS: photos of models on the runway
 *  (Michael Kors, McQueen, Max Mara, Y-3, Oliver Spencer…), stylish people at
 *  fashion week, and museum archive pieces (Raf Simons, Comme des Garçons…).
 *  The looks themselves live in data/looks.generated.ts. This file turns each
 *  garment in each look into a `Piece`: the unit the question flow, the outfit
 *  engine, the taste model and the closet all work with.
 *
 *      one runway look (a photo)            several pieces
 *      ┌──────────────┐                      kors10-016/sweaters        (cardigan)
 *      │  model in a  │   ── catalog.ts ──▶  kors10-016/skirts-midi     (skirt)
 *      │  full outfit │                      kors10-016/shoes-boots     (boots)
 *      └──────────────┘                      kors10-016/accessories-belt
 *
 *  Each piece knows which look it came from (`look`), which show (`show`), and
 *  where in the photo it sits (`crop`, worked out by data/crops.ts). The UI
 *  shows a piece by cropping its look's photo.
 *
 *  HOW TO ADD OR CHANGE PIECES
 *  Don't edit pieces here — edit tools/looks/looks.src.txt (one line per look,
 *  documented at the top of that file) and run `npm run looks`.
 *  Things you CAN tweak here:
 *   - pieceId(): how piece ids are formed (careful: saved outfits use them).
 *   - The rules in `toPiece` (e.g. jumpsuits count as full-length dresses).
 */

import { cropBox } from "./crops";
import { LOOK_SOURCES } from "./looks.generated";
import { showOf } from "./shows";
import type { GarmentSource, LookKind, LookSource, Piece } from "./types";

/** A runway look plus the pieces cut from it. */
export interface Look extends LookSource {
  /** The pieces from this photo, in the order they were listed. */
  pieces: Piece[];
  /** runway / couture / street / archive (from its show). */
  kind: LookKind;
}

/**
 * The id of a garment within its look: "<look>/<category>[-<type or length>]".
 * e.g. "kors10-016/jackets-blazer". If one look lists two garments of the same
 * kind, the second gets "-2".
 */
function pieceId(look: LookSource, g: GarmentSource, taken: Set<string>): string {
  const kind = g.type ?? g.length;
  const base = `${look.id}/${g.category}${kind ? `-${kind}` : ""}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** One garment of one look → a Piece. */
function toPiece(look: LookSource, g: GarmentSource, id: string): Piece {
  return {
    id,
    look: look.id,
    show: look.show,
    section: look.section,
    category: g.category,
    title: g.title,
    fit: g.fit,
    color: g.color,
    vibes: look.vibes,
    formality: look.formality,
    ...(g.type ? { type: g.type } : {}),
    // A jumpsuit reaches the floor, so it answers "maxi" in the length question.
    ...(g.length ? { length: g.length } : g.type === "jumpsuit" ? { length: "maxi" } : {}),
    image: look.id,
    crop: cropBox(look.fig, g),
    credit: look.credit,
  };
}

/** Every runway look, with its pieces attached. */
export const LOOKS: Look[] = LOOK_SOURCES.map((source) => {
  const taken = new Set<string>();
  const pieces = source.garments.map((g) => toPiece(source, g, pieceId(source, g, taken)));
  return { ...source, pieces, kind: showOf(source.show).kind };
});

/** The flat list of every piece — what most of the app works with. */
export const CATALOG: Piece[] = LOOKS.flatMap((look) => look.pieces);

const LOOK_BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

/** Find a runway look by id (a piece's `look` field). */
export function getLook(id: string | undefined): Look | undefined {
  return id ? LOOK_BY_ID.get(id) : undefined;
}
