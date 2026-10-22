import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { edgePieces, rectIntersectsCircle, rectsIntersect } from "./graph-screen-layout";

import {
  easeFrame,
  frameAroundPoints,
  grabDelta,
  dropOverlappingLabels,
  labelEligible,
  layoutGalaxy,
  meanDistance,
  pickLabels,
  projectSpace,
  smallLabelFade,
  restCamera,
  shiftFrame,
} from "./graph-layout";

const CANVAS = { width: 2400, height: 1600 };

describe("desktop graph projection", () => {
  it("retains depth through orbit, centers hubs and loosens Jarvis", () => {
    const nodes = ["area:jarvis", "area:school"].flatMap(id => [
      { id, kind: "folder" as const },
      ...Array.from({ length: 40 }, (_, i) => ({ id: `${id}/${i}`, kind: "note" as const, hubId: id })),
    ]);
    const points = layoutGalaxy(nodes, [], { width: 1000, height: 640, repel: 180, link: 160 });
    assert.ok(Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z)) > 100);
    const radii = [];
    for (const id of ["area:jarvis", "area:school"]) {
      const hub = points.find(p => p.id === id)!;
      const members = points.filter(p => p.id.startsWith(`${id}/`));
      for (const axis of ["x", "y", "z"] as const) assert.ok(Math.abs(members.reduce((n, p) => n + p[axis], 0) / members.length - hub[axis]) < 1);
      radii.push(members.reduce((n, p) => n + Math.hypot(p.x - hub.x, p.y - hub.y, p.z - hub.z), 0) / members.length);
    }
    assert.ok(radii[0] > radii[1] * 1.1);
    const first = projectSpace(points[1], { yaw: 0, pitch: .3 }, { x: 500, y: 320, z: 0 }, 320);
    const turned = projectSpace(points[1], { yaw: .7, pitch: .3 }, { x: 500, y: 320, z: 0 }, 320);
    assert.notEqual(first.x, turned.x);
  });

  it("clips edges around label boxes, including vertical and parallel segments", () => {
    const box = { left: 40, right: 60, top: 40, bottom: 60 };
    assert.deepEqual(edgePieces({x: 0, y: 50}, {x: 100, y: 50}, [box]), [[0, .37], [.63, 1]]);
    assert.deepEqual(edgePieces({x: 50, y: 0}, {x: 50, y: 100}, [box]), [[0, .37], [.63, 1]]);
    assert.deepEqual(edgePieces({x: 0, y: 0}, {x: 100, y: 0}, [box]), [[0, 1]]);
    assert.deepEqual(edgePieces({x: 45, y: 45}, {x: 55, y: 55}, [box]), []);
  });

  it("detects a label over a neighboring sphere even when their labels are apart", () => {
    const label = { left: 100, top: 100, right: 190, bottom: 118 };
    assert.equal(rectIntersectsCircle(label, { x: 195, y: 108, r: 8 }), true);
    assert.equal(rectIntersectsCircle(label, { x: 200, y: 125, r: 8 }), false);
    assert.equal(rectsIntersect(label, { left: 130, top: 101, right: 170, bottom: 120 }), true);
  });
});

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

  it("keeps hubs in one short cluster", () => {
    const width = 1400;
    const height = 900;
    const placed = layoutGalaxy(
      [
        { id: "tag:school", kind: "folder" },
        { id: "tag:swim", kind: "folder" },
        { id: "tag:people", kind: "folder" },
        { id: "School.md", kind: "note", hubId: "tag:school" },
        { id: "Swim.md", kind: "note", hubId: "tag:swim" },
      ],
      [
        { from: "School.md", to: "tag:school" },
        { from: "Swim.md", to: "tag:swim" },
      ],
      { repel: 160, link: 180, width, height },
    );
    const byId = new Map(placed.map((point) => [point.id, point]));
    const hubs = ["tag:school", "tag:swim", "tag:people"].map((id) => byId.get(id));
    assert.equal(hubs.every(Boolean), true);
    const radii = hubs.flatMap((hub) => (hub ? [Math.hypot(hub.x - width / 2, hub.y - height / 2)] : []));
    const span = Math.min(width, height);
    assert.equal(Math.max(...radii) < span * 0.48, true);
    const schoolHubPoint = byId.get("tag:school");
    const swimHubPoint = byId.get("tag:swim");
    assert.ok(schoolHubPoint && swimHubPoint);
    assert.equal(Math.hypot(schoolHubPoint.x - swimHubPoint.x, schoolHubPoint.y - swimHubPoint.y) > 70, true);
    const school = byId.get("School.md");
    const schoolHub = byId.get("tag:school");
    const swimHub = byId.get("tag:swim");
    assert.ok(school && schoolHub && swimHub);
    const home = Math.hypot(school.x - schoolHub.x, school.y - schoolHub.y);
    const other = Math.hypot(school.x - swimHub.x, school.y - swimHub.y);
    assert.equal(home < 48, true);
    assert.equal(home < other, true);
  });

  it("parks a loose note on its hub instead of the corner", () => {
    const placed = layoutGalaxy(
      [
        { id: "area:school", kind: "folder" },
        { id: "Stray.md", kind: "note" },
      ],
      [
        { from: "Stray.md", to: "area:school" },
      ],
      { repel: 180, link: 160, width: 1000, height: 640 },
    );
    const stray = placed.find((point) => point.id === "Stray.md");
    const school = placed.find((point) => point.id === "area:school");
    assert.ok(stray && school);
    assert.equal(stray.x > 80 && stray.y > 80, true);
    assert.equal(Math.hypot(stray.x - school.x, stray.y - school.y) < 80, true);
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

  it("leaves room when a hub label sits on a source-of-truth label", () => {
    const placed = pickLabels([
      { id: "journal", x: 800, y: 290, w: 68, h: 18, depth: 0.8, priority: 80, protected: true },
      { id: "schedule", x: 820, y: 292, w: 136, h: 18, depth: 0.8, priority: 75, protected: true },
    ]);
    const journal = placed.find((label) => label.id === "journal");
    const schedule = placed.find((label) => label.id === "schedule");
    assert.ok(journal && schedule);
    assert.equal(Math.abs(journal.x - 800) <= 28 && Math.abs(journal.y - 290) <= 28, true);
    assert.equal(Math.abs(schedule.x - 820) <= 28 && Math.abs(schedule.y - 292) <= 28, true);
    assert.equal(Math.abs(journal.y - schedule.y) >= 20 || Math.abs(journal.x - schedule.x) >= 40, true);
  });

  it("hides a lower label that sits on the focused label", () => {
    const placed = pickLabels([
      { id: "school", x: 100, y: 100, w: 70, h: 20, depth: 1, priority: 100, protected: true },
      { id: "rules", x: 108, y: 100, w: 160, h: 20, depth: 1, priority: 55, protected: false },
      { id: "goals", x: 96, y: 102, w: 110, h: 20, depth: 1, priority: 40, protected: false },
    ]);
    assert.deepEqual(
      placed.map((label) => label.id),
      ["school"],
    );
  });

  it("keeps the hovered label when it overlaps the focus", () => {
    const placed = pickLabels([
      { id: "school", x: 0, y: 0, w: 80, h: 20, depth: 1, priority: 100, protected: true },
      { id: "hover", x: 6, y: 0, w: 80, h: 20, depth: 1, priority: 90, protected: true },
    ]);
    assert.deepEqual(
      placed.map((label) => label.id).sort(),
      ["hover", "school"],
    );
  });

  it("drops the lower on-screen label when the boxes overlap", () => {
    const kept = dropOverlappingLabels([
      { id: "school", priority: 100, left: 400, top: 300, right: 470, bottom: 320 },
      { id: "rules", priority: 55, left: 430, top: 304, right: 590, bottom: 324 },
      { id: "goals", priority: 40, left: 410, top: 308, right: 520, bottom: 328 },
      { id: "bell", priority: 55, left: 700, top: 400, right: 820, bottom: 420 },
    ]);
    assert.deepEqual(
      kept.map((label) => label.id).sort(),
      ["bell", "school"],
    );
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

  it("keeps hub labels on and shows note labels on hover, focus, or zoom", () => {
    const placed = pickLabels([
      { id: "far", x: 0, y: 0, w: 20, h: 12, depth: 0.1, priority: 10, protected: false },
    ]);
    assert.equal(placed.length, 1);
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
    assert.equal(labelEligible(quiet, 1.4, false), false);
    assert.equal(labelEligible(quiet, 1.7, false), true);
    assert.equal(labelEligible({ ...quiet, depth: 0.1 }, 1.4, false), false);
    assert.equal(labelEligible({ ...quiet, depth: 0.1 }, 1, true), false);
    assert.equal(labelEligible({ ...quiet, hover: true, depth: 0.1 }, 1, false), true);
    assert.equal(labelEligible({ ...quiet, selected: true, depth: 0.1 }, 1, false), true);
    assert.equal(labelEligible({ ...quiet, hub: true, depth: 0.1 }, 1, false), true);
    assert.equal(labelEligible({ ...quiet, big: true, depth: 0.1 }, 1, false), true);
    assert.equal(labelEligible({ ...quiet, ssot: true, depth: 0.8 }, 1, false), false);
  });

  it("fades small labels in as the camera moves closer", () => {
    assert.equal(smallLabelFade(1000, 1000), 0);
    assert.equal(smallLabelFade(200, 1000), 1);
    const mid = smallLabelFade(650, 1000);
    assert.equal(mid > 0 && mid < 1, true);
  });

  it("eases focus on cubic-bezier(.22, 1, .36, 1)", () => {
    assert.equal(easeFrame(0), 0);
    assert.equal(easeFrame(1), 1);
    assert.ok(easeFrame(0.5) > 0.5);
  });
});

describe("source of truth root", () => {
  it("keeps clusters apart without pinning a center note", () => {
    const placed = layoutGalaxy(
      [
        { id: "About.md", kind: "note", hubId: "area:people" },
        { id: "area:school", kind: "folder" },
        { id: "area:swim", kind: "folder" },
        { id: "area:people", kind: "folder" },
        { id: "Meet.md", kind: "note", hubId: "area:swim" },
      ],
      [
        { from: "About.md", to: "area:people" },
        { from: "Meet.md", to: "area:swim" },
      ],
      { repel: 160, link: 140, width: 1000, height: 640 },
    );
    const byId = new Map(placed.map((point) => [point.id, point]));
    const school = byId.get("area:school");
    const swim = byId.get("area:swim");
    const people = byId.get("area:people");
    const meet = byId.get("Meet.md");
    assert.ok(school && swim && people && meet);
    assert.equal(Math.hypot(school.x - swim.x, school.y - swim.y) > 60, true);
    assert.equal(Math.hypot(school.x - people.x, school.y - people.y) > 60, true);
    const meetDist = Math.hypot(meet.x - swim.x, meet.y - swim.y, meet.z - swim.z);
    const schoolDist = Math.hypot(meet.x - school.x, meet.y - school.y, meet.z - school.z);
    assert.equal(meetDist < schoolDist, true);
    assert.equal(placed.some((point) => point.id === "root:me"), false);
  });
});

describe("source of truth placement", () => {
  it("parks an ssot note beside its hub", () => {
    const placed = layoutGalaxy(
      [
        { id: "tag:school", kind: "folder" },
        { id: "School-schedule.md", kind: "note", anchorId: "tag:school" },
        { id: "Goals.md", kind: "note" },
      ],
      [
        { from: "School-schedule.md", to: "tag:school" },
        { from: "Goals.md", to: "tag:school" },
      ],
      { repel: 140, link: 180, width: 1400, height: 900 },
    );
    const byId = new Map(placed.map((point) => [point.id, point]));
    const hub = byId.get("tag:school");
    const ssot = byId.get("School-schedule.md");
    const other = byId.get("Goals.md");
    assert.ok(hub && ssot && other);
    const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    assert.equal(distance(ssot, hub) < 60, true);
    assert.equal(distance(ssot, hub) < distance(other, hub), true);
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
