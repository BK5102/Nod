import * as THREE from "three";

/**
 * The money route. One invoice, two lanes. The baseline lane has no checkpoints: the remittance slip
 * runs straight into the account the invoice names. The Nod lane runs the same slip through one gate
 * per check, lit from the database's real rule results; a HOLD gate stays shut and the slip is set
 * aside in the held tray. Ink on agenda paper, voting-card colours, no glow.
 */

export interface RouteCheck {
  id: string;
  label: string;
  fired: boolean;
  tier: string;
  reason: string;
}

export interface RouteRun {
  amountCents: number;
  vendor: string;
  number: string;
  asksLast4: string;
  onFileLast4: string;
  checks: RouteCheck[];
}

const C = {
  paper: 0xedf0f3,
  sheet: 0xffffff,
  ink: 0x1d2733,
  inkSoft: 0x4a5868,
  rule: 0xc9d0d8,
  yes: 0x1e7a52,
  no: 0xc23a6b,
  tabled: 0xe2a82b,
};
const HEX = { ink: "#1d2733", inkSoft: "#4a5868", yes: "#1e7a52", no: "#c23a6b", tabled: "#e2a82b", white: "#ffffff" };

/** The checkpoints Nod's lane shows, in route order. Bank details last: the one this scam targets. */
const GATES: { id: string; label: string }[] = [
  { id: "sender_domain", label: "Sender" },
  { id: "new_vendor", label: "Vendor" },
  { id: "duplicate", label: "Duplicate" },
  { id: "po_match", label: "PO" },
  { id: "contract_price", label: "Price" },
  { id: "bank_change", label: "Bank account" },
];

const X_START = -9.2;
const X_END = 8.2;
const Z_BASE = -2.6; // baseline lane, further from the camera
const Z_NOD = 1.9; // Nod lane, closer: it is the subject
const SLIP_Y = 0.32;

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function fontFamily(): string {
  if (typeof document === "undefined") return "system-ui, sans-serif";
  return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
}

