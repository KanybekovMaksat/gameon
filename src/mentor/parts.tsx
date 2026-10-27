import { useContext, type ReactNode } from 'react'
import { HelperMark, Icon } from '../components'
import { inline } from '../session/text'
import { STATE_LABEL, type Cell, type CellState } from './analyze'
import { EXERCISES, LESSON_INFO, STUDENTS, type MEvent } from './data'
import { cap, count } from './format'
import { CastContext } from '../shop/cast'
import { portraitOf } from '../shop/catalog'

// The portrait follows each child's character, as in the app.
export function Face({ idx, size = 36, active }: { idx: number; size?: number; active?: boolean }) {
  const cast = useContext(CastContext)
  return (
    <span className={'mt-face' + (active ? ' is-active' : '')} style={{ width: size, height: size }}>
      <img src={portraitOf(cast[idx])} alt="" />
    </span>
  )
}

// Progress inside a started lesson: the share of solved tasks as an arc.
function Ring({ value }: { value: number }) {
  const r = 8
  const c = 2 * Math.PI * r
  const v = Math.max(0.1, Math.min(1, value))
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--accent-line)" strokeWidth="2.5" opacity="0.6" />
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 11 11)" />
    </svg>
  )
}

export function Mark({ state, cell, small }: { state: CellState; cell?: Cell; small?: boolean }) {
  const size = small ? 13 : 16
  return (
    <span className={`mt-mark is-${state}` + (small ? ' is-small' : '')} aria-hidden>
      {(state === 'done' || state === 'retry') && <Icon name="check" size={size} />}
      {state === 'stuck' && <b>!</b>}
      {state === 'progress' && <Ring value={cell && !small ? cell.solved / cell.total : 0.5} />}
    </span>
  )
}

export function Legend() {
  return (
    <div className="mt-legend">
      {(['done', 'retry', 'stuck', 'progress', 'none'] as const).map((s) => (
        <span key={s}><Mark state={s} small />{STATE_LABEL[s]}</span>
      ))}
    </div>
  )
}

// One event as a plain sentence, for the child's timeline. `compact` adds the lesson and keeps two short lines, for the feed.
export function EventBody({ e, compact }: { e: MEvent; compact?: boolean }) {
  const f = !!STUDENTS[e.kid]?.female
  const info = 'exId' in e ? EXERCISES.get(e.exId) : undefined
  const title = `«${LESSON_INFO.get(e.lessonId)?.lesson.title ?? ''}»`
  const task = info ? `задание ${info.n}` : 'задание'
  let head: ReactNode
  let tone = ''
  let detail: ReactNode = null
  switch (e.type) {
    case 'lesson-start':
      head = `${f ? 'Начала' : 'Начал'} урок`
      if (compact) detail = title
      break
    case 'attempt':
      tone = e.correct ? 'is-ok' : 'is-bad'
      head = e.correct ? `${f ? 'Решила' : 'Решил'} ${task}` : `${f ? 'Ошиблась' : 'Ошибся'} в ${task.replace('задание', 'задании')}`
      detail = e.answer && cap(e.answer.replace(/\n/g, ' / '))
      if (compact) detail = detail ? <>{title} · {detail}</> : title
      break
    case 'helper':
      head = `${f ? 'Спросила' : 'Спросил'} помощника про ${task}`
      detail = compact ? <>{title} · «{e.question}»</> : <span className="mt-ev-quote">{inline(e.question)}</span>
      break
    case 'lesson-done': {
      tone = 'is-ok'
      const result = `с первого раза ${e.firstTry} из ${e.total}${e.coins > 0 ? `, +${count(e.coins, 'кодкоин', 'кодкоина', 'кодкоинов')}` : ''}`
      head = `${f ? 'Прошла' : 'Прошёл'} урок`
      detail = compact ? `${title}: ${result}` : cap(result)
      break
    }
  }
  return (
    <>
      <div className={'mt-ev-head ' + tone}>{head}</div>
      {detail && <div className={compact ? 'mt-ev-line' : 'mt-ev-answer'}>{detail}</div>}
    </>
  )
}

export function EventIcon({ e }: { e: MEvent }) {
  if (e.type === 'helper') return <span className="mt-ev-icon is-helper"><HelperMark /></span>
  if (e.type === 'attempt') return <span className={'mt-ev-icon ' + (e.correct ? 'is-ok' : 'is-bad')}><Icon name={e.correct ? 'check' : 'x'} size={13} /></span>
  if (e.type === 'lesson-done') return <span className="mt-ev-icon is-done"><Icon name="flag" size={13} /></span>
  return <span className="mt-ev-icon"><Icon name="play" size={12} /></span>
}
