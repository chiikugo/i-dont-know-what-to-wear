/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/feed/FeedCard.tsx — one post on the endless home wall
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Four kinds of post share this card (see feed/posts.ts):
 *    live    a picture straight from its publisher (Vogue, Pinterest, YouTube,
 *            a museum…) — never copied, always linked back on the next page
 *    look    a whole runway look from the catalog
 *    piece   one garment cut from a runway look
 *    prompt  "Start a look with jackets →"
 *
 *  The card is positioned by Feed.tsx (absolute x/y from feed/masonry.ts).
 *
 *  OPENING
 *  Click (or tap) a card and the post opens as a stack of cards. Hovering
 *  only highlights it — nothing opens on a timer.
 *
 *  PINTEREST RULES
 *  Pins are shown exactly as they are: never cropped, filtered or covered (the
 *  labels sit in the caption UNDER the picture, not on it), and the caption
 *  says they're from Pinterest.
 */

import { memo, useState } from "react";
import { KIND_LABEL, showOf } from "../../data/shows";
import type { Section } from "../../data/types";
import { categoryLabel } from "../../data/wardrobe";
import type { Placed } from "../../feed/masonry";
import type { Post } from "../../feed/posts";
import { timeAgo } from "../../live/feed";
import { LIVE_KIND_LABEL } from "../../live/sources";
import { Photo } from "../Photo";

interface FeedCardProps {
  post: Post;
  place: Placed;
  /** Position in the feed (for screen readers and the entrance stagger). */
  index: number;
  section: Section;
  /** "Not for me" was pressed: show a small placeholder instead. */
  hidden: boolean;
  /** A live post that arrived while you were here. */
  fresh: boolean;
  onOpen: (post: Post, card: HTMLElement) => void;
  onDismiss: (post: Post) => void;
  /** Report a picture's real shape once it loads (pins, museum photos). */
  onMeasure: (key: string, aspect: number) => void;
}

/** What the card says — kind, where it's from, and a headline. */
function captionOf(post: Post, section: Section): { kind: string; meta: string; title: string; note?: string } {
  switch (post.type) {
    case "live": {
      const { item } = post;
      // Open-licence photos name their photographer; news names its age.
      const when = item.kind === "archive" ? "" : item.credit?.startsWith("Photo:") ? item.credit.replace(/^Photo:\s*/, "").split(" · ")[0] : timeAgo(item.published);
      return { kind: LIVE_KIND_LABEL[item.kind], meta: [item.sourceName, when].filter(Boolean).join(" · "), title: item.title };
    }
    case "look": {
      const show = showOf(post.look.show);
      return { kind: KIND_LABEL[show.kind], meta: show.season || "", title: show.house, note: post.reason };
    }
    case "piece": {
      const show = showOf(post.piece.show);
      return { kind: categoryLabel(post.piece.category, section), meta: show.house, title: post.piece.title };
    }
    case "prompt":
      return { kind: "Start a look", meta: "", title: post.prompt.label };
  }
}

