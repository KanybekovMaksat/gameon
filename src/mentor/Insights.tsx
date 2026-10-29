import { useState } from 'react'
import { Icon } from '../components'
import { highlight } from '../exercises/code'
import { inline } from '../session/text'
import { label, officeWhen, taskParts, wrongFact, type Board, type StuckItem } from './analyze'
import { eventKey, OFFICE_TOPIC, REAL, STUDENTS } from './data'
import { ago, count, plural } from './format'
import type { Fresh } from './live'
import { EventBody, Face } from './parts'

const SHOWN = 4
const QUOTES = 3

function StuckRow({ it, rank, now, hot, onOpen }: { it: StuckItem; rank: number; now: number; hot: boolean; onOpen: (idx: number) => void }) {
  const [allQuotes, setAllQuotes] = useState(false)
  const task = taskParts(it.info.ex)
  const wrong = it.common && wrongFact(it.common.text)
  const quotes = allQuotes ? it.questions : it.questions.slice(0, QUOTES)
  return (
    <li id={`mt-ex-${it.info.ex.id}`} className={'mt-stuck-item' + (hot ? ' is-fresh' : '')}>
      <span className="mt-rank">{rank}</span>
      <div className="mt-stuck-task">
        <div className="mt-kicker">{label(it.info)} · {it.info.topic.title}, «{it.info.lesson.title}», задание {it.info.n}</div>
        <p className="mt-stuck-text">{task.text}</p>
        {task.code && (
          <pre className="code mt-code">
            {task.code.split('\n').map((l, i) => <div key={i} className="code-row"><i>{i + 1}</i><span>{highlight(l)}</span></div>)}
          </pre>
        )}
        <div className="mt-facts">
          {task.answer && (
            <span className="mt-fact is-ok">
              <Icon name="check" size={15} />
              <span>{task.answer.label}: {task.answer.code ? <code>{task.answer.text}</code> : <b>{task.answer.text}</b>}</span>
            </span>
          )}
          {it.common && wrong && (
            <span className="mt-fact is-bad">
              <Icon name="x" size={15} />
              <span>
                {wrong.lead}{wrong.detail && <>: {wrong.code ? <code>{wrong.detail}</code> : <b>{wrong.detail}</b>}</>}, {count(it.common.n, 'раз', 'раза', 'раз')}
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="mt-stuck-side">
        <div className="mt-stuck-stats">
          <span><b>{it.erred} из {it.attempted}</b> {plural(it.erred, 'ошибся', 'ошиблись', 'ошиблись')}</span>
          <span><b>{it.wrong}</b> {count(it.wrong, 'ошибка', 'ошибки', 'ошибок').replace(/^\d+ /, '')}</span>
          <span><b>{it.helper}</b> {count(it.helper, 'вопрос', 'вопроса', 'вопросов').replace(/^\d+ /, '')}</span>
        </div>
        <div className="mt-kids">
          {it.kids.map((k) => {
            const s = STUDENTS[k.idx]
            const parts = [k.wrong ? count(k.wrong, 'ошибка', 'ошибки', 'ошибок') : '', k.helper ? count(k.helper, 'вопрос', 'вопроса', 'вопросов') : ''].filter(Boolean)
            return (
              <button key={k.idx} className={'mt-kid' + (k.stuck ? ' is-stuck' : '')} onClick={() => onOpen(k.idx)}>
                <Face idx={k.idx} size={22} />
                <b>{s.name}</b>
                <span>{parts.join(', ')}</span>
                {k.stuck && <em>{s.female ? 'застряла' : 'застрял'}</em>}
              </button>
            )
          })}
        </div>
        {quotes.length > 0 && (
          <ul className="mt-quotes" aria-label="Вопросы Робику">
            {quotes.map((q) => (
              <li key={q.at + q.text}>
                <Face idx={q.kid} size={24} />
                <div>
                  <small>{STUDENTS[q.kid].name} · {ago(q.at, now)}</small>
                  <p>{inline(q.text)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {it.questions.length > QUOTES && (
          <button className="mt-link" onClick={() => setAllQuotes(!allQuotes)}>
            {allQuotes ? 'Скрыть' : `Ещё ${count(it.questions.length - QUOTES, 'вопрос', 'вопроса', 'вопросов')}`}
          </button>
        )}
      </div>
    </li>
  )
}

export function StuckList({ board, now, fresh, onOpen }: { board: Board; now: number; fresh: Fresh | null; onOpen: (idx: number) => void }) {
  const [all, setAll] = useState(false)
  const items = all ? board.stuck : board.stuck.slice(0, SHOWN)
  const lastReal = fresh ? board.week.filter((e) => e.kid === REAL.idx).at(-1) : undefined
  const hotEx = lastReal && 'exId' in lastReal ? lastReal.exId : null
  return (
    <section className="mt-card" aria-labelledby="mt-stuck-h">
      <div className="mt-card-head">
        <div>
          <h2 id="mt-stuck-h">Где застряли</h2>
          <p>Задания недели с ошибками и вопросами Робику, сначала самые трудные</p>
        </div>
      </div>
      {board.stuck.length === 0
        ? <p className="mt-empty">На этой неделе ни одно задание не вызвало трудностей.</p>
        : (
          <ol className="mt-stuck">
            {items.map((it, i) => <StuckRow key={it.info.ex.id} it={it} rank={i + 1} now={now} hot={hotEx === it.info.ex.id} onOpen={onOpen} />)}
          </ol>
        )}
      {board.stuck.length > SHOWN && (
        <button className="mt-more" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : `Показать ещё ${count(board.stuck.length - SHOWN, 'задание', 'задания', 'заданий')}`}
        </button>
      )}
    </section>
  )
}

export function Suggestions({ board, now, onOpen }: { board: Board; now: number; onOpen: (idx: number) => void }) {
  const toTask = (exId: string) => {
    const el = document.getElementById(`mt-ex-${exId}`)
    if (!el) return
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    el.classList.remove('is-focus')
    void el.offsetWidth
    el.classList.add('is-focus')
  }
  return (
    <section className="mt-card mt-plan" aria-labelledby="mt-plan-h">
      <div className="mt-card-head">
        <div>
          <h2 id="mt-plan-h">К уроку в классе</h2>
          <p>{officeWhen(now)} · тема «{OFFICE_TOPIC.title}»</p>
        </div>
      </div>
      {board.suggestions.length === 0
        ? <p className="mt-empty">Данных пока мало. Советы появятся, когда ученики начнут задания.</p>
        : (
          <ol className="mt-tips">
            {board.suggestions.map((s, i) => (
              <li key={i + s.lead}>
                <span className="mt-tip-n">{i + 1}</span>
                <div>
                  <p className="mt-tip-lead">{s.lead}</p>
                  <p className="mt-tip-why">{s.why}</p>
                  {s.exId && <button className="mt-link" onClick={() => toTask(s.exId!)}>К заданию<Icon name="arrow" size={14} /></button>}
                  {s.kid !== undefined && <button className="mt-link" onClick={() => onOpen(s.kid!)}>Неделя ученика<Icon name="arrow" size={14} /></button>}
                </div>
              </li>
            ))}
          </ol>
        )}
    </section>
  )
}

const FEED = 5

// The latest actions of the group, newest first: short enough to stay on screen during a demo.
export function Feed({ board, now }: { board: Board; now: number }) {
  return (
    <section className="mt-card mt-feed-card" aria-labelledby="mt-feed-h">
      <div className="mt-card-head">
        <div>
          <h2 id="mt-feed-h">Последние действия</h2>
          <p>Весь класс, новые сверху</p>
        </div>
      </div>
      <ul className="mt-feed" aria-live="polite">
        {board.feed.slice(0, FEED).map((e) => (
          <li key={e.kid + eventKey(e)}>
            <Face idx={e.kid} size={28} />
            <div>
              <div className="mt-feed-who"><b>{STUDENTS[e.kid].name}</b><span>{ago(e.at, now)}</span></div>
              <EventBody e={e} compact />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
