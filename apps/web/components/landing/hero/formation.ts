import type { ArtifactId, Phase } from "@/lib/hero-job";
import { NATURAL } from "./documents";

export type DocId = ArtifactId | "order";

export interface Pose {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
  zIndex: number;
}

export interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotate: number;
}

export interface Formation {
  poses: Record<DocId, Pose>;
  /** Dashed outlines for evidence the work order expects but has not arrived. */
  slots: { id: ArtifactId; rect: Rect }[];
  /** Where a check's pulse radiates from. */
  focus: { x: number; y: number };
}

export interface FormationInput {
  w: number;
  h: number;
  phase: Phase;
  arrived: number;
  inspecting: DocId | null;
  /** Before the run starts: everything waits off the table. */
  idle: boolean;
}

const ARTIFACTS: ArtifactId[] = ["before", "after", "signature", "receipt", "note"];

function pose(id: DocId, cx: number, cy: number, scale: number, rotate: number, zIndex: number, opacity = 1): Pose {
  const [w, h] = NATURAL[id];
  return { x: cx - w / 2, y: cy - h / 2, scale, rotate, opacity, zIndex };
}

function rectOf(id: DocId, p: Pose): Rect {
  const [w, h] = NATURAL[id];
  return { cx: p.x + w / 2, cy: p.y + h / 2, w: w * p.scale, h: h * p.scale, rotate: p.rotate };
}

/** Fits a natural box inside a region, capped so nothing grows past `max`. */
function fit(id: DocId, rw: number, rh: number, max: number) {
  const [w, h] = NATURAL[id];
  return Math.min(max, rw / w, rh / h);
}

/**
 * Evidence arrives from the technician's side of the table (bottom right),
 * tilted as if tossed down; the work order slides in from the left.
 */
function entry(id: DocId, w: number, h: number, landing: Pose): Pose {
  if (id === "order") return { ...landing, x: landing.x - w * 0.5, rotate: -9, opacity: 0 };
  return { ...landing, x: landing.x + w * 0.45, y: landing.y + h * 0.35, rotate: landing.rotate + 18, opacity: 0 };
}

/** The intake spread: work order on the left, evidence landing beside it. */
function intake(w: number, h: number): Record<DocId, Pose> {
  const compact = w < 560;
  const pad = 18;
  const orderScale = fit("order", compact ? w * 0.5 : w * 0.36, h - pad * 2, 1);
  const orderW = NATURAL.order[0] * orderScale;
  const orderCx = compact ? pad + orderW / 2 : Math.max(pad + orderW / 2, w * 0.2);

  // Evidence region to the right of the work order, overlapping it slightly.
  const x0 = orderCx + orderW / 2 - (compact ? orderW * 0.18 : 8);
  const x1 = w - pad;
  const rw = x1 - x0;
  const s = Math.min(compact ? 0.58 : 1, (rw / 460) * (compact ? 1.25 : 1), (h - pad * 2) / 390);
  const at = (fx: number, fy: number) => [x0 + rw * fx, pad + (h - pad * 2) * fy] as const;

  const spot: Record<ArtifactId, readonly [number, number, number]> = compact
    ? { before: [0.34, 0.2, -5], after: [0.68, 0.34, 4], signature: [0.36, 0.56, 3], receipt: [0.74, 0.7, -4], note: [0.44, 0.86, -2] }
    : { before: [0.24, 0.24, -4], after: [0.72, 0.22, 3.5], signature: [0.23, 0.68, 2.5], receipt: [0.84, 0.66, -3], note: [0.53, 0.86, -1.5] };

  const poses = { order: pose("order", orderCx, h / 2, orderScale, -1.5, 20) } as Record<DocId, Pose>;
  ARTIFACTS.forEach((id, i) => {
    const [fx, fy, r] = spot[id];
    const [cx, cy] = at(fx, fy);
    poses[id] = pose(id, cx, cy, s, r, 30 + i);
  });
  return poses;
}

interface Strip {
  poses: Record<ArtifactId, Pose>;
  top: number;
}

