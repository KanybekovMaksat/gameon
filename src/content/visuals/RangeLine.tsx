import { useState } from 'react'
import { plural } from '../../exercises/robot'
import { Switch } from './parts'

const RANGES: Record<string, [number, number]> = { 'range(4)': [0, 4], 'range(1, 4)': [1, 4], 'range(3, 6)': [3, 6] }
const LINE = [0, 1, 2, 3, 4, 5, 6]

// What numbers range gives: from the start up to the stop, and the stop itself is not included.
export function RangeLine() {
  const [r, setR] = useState('range(4)')
  const [a, b] = RANGES[r]
  const got = LINE.filter((n) => n >= a && n < b)

  return (
    <div className="vis">
      <Switch value={r} options={Object.keys(RANGES).map((k) => [k, k])} onChange={setR} />
      <div className="vis-line" key={r}>
        {LINE.map((n) => {
          const inside = n >= a && n < b
          return (
            <div key={n} className={'vis-dot' + (inside ? ' is-in' : '') + (n === b ? ' is-stop' : '')} style={{ animationDelay: `${(n - a) * 60}ms` }}>
              <b>{n}</b>
              {n === b && <small>стоп</small>}
            </div>
          )
        })}
      </div>
      <p className="vis-note">
        <code className="inline-code">i</code> будет {got.join(', ')}. Цикл повторится {got.length} {plural(got.length, 'раз', 'раза', 'раз')}.
      </p>
    </div>
  )
}
