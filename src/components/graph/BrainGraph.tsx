"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GraphDensity } from "@/lib/commands";
import { folderColor, type Note } from "@/lib/notes";

type BrainGraphProps = {
  notes: readonly Note[];
  density: GraphDensity;
  accent: string;
  selectedId: string | null;
  focusId: string | null;
  focusTick: number;
  onFly: (id: string) => void;
  onOpen: (id: string) => void;
  onInspect: (id: string, x: number, y: number) => void;
  onClear: () => void;
  onReady: () => void;
  onError: (message: string) => void;
};

type Point = { id: string; x: number; y: number; z: number };

const SPREAD: Record<GraphDensity, number> = {
  dense: 1,
  denser: 0.58,
  loose: 1.75,
};

export function BrainGraph({
  notes,
  density,
  accent,
  selectedId,
  focusId,
  focusTick,
  onFly,
  onOpen,
  onInspect,
  onClear,
  onReady,
  onError,
}: BrainGraphProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef(selectedId);
  const focusRef = useRef(focusId);
  const focusTickRef = useRef(focusTick);
  const onFlyRef = useRef(onFly);
  const onOpenRef = useRef(onOpen);
  const onInspectRef = useRef(onInspect);
  const onClearRef = useRef(onClear);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    selectedRef.current = selectedId;
    focusRef.current = focusId;
    focusTickRef.current = focusTick;
    onFlyRef.current = onFly;
    onOpenRef.current = onOpen;
    onInspectRef.current = onInspect;
    onClearRef.current = onClear;
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    if (notes.length === 0) {
      onErrorRef.current("There are no notes in the notes folder, sir.");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onErrorRef.current("The graph could not start on this screen, sir.");
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    camera.position.set(0, 0, density === "loose" ? 78 : density === "denser" ? 36 : 52);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const points = layoutNotes(notes, SPREAD[density]);
    const pointById = new Map(points.map((point) => [point.id, point]));
    const group = new THREE.Group();
    scene.add(group);

    const starPositions = new Float32Array(450 * 3);
    for (let index = 0; index < starPositions.length; index += 1) {
      starPositions[index] = (Math.random() - 0.5) * 180;
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPositions, 3)),
      new THREE.PointsMaterial({ color: 0x8fb4c8, size: 0.18, transparent: true, opacity: 0.7 }),
    );
    scene.add(stars);

    const geometry = new THREE.IcosahedronGeometry(0.72, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const mesh = new THREE.InstancedMesh(geometry, material, notes.length);
    const dummy = new THREE.Object3D();
    const baseColor = new THREE.Color();
    notes.forEach((note, index) => {
      const point = points[index];
      if (!point) {
        return;
      }
      const scale = (0.55 + Math.min(note.links.length, 8) * 0.12) * (density === "denser" ? 0.82 : 1);
      dummy.position.set(point.x, point.y, point.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      baseColor.set(folderColor(note.folder));
      mesh.setColorAt(index, baseColor);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);

    const linkPositions: number[] = [];
    const seen = new Set<string>();
    for (const note of notes) {
      const start = pointById.get(note.id);
      if (!start) {
        continue;
      }
      for (const link of note.links) {
        const key = note.id < link ? `${note.id}:${link}` : `${link}:${note.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const end = pointById.get(link);
        if (!end) {
          continue;
        }
        linkPositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
      }
    }
    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linkPositions, 3));
    const links = new THREE.LineSegments(
      linkGeometry,
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.35 }),
    );
    group.add(links);

    const labels = new Map<string, THREE.Sprite>();
    for (const note of notes) {
      const point = pointById.get(note.id);
      if (!point) {
        continue;
      }
      const sprite = makeLabel(note.title, folderColor(note.folder));
      sprite.position.set(point.x, point.y + 1.4, point.z);
      labels.set(note.id, sprite);
      group.add(sprite);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const panTarget = new THREE.Vector3();
    let frame = 0;
    let pressed = false;
    let dragged = false;
    let pointerButton = 0;
    let lastX = 0;
    let lastY = 0;
    let seenFocus: string | null = null;
    let seenTick = -1;
    let focusFrames = 0;
    let paintedSelection: string | null = null;
    let clickTimer = 0;
    let openedAt = 0;
    let lastClickAt = 0;
    let lastClickId: string | null = null;

    const paint = (activeId: string | null) => {
      const active = activeId ? notes.find((note) => note.id === activeId) : null;
      const lit = new Set<string>();
      if (active) {
        lit.add(active.id);
        for (const link of active.links) {
          lit.add(link);
        }
      }
      notes.forEach((note, index) => {
        const color = new THREE.Color(folderColor(note.folder));
        if (active && !lit.has(note.id)) {
          color.multiplyScalar(0.12);
        }
        if (note.id === activeId) {
          color.set(accent);
        }
        mesh.setColorAt(index, color);
      });
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
      const linkMaterial = links.material;
      if (linkMaterial instanceof THREE.LineBasicMaterial) {
        linkMaterial.opacity = active ? 0.2 : 0.38;
        linkMaterial.color.set(accent);
      }
      for (const [id, sprite] of labels) {
        const note = notes.find((item) => item.id === id);
        sprite.visible = !active || lit.has(id) || (note ? note.links.length >= 5 : false);
      }
    };

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const onPointerDown = (event: PointerEvent) => {
      pressed = true;
      pointerButton = event.button;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const noteAt = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const instanceId = raycaster.intersectObject(mesh)[0]?.instanceId;
      if (instanceId === undefined) {
        return null;
      }
      return notes[instanceId] ?? null;
    };
    const openNote = (id: string) => {
      const now = performance.now();
      if (now - openedAt < 450) {
        return;
      }
      openedAt = now;
      window.clearTimeout(clickTimer);
      onOpenRef.current(id);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pressed) {
        return;
      }
      const moved = Math.abs(event.clientX - lastX) + Math.abs(event.clientY - lastY);
      pressed = false;
      dragged = moved > 6;
      if (dragged || pointerButton !== 2) {
        return;
      }
      const note = noteAt(event);
      if (!note) {
        onClearRef.current();
        return;
      }
      onInspectRef.current(note.id, event.clientX, event.clientY);
    };
    const onClick = (event: MouseEvent) => {
      if (dragged || event.button !== 0) {
        dragged = false;
        return;
      }
      const note = noteAt(event);
      if (!note) {
        onClearRef.current();
        return;
      }
      const now = performance.now();
      if (lastClickId === note.id && now - lastClickAt < 450) {
        lastClickAt = 0;
        lastClickId = null;
        openNote(note.id);
        return;
      }
      lastClickAt = now;
      lastClickId = note.id;
      window.clearTimeout(clickTimer);
      clickTimer = window.setTimeout(() => {
        onFlyRef.current(note.id);
      }, 280);
    };
    const onDoubleClick = (event: MouseEvent) => {
      const note = noteAt(event);
      if (!note) {
        return;
      }
      openNote(note.id);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pressed) {
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      const orbit = pointerButton === 2 || event.shiftKey;
      if (orbit) {
        group.rotation.y += dx * 0.005;
        group.rotation.x = Math.max(-0.7, Math.min(0.7, group.rotation.x + dy * 0.003));
        return;
      }
      const scale = camera.position.z * 0.0022;
      group.position.x += dx * scale;
      group.position.y -= dy * scale;
      focusFrames = 0;
    };
    const onContextMenu = (event: Event) => {
      event.preventDefault();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.z = Math.min(96, Math.max(16, camera.position.z + event.deltaY * 0.04));
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      if (!reduceMotion && !pressed) {
        group.rotation.y += 0.00045;
      }
      const currentSelection = selectedRef.current;
      if (currentSelection !== paintedSelection) {
        paintedSelection = currentSelection;
        paint(currentSelection);
      }
      const nextFocus = focusRef.current;
      const nextTick = focusTickRef.current;
      if (nextFocus !== seenFocus || nextTick !== seenTick) {
        seenFocus = nextFocus;
        seenTick = nextTick;
        const point = nextFocus ? pointById.get(nextFocus) : null;
        if (point) {
          panTarget.set(-point.x, -point.y, -point.z);
          focusFrames = 36;
        }
      }
      if (focusFrames > 0) {
        group.position.lerp(panTarget, 0.16);
        focusFrames -= 1;
      }
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    paint(selectedRef.current);
    paintedSelection = selectedRef.current;
    tick();
    onReadyRef.current();

    return () => {
      window.clearTimeout(clickTimer);
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("wheel", onWheel);
      geometry.dispose();
      material.dispose();
      linkGeometry.dispose();
      if (links.material instanceof THREE.Material) {
        links.material.dispose();
      }
      stars.geometry.dispose();
      if (stars.material instanceof THREE.Material) {
        stars.material.dispose();
      }
      for (const sprite of labels.values()) {
        const spriteMaterial = sprite.material;
        if (spriteMaterial instanceof THREE.SpriteMaterial) {
          spriteMaterial.map?.dispose();
          spriteMaterial.dispose();
        }
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [accent, density, notes]);

  return (
    <div
      ref={hostRef}
      data-graph-density={density}
      data-node-count={notes.length}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      aria-label="Note graph"
    />
  );
}

function layoutNotes(notes: readonly Note[], spread: number): Point[] {
  const folderIndex: Record<Note["folder"], number> = {
    Today: 0,
    School: 1,
    Projects: 2,
    People: 3,
    Lab: 4,
  };
  const points: Point[] = notes.map((note, index) => {
    const angle = index * 2.399;
    const folder = folderIndex[note.folder];
    const ring = (20 + folder * 5.4) * spread;
    return {
      id: note.id,
      x: Math.cos(angle) * ring,
      y: (Math.sin(angle * 1.7) * 8 + (folder - 2) * 3) * spread,
      z: Math.sin(angle) * ring * 0.72,
    };
  });
  const byId = new Map(points.map((point) => [point.id, point]));
    const minRadius = 14 * spread;
    for (let step = 0; step < 70; step += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        if (!a || !b) {
          continue;
        }
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
        const push = Math.min(1.4, (6 * spread) / (dist * dist));
        const limit = 48 * spread;
        a.x = clamp(a.x + (dx / dist) * push, limit);
        a.y = clamp(a.y + (dy / dist) * push, limit);
        a.z = clamp(a.z + (dz / dist) * push, limit);
        b.x = clamp(b.x - (dx / dist) * push, limit);
        b.y = clamp(b.y - (dy / dist) * push, limit);
        b.z = clamp(b.z - (dz / dist) * push, limit);
      }
    }
    for (const note of notes) {
      const a = byId.get(note.id);
      if (!a) {
        continue;
      }
      for (const link of note.links) {
        const b = byId.get(link);
        if (!b || note.id > link) {
          continue;
        }
        a.x += (b.x - a.x) * 0.015;
        a.y += (b.y - a.y) * 0.015;
        a.z += (b.z - a.z) * 0.015;
        b.x -= (b.x - a.x) * 0.015;
        b.y -= (b.y - a.y) * 0.015;
        b.z -= (b.z - a.z) * 0.015;
      }
    }
    for (const point of points) {
      const radial = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z) || 0.01;
      if (radial < minRadius) {
        point.x *= minRadius / radial;
        point.y *= minRadius / radial;
        point.z *= minRadius / radial;
      }
    }
  }
  return points;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.font = "28px monospace";
    context.fillText(text, 8, 42);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(9.6, 1.2, 1);
  return sprite;
}
