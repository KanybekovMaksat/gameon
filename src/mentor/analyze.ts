import { LESSONS } from '../content'
import type { Lesson } from '../content/types'
import { kindOf } from '../exercises/registry'
import { ASSIGNED, ASSIGNED_EXERCISES, ASSIGNED_IDS, EXERCISES, GROUP, LESSON_INFO, STUDENTS, type ExInfo, type MEvent, type Student } from './data'
import type { Exercise } from '../exercises/kit'
import { ago, answerGist, answerKey, cap, count, DAY, dateLong, dative, daysBetween, hm, MIN, plural, startOfDay, weekday } from './format'

// A child is active when the last event is this recent. A lesson left on an unsolved task this long ago is stuck.
const ACTIVE = 15 * MIN
const IDLE = 30 * MIN
// A new session starts after a break this long.
const BREAK = 45 * MIN

export type CellState = 'none' | 'progress' | 'done' | 'retry' | 'stuck'
export const STATE_LABEL: Record<CellState, string> = {
  none: 'Не начат',
  progress: 'В процессе',
  done: 'С первого раза',
  retry: 'С ошибками или подсказкой',
  stuck: 'Застрял',
}
export type Cell = {
  state: CellState
  solved: number
  total: number
  wrong: number
  helper: number
  last: number | null
  stuckEx?: string
}
export type Row = {
  student: Student
  cells: Record<string, Cell>
  solved: number
  // Tasks solved on the first try this week.
  firstTry: number
  wrong: number
  helper: number
  last: number | null
  active: boolean
  // The lesson the child is in right now.
  inLesson?: string
}
export type StuckKid = { idx: number; wrong: number; helper: number; stuck: boolean }
export type StuckItem = {
  info: ExInfo
  wrong: number
  helper: number
  kids: StuckKid[]
  attempted: number
  erred: number
  common?: { text: string; n: number }
  questions: { kid: number; text: string; at: number }[]
  last: number
}
export type Suggestion = { lead: string; why: string; kid?: number; exId?: string }
export type Summary = {
  active: number[]
  solved: number
  assigned: number
  lessonsDone: number
  lessonsAssigned: number
  helper: number
  helperKids: number
}
export type Board = { rows: Row[]; summary: Summary; stuck: StuckItem[]; suggestions: Suggestion[]; feed: MEvent[]; week: MEvent[]; weekStart: number }

export const weekStart = (now: number) => startOfDay(now - 6 * DAY)
export const label = (info: ExInfo) => kindOf(info.ex).label
export const isDone = (c: Cell) => c.state === 'done' || c.state === 'retry'

function cellOf(evs: MEvent[], lesson: Lesson, now: number): Cell {
  const total = lesson.practice.length
  if (!evs.length) return { state: 'none', solved: 0, total, wrong: 0, helper: 0, last: null }
  const solved = new Set<string>()
  const trouble = new Map<string, { wrong: number; helper: number }>()
  let wrong = 0
  let helper = 0
  let done = false
  for (const e of evs) {
    if (e.type === 'lesson-done') done = true
    if (e.type === 'attempt') {
      if (e.correct) { solved.add(e.exId); trouble.delete(e.exId) } else {
        wrong++
        const t = trouble.get(e.exId) ?? { wrong: 0, helper: 0 }
        trouble.set(e.exId, { ...t, wrong: t.wrong + 1 })
      }
    }
    if (e.type === 'helper') {
      helper++
      if (!solved.has(e.exId)) {
        const t = trouble.get(e.exId) ?? { wrong: 0, helper: 0 }
        trouble.set(e.exId, { ...t, helper: t.helper + 1 })
      }
    }
  }
  const last = evs[evs.length - 1].at
  const base = { total, wrong, helper, last }
  if (done) return { ...base, state: wrong + helper ? 'retry' : 'done', solved: total }
  // Stuck: many wrong tries on one task, or the child left the lesson on a task that is not solved.
  const open = [...trouble.entries()]
  const hit = open.find(([, t]) => t.wrong >= 3) ?? (now - last > IDLE ? open[0] : undefined)
  return { ...base, state: hit ? 'stuck' : 'progress', solved: solved.size, stuckEx: hit?.[0] }
}

