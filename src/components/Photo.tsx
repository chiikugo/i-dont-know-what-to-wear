/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/Photo.tsx — one photo, done properly
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Every picture in the app goes through this component so we only solve these
 *  problems once:
 *
 *   • NOTHING IS DOWNLOADED
 *     Runway photos stay on Wikimedia Commons; the browser loads them straight
 *     from Wikimedia's image servers ("hot-linking").
 *   • CROPPING A GARMENT OUT OF A RUNWAY LOOK
 *     A runway look is one photo of a whole outfit. To show just the coat, we
 *     pass the coat's `crop` box (worked out in data/crops.ts) and draw the photo
 *     inside an <svg> whose viewBox IS that box (lib/imageUrl.ts → frameViewBox).
 *     SVG's `preserveAspectRatio="xMidYMid slice"` then scales the box to cover
 *     the card and keeps it centred — exactly like CSS `object-fit: cover`, but
 *     around the garment instead of the middle of the photo.
 *   • THE RIGHT FILE SIZE  Wikimedia offers each photo at a few standard widths.
 *     We ask for the smallest one with enough pixels for a sharp (2×) screen.
 *     Tell us roughly how wide the card is with `px`.
 *   • LAZY LOADING      the file isn't requested until the frame scrolls near the
 *     screen (IntersectionObserver), then fades in.
 *   • FAILURE           if a file can't load we show a quiet paper tile with the
 *     garment's name instead of a broken-image icon.
 *   • ATTRIBUTION       `<Credit>` renders "Photo: author, licence, cropped" with
 *     links — what the Creative Commons licences of our photos ask for.
 *   • OLD OUTFITS       outfits saved before the runway catalog point at Unsplash
 *     photos ("photo-…"); those still render, the old way.
 *
 *  The frame's size comes from CSS (the parent decides the aspect ratio); this
 *  component just fills it.
 */

import { useEffect, useId, useRef, useState } from "react";
import { getLook } from "../data/catalog";
import { FULL_BOX } from "../data/crops";
import type { CropBox, Credit as CreditData } from "../data/types";
import {
  authorUrl,
  commonsThumb,
  frameViewBox,
  imageSrc,
  imageSrcSet,
  isLegacyCredit,
  isLegacyImage,
  photoUrl,
  pickThumbWidth,
} from "../lib/imageUrl";

interface PhotoProps {
  /** A runway look id, or an old Unsplash id ("photo-…"). */
  image: string;
  /** The part of the look's frame to show, in % ([left, top, right, bottom]). Default: all of it. */
  crop?: CropBox;
  /** Describes the photo for screen readers (also shown if the image fails). */
  alt: string;
  /** Roughly how wide the frame is on screen, in CSS pixels (picks the file size). */
  px?: number;
  /** Load immediately (use for the one big hero image on a screen). */
  eager?: boolean;
  /**
   * When the frame's shape differs from the crop's, which part to keep:
   * "center" (default) or "top" (keeps heads in frame for wide hero panels).
   */
  anchor?: "center" | "top";
  className?: string;
  /** Legacy Unsplash photos only: CSS object-position, e.g. "50% 30%". */
  focus?: string;
  /** Legacy Unsplash photos only: `sizes` hint for the srcset. */
  sizes?: string;
  /** Legacy Unsplash photos only: widths to offer in the srcset. */
  widths?: number[];
}

/** A cropped, lazy-loaded, fail-safe image that fills its container. */
export function Photo(props: PhotoProps) {
  return isLegacyImage(props.image) ? <LegacyPhoto {...props} /> : <PlatePhoto {...props} />;
}

/** True once `ref`'s element is near the viewport (or immediately if `eager`). */
function useNearViewport(ref: React.RefObject<HTMLElement | null>, eager: boolean): boolean {
  const [near, setNear] = useState(eager);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, ref]);
  return near;
}

