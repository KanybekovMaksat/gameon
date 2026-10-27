import { useMemo, useState } from 'react'
import { Icon } from '../../components'
import { highlight } from '../../exercises/code'
import '../../exercises/exercises.css'
import { CMD_CODE, CMD_WORD, parseMap, parseProgram, simulate, type Repeat } from '../../exercises/robot'
import { Board, CmdIcon, type Mark } from '../../exercises/robot-view'
import { StepBar, Switch } from './parts'

type Variant = { label: string; program: string }
type Line = { id: number; text: string; rep?: Repeat }

// The robot runs a program one command per tap. `list` shows the commands in words, `code` shows the program as code.
// With `variants`, a switch above compares two programs on the same board.
export function RobotRun({ map, program = '', view, variants, side, cell = 44 }: {
  map: string[]; program?: string; view: 'list' | 'code'; variants?: Variant[]; side?: boolean; cell?: number
}) {
  const [v, setV] = useState(0)
  const [k, setK] = useState(0)
  const src = variants ? variants[v].program : program
  const lv = useMemo(() => parseMap(map), [map])
  const prog = useMemo(() => parseProgram(src), [src])
  const run = useMemo(() => simulate(lv, prog), [lv, prog])
  const total = run.frames.length - 1
  const f = run.frames[k]
  const marks = new Map<string, Mark>()
  for (let i = 0; i <= k; i++) marks.set(`${run.frames[i].x},${run.frames[i].y}`, 'trail')
  const win = k === total && run.outcome === 'goal'

  const lines: Line[] = prog.flatMap((it): Line[] => it.t === 'rep'
    ? [{ id: it.id, text: `repeat ${it.n}:`, rep: it }, ...it.body.map((c) => ({ id: c.id, text: `  ${CMD_CODE[c.t]}` }))]
    : [{ id: it.id, text: CMD_CODE[it.t] }])
  const runIndex = k > 0 ? prog.findIndex((it) => it.id === f.at) : -1

  return (
    <div className="vis">
      {variants && (
        <Switch value={String(v)} options={variants.map((x, i) => [String(i), x.label])} onChange={(x) => { setV(Number(x)); setK(0) }} />
      )}
      <div className={'vis-robot' + (side || view === 'list' ? ' is-side' : '')}>
        <Board lv={lv} frame={f} marks={marks} win={win} cell={cell} />
        {view === 'list' ? (
          <ol className="vis-cmds">
            {prog.map((it, i) => it.t !== 'rep' && (
              <li key={it.id} className={i === runIndex ? 'is-cur' : i < runIndex ? 'is-done' : ''}>
                <b>{i + 1}</b><CmdIcon t={it.t} size={18} /><span>{CMD_WORD[it.t]}</span>
              </li>
            ))}
          </ol>
        ) : (
          <pre className="code vis-code">
            {lines.map((l) => (
              <div key={l.id} className={'code-row' + (k > 0 && f.at === l.id ? ' is-cur' : '') + (k > 0 && l.rep && f.rep === l.id ? ' is-loop' : '')}>
                <span>{highlight(l.text)}</span>
                {l.rep && k > 0 && f.rep === l.id && <span className="vis-iter" key={f.iter}>{f.iter} из {l.rep.n}</span>}
              </div>
            ))}
          </pre>
        )}
      </div>
      <StepBar
        k={k}
        total={total}
        onNext={() => setK(Math.min(total, k + 1))}
        onReset={() => setK(0)}
        result={win ? <><Icon name="check" size={16} />Робот на флажке</> : 'Программа выполнена'}
      />
    </div>
  )
}