/** Draws text onto a canvas texture. Each line: [text, px size, weight, colour]. */
function textTexture(
  w: number,
  h: number,
  bg: string | null,
  lines: [string, number, number, string][],
  opts: { align?: CanvasTextAlign; pad?: number; gap?: number } = {},
): THREE.CanvasTexture {
  const scale = 2;
  const cv = document.createElement("canvas");
  cv.width = w * scale;
  cv.height = h * scale;
  const g = cv.getContext("2d")!;
  g.scale(scale, scale);
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  const fam = fontFamily();
  const pad = opts.pad ?? 18;
  const align = opts.align ?? "left";
  g.textAlign = align;
  g.textBaseline = "top";
  let y = pad;
  for (const [text, size, weight, color] of lines) {
    g.font = `${weight} ${size}px ${fam}`;
    g.fillStyle = color;
    const x = align === "center" ? w / 2 : align === "right" ? w - pad : pad;
    g.fillText(text, x, y);
    y += size * 1.18 + (opts.gap ?? 6);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

interface Tween {
  start: number;
  dur: number;
  fn: (t: number) => void;
  ease: (t: number) => number;
  done?: () => void;
  fired?: boolean;
}

interface Gate {
  id: string;
  x: number;
  pivot: THREE.Group;
  bar: THREE.Mesh;
  barMat: THREE.MeshStandardMaterial;
  label: string;
}

export class MoneyRoute {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private raf = 0;
  private clock = 0;
  private last = 0;
  private tweens: Tween[] = [];
  private gates: Gate[] = [];
  private slipBase: THREE.Mesh | null = null;
  private slipNod: THREE.Mesh | null = null;
  private accountBase: THREE.Mesh | null = null;
  private accountBaseMat: THREE.MeshStandardMaterial | null = null;
  private accountNod: THREE.Mesh | null = null;
  private tray: THREE.Group | null = null;
  private outcomeBase: THREE.Mesh | null = null;
  private outcomeNod: THREE.Mesh | null = null;
  private disposables: { dispose: () => void }[] = [];
  private pointer = { x: 0, y: 0 };
  private visible = true;
  private observer: IntersectionObserver;
  private reduced: boolean;
  onPhase?: (phase: "idle" | "running" | "done") => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(C.paper);
    this.camera = new THREE.OrthographicCamera(-12, 12, 6, -6, 0.1, 100);
    this.scene.background = new THREE.Color(C.paper);
    this.buildStage();
    this.resize();
    this.observer = new IntersectionObserver(([e]) => {
      this.visible = !!e?.isIntersecting;
    });
    this.observer.observe(canvas);
    canvas.addEventListener("pointermove", this.onPointer);
    window.addEventListener("resize", this.resize);
    this.last = performance.now();
    this.loop();
  }

  // ------------------------------------------------------------ stage

  private mat(color: number, rough = 0.92): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    this.disposables.push(m);
    return m;
  }

  private box(w: number, h: number, d: number, material: THREE.Material | THREE.Material[]): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d);
    this.disposables.push(g);
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /** A flat label lying on the ground or standing up. */
  private label(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
    this.disposables.push(tex);
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1 });
    this.disposables.push(m);
    const g = new THREE.PlaneGeometry(w, h);
    this.disposables.push(g);
    return new THREE.Mesh(g, m);
  }

  private buildStage() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0xc9d0d8, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-6, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0004;
    s.add(sun);

    const groundG = new THREE.PlaneGeometry(60, 40);
    this.disposables.push(groundG);
    const ground = new THREE.Mesh(groundG, this.mat(C.paper, 1));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    // Two lanes: sheets of white stock on the agenda paper.
    for (const [z, title, sub] of [
      [Z_BASE, "Baseline agent", "A pay-everything agent we wrote"],
      [Z_NOD, "Nod", "Same invoice, every check from the database"],
    ] as [number, string, string][]) {
      const lane = this.box(X_END - X_START + 2.2, 0.04, 2.8, this.mat(C.sheet));
      lane.position.set((X_START + X_END) / 2 + 0.2, 0.02, z);
      lane.castShadow = false;
      s.add(lane);
      const tag = this.label(textTexture(620, 150, null, [[title, 64, 700, HEX.ink], [sub, 30, 400, HEX.inkSoft]]), 5.0, 1.2);
      tag.rotation.x = -Math.PI / 2;
      tag.position.set(X_START + 2.0, 0.05, z - 2.1);
      s.add(tag);
    }

    // The account the invoice names, at the end of the baseline lane.
    this.accountBaseMat = this.mat(C.sheet);
    this.accountBase = this.accountCard(this.accountBaseMat, Z_BASE);
    // The account on file, at the end of Nod's lane. Nothing ever reaches it in this run.
    this.accountNod = this.accountCard(this.mat(C.sheet), Z_NOD);

    // Checkpoint gates on Nod's lane: two ink posts and a crossbar hinged at the far post.
    const first = X_START + 6.2;
    const last = X_END - 3.0;
    GATES.forEach((gdef, i) => {
      const x = first + ((last - first) * i) / (GATES.length - 1);
      for (const dz of [-1.2, 1.2]) {
        const p = this.box(0.14, 1.5, 0.14, this.mat(C.ink, 0.7));
        p.position.set(x, 0.75, Z_NOD + dz);
        s.add(p);
      }
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.16, Z_NOD - 1.2);
      const barMat = this.mat(C.ink, 0.75);
      const bar = this.box(0.16, 0.42, 2.4, barMat);
      bar.position.set(0, 0, 1.2);
      pivot.add(bar);
      s.add(pivot);
      // The check's name, printed on the lane in front of its gate.
      const tag = this.label(textTexture(300, 76, null, [[gdef.label, 42, 700, HEX.ink]], { align: "center", pad: 14 }), 2.0, 0.5);
      tag.rotation.x = -Math.PI / 2;
      tag.position.set(x, 0.05, Z_NOD + 1.62);
      s.add(tag);
      this.gates.push({ id: gdef.id, x, pivot, bar, barMat, label: gdef.label });
    });

    // The held tray, beside the bank-details gate, toward the camera.
    const bank = this.gates[this.gates.length - 1]!;
    const tray = new THREE.Group();
    const base = this.box(2.3, 0.06, 1.5, this.mat(C.tabled));
    tray.add(base);
    for (const [w, d, x, z] of [
      [2.3, 0.1, 0, -0.75],
      [2.3, 0.1, 0, 0.75],
      [0.1, 1.5, -1.15, 0],
      [0.1, 1.5, 1.15, 0],
    ] as [number, number, number, number][]) {
      const lip = this.box(w, 0.22, d, this.mat(C.tabled));
      lip.position.set(x, 0.11, z);
      tray.add(lip);
    }
    const trayTag = this.label(textTexture(420, 64, null, [["Held for a callback", 34, 700, HEX.ink]]), 3.3, 0.5);
    trayTag.rotation.x = -Math.PI / 2;
    trayTag.position.set(0.5, 0.0, 1.25);
    tray.add(trayTag);
    tray.position.set(bank.x + 2.4, 0.04, Z_NOD + 3.1);
    s.add(tray);
    this.tray = tray;
  }

  private accountCard(material: THREE.MeshStandardMaterial, z: number): THREE.Mesh {
    const card = this.box(2.4, 2.8, 0.2, material);
    card.position.set(X_END + 0.7, 1.4, z - 0.7);
    this.scene.add(card);
    return card;
  }

  private setAccountFace(card: THREE.Mesh, lines: [string, number, number, string][], bg: string) {
    const tex = textTexture(380, 444, bg, lines, { align: "center", pad: 46, gap: 16 });
    this.disposables.push(tex);
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    this.disposables.push(face);
    const side = Array.isArray(card.material) ? card.material[0]! : card.material;
    // Box faces are +x, -x, +y, -y, +z, -z; +z faces the camera.
    card.material = [side, side, side, side, face, side];
  }

  private slip(run: RouteRun, z: number): THREE.Mesh {
    const tex = textTexture(
      520,
      300,
      HEX.white,
      [
        [run.vendor, 34, 700, HEX.ink],
        [`Invoice ${run.number}`, 26, 400, HEX.inkSoft],
        [money(run.amountCents), 64, 700, HEX.ink],
        [`Pay into ...${run.asksLast4}`, 34, 700, HEX.no],
      ],
      { pad: 24, gap: 4 },
    );
    this.disposables.push(tex);
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    this.disposables.push(top);
    const side = this.mat(0xf4f6f8);
    const m = this.box(2.6, 0.04, 1.5, [side, side, top, side, side, side]);
    m.position.set(X_START, SLIP_Y + 2.4, z);
    m.rotation.set(0, 0, 0);
    this.scene.add(m);
    return m;
  }

  private outcome(text: [string, number, number, string][], z: number, x: number, w = 5.2): THREE.Mesh {
    const lbl = this.label(textTexture(Math.round(w * 120), 150, null, text, { pad: 10 }), w, 1.25);
    lbl.rotation.x = -Math.PI / 2;
    lbl.position.set(x, 0.06, z);
    this.scene.add(lbl);
    return lbl;
  }

  // ------------------------------------------------------------ choreography

  private tween(delay: number, dur: number, fn: (t: number) => void, ease = easeInOut, done?: () => void) {
    this.tweens.push({ start: this.clock + delay, dur: Math.max(0.0001, dur), fn, ease, done });
  }

  /** Clears the previous run and leaves the route empty, gates shut. */
  reset() {
    this.tweens = [];
    for (const m of [this.slipBase, this.slipNod, this.outcomeBase, this.outcomeNod]) if (m) this.scene.remove(m);
    this.slipBase = this.slipNod = this.outcomeBase = this.outcomeNod = null;
    for (const g of this.gates) {
      g.pivot.rotation.x = 0;
      g.barMat.color.set(C.ink);
    }
    if (this.accountBaseMat) this.accountBaseMat.color.set(C.sheet);
    this.onPhase?.("idle");
  }

  /** Plays one run from real results. Reduced motion jumps to the final state. */
  play(run: RouteRun, opts: { instant?: boolean } = {}) {
    this.reset();
    this.onPhase?.("running");
    if (this.accountBase) {
      this.setAccountFace(this.accountBase, [["Account", 30, 400, HEX.inkSoft], [`...${run.asksLast4}`, 64, 700, HEX.ink], ["Named by the invoice", 24, 400, HEX.inkSoft], ["Not on file", 30, 700, HEX.no]], HEX.white);
    }
    if (this.accountNod) {
      this.setAccountFace(this.accountNod, [["Account", 30, 400, HEX.inkSoft], [`...${run.onFileLast4}`, 64, 700, HEX.ink], ["On file", 24, 400, HEX.inkSoft], ["Paid only after checks", 26, 700, HEX.yes]], HEX.white);
    }
    this.slipBase = this.slip(run, Z_BASE);
    this.slipNod = this.slip(run, Z_NOD);
    const byId = new Map(run.checks.map((c) => [c.id, c]));

    const T = this.reduced || opts.instant ? 0 : 1;
    // Both slips drop into the inbox together.
    for (const slip of [this.slipBase, this.slipNod]) {
      const s = slip;
      this.tween(0, 0.55 * T, (t) => {
        s.position.y = SLIP_Y + 2.4 * (1 - t);
        s.rotation.z = (1 - t) * 0.25;
      }, easeOut);
    }

    // Baseline: straight down the lane, no checks, into the named account.
    const b = this.slipBase;
    this.tween(0.75 * T, 1.7 * T, (t) => {
      b.position.x = X_START + (X_END - 0.9 - X_START) * t;
      b.position.y = SLIP_Y + Math.sin(t * Math.PI) * 0.35;
    }, easeInOut);
    this.tween(2.45 * T, 0.35 * T, (t) => {
      b.position.x = X_END - 0.9 + t * 0.9;
      b.scale.setScalar(1 - t * 0.95);
    }, easeOut, () => {
      this.accountBaseMat?.color.set(C.no);
      if (this.accountBase && Array.isArray(this.accountBase.material)) (this.accountBase.material[4] as THREE.MeshStandardMaterial).color.set(0xf3d3df);
      this.outcomeBase = this.outcome([[`Sent ${money(run.amountCents)} to ...${run.asksLast4}`, 44, 700, HEX.no], ["No checks. The money is gone.", 30, 400, HEX.ink]], Z_BASE + 0.15, X_END - 4.4, 6.4);
    });

    // Nod: gate by gate. Pass opens the bar and colours it yes; a HOLD keeps it shut in tabled stock.
    const n = this.slipNod;
    let at = 0.75 * T;
    let x = X_START;
    for (const g of this.gates) {
      const c = byId.get(g.id);
      const hold = !!c && c.fired && c.tier === "HOLD";
      const ask = !!c && c.fired && c.tier === "ASK";
      const stopX = g.x - 1.25;
      const fromX = x;
      this.tween(at, 0.55 * T, (t) => {
        n.position.x = fromX + (stopX - fromX) * t;
      }, easeInOut);
      at += 0.55 * T;
      // The check itself: a beat at the gate.
      const gate = g;
      if (hold) {
        this.tween(at, 0.25 * T, (t) => {
          gate.barMat.color.lerpColors(new THREE.Color(C.ink), new THREE.Color(C.tabled), t);
          gate.pivot.rotation.x = Math.sin(t * Math.PI * 3) * 0.06 * (1 - t);
        }, easeOut);
        // The slip bumps the shut gate, then is set aside into the held tray.
        this.tween(at + 0.1 * T, 0.18 * T, (t) => {
          n.position.x = stopX + Math.sin(t * Math.PI) * 0.35;
        }, easeOut);
        const trayX = this.tray!.position.x;
        const trayZ = this.tray!.position.z;
        this.tween(at + 0.55 * T, 0.8 * T, (t) => {
          n.position.x = stopX + (trayX - stopX) * t;
          n.position.z = Z_NOD + (trayZ - Z_NOD) * t;
          n.position.y = SLIP_Y + Math.sin(t * Math.PI) * 0.9 - t * 0.12;
          n.rotation.y = t * 0.12;
        }, easeInOut, () => {
          this.outcomeNod = this.outcome([[`Held. Nothing sent.`, 40, 700, HEX.ink], [c?.reason ?? "", 22, 400, HEX.ink]], Z_NOD + 4.15, X_START + 4.6, 11.5);
          this.onPhase?.("done");
        });
        return;
      }
      this.tween(at, 0.3 * T, (t) => {
        gate.pivot.rotation.x = -t * 1.35;
        gate.barMat.color.lerpColors(new THREE.Color(C.ink), new THREE.Color(ask ? C.tabled : C.yes), t);
      }, easeOut);
      at += 0.3 * T;
      x = stopX;
    }
    // No gate held: Nod pays the account on file.
    this.tween(at, 0.8 * T, (t) => {
      n.position.x = x + (X_END - 0.9 - x) * t;
    }, easeInOut, () => {
      this.outcomeNod = this.outcome([[`Paid ${money(run.amountCents)} to ...${run.onFileLast4}`, 40, 700, HEX.yes], ["Every check passed.", 26, 400, HEX.ink]], Z_NOD + 4.15, X_END - 3.2, 6.4);
      this.onPhase?.("done");
    });
  }

  // ------------------------------------------------------------ frame loop

  private onPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  };

  private resize = () => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    // Fit the whole route across the width; on narrow screens fit the height instead.
    const aspect = w / h;
    const halfW = aspect >= 2.2 ? 13.6 : Math.max(11.8, 8.2 * aspect);
    const halfH = halfW / aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    // Real time even on slow GPUs: a dropped frame skips ahead rather than slowing the story down.
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible || document.hidden) return;
    this.clock += dt;
    for (const tw of this.tweens) {
      const t = (this.clock - tw.start) / tw.dur;
      if (t < 0) continue;
      const c = Math.min(1, t);
      tw.fn(tw.ease(c));
      if (c >= 1 && !tw.fired) {
        tw.fired = true;
        tw.done?.();
      }
    }
    this.tweens = this.tweens.filter((tw) => !tw.fired);
    // A slow, small parallax so the scene reads as a place, not a picture.
    const px = this.reduced ? 0 : this.pointer.x * 0.9;
    const py = this.reduced ? 0 : this.pointer.y * 0.5;
    this.camera.position.set(-3 + px, 15 - py, 15);
    this.camera.lookAt(0.9, 0, -1.3);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.canvas.removeEventListener("pointermove", this.onPointer);
    window.removeEventListener("resize", this.resize);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
