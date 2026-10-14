/**
 * Tests for the card-stack geometry on the look board (deckLayout.ts).
 */
import { describe, expect, it } from "vitest";
import { cardSize, fanPose, LIFT, stackPose } from "./deckLayout";

describe("the stacked pile", () => {
  it("keeps the top card in front and each lower card peeking out", () => {
    const top = stackPose(0, 5);
    const next = stackPose(1, 5);
    expect(top.z).toBeGreaterThan(next.z);
    expect(next.x).toBeGreaterThan(top.x);
    expect(next.y).toBeGreaterThan(top.y);
  });

  it("turns cards different ways so the pile looks hand-stacked", () => {
    const turns = [0, 1, 2, 3].map((i) => Math.sign(stackPose(i, 4).rotate));
    expect(new Set(turns).size).toBe(2);
  });
});

describe("the fan", () => {
  it("spreads cards left to right, symmetric around the middle", () => {
    const poses = [0, 1, 2, 3, 4].map((i) => fanPose(i, 5, 900, 240, null));
    for (let i = 1; i < poses.length; i++) expect(poses[i].x).toBeGreaterThan(poses[i - 1].x);
    expect(poses[0].x).toBe(-poses[4].x);
    expect(poses[2].x).toBe(0);
    expect(poses[0].rotate).toBeLessThan(0);
    expect(poses[4].rotate).toBeGreaterThan(0);
    expect(poses[0].y).toBeGreaterThan(poses[2].y); // an arc: the ends sit lower
  });

  it("lifts the picked card and brings it to the front", () => {
    const picked = fanPose(1, 5, 900, 240, 1);
    const plain = fanPose(1, 5, 900, 240, null);
    expect(picked.y).toBe(plain.y - LIFT);
    expect(picked.z).toBeGreaterThan(fanPose(2, 5, 900, 240, 1).z);
    expect(picked.scale).toBeGreaterThan(1);
  });

  it("nudges the neighbours aside", () => {
    expect(fanPose(2, 5, 900, 240, 1).x).toBeGreaterThan(fanPose(2, 5, 900, 240, null).x);
    expect(fanPose(0, 5, 900, 240, 1).x).toBeLessThan(fanPose(0, 5, 900, 240, null).x);
  });

  it("fits a narrow phone by overlapping more", () => {
    const wide = fanPose(4, 5, 1000, 200, null).x - fanPose(0, 5, 1000, 200, null).x;
    const narrow = fanPose(4, 5, 360, 150, null).x - fanPose(0, 5, 360, 150, null).x;
    expect(narrow).toBeLessThan(wide);
  });

  it("handles a single card", () => {
    expect(fanPose(0, 1, 500, 200, null)).toMatchObject({ x: 0, rotate: 0 });
  });
});

describe("card size", () => {
  it("is 3:4 and stays within sensible bounds", () => {
    const { w, h } = cardSize(600);
    expect(h).toBe(Math.round((w * 4) / 3));
    expect(cardSize(10000).w).toBe(280);
    expect(cardSize(100).w).toBe(150);
  });
});
