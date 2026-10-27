// Levels of «Ритм»: a target rhythm made of one bar of 4 steps, a repeat count and, on the last level,
// one closing step after the loop. A step is a bit mask of the instruments that sound on it.

export type Inst = 'kick' | 'clap' | 'hat'
export const INST_NAME: Record<Inst, string> = { kick: 'Бочка', clap: 'Хлопок', hat: 'Тарелка' }

export const STEPS = 4
export const MAX_REPEAT = 6

export type Level = {
  title: string
  goal: string
  // Said when the level is right: what this level shows about loops.
  why: string
  insts: Inst[]
  // One row per instrument in `insts`, 4 steps each.
  pat: boolean[][]
  n: number
  // The closing step after the loop, one flag per instrument. Only the last level has it.
  after?: boolean[]
}

// The child's build has the same shape as a level.
export type Build = { pat: boolean[][]; n: number; after: boolean[] }

const row = (s: string) => [...s].map((c) => c === 'x')

export const LEVELS: Level[] = [
  {
    title: 'Что повторяется',
    goal: 'Послушай ритм. Собери один такт и выбери, сколько раз его повторить.',
    why: 'Ты записал 4 шага, а прозвучало 16. Цикл повторил такт за тебя.',
    insts: ['kick'],
    pat: [row('x.xx')],
    n: 4,
  },
  {
    title: 'Что внутри цикла',
    goal: 'Теперь два инструмента, и оба внутри одного такта.',
    why: 'Всё, что стоит внутри цикла, повторяется вместе. Два инструмента, один цикл.',
    insts: ['kick', 'clap'],
    pat: [row('x..x'), row('..x.')],
    n: 3,
  },
  {
    title: 'Что после цикла',
    goal: 'После всех повторов звучит ещё один шаг.',
    why: 'Цикл сыграл такт 4 раза. Шаг после цикла прозвучал один раз, в самом конце.',
    insts: ['kick', 'clap', 'hat'],
    pat: [row('x...'), row('..x.'), row('xxxx')],
    n: 4,
    after: [true, true, false],
  },
]

export const emptyBuild = (lv: Level): Build => ({
  pat: lv.insts.map(() => Array<boolean>(STEPS).fill(false)),
  n: 1,
  after: lv.insts.map(() => false),
})

const mask = (flags: boolean[]) => flags.reduce((m, on, i) => (on ? m | (1 << i) : m), 0)

// The whole rhythm, step by step.
export function expand(pat: boolean[][], n: number, after?: boolean[]): number[] {
  const bar = Array.from({ length: STEPS }, (_, s) => mask(pat.map((r) => r[s])))
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(...bar)
  if (after && after.some(Boolean)) out.push(mask(after))
  return out
}

export const expandLevel = (lv: Level) => expand(lv.pat, lv.n, lv.after)
export const expandBuild = (b: Build, lv: Level) => expand(b.pat, b.n, lv.after ? b.after : undefined)

export const same = (a: number[], b: number[]) => a.length === b.length && a.every((m, i) => m === b[i])

// The first thing that differs, in the order a child should fix it: the bar, the count, the closing step.
export type Miss = { kind: 'pattern'; inst: Inst } | { kind: 'count' } | { kind: 'after'; empty: boolean }

export function diagnose(b: Build, lv: Level): Miss | null {
  const r = lv.pat.findIndex((want, i) => want.some((on, s) => on !== b.pat[i][s]))
  if (r >= 0) return { kind: 'pattern', inst: lv.insts[r] }
  if (b.n !== lv.n) return { kind: 'count' }
  if (lv.after && lv.after.some((on, i) => on !== b.after[i])) return { kind: 'after', empty: !b.after.some(Boolean) }
  return null
}

// Guiding questions, from general to specific. They never name the answer.
export function hint(m: Miss, tries: number): string {
  const second = tries > 0
  switch (m.kind) {
    case 'pattern':
      return second
        ? `Проверь строку «${INST_NAME[m.inst]}». На каких шагах из четырёх она звучит в образце?`
        : 'Сравни свой такт с первым тактом образца. Какие шаги не совпадают?'
    case 'count':
      return second
        ? 'Посчитай одинаковые такты в образце. Сколько раз звучит один и тот же такт?'
        : 'Сравни длину своего ритма и образца. Что не совпадает?'
    case 'after':
      if (!second) return 'Что звучит в самом конце образца, после всех повторов?'
      return m.empty
        ? 'Посмотри на последний шаг образца. Какие инструменты звучат в нём?'
        : 'Сравни последний шаг образца со своим. Какой инструмент лишний или пропущен?'
  }
}

// Russian plural for «шаг»: 1 шаг, 2 шага, 5 шагов.
export function steps(n: number) {
  const d = n % 10, h = n % 100
  const w = d === 1 && h !== 11 ? 'шаг' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'шага' : 'шагов'
  return `${n} ${w}`
}

// Steps the child writes: the 4 of the bar, plus the closing step when there is one.
export const written = (lv: Level) => STEPS + (lv.after ? 1 : 0)

// Russian plural for «раз»: 1 раз, 2 раза, 5 раз.
export function times(n: number) {
  const d = n % 10, h = n % 100
  return `${n} ${d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'раза' : 'раз'}`
}
