import { useState } from 'react'
import { Circuit, combos, evaluate, formula, GATE_NAME, GateIcon, outOf, TruthTable, type Gate, type GateType } from './circuit'
import { defineKind, mark, stateOf, Task, type ExProps } from './kit'

// Two tasks on one circuit. Without `pick`: set the switches so the lamp is on (or off, with goal 'off').
// With `pick`: the gate `pick.gate` is hidden and the child picks its type; its type in `gates` is the answer.
export type GatesData = {
  text: string
  inputs: string[]
  gates: Gate[]
  start?: string[]
  // Broken switches: they keep their start position.
  locked?: string[]
  goal?: 'on' | 'off'
  pick?: { gate: string; options: GateType[]; table?: boolean }
}

const words = (names: string[]) => names.join(' и ')

// Only what the child changed from the start: a broken or untouched switch is not in the answer.
function changesText(inputs: string[], start: Record<string, boolean>, on: Record<string, boolean>) {
  const moved = inputs.filter((n) => on[n] !== start[n])
  const up = moved.filter((n) => on[n])
  const down = moved.filter((n) => !on[n])
  const parts = [up.length ? `включил ${words(up)}` : '', down.length ? `выключил ${words(down)}` : ''].filter(Boolean)
  return parts.length ? parts.join(', ') : 'вернул выключатели как было'
}

function Gates({ data, checked, onAnswer }: ExProps<GatesData>) {
  const { inputs, gates, pick: task } = data
  const [start] = useState<Record<string, boolean>>(() => Object.fromEntries(inputs.map((n) => [n, !!data.start?.includes(n)])))
  const [on, setOn] = useState(start)
  const [touched, setTouched] = useState(false)
  const [pick, setPick] = useState<GateType | null>(null)
  const outId = outOf(inputs, gates)
  const goal = data.goal !== 'off'
  const real = task ? gates.find((g) => g.id === task.gate)!.type : null

  const answered = task ? pick !== null : touched
  const lampOn = evaluate(gates, on, task ? { [task.gate]: pick } : {})[outId] === true
  const correct = task ? pick === real : lampOn === goal

  const toggle = (name: string) => {
    if (checked) return
    const next = { ...on, [name]: !on[name] }
    setOn(next)
    if (task) return
    setTouched(true)
    const lit = evaluate(gates, next)[outId] === true
    onAnswer({ correct: lit === goal, text: `${changesText(inputs, start, next)}. Лампа ${lit ? 'горит' : 'не горит'}` })
  }

  const choose = (t: GateType) => {
    if (checked) return
    setPick(t)
    onAnswer({ correct: t === real, text: `поставил элемент ${GATE_NAME[t]}` })
  }

  // In the pick task a wrong check shows only the card state: marks on the gate, the option or the table
  // would give the answer away by elimination. A right check marks them green.
  const done = checked && correct
  let table = null
  if (task?.table) {
    const cols = combos(inputs.length).map((vals) => {
      const state = Object.fromEntries(inputs.map((n, i) => [n, vals[i]]))
      const need = evaluate(gates, state)[outId] === true
      const got = evaluate(gates, state, { [task.gate]: pick })[outId]
      return { vals, lamp: need, mark: done && got === need ? 'ok' as const : undefined }
    })
    const current = cols.findIndex((c) => c.vals.every((v, i) => v === on[inputs[i]]))
    table = <TruthTable inputs={inputs} cols={cols} current={checked ? undefined : current} title="Как должна работать лампа" />
  }

  return (
    <Task
      state={stateOf(checked, answered, correct)}
      label={gates_.label}
      text={data.text}
      after={task && (
        <div className="options gt-opts" style={{ gridTemplateColumns: `repeat(${task.options.length}, 1fr)` }}>
          {task.options.map((t, i) => (
            <button key={t} className={'option gt-opt' + (done ? mark(true, pick === t, true) : mark(false, pick === t, false))} onClick={() => choose(t)} aria-pressed={pick === t}>
              <span className="key">{i + 1}</span>
              <GateIcon type={t} />
              <b>{GATE_NAME[t]}</b>
            </button>
          ))}
        </div>
      )}
    >
      <div className="gt">
        <Circuit
          inputs={inputs}
          gates={gates}
          on={on}
          onToggle={checked ? undefined : toggle}
          locked={data.locked}
          slot={task && { id: task.gate, type: pick, mark: done ? 'ok' : undefined }}
          lampMark={!task && checked && touched ? (correct ? 'ok' : 'bad') : undefined}
        />
        {!task && !checked && !touched && <p className="dg-note">Нажимай на выключатели слева</p>}
        {task && !checked && !table && <p className="dg-note">Выключатели можно нажимать, чтобы проверить схему</p>}
        {table}
      </div>
    </Task>
  )
}

function describe(d: GatesData) {
  const outId = outOf(d.inputs, d.gates)
  const bits = (vals: boolean[]) => d.inputs.map((n, i) => `${n}=${vals[i] ? 1 : 0}`).join(', ')
  if (d.pick) {
    const real = d.gates.find((g) => g.id === d.pick!.gate)!.type
    let s = `${d.text}\nСхема: лампа = ${formula(outId, d.gates, d.pick.gate)}, где знаком ? отмечен пропущенный элемент. Варианты: ${d.pick.options.map((t) => GATE_NAME[t]).join(', ')}.`
    if (d.pick.table) {
      const rows = combos(d.inputs.length).map((vals) => {
        const lit = evaluate(d.gates, Object.fromEntries(d.inputs.map((n, i) => [n, vals[i]])))[outId]
        return `${bits(vals)}: ${lit ? 'горит' : 'не горит'}`
      })
      s += ` Нужная работа лампы: ${rows.join('; ')}.`
    }
    return `${s} Верный ответ: ${GATE_NAME[real]}.`
  }
  const goal = d.goal !== 'off'
  const locked = d.locked ?? []
  const good = combos(d.inputs.length).filter((vals) => {
    const state = Object.fromEntries(d.inputs.map((n, i) => [n, vals[i]]))
    if (locked.some((n) => state[n] !== !!d.start?.includes(n))) return false
    return (evaluate(d.gates, state)[outId] === true) === goal
  })
  const broken = locked.map((n) => ` Выключатель ${n} сломан, он всегда ${d.start?.includes(n) ? 'включён' : 'выключен'}.`).join('')
  return `${d.text}\nСхема: лампа = ${d.gates.length ? formula(outId, d.gates) : d.inputs[0]}.${broken} Лампа должна ${goal ? 'гореть' : 'погаснуть'}. Верные положения выключателей: ${good.map(bits).join('; ')}.`
}

const gates_ = defineKind<GatesData>({
  kind: 'gates',
  label: 'Логическая схема',
  Component: Gates,
  describe,
})
export { gates_ as gates }
