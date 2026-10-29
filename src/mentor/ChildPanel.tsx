import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components'
import { sessionsOf, stateText, statusLine, type Board, type Session } from './analyze'
import { ASSIGNED, ASSIGNED_EXERCISES, eventKey, LESSON_INFO, type MEvent } from './data'
import { count, dayTitle, hm, startOfDay } from './format'
import type { Fresh } from './live'
import { EventBody, EventIcon, Face, Mark } from './parts'

const CLOSE_MS = 200

// The newest event of the session animates when it has just arrived.
function SessionCard({ s, fresh }: { s: Session; fresh: MEvent | null }) {
  const info = LESSON_INFO.get(s.lessonId)
  const done = s.events.some((e) => e.type === 'lesson-done')
  return (
    <div className="mt-session">
      <div className="mt-session-head">
        <div>
          <b>«{info?.lesson.title}»</b>
          <span>{info?.topic.title}, урок {info?.n} · {hm(s.start)}{s.end - s.start > 60_000 ? `–${hm(s.end)}` : ''}</span>
        </div>
        {!done && <em>не закончен</em>}
      </div>
      <ol className="mt-timeline">
        {s.events.map((e) => (
          <li key={eventKey(e)} className={fresh === e ? 'is-new' : undefined}>
            <time>{hm(e.at)}</time>
            <EventIcon e={e} />
            <div className="mt-ev"><EventBody e={e} /></div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function ChildPanel({ board, idx, now, fresh, onClose }: { board: Board; idx: number; now: number; fresh: Fresh | null; onClose: () => void }) {
  const row = board.rows[idx]
  const s = row.student
  const [closing, setClosing] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const close = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, CLOSE_MS)
  }, [onClose])

  // The dialog takes focus itself, so Tab goes on to the close button and a mouse click shows no focus ring.
  // On close, focus goes back to the control that opened the panel, or to the child's row when a row was clicked.
  useEffect(() => {
    const before = document.activeElement
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      const opener = before instanceof HTMLElement && before !== document.body && before.isConnected ? before : document.getElementById(`mt-who-${idx}`)
      opener?.focus({ preventScroll: true })
    }
  }, [close, idx])

  const days = useMemo(() => {
    const out: { day: number; sessions: Session[] }[] = []
    for (const ss of sessionsOf(board.week, idx)) {
      const day = startOfDay(ss.start)
      const cur = out[out.length - 1]
      if (cur?.day === day) cur.sessions.push(ss)
      else out.push({ day, sessions: [ss] })
    }
    return out
  }, [board.week, idx])

  const newest = fresh ? board.week.filter((e) => e.kid === idx).at(-1) ?? null : null
  const status = statusLine(row, now)

  return (
    <>
      <div className={'mt-scrim' + (closing ? ' is-out' : '')} onClick={close} />
      <aside ref={panel} tabIndex={-1} className={'mt-panel' + (closing ? ' is-out' : '')} role="dialog" aria-modal="true" aria-labelledby="mt-panel-h">
        <header className="mt-panel-head">
          <Face idx={idx} size={52} active={row.active} />
          <div>
            <h2 id="mt-panel-h">{s.name}</h2>
            <p className={'mt-status is-' + status.tone}>{status.tone === 'live' && <i className="mt-dot" />}{status.text}</p>
          </div>
          <button className="mt-x" onClick={close} aria-label="Закрыть"><Icon name="close" size={20} /></button>
        </header>

        <div className="mt-panel-body">
          <div className="mt-panel-stats">
            <div><b>{row.solved}<small> из {ASSIGNED_EXERCISES}</small></b><span>заданий недели</span></div>
            <div><b>{row.firstTry}</b><span>с первого раза</span></div>
            <div><b>{row.wrong}</b><span>{count(row.wrong, 'ошибка', 'ошибки', 'ошибок').replace(/^\d+ /, '')}</span></div>
            <div><b>{row.helper}</b><span>{count(row.helper, 'вопрос', 'вопроса', 'вопросов').replace(/^\d+ /, '')} Робику</span></div>
          </div>

          <h3 className="mt-panel-h3">Уроки недели</h3>
          <ul className="mt-panel-lessons">
            {ASSIGNED.map((l) => {
              const c = row.cells[l.id]
              const info = LESSON_INFO.get(l.id)!
              return (
                <li key={l.id}>
                  <Mark state={c.state} cell={c} />
                  <div>
                    <b>{l.title}</b>
                    <span>{info.topic.title}, урок {info.n} · {stateText(c, s, l.id)}</span>
                  </div>
                  <span className="mt-panel-count">{c.solved} из {c.total}</span>
                </li>
              )
            })}
          </ul>

          <h3 className="mt-panel-h3">Неделя по дням</h3>
          {days.length === 0
            ? <p className="mt-empty">На этой неделе {s.name} не {s.female ? 'заходила' : 'заходил'} в приложение.</p>
            : days.map((d) => (
              <section key={d.day} className="mt-day">
                <h4>{dayTitle(d.day, now)}</h4>
                {d.sessions.map((ss) => <SessionCard key={ss.start} s={ss} fresh={newest} />)}
              </section>
            ))}
        </div>
      </aside>
    </>
  )
}
