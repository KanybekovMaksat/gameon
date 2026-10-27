import type { ReactNode } from 'react'
import { Icon } from '../../components'
import './visuals.css'

// The controls under a step-by-step visual: back to the start, the step count, the next step.
// `result` replaces the step count after the last step.
export function StepBar({ k, total, onNext, onReset, result }: { k: number; total: number; onNext: () => void; onReset: () => void; result?: ReactNode }) {
  const done = k >= total
  return (
    <div className="vis-bar">
      <button className="vis-icon" onClick={onReset} disabled={k === 0} aria-label="Сначала"><Icon name="redo" size={18} /></button>
      <span className={'vis-count' + (done && result ? ' is-result' : '')} aria-live="polite">{k === 0 ? 'Нажми «Шаг»' : done && result ? result : `Шаг ${k} из ${total}`}</span>
      <button className="vis-next" onClick={done ? onReset : onNext}>
        {done ? <><Icon name="redo" size={16} />Сначала</> : <>Шаг<Icon name="arrow" size={16} /></>}
      </button>
    </div>
  )
}

// A two-way switch above a visual.
export function Switch<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="vis-switch" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}
