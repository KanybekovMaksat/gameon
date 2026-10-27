import { useState } from 'react'
import { highlight } from '../../exercises/code'

// if and else: change x and see which of the two branches runs. Exactly one of them always runs.
export function IfElse() {
  const [x, setX] = useState(7)
  const yes = x > 5
  const code = [`x = ${x}`, 'if x > 5:', '  print("Много")', 'else:', '  print("Мало")']
  const skip = yes ? [3, 4] : [2]

  return (
    <div className="vis">
      <div className="vis-ifelse-top">
        <span className="vis-num-label"><code>x</code> =</span>
        <div className="vis-num">
          <button aria-label="Уменьшить x" disabled={x <= 0} onClick={() => setX(x - 1)}>−</button>
          <b key={x}>{x}</b>
          <button aria-label="Увеличить x" disabled={x >= 10} onClick={() => setX(x + 1)}>+</button>
        </div>
        <span className={'vis-cond' + (yes ? ' is-yes' : '')} key={String(yes)}>
          <code>{x} &gt; 5</code>{yes ? 'да' : 'нет'}
        </span>
      </div>
      <pre className="code vis-code">
        {code.map((l, i) => (
          <div key={i} className={'code-row' + (skip.includes(i) ? ' is-skip' : '') + ((yes && i === 2) || (!yes && i === 4) ? ' is-cur' : '')}>
            <i>{i + 1}</i><span>{highlight(l)}</span>
          </div>
        ))}
      </pre>
      <div className="vis-screen">
        <small>Экран</small>
        <div className="vis-out" key={String(yes)}>{yes ? 'Много' : 'Мало'}</div>
      </div>
    </div>
  )
}
