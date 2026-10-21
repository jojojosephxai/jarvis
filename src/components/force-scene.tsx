"use client";

import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";

import { dropOverlappingLabels, labelRank, pickLabels, smallLabelFade, type LayoutPoint } from "@/lib/graph-layout";
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
  hopDepth,
  autoRotate,
  padRight,
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
  hopDepth: number;
  autoRotate: boolean;
  padRight: number;
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
    hopDepth,
    autoRotate,
    padRight,
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
      hopDepth,
      autoRotate,
      padRight,
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
      renderer.autoClear = false;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      host.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(46, 1, 1, 8000);
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const target = new THREE.Vector3();
      const sphere = new THREE.SphereGeometry(1, 14, 12);
      let group: THREE_NS.Group | null = null;
      const meshes: {
        mesh: THREE_NS.Mesh;
        id: string;
        baseScale: number;
        baseDim: number;
        glow: THREE_NS.Mesh | null;
        glowOpacity: number;
        hit: THREE_NS.Mesh | null;
      }[] = [];
      const pickables: THREE_NS.Object3D[] = [];
      let yaw = 0.62;
      let pitch = 0.38;
      let dist = 900;
      let overviewDist = 900;
      let frameRadius = 80;
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

      const scratch = new THREE.Vector3();
      const publishDist = () => {
        host.dataset.dist = String(Math.round(dist));
      };

      const relBox = (selector: string) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return null;
        const hostBox = host.getBoundingClientRect();
        return {
          left: rect.left - hostBox.left,
          top: rect.top - hostBox.top,
          right: rect.right - hostBox.left,
          bottom: rect.bottom - hostBox.top,
        };
      };

      // Open graph area: right of the left panel, left of the orb / filter / inspector, above the ask bar.
      const safeRect = () => {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        const margin = 16;
        let left = margin;
        let top = 40;
        let right = width - margin;
        let bottom = height - margin;
        const leftPanel = relBox("[data-region='left']");
        if (leftPanel) left = Math.max(left, leftPanel.right + margin);
        const header = relBox("[data-region='header']");
        if (header) top = Math.max(top, header.bottom + 12);
        const tools = relBox(".graph-tools");
        if (tools) top = Math.max(top, tools.bottom + 8);
        const crumb = relBox(".graph-crumb");
        if (crumb) top = Math.max(top, crumb.bottom + 8);
        const filter = relBox("[data-region='filter']");
        if (filter) right = Math.min(right, filter.left - margin);
        const inspector = relBox(".graph-inspector");
        if (inspector) right = Math.min(right, inspector.left - margin);
        const orb = relBox(".orb-dial[data-place='dock']");
        if (orb) right = Math.min(right, orb.left - margin);
        const chat = relBox("[data-region='chat']");
        if (chat) right = Math.min(right, chat.left - 12);
        const ask = relBox("[data-region='ask']");
        if (ask) bottom = Math.min(bottom, ask.top - margin);
        if (right - left < 80 || bottom - top < 80) {
          return {
            left: width * 0.22,
            top: height * 0.1,
            right: width * 0.7,
            bottom: height * 0.78,
            width,
            height,
          };
        }
        return { left, top, right, bottom, width, height };
      };

      const framePoints = (list: LayoutPoint[], rememberOverview = false) => {
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
        const safe = safeRect();
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        const midZ = (minZ + maxZ) / 2;
        let radius = 12;
        for (const point of list) {
          const visual = (meshes.find((entry) => entry.id === point.id)?.baseScale ?? 5) * 1.45;
          radius = Math.max(radius, Math.hypot(point.x - midX, point.y - midY, point.z - midZ) + visual);
        }
        target.set(midX, midY, midZ);
        yaw = 0.62;
        pitch = 0.38;
        const safeCx = (safe.left + safe.right) / 2;
        const safeCy = (safe.top + safe.bottom) / 2;
        camera.setViewOffset(width, height, width / 2 - safeCx, height / 2 - safeCy, width, height);
        const fov = (camera.fov * Math.PI) / 180;
        const vTan = Math.tan(fov / 2);
        const hTan = vTan * camera.aspect;
        const roomX = Math.max(48, Math.min(safeCx - safe.left, safe.right - safeCx) - 28);
        const roomY = Math.max(48, Math.min(safeCy - safe.top, safe.bottom - safeCy) - 28);
        const fitX = radius + (radius * (width / 2)) / (roomX * hTan);
        const fitY = radius + (radius * (height / 2)) / (roomY * vTan);
        dist = Math.max(fitX, fitY, radius * 2.6, 160) * 1.04;
        frameRadius = radius;
        if (!rememberOverview) {
          const framedIds = new Set(list.map((point) => point.id));
          const dirX = Math.sin(yaw) * Math.cos(pitch);
          const dirY = Math.sin(pitch);
          const dirZ = Math.cos(yaw) * Math.cos(pitch);
          const limit = Math.max(overviewDist, dist);
          for (let pass = 0; pass < 8; pass += 1) {
            const camX = midX + dirX * dist;
            const camY = midY + dirY * dist;
            const camZ = midZ + dirZ * dist;
            let push = 0;
            for (const point of stateRef.current.points) {
              if (!stateRef.current.visibleIds.has(point.id) || framedIds.has(point.id)) continue;
              const visual = (meshes.find((entry) => entry.id === point.id)?.baseScale ?? 5) * 1.45;
              const gap = Math.max(radius * 0.85, visual * 5, 42);
              const gapDist = Math.hypot(point.x - camX, point.y - camY, point.z - camZ);
              if (gapDist < gap) push = Math.max(push, gap - gapDist + 6);
            }
            if (push < 1 || dist >= limit) break;
            dist = Math.min(limit, dist + push);
          }
        }
        if (rememberOverview) overviewDist = dist;
        publishDist();
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
            material !== ringMat &&
            material !== glowMat &&
            material !== hitMat
          ) {
            material.dispose();
          }
        });
        group = null;
        meshes.length = 0;
        pickables.length = 0;
      };

      const sharedLine = new THREE.LineBasicMaterial({ color: LINK, transparent: true, opacity: 0.28 });
      const crossLine = new THREE.LineBasicMaterial({ color: LINK, transparent: true, opacity: 0.08 });
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
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x9adfff,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      });
      const hitMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: 0x000000,
      });

      const applyHover = () => {
        const current = stateRef.current;
        const near = new Set<string>();
        if (hoverId) {
          near.add(hoverId);
          for (const edge of current.edges) {
            if (edge.from === hoverId) near.add(edge.to);
            if (edge.to === hoverId) near.add(edge.from);
          }
        }
        let dimmed = 0;
        for (const entry of meshes) {
          const material = entry.mesh.material as THREE_NS.ShaderMaterial;
          const dimNow = hoverId !== "" && !near.has(entry.id);
          if (material.uniforms?.uDim) material.uniforms.uDim.value = dimNow ? entry.baseDim * 0.35 : entry.baseDim;
          if (entry.glow) {
            const glowMaterial = entry.glow.material as THREE_NS.MeshBasicMaterial;
            glowMaterial.opacity = dimNow ? entry.glowOpacity * 0.35 : entry.glowOpacity;
          }
          if (dimNow) dimmed += 1;
        }
        host.dataset.dim = hoverId && dimmed > 0 ? "1" : "0";
        publishDist();
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
        applyHover();
        placeCamera();
        const safe = safeRect();
        const viewW = host.clientWidth || 1;
        const viewH = host.clientHeight || 1;
        const hostBox = host.getBoundingClientRect();
        const fov = (camera.fov * Math.PI) / 180;
        const halfTan = Math.tan(fov / 2);
        const framing = stateRef.current;
        const focusId = framing.clusterId || framing.selectedId;
        const focusEntry = focusId ? meshes.find((entry) => entry.id === focusId) : undefined;
        const focused = Boolean(focusId);
        const centerDist = Math.max(camera.position.distanceTo(target), 1);
        const hubPx = focusEntry ? (focusEntry.baseScale * viewH) / (2 * halfTan * Math.max(camera.position.distanceTo(focusEntry.mesh.position), 1)) : 16;
        const nearCap = focused ? Math.min(39, Math.max(14, hubPx * 2)) : 10000;
        const front = centerDist - frameRadius * 1.05;
        const boxes: { id: string; x: number; y: number; w: number; h: number; r: number }[] = [];
        for (const entry of meshes) {
          const distance = Math.max(camera.position.distanceTo(entry.mesh.position), 1);
          const worldPerPx = (2 * halfTan * distance) / viewH;
          let scale = entry.mesh.scale.x;
          const rawPx = scale / worldPerPx;
          const limit = focused ? (distance < centerDist ? nearCap : 39) : 10000;
          if (rawPx > limit) scale = limit * worldPerPx;
          entry.mesh.scale.setScalar(scale);
          if (entry.glow) entry.glow.scale.setScalar(scale * 1.4);
          if (entry.hit) {
            entry.hit.scale.setScalar(Math.max(scale * 2.2, 4));
            entry.hit.visible = false;
          }
          let nearFade = 1;
          if (focused && front > 24 && distance < front) {
            const gone = Math.max(16, front * 0.62);
            if (distance <= gone) nearFade = 0;
            else {
              const t = (distance - gone) / Math.max(front - gone, 1);
              nearFade = t * t * (3 - 2 * t);
            }
          }
          const material = entry.mesh.material as THREE_NS.ShaderMaterial;
          if (material.uniforms?.uDim) material.uniforms.uDim.value *= nearFade;
          if (entry.glow) {
            const glowMaterial = entry.glow.material as THREE_NS.MeshBasicMaterial;
            glowMaterial.opacity *= nearFade;
          }
          scratch.copy(entry.mesh.position).project(camera);
          const sx = (scratch.x * 0.5 + 0.5) * viewW;
          const sy = (-scratch.y * 0.5 + 0.5) * viewH;
          const nodePx = scale / worldPerPx;
          const inside =
            nearFade > 0.04 &&
            scratch.z >= -1 &&
            scratch.z <= 1 &&
            Number.isFinite(nodePx) &&
            sx - nodePx >= safe.left - 1 &&
            sx + nodePx <= safe.right + 1 &&
            sy - nodePx >= safe.top - 1 &&
            sy + nodePx <= safe.bottom + 1;
          entry.mesh.visible = inside;
          if (entry.glow) entry.glow.visible = inside;
          if (!inside) continue;
          const radius = Math.round(nodePx * 10) / 10;
          boxes.push({
            id: entry.id,
            x: Math.round(hostBox.left + sx - nodePx),
            y: Math.round(hostBox.top + sy - nodePx),
            w: Math.max(1, Math.round(nodePx * 2)),
            h: Math.max(1, Math.round(nodePx * 2)),
            r: radius,
          });
        }
        host.dataset.nodes = JSON.stringify(boxes);
        const ring = group?.children.find((child) => child.userData.kind === "select-ring");
        const selectedMesh = meshes.find((entry) => entry.id === stateRef.current.selectedId);
        if (ring instanceof THREE.Mesh && selectedMesh) {
          const distance = Math.max(camera.position.distanceTo(selectedMesh.mesh.position), 1);
          const worldPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * distance) / Math.max(host.clientHeight, 1);
          const outer = selectedMesh.mesh.scale.x * 1.55;
          const inner = Math.max(outer - 1.5 * worldPerPx, outer * 0.82);
          const stamp = `${inner.toFixed(3)}|${outer.toFixed(3)}`;
          if (ring.userData.stamp !== stamp) {
            ring.geometry.dispose();
            ring.geometry = new THREE.RingGeometry(inner, outer, 48);
            ring.userData.stamp = stamp;
          }
          ring.position.copy(selectedMesh.mesh.position);
          ring.visible = selectedMesh.mesh.visible;
        }
        const pixel = renderer.getPixelRatio();
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.setScissorTest(true);
        renderer.setScissor(
          Math.max(0, Math.floor(safe.left * pixel)),
          Math.max(0, Math.floor((viewH - safe.bottom) * pixel)),
          Math.max(1, Math.floor((safe.right - safe.left) * pixel)),
          Math.max(1, Math.floor((safe.bottom - safe.top) * pixel)),
        );
        renderer.render(scene, camera);
        paintLabels();
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
        const allowSpin = stateRef.current.autoRotate && !hoverId && !drag;
        if (!allowSpin) spinning = false;
        else if (!spinning && now > idleUntil) spinning = true;
        if (spinning && allowSpin) yaw += 0.0016;
        draw(now);
      };

      const requestDraw = () => {
        if (reduced) draw(performance.now());
      };

      const neighborhood = (id: string, hops: number) => {
        const near = new Set<string>([id]);
        const current = stateRef.current;
        const steps = Math.min(2, Math.max(1, hops));
        for (let hop = 0; hop < steps; hop += 1) {
          for (const edge of current.edges) {
            if (near.has(edge.from)) near.add(edge.to);
            if (near.has(edge.to)) near.add(edge.from);
          }
        }
        return near;
      };

      const rebuild = () => {
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
        if (current.route && current.route.length > 1) {
          for (const id of current.route) hot.add(id);
        } else if (current.clusterId) {
          hot.add(current.clusterId);
          for (const node of current.nodes) {
            if (node.hubs.includes(current.clusterId)) hot.add(node.id);
          }
        } else if (current.selectedId) {
          for (const id of neighborhood(current.selectedId, current.hopDepth)) hot.add(id);
        }
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
          const baseDim = (dim && !hot.has(node.id) ? 0.35 : 1) * (0.82 + 0.18 * closeness);
          const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
              uColor: { value: color },
              uDim: { value: baseDim },
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
          mesh.scale.setScalar(Math.max(1.7, px * 0.44) * depthScale);
          mesh.userData.id = node.id;
          mesh.userData.closeness = closeness;
          const glowMaterial = glowMat.clone();
          const glow = new THREE.Mesh(sphere, glowMaterial);
          glow.position.copy(mesh.position);
          glow.scale.setScalar(mesh.scale.x * 1.4);
          glow.userData.kind = "glow";
          glow.userData.id = node.id;
          const hit = new THREE.Mesh(sphere, hitMat);
          hit.position.copy(mesh.position);
          hit.scale.setScalar(Math.max(mesh.scale.x * 2.8, 6));
          hit.visible = false;
          hit.userData.id = node.id;
          group.add(glow);
          group.add(hit);
          group.add(mesh);
          pickables.push(hit, glow, mesh);
          meshes.push({ mesh, id: node.id, baseScale: mesh.scale.x, baseDim, glow, glowOpacity: 0.14, hit });
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
          const focused = Boolean(current.selectedId || current.clusterId || routeSet);
          for (const edge of current.edges) {
            if (!current.visibleIds.has(edge.from) || !current.visibleIds.has(edge.to)) continue;
            if (focused && hot.size > 0 && (!hot.has(edge.from) || !hot.has(edge.to))) continue;
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
            if (homeA && homeB && homeA !== homeB) {
              const key = homeA < homeB ? `${homeA}|${homeB}` : `${homeB}|${homeA}`;
              pairs.set(key, { a: homeA, b: homeB });
            } else {
              push(positions, a, b);
            }
          }
          for (const pair of pairs.values()) {
            const a = pointOf.get(pair.a);
            const b = pointOf.get(pair.b);
            if (!a || !b) continue;
            push(crossPositions, a, b);
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

      const labelEls = new Map<string, HTMLSpanElement>();
      const overlapsHud = (x: number, y: number, w: number, h: number) => {
        const hostBox = host.getBoundingClientRect();
        const left = hostBox.left + x;
        const top = hostBox.top + y;
        const right = left + w;
        const bottom = top + h;
        if (left < hostBox.left + 2 || top < hostBox.top + 2 || right > hostBox.right - 2 || bottom > hostBox.bottom - 2) {
          return true;
        }
        const selectors = [
          "[data-region='header']",
          "[data-region='left']",
          "[data-region='filter']",
          "[data-region='chat']",
          "[data-region='ask']",
          ".orb-dial",
          ".orb-status",
          ".graph-inspector",
          ".face-task",
        ];
        return selectors.some((selector) => {
          const node = document.querySelector(selector);
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return false;
          return left < rect.right - 1 && right > rect.left + 1 && top < rect.bottom - 1 && bottom > rect.top + 1;
        });
      };

      const paintLabels = () => {
        const current = stateRef.current;
        const width = host.clientWidth || 1;
        const height = host.clientHeight || 1;
        if (!current.showLabels) {
          labelHost.replaceChildren();
          labelEls.clear();
          return;
        }
        const fade = smallLabelFade(dist, overviewDist);
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
          zoomOpacity: number;
          hub: boolean;
        }[] = [];
        for (const entry of meshes) {
          if (!entry.mesh.visible) continue;
          const node = current.nodes.find((item) => item.id === entry.id);
          if (!node || !current.visibleIds.has(node.id)) continue;
          const hub = node.kind === "folder" || node.nodeType === "hub" || node.root;
          const onPath = routeIndex.has(node.id);
          const neighbor =
            current.selectedId !== null &&
            current.edges.some(
              (edge) =>
                (edge.from === current.selectedId && edge.to === node.id) ||
                (edge.to === current.selectedId && edge.from === node.id),
            );
          const clusterId = current.clusterId;
          const inCluster = clusterId !== null && (node.id === clusterId || node.hubs.includes(clusterId));
          const flags = {
            selected: node.id === current.selectedId,
            hover: node.id === hoverId,
            hub,
            ssot: node.ssot,
            onPath,
            neighbor,
            folder: false,
            match: inCluster,
          };
          const pinned = hub || flags.selected || flags.hover || flags.onPath;
          if (!pinned && fade < 0.04) continue;
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
          const w = Math.max(48, text.length * 7.6 + 12);
          const h = 20;
          const spots = [
            { x: sx + nodePx + 8, y: sy - h / 2 },
            { x: sx - nodePx - 8 - w, y: sy - h / 2 },
            { x: sx + nodePx + 8, y: sy - h - 10 },
          ];
          const spot = spots.find((item) => !overlapsHud(item.x, item.y, w, h));
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
            zoomOpacity: pinned ? 1 : fade,
            hub,
          });
        }
        const placed = pickLabels(candidates);
        const byId = new Map(candidates.map((item) => [item.id, item]));
        const keep = new Set<string>();
        for (const label of placed) {
          const source = byId.get(label.id);
          if (!source) continue;
          if (overlapsHud(label.x - source.w / 2, label.y - source.h / 2, source.w, source.h)) continue;
          keep.add(label.id);
          let el = labelEls.get(label.id);
          if (!el) {
            el = document.createElement("span");
            el.className = "graph-float-label";
            el.addEventListener("pointerdown", (event) => {
              event.preventDefault();
              event.stopPropagation();
              const id = (event.currentTarget as HTMLElement).dataset.nodeId || "";
              if (id) stateRef.current.onSelect(id, event.shiftKey);
            });
            el.addEventListener("pointerenter", (event) => {
              const id = (event.currentTarget as HTMLElement).dataset.nodeId || "";
              if (!id) return;
              hoverId = id;
              host.style.cursor = "pointer";
            });
            el.addEventListener("pointerleave", (event) => {
              const id = (event.currentTarget as HTMLElement).dataset.nodeId || "";
              if (hoverId === id) hoverId = "";
              host.style.cursor = "grab";
            });
            labelHost.appendChild(el);
            labelEls.set(label.id, el);
          }
          el.dataset.nodeId = source.id;
          el.dataset.hub = source.hub ? "1" : "0";
          el.dataset.priority = String(source.priority);
          el.textContent = source.title;
          el.style.left = `${label.x - source.w / 2}px`;
          el.style.top = `${label.y - source.h / 2}px`;
          el.style.opacity = String(Math.max(0, Math.min(1, label.opacity * source.zoomOpacity)));
        }
        const measured = [...labelEls.entries()]
          .filter(([id]) => keep.has(id))
          .map(([id, el]) => {
            const rect = el.getBoundingClientRect();
            return {
              id,
              priority: Number(el.dataset.priority || 0),
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            };
          });
        const shown = new Set(dropOverlappingLabels(measured).map((label) => label.id));
        for (const [id, el] of labelEls) {
          if (!keep.has(id) || shown.has(id)) continue;
          el.remove();
          labelEls.delete(id);
        }
        for (const [id, el] of labelEls) {
          if (keep.has(id)) continue;
          el.remove();
          labelEls.delete(id);
        }
      };

      const hit = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const found = raycaster.intersectObjects(pickables, false)[0];
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
        if (stateRef.current.autoRotate) spinning = true;
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
        if (event.deltaY > 0) dist = Math.min(overviewDist, dist * 1.08);
        else dist = Math.max(80, dist * 0.92);
        publishDist();
        requestDraw();
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "ArrowLeft") yaw -= 0.08;
        else if (event.key === "ArrowRight") yaw += 0.08;
        else if (event.key === "ArrowUp") pitch = Math.max(-1.1, pitch - 0.06);
        else if (event.key === "ArrowDown") pitch = Math.min(1.1, pitch + 0.06);
        else if (event.key === "+" || event.key === "=") dist = Math.max(80, dist * 0.9);
        else if (event.key === "-" || event.key === "_") dist = Math.min(overviewDist, dist * 1.1);
        else return;
        publishDist();
        pauseSpin();
        event.preventDefault();
        requestDraw();
      };

      const onMenu = (event: Event) => event.preventDefault();
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointermove", onHover);
      renderer.domElement.addEventListener("pointerleave", onLeave);
      host.addEventListener("wheel", onWheel, { passive: false });
      renderer.domElement.addEventListener("contextmenu", onMenu);
      host.addEventListener("keydown", onKey);
      let refit = () => {};
      const observer = new ResizeObserver(() => {
        size();
        refit();
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
        host.removeEventListener("wheel", onWheel);
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
        glowMat.dispose();
        hitMat.dispose();
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
      framePoints(visiblePoints.length > 0 ? visiblePoints : stateRef.current.points, true);
      const fit = () => {
        const current = stateRef.current;
        let ids: Set<string> | null = null;
        const clusterId = current.clusterId;
        const selectedId = current.selectedId;
        if (current.route && current.route.length > 1) ids = new Set(current.route);
        else if (clusterId) {
          ids = new Set(
            current.nodes.filter((node) => node.id === clusterId || node.hubs.includes(clusterId)).map((node) => node.id),
          );
        } else if (selectedId) ids = neighborhood(selectedId, current.hopDepth);
        const chosen = current.points.filter((point) => current.visibleIds.has(point.id) && (!ids || ids.has(point.id)));
        framePoints(chosen.length > 0 ? chosen : current.points, !ids);
      };
      refit = fit;
      apiRef.current = {
        fit,
        rebuild,
        zoom: (kind) => {
          if (kind === "fit") fit();
          if (kind === "in") dist = Math.max(80, dist * 0.82);
          if (kind === "out") dist = Math.min(overviewDist, dist * 1.22);
          publishDist();
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
  }, [focusKey, points, nodes, edges, showEdges, selectedId, clusterId, route, visibleIds, showLabels, hopDepth, padRight]);

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

