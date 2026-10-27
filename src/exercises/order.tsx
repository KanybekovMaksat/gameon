import { useMemo, useState } from 'react'
import { Icon } from '../components'
import { defineKind, stateOf, Task, type ExProps } from './kit'

// `steps` are in the right order; the bank shows them in `shuffle` order (indexes into steps).
export type OrderData = { text?: string; title: string; steps: string[]; shuffle: number[]; criteria?: string[]; code?: boolean }

function Order({ data, checked, onAnswer }: ExProps<OrderData>) {
  const [order, setOrder] = useState<number[]>([])
  const n = data.steps.length
  const full = order.length === n
  const correct = useMemo(() => full && order.every((s, i) => s === i), [full, order])
  const update = (next: number[]) => {
    setOrder(next)
    const done = next.length === n
    onAnswer({
      correct: done ? next.every((s, i) => s === i) : null,
      text: done ? `расставил так: ${next.map((s) => data.steps[s]).join(' → ')}` : undefined,
    })
  }
  const Chip = data.code ? 'code' : 'span'
  return (
    <Task
      state={stateOf(checked, full, correct)}
      label={order_.label}
      text={data.text ?? 'Нажимай на шаги по порядку, чтобы получился алгоритм.'}
      criteria={data.criteria}
      title={data.title}
      after={!checked && order.length > 0 && (
        <button className="start-over" onClick={() => update([])}><Icon name="redo" size={16} />Начать заново</button>
      )}
    >
      <div className="ex" style={{ gap: 12 }}>
        <div className="answer-line">
          {order.length === 0 && <span className="placeholder">Здесь появятся шаги</span>}
          {order.map((s, i) => (
            <button key={s} className="chip" onClick={() => !checked && update(order.filter((x) => x !== s))}>
              <b>{i + 1}</b><Chip>{data.steps[s]}</Chip>
            </button>
          ))}
        </div>
        <div className="bank">
          {data.shuffle.map((s) => (
            <button key={s} className={'chip' + (order.includes(s) ? ' is-used' : '')} onClick={() => !checked && update([...order, s])}>
              <Chip>{data.steps[s]}</Chip>
            </button>
          ))}
        </div>
      </div>
    </Task>
  )
}

const order_ = defineKind<OrderData>({
  kind: 'order',
  label: 'Расставь шаги',
  Component: Order,
  describe: (d) => `${d.text ?? 'Расставь шаги по порядку.'} Задача: ${d.title}. Верный порядок: ${d.steps.join(' → ')}.`,
})
export { order_ as order }
