import type { ComponentType, ReactNode } from 'react'
import { Icon } from '../components'

// An exercise reports the current answer; the session around it owns the check button.
// `text` is the child's answer in words: the helper reads it, the mentor screen shows it.
// `note`: a short reason the answer is not right, shown on the result sheet. `replays`: the task plays the
// answer after the check (the robot runs the program) and calls `onSettled` when it ends; the result waits for it.
export type Answer = { correct: boolean | null; text?: string; note?: string; replays?: boolean }
export type ExProps<D> = { data: D; checked: boolean; onAnswer: (a: Answer) => void; onSettled?: () => void }

// Hints are guiding questions in order, from general to specific. `why` explains the right answer.
export type Meta = { hints: string[]; why: string }
export type Exercise = { id: string; kind: string; data: unknown } & Meta

export type Kind<D> = {
  kind: string
  label: string
  Component: ComponentType<ExProps<D>>
  // The task and its right answer in plain words, for the helper's prompt and the mentor screen.
  describe: (data: D) => string
  make: (id: string, data: D, meta: Meta) => Exercise
}

export function defineKind<D>(k: Omit<Kind<D>, 'make'>): Kind<D> {
  return { ...k, make: (id, data, meta) => ({ id, kind: k.kind, data, ...meta }) }
}

export type State = 'idle' | 'active' | 'ok' | 'bad'

export function stateOf(checked: boolean, answered: boolean, correct: boolean): State {
  if (checked && answered) return correct ? 'ok' : 'bad'
  return answered ? 'active' : 'idle'
}

// Class suffix for a pickable element: selected before the check, right or wrong after it.
export function mark(checked: boolean, picked: boolean, correct: boolean) {
  if (!picked) return ''
  if (!checked) return ' is-selected'
  return correct ? ' is-ok' : ' is-bad'
}

export function Task({ state, label, text, criteria, title, children, after }: {
  state: State; label: string; text: ReactNode; criteria?: string[]; title?: string; children: ReactNode; after?: ReactNode
}) {
  const icon = state === 'ok' ? 'check' : state === 'bad' ? 'x' : 'arrow'
  return (
    <div className="ex task" data-state={state}>
      <div className="ex-kind">{label}</div>
      <p className="ex-text">{text}</p>
      {criteria && (
        <ul className="criteria">
          {criteria.map((c) => <li key={c}><Icon name={icon} size={16} />{c}</li>)}
        </ul>
      )}
      <div className="task-card">
        {title && <div className="task-title">{title}</div>}
        <div className="task-inner">{children}</div>
      </div>
      {after}
    </div>
  )
}
