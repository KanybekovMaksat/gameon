// The turtle's world: a program of one loop, run into timed steps, and a tolerant comparison of two drawings.
// Heading 0 points up; a turn goes clockwise on screen, like «поверни направо».

export type Pt = { x: number; y: number }
export type Seg = [Pt, Pt]
export type Box = { x: number; y: number; w: number; h: number }

// `повтори n: [повтори inner: вперёд len, поверни 360/inner] | вперёд len, поверни a`. `inner` 0 means a plain body.
export type Prog = { n: number; a: number; len: number; inner: number }

// One step of the run. `line` is the code line it comes from; `i` and `j` are the outer and inner repeat, from 0.
export type Step = { kind: 'fd' | 'rt'; line: number; i: number; j: number; from: Pt; to: Pt; h0: number; h1: number; dur: number }

const rad = (d: number) => (d * Math.PI) / 180

// Lines of the code view: plain 0 повтори, 1 вперёд, 2 поверни; nested 0 повтори, 1 повтори, 2 вперёд, 3 поверни, 4 поверни.
export function run(p: Prog): Step[] {
  const out: Step[] = []
  let at: Pt = { x: 0, y: 0 }
  let h = 0
  // The first repeats go slowly so the eye can follow; later ones speed up, the idea is already clear.
  const speed = p.inner ? 330 : 220
  const turnFull = p.inner ? 600 : 800
  const fd = (line: number, i: number, j: number, f: number) => {
    const to = { x: at.x + Math.sin(rad(h)) * p.len, y: at.y - Math.cos(rad(h)) * p.len }
    out.push({ kind: 'fd', line, i, j, from: at, to, h0: h, h1: h, dur: (p.len / speed) * 1000 * f })
    at = to
  }
  const rt = (line: number, i: number, j: number, a: number, f: number) => {
    out.push({ kind: 'rt', line, i, j, from: at, to: at, h0: h, h1: h + a, dur: Math.max(120, (a / 360) * turnFull) * f })
    h += a
  }
  for (let i = 0; i < p.n; i++) {
    const f = p.inner ? Math.max(0.12, 0.7 ** i) : Math.max(0.35, 0.85 ** i)
    if (p.inner) {
      for (let j = 0; j < p.inner; j++) { fd(2, i, j, f); rt(3, i, j, 360 / p.inner, f) }
      rt(4, i, 0, p.a, f)
    } else {
      fd(1, i, 0, f)
      rt(2, i, 0, p.a, f)
    }
  }
  return out
}

export const segsOf = (steps: Step[]): Seg[] => steps.filter((s) => s.kind === 'fd').map((s) => [s.from, s.to])

export function boxOf(segs: Seg[]): Box {
  const xs = segs.flatMap(([a, b]) => [a.x, b.x])
  const ys = segs.flatMap(([a, b]) => [a.y, b.y])
  if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 }
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function distToSeg(p: Pt, [a, b]: Seg) {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

// Every point of `seg` lies within `tol` of some segment of `on`.
export function covered(seg: Seg, on: Seg[], tol = TOL) {
  const [a, b] = seg
  const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3))
  for (let s = 0; s <= k; s++) {
    const p = { x: a.x + ((b.x - a.x) * s) / k, y: a.y + ((b.y - a.y) * s) / k }
    if (!on.some((o) => distToSeg(p, o) <= tol)) return false
  }
  return true
}

export const TOL = 2.5

// Tolerant: the two drawings cover each other, whatever the order or the direction of the lines.
export function same(a: Seg[], b: Seg[]) {
  return a.length > 0 && b.length > 0 && a.every((s) => covered(s, b)) && b.every((s) => covered(s, a))
}