function rowOf(student: Student, evs: MEvent[], now: number): Row {
  const byLesson = new Map<string, MEvent[]>()
  for (const e of evs) byLesson.set(e.lessonId, [...(byLesson.get(e.lessonId) ?? []), e])
  const cells: Record<string, Cell> = {}
  for (const { lesson } of LESSONS) cells[lesson.id] = cellOf(byLesson.get(lesson.id) ?? [], lesson, now)
  const lastEvent = evs[evs.length - 1]
  const last = lastEvent?.at ?? null
  const firstAttempt = new Map<string, boolean>()
  for (const e of evs) if (e.type === 'attempt' && !firstAttempt.has(e.exId)) firstAttempt.set(e.exId, e.correct)
  const active = last !== null && now - last < ACTIVE
  return {
    student,
    cells,
    solved: ASSIGNED.reduce((n, l) => n + cells[l.id].solved, 0),
    firstTry: [...firstAttempt.values()].filter(Boolean).length,
    wrong: evs.filter((e) => e.type === 'attempt' && !e.correct).length,
    helper: evs.filter((e) => e.type === 'helper').length,
    last,
    active,
    inLesson: active && lastEvent.type !== 'lesson-done' ? lastEvent.lessonId : undefined,
  }
}

function stuckList(week: MEvent[], rows: Row[]): StuckItem[] {
  const items = new Map<string, StuckItem & { byKid: Map<number, StuckKid>; answers: Map<string, { text: string; n: number }> }>()
  for (const e of week) {
    if (e.type !== 'attempt' && e.type !== 'helper') continue
    const info = EXERCISES.get(e.exId)
    if (!info) continue
    let it = items.get(e.exId)
    if (!it) {
      it = { info, wrong: 0, helper: 0, kids: [], attempted: 0, erred: 0, questions: [], last: 0, byKid: new Map(), answers: new Map() }
      items.set(e.exId, it)
    }
    const k = it.byKid.get(e.kid) ?? { idx: e.kid, wrong: 0, helper: 0, stuck: false }
    it.byKid.set(e.kid, k)
    it.last = Math.max(it.last, e.at)
    if (e.type === 'helper') {
      it.helper++
      k.helper++
      it.questions.push({ kid: e.kid, text: e.question, at: e.at })
    } else if (!e.correct) {
      it.wrong++
      k.wrong++
      if (e.answer && !e.answer.startsWith('объяснил')) {
        const key = answerKey(e.answer)
        const a = it.answers.get(key) ?? { text: answerGist(e.answer), n: 0 }
        it.answers.set(key, { ...a, n: a.n + 1 })
      }
    }
  }
  const out: (StuckItem & { score: number })[] = []
  for (const { byKid, answers, ...it } of items.values()) {
    const kids = [...byKid.values()].map((k) => ({ ...k, stuck: rows[k.idx]?.cells[it.info.lesson.id]?.stuckEx === it.info.ex.id }))
    const stuckKids = kids.filter((k) => k.stuck).length
    if (it.wrong + it.helper < 2 && !stuckKids) continue
    const common = [...answers.values()].sort((a, b) => b.n - a.n)[0]
    out.push({
      ...it,
      kids: kids.filter((k) => k.wrong || k.helper).sort((a, b) => Number(b.stuck) - Number(a.stuck) || b.wrong + b.helper - (a.wrong + a.helper)),
      attempted: kids.length,
      erred: kids.filter((k) => k.wrong).length,
      common: common && common.n >= 2 ? common : undefined,
      questions: it.questions.sort((a, b) => b.at - a.at),
      score: it.wrong + 2 * it.helper + 3 * stuckKids,
    })
  }
  return out.sort((a, b) => b.score - a.score || b.last - a.last)
}

// The most common wrong answer in words: «Чаще всего выбирали «3»», «Чаще всего выбирали строку 2» with its code.
export function wrongFact(gist: string): { lead: string; detail?: string; code?: boolean } {
  const option = gist.match(/^вариант «([\s\S]+)»$/)
  if (option) return { lead: `Чаще всего выбирали «${option[1]}»` }
  const line = gist.match(/^строку (\d+): ([\s\S]*)$/)
  if (line) return { lead: `Чаще всего выбирали строку ${line[1]}`, detail: line[2], code: true }
  const order = gist.match(/^так: ([\s\S]*)$/)
  if (order) return { lead: 'Чаще всего ставили так', detail: order[1] }
  return { lead: `Чаще всего отвечали «${gist}»` }
}

// The same for a sentence; an order of steps is too long for one.
function commonPhrase(gist: string) {
  const f = wrongFact(gist)
  return f.detail && !f.code ? null : f.lead.charAt(0).toLowerCase() + f.lead.slice(1)
}

export function evidence(it: StuckItem) {
  const parts = [`${it.erred} из ${it.attempted} ${plural(it.erred, 'ошибся', 'ошиблись', 'ошиблись')} хотя бы раз`]
  const common = it.common && commonPhrase(it.common.text)
  if (common) parts.push(common)
  if (it.helper) parts.push(`${count(it.helper, 'вопрос', 'вопроса', 'вопросов')} помощнику`)
  return cap(parts.join(', ')) + '.'
}

