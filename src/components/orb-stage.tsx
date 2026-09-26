"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { ReactorCage, ReactorHeart, type OrbMode } from "@/components/reactor";
import {
  dragOrbit,
  pinchZoom,
  poseTransform,
  restPose,
  stepZoom,
  wheelZoom,
  type OrbPose,
} from "@/lib/orb-rig";

type Point = { x: number; y: number };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function OrbStage({ mode, brainTag }: { mode: OrbMode; brainTag: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
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
          aria-label="Dynamic orb. Drag to turn. Scroll or pinch to zoom."
          onKeyDown={onKeyDown}
        >
          <div ref={spinRef} className="orb-rig-spin">
            <ReactorCage mode={mode} />
          </div>
          <ReactorHeart mode={mode} />
        </div>
      </div>
      <div className="jarvis-caption">
        <p className="jarvis-badge-title">J.A.R.V.I.S.</p>
        <p className="jarvis-badge-online">
          <span className="jarvis-badge-dot" /> Online
        </p>
        <p className="jarvis-badge-model">{brainTag}</p>
      </div>
    </div>
  );
}
