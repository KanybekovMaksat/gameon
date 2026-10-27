import type { LearnEvent } from '../app/store'
import { KIDS, type Kid } from '../components'
import { LESSONS, TOPICS } from '../content'
import { SCHEDULE } from '../content/schedule'
import type { Lesson, Topic } from '../content/types'
import type { Exercise } from '../exercises/kit'
import { DAY, MIN, startOfDay } from './format'

// The group on the mentor screen. Office lessons are on Monday and Wednesday at 16:00 and last 90 minutes.
export const GROUP = { name: 'Группа ПН, СР · 16:00', mentor: 'Тимур Асанов', ...SCHEDULE }

export type Student = { idx: number; kid: Kid; name: string; female: boolean; real: boolean }

// The child with `me` is the real one: the phone in the presenter's hands. The app calls him «Ты», the mentor sees his name.
const FEMALE = new Set(['Айдана', 'Алина', 'Дана'])
export const STUDENTS: Student[] = KIDS.map((kid, idx) => ({ idx, kid, name: kid.me ? 'Амир' : kid.name, female: FEMALE.has(kid.name), real: !!kid.me }))
export const REAL = STUDENTS.find((s) => s.real) ?? STUDENTS[0]

// An event with the child who made it (the index in KIDS).
export type MEvent = LearnEvent & { kid: number }

export type ExInfo = { ex: Exercise; lesson: Lesson; topic: Topic; n: number }
export const EXERCISES = new Map<string, ExInfo>(
  LESSONS.flatMap(({ topic, lesson }) => lesson.practice.map((ex, i) => [ex.id, { ex, lesson, topic, n: i + 1 }] as const)),
)
export const LESSON_INFO = new Map(LESSONS.map((l, i) => [l.lesson.id, { ...l, n: l.topic.lessons.indexOf(l.lesson) + 1, index: i }]))

// The week's homework: the lessons the group can take at home before a topic that opens in the office, at most five.
const WEEK_MAX = 5
export const ASSIGNED: Lesson[] = (() => {
  const gate = LESSONS.findIndex(({ topic }) => topic.office)
  const end = gate < 0 ? LESSONS.length : Math.max(gate, 1)
  return LESSONS.slice(0, Math.min(end, WEEK_MAX)).map((l) => l.lesson)
})()
export const ASSIGNED_IDS = new Set(ASSIGNED.map((l) => l.id))
export const ASSIGNED_EXERCISES = ASSIGNED.reduce((n, l) => n + l.practice.length, 0)

// The next office lesson opens the first topic that waits for the office; without one, it goes on with the week's topic.
export const OFFICE_TOPIC: Topic = TOPICS.find((t) => t.office) ?? LESSON_INFO.get(ASSIGNED[ASSIGNED.length - 1].id)!.topic

// The events endpoint takes any JSON, so the screen keeps only well-formed events about lessons it knows.
export function parseEvent(v: unknown): LearnEvent | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : null
  const lessonId = typeof o.lessonId === 'string' && LESSON_INFO.has(o.lessonId) ? o.lessonId : null
  if (at === null || !lessonId) return null
  const exId = typeof o.exId === 'string' && EXERCISES.get(o.exId)?.lesson.id === lessonId ? o.exId : null
  const text = (x: unknown) => (typeof x === 'string' && x.trim() ? x.slice(0, 300) : undefined)
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  switch (o.type) {
    case 'lesson-start': return { type: 'lesson-start', lessonId, at }
    case 'attempt': return exId && typeof o.correct === 'boolean' ? { type: 'attempt', lessonId, exId, correct: o.correct, answer: text(o.answer), at } : null
    case 'helper': {
      const question = text(o.question)
      return exId && question ? { type: 'helper', lessonId, exId, question, at } : null
    }
    case 'lesson-done': return { type: 'lesson-done', lessonId, firstTry: num(o.firstTry), total: num(o.total), coins: num(o.coins), at }
  }
  return null
}

export const eventKey = (e: LearnEvent) => JSON.stringify([e.type, e.lessonId, 'exId' in e ? e.exId : '', e.at, 'correct' in e ? e.correct : '', 'question' in e ? e.question : ''])

