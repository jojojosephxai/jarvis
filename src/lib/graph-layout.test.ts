import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  frameAroundPoints,
  grabDelta,
  labelEligible,
  layoutGalaxy,
  meanDistance,
  pickLabels,
  projectSpace,
  restCamera,
  shiftFrame,
} from "./graph-layout";

const CANVAS = { width: 2400, height: 1600 };

describe("layoutGalaxy", () => {
  const nodes = [
    { id: "folder:", kind: "folder" as const },
    { id: "About.md", kind: "note" as const },
    { id: "School.md", kind: "note" as const },
    { id: "Goals.md", kind: "note" as const },
  ];
  const edges = [
    { from: "About.md", to: "folder:" },
    { from: "School.md", to: "folder:" },
    { from: "Goals.md", to: "folder:" },
  ];

  it("places the same notes in the same spots every time", () => {
    const first = layoutGalaxy(nodes, edges, { repel: 120, link: 140, ...CANVAS });
    const second = layoutGalaxy(nodes, edges, { repel: 120, link: 140, ...CANVAS });
    assert.deepEqual(first, second);
    assert.equal(first.length, nodes.length);
  });

  it("pushes notes farther apart when repel is higher", () => {
    const tight = meanDistance(layoutGalaxy(nodes, edges, { repel: 40, link: 120, ...CANVAS }));
    const wide = meanDistance(layoutGalaxy(nodes, edges, { repel: 220, link: 120, ...CANVAS }));
    assert.equal(wide > tight, true);
  });

  it("stretches a link when the link length is longer", () => {
    const pair = [
      { id: "a", kind: "note" as const },
      { id: "b", kind: "note" as const },
    ];
    const link = [{ from: "a", to: "b" }];
    const short = layoutGalaxy(pair, link, { repel: 50, link: 80, ...CANVAS });
    const long = layoutGalaxy(pair, link, { repel: 50, link: 280, ...CANVAS });
    assert.equal(meanDistance(long) > meanDistance(short), true);
  });
});

describe("depth", () => {
  it("spreads notes through space, not one flat plane", () => {
    const placed = layoutGalaxy(
      [
        { id: "folder:", kind: "folder" },
        { id: "About.md", kind: "note" },
        { id: "School.md", kind: "note" },
        { id: "Goals.md", kind: "note" },
      ],
      [
        { from: "About.md", to: "folder:" },
        { from: "School.md", to: "folder:" },
        { from: "Goals.md", to: "folder:" },
      ],
      { repel: 120, link: 140, ...CANVAS },
    );
    const zs = placed.map((point) => point.z);
    const spread = Math.max(...zs) - Math.min(...zs);
    assert.equal(spread > 20, true);
  });

  it("turns a point when the camera yaws", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const still = projectSpace({ x: 80, y: 0, z: 0 }, { yaw: 0, pitch: 0.4 }, origin, 100);
    const turned = projectSpace({ x: 80, y: 0, z: 0 }, { yaw: 0.8, pitch: 0.4 }, origin, 100);
    assert.equal(Math.abs(turned.x - still.x) > 5, true);
  });

  it("rests the camera so time does not drift it", () => {
    const first = restCamera();
    const second = restCamera();
    assert.deepEqual(first, second);
    assert.equal(first.yaw, 0.72);
    assert.equal(first.pitch, 0.52);
  });
});

describe("graph labels", () => {
  it("keeps a hub when it collides with a note", () => {
    const placed = pickLabels([
      { id: "note", x: 0, y: 0, w: 40, h: 16, depth: 0.8, priority: 10, protected: false },
      { id: "hub", x: 4, y: 0, w: 40, h: 16, depth: 0.5, priority: 80, protected: true },
    ]);
    assert.deepEqual(
      placed.map((label) => label.id),
      ["hub"],
    );
    assert.equal(placed[0]?.opacity, 1);
  });

  it("keeps overlapping hubs", () => {
    const placed = pickLabels([
      { id: "hub-a", x: 0, y: 0, w: 30, h: 14, depth: 0.2, priority: 80, protected: true },
      { id: "hub-b", x: 2, y: 1, w: 30, h: 14, depth: 0.2, priority: 80, protected: true },
    ]);
    assert.deepEqual(
      placed.map((label) => label.id).sort(),
      ["hub-a", "hub-b"],
    );
  });

  it("drops a far quiet note and shows more titles when zoomed in", () => {
    const placed = pickLabels([
      { id: "far", x: 0, y: 0, w: 20, h: 12, depth: 0.1, priority: 10, protected: false },
    ]);
    assert.equal(placed.length, 0);
    const quiet = {
      selected: false,
      hover: false,
      hub: false,
      onPath: false,
      neighbor: false,
      folder: false,
      match: false,
      depth: 0.7,
    };
    assert.equal(labelEligible(quiet, 1, false), false);
    assert.equal(labelEligible(quiet, 1.4, false), true);
    assert.equal(labelEligible({ ...quiet, hub: true, depth: 0.1 }, 1, false), true);
  });
});

describe("grab the space", () => {
  it("slides the frame with the pointer", () => {
    const frame = { x: 100, y: 80, w: 200, h: 100 };
    const delta = grabDelta(20, -10, frame, 200, 100);
    assert.equal(delta.x, 20);
    assert.equal(delta.y, -10);
    const shifted = shiftFrame(frame, delta);
    assert.equal(shifted.x, 80);
    assert.equal(shifted.y, 90);
    assert.equal(shifted.w, 200);
    assert.equal(shifted.h, 100);
  });

  it("stays 1:1 when the screen is letterboxed", () => {
    const delta = grabDelta(10, 0, { x: 0, y: 0, w: 100, h: 100 }, 200, 400);
    assert.equal(delta.x, 5);
    assert.equal(delta.y, 0);
  });
});

describe("frameAroundPoints", () => {
  it("pads the notes so labels have room", () => {
    const frame = frameAroundPoints(
      [
        { x: 100, y: 80 },
        { x: 160, y: 140 },
      ],
      20,
      10,
    );
    assert.equal(frame.x, 80);
    assert.equal(frame.y, 70);
    assert.equal(frame.w, 120);
    assert.equal(frame.h, 90);
  });
});
