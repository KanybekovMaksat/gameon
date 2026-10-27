import { Fragment, useState } from 'react'
import { highlight } from './code'
import { defineKind, stateOf, Task, type ExProps } from './kit'
import './exercises.css'

// In `code`, `__` marks a blank. `answer[i]` is the right token for blank i, or a list of tokens that are all right.
// `bank` holds the tokens to choose from; each token goes into one blank at a time.
export type GapData = { text?: string; code: string; bank: string[]; answer: (string | string[])[] }

const accepts = (a: string | string[], token: string) => (Array.isArray(a) ? a.includes(token) : a === token)

function Gap({ data, checked, onAnswer }: ExProps<GapData>) {
  const n = data.answer.length
  const [fill, setFill] = useState<(number | null)[]>(() => Array(n).fill(null))
  const [focus, setFocus] = useState(0)
  const okAt = (i: number) => fill[i] !== null && accepts(data.answer[i], data.bank[fill[i] as number])
  const complete = fill.every((b) => b !== null)
  const correct = complete && fill.every((_, i) => okAt(i))
  // After a wrong check only the first wrong blank is marked, so the rest is not a guessing game.
  const firstWrong = fill.findIndex((_, i) => !okAt(i))
  const markOf = (i: number) => (!checked ? '' : correct ? ' is-ok' : i === firstWrong ? ' is-bad' : '')

  const update = (next: (number | null)[], nextFocus: number) => {
    setFill(next)
    setFocus(nextFocus)
    const done = next.every((b) => b !== null)
    onAnswer({
      correct: done ? next.every((b, i) => accepts(data.answer[i], data.bank[b as number])) : null,
      text: done ? next.map((b, i) => `пропуск ${i + 1}: «${data.bank[b as number]}»`).join(', ') : undefined,
    })
  }

  // A tap on a blank focuses it; a second tap on a focused filled blank takes the token back.
  const tapBlank = (i: number) => {
    if (checked) return
    if (focus === i && fill[i] !== null) {
      const next = [...fill]
      next[i] = null
      update(next, i)
    } else setFocus(i)
  }

  // A token goes into the focused blank, then the focus moves to the next empty blank.
  const tapToken = (b: number) => {
    if (checked || fill.includes(b)) return
    const next = [...fill]
    next[focus] = b
    const after = next.findIndex((x, i) => x === null && i > focus)
    const first = next.findIndex((x) => x === null)
    update(next, after >= 0 ? after : first >= 0 ? first : focus)
  }

  let k = 0
  const blank = () => {
    const i = k++
    const b = fill[i]
    const cls = 'gap-blank'
      + (b === null ? ' is-empty' : '')
      + (!checked && focus === i ? ' is-focus' : '')
      + markOf(i)
    return (
      <button key={`b${i}`} className={cls} onClick={() => tapBlank(i)} aria-label={b === null ? `Пропуск ${i + 1}, пустой` : `Пропуск ${i + 1}: ${data.bank[b]}`}>
        {b === null ? null : highlight(data.bank[b])}
      </button>
    )
  }

  return (
    <Task
      state={stateOf(checked, complete, correct)}
      label={gap.label}
      text={data.text ?? 'Нажми на пропуск, а потом на подходящий ответ.'}
    >
      <div className="gap">
        <pre className="code gap-code">
          {data.code.split('\n').map((line, li) => {
            const parts = line.split('__')
            return (
              <div key={li} className={'code-row' + (parts.length > 1 ? ' has-blank' : '')}>
                <span>{parts.map((p, pi) => <Fragment key={pi}>{highlight(p)}{pi < parts.length - 1 && blank()}</Fragment>)}</span>
              </div>
            )
          })}
        </pre>
        <div className="gap-bank" aria-label="Варианты">
          {data.bank.map((t, b) => (
            <button key={b} className={'chip gap-token' + (fill.includes(b) ? ' is-taken' : '')} disabled={fill.includes(b)} onClick={() => tapToken(b)}>
              <code>{t}</code>
            </button>
          ))}
        </div>
      </div>
    </Task>
  )
}

export const gap = defineKind<GapData>({
  kind: 'gap',
  label: 'Заполни пропуск',
  Component: Gap,
  describe: (d) => {
    let i = 0
    const code = d.code.replace(/__/g, () => `[пропуск ${++i}]`)
    const right = d.answer.map((a, j) => `пропуск ${j + 1}: ${Array.isArray(a) ? a.join(' или ') : a}`).join('; ')
    return `${d.text ?? 'Заполни пропуски в коде.'}\nКод:\n${code}\nВарианты: ${d.bank.join(', ')}.\nВерно: ${right}.`
  },
})