/** The evidence strip along the bottom edge, squared up and in order. */
function strip(w: number, h: number, x0: number, x1: number): Strip {
  const pad = 16;
  const gap = w < 560 ? 8 : 14;
  const total = ARTIFACTS.reduce((sum, id) => sum + NATURAL[id][0], 0);
  const s = Math.min(0.52, (x1 - x0 - gap * (ARTIFACTS.length - 1)) / total, (h * 0.3) / NATURAL.receipt[1]);
  const used = total * s + gap * (ARTIFACTS.length - 1);
  let x = x0 + (x1 - x0 - used) / 2;
  const base = h - pad;
  const poses = {} as Record<ArtifactId, Pose>;
  let top = base;
  ARTIFACTS.forEach((id, i) => {
    const [nw, nh] = NATURAL[id];
    const cx = x + (nw * s) / 2;
    const cy = base - (nh * s) / 2;
    top = Math.min(top, base - nh * s);
    poses[id] = pose(id, cx, cy, s, 0, 30 + i);
    x += nw * s + gap;
  });
  return { poses, top };
}

export function formation({ w, h, phase, arrived, inspecting, idle }: FormationInput): Formation {
  const pad = 16;
  const compact = w < 560;

  if (phase === "field" || phase === "evidence" || idle) {
    const landing = intake(w, h);
    const poses = { ...landing };
    const slots: Formation["slots"] = [];
    ARTIFACTS.forEach((id, i) => {
      if (idle || i >= arrived) {
        poses[id] = entry(id, w, h, landing[id]);
        if (!idle) slots.push({ id, rect: rectOf(id, landing[id]) });
      }
    });
    if (idle) poses.order = entry("order", w, h, landing.order);
    return { poses, slots, focus: { x: w * 0.5, y: h * 0.5 } };
  }

  if (phase === "closed") {
    const s = fit("order", w * 0.5, h - pad * 2 - 12, 1);
    const cx = w / 2;
    const cy = h / 2;
    const [ow, oh] = NATURAL.order;
    const bw = ow * s;
    const bh = oh * s;
    const k = 0.62 * s;
    // Tucked behind the stamped work order like a clipped bundle.
    const bundle: Record<ArtifactId, readonly [number, number, number]> = {
      before: [-0.42, -0.2, -9],
      after: [0.44, -0.24, 8],
      signature: [-0.46, 0.24, 6],
      receipt: [0.46, 0.18, -7],
      note: [0.02, 0.4, 3],
    };
    const poses = { order: pose("order", cx, cy, s, -1.5, 40) } as Record<DocId, Pose>;
    ARTIFACTS.forEach((id, i) => {
      const [fx, fy, r] = bundle[id];
      poses[id] = pose(id, cx + bw * fx, cy + bh * fy, k, r, 10 + i);
    });
    return { poses, slots: [], focus: { x: cx + bw * 0.28, y: cy + bh * 0.34 } };
  }

  // verify + decision: work order pinned, evidence in a strip, one item under the lens.
  const pinScale = fit("order", compact ? w * 0.3 : w * 0.19, h * 0.5, 0.56);
  const [ow, oh] = NATURAL.order;
  const pinned = pose("order", pad + (ow * pinScale) / 2, pad + (oh * pinScale) / 2, pinScale, 0, 20);
  const stripX0 = compact ? pad : pad + ow * pinScale + 20;
  const row = strip(w, h, stripX0, w - pad);

  const lensX0 = compact ? pad + ow * pinScale + 12 : stripX0;
  // Room above the lens for the "reading / verified" chip.
  const lens = { x0: lensX0, y0: pad + 30, x1: w - pad, y1: row.top - 14 };
  const lensCx = (lens.x0 + lens.x1) / 2;
  const lensCy = (lens.y0 + lens.y1) / 2;
  const lensW = lens.x1 - lens.x0;
  const lensH = lens.y1 - lens.y0;

  const poses = { order: pinned, ...row.poses } as Record<DocId, Pose>;
  const slots: Formation["slots"] = [];

  const target: DocId | null = phase === "decision" ? "order" : inspecting;
  if (target) {
    const s = fit(target, lensW * 0.94, lensH * 0.94, target === "order" ? 1 : 1.75);
    poses[target] = pose(target, lensCx, lensCy, s, 0, 50);
    if (target !== "order") slots.push({ id: target, rect: rectOf(target, row.poses[target]) });
  }
  return { poses, slots, focus: { x: lensCx, y: lensCy } };
}
