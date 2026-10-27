import { useState } from 'react'
import './digital-visuals.css'

const START = [6, 3, 8, 2, 5]
const GAP = 8

// Bubble sort one comparison per tap: the blue pair is compared next, green bars are already in place.
export function BubbleBars() {
  const n = START.length
  const [order, setOrder] = useState(() => START.map((_, i) => i))
  const [pass, setPass] = useState(0)
  const [k, setK] = useState(0)
  const [count, setCount] = useState(0)
  const [note, setNote] = useState('Нажми «Шаг», чтобы сравнить первую пару')
  const done = pass >= n - 1
  const values = order.map((id) => START[id])

  const step = () => {
    if (done) {
      setOrder(START.map((_, i) => i)); setPass(0); setK(0); setCount(0)
      setNote('Нажми «Шаг», чтобы сравнить первую пару')
      return
    }
    const [a, b] = [values[k], values[k + 1]]
    const next = [...order]
    if (a > b) {
      ;[next[k], next[k + 1]] = [next[k + 1], next[k]]
      setOrder(next)
    }
    setCount(count + 1)
    let nk = k + 1
    let np = pass
    let msg = a > b ? `${a} больше ${b}, меняем местами` : `${a} меньше ${b}, оставляем`
    if (nk >= n - 1 - pass) {
      np = pass + 1
      nk = 0
      msg += np >= n - 1 ? '. Готово, всё по порядку' : `. Число ${START[next[n - 1 - pass]]} встало на своё место`
    }
    setK(nk); setPass(np); setNote(msg)
  }

  const width = `calc((100% - ${(n - 1) * GAP}px) / ${n})`
  return (
    <div className="dv">
      <div className="dv-bars-head">
        <span>{done ? 'Отсортировано' : `Проход ${pass + 1}`}</span>
        <span>Сравнений: {count}</span>
      </div>
      <div className="dv-bars">
        {order.map((id, pos) => {
          const placed = done || pos >= n - pass
          const cls = placed ? ' is-placed' : !done && (pos === k || pos === k + 1) ? ' is-pair' : ''
          return (
            <div key={id} className={'dv-bar' + cls} style={{ width, transform: `translateX(calc(${pos} * (100% + ${GAP}px)))` }}>
              <span style={{ height: `${24 + (START[id] / 8) * 92}px` }}>{START[id]}</span>
            </div>
          )
        })}
      </div>
      <p className="dv-note" aria-live="polite">{note}</p>
      <button className="btn btn-secondary btn-sm dv-step" onClick={step}>{done ? 'Сначала' : 'Шаг'}</button>
    </div>
  )
}
