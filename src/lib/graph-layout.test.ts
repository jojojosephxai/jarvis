import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { frameAroundPoints, layoutGalaxy, meanDistance } from "./graph-layout";

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
