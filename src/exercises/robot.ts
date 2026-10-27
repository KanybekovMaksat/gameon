// The robot world: a small grid, a robot that turns and moves, walls, stars and a goal flag.
// The grid exercise and the explanation visuals share it.

export type Dir = 0 | 1 | 2 | 3 // up, right, down, left
export type Cmd = 'F' | 'L' | 'R'
export type Simple = { id: number; t: Cmd }
export type Repeat = { id: number; t: 'rep'; n: number; body: Simple[] }
export type Item = Simple | Repeat
export type Pos = { x: number; y: number }
// `goal` is null on a map without a flag (the explanation visuals use such maps).
export type Level = { cols: number; rows: number; start: Pos & { dir: Dir }; goal: Pos | null; walls: Pos[]; stars: Pos[] }

const DIRS: Record<string, Dir> = { '^': 0, '>': 1, v: 2, '<': 3 }
export const STEP: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
export const CMD_WORD: Record<Cmd, string> = { F: 'вперёд', L: 'налево', R: 'направо' }
export const CMD_CODE: Record<Cmd, string> = { F: 'forward()', L: 'left()', R: 'right()' }

// A map is rows of symbols: `.` empty, `#` wall, `*` star, `F` flag, `^ > v <` the robot and where it looks.
export function parseMap(map: string[]): Level {
  const walls: Pos[] = []
  const stars: Pos[] = []
  let start: Level['start'] = { x: 0, y: 0, dir: 1 }
  let goal: Pos | null = null
  map.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '#') walls.push({ x, y })
    else if (c === '*') stars.push({ x, y })
    else if (c === 'F') goal = { x, y }
    else if (c in DIRS) start = { x, y, dir: DIRS[c] }
  }))
  return { cols: Math.max(...map.map((r) => r.length)), rows: map.length, start, goal, walls, stars }
}

let lastId = 0
export const newId = () => ++lastId

// Short notation for programs in content: `F L R` are commands, `3(F R)` repeats its body 3 times.
export function parseProgram(s: string): Item[] {
  const out: Item[] = []
  for (const m of s.matchAll(/(\d+)\(([^)]*)\)|([FLR])/g)) {
    if (m[1]) out.push({ id: newId(), t: 'rep', n: Number(m[1]), body: [...m[2]].filter((c) => c in CMD_WORD).map((c) => ({ id: newId(), t: c as Cmd })) })
    else out.push({ id: newId(), t: m[3] as Cmd })
  }
  return out
}

export function countCommands(prog: Item[]) {
  return prog.reduce((n, it) => n + (it.t === 'rep' ? 1 + it.body.length : 1), 0)
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few
  return many
}

export function programWords(prog: Item[]) {
  return prog.map((it) => it.t === 'rep'
    ? `повтори ${it.n} ${plural(it.n, 'раз', 'раза', 'раз')} (${it.body.map((c) => CMD_WORD[c.t]).join(', ') || 'пусто'})`
    : CMD_WORD[it.t]).join(', ')
}

export type Frame = {
  x: number; y: number; dir: Dir
  // Quarter turns counted from the start, so a turn always animates the short way.
  turn: number
  at: number | null // id of the command that made this frame
  rep: number | null // id of the repeat block around it
  iter: number // pass of that repeat block, from 1
  got: number[] // indexes of collected stars
  bump: boolean
}
export type Outcome = 'goal' | 'wall' | 'edge' | 'short' | 'passed' | 'stars' | 'long'
export type Run = { frames: Frame[]; outcome: Outcome; failId: number | null; hit: Pos | null }

export function simulate(lv: Level, prog: Item[], max?: number): Run {
  const isWall = (x: number, y: number) => lv.walls.some((w) => w.x === x && w.y === y)
  const frames: Frame[] = [{ ...lv.start, turn: 0, at: null, rep: null, iter: 0, got: [], bump: false }]
  let visitedGoal = false

  // Runs one command. Returns the crash when the robot cannot move.
  const exec = (c: Simple, rep: number | null, iter: number): Omit<Run, 'frames'> | null => {
    const f = frames[frames.length - 1]
    const next: Frame = { ...f, at: c.id, rep, iter, bump: false }
    frames.push(next)
    if (c.t === 'L') { next.dir = ((f.dir + 3) % 4) as Dir; next.turn = f.turn - 1; return null }
    if (c.t === 'R') { next.dir = ((f.dir + 1) % 4) as Dir; next.turn = f.turn + 1; return null }
    const nx = f.x + STEP[f.dir][0]
    const ny = f.y + STEP[f.dir][1]
    const off = nx < 0 || ny < 0 || nx >= lv.cols || ny >= lv.rows
    if (off || isWall(nx, ny)) {
      next.bump = true
      return { outcome: off ? 'edge' : 'wall', failId: c.id, hit: off ? null : { x: nx, y: ny } }
    }
    next.x = nx
    next.y = ny
    const s = lv.stars.findIndex((p) => p.x === nx && p.y === ny)
    if (s >= 0 && !f.got.includes(s)) next.got = [...f.got, s]
    if (nx === lv.goal?.x && ny === lv.goal?.y) visitedGoal = true
    return null
  }

  for (const it of prog) {
    const body = it.t === 'rep' ? it.body : [it]
    const times = it.t === 'rep' ? it.n : 1
    for (let k = 1; k <= times; k++) {
      for (const c of body) {
        const crash = exec(c, it.t === 'rep' ? it.id : null, it.t === 'rep' ? k : 0)
        if (crash) return { frames, ...crash }
      }
    }
  }

  const end = frames[frames.length - 1]
  const onGoal = end.x === lv.goal?.x && end.y === lv.goal?.y
  let outcome: Outcome = onGoal ? 'goal' : visitedGoal ? 'passed' : 'short'
  if (onGoal && end.got.length < lv.stars.length) outcome = 'stars'
  else if (onGoal && max && countCommands(prog) > max) outcome = 'long'
  return { frames, outcome, failId: null, hit: null }
}
