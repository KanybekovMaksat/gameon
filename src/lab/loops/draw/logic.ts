import { STEP, type Cmd, type Dir, type Item, type Level, type Pos } from '../../../exercises/robot'

// The drawn path is a list of cells from the robot. Each move to the next cell is a step: a turn when the robot
// looks elsewhere, then forward. After a good run the app finds the piece that repeats most and shows it as a loop.

export const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y

export function isOpen(lv: Level, x: number, y: number) {
  return x >= 0 && y >= 0 && x < lv.cols && y < lv.rows && !lv.walls.some((w) => w.x === x && w.y === y)
}

// The commands of each step. Step `s` moves the robot from cell `s` to cell `s + 1`.
export function pathSteps(lv: Level, path: Pos[]): Cmd[][] {
  const out: Cmd[][] = []
  let dir: Dir = lv.start.dir
  for (let i = 1; i < path.length; i++) {
    const want = STEP.findIndex(([dx, dy]) => dx === path[i].x - path[i - 1].x && dy === path[i].y - path[i - 1].y) as Dir
    const d = (want - dir + 4) % 4
    out.push(d === 1 ? ['R', 'F'] : d === 3 ? ['L', 'F'] : d === 2 ? ['R', 'R', 'F'] : ['F'])
    dir = want
  }
  return out
}

// A folded loop: `len` steps from step `start`, repeated `n` times.
export type Fold = { start: number; len: number; n: number }

export const inFold = (folds: Fold[], s: number) => folds.some((f) => s >= f.start && s < f.start + f.len * f.n)

export type Found = { fold: Fold } | { error: 'folded' | 'once' }

// The piece between cells `a` and `b`. The same piece may come right before and right after it:
// count every copy in a row. One copy is no loop.
export function findFold(steps: Cmd[][], folds: Fold[], a: number, b: number): Found {
  const lo = Math.min(a, b)
  const len = Math.abs(a - b)
  for (let s = lo; s < lo + len; s++) if (inFold(folds, s)) return { error: 'folded' }
  const sig = (s: number) => steps[s].join('')
  const copyAt = (at: number) => {
    if (at < 0 || at + len > steps.length) return false
    for (let j = 0; j < len; j++) if (inFold(folds, at + j) || sig(at + j) !== sig(lo + j)) return false
    return true
  }
  let start = lo
  while (copyAt(start - len)) start -= len
  let end = lo + len
  while (copyAt(end)) end += len
  const n = (end - start) / len
  return n < 2 ? { error: 'once' } : { fold: { start, len, n } }
}

// The loop that saves the most commands in the drawn program, or null when nothing repeats usefully.
export function bestFold(steps: Cmd[][]): Fold | null {
  let best: Fold | null = null
  let bestSave = 0
  for (let a = 0; a < steps.length; a++) {
    for (let len = 1; a + 2 * len <= steps.length; len++) {
      const r = findFold(steps, [], a, a + len)
      if ('error' in r) continue
      const u = steps.slice(r.fold.start, r.fold.start + len).flat().length
      const save = r.fold.n * u - (u + 1)
      if (save > bestSave) { best = r.fold; bestSave = save }
    }
  }
  return best
}

// Ids stay the same for the same step, so a run can point at a command: plain commands, loops, commands inside loops.
const REP = 100000
const BODY = 200000

export function program(steps: Cmd[][], folds: Fold[]): Item[] {
  const out: Item[] = []
  for (let s = 0; s < steps.length;) {
    const f = folds.find((x) => x.start === s)
    if (f) {
      const body = steps.slice(s, s + f.len).flatMap((cmds, k) => cmds.map((t, j) => ({ id: BODY + (s + k) * 4 + j, t })))
      out.push({ id: REP + s, t: 'rep', n: f.n, body })
      s += f.len * f.n
    } else {
      steps[s].forEach((t, j) => out.push({ id: 1 + s * 4 + j, t }))
      s++
    }
  }
  return out
}

export const stepOfCmd = (id: number) => (id < REP ? Math.floor((id - 1) / 4) : null)