/* ---------- The scripted week of the other children ---------- */

// A small seeded random generator: the same content always gives the same week.
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

type Rand = () => number
const between = (r: Rand, a: number, b: number) => a + (b - a) * r()
const pickOne = <T,>(r: Rand, list: T[]) => list[Math.floor(r() * list.length)]

type Persona = {
  // Wrong tries per task the child attempts over the week: 0.5 for a child who struggles, 0.05 for a strong one.
  errors: number
  // The share of those wrong tries after which the child asks the helper.
  asks: number
  // The share of the week's lessons the child takes.
  reach: number
  // Days back of the first and the last session.
  span: [number, number]
  hour: number
  // How the last lesson ends: it goes on right now, the child left it on a task, or left it in the middle.
  last?: 'now' | 'stuck' | 'left'
}

const PERSONAS: Record<string, Persona> = {
  'Айдана': { errors: 0.12, asks: 0.5, reach: 1, span: [5, 2], hour: 17, last: 'now' },
  'Эмир': { errors: 0.5, asks: 0.5, reach: 0.8, span: [4, 1], hour: 19, last: 'stuck' },
  'Алина': { errors: 0.05, asks: 0.5, reach: 1, span: [6, 3], hour: 16, last: 'now' },
  'Нурсултан': { errors: 0.22, asks: 0.5, reach: 1, span: [5, 2], hour: 20, last: 'left' },
  'Дана': { errors: 0.2, asks: 0, reach: 0.2, span: [6, 6], hour: 18 },
}
const DEFAULT_PERSONA: Persona = { errors: 0.15, asks: 0.4, reach: 0.6, span: [5, 2], hour: 18 }
// The real child's lessons from before the demo, as the app's starting progress has them.
const REAL_PERSONA: Persona = { errors: 0.2, asks: 0.4, reach: 1, span: [4, 2], hour: 18 }

// Later lessons are harder; finding a bug or predicting output is harder than ordering steps.
const KIND_BIAS: Record<string, number> = { order: -0.1, predict: 0.1, bug: 0.05, teach: 0.1 }
const POOL = ASSIGNED.flatMap((l) => l.practice)
// One task in each lesson is the trap most children fall into, so mistakes gather on a few tasks, as in a real group.
// It is never the first task of a lesson; among the others the hash of its id picks it.
const TRAPS = new Set(ASSIGNED.flatMap((l) => {
  const rest = l.practice.slice(1)
  return rest.length ? [rest.reduce((a, b) => (hash(b.id) > hash(a.id) ? b : a)).id] : []
}))
function difficulty(ex: Exercise) {
  const pos = POOL.indexOf(ex)
  const along = pos < 0 ? 1 : POOL.length > 1 ? pos / (POOL.length - 1) : 0
  const jitter = ((hash(ex.id) % 1000) / 1000) * 0.12 - 0.06
  return 0.2 + 0.35 * along + (KIND_BIAS[ex.kind] ?? 0.05) + jitter + (TRAPS.has(ex.id) ? 0.4 : 0)
}

type Data = Record<string, unknown>

// A wrong answer in the words the app uses. The first wrong option is the usual trap, so most children fall into it.
// `n` counts the child's wrong tries on the task; `skip` 1 means the child missed the trap, so tries never repeat an answer in a row.
function answerText(ex: Exercise, correct: boolean, female: boolean, n: number, skip: number): string | undefined {
  const d = ex.data as Data
  const v = female ? 'а' : ''
  const wrongs = (size: number, right: number, trap: number) => {
    const rest = Array.from({ length: size }, (_, i) => i).filter((i) => i !== right && i !== trap)
    const list = trap >= 0 && trap !== right ? [trap, ...rest] : rest
    return list[(n + skip) % list.length]
  }
  // Teaching the robot: the child explains a topic, the robot answers from that explanation.
  if (typeof d.concept === 'string') {
    return `объяснил${v} Робику тему «${d.concept}». Робик ответил ${correct && typeof d.answer === 'string' ? d.answer : 'неверно'}`
  }
  if (Array.isArray(d.options) && typeof d.answer === 'number') {
    const opts = d.options as string[]
    const i = correct ? d.answer : wrongs(opts.length, d.answer, opts.findIndex((_, k) => k !== d.answer))
    return `выбрал${v} вариант «${opts[i]}»`
  }
  if (Array.isArray(d.steps)) {
    const steps = d.steps as string[]
    const order = steps.map((_, i) => i)
    if (!correct && steps.length > 1) {
      const k = (Math.floor((steps.length - 1) / 2) + n) % (steps.length - 1)
      ;[order[k], order[k + 1]] = [order[k + 1], order[k]]
    }
    return `расставил${v} так: ${order.map((i) => steps[i]).join(' → ')}`
  }
  if (typeof d.code === 'string' && typeof d.answer === 'number') {
    const lines = d.code.split('\n')
    const i = correct ? d.answer : wrongs(lines.length, d.answer, d.answer > 0 ? d.answer - 1 : 1)
    return `выбрал${v} строку ${i + 1}: ${lines[i].trim()}`
  }
  return undefined
}

