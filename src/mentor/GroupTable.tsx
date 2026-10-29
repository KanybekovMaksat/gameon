import { useState, type MouseEvent } from 'react'
import { TOPICS } from '../content'
import { isAssigned, statusLine, stateText, type Board, type Row } from './analyze'
import { ASSIGNED, ASSIGNED_EXERCISES, LESSON_INFO } from './data'
import { ago, cap, count, dateLong } from './format'
import type { Fresh } from './live'
import { Face, Legend, Mark } from './parts'

// The hover card keeps only where it points; the cell comes from the current board, so live changes show at once.
type Tip = { kid: number; lessonId: string; x: number; y: number; below: boolean }

function weekRange(start: number, now: number) {
  const a = new Date(start)
  const b = new Date(now)
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${dateLong(now)}` : `${dateLong(start)} – ${dateLong(now)}`
}

function CellTip({ tip, row, now }: { tip: Tip; row: Row; now: number }) {
  const c = row.cells[tip.lessonId]
  const info = LESSON_INFO.get(tip.lessonId)!
  return (
    <div className={'mt-tip' + (tip.below ? ' is-below' : '')} style={{ left: tip.x, top: tip.y }} role="tooltip">
      <small>{row.student.name} · {info.topic.title}, урок {info.n}</small>
      <b>{info.lesson.title}</b>
      <span className="mt-tip-state"><Mark state={c.state} small />{stateText(c, row.student, tip.lessonId)}</span>
      {c.state !== 'none' && (
        <>
          <span className="mt-tip-facts">Решено {c.solved} из {c.total}</span>
          <span className="mt-tip-facts">{count(c.wrong, 'ошибка', 'ошибки', 'ошибок')} · {count(c.helper, 'вопрос', 'вопроса', 'вопросов')} Робику</span>
        </>
      )}
      {c.last !== null && <span className="mt-tip-facts">{cap(ago(c.last, now))}</span>}
    </div>
  )
}

export function GroupTable({ board, now, fresh, freshKid, onOpen }: {
  board: Board; now: number; fresh: Fresh | null; freshKid: number; onOpen: (idx: number) => void
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const topics = TOPICS.filter((t) => t.lessons.length)

  const show = (e: MouseEvent<HTMLElement>, kid: number, lessonId: string) => {
    const r = e.currentTarget.getBoundingClientRect()
    const below = r.top < 190
    setTip({ kid, lessonId, x: r.left + r.width / 2, y: below ? r.bottom : r.top, below })
  }

  return (
    <section className="mt-card" aria-labelledby="mt-table-h">
      <div className="mt-card-head">
        <div>
          <h2 id="mt-table-h">Класс за неделю</h2>
          <p>Задано {count(ASSIGNED.length, 'урок', 'урока', 'уроков')}, {count(ASSIGNED_EXERCISES, 'задание', 'задания', 'заданий')} · {weekRange(board.weekStart, now)}</p>
        </div>
        <Legend />
      </div>
      <div className="mt-table-wrap" onScroll={() => setTip(null)}>
        <table className="mt-table">
          <thead>
            <tr>
              <th scope="col" className="mt-th-name">Ученик</th>
              {topics.map((t) => (
                <th key={t.id} scope="col" className={'mt-th-topic' + (t.lessons.some((l) => isAssigned(l.id)) ? '' : ' is-later')}>
                  <span>{t.title}</span>
                </th>
              ))}
              <th scope="col" className="mt-c-share">Задания недели</th>
              <th scope="col" className="mt-c-num mt-c-err">Ошибки</th>
              <th scope="col" className="mt-c-num mt-c-q">Вопросы</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => {
              const s = row.student
              const hot = fresh && s.idx === freshKid ? fresh : null
              const status = statusLine(row, now)
              const share = row.solved / ASSIGNED_EXERCISES
              return (
                <tr key={s.idx} className={hot ? 'is-fresh' : undefined} onClick={() => onOpen(s.idx)}>
                  <th scope="row" className="mt-td-name">
                    <button id={`mt-who-${s.idx}`} className="mt-who" onClick={(e) => { e.stopPropagation(); onOpen(s.idx) }} aria-label={`${s.name}: открыть неделю`}>
                      <Face idx={s.idx} active={row.active} />
                      <span>
                        <b>{s.name}</b>
                        <small className={'mt-status is-' + status.tone} title={status.text}>{status.tone === 'live' && <i className="mt-dot" />}{status.text}</small>
                      </span>
                    </button>
                  </th>
                  {/* One cell per topic, one mark per lesson in path order; each mark has its own hover card. */}
                  {topics.map((t) => (
                    <td key={t.id} className={'mt-td-topic' + (t.lessons.some((l) => isAssigned(l.id)) ? '' : ' is-later')}>
                      <span className="mt-marks">
                        {t.lessons.map((l) => {
                          const c = row.cells[l.id]
                          const cellHot = hot && hot.lessonId === l.id
                          return (
                            <span
                              key={l.id}
                              role="img"
                              className={'mt-lesson' + (cellHot ? ' is-fresh' : '')}
                              aria-label={`${t.title}, урок ${LESSON_INFO.get(l.id)!.n} «${l.title}»: ${stateText(c, s, l.id)}`}
                              onMouseEnter={(e) => show(e, s.idx, l.id)}
                              onMouseLeave={() => setTip(null)}
                            >
                              <Mark key={cellHot ? hot.n : 'mark'} state={c.state} cell={c} />
                            </span>
                          )
                        })}
                      </span>
                    </td>
                  ))}
                  <td className="mt-c-share">
                    <span className="mt-share"><b>{row.solved}</b> из {ASSIGNED_EXERCISES}</span>
                    <span className="mt-bar"><i className={share >= 0.9 ? 'is-goal' : undefined} style={{ width: `${Math.round(share * 100)}%` }} /></span>
                  </td>
                  <td className={'mt-c-num mt-c-err' + (row.wrong ? '' : ' is-zero')}>{row.wrong}</td>
                  <td className={'mt-c-num mt-c-q' + (row.helper ? '' : ' is-zero')}>{row.helper}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {tip && board.rows[tip.kid] && <CellTip tip={tip} row={board.rows[tip.kid]} now={now} />}
    </section>
  )
}
