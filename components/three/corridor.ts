// The deadline corridor. One shared time axis (New York time, tonight to tomorrow afternoon).
// The 9:00 AM deadline stands as a yellow overhead sign frame. Every way home is an arc from its
// departure to its arrival, so routes that make it land in front of the frame and late ones land
// past it. The canceled flight breaks and falls; blocked routes drop through the floor; the booked
// route turns yellow and a plane flies it once. Renders on demand: no frames while nothing moves.

import * as THREE from "three";
import { clockHours } from "@/components/rerouted/format";
import type { Offer, Trip } from "@/components/rerouted/types";

const YELLOW = 0xffcc00;
const WHITE = 0xffffff;
const SOFT = 0x8a8a8a;
const ALERT = 0xff5a4e;
const GROUND = 0x1a1a1a;

const PT_TO_ET = 3; // departures are printed in San Francisco time, arrivals in New York time
const DEADLINE_ET = 21; // 9:00 AM tomorrow on the clockHours axis
const AXIS_TO = 29; // 5 PM tomorrow
/**
 * The axis starts at 8 PM tonight. With live flights it starts at the current hour in New York when
 * that is earlier: a search run in the morning returns flights later today. One scene per page, so
 * the constructor sets these before anything is drawn.
 */
let AXIS_FROM = 8;
let X_SCALE = 0.95;
function axisFromNow(): number {
  const hourIn = (timeZone: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const et = hourIn("America/New_York");
  const pt = hourIn("America/Los_Angeles");
  // Hours after noon on the Pacific date; past midnight in New York is still tonight in San Francisco.
  const now = et - 12 + (et < pt ? 24 : 0);
  return Math.max(-11, Math.min(8, Math.floor(now)));
}
const xOf = (h: number) => (h - (AXIS_FROM + AXIS_TO) / 2) * X_SCALE;

const easeOut = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));

interface Tween {
  start: number;
  dur: number;
  step: (k: number) => void;
  done?: () => void;
}

interface Route {
  offer: Offer;
  group: THREE.Group;
  tube: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  curve: THREE.CubicBezierCurve3;
  label: THREE.Sprite;
  labelKey: string;
  endCap: THREE.Mesh;
}

function fontFamily(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sign").trim();
  return v || "system-ui, sans-serif";
}
function monoFamily(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-board").trim();
  return v || "ui-monospace, monospace";
}

/** A text sprite drawn on a canvas. Sized in world units by its height. */
function textSprite(lines: { text: string; weight: number; size: number; color: string; mono?: boolean }[], opts: { bg?: string; pad?: number; height: number }) {
  const scale = 2;
  const pad = (opts.pad ?? 0) * scale;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const fam = fontFamily();
  const mono = monoFamily();
  const fontOf = (l: (typeof lines)[number]) => `${l.weight} ${l.size * scale}px ${l.mono ? mono : fam}`;
  let w = 0;
  let h = 0;
  for (const l of lines) {
    ctx.font = fontOf(l);
    w = Math.max(w, ctx.measureText(l.text).width);
    h += l.size * scale * 1.15;
  }
  c.width = Math.ceil(w * 1.06 + pad * 2 + 4);
  c.height = Math.ceil(h + pad * 2);
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  let y = pad;
  ctx.textBaseline = "top";
  for (const l of lines) {
    ctx.font = fontOf(l);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, pad, y + l.size * scale * 0.06);
    y += l.size * scale * 1.15;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set((opts.height * c.width) / c.height, opts.height, 1);
  return s;
}

function disposeSprite(s: THREE.Sprite) {
  s.material.map?.dispose();
  s.material.dispose();
}

function planeShape(): THREE.Shape {
  // The same plane silhouette as the pictograms, pointing along +x.
  const s = new THREE.Shape();
  const pts: [number, number][] = [
    [1, 0], [0.75, 0.12], [0.2, 0.12], [-0.25, 0.75], [-0.42, 0.75], [-0.15, 0.12], [-0.6, 0.12], [-0.75, 0.35], [-0.88, 0.35],
    [-0.8, 0], [-0.88, -0.35], [-0.75, -0.35], [-0.6, -0.12], [-0.15, -0.12], [-0.42, -0.75], [-0.25, -0.75], [0.2, -0.12], [0.75, -0.12],
  ];
  s.moveTo(pts[0]![0], pts[0]![1]);
  pts.slice(1).forEach(([x, y]) => s.lineTo(x, y));
  s.closePath();
  return s;
}

