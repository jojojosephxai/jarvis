import assert from "node:assert/strict";
import test from "node:test";

import {
  ORB_PITCH_MAX,
  ORB_ZOOM_MAX,
  ORB_ZOOM_MIN,
  dragOrbit,
  pinchZoom,
  restPose,
  stepZoom,
  wheelZoom,
} from "./orb-rig";

test("drag turns the orb and keeps the tilt in range", () => {
  const start = restPose();
  const turned = dragOrbit(start, 40, -20);
  assert.ok(turned.yaw > start.yaw);
  assert.ok(turned.pitch > start.pitch);
  assert.equal(turned.zoom, start.zoom);

  const capped = dragOrbit(start, 0, -4000);
  assert.equal(capped.pitch, ORB_PITCH_MAX);
});

test("wheel and pinch zoom in and out inside the limits", () => {
  const start = restPose().zoom;
  assert.ok(wheelZoom(start, -40) > start);
  assert.ok(wheelZoom(start, 40) < start);
  assert.equal(wheelZoom(start, 0), start);
  assert.equal(pinchZoom(start, 100, 200), 2);
  assert.equal(pinchZoom(0.6, 10, 1), ORB_ZOOM_MIN);
  assert.equal(stepZoom(ORB_ZOOM_MAX, "in"), ORB_ZOOM_MAX);
  assert.ok(stepZoom(start, "out") < start);
});
