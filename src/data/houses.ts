/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  data/houses.ts — the designers Muse can recognise by name
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE IS FOR
 *  Live looks arrive as headlines and captions ("The Finale of the CHANEL
 *  Spring Summer 2027 Show"). To let Muse learn "you keep opening Chanel", the
 *  app spots designer names in that text and turns them into the same
 *  `house:<slug>` feature the catalog uses (see model/features.ts).
 *
 *  Each entry: slug → display name + the spellings to look for. The slugs for
 *  houses that are also in the catalog MUST match `houseSlug` in data/shows.ts
 *  (e.g. "alexander-mcqueen", "max-mara") so taste learned from live looks and
 *  from catalog pieces adds up.
 *
 *  TWEAK: add a designer by adding a line. Aliases are matched as whole words,
 *  ignoring case and accents ("Hermes" finds "Hermès").
 */

export interface HouseDef {
  name: string;
  /** Extra spellings / short forms to recognise (the name itself is always included). */
  aliases?: string[];
  /** Text that looks like the name but isn't the house (e.g. "Céline Dion"). */
  not?: RegExp;
}

export const HOUSES: Record<string, HouseDef> = {
  // In the catalog (slugs shared with data/shows.ts)
  "alexander-mcqueen": { name: "Alexander McQueen", aliases: ["McQueen"] },
  "max-mara": { name: "Max Mara", aliases: ["MaxMara"] },
  "michael-kors": { name: "Michael Kors" },
  "phillip-lim": { name: "3.1 Phillip Lim", aliases: ["Phillip Lim"] },
  "diesel-black-gold": { name: "Diesel Black Gold", aliases: ["Diesel"] },
  "richard-chai": { name: "Richard Chai" },
  "y-3": { name: "Y-3" },
  "jill-stuart": { name: "Jill Stuart" },
  dvf: { name: "Diane von Furstenberg", aliases: ["DVF", "Diane von Fürstenberg"] },
  "basil-soda": { name: "Basil Soda" },
  "iris-van-herpen": { name: "Iris van Herpen" },
  "gustavo-lins": { name: "Gustavo Lins" },
  "oliver-spencer": { name: "Oliver Spencer" },
  "astrid-andersen": { name: "Astrid Andersen" },
  "raf-simons": { name: "Raf Simons" },
  "comme-des-garcons": { name: "Comme des Garçons", aliases: ["Comme des Garcons", "CDG", "Rei Kawakubo"] },
  "junya-watanabe": { name: "Junya Watanabe" },
  "walter-van-beirendonck": { name: "Walter Van Beirendonck" },
  "paul-smith": { name: "Paul Smith" },
  "yohji-yamamoto": { name: "Yohji Yamamoto", aliases: ["Yohji"] },
  "maison-margiela": { name: "Maison Margiela", aliases: ["Margiela", "Martin Margiela"] },
  "jean-paul-gaultier": { name: "Jean Paul Gaultier", aliases: ["Gaultier"] },

  // Big houses that appear in live feeds
  chanel: { name: "Chanel" },
  dior: { name: "Dior", aliases: ["Christian Dior", "DiorSummer27", "DiorSummer"] },
  "louis-vuitton": { name: "Louis Vuitton", aliases: ["LV", "LVSS27", "LVFW26"] },
  prada: { name: "Prada" },
  "miu-miu": { name: "Miu Miu" },
  gucci: { name: "Gucci" },
  balenciaga: { name: "Balenciaga" },
  loewe: { name: "Loewe" },
  fendi: { name: "Fendi" },
  "bottega-veneta": { name: "Bottega Veneta", aliases: ["Bottega"] },
  hermes: { name: "Hermès", aliases: ["Hermes"] },
  valentino: { name: "Valentino" },
  versace: { name: "Versace" },
  "saint-laurent": { name: "Saint Laurent", aliases: ["YSL", "Yves Saint Laurent"] },
  celine: { name: "Celine", not: /celine dion/ },
  givenchy: { name: "Givenchy" },
  burberry: { name: "Burberry" },
  jacquemus: { name: "Jacquemus" },
  "thom-browne": { name: "Thom Browne" },
  "tom-ford": { name: "Tom Ford" },
  schiaparelli: { name: "Schiaparelli" },
  "rick-owens": { name: "Rick Owens" },
  "dries-van-noten": { name: "Dries Van Noten" },
  courreges: { name: "Courrèges", aliases: ["Courreges"] },
  "simone-rocha": { name: "Simone Rocha" },
  "the-row": { name: "The Row" },
  khaite: { name: "Khaite" },
  "jw-anderson": { name: "JW Anderson", aliases: ["J.W. Anderson"] },
  marni: { name: "Marni" },
  moschino: { name: "Moschino" },
  ferragamo: { name: "Ferragamo", aliases: ["Salvatore Ferragamo"] },
  "dolce-gabbana": { name: "Dolce & Gabbana", aliases: ["Dolce and Gabbana", "D&G"] },
  "giorgio-armani": { name: "Giorgio Armani", aliases: ["Armani"] },
  zegna: { name: "Zegna", aliases: ["Ermenegildo Zegna"] },
  lemaire: { name: "Lemaire" },
  coperni: { name: "Coperni" },
  "martine-rose": { name: "Martine Rose" },
  "wales-bonner": { name: "Wales Bonner" },
  "vivienne-westwood": { name: "Vivienne Westwood", aliases: ["Westwood"] },
  "issey-miyake": { name: "Issey Miyake", aliases: ["Miyake"] },
  "ralph-lauren": { name: "Ralph Lauren" },
  "carolina-herrera": { name: "Carolina Herrera" },
  "oscar-de-la-renta": { name: "Oscar de la Renta" },
  "stella-mccartney": { name: "Stella McCartney" },
  chloe: { name: "Chloé", aliases: ["Chloe"] },
  alaia: { name: "Alaïa", aliases: ["Alaia"] },
  mugler: { name: "Mugler" },
  rabanne: { name: "Rabanne", aliases: ["Paco Rabanne"] },
  "ann-demeulemeester": { name: "Ann Demeulemeester" },
  "sacai": { name: "Sacai" },
};

/** Lower-case and strip accents, so "Hermès" and "HERMES" compare equal. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One regular expression per house, built once. */
const MATCHERS: [string, RegExp, RegExp | undefined][] = Object.entries(HOUSES).map(([slug, def]) => {
  const words = [def.name, ...(def.aliases ?? [])].map((w) => escapeRe(fold(w)));
  // Whole words only: "LV" mustn't match "silver"; "#LVSS27" still matches.
  return [slug, new RegExp(`(^|[^a-z0-9])(${words.join("|")})(?![a-z])`, "i"), def.not];
});

/** Every house named in a piece of text, e.g. "Chanel Spring 2027 Show" → ["chanel"]. */
export function housesIn(text: string): string[] {
  const t = fold(text);
  return MATCHERS.filter(([, re, not]) => re.test(t) && !(not && not.test(t))).map(([slug]) => slug);
}