function FeedCardBase({ post, place, index, section, hidden, fresh, onOpen, onDismiss, onMeasure }: FeedCardProps) {
  const [broken, setBroken] = useState(false);
  const caption = captionOf(post, section);
  const canDismiss = post.type === "live" || post.type === "piece";
  const style = {
    transform: `translate3d(${place.x}px, ${place.y}px, 0)`,
    width: place.w,
    height: place.h,
    "--i": index % 10,
  } as React.CSSProperties;

  const className = [
    "feed-card",
    `feed-card--${post.type}`,
    post.type === "live" ? `is-${post.item.kind}` : "",
    post.natural ? "is-natural" : "",
    place.span === 2 ? "is-wide" : "",
    hidden ? "is-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (hidden) {
    return (
      <article className={className} style={style} aria-posinset={index + 1} aria-setsize={-1}>
        <div className="feed-card-hidden">
          <span aria-hidden="true">✦</span>
          Hidden — Muse will show fewer like this.
        </div>
      </article>
    );
  }

  const label =
    post.type === "prompt"
      ? `Start a look with ${post.prompt.label.toLowerCase()}`
      : `${caption.title} — ${caption.kind}${caption.meta ? `, ${caption.meta}` : ""}. Open as a stack of cards.`;

  return (
    <article className={className} style={style} data-post-key={post.key} aria-posinset={index + 1} aria-setsize={-1}>
      <button
        type="button"
        className="feed-card-hit"
        onClick={(e) => onOpen(post, e.currentTarget.closest("article") as HTMLElement)}
        aria-label={label}
        title={post.type === "live" && post.item.credit ? post.item.credit : undefined}
      >
        <span className="feed-card-media" style={{ height: place.imageH }}>
          {post.type === "live" &&
            (broken ? (
              <span className="feed-card-fallback">{post.item.sourceName}</span>
            ) : (
              <img
                src={post.item.image}
                alt=""
                decoding="async"
                referrerPolicy="no-referrer"
                draggable={false}
                onLoad={
                  post.natural
                    ? (e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) onMeasure(post.key, img.naturalWidth / img.naturalHeight);
                      }
                    : undefined
                }
                onError={() => setBroken(true)}
              />
            ))}
          {post.type === "live" && post.item.video && (
            <span className="feed-card-play" aria-hidden="true">
              ▶
            </span>
          )}
          {post.type === "look" && <Photo image={post.look.id} alt="" px={place.w} anchor={post.aspect > 0.7 ? "top" : "center"} />}
          {post.type === "piece" && <Photo image={post.piece.image} crop={post.piece.crop} alt="" px={place.w} />}
          {post.type === "prompt" && (
            <span className="feed-prompt">
              {post.prompt.piece && (
                <span className="feed-prompt-photo" aria-hidden="true">
                  <Photo image={post.prompt.piece.image} crop={post.prompt.piece.crop} alt="" px={place.w} />
                </span>
              )}
              <span className="feed-prompt-words">
                <span className="eyebrow">Start a look with</span>
                <span className="feed-prompt-title display">{post.prompt.label}</span>
                <span className="feed-prompt-hint">{post.prompt.hint}</span>
                <span className="feed-prompt-go" aria-hidden="true">
                  →
                </span>
              </span>
            </span>
          )}
        </span>

        {post.captionH > 0 && (
          <span className="feed-card-caption" style={{ height: post.captionH }}>
            <span className="feed-card-meta">
              <span className="feed-card-kind">{caption.kind}</span>
              {fresh && <span className="feed-card-new">New</span>}
              <span className="feed-card-where">{caption.meta}</span>
            </span>
            <span className="feed-card-title">
              {caption.title}
              {caption.note && <span className="feed-card-note"> · {caption.note}</span>}
            </span>
          </span>
        )}
      </button>

      {canDismiss && (
        <button
          type="button"
          className="feed-card-dismiss"
          onClick={() => onDismiss(post)}
          aria-label={`Not for me: ${caption.title}`}
          title="Not for me"
        >
          ✕
        </button>
      )}
    </article>
  );
}

/**
 * Memoised: only cards whose props really change re-render. The wall's layout
 * is recalculated whenever posts are added or a picture reports its shape,
 * which hands every card a NEW `place` object — usually with the very same
 * numbers. So `place` is compared by its numbers, everything else as usual.
 */
function sameProps(a: FeedCardProps, b: FeedCardProps): boolean {
  for (const key of Object.keys(a) as (keyof FeedCardProps)[]) {
    if (key === "place") continue;
    if (a[key] !== b[key]) return false;
  }
  const p = a.place;
  const q = b.place;
  return p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h && p.imageH === q.imageH && p.span === q.span;
}

export const FeedCard = memo(FeedCardBase, sameProps);
