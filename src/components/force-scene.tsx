"use client";

import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";

import { labelEligible, labelRank, pickLabels, type LayoutPoint } from "@/lib/graph-layout";
import { nodeColor, nodeDiameterPx, type GraphEdge, type GraphNode } from "@/lib/note-graph";

type ZoomKind = "fit" | "in" | "out";

const LINK = 0x49d4ff;

export function ForceScene({
  nodes,
  edges,
  points,
  visibleIds,
  selectedId,
  clusterId,
  route,
  showLabels,
  showEdges,
  focusKey,
  zoomToken,
  zoomKind,
  onSelect,
  onClear,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  points: LayoutPoint[];
  visibleIds: Set<string>;
  selectedId: string | null;
  clusterId: string | null;
  route: string[] | null;
  showLabels: boolean;
  showEdges: boolean;
  focusKey: string;
  zoomToken: number;
  zoomKind: ZoomKind;
  onSelect: (id: string, shift: boolean) => void;
  onClear: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    nodes,
    edges,
    points,
    visibleIds,
    selectedId,
    clusterId,
    route,
    showLabels,
    showEdges,
    onSelect,
    onClear,
  });
  useEffect(() => {
    stateRef.current = {
      nodes,
      edges,
      points,
      visibleIds,
      selectedId,
      clusterId,
      route,
      showLabels,
      showEdges,
      onSelect,
      onClear,
    };
  });

  const apiRef = useRef<{ fit: () => void; zoom: (kind: ZoomKind) => void; rebuild: () => void } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const labelHost = labelRef.current;
    if (!host || !labelHost) return;
    let dead = false;
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    void import("three").then((THREE) => {
      if (dead || !hostRef.current || !labelRef.current) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      host.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(46, 1, 1, 8000);
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const target = new THREE.Vector3();
      const sphere = new THREE.SphereGeometry(1, 14, 12);
      let group: THREE_NS.Group | null = null;
      const meshes: { mesh: THREE_NS.Mesh; id: string; baseScale: number }[] = [];
      let yaw = 0.62;
      let pitch = 0.38;
      let dist = 900;
      let fitDist = 900;
      let hoverId = "";
      let drag: { x: number; y: number; button: number; shift: boolean } | null = null;
      let moved = false;

      const size = () => {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        renderer.setSize(width, height, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        return { width, height };
      };

      const placeCamera = () => {
        camera.position.set(
          target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
          target.y + Math.sin(pitch) * dist,
          target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
        );
        camera.lookAt(target);
      };

      const framePoints = (list: LayoutPoint[]) => {
        if (list.length === 0) return;
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        for (const point of list) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          minZ = Math.min(minZ, point.z);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
          maxZ = Math.max(maxZ, point.z);
        }
        const { width, height } = size();
        const padTop = 110;
        const padLeft = 292;
        const padRight = 248;
        const padBottom = 200;
        const availW = Math.max(220, width - padLeft - padRight);
        const availH = Math.max(220, height - padTop - padBottom);
        const framing = stateRef.current;
        const rootPoint = framing.clusterId
          ? undefined
          : list.find((point) => framing.nodes.some((node) => node.id === point.id && node.root));
        const midX = rootPoint ? rootPoint.x : (minX + maxX) / 2;
        const midY = rootPoint ? rootPoint.y : (minY + maxY) / 2;
        const midZ = rootPoint ? rootPoint.z : (minZ + maxZ) / 2;
        target.set(midX, midY, midZ);
        const fov = (camera.fov * Math.PI) / 180;
        yaw = 0.62;
        pitch = 0.38;
        const unit = (v: { x: number; y: number; z: number }) => {
          const length = Math.hypot(v.x, v.y, v.z) || 1;
          return { x: v.x / length, y: v.y / length, z: v.z / length };
        };
        const zAxis = unit({
          x: Math.sin(yaw) * Math.cos(pitch),
          y: Math.sin(pitch),
          z: Math.cos(yaw) * Math.cos(pitch),
        });
        const xAxis = unit({ x: zAxis.z, y: 0, z: -zAxis.x });
        const yAxis = unit({
          x: zAxis.y * xAxis.z - zAxis.z * xAxis.y,
          y: zAxis.z * xAxis.x - zAxis.x * xAxis.z,
          z: zAxis.x * xAxis.y - zAxis.y * xAxis.x,
        });
        const vTan = Math.tan(fov / 2);
        const hTan = vTan * camera.aspect;
        const edge = 36;
        let distNeeded = 160;
        for (const point of list) {
          const relX = point.x - midX;
          const relY = point.y - midY;
          const relZ = point.z - midZ;
          const camX = relX * xAxis.x + relY * xAxis.y + relZ * xAxis.z;
          const camY = relX * yAxis.x + relY * yAxis.y + relZ * yAxis.z;
          const camZ = relX * zAxis.x + relY * zAxis.y + relZ * zAxis.z;
          const need = Math.max((Math.abs(camX) + edge) / hTan, (Math.abs(camY) + edge) / vTan) + camZ;
          if (need > distNeeded) distNeeded = need;
        }
        const spanAt = (cameraDist: number) => {
          let loX = Infinity;
          let hiX = -Infinity;
          let loY = Infinity;
          let hiY = -Infinity;
          for (const point of list) {
            const relX = point.x - midX;
            const relY = point.y - midY;
            const relZ = point.z - midZ;
            const camX = relX * xAxis.x + relY * xAxis.y + relZ * xAxis.z;
            const camY = relX * yAxis.x + relY * yAxis.y + relZ * yAxis.z;
            const camZ = relX * zAxis.x + relY * zAxis.y + relZ * zAxis.z;
            const depth = Math.max(40, cameraDist - camZ);
            loX = Math.min(loX, camX / (depth * hTan));
            hiX = Math.max(hiX, camX / (depth * hTan));
            loY = Math.min(loY, camY / (depth * vTan));
            hiY = Math.max(hiY, camY / (depth * vTan));
          }
          return { w: (hiX - loX) * width * 0.5, h: (hiY - loY) * height * 0.5 };
        };
        dist = Math.max(distNeeded, 160);
        const goalW = availW * 0.7;
        const goalH = availH * 0.7;
        for (let pass = 0; pass < 4; pass += 1) {
          const span = spanAt(dist);
          const scale = Math.max(span.w / goalW, span.h / goalH);
          if (!Number.isFinite(scale) || scale === 0) break;
          dist *= scale;
        }
        fitDist = dist;
        const ndcX = ((padLeft + availW / 2) / width) * 2 - 1;
        const ndcY = -(((padTop + availH / 2) / height) * 2 - 1);
        const shiftX = ndcX * dist * Math.tan(fov / 2) * camera.aspect;
        const shiftY = ndcY * dist * Math.tan(fov / 2);
        target.x -= shiftX;
        target.y -= shiftY;
        placeCamera();
      };

      const disposeGroup = () => {
        if (!group) return;
        scene.remove(group);
        group.traverse((obj) => {
          const mesh = obj as THREE_NS.Mesh;
          if (mesh.geometry && mesh.geometry !== sphere) mesh.geometry.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else if (
            material &&
            material !== sharedLine &&
            material !== hotLine &&
            material !== spineLine &&
            material !== crossLine &&
            material !== haloMat &&
            material !== leafHalo &&
            material !== ringMat
          ) {
            material.dispose();
          }
        });
        group = null;
        meshes.length = 0;
      };

      const sharedLine = new THREE.LineBasicMaterial({ color: LINK, transparent: true, opacity: 0.28 });
      const crossLine = new THREE.LineBasicMaterial({ color: LINK, transparent: true, opacity: 0.1 });
      const spineLine = new THREE.LineBasicMaterial({ color: LINK, transparent: true, opacity: 0.62 });
      const hotLine = new THREE.LineBasicMaterial({ color: LINK, transparent: true, opacity: 0.92 });
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x49d4ff,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      });
      const leafHalo = new THREE.MeshBasicMaterial({
        color: 0x49d4ff,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      });
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x8ee7ff,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      let labelStamp = "";
      let generation = 0;

      const paintLabelsIfNeeded = () => {
        const current = stateRef.current;
        const stamp = [
          generation,
          yaw.toFixed(2),
          pitch.toFixed(2),
          dist.toFixed(0),
          target.x.toFixed(0),
          target.y.toFixed(0),
          hoverId,
          current.selectedId ?? "",
          current.clusterId ?? "",
          current.showLabels ? "1" : "0",
          (current.route ?? []).join(","),
        ].join("|");
        if (stamp === labelStamp) return;
        labelStamp = stamp;
        paintLabels();
      };

      const draw = (now: number) => {
        if (!reduced) {
          const t = now / 1000;
          const selected = stateRef.current.selectedId;
          for (const entry of meshes) {
            const pulse = entry.id === selected ? 1 + Math.sin(t * 2.2) * 0.055 : 1;
            entry.mesh.scale.setScalar(entry.baseScale * pulse);
          }
        }
        const flow = group?.children.find((child) => child.userData.flow);
        const ring = group?.children.find((child) => child.userData.kind === "select-ring");
        const selectedMesh = meshes.find((entry) => entry.id === stateRef.current.selectedId);
        if (ring instanceof THREE.Mesh && selectedMesh) {
          const distance = Math.max(camera.position.distanceTo(selectedMesh.mesh.position), 1);
          const worldPerPx =
            (2 * Math.tan((camera.fov * Math.PI) / 360) * distance) / Math.max(host.clientHeight, 1);
          const outer = selectedMesh.mesh.scale.x * 1.9;
          const inner = Math.max(outer - 1.5 * worldPerPx, outer * 0.82);
          const stamp = `${inner.toFixed(3)}|${outer.toFixed(3)}`;
          if (ring.userData.stamp !== stamp) {
            ring.geometry.dispose();
            ring.geometry = new THREE.RingGeometry(inner, outer, 48);
            ring.userData.stamp = stamp;
          }
          ring.position.copy(selectedMesh.mesh.position);
        }
        if (flow instanceof THREE.Points) {
          const raw = flow.userData.flow as number[];
          const attr = flow.geometry.getAttribute("position");
          const phase = (now / 1000) % 1;
          for (let index = 0; index < attr.count; index += 1) {
            const base = (index % Math.floor(raw.length / 6)) * 6;
            const t = (phase + index / attr.count) % 1;
            attr.setXYZ(
              index,
              (raw[base] ?? 0) + ((raw[base + 3] ?? 0) - (raw[base] ?? 0)) * t,
              (raw[base + 1] ?? 0) + ((raw[base + 4] ?? 0) - (raw[base + 1] ?? 0)) * t,
              (raw[base + 2] ?? 0) + ((raw[base + 5] ?? 0) - (raw[base + 2] ?? 0)) * t,
            );
          }
          attr.needsUpdate = true;
        }
        placeCamera();
        renderer.render(scene, camera);
        paintLabelsIfNeeded();
      };

      let spinning = !reduced;
      let idleUntil = 0;
      const pauseSpin = () => {
        spinning = false;
        idleUntil = performance.now() + 4000;
      };
      const tick = (now: number) => {
        if (dead) return;
        frame = requestAnimationFrame(tick);
        if (!drag) {
          if (!spinning && now > idleUntil) spinning = true;
          if (spinning) yaw += 0.0016;
        }
        draw(now);
      };

      const requestDraw = () => {
        if (reduced) draw(performance.now());
      };

      const rebuild = () => {
        generation += 1;
        labelStamp = "";
        disposeGroup();
        const current = stateRef.current;
        const pointOf = new Map(current.points.map((point) => [point.id, point]));
        const nodeOf = new Map(current.nodes.map((node) => [node.id, node]));
        group = new THREE.Group();
        const degree = new Map<string, number>();
        for (const edge of current.edges) {
          degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
          degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
        }
        const rootId = current.nodes.find((node) => node.root)?.id ?? "";
        const hot = new Set<string>();
        if (current.clusterId) {
          hot.add(current.clusterId);
          for (const node of current.nodes) {
            if (node.hubs.includes(current.clusterId)) hot.add(node.id);
          }
        }
        if (current.selectedId) {
          hot.add(current.selectedId);
          for (const edge of current.edges) {
            if (edge.from === current.selectedId) hot.add(edge.to);
            if (edge.to === current.selectedId) hot.add(edge.from);
          }
        }
        if (current.route) for (const id of current.route) hot.add(id);
        const dim = hot.size > 0;
        let nearZ = Infinity;
        let farZ = -Infinity;
        for (const node of current.nodes) {
          if (!current.visibleIds.has(node.id)) continue;
          const point = pointOf.get(node.id);
          if (!point) continue;
          nearZ = Math.min(nearZ, point.z);
          farZ = Math.max(farZ, point.z);
        }
        const zSpan = Math.max(1, farZ - nearZ);

        for (const node of current.nodes) {
          if (!current.visibleIds.has(node.id)) continue;
          const point = pointOf.get(node.id);
          if (!point) continue;
          const closeness = (point.z - nearZ) / zSpan;
          const depthScale = 0.72 + 0.28 * closeness;
          const px = nodeDiameterPx(node, degree.get(node.id) ?? 0);
          const color = new THREE.Color(nodeColor(node.nodeType));
          const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
              uColor: { value: color },
              uDim: { value: (dim && !hot.has(node.id) ? 0.35 : 1) * (0.82 + 0.18 * closeness) },
            },
            vertexShader: `
              varying vec3 vNormal;
              varying vec3 vView;
              void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vNormal = normalize(mat3(modelMatrix) * normal);
                vView = normalize(cameraPosition - world.xyz);
                gl_Position = projectionMatrix * viewMatrix * world;
              }
            `,
            fragmentShader: `
              uniform vec3 uColor;
              uniform float uDim;
              varying vec3 vNormal;
              varying vec3 vView;
              void main() {
                vec3 normal = normalize(vNormal);
                float shade = 0.78 + 0.22 * max(dot(normal, normalize(vec3(0.35, 0.75, 0.55))), 0.0);
                float rim = pow(1.0 - max(dot(normal, normalize(vView)), 0.0), 2.1);
                float luma = dot(uColor, vec3(0.299, 0.587, 0.114));
                vec3 saturated = clamp(mix(vec3(luma), uColor, 1.4), 0.0, 1.0);
                vec3 color = saturated * shade + vec3(0.9, 0.98, 1.0) * rim * 0.28;
                gl_FragColor = vec4(color, (0.94 + rim * 0.06) * uDim);
              }
            `,
          });
          const mesh = new THREE.Mesh(sphere, material);
          mesh.position.set(point.x, point.y, point.z);
          mesh.scale.setScalar(Math.max(1.05, px * 0.32) * depthScale);
          mesh.userData.id = node.id;
          mesh.userData.closeness = closeness;
          group.add(mesh);
          meshes.push({ mesh, id: node.id, baseScale: mesh.scale.x });
          if (node.id === current.selectedId) {
            const distance = Math.max(camera.position.distanceTo(mesh.position), 1);
            const worldPerPx =
              (2 * Math.tan((camera.fov * Math.PI) / 360) * distance) / Math.max(host.clientHeight, 1);
            const outer = mesh.scale.x * 1.9;
            const inner = Math.max(outer - 1.5 * worldPerPx, outer * 0.82);
            const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), ringMat);
            ring.position.copy(mesh.position);
            ring.rotation.x = Math.PI / 2.4;
            ring.userData.kind = "select-ring";
            group.add(ring);
          }
        }
        if (current.points.length > 0) {
          let minX = Infinity;
          let minY = Infinity;
          let minZ = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          let maxZ = -Infinity;
          for (const point of current.points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            minZ = Math.min(minZ, point.z);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
            maxZ = Math.max(maxZ, point.z);
          }
          const span = Math.max(maxX - minX, maxZ - minZ, 220);
          const floor = new THREE.GridHelper(span * 1.2, 18, 0x143848, 0x0c2834);
          const floorMaterial = floor.material;
          const fade = (item: THREE_NS.Material) => {
            item.transparent = true;
            item.opacity = 0.05;
          };
          if (Array.isArray(floorMaterial)) floorMaterial.forEach(fade);
          else fade(floorMaterial);
          floor.position.set((minX + maxX) / 2, minY - 70, (minZ + maxZ) / 2);
          group.add(floor);
          const dustCount = 140;
          const dust = new Float32Array(dustCount * 3);
          for (let index = 0; index < dustCount; index += 1) {
            const nx = ((index * 97) % 1000) / 1000;
            const ny = ((index * 193) % 1000) / 1000;
            const nz = ((index * 389) % 1000) / 1000;
            dust[index * 3] = minX - 80 + nx * (maxX - minX + 160);
            dust[index * 3 + 1] = minY - 40 + ny * (maxY - minY + 120);
            dust[index * 3 + 2] = minZ - 80 + nz * (maxZ - minZ + 160);
          }
          const dustGeo = new THREE.BufferGeometry();
          dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
          group.add(
            new THREE.Points(
              dustGeo,
              new THREE.PointsMaterial({
                color: 0x9fdfff,
                size: 1.15,
                transparent: true,
                opacity: 0.32,
                depthWrite: false,
              }),
            ),
          );
        }

        if (current.showEdges) {
          const focusId = current.selectedId;
          const routeSet = current.route ? new Set(current.route) : null;
          const positions: number[] = [];
          const crossPositions: number[] = [];
          const spinePositions: number[] = [];
          const hotPositions: number[] = [];
          const pairs = new Map<string, { a: string; b: string }>();
          const push = (bucket: number[], a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
            bucket.push(a.x, a.y, a.z, b.x, b.y, b.z);
          };
          for (const edge of current.edges) {
            if (!current.visibleIds.has(edge.from) || !current.visibleIds.has(edge.to)) continue;
            const from = nodeOf.get(edge.from);
            const to = nodeOf.get(edge.to);
            const a = pointOf.get(edge.from);
            const b = pointOf.get(edge.to);
            if (!from || !to || !a || !b) continue;
            const onFocus = focusId && (edge.from === focusId || edge.to === focusId);
            const onRoute =
              routeSet &&
              routeSet.has(edge.from) &&
              routeSet.has(edge.to) &&
              Math.abs((current.route ?? []).indexOf(edge.from) - (current.route ?? []).indexOf(edge.to)) === 1;
            if (onFocus || onRoute) {
              push(hotPositions, a, b);
              continue;
            }
            const spoke =
              rootId !== "" &&
              ((edge.from === rootId && to.kind === "folder") || (edge.to === rootId && from.kind === "folder"));
            if (spoke) {
              if (!focusId && !routeSet) push(spinePositions, a, b);
              continue;
            }
            const homeA = from.kind === "folder" ? from.id : from.hubs[0];
            const homeB = to.kind === "folder" ? to.id : to.hubs[0];
            if (focusId || routeSet) {
              push(crossPositions, a, b);
              continue;
            }
            if (homeA && homeB && homeA !== homeB) {
              const key = homeA < homeB ? `${homeA}|${homeB}` : `${homeB}|${homeA}`;
              pairs.set(key, { a: homeA, b: homeB });
            } else {
              push(positions, a, b);
            }
          }
          let cx = 0;
          let cy = 0;
          let cz = 0;
          let hubs = 0;
          for (const node of current.nodes) {
            if (node.kind !== "folder") continue;
            const point = pointOf.get(node.id);
            if (!point) continue;
            cx += point.x;
            cy += point.y;
            cz += point.z;
            hubs += 1;
          }
          if (hubs > 0) {
            cx /= hubs;
            cy /= hubs;
            cz /= hubs;
          }
          for (const pair of pairs.values()) {
            const a = pointOf.get(pair.a);
            const b = pointOf.get(pair.b);
            if (!a || !b) continue;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const mz = (a.z + b.z) / 2;
            const c = { x: mx + (cx - mx) * 0.45, y: my + (cy - my) * 0.45, z: mz + (cz - mz) * 0.45 };
            let prev: { x: number; y: number; z: number } = a;
            for (let step = 1; step <= 12; step += 1) {
              const t = step / 12;
              const u = 1 - t;
              const next = {
                x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
                y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
                z: u * u * a.z + 2 * u * t * c.z + t * t * b.z,
              };
              push(crossPositions, prev, next);
              prev = next;
            }
          }
          if (spinePositions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(spinePositions, 3));
            group.add(new THREE.LineSegments(geometry, spineLine));
          }
          if (positions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            group.add(new THREE.LineSegments(geometry, sharedLine));
          }
          if (crossPositions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(crossPositions, 3));
            group.add(new THREE.LineSegments(geometry, crossLine));
          }
          if (hotPositions.length >= 6) {
            const count = Math.min(18, Math.floor(hotPositions.length / 6));
            const flowGeo = new THREE.BufferGeometry();
            flowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
            const flow = new THREE.Points(
              flowGeo,
              new THREE.PointsMaterial({
                color: 0xb7f3ff,
                size: 2.2,
                transparent: true,
                opacity: 0.75,
                depthWrite: false,
              }),
            );
            flow.userData.flow = hotPositions;
            group.add(flow);
          }
          if (hotPositions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(hotPositions, 3));
            group.add(new THREE.LineSegments(geometry, hotLine));
          }
        }
        scene.add(group);
        host.dataset.ready = meshes.length > 0 ? "true" : "false";
      };

      const paintLabels = () => {
        const current = stateRef.current;
        const width = host.clientWidth || 1;
        const height = host.clientHeight || 1;
        labelHost.replaceChildren();
        if (!current.showLabels) return;
        const zoomed = dist < fitDist * 0.82;
        const routeIndex = new Map((current.route ?? []).map((id, index) => [id, index]));
        const candidates: {
          id: string;
          x: number;
          y: number;
          w: number;
          h: number;
          depth: number;
          priority: number;
          protected: boolean;
          title: string;
        }[] = [];
        for (const entry of meshes) {
          const node = current.nodes.find((item) => item.id === entry.id);
          if (!node || !current.visibleIds.has(node.id)) continue;
          const hub = node.kind === "folder" || node.nodeType === "hub" || node.root;
          const links = current.edges.reduce(
            (count, edge) => count + (edge.from === node.id || edge.to === node.id ? 1 : 0),
            0,
          );
          const onPath = routeIndex.has(node.id);
          const neighbor =
            current.selectedId !== null &&
            current.edges.some(
              (edge) =>
                (edge.from === current.selectedId && edge.to === node.id) ||
                (edge.to === current.selectedId && edge.from === node.id),
            );
          const inCluster = current.clusterId !== null && (node.id === current.clusterId || node.hubs.includes(current.clusterId));
          const flags = {
            selected: node.id === current.selectedId,
            hover: node.id === hoverId,
            hub,
            ssot: node.ssot,
            onPath,
            neighbor,
            folder: false,
            match: inCluster,
            depth: 0.8,
            big: links >= 4,
          };
          if (!labelEligible(flags, zoomed ? 1.7 : 1, false)) continue;
          const vector = entry.mesh.position.clone().project(camera);
          if (vector.z > 1) continue;
          const sx = (vector.x * 0.5 + 0.5) * width;
          const sy = (-vector.y * 0.5 + 0.5) * height;
          const distance = camera.position.distanceTo(entry.mesh.position);
          const fov = (camera.fov * Math.PI) / 180;
          const nodePx = (entry.mesh.scale.x * height) / (2 * Math.tan(fov / 2) * Math.max(distance, 1));
          const number = routeIndex.get(node.id);
          const title = number !== undefined ? `${number + 1}. ${node.title}` : node.title;
          const text = title.length > 28 ? `${title.slice(0, 27)}…` : title;
          const w = Math.max(48, text.length * 7.4 + 10);
          const h = 18;
          const spots = [
            { x: sx + nodePx + 8, y: sy - h / 2 },
            { x: sx - nodePx - 8 - w, y: sy - h / 2 },
            { x: sx + nodePx + 8, y: sy - h - 10 },
          ];
          const spot = spots.find((item) => !blocked(item.x, item.y, w, h, width, height));
          if (!spot) continue;
          const rank = labelRank(flags);
          const closeness = typeof entry.mesh.userData.closeness === "number" ? entry.mesh.userData.closeness : 0.8;
          candidates.push({
            id: node.id,
            x: spot.x + w / 2,
            y: spot.y + h / 2,
            w,
            h,
            depth: closeness,
            priority: rank.priority,
            protected: rank.protected || hub,
            title: text,
          });
        }
        const placed = pickLabels(candidates);
        const byId = new Map(candidates.map((item) => [item.id, item]));
        for (const label of placed) {
          const source = byId.get(label.id);
          if (!source) continue;
          const el = document.createElement("span");
          el.className = "graph-float-label";
          el.textContent = source.title;
          el.style.left = `${label.x - source.w / 2}px`;
          el.style.top = `${label.y - source.h / 2}px`;
          el.style.opacity = String(label.opacity);
          labelHost.appendChild(el);
        }
      };

      const hit = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const found = raycaster.intersectObjects(meshes.map((entry) => entry.mesh), false)[0];
        const id = found?.object.userData.id;
        return typeof id === "string" ? id : "";
      };

      const onDown = (event: PointerEvent) => {
        pauseSpin();
        drag = { x: event.clientX, y: event.clientY, button: event.button, shift: event.shiftKey };
        moved = false;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", onUp);
      };
      const onHover = (event: PointerEvent) => {
        if (drag) return;
        const next = hit(event);
        if (next === hoverId) return;
        hoverId = next;
        host.style.cursor = hoverId ? "pointer" : "grab";
        requestDraw();
      };
      const onLeave = () => {
        if (drag || !hoverId) return;
        hoverId = "";
        host.style.cursor = "grab";
        requestDraw();
      };
      const onDrag = (event: PointerEvent) => {
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 3) moved = true;
        if (drag.button === 2 || drag.shift || event.shiftKey) {
          const scale = dist / Math.max(host.clientHeight, 1);
          target.x -= dx * scale;
          target.y += dy * scale;
        } else {
          yaw -= dx * 0.005;
          pitch = Math.max(-1.1, Math.min(1.1, pitch + dy * 0.005));
        }
        drag.x = event.clientX;
        drag.y = event.clientY;
        requestDraw();
      };
      const onUp = (event: PointerEvent) => {
        window.removeEventListener("pointermove", onDrag);
        window.removeEventListener("pointerup", onUp);
        if (!drag) return;
        const shift = drag.shift || event.shiftKey;
        drag = null;
        if (moved) return;
        const id = hit(event);
        if (!id) {
          stateRef.current.onClear();
          return;
        }
        stateRef.current.onSelect(id, shift);
      };
      const onWheel = (event: WheelEvent) => {
        pauseSpin();
        event.preventDefault();
        dist = Math.max(80, Math.min(4000, dist * (event.deltaY > 0 ? 1.08 : 0.92)));
        requestDraw();
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "ArrowLeft") yaw -= 0.08;
        else if (event.key === "ArrowRight") yaw += 0.08;
        else if (event.key === "ArrowUp") pitch = Math.max(-1.1, pitch - 0.06);
        else if (event.key === "ArrowDown") pitch = Math.min(1.1, pitch + 0.06);
        else if (event.key === "+" || event.key === "=") dist = Math.max(80, dist * 0.9);
        else if (event.key === "-" || event.key === "_") dist = Math.min(4000, dist * 1.1);
        else return;
        pauseSpin();
        event.preventDefault();
        requestDraw();
      };

      const onMenu = (event: Event) => event.preventDefault();
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointermove", onHover);
      renderer.domElement.addEventListener("pointerleave", onLeave);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
      renderer.domElement.addEventListener("contextmenu", onMenu);
      host.addEventListener("keydown", onKey);
      const observer = new ResizeObserver(() => {
        size();
        requestDraw();
      });
      observer.observe(host);
      const stop = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointermove", onHover);
        renderer.domElement.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("pointermove", onDrag);
        window.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("wheel", onWheel);
        renderer.domElement.removeEventListener("contextmenu", onMenu);
        host.removeEventListener("keydown", onKey);
        disposeGroup();
        sphere.dispose();
        sharedLine.dispose();
        crossLine.dispose();
        spineLine.dispose();
        hotLine.dispose();
        haloMat.dispose();
        leafHalo.dispose();
        ringMat.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      stopRef.current = stop;
      if (dead) {
        stop();
        return;
      }
      size();
      rebuild();
      const visiblePoints = stateRef.current.points.filter((point) => stateRef.current.visibleIds.has(point.id));
      framePoints(visiblePoints.length > 0 ? visiblePoints : stateRef.current.points);
      const fit = () => {
        const current = stateRef.current;
        const chosen = current.points.filter((point) => {
          if (!current.visibleIds.has(point.id)) return false;
          if (current.clusterId) {
            const node = current.nodes.find((item) => item.id === point.id);
            return point.id === current.clusterId || node?.hubs.includes(current.clusterId) === true;
          }
          return true;
        });
        framePoints(chosen.length > 0 ? chosen : current.points);
      };
      apiRef.current = {
        fit,
        rebuild,
        zoom: (kind) => {
          if (kind === "fit") fit();
          if (kind === "in") dist = Math.max(80, dist * 0.82);
          if (kind === "out") dist = Math.min(4000, dist * 1.22);
        },
      };
      if (reduced) draw(performance.now());
      else frame = requestAnimationFrame(tick);

      host.dataset.scene = "ready";
    });

    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      apiRef.current = null;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.rebuild();
    apiRef.current?.fit();
  }, [focusKey, points, nodes, edges, showEdges, selectedId, clusterId, route, visibleIds, showLabels]);

  useEffect(() => {
    if (zoomToken === 0) return;
    apiRef.current?.zoom(zoomKind);
  }, [zoomToken, zoomKind]);

  return (
    <div
      ref={hostRef}
      className="force-scene"
      data-ready="false"
      tabIndex={0}
      role="application"
      aria-label="Note graph. Arrow keys turn the view. Plus and minus zoom."
    >
      <div ref={labelRef} className="force-labels" />
    </div>
  );
}

function blocked(x: number, y: number, w: number, h: number, width: number, height: number): boolean {
  const zones = [
    [0, 0, width, 46],
    [0, 40, 268, height],
    [width - 232, 40, 232, 340],
    [width - 210, height * 0.3, 210, 300],
    [248, height - 176, width - 248 - 356, 176],
    [width - 356, height - 330, 356, 330],
  ];
  return zones.some(([zx, zy, zw, zh]) => x < (zx ?? 0) + (zw ?? 0) && x + w > (zx ?? 0) && y < (zy ?? 0) + (zh ?? 0) && y + h > (zy ?? 0));
}