// Questions a child types to the helper, in a child's words. The code of the task adds questions that fit it.
function questionsFor(ex: Exercise, female: boolean, lastWrong: string | undefined): string[] {
  const d = ex.data as Data
  const v = female ? 'а' : ''
  const code = typeof d.code === 'string' ? d.code : ''
  const loop = /\b(repeat|for|while)\b/.test(code)
  const quotes = code.includes('"')
  if (typeof d.concept === 'string') {
    return [
      'Как объяснить, чтобы Робик понял?',
      `Робик ответил неверно. Что я объяснил${v} не так?`,
      'Можно объяснить на примере?',
      'Сколько надо написать, чтобы хватило?',
      `Я объяснил${v} своими словами, а он всё равно путается`,
    ]
  }
  if (Array.isArray(d.options)) {
    const wrong = lastWrong?.match(/«([^»]+)»/)?.[1]
    return [
      wrong ? `Почему не ${wrong.replace(/\n/g, ' ')}? Я же считал${v} по строкам` : 'С какой строки начинать, если строк несколько?',
      ...(loop
        ? ['Сколько раз выполняется строка с отступом?', 'print внутри цикла или после него?', 'Переменная меняется на каждом круге или один раз?']
        : ['Каждый print печатает с новой строки?', ...(quotes ? ['Кавычки тоже печатаются?'] : [])]),
      `Я запутал${female ? 'ась' : 'ся'}, что меняется на каждом шаге`,
      'Можно подсказку, но без ответа?',
      'Как проверить ответ самому, без подсказки?',
    ]
  }
  if (code) {
    const line = lastWrong?.match(/строку (\d+)/)?.[1]
    return [
      line ? `А что не так со строкой ${line}? Мне казалось, ошибка там` : 'Все строки выглядят правильно. Где искать?',
      ...(loop ? ['Переменная в цикле должна называться так же?', 'Отступ тут правильный?'] : []),
      ...(quotes ? ['Может, ошибка в кавычках?'] : []),
      'Как понять, какая строка неправильная?',
      'Программа короткая, а ошибку не вижу. С чего начать?',
      `Я проверил${v} каждую строку. Что я пропускаю?`,
      'Ошибка может быть в одном символе?',
    ]
  }
  if (Array.isArray(d.steps)) {
    return ['С какого шага начинать?', 'Какой шаг точно последний?', `Я поменял${v} два шага местами, всё равно неверно`, 'Можно делать эти шаги в другом порядке?']
  }
  return ['Не понимаю, что тут надо сделать', 'Можно подсказку?', 'Почему мой ответ неверный?']
}

type Plan = { lesson: Lesson; end: 'done' | 'now' | 'stuck' | 'left'; day: number }

// Where a session stops: after the last task, on the hardest task for a stuck child, in the middle otherwise.
function stopOf(plan: Plan) {
  const tasks = plan.lesson.practice
  if (plan.end === 'done') return tasks.length
  if (plan.end === 'stuck') return tasks.reduce((best, ex, i) => (difficulty(ex) > difficulty(tasks[best]) ? i : best), 0)
  return Math.floor(tasks.length / 2)
}

