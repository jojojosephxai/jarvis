import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { frameAtZoom, nextZoom, spinCamera, turnedCamera } from "./graph-turn";

describe("turn the graph", () => {
  it("yaws when the pointer moves sideways", () => {
    const turned = spinCamera({ yaw: 0.2, pitch: 0.4 }, 40, 0);
    assert.equal(turned.yaw > 0.2, true);
    assert.equal(turned.pitch, 0.4);
  });

  it("does not flip past a steep pitch", () => {
    const turned = spinCamera({ yaw: 0, pitch: 1.1 }, 0, -400);
    assert.equal(turned.pitch <= 1.15, true);
  });

  it("keeps a dragged turn on top of the slow spin", () => {
    const camera = turnedCamera({ yaw: 1, pitch: 0.2 }, { yaw: 0.5, pitch: 0.3 });
    assert.equal(camera.yaw, 1.5);
    assert.equal(camera.pitch, 0.5);
  });
});

describe("zoom the graph", () => {
  it("moves closer when the wheel rolls up", () => {
    const closer = nextZoom(1, -100);
    assert.equal(closer > 1, true);
    const farther = nextZoom(1, 100);
    assert.equal(farther < 1, true);
  });

  it("frames the same center when zooming in", () => {
    const frame = frameAtZoom({ x: 0, y: 0, w: 200, h: 100 }, 2);
    assert.equal(frame.w, 100);
    assert.equal(frame.h, 50);
    assert.equal(frame.x, 50);
    assert.equal(frame.y, 25);
  });
});