function suggestions(rows: Row[], stuck: StuckItem[], now: number): Suggestion[] {
  const out: Suggestion[] = []
  const exercise = (it: StuckItem, verb: string): Suggestion => ({
    lead: `${verb} задание «${label(it.info)}» из урока «${it.info.lesson.title}».`,
    why: evidence(it),
    exId: it.info.ex.id,
  })
  if (stuck[0]) out.push(exercise(stuck[0], 'Разберите'))

  // The child stuck deepest: the most wrong tries in a lesson left on a task.
  const stuckRow = rows
    .flatMap((r) => Object.entries(r.cells).filter(([, c]) => c.state === 'stuck' && !r.active).map(([id, c]) => ({ r, id, c })))
    .sort((a, b) => b.c.wrong + b.c.helper - (a.c.wrong + a.c.helper))[0]
  if (stuckRow?.c.stuckEx) {
    const { r, c } = stuckRow
    const s = r.student
    const info = EXERCISES.get(c.stuckEx!)!
    // The counts of the task itself, not of the whole lesson.
    const k = stuck.find((it) => it.info.ex.id === c.stuckEx)?.kids.find((x) => x.idx === s.idx) ?? c
    const help = k.helper ? ` и ${count(k.helper, 'вопрос', 'вопроса', 'вопросов')} помощнику` : ''
    out.push({
      lead: `Подойдите к ${dative(s.name)} в начале урока.`,
      why: `${s.name} ${s.female ? 'застряла' : 'застрял'} на задании «${label(info)}» в уроке «${info.lesson.title}»: ${count(k.wrong, 'неверная попытка', 'неверные попытки', 'неверных попыток')}${help}. Урок не закончен.`,
      kid: s.idx,
    })
  }

  // The child who has been away the longest.
  const away = rows
    .filter((r) => !r.active && r.solved < ASSIGNED_EXERCISES && (r.last === null || daysBetween(r.last, now) >= 3))
    .sort((a, b) => (a.last ?? 0) - (b.last ?? 0))[0]
  if (away) {
    const s = away.student
    const was = s.female ? 'заходила' : 'заходил'
    const days = away.last === null ? 0 : daysBetween(away.last, now)
    out.push({
      lead: `Узнайте, что мешает ${dative(s.name)}.`,
      why: away.last === null
        ? `${s.name} не ${was} в приложение на этой неделе.`
        : `${s.name} не ${was} в приложение ${count(days, 'день', 'дня', 'дней')}, сделано ${away.solved} из ${ASSIGNED_EXERCISES} ${plural(ASSIGNED_EXERCISES, 'задания', 'заданий', 'заданий')}.`,
      kid: s.idx,
    })
  }

  for (const it of stuck.slice(1)) {
    if (out.length >= 3) break
    if (out.some((x) => x.exId === it.info.ex.id)) continue
    out.push(exercise(it, 'Повторите'))
  }
  return out.slice(0, 3)
}

export function analyze(events: MEvent[], now: number): Board {
  const start = weekStart(now)
  const week = events.filter((e) => e.at >= start).sort((a, b) => a.at - b.at)
  const rows = STUDENTS.map((s) => rowOf(s, week.filter((e) => e.kid === s.idx), now))
  const stuck = stuckList(week, rows)
  const helpers = week.filter((e) => e.type === 'helper')
  return {
    rows,
    week,
    weekStart: start,
    summary: {
      active: rows.filter((r) => r.active).map((r) => r.student.idx),
      solved: rows.reduce((n, r) => n + r.solved, 0),
      assigned: rows.length * ASSIGNED_EXERCISES,
      lessonsDone: rows.reduce((n, r) => n + ASSIGNED.filter((l) => isDone(r.cells[l.id])).length, 0),
      lessonsAssigned: rows.length * ASSIGNED.length,
      helper: helpers.length,
      helperKids: new Set(helpers.map((e) => e.kid)).size,
    },
    stuck,
    suggestions: suggestions(rows, stuck, now),
    feed: week.slice(-8).reverse(),
  }
}

export type Session = { lessonId: string; events: MEvent[]; start: number; end: number }

// A child's week as sessions: a session starts with the lesson, a new lesson or a long break. Newest first.
export function sessionsOf(week: MEvent[], kid: number): Session[] {
  const out: Session[] = []
  for (const e of week) {
    if (e.kid !== kid) continue
    const cur = out[out.length - 1]
    if (!cur || e.type === 'lesson-start' || cur.lessonId !== e.lessonId || e.at - cur.end > BREAK) {
      out.push({ lessonId: e.lessonId, events: [e], start: e.at, end: e.at })
    } else {
      cur.events.push(e)
      cur.end = e.at
    }
  }
  return out.reverse()
}