function PlatePhoto({ image, crop = FULL_BOX, alt, px = 300, eager = false, anchor = "center", className = "" }: PhotoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref, eager);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const look = getLook(image);
  // A filter id that is safe inside url(#…) (React's ids contain punctuation).
  const blurId = `blur-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (failed || !look) {
    return (
      <div className={`photo photo-fallback ${className}`} role="img" aria-label={alt}>
        <span>{alt}</span>
      </div>
    );
  }

  const { photo } = look;
  const { viewBox, cropWidthPx } = frameViewBox(photo, look.frame, crop);
  // The crop shows `cropWidthPx` of the original's pixels across a card `px`
  // wide. On a sharp (2×) screen we need `2 × px` real pixels across the crop,
  // so the whole photo must be `2 × px × (original width ÷ cropWidthPx)` wide.
  const width = pickThumbWidth((2 * px * photo.width) / Math.max(1, cropWidthPx), photo.width);

  // Narrow photos: the 2:3 frame pokes out past the photo's sides. Fill that
  // margin with a soft, blurred copy of the same photo (no hard bands). The
  // copy uses the very same file as the photo itself, so the browser
  // downloads it once, not twice.
  const [fl, ft, fw, fh] = look.frame;
  const overhang = fl < -0.002 || fl + fw > 1.002;
  const src = commonsThumb(photo, width);

  return (
    <div ref={ref} className={`photo photo-plate ${loaded ? "is-loaded" : ""} ${className}`} role="img" aria-label={alt}>
      <svg viewBox={viewBox} preserveAspectRatio={anchor === "top" ? "xMidYMin slice" : "xMidYMid slice"} aria-hidden="true" focusable="false">
        {near && overhang && (
          <>
            <defs>
              <filter id={blurId}>
                <feGaussianBlur stdDeviation={photo.width * 0.03} />
              </filter>
            </defs>
            <image
              href={src}
              x={fl * photo.width}
              y={ft * photo.height}
              width={fw * photo.width}
              height={fh * photo.height}
              preserveAspectRatio="xMidYMid slice"
              filter={`url(#${blurId})`}
              opacity={0.85}
            />
          </>
        )}
        {near && (
          <image
            href={src}
            width={photo.width}
            height={photo.height}
            preserveAspectRatio="none"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </svg>
    </div>
  );
}

function LegacyPhoto({ image, alt, focus = "50% 30%", sizes = "(max-width: 760px) 70vw, 380px", widths, eager = false, className = "" }: PhotoProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`photo photo-fallback ${className}`} role="img" aria-label={alt}>
        <span>{alt}</span>
      </div>
    );
  }
  return (
    <div className={`photo ${className}`}>
      <img
        src={imageSrc(image, 600)}
        srcSet={imageSrcSet(image, widths)}
        sizes={sizes}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        style={{ objectPosition: focus }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * The photo credit. For our Creative Commons photos:
 *     Photo: Christopher Macsurak · CC BY 2.0 · cropped
 * (author → the file's Commons page, licence → the licence text).
 * Outfits saved before the runway catalog show the old Unsplash credit.
 */
export function Credit({ credit, className = "" }: { credit: CreditData; className?: string }) {
  if (isLegacyCredit(credit)) {
    return (
      <span className={`credit ${className}`}>
        <a href={photoUrl(credit)} target="_blank" rel="noreferrer noopener">
          Photo
        </a>{" "}
        by{" "}
        <a href={authorUrl(credit)} target="_blank" rel="noreferrer noopener">
          {credit.by}
        </a>{" "}
        on Unsplash
      </span>
    );
  }
  return (
    <span className={`credit ${className}`} title={credit.title}>
      Photo:{" "}
      <a href={credit.source} target="_blank" rel="noreferrer noopener">
        {credit.author}
      </a>{" "}
      ·{" "}
      <a href={credit.licenseUrl} target="_blank" rel="noreferrer noopener">
        {credit.license}
      </a>{" "}
      · cropped
    </span>
  );
}
