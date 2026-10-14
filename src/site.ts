/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  site.ts — the public facts about this website, in ONE place
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Used by the app (the About page, the footer) AND baked into the static
 *  Privacy and Terms pages (privacy/index.html, terms/index.html) when the site
 *  is built — every `%SITE_…%` in those files is replaced with the values
 *  below (see the `siteFacts` plugin in vite.config.ts).
 *
 *  EDIT THESE before you publish, then `npm run build` (or `npm run deploy`).
 *  Pinterest checks that the privacy policy is on the SAME domain as the
 *  website you register — so `url` must be where the site is hosted.
 */

export const SITE = {
  /** The site's name. */
  name: "What to Wear",
  /** Where the site lives (no trailing slash). */
  url: "https://chiikugo.github.io/i-dont-know-what-to-wear",
  /** Who runs the site — shown in the privacy policy as the "data controller". */
  owner: "Chiku Okechukwu",
  /** Where people can reach you about privacy (deletion requests, questions). */
  contactEmail: "chikunwenyi@gmail.com",
  /** When the Privacy Policy and Terms last changed. Update when you edit them. */
  policyDate: "14 October 2026",
  /** Where Supabase stores synced closets (the project's region). */
  dataRegion: "the United States (Amazon Web Services, us-east-1)",
} as const;

/** "mailto:…" if a contact email is set, otherwise the About page. */
export function contactHref(): string {
  return SITE.contactEmail ? `mailto:${SITE.contactEmail}` : `${import.meta.env.BASE_URL}#/about`;
}