export const isAssigned = (lessonId: string) => ASSIGNED_IDS.has(lessonId)
export const lessonInfo = (lessonId: string) => LESSON_INFO.get(lessonId)

// The next office lesson of the group, or the one going on now.
export function nextOffice(now: number): { at: number; now: boolean } {
  for (let i = 0; i < 8; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    d.setHours(GROUP.hour, GROUP.minute, 0, 0)
    if (!GROUP.days.includes(d.getDay())) continue
    const at = d.getTime()
    if (at + GROUP.minutes * MIN > now) return { at, now: at <= now }
  }
  return { at: now, now: false }
}

// «Сегодня в 16:00», «Среда, 30 сентября в 16:00», «Идёт сейчас, до 17:30».
export function officeWhen(now: number) {
  const next = nextOffice(now)
  if (next.now) return `Идёт сейчас, до ${hm(next.at + GROUP.minutes * MIN)}`
  const d = daysBetween(now, next.at)
  const day = d === 0 ? 'Сегодня' : d === 1 ? 'Завтра' : cap(`${weekday(next.at)}, ${dateLong(next.at)}`)
  return `${day} в ${hm(next.at)}`
}

export function statusLine(row: Row, now: number): { text: string; tone: 'live' | 'away' | 'calm' } {
  const f = row.student.female
  if (row.active) return { text: row.inLesson ? 'Сейчас в уроке' : 'Сейчас в приложении', tone: 'live' }
  const was = f ? 'заходила' : 'заходил'
  if (row.last === null) return { text: `Не ${was} на этой неделе`, tone: 'away' }
  const d = daysBetween(row.last, now)
  // A long break matters only while the week's tasks are not done.
  if (d >= 3 && row.solved < ASSIGNED_EXERCISES) return { text: `Не ${was} ${count(d, 'день', 'дня', 'дней')}`, tone: 'away' }
  return { text: `${f ? 'Была' : 'Был'} ${ago(row.last, now)}`, tone: 'calm' }
}

export function stateText(c: Cell, s: Student, lessonId: string) {
  switch (c.state) {
    case 'none': return isAssigned(lessonId) ? 'Не начат' : 'Не задан на эту неделю'
    case 'progress': return 'В процессе'
    case 'done': return 'Пройден с первого раза'
    case 'retry': return c.wrong && c.helper ? 'Пройден с ошибками и подсказкой' : c.wrong ? 'Пройден с ошибками' : 'Пройден с подсказкой'
    case 'stuck': {
      const info = c.stuckEx ? EXERCISES.get(c.stuckEx) : undefined
      return `${s.female ? 'Застряла' : 'Застрял'}${info ? ` на задании ${info.n}` : ''}`
    }
  }
}

// The task in short for the mentor: its text, its code and the right answer.
// Known data shapes give the exact answer; for any other kind it comes from «Верный ответ:» in `describe`.
export function taskParts(ex: Exercise): { text: string; code?: string; answer?: { label: string; text: string; code?: boolean } } {
  const d = ex.data as Record<string, unknown>
  const full = kindOf(ex).describe(ex.data)
  const head = full.split('\n')[0].replace(/\s*Верн\S* \S+:.*$/, '').replace(/:\s*$/, '')
  const text = head.match(/Задача: (.+?)\.?$/)?.[1] ?? head
  const code = typeof d.code === 'string' ? d.code : undefined
  const flat = (x: string) => x.replace(/\n/g, ' / ')
  const said = full.match(/Верный ответ: ([\s\S]+?)\.(?=\s|$)/)?.[1]
  let answer: { label: string; text: string; code?: boolean } | undefined
  if (Array.isArray(d.options) && typeof d.answer === 'number') answer = { label: 'Верный ответ', text: flat(String(d.options[d.answer])) }
  else if (Array.isArray(d.steps)) answer = { label: 'Верный порядок', text: d.steps.join(' → ') }
  else if (code && typeof d.answer === 'number') answer = { label: `Ошибка в строке ${d.answer + 1}`, text: code.split('\n')[d.answer]?.trim() ?? '', code: true }
  else if (Array.isArray(d.bank) && Array.isArray(d.answer)) answer = { label: 'Верный ответ', text: d.answer.map((a) => (Array.isArray(a) ? a.join(' или ') : String(a))).join(', ') }
  else if (said) answer = { label: 'Верный ответ', text: flat(said) }
  return { text, code, answer }
}
