import { useState } from 'react'
import { navigate } from '../app/router'
import { sfx } from '../app/sfx'
import { Icon } from '../components'
import { TOPICS } from '../content'
import { KINDS } from '../exercises/registry'
import { LOOP_VARIANTS } from '../lab/loops'
import { STATUS } from '../lab/types'
import './tasks.css'

// Where each kind of task first appears in the lessons. Loops go first, so the demo starts on the topic the
// forms were built for; «Условия» stays last, since that topic opens only after the office lesson.
const ORDER = ['loops', 'algorithms', 'variables', 'sorting', 'binary', 'logic', 'conditions']
const topics = [...TOPICS].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
const firstLesson = (kind: string) => {
  for (const t of topics) for (const l of t.lessons) if (l.practice.some((ex) => ex.kind === kind)) return { topic: t, lesson: l }
  return null
}

const go = (to: string) => { sfx('tap'); navigate(to) }

// «Задания»: every form of task in the app, one tap from its start. The loop forms open their mini lessons on
// the lab page; a kind of task opens the lesson that has it, at that task.
export function Tasks() {
  const [scrolled, setScrolled] = useState(false)
  return (
    <div className="tasks">
      <div className={'tasks-scroll' + (scrolled ? ' is-scrolled' : '')} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        <header className="tasks-head">
          <h1>Задания</h1>
          <p>Выбери форму и начни.</p>
        </header>

        <section className="tasks-sec" aria-labelledby="tasks-forms">
          <h2 id="tasks-forms">Формы на циклы</h2>
          <ul className="tasks-list">
            {LOOP_VARIANTS.filter((v) => v.Component).map((v) => (
              <li key={v.id}>
                <button onClick={() => go(`/lab/loops/${v.id}`)}>
                  <span className="tasks-icon"><Icon name="loop" size={20} /></span>
                  <span className="tasks-text"><b>{v.title} <em className={'lab-tag is-' + v.status}>{STATUS[v.status]}</em></b><small>{v.tagline}</small></span>
                  <Icon name="arrow" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="tasks-sec" aria-labelledby="tasks-kinds">
          <h2 id="tasks-kinds">Типы заданий</h2>
          <ul className="tasks-list">
            {KINDS.map((k) => {
              const at = firstLesson(k.kind)
              if (!at) return null
              return (
                <li key={k.kind}>
                  <button onClick={() => go(`/lesson/${at.lesson.id}?at=${k.kind}`)}>
                    <span className="tasks-icon"><Icon name={at.topic.icon} size={20} /></span>
                    <span className="tasks-text"><b>{k.label}</b><small>{at.topic.title} · {at.lesson.title}</small></span>
                    <Icon name="arrow" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
