import { useState } from 'react'
import { highlight } from '../../exercises/code'
import { inline } from '../../session/text'
import { StepBar } from './parts'

// One step: the line that runs (1-based), the variables it sets, what it prints, a short note.
export type CodeStep = { line: number; set?: Record<string, number | string>; out?: string; note?: string }

// Code that runs one line per tap. Variables are labeled boxes; `screen` shows what the program prints.
// `intro` is the note before the first step. A step without a note keeps the note of the step before it.
export function CodeStepper({ code, vars = [], steps, screen, intro }: { code: string; vars?: string[]; steps: CodeStep[]; screen?: boolean; intro: string }) {
  const [k, setK] = useState(0)
  const cur = k > 0 ? steps[k - 1] : null
  const state: Record<string, number | string> = {}
  const out: string[] = []
  for (const s of steps.slice(0, k)) {
    Object.assign(state, s.set)
    if (s.out !== undefined) out.push(s.out)
  }
  const changed = cur?.set ? Object.keys(cur.set) : []
  const note = steps.slice(0, k).reverse().find((s) => s.note)?.note ?? intro

  return (
    <div className="vis">
      <pre className="code vis-code">
        {code.split('\n').map((l, i) => (
          <div key={i} className={'code-row' + (cur?.line === i + 1 ? ' is-cur' : '')}>
            <i>{i + 1}</i>
            <span>{highlight(l)}</span>
          </div>
        ))}
      </pre>
      <div className="vis-state">
        {vars.length > 0 && (
          <div className="vis-boxes">
            {vars.map((v) => {
              const has = v in state
              const hot = changed.includes(v)
              return (
                <div key={v} className={'vis-box' + (hot ? ' is-hot' : '') + (has ? '' : ' is-empty')}>
                  <code className="vis-box-name">{v}</code>
                  <b key={hot ? `${v}-${k}` : v} className={'vis-box-val' + (hot ? ' is-new' : '')}>{has ? state[v] : ''}</b>
                </div>
              )
            })}
          </div>
        )}
        {screen && (
          <div className="vis-screen" aria-label="Экран">
            <small>Экран</small>
            {out.length ? out.map((o, i) => <div key={i} className="vis-out">{o}</div>) : <div className="vis-out is-empty">пока пусто</div>}
          </div>
        )}
      </div>
      <p className="vis-note" aria-live="polite" key={note}>{inline(note)}</p>
      <StepBar k={k} total={steps.length} onNext={() => setK(Math.min(steps.length, k + 1))} onReset={() => setK(0)} />
    </div>
  )
}