// The tasks a child reaches in a session; a child who left the lesson stops before the task in the middle.
const reached = (plan: Plan) => plan.lesson.practice.slice(0, plan.end === 'left' ? stopOf(plan) : stopOf(plan) + 1)

type Mistakes = Map<string, { wrong: number; asks: number }>

// The child's wrong tries and helper questions for the whole week, set before the sessions are written, so the totals
// follow the persona exactly. Wrong tries go to the child's hardest tasks (traps first), one each, then again to the
// same tasks; questions go to the tasks with the most wrong tries. A stuck task gets three wrong tries and two questions,
// the task in progress right now gets one wrong try.
function mistakesFor(p: Persona, plans: Plan[], r: Rand): Mistakes {
  const out: Mistakes = new Map()
  const tasks = plans.flatMap(reached)
  const add = (id: string, wrong: number, asks = 0) => {
    const m = out.get(id) ?? { wrong: 0, asks: 0 }
    out.set(id, { wrong: m.wrong + wrong, asks: m.asks + asks })
  }
  const fixed = new Set<string>()
  for (const plan of plans) {
    const at = plan.lesson.practice[stopOf(plan)]
    if (plan.end === 'stuck' && at) { add(at.id, 3, 2); fixed.add(at.id) }
    if (plan.end === 'now' && at) { add(at.id, 1); fixed.add(at.id) }
  }
  const budget = Math.round(p.errors * tasks.length)
  let left = budget - [...out.values()].reduce((n, m) => n + m.wrong, 0)
  const order = tasks.filter((ex) => !fixed.has(ex.id)).map((ex) => ({ ex, d: difficulty(ex) + r() * 0.15 })).sort((a, b) => b.d - a.d).map((x) => x.ex)
  const spread = Math.min(order.length, Math.max(1, Math.ceil(left * 0.6)))
  for (let i = 0; left > 0 && spread > 0 && i < spread * 3; i++) {
    const ex = order[i % spread]
    if ((out.get(ex.id)?.wrong ?? 0) < 3) { add(ex.id, 1); left-- }
  }
  let asks = Math.round(budget * p.asks) - [...out.values()].reduce((n, m) => n + m.asks, 0)
  const byTrouble = [...out.entries()].filter(([id]) => !fixed.has(id)).sort((a, b) => b[1].wrong - a[1].wrong)
  for (const [id] of byTrouble) {
    if (asks <= 0) break
    add(id, 0, 1)
    asks--
  }
  return out
}
// An event and the seconds since the step before it; the time of day is set when the session is placed.
type Step = { e: MEvent; dt: number }

// One session: the start, the explanation, the tasks with their wrong tries and helper questions, the end.
function session(kid: Student, plan: Plan, mistakes: Mistakes, r: Rand, used: Map<string, Set<string>>, weekAsked: Set<string>): Step[] {
  const out: Step[] = []
  const { lesson } = plan
  const lessonId = lesson.id
  const push = (e: LearnEvent, dt: number) => out.push({ e: { ...e, kid: kid.idx }, dt })
  push({ type: 'lesson-start', lessonId, at: 0 }, 0)
  let firstTry = 0
  let coins = 0
  // A question not typed yet this week; when the pool runs out, one not typed yet about this task.
  const ask = (ex: Exercise, lastWrong: string | undefined) => {
    const asked = used.get(ex.id) ?? new Set<string>()
    used.set(ex.id, asked)
    const all = questionsFor(ex, kid.female, lastWrong).filter((q) => !asked.has(q))
    const fresh = all.filter((q) => !weekAsked.has(q))
    const pool = fresh.length ? fresh : all
    if (!pool.length) return
    const question = pickOne(r, pool)
    asked.add(question)
    weekAsked.add(question)
    push({ type: 'helper', lessonId, exId: ex.id, question, at: 0 }, between(r, 25, 70))
  }

  const tasks = lesson.practice
  const stopAt = stopOf(plan)

  for (let i = 0; i < tasks.length; i++) {
    if (i === stopAt && plan.end === 'left') break
    const ex = tasks[i]
    const stuck = i === stopAt && plan.end === 'stuck'
    const trying = i === stopAt && plan.end === 'now'
    const wrong = mistakes.get(ex.id)?.wrong ?? 0
    let asks = mistakes.get(ex.id)?.asks ?? 0
    const skip = r() < 0.75 ? 0 : 1
    // The explanation comes before the first task.
    let dt = (i === 0 ? lesson.explain.length * between(r, 70, 150) : 0) + between(r, 35, 95)
    let lastWrong: string | undefined
    // A child who is lost from the start asks before the first try.
    if (asks && wrong >= 2 && r() < 0.5) { ask(ex, undefined); asks-- }
    for (let w = 0; w < wrong; w++) {
      lastWrong = answerText(ex, false, kid.female, w, skip)
      push({ type: 'attempt', lessonId, exId: ex.id, correct: false, answer: lastWrong, at: 0 }, dt)
      dt = between(r, 20, 55)
      if (asks && (w === wrong - 1 || r() < 0.5)) { ask(ex, lastWrong); asks-- }
    }
    if (stuck || trying) break
    push({ type: 'attempt', lessonId, exId: ex.id, correct: true, answer: answerText(ex, true, kid.female, 0, 0), at: 0 }, dt)
    if (wrong === 0) firstTry++
    coins += wrong === 0 ? 5 : 2
  }
  if (plan.end === 'done') push({ type: 'lesson-done', lessonId, firstTry, total: tasks.length, coins, at: 0 }, between(r, 6, 14))
  return out
}

