import { useMemo, useState } from 'react'
import { highlight } from './code'
import { defineKind, stateOf, Task, type ExProps } from './kit'
import './exercises.css'

// One step of the program: the state after `line` (1-based) ran. On screen a step is a column. `values` follow `vars`; null means the variable
// does not exist yet. `ask` lists the columns the child fills; by default every value in the row. `ask: []` shows the row.
export type TraceRow = { label: string; line: number; values: (number | null)[]; ask?: number[] }
export type TraceData = { text?: string; code: string; vars: string[]; rows: TraceRow[]; options: number[] }

function Trace({ data, checked, onAnswer }: ExProps<TraceData>) {
  // The cells to fill, in reading order: [row, column].
  const cells = useMemo(
    () => data.rows.flatMap((r, ri) => (r.ask ?? r.values.flatMap((v, vi) => (v === null ? [] : [vi]))).map((vi) => [ri, vi] as const)),
    [data.rows],
  )
  const [vals, setVals] = useState<(number | null)[]>(() => cells.map(() => null))
  const [focus, setFocus] = useState(0)
  const right = (c: number) => data.rows[cells[c][0]].values[cells[c][1]]
  const complete = vals.every((v) => v !== null)
  const correct = complete && vals.every((v, c) => v === right(c))
  // After a wrong check only the first wrong cell is marked; a right table turns green.
  const firstWrong = vals.findIndex((v, c) => v !== right(c))
  const markOf = (c: number) => (!checked ? '' : correct ? ' is-ok' : c === firstWrong ? ' is-bad' : '')
  const cellAt = (ri: number, vi: number) => cells.findIndex(([r, v]) => r === ri && v === vi)
  const curRow = checked ? null : cells[focus]?.[0] ?? null
  const curLine = curRow === null ? null : data.rows[curRow].line

  const pick = (n: number) => {
    if (checked) return
    const next = [...vals]
    next[focus] = n
    const after = next.findIndex((v, c) => v === null && c > focus)
    const first = next.findIndex((v) => v === null)
    setVals(next)
    setFocus(after >= 0 ? after : first >= 0 ? first : focus)
    const done = next.every((v) => v !== null)
    onAnswer({
      correct: done ? next.every((v, c) => v === right(c)) : null,
      text: done ? `заполнил таблицу: ${cells.map(([ri, vi], c) => `${data.rows[ri].label}: ${data.vars[vi]} = ${next[c]}`).join('; ')}` : undefined,
    })
  }

  return (
    <Task
      state={stateOf(checked, complete, correct)}
      label={trace.label}
      text={data.text ?? 'Пройди программу строка за строкой. Какое значение у переменной после каждого шага?'}
      after={!checked && (
        <div className="trace-nums" aria-label="Числа">
          {data.options.map((n) => (
            <button key={n} className="trace-num" onClick={() => pick(n)}>{n}</button>
          ))}
        </div>
      )}
    >
      <div className="trace">
        <pre className="code trace-code">
          {data.code.split('\n').map((l, i) => (
            <div key={i} className={'code-row' + (curLine === i + 1 ? ' is-cur' : '')}>
              <i>{i + 1}</i>
              <span>{highlight(l)}{'\n'}</span>
            </div>
          ))}
        </pre>
        <table className="trace-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Переменная</span></th>
              {data.rows.map((r, ri) => {
                const [, word, num] = r.label.match(/^(.*?)\s*(\d*)$/) ?? ['', r.label, '']
                return (
                  <th key={ri} scope="col" className={ri === curRow ? 'is-cur' : ''} aria-label={r.label}>
                    <small>{word.toLowerCase()}</small><b>{num || '\u00a0'}</b>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {data.vars.map((name, vi) => (
              <tr key={name}>
                <th scope="row"><code>{name}</code></th>
                {data.rows.map((r, ri) => {
                  const v = r.values[vi]
                  const c = cellAt(ri, vi)
                  const cur = ri === curRow ? ' is-cur' : ''
                  if (c < 0) return <td key={ri} className={cur}><span className={'trace-given' + (v === null ? ' is-none' : '')}>{v ?? 'нет'}</span></td>
                  const val = vals[c]
                  const cls = 'trace-cell'
                    + (val === null ? ' is-empty' : '')
                    + (!checked && c === focus ? ' is-focus' : '')
                    + markOf(c)
                  return (
                    <td key={ri} className={cur}>
                      <button className={cls} onClick={() => !checked && setFocus(c)} aria-label={`${r.label}, ${name}: ${val ?? 'пусто'}`}>
                        {val ?? ''}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Task>
  )
}

export const trace = defineKind<TraceData>({
  kind: 'trace',
  label: 'Побудь компьютером',
  Component: Trace,
  describe: (d) => [
    d.text ?? 'Пройди программу и запиши значения переменных после каждого шага.',
    'Код:',
    ...d.code.split('\n').map((l, i) => `${i + 1}: ${l}`),
    `Таблица значений (${d.vars.join(', ')}). Верные значения:`,
    ...d.rows.map((r) => `${r.label}, после строки ${r.line}: ${d.vars.map((v, i) => `${v} = ${r.values[i] ?? 'ещё нет'}`).join(', ')}`),
    `Числа на выбор: ${d.options.join(', ')}.`,
  ].join('\n'),
})
