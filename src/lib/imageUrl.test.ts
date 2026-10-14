/**
 * Tests for the photo address & crop maths (lib/imageUrl.ts).
 * Runway photos are hot-linked from Wikimedia, which only serves a few
 * standard thumbnail widths — these tests pin that behaviour down.
 */
import { describe, expect, it } from "vitest";
import { commonsThumb, frameViewBox, pickThumbWidth, THUMB_WIDTHS } from "./imageUrl";

const photo = { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/{w}px-X.jpg", width: 2000, height: 3000 };

describe("pickThumbWidth", () => {
  it("only ever asks for Wikimedia's standard widths", () => {
    for (const need of [1, 200, 400, 700, 1000, 1500, 5000]) {
      expect(THUMB_WIDTHS).toContain(pickThumbWidth(need, 4000));
    }
  });

  it("picks the smallest width that is big enough", () => {
    expect(pickThumbWidth(400, 4000)).toBe(500);
    expect(pickThumbWidth(961, 4000)).toBe(1280);
  });

  it("never asks for a thumbnail wider than the original", () => {
    expect(pickThumbWidth(5000, 1000)).toBe(960);
    expect(pickThumbWidth(5000, 700)).toBe(500);
  });
});

describe("commonsThumb", () => {
  it("fills in the width", () => {
    expect(commonsThumb(photo, 960)).toBe("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/960px-X.jpg");
  });
});

describe("frameViewBox", () => {
  it("shows the whole frame for the full crop", () => {
    const { viewBox } = frameViewBox(photo, [0.1, 0.2, 0.5, 0.5], [0, 0, 100, 100]);
    expect(viewBox).toBe("200 600 1000 1500");
  });

  it("crops a garment inside the frame", () => {
    // bottom half of the frame, middle 50% of its width
    const { viewBox, cropWidthPx } = frameViewBox(photo, [0.1, 0.2, 0.5, 0.5], [25, 50, 75, 100]);
    expect(viewBox).toBe("450 1350 500 750");
    expect(cropWidthPx).toBe(500);
  });

  it("allows a frame that overhangs a narrow photo", () => {
    const { viewBox } = frameViewBox(photo, [-0.1, 0, 1.2, 1], [0, 0, 100, 100]);
    expect(viewBox).toBe("-200 0 2400 3000");
  });
});