export class Corridor {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private tweens: Tween[] = [];
  private raf = 0;
  private routes = new Map<string, Route>();
  private original: { group: THREE.Group; tube: THREE.Mesh; mat: THREE.MeshBasicMaterial; broken: boolean } | null = null;
  private plane: THREE.Mesh | null = null;
  private flownFor = "";
  private ro: ResizeObserver;
  private reduced: boolean;
  private status: Trip["status"] | "" = "";
  private disposed = false;
  /** Sprites grow on narrow screens so labels stay readable on a phone. */
  private labelScale = 1;
  /** Camera framing: the base view, and a one-time push toward the booked route. */
  private camBase = new THREE.Vector3();
  private camTarget = new THREE.Vector3(0.8, 0.5, -0.4);
  private focus: THREE.Vector3 | null = null;
  private dolly = 0;
  private sweep: THREE.Mesh | null = null;
  /** The viewer's own turn and zoom, layered on top of the scripted framing. */
  private view = { yaw: 0, pitch: 0, zoom: 1 };
  private unbind: (() => void) | null = null;

  constructor(
    private host: HTMLElement,
    private opts: { labelScale?: number; interactive?: boolean; liveAxis?: boolean } = {},
  ) {
    AXIS_FROM = opts.liveAxis ? axisFromNow() : 8;
    // The scene keeps the same width however many hours it covers, so the camera framing still fits.
    X_SCALE = (0.95 * 21) / (AXIS_TO - AXIS_FROM);
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(GROUND, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.buildStage();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    if (opts.interactive) this.bindControls();
  }

  /** Drag to turn the scene, scroll or pinch to zoom, double-click to go back to the default view. */
  private bindControls() {
    const el = this.renderer.domElement;
    el.style.cursor = "grab";
    el.style.touchAction = "none";
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...pts.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const apply = () => {
      this.placeCamera();
      this.render();
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.style.cursor = "grabbing";
      if (pts.size === 2) pinch = spread();
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const d = spread();
        if (pinch && d) this.zoomBy(pinch / d);
        pinch = d;
        apply();
        return;
      }
      this.view.yaw -= (e.clientX - p.x) * 0.004;
      this.view.pitch = Math.max(-0.5, Math.min(0.55, this.view.pitch + (e.clientY - p.y) * 0.004));
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      apply();
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
      if (!pts.size) el.style.cursor = "grab";
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * 0.0012));
      apply();
    };
    const dbl = () => this.resetView();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", dbl);
    this.unbind = () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", dbl);
    };
  }

  private zoomBy(f: number) {
    this.view.zoom = Math.max(0.35, Math.min(1.6, this.view.zoom * f));
  }

  /** Back to the scripted framing. */
  resetView() {
    this.view = { yaw: 0, pitch: 0, zoom: 1 };
    this.placeCamera();
    this.render();
  }

  private buildStage() {
    // The floor: a dark strip with hour ticks. The ticks are the time axis, not texture.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(xOf(AXIS_TO) - xOf(AXIS_FROM) + 1.2, 11),
      new THREE.MeshBasicMaterial({ color: 0x141414 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.01, -1);
    this.scene.add(floor);

    const tickMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
    for (let h = AXIS_FROM; h <= AXIS_TO; h++) {
      const major = h % 4 === 0;
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(major ? 0.05 : 0.025, major ? 10.4 : 0.5), tickMat);
      tick.rotation.x = -Math.PI / 2;
      tick.position.set(xOf(h), 0, major ? -1 : 4.1);
      this.scene.add(tick);
      if (major && h > AXIS_FROM) {
        // The axis counts hours after noon tonight, so h = 8 is 8 PM and h = 20 is 8 AM.
        const hh = (h + 12) % 24;
        const label = hh === 0 ? "12 AM" : hh === 12 ? "12 PM" : hh > 12 ? `${hh - 12} PM` : `${hh} AM`;
        const s = textSprite([{ text: label, weight: 600, size: 22, color: "#9a9a9a" }], { height: 0.5 });
        s.position.set(xOf(h), 0.02, 4.8);
        s.center.set(0.5, 1);
        this.scene.add(s);
      }
    }

    // The deadline: an overhead sign frame in yellow, standing across every lane.
    const x = xOf(DEADLINE_ET);
    const frame = new THREE.Group();
    const postMat = new THREE.MeshBasicMaterial({ color: WHITE });
    const postGeo = new THREE.BoxGeometry(0.1, 4.2, 0.1);
    for (const z of [-6.2, 4.2]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(0, 2.1, z);
      frame.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 10.5), postMat);
    beam.position.set(0, 4.2, -1);
    frame.add(beam);
    const veil = new THREE.Mesh(
      new THREE.PlaneGeometry(10.4, 4.2),
      new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.03, side: THREE.DoubleSide, depthWrite: false }),
    );
    veil.rotation.y = Math.PI / 2;
    veil.position.set(0, 2.1, -1);
    frame.add(veil);
    const sign = textSprite(
      [
        { text: "Arrive JFK by", weight: 700, size: 26, color: "#0b0b0b" },
        { text: "9:00 AM", weight: 900, size: 58, color: "#0b0b0b" },
      ],
      { bg: "#ffffff", pad: 14, height: 1.6 },
    );
    sign.center.set(0.5, 0);
    sign.position.set(0, 4.35, -1);
    frame.add(sign);
    frame.position.x = x;
    this.scene.add(frame);
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Frame the whole axis: pull back on narrow screens.
    // An oblique view from the front left, so the deadline frame reads as a gate the lanes pass under.
    const k = 1.32 * Math.max(1, 1.75 / aspect);
    this.camBase.set(-7.5 * k, 8.2 * k, 15.5 * k);
    this.camera.updateProjectionMatrix();
    this.placeCamera();
    // Labels grow only on genuinely narrow stages (phones); the host can shrink them overall.
    this.labelScale = (aspect < 1 ? 1.5 : aspect < 1.3 ? 1.15 : 1) * (this.opts.labelScale ?? 1);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Sprite) this.fit(o);
    });
    this.render();
  }

  private placeCamera() {
    const target = this.camTarget.clone();
    const pos = this.camBase.clone();
    if (this.focus && this.dolly > 0) {
      // Push about a fifth of the way in and lean the view toward the booked route.
      target.lerp(this.focus, 0.45 * this.dolly);
      pos.lerp(this.focus, 0.2 * this.dolly);
    }
    const v = this.view;
    if (v.yaw || v.pitch || v.zoom !== 1) {
      const s = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
      s.theta += v.yaw;
      s.phi = Math.max(0.15, Math.min(1.45, s.phi - v.pitch));
      s.radius *= v.zoom;
      pos.setFromSpherical(s).add(target);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
  }

  private fit(s: THREE.Sprite) {
    const base = (s.userData.base as THREE.Vector3 | undefined) ?? (s.userData.base = s.scale.clone());
    s.scale.copy(base).multiplyScalar(this.labelScale);
  }

  private render() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  private tick = (now: number) => {
    this.raf = 0;
    this.tweens = this.tweens.filter((t) => {
      const k = Math.min(1, (now - t.start) / t.dur);
      t.step(k);
      if (k >= 1) {
        t.done?.();
        return false;
      }
      return true;
    });
    this.render();
    if (this.tweens.length) this.raf = requestAnimationFrame(this.tick);
  };

  private tween(dur: number, step: (k: number) => void, delay = 0, done?: () => void) {
    if (this.reduced) {
      step(1);
      done?.();
      this.render();
      return;
    }
    this.tweens.push({ start: performance.now() + delay, dur, step: (k) => step(Math.max(0, k)), done });
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private arc(depH: number, arrH: number, z: number, lift = 1) {
    const x0 = xOf(depH);
    const x1 = xOf(arrH);
    const peak = Math.min(3.4, 0.9 + (arrH - depH) * 0.42) * lift;
    return new THREE.CubicBezierCurve3(
      new THREE.Vector3(x0, 0.02, z),
      new THREE.Vector3(x0 + (x1 - x0) * 0.2, peak, z),
      new THREE.Vector3(x0 + (x1 - x0) * 0.8, peak, z),
      new THREE.Vector3(x1, 0.02, z),
    );
  }

  private tube(curve: THREE.Curve<THREE.Vector3>, color: number, radius = 0.055) {
    const geo = new THREE.TubeGeometry(curve, 96, radius, 8, false);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.geometry.setDrawRange(0, 0);
    return mesh;
  }

  private drawIn(mesh: THREE.Mesh<THREE.TubeGeometry>, dur: number, delay = 0, curve?: THREE.Curve<THREE.Vector3>, headColor = WHITE) {
    const total = mesh.geometry.index!.count;
    // A bright tip leads the line as it draws, so the eye follows each route being found.
    const head = curve ? new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: headColor, transparent: true })) : null;
    if (head) {
      head.visible = false;
      mesh.parent?.add(head) ?? this.scene.add(head);
    }
    this.tween(
      dur,
      (k) => {
        const e = easeOut(k);
        mesh.geometry.setDrawRange(0, Math.floor((total * e) / 6) * 6);
        if (head && curve) {
          head.visible = k > 0 && k < 1;
          head.position.copy(curve.getPoint(Math.min(0.999, e)));
          (head.material as THREE.MeshBasicMaterial).opacity = 1 - k * k;
        }
      },
      delay,
      () => {
        if (head) {
          head.parent?.remove(head);
          head.geometry.dispose();
          (head.material as THREE.Material).dispose();
        }
      },
    );
  }

  /** While the agent shops, a scan line crosses the time axis. It stops once options arrive. */
  private startSweep() {
    if (!this.sweep) {
      this.sweep = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, 10.4),
        new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      this.sweep.rotation.x = -Math.PI / 2;
      this.sweep.position.set(xOf(AXIS_FROM), 0.03, -1);
      this.scene.add(this.sweep);
    }
    const sw = this.sweep;
    sw.visible = true;
    const pass = (n: number) =>
      this.tween(
        1700,
        (k) => {
          sw.position.x = xOf(AXIS_FROM) + (xOf(AXIS_TO) - xOf(AXIS_FROM)) * easeOut(k);
          (sw.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k * 0.6);
        },
        0,
        () => {
          if (this.status === "canceled" && n < 5) pass(n + 1);
          else sw.visible = false;
        },
      );
    pass(1);
  }

  /** One ring opens where the booked route lands. */
  private ripple(at: THREE.Vector3) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 48), new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(at).setY(0.04);
    this.scene.add(ring);
    this.tween(
      1400,
      (k) => {
        const e = easeOut(k);
        ring.scale.setScalar(1 + e * 5);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - e;
      },
      0,
      () => {
        this.scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      },
    );
  }

  /** Bring the scene in line with the state. Safe to call on every state change. */
  update(trip: Trip | null, offers: Offer[]) {
    if (!trip) return;
    if (trip.status === "scheduled" && this.status !== "scheduled") this.resetScene();
    if (!this.original) this.buildOriginal(trip);
    if (trip.status !== "scheduled" && this.original && !this.original.broken) {
      this.breakOriginal();
      this.status = trip.status;
      if (trip.status === "canceled") this.startSweep();
    }

    const ranked = offers.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
    ranked.forEach((o, i) => {
      const existing = this.routes.get(o.offerId);
      if (!existing) this.addRoute(o, i);
      else this.syncRoute(existing, o);
    });

    const booked = offers.find((o) => o.status === "booked" && o.kind !== "hotel");
    if (booked && this.flownFor !== booked.offerId) this.fly(booked.offerId);
    this.status = trip.status;
    this.render();
  }

  private laneOf(o: Offer, i: number) {
    if (o.rank === 0) return -4.2 - (i % 2) * 1.3;
    return 3.2 - (o.rank - 1) * 1.6;
  }

  private buildOriginal(trip: Trip) {
    const dep = (clockHours(trip.departs) ?? 6.67) + PT_TO_ET;
    // Drawn to the length of a nonstop crossing; no arrival time is claimed for it.
    const curve = this.arc(dep, dep + 5.5, -1);
    const tube = this.tube(curve, WHITE, 0.07);
    tube.geometry.setDrawRange(0, tube.geometry.index!.count);
    const group = new THREE.Group();
    group.add(tube);
    const label = textSprite(
      [
        { text: trip.flight, weight: 700, size: 30, color: "#ffffff" },
        { text: `Departs ${trip.departs} from SFO`, weight: 600, size: 22, color: "#b8b8b8" },
      ],
      { height: 0.8 },
    );
    label.center.set(0.5, 0);
    label.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 0.25, 0));
    group.add(label);
    this.scene.add(group);
    this.original = { group, tube, mat: tube.material as THREE.MeshBasicMaterial, broken: false };
  }

  private breakOriginal() {
    const o = this.original!;
    o.broken = true;
    o.mat.color.setHex(ALERT);
    const canceled = textSprite([{ text: "CANCELED", weight: 900, size: 34, color: "#ff5a4e" }], { height: 0.55 });
    canceled.center.set(0.5, 0);
    const lbl = o.group.children[1] as THREE.Sprite;
    canceled.position.copy(lbl.position).add(new THREE.Vector3(0, 0.85, 0));
    o.group.add(canceled);
    const total = (o.tube as THREE.Mesh<THREE.TubeGeometry>).geometry.index!.count;
    // The arc snaps at its middle, then falls and fades.
    this.tween(260, (k) => (o.tube as THREE.Mesh<THREE.TubeGeometry>).geometry.setDrawRange(0, Math.floor((total * (1 - 0.5 * k)) / 6) * 6));
    this.tween(
      1400,
      (k) => {
        const e = easeOut(k);
        o.group.position.y = -2.6 * e * e;
        o.group.rotation.z = -0.08 * e;
        o.group.children.forEach((c) => {
          const m = (c as THREE.Mesh | THREE.Sprite).material as THREE.Material & { opacity: number };
          m.transparent = true;
          m.opacity = 1 - 0.82 * e;
        });
      },
      900,
    );
  }

  private routeLabel(o: Offer) {
    const price = o.priceCents === 0 ? "Free" : `$${Math.round(o.priceCents / 100).toLocaleString("en-US")}`;
    const head = o.rank ? `${o.rank}  ${o.merchant}` : o.merchant;
    const sub = o.rank === 0 ? `Set aside · ${price}` : price;
    const key = `${head}|${sub}|${o.status}`;
    const booked = o.status === "booked";
    const s = textSprite(
      [
        { text: head, weight: 800, size: 30, color: booked ? "#0b0b0b" : o.rank === 0 ? "#8a8a8a" : "#ffffff" },
        { text: sub, weight: 600, size: 22, color: booked ? "#3d3300" : "#b8b8b8" },
      ],
      { bg: booked ? "#ffcc00" : undefined, pad: 8, height: 1.05 },
    );
    s.center.set(0.5, 0);
    return { s, key };
  }

  private addRoute(o: Offer, i: number) {
    const z = this.laneOf(o, i);
    const group = new THREE.Group();
    let curve: THREE.CubicBezierCurve3;
    if (o.kind === "hotel") {
      // A night in a hotel is a low rest bar from late tonight to check-out.
      // Check in around 9 PM in San Francisco (midnight in New York), out at the listed time.
      const checkIn = 12;
      const end = (clockHours(o.arrives, checkIn - PT_TO_ET) ?? 17) + PT_TO_ET;
      curve = this.arc(checkIn, end, z, 0.12);
    } else {
      const dep = (clockHours(o.departs) ?? 12) + PT_TO_ET;
      const arr = clockHours(o.arrives, dep) ?? dep + 5;
      curve = this.arc(dep, arr, z);
    }
    const color = o.rank === 0 ? SOFT : o.rank === 1 ? YELLOW : o.kind === "hotel" ? 0x9a9a9a : 0xc8c8c8;
    const tube = this.tube(curve, color, o.kind === "hotel" ? 0.09 : 0.055);
    group.add(tube);

    const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24), new THREE.MeshBasicMaterial({ color, transparent: true }));
    endCap.position.copy(curve.getPoint(1));
    endCap.scale.setScalar(0.001);
    group.add(endCap);

    const { s, key } = this.routeLabel(o);
    // Each label stands over its landing, so the deadline frame reads straight against it.
    const land = curve.getPoint(1);
    s.center.set(0.5, 0);
    s.position.set(land.x, o.rank ? 0.7 + (o.rank - 1) * 0.75 : 0.7, z);
    this.fit(s);
    (s.material as THREE.SpriteMaterial).opacity = 0;
    group.add(s);
    this.scene.add(group);

    const route: Route = { offer: o, group, tube, curve, label: s, labelKey: key, endCap };
    this.routes.set(o.offerId, route);

    const delay = (o.rank || 5 + i) * 160;
    this.drawIn(tube, 900, delay, curve);
    this.tween(300, (k) => endCap.scale.setScalar(Math.max(0.001, easeOut(k))), delay + 800);
    this.tween(400, (k) => ((s.material as THREE.SpriteMaterial).opacity = easeOut(k)), delay + 500);

    if (o.rank === 0) this.drop(route, delay + 2000);
  }

  /** Closed routes drop off the panel: drawn, held for a beat, then through the floor. */
  private drop(route: Route, delay: number) {
    const { group, tube, endCap, label: s } = route;
    {
      this.tween(
        1300,
        (k) => {
          const e = easeOut(k);
          group.position.y = -3.2 * e;
          tube.material.opacity = 1 - 0.75 * e;
          (endCap.material as THREE.MeshBasicMaterial).opacity = 1 - 0.75 * e;
          (s.material as THREE.SpriteMaterial).opacity = 1 - e;
        },
        delay,
      );
    }
  }

  private syncRoute(r: Route, o: Offer) {
    const prevStatus = r.offer.status;
    const wasRanked = r.offer.rank > 0;
    r.offer = o;
    const { s, key } = this.routeLabel(o);
    if (key !== r.labelKey) {
      s.position.copy(r.label.position);
      this.fit(s);
      r.group.remove(r.label);
      disposeSprite(r.label);
      r.group.add(s);
      r.label = s;
      r.labelKey = key;
    } else {
      disposeSprite(s);
    }
    if (wasRanked && o.rank === 0) {
      r.tube.material.color.setHex(SOFT);
      this.drop(r, 600);
    }
    if (o.status === "booked" && prevStatus !== "booked") {
      r.tube.material.color.setHex(YELLOW);
      (r.endCap.material as THREE.MeshBasicMaterial).color.setHex(YELLOW);
      // Everything else steps back.
      for (const other of this.routes.values()) {
        if (other === r || other.offer.rank === 0) continue;
        if (o.kind !== "hotel") this.tween(500, (k) => (other.tube.material.opacity = 1 - 0.7 * easeOut(k)));
      }
    }
  }

  /** One short red flash on a route: the agent tried to buy it and the database refused. */
  refuse(offerId: string) {
    const r = this.routes.get(offerId);
    if (!r) return;
    const base = r.tube.material.color.getHex();
    r.tube.material.color.setHex(ALERT);
    this.tween(900, () => {}, 0, () => r.tube.material.color.setHex(base));
  }

  private fly(offerId: string) {
    const r = this.routes.get(offerId);
    if (!r) return;
    this.flownFor = offerId;
    if (!this.plane) {
      this.plane = new THREE.Mesh(new THREE.ShapeGeometry(planeShape()), new THREE.MeshBasicMaterial({ color: YELLOW, side: THREE.DoubleSide }));
      this.plane.scale.setScalar(0.42);
      this.scene.add(this.plane);
    }
    const p = this.plane;
    p.visible = true;
    const tan = new THREE.Vector3();
    const at = (k: number) => {
      const t = easeOut(k) * 0.999;
      p.position.copy(r.curve.getPoint(t)).add(new THREE.Vector3(0, 0.12, 0));
      r.curve.getTangent(t, tan);
      p.rotation.set(-Math.PI / 2, 0, 0);
      p.rotateZ(Math.atan2(-tan.z, tan.x));
      p.rotateY(-Math.atan2(tan.y, Math.hypot(tan.x, tan.z)));
    };
    at(0);
    this.focus = r.curve.getPoint(0.55);
    this.tween(2600, at, 200, () => this.ripple(r.curve.getPoint(1)));
    this.tween(2200, (k) => {
      this.dolly = easeOut(k);
      this.placeCamera();
    }, 100);
  }

  private resetScene() {
    this.tweens = [];
    for (const r of this.routes.values()) {
      this.scene.remove(r.group);
      r.tube.geometry.dispose();
      r.tube.material.dispose();
      disposeSprite(r.label);
    }
    this.routes.clear();
    if (this.original) {
      this.scene.remove(this.original.group);
      this.original = null;
    }
    if (this.plane) this.plane.visible = false;
    if (this.sweep) this.sweep.visible = false;
    this.flownFor = "";
    this.focus = null;
    this.dolly = 0;
    this.placeCamera();
  }

  dispose() {
    this.disposed = true;
    this.unbind?.();
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) {
        (mat as THREE.SpriteMaterial).map?.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
