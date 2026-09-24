"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { orbLabel, Reactor, type OrbMode } from "@/components/reactor";
import {
  dragOrbit,
  pinchZoom,
  poseTransform,
  restPose,
  stepZoom,
  wheelZoom,
  zoomLabel,
  type OrbPose,
} from "@/lib/orb-rig";

type Point = { x: number; y: number };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function OrbStage({ mode }: { mode: OrbMode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLSpanElement>(null);
  const poseRef = useRef<OrbPose>(restPose());
  const paintRef = useRef<(pose: OrbPose) => void>(() => {});
  const pointers = useRef(new Map<number, Point>());
  const dragRef = useRef<Point | null>(null);
  const pinchRef = useRef<{ zoom: number; distance: number } | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const paint = (pose: OrbPose) => {
      poseRef.current = pose;
      if (spinRef.current) spinRef.current.style.transform = poseTransform(pose);
      if (zoomRef.current) zoomRef.current.textContent = zoomLabel(pose.zoom);
    };
    paintRef.current = paint;
    paint(poseRef.current);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const pose = poseRef.current;
      paint({ ...pose, zoom: wheelZoom(pose.zoom, event.deltaY) });
    };

    const onPointerDown = (event: PointerEvent) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size >= 2) {
        const [first, second] = [...pointers.current.values()];
        if (first && second) {
          pinchRef.current = { zoom: poseRef.current.zoom, distance: distance(first, second) };
        }
        dragRef.current = null;
      } else {
        dragRef.current = { x: event.clientX, y: event.clientY };
        pinchRef.current = null;
      }
      try {
        frame.setPointerCapture(event.pointerId);
      } catch {
        // Drag still tracks while the pointer stays on the orb.
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size >= 2 && pinchRef.current) {
        const [first, second] = [...pointers.current.values()];
        if (!first || !second) return;
        const pose = poseRef.current;
        paint({
          ...pose,
          zoom: pinchZoom(pinchRef.current.zoom, pinchRef.current.distance, distance(first, second)),
        });
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      paint(dragOrbit(poseRef.current, event.clientX - drag.x, event.clientY - drag.y));
      dragRef.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerEnd = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId);
      if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
      if (pointers.current.size < 2) pinchRef.current = null;
      if (pointers.current.size === 1) {
        const only = [...pointers.current.values()][0];
        dragRef.current = only ? { x: only.x, y: only.y } : null;
        return;
      }
      dragRef.current = null;
    };

    frame.addEventListener("wheel", onWheel, { passive: false });
    frame.addEventListener("pointerdown", onPointerDown);
    frame.addEventListener("pointermove", onPointerMove);
    frame.addEventListener("pointerup", onPointerEnd);
    frame.addEventListener("pointercancel", onPointerEnd);
    return () => {
      frame.removeEventListener("wheel", onWheel);
      frame.removeEventListener("pointerdown", onPointerDown);
      frame.removeEventListener("pointermove", onPointerMove);
      frame.removeEventListener("pointerup", onPointerEnd);
      frame.removeEventListener("pointercancel", onPointerEnd);
    };
  }, []);

  function apply(next: OrbPose) {
    paintRef.current(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const pose = poseRef.current;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        apply(dragOrbit(pose, -28, 0));
        return;
      case "ArrowRight":
        event.preventDefault();
        apply(dragOrbit(pose, 28, 0));
        return;
      case "ArrowUp":
        event.preventDefault();
        apply(dragOrbit(pose, 0, -22));
        return;
      case "ArrowDown":
        event.preventDefault();
        apply(dragOrbit(pose, 0, 22));
        return;
      case "+":
      case "=":
        event.preventDefault();
        apply({ ...pose, zoom: stepZoom(pose.zoom, "in") });
        return;
      case "-":
      case "_":
        event.preventDefault();
        apply({ ...pose, zoom: stepZoom(pose.zoom, "out") });
        return;
      case "0":
      case "Home":
        event.preventDefault();
        apply(restPose());
        return;
      default:
        return;
    }
  }

  function zoomBy(direction: "in" | "out") {
    const pose = poseRef.current;
    apply({ ...pose, zoom: stepZoom(pose.zoom, direction) });
  }

  return (
    <div className="stage-orb">
      <div className="optic-frame">
        <span className="tick tick-tl" />
        <span className="tick tick-tr" />
        <span className="tick tick-bl" />
        <span className="tick tick-br" />
        <div
          ref={frameRef}
          className="orb-rig"
          role="application"
          tabIndex={0}
          aria-label="Dynamic orb. Drag to turn. Scroll, pinch, or use the zoom buttons."
          onKeyDown={onKeyDown}
        >
          <div ref={spinRef} className="orb-rig-spin">
            <Reactor mode={mode} />
          </div>
        </div>
      </div>
      <div className="orb-dock">
        <p className="orb-state">{orbLabel(mode)}</p>
        <div className="orb-controls">
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy("out")}>
            −
          </button>
          <span ref={zoomRef} className="orb-zoom-readout">
            {zoomLabel(restPose().zoom)}
          </span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy("in")}>
            +
          </button>
          <button type="button" aria-label="Reset orb view" onClick={() => apply(restPose())}>
            Reset
          </button>
        </div>
      </div>
      <p className="orb-hint">Drag to turn · scroll or pinch to zoom</p>
    </div>
  );
}
