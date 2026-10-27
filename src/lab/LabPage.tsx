import { useEffect, useRef, useState } from 'react'
import { leave, navigate } from '../app/router'
import { Sheet } from '../app/Sheet'
import { sfx } from '../app/sfx'
import { Icon } from '../components'
import { LOOP_VARIANTS } from './loops'
import { FAILED, OPEN, PRINCIPLES } from './loops/findings'
import { STATUS, type LabVariant } from './types'
import './lab.css'

// `/lab/loops` and `/lab/loops/<id>`: forms of interaction for loop tasks, each a working mini lesson.
function labVariant(path: string): { list: LabVariant[]; current: LabVariant | null } {
  const id = path.split('/')[3]
  return { list: LOOP_VARIANTS, current: LOOP_VARIANTS.find((v) => v.id === id) ?? LOOP_VARIANTS[0] ?? null }
}

const pick = (v: LabVariant) => { sfx('tap'); navigate(`/lab/loops/${v.id}`, { replace: true }) }

const Tag = ({ v }: { v: LabVariant }) => <em className={'lab-tag is-' + v.status}>{STATUS[v.status]}</em>

// The card of one form: the same four lines as its entry in the hub's pattern library.
function About({ v }: { v: LabVariant }) {
  return (
    <dl className="lab-about">
      <dt>Ребёнок</dt><dd>{v.what}</dd>
      <dt>{v.status === 'dropped' ? 'Почему нет' : 'Почему работает'}</dt><dd>{v.why}</dd>
      <dt>Решение</dt><dd>{v.verdict}</dd>
      <dt>Источник</dt><dd>{v.from}</dd>
    </dl>
  )
}

function Lines({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="lab-sec">
      <h4>{title}</h4>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  )
}

// The phone screen: the playable forms as chips on top, the chosen one below. On a phone the card opens in a sheet.
export function LabScreen({ path, wide }: { path: string; wide: boolean }) {
  const { list, current } = labVariant(path)
  const [info, setInfo] = useState(false)
  const n = current ? list.indexOf(current) + 1 : 0
  // The chosen chip comes into view, also when the page opens on a variant further along the row.
  const chips = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches
    chips.current?.querySelector('.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: quick ? 'auto' : 'smooth' })
  }, [current])
  return (
    <div className="lab">
      <div className="lab-top">
        <button className="session-close" aria-label="Закрыть" onClick={() => leave('/')}><Icon name="close" size={22} /></button>
        <div className="lab-title">
          <b>Задачи на циклы</b>
          <small>{current ? `Форма ${n} из ${list.length} · ${STATUS[current.status]}` : 'Формы готовятся'}</small>
        </div>
        {current && !wide && <button className="lab-info" aria-label="Об этой форме" onClick={() => setInfo(true)}><Icon name="spark" size={20} /></button>}
      </div>
      <div className="lab-chips" ref={chips}>
        {list.map((v, i) => v.Component && (
          <button key={v.id} className={'lab-chip' + (v === current ? ' is-on' : '')} onClick={() => pick(v)}>
            <i>{i + 1}</i>{v.title}
          </button>
        ))}
      </div>
      <div className="lab-stage">
        {current?.Component ? <current.Component key={current.id} /> : (
          <p className="lab-empty">{current ? current.verdict : 'Здесь появятся формы задач на циклы.'}</p>
        )}
      </div>
      {info && current && (
        <Sheet label={current.title} onClose={() => setInfo(false)}>
          {() => (
            <>
              <h3>{current.title} <Tag v={current} /></h3>
              <p className="t-small">{current.tagline}</p>
              <About v={current} />
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}

// Beside the phone on a wide screen, for a talk. Two tabs, so each fits the panel without scrolling: the forms with
// their status and the chosen one's card; the findings (principles, what failed, what is open).
// The words match the hub's `notes/exercise-patterns.md`.
export function LabPanel({ path }: { path: string }) {
  const { list, current } = labVariant(path)
  const [tab, setTab] = useState<'forms' | 'notes'>('forms')
  // The chosen form and its card stay in view as the list grows or shrinks around it.
  const box = useRef<HTMLOListElement>(null)
  useEffect(() => {
    box.current?.querySelector('li.is-on')?.scrollIntoView({ block: 'nearest' })
  }, [current, tab])
  return (
    <aside className="demo lab-panel">
      <div className="demo-brand">
        <img src="/logo-gradient.png" alt="" />
        <div>
          <b>Задачи на циклы</b>
          <small>Паттерны заданий</small>
        </div>
      </div>
      <div className="demo-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'forms'} onClick={() => setTab('forms')}>Формы</button>
        <button role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>Выводы</button>
      </div>
      <div className="demo-pane">
      {tab === 'forms' ? (
        <ol className="lab-list" ref={box}>
          {list.map((v, i) => (
            <li key={v.id} className={v === current ? 'is-on' : ''}>
              <button onClick={() => pick(v)}>
                <i>{i + 1}</i>
                <span><b>{v.title} <Tag v={v} /></b><small>{v.tagline}</small></span>
              </button>
              {v === current && <About v={v} />}
            </li>
          ))}
        </ol>
      ) : (
        <>
          <Lines title="Принципы" items={PRINCIPLES} />
          <Lines title="Не сработало" items={FAILED} />
          <Lines title="Открыто" items={OPEN} />
        </>
      )}
      </div>
      <div className="demo-links">
        <button onClick={() => leave('/')}><Icon name="back" size={16} />К демо</button>
      </div>
    </aside>
  )
}
