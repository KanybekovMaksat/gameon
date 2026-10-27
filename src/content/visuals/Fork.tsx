import { useState } from 'react'
import { highlight } from '../../exercises/code'
import { Switch } from './parts'

// A condition as a fork in the road: the program goes one way or the other, then the ways meet again.
export function Fork() {
  const [rain, setRain] = useState<'yes' | 'no'>('yes')
  const yes = rain === 'yes'
  const code = [`rain = ${yes ? 'True' : 'False'}`, 'if rain:', '  print("Беру зонт")', 'print("Иду в школу")']
  const skipped = yes ? -1 : 2
  const on = (b: boolean) => (b ? 'is-on' : 'is-off')

  return (
    <div className="vis">
      <Switch value={rain} options={[['yes', 'Идёт дождь'], ['no', 'Дождя нет']]} onChange={setRain} />
      <svg className="vis-fork" viewBox="0 0 300 148" role="img" aria-label={yes ? 'Дождь идёт: программа берёт зонт, потом идёт в школу' : 'Дождя нет: программа сразу идёт в школу'}>
        <path key={`y${rain}`} className={'vis-road ' + on(yes)} pathLength={1} d="M88 28H48V66" />
        <path key={`y2${rain}`} className={'vis-road ' + on(yes)} pathLength={1} d="M48 98V128H86" />
        <path key={`n${rain}`} className={'vis-road ' + on(!yes)} pathLength={1} d="M212 28H262V128H214" />
        <text className="vis-fork-tag" x="66" y="20" textAnchor="middle">да</text>
        <text className="vis-fork-tag" x="238" y="20" textAnchor="middle">нет</text>

        <path className="vis-node is-on" d="M150 5L214 28L150 51L86 28Z" />
        <text className="vis-fork-text" x="150" y="32.5" textAnchor="middle">Идёт дождь?</text>

        <rect className={'vis-node ' + on(yes)} x="4" y="66" width="88" height="32" rx="10" />
        <text className={'vis-fork-text ' + on(yes)} x="48" y="86.5" textAnchor="middle">Беру зонт</text>

        <rect className="vis-node is-on" x="86" y="112" width="128" height="32" rx="10" />
        <text className="vis-fork-text" x="150" y="132.5" textAnchor="middle">Иду в школу</text>
      </svg>
      <pre className="code vis-code">
        {code.map((l, i) => (
          <div key={i} className={'code-row' + (i === skipped ? ' is-skip' : '')}>
            <i>{i + 1}</i><span>{highlight(l)}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}
