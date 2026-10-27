import { useState } from 'react'
import { Circuit, combos, evaluate, GATE_NAME, TruthTable, type Gate, type GateType } from '../../exercises/circuit'
import './digital-visuals.css'

// One switch and a lamp: 1 is on, 0 is off.
export function LampSwitch() {
  const [on, setOn] = useState(false)
  return (
    <div className="dv">
      <Circuit inputs={['A']} gates={[]} on={{ A: on }} onToggle={() => setOn(!on)} />
      <div className="dv-legend">
        <div className={on ? '' : 'is-on'}><b>0</b><span>выключено,<br />лампа не горит</span></div>
        <div className={on ? 'is-on' : ''}><b>1</b><span>включено,<br />лампа горит</span></div>
      </div>
    </div>
  )
}

const RULE: Record<GateType, string> = {
  and: 'Горит, только если включены оба',
  or: 'Горит, если включён хотя бы один',
  not: 'Переворачивает сигнал',
}

// И, ИЛИ, НЕ one at a time: the child switches the gate and the switches and sees the lamp.
export function GateLab() {
  const [type, setType] = useState<GateType>('and')
  const [on, setOn] = useState({ A: true, B: false })
  const inputs = type === 'not' ? ['A'] : ['A', 'B']
  const gates: Gate[] = [{ id: 'g', type, in: inputs }]
  const out = evaluate(gates, on).g === true
  const bit = (v: boolean) => (v ? 1 : 0)
  return (
    <div className="dv">
      <div className="dv-seg" role="radiogroup" aria-label="Элемент">
        {(['and', 'or', 'not'] as GateType[]).map((t) => (
          <button key={t} role="radio" aria-checked={type === t} className={type === t ? 'is-on' : ''} onClick={() => setType(t)}>{GATE_NAME[t]}</button>
        ))}
      </div>
      <Circuit inputs={inputs} gates={gates} on={on} onToggle={(n) => setOn({ ...on, [n]: !on[n as 'A' | 'B'] })} />
      <div className="dv-formula" aria-live="polite">
        <code>
          {type === 'not' ? `НЕ ${bit(on.A)}` : `${bit(on.A)} ${GATE_NAME[type]} ${bit(on.B)}`} = <b className={out ? 'is-on' : ''}>{bit(out)}</b>
        </code>
        <span>{RULE[type]}</span>
      </div>
    </div>
  )
}

const CHAIN: Gate[] = [
  { id: 'or', type: 'or', in: ['A', 'B'] },
  { id: 'not', type: 'not', in: ['C'] },
  { id: 'and', type: 'and', in: ['or', 'not'] },
]

// A circuit of three gates: the signal goes from left to right.
export function CircuitLab() {
  const [on, setOn] = useState<Record<string, boolean>>({ A: false, B: true, C: true })
  return (
    <div className="dv">
      <Circuit inputs={['A', 'B', 'C']} gates={CHAIN} on={on} onToggle={(n) => setOn({ ...on, [n]: !on[n] })} />
      <div className="dv-formula"><code>(A ИЛИ B) И НЕ C</code><span>Нажимай на выключатели и следи за синим сигналом</span></div>
    </div>
  )
}

const OR: Gate[] = [{ id: 'g', type: 'or', in: ['A', 'B'] }]

// A truth table filled one column at a time: each tap sets the next combination of switches.
export function TruthStepper() {
  const all = combos(2)
  const [k, setK] = useState(-1)
  const vals = k < 0 ? [false, false] : all[k]
  const on = { A: vals[0], B: vals[1] }
  const cols = all.map((v, i) => ({ vals: v, lamp: i <= k ? evaluate(OR, { A: v[0], B: v[1] }).g === true : null }))
  const done = k === all.length - 1
  return (
    <div className="dv">
      <Circuit inputs={['A', 'B']} gates={OR} on={on} />
      <TruthTable inputs={['A', 'B']} cols={cols} current={k < 0 ? undefined : k} />
      <button className="btn btn-secondary btn-sm dv-step" onClick={() => setK(done ? -1 : k + 1)}>
        {done ? 'Сначала' : k < 0 ? 'Первое сочетание' : 'Следующее сочетание'}
      </button>
    </div>
  )
}
