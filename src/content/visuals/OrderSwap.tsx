import { useState } from 'react'
import { Icon } from '../../components'

// The same two steps in two orders give two different results.
export function OrderSwap() {
  const [swapped, setSwapped] = useState(false)
  const steps = swapped ? ['Надеть ботинки', 'Надеть носки'] : ['Надеть носки', 'Надеть ботинки']

  return (
    <div className="vis">
      <div className="vis-order" key={String(swapped)}>
        {steps.map((s, i) => (
          <div key={s} className="vis-step" style={{ animationDelay: `${i * 80}ms` }}>
            <b>{i + 1}</b>{s}
          </div>
        ))}
      </div>
      <div className={'vis-result' + (swapped ? ' is-bad' : ' is-ok')} key={`r${swapped}`}>
        <Icon name={swapped ? 'x' : 'check'} size={18} />
        {swapped ? 'Носки не налезут поверх ботинок' : 'Готово, можно выходить'}
      </div>
      <button className="vis-next vis-wide" onClick={() => setSwapped(!swapped)}>
        <Icon name="redo" size={16} />Поменять шаги местами
      </button>
    </div>
  )
}
