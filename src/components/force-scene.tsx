"use client";

import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";

import { labelRank, smallLabelFade, type LayoutPoint } from "@/lib/graph-layout";
import { frameScreenNodes, labelSpots, rectIntersectsCircle, rectsIntersect, type ScreenRect, type ScreenNode } from "@/lib/graph-screen-layout";
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
      const overviewTarget = new THREE.Vector3();
      const overviewCamera = camera.clone();
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

      const safeRect = () => ({
        left: 16, top: 16, right: host.clientWidth - 16, bottom: host.clientHeight - 16,
        width: host.clientWidth, height: host.clientHeight,
      });

      const parkView = () => {
        const { width, height } = size();
        const safe = safeRect();
        const safeCx = (safe.left + safe.right) / 2;
        const safeCy = (safe.top + safe.bottom) / 2;
        camera.setViewOffset(width, height, width / 2 - safeCx, height / 2 - safeCy, width, height);
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
        parkView();
        const safeCx = (safe.left + safe.right) / 2;
        const safeCy = (safe.top + safe.bottom) / 2;
        const fov = (camera.fov * Math.PI) / 180;
        const vTan = Math.tan(fov / 2);
        const hTan = vTan * camera.aspect;
        const roomX = Math.max(48, Math.min(safeCx - safe.left, safe.right - safeCx) - 18);
        const roomY = Math.max(48, Math.min(safeCy - safe.top, safe.bottom - safeCy) - 18);
        const fitX = (radius * (width / 2)) / (roomX * hTan);
        const fitY = (radius * (height / 2)) / (roomY * vTan);
        dist = Math.max(Math.max(fitX, fitY) * 0.9, 80);
        if (!rememberOverview) {
          const framedIds = new Set(list.map((point) => point.id));
          const dirX = Math.sin(yaw) * Math.cos(pitch);
          const dirY = Math.sin(pitch);
          const dirZ = Math.cos(yaw) * Math.cos(pitch);
          const limit = dist * 1.12;
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
        if (rememberOverview) { overviewDist = dist; overviewTarget.copy(target); }
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

      const sharedLine = new THREE.LineBasicMaterial({ color: LINK, transparent: true, opacity: 0.85 });
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
        applyHover();
        placeCamera();
        const safe = safeRect();
        const viewW = host.clientWidth || 1;
        const viewH = host.clientHeight || 1;
        const hostBox = host.getBoundingClientRect();
        const fov = (camera.fov * Math.PI) / 180;
        const halfTan = Math.tan(fov / 2);
        const framing = stateRef.current;
        const focused = Boolean(framing.clusterId || framing.selectedId);
        const stamp = JSON.stringify([safe, dist, yaw, pitch, target.toArray(), framing.selectedId, framing.clusterId, meshes.length]);
        if (stamp !== placementStamp) {
          placementStamp = stamp;
          camera.updateMatrixWorld();
          overviewCamera.copy(camera);
          overviewCamera.position.set(
            overviewTarget.x + Math.sin(yaw) * Math.cos(pitch) * overviewDist,
            overviewTarget.y + Math.sin(pitch) * overviewDist,
            overviewTarget.z + Math.cos(yaw) * Math.cos(pitch) * overviewDist,
          );
          overviewCamera.lookAt(overviewTarget);
          overviewCamera.updateMatrixWorld();
          const near = new Set<string>();
          const focusId = framing.clusterId ?? framing.selectedId;
          if (focusId) {
            near.add(focusId);
            for (const edge of framing.edges) {
              if (edge.from === focusId) near.add(edge.to);
              if (edge.to === focusId) near.add(edge.from);
            }
            for (const node of framing.nodes) if (node.hubs.includes(focusId)) near.add(node.id);
          }
          const projected = meshes.map((entry) => {
            const point = framing.points.find((point) => point.id === entry.id)!;
            const node = framing.nodes.find((node) => node.id === entry.id)!;
            const hub = node.kind === "folder" || node.nodeType === "hub";
            const active = near.has(node.id);
            const projectionCamera = focused && !active ? overviewCamera : camera;
            scratch.set(point.x, point.y, point.z);
            const depth = scratch.clone().applyMatrix4(projectionCamera.matrixWorldInverse);
            depth.z = Math.min(depth.z, -dist * 0.35);
            const worldPerPx = 2 * halfTan * -depth.z / viewH;
            scratch.copy(depth).applyMatrix4(projectionCamera.matrixWorld).project(projectionCamera);
            const cap = focused ? (active ? (hub ? (node.id === focusId ? 18 : 10) : 7) : (hub ? 7 : 3.5)) : (hub ? 12 : 5);
            const radius = Math.max(hub ? 6 : 3, Math.min(cap, entry.baseScale / worldPerPx));
            return {
              id: entry.id, x: (scratch.x * 0.5 + 0.5) * viewW, y: (-scratch.y * 0.5 + 0.5) * viewH,
              r: radius * 1.06, hubId: node.hubs[0], priority: node.id === framing.selectedId ? 1000 : hub ? 500 : active ? 100 : 0,
              z: scratch.z,
            };
          });
          const source = new Map(projected.map((node) => [node.id, node]));
          screenNodes = frameScreenNodes(projected, safe, focusId, near);
          const entryOf = new Map(meshes.map((entry) => [entry.id, entry]));
          for (const node of screenNodes) {
            const entry = entryOf.get(node.id)!;
            const z = source.get(node.id)!.z;
            entry.mesh.position.set(node.x / viewW * 2 - 1, 1 - node.y / viewH * 2, z).unproject(camera);
            entry.glow?.position.copy(entry.mesh.position);
            entry.hit?.position.copy(entry.mesh.position);
          }
          // Keep edges attached to the final projected node positions.
          group?.traverse((object) => {
            const ids = object.userData.nodeIds as string[] | undefined;
            if (!ids || !(object instanceof THREE.LineSegments)) return;
            const attr = object.geometry.getAttribute("position");
            ids.forEach((id, index) => {
              const point = entryOf.get(id)?.mesh.position;
              if (point) attr.setXYZ(index, point.x, point.y, point.z);
            });
            attr.needsUpdate = true;
            object.geometry.computeBoundingSphere();
          });
        }
        const byId = new Map(screenNodes.map((node) => [node.id, node]));
        const boxes = [];
        for (const entry of meshes) {
          const node = byId.get(entry.id)!;
          const depth = entry.mesh.position.clone().applyMatrix4(camera.matrixWorldInverse);
          const worldPerPx = 2 * halfTan * Math.max(-depth.z, 1) / viewH;
          const pulse = !reduced && entry.id === framing.selectedId ? 1 + Math.sin(now / 1000 * 2.2) * 0.055 : 1;
          const radius = node.r / 1.06 * pulse;
          entry.mesh.scale.setScalar(radius * worldPerPx);
          entry.mesh.visible = true;
          if (entry.glow) { entry.glow.scale.setScalar(radius * worldPerPx * 1.4); entry.glow.visible = true; }
          if (entry.hit) { entry.hit.scale.setScalar(radius * worldPerPx * 1.4); entry.hit.visible = false; }
          boxes.push({ id: entry.id, x: hostBox.left + node.x - radius, y: hostBox.top + node.y - radius, w: radius * 2, h: radius * 2, r: radius });
        }
        host.dataset.nodes = JSON.stringify(boxes);
        host.dataset.area = JSON.stringify({ left: hostBox.left + safe.left, top: hostBox.top + safe.top, right: hostBox.left + safe.right, bottom: hostBox.top + safe.bottom });
        const drawnEdges: { from: string; to: string; length: number }[] = [];
        group?.traverse((object) => {
          if (!(object instanceof THREE.LineSegments)) return;
          const ids = object.userData.nodeIds as string[] | undefined;
          if (!ids) return;
          for (let i = 0; i < ids.length; i += 2) {
            const a = byId.get(ids[i]); const b = byId.get(ids[i + 1]);
            if (a && b) drawnEdges.push({ from: a.id, to: b.id, length: Math.hypot(a.x - b.x, a.y - b.y) });
          }
        });
        host.dataset.edges = JSON.stringify(drawnEdges);
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
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.setScissorTest(true);
        renderer.setScissor(safe.left, viewH - safe.bottom, safe.right - safe.left, safe.bottom - safe.top);
        renderer.render(scene, camera);
        renderer.setScissorTest(false);
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
        const allowSpin = stateRef.current.autoRotate && !hoverId && !drag && !stateRef.current.selectedId;
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

      let placementStamp = "";
      let labelStamp = "";
      let screenNodes: ScreenNode[] = [];
      const rebuild = () => {
        placementStamp = "";
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
        if (current.route && current.route.length > 1) {
          for (const id of current.route) hot.add(id);
        } else if (current.clusterId) {
          hot.add(current.clusterId);
          for (const node of current.nodes) {
            if (node.hubs.includes(current.clusterId)) hot.add(node.id);
          }
          for (const edge of current.edges) {
            if (edge.from === current.clusterId) hot.add(edge.to);
            if (edge.to === current.clusterId) hot.add(edge.from);
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
        if (current.showEdges) {
          const focusId = current.selectedId;
          const routeSet = current.route ? new Set(current.route) : null;
          const positions: number[] = [];
          const crossPositions: number[] = [];
          const spinePositions: number[] = [];
          const hotPositions: number[] = [];
          const pairs = new Map<string, { a: string; b: string }>();
          const endpointIds = new Map<number[], string[]>();
          const push = (bucket: number[], a: LayoutPoint, b: LayoutPoint) => {
            bucket.push(a.x, a.y, a.z, b.x, b.y, b.z);
            const ids = endpointIds.get(bucket) ?? [];
            ids.push(a.id, b.id);
            endpointIds.set(bucket, ids);
          };
          const addLines = (positions: number[], material: THREE_NS.LineBasicMaterial) => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            const lines = new THREE.LineSegments(geometry, material);
            lines.userData.nodeIds = endpointIds.get(positions);
            group!.add(lines);
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
            addLines(spinePositions, spineLine);
          }
          if (positions.length > 0) {
            addLines(positions, sharedLine);
          }
          if (crossPositions.length > 0) {
            addLines(crossPositions, crossLine);
          }
          if (hotPositions.length > 0) {
            addLines(hotPositions, hotLine);
          }
        }
        scene.add(group);
        host.dataset.ready = meshes.length > 0 ? "true" : "false";
      };

      const labelEls = new Map<string, HTMLSpanElement>();
      const paintLabels = () => {
        const current = stateRef.current;
        const safe = safeRect();
        const fade = smallLabelFade(dist, overviewDist);
        const stamp = `${placementStamp}|${hoverId}|${current.showLabels}|${fade}`;
        if (stamp === labelStamp) return;
        labelStamp = stamp;
        const routeIndex = new Map((current.route ?? []).map((id, index) => [id, index]));
        const byId = new Map(current.nodes.map((node) => [node.id, node]));
        const candidates = screenNodes.flatMap((point) => {
          const node = byId.get(point.id)!;
          const hub = node.kind === "folder" || node.nodeType === "hub" || node.root;
          const selected = node.id === current.selectedId;
          const hover = node.id === hoverId;
          const onPath = routeIndex.has(node.id);
          const inCluster = current.clusterId !== null && (node.id === current.clusterId || node.hubs.includes(current.clusterId));
          const pinned = hub || selected || hover || onPath || inCluster || node.ssot;
          if (!current.showLabels || (!pinned && fade < 0.04)) return [];
          const rank = labelRank({ selected, hover, hub, onPath, neighbor: false, folder: false, match: inCluster, ssot: node.ssot });
          const number = routeIndex.get(node.id);
          return [{ ...point, title: number !== undefined ? `${number + 1}. ${node.title}` : node.title, hub, priority: rank.priority, opacity: pinned ? 1 : fade }];
        }).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
        const keep = new Set<string>();
        const placed: ScreenRect[] = [];
        for (const source of candidates) {
          let el = labelEls.get(source.id);
          if (!el) {
            el = document.createElement("span");
            el.className = "graph-float-label";
            el.dataset.nodeId = source.id;
            el.addEventListener("pointerdown", (event) => {
              event.preventDefault();
              event.stopPropagation();
              stateRef.current.onSelect(source.id, event.shiftKey);
            });
            el.addEventListener("pointerenter", () => { hoverId = source.id; host.style.cursor = "pointer"; });
            el.addEventListener("pointerleave", () => { if (hoverId === source.id) hoverId = ""; host.style.cursor = "grab"; });
            labelHost.appendChild(el);
            labelEls.set(source.id, el);
          }
          el.textContent = source.title.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "").trim() || "Untitled note";
          el.dataset.hub = source.hub ? "1" : "0";
          // Measure real glyph bounds; estimates and later nudging can hit a neighboring sphere.
          const w = el.offsetWidth;
          const h = el.offsetHeight;
          const { x, y, r } = source;
          const spots = labelSpots(x, y, r, w, h);
          const spot = spots.find((spot) => {
            const rect = spot;
            return rect.left >= safe.left && rect.right <= safe.right && rect.top >= safe.top && rect.bottom <= safe.bottom &&
              !placed.some((other) => rectsIntersect(rect, other, 6)) &&
              !screenNodes.some((node) => node.id !== source.id && !source.hub && rectIntersectsCircle(rect, node, 3));
          });
          if (!spot) continue;
          keep.add(source.id);
          placed.push(spot);
          el.style.left = `${spot.left}px`;
          el.style.top = `${spot.top}px`;
          el.style.opacity = String(source.opacity);
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
        const found = raycaster.intersectObjects(pickables, false).find((hit) => meshes.some((entry) => entry.id === hit.object.userData.id && entry.mesh.visible));
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
        if (ids) framePoints(current.points.filter((point) => current.visibleIds.has(point.id)), true);
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