// A realistic week of the scripted children against the current content, and the real child's lessons from before the demo.
// Days back 1 to 6 fall in the evening after school; a session that goes on right now ends a minute before `now`.
export function scriptedWeek(now: number, realDone: string[]): MEvent[] {
  const events: MEvent[] = []
  // Questions already typed, per task and in the whole week: two children rarely use the same words.
  // The real child's invented lessons draw from their own pool, so the other children's quotes never depend on this browser.
  const pools = { script: { used: new Map<string, Set<string>>(), week: new Set<string>() }, real: { used: new Map<string, Set<string>>(), week: new Set<string>() } }
  const place = (steps: Step[], start: number) => {
    let t = start
    for (const { e, dt } of steps) {
      t += dt * 1000
      events.push({ ...e, at: Math.round(t) })
    }
    return t
  }

  for (const kid of STUDENTS) {
    const p = kid.real ? REAL_PERSONA : PERSONAS[kid.kid.name] ?? DEFAULT_PERSONA
    const r = random(hash(kid.name + ASSIGNED.map((l) => l.id).join()))
    const lessons = kid.real
      ? realDone.map((id) => LESSON_INFO.get(id)?.lesson).filter((l): l is Lesson => !!l)
      : ASSIGNED.slice(0, Math.max(1, Math.ceil(p.reach * ASSIGNED.length)))
    if (!lessons.length) continue
    // Sessions before today spread evenly over the persona's days; a lesson going on now is today.
    const past = p.last === 'now' ? lessons.length - 1 : lessons.length
    const plans: Plan[] = lessons.map((lesson, i) => {
      const end = i === lessons.length - 1 && p.last ? p.last : 'done'
      const day = end === 'now' ? 0 : past > 1 ? Math.round(p.span[0] - (i * (p.span[0] - p.span[1])) / (past - 1)) : p.span[0]
      return { lesson, end, day }
    })

    const mistakes = mistakesFor(p, plans, r)
    let dayEnd = 0
    let lastDay = -1
    for (const plan of plans) {
      const pool = kid.real ? pools.real : pools.script
      const steps = session(kid, plan, mistakes, r, pool.used, pool.week)
      if (plan.end === 'now') {
        const total = steps.reduce((s, x) => s + x.dt, 0) * 1000
        place(steps, now - total - between(r, 50, 90) * 1000)
        continue
      }
      // Two sessions on one day follow each other with a short break.
      const start = plan.day === lastDay
        ? dayEnd + between(r, 4, 12) * MIN
        : startOfDay(now - plan.day * DAY) + (p.hour * 60 + between(r, -20, 40)) * MIN
      dayEnd = place(steps, start)
      lastDay = plan.day
    }
  }
  return events.sort((a, b) => a.at - b.at)
}
