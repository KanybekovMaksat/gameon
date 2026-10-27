import { useMemo, useState } from 'react'
import { Icon } from '../components'
import { highlight } from './code'
import { defineKind, stateOf, Task, type ExProps } from './kit'
import './exercises.css'

// `lines` is the right program; two leading spaces are one indent level, and the indent is part of the block.
// `distractors` are blocks that do not belong. The bank order is a fixed shuffle of both, the same on every visit.
export type BlocksData = { text?: string; lines: string[]; distractors: string[] }

const level = (s: string) => Math.floor((s.length - s.trimStart().length) / 2)

// A small seeded shuffle, so the bank looks mixed but never changes between renders or visits.
function shuffled(n: number, keep: number, key: string) {
  let h = 2166136261
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const idx = [...Array(n).keys()]
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    const j = h % (i + 1)
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  // The right program must not stand in order at the start of the bank.
  while (n > 1 && idx.slice(0, Math.min(keep, 3)).every((v, i) => v === i)) idx.push(idx.shift() as number)
  return idx
}

function Blocks({ data, checked, onAnswer }: ExProps<BlocksData>) {
  const pool = useMemo(() => [...data.lines, ...data.distractors], [data.lines, data.distractors])
  const order = useMemo(() => shuffled(pool.length, data.lines.length, pool.join('\n')), [pool, data.lines.length])
  const [placed, setPlaced] = useState<number[]>([])
  const n = data.lines.length
  const complete = placed.length >= n
  const lineOk = (i: number) => pool[placed[i]] === data.lines[i]
  const correct = placed.length === n && placed.every((_, i) => lineOk(i))
  // After a wrong check only the first wrong line is marked; a right program turns green.
  const firstWrong = placed.findIndex((_, i) => !lineOk(i))
  const markOf = (i: number) => (!checked ? '' : correct ? ' is-ok' : i === firstWrong ? ' is-bad' : '')

  const update = (next: number[]) => {
    setPlaced(next)
    const done = next.length >= n
    onAnswer({
      correct: done ? next.length === n && next.every((b, i) => pool[b] === data.lines[i]) : null,
      text: done ? `собрал программу:\n${next.map((b) => pool[b]).join('\n')}` : undefined,
    })
  }

  return (
    <Task
      state={stateOf(checked, complete, correct)}
      label={blocks.label}
      text={data.text ?? 'Нажимай на блоки по порядку. Отступ входит в блок. Один блок лишний.'}
    >
      <div className="blocks">
        <div className="code blocks-prog">
          {placed.map((b, i) => (
            <button
              key={b}
              className={'code-line blocks-line' + markOf(i)}
              onClick={() => !checked && update(placed.filter((x) => x !== b))}
              aria-label={`Строка ${i + 1}: ${pool[b].trim()}. Нажми, чтобы убрать`}
            >
              <i>{i + 1}</i>
              <span className="blocks-text" style={{ ['--lvl' as string]: level(pool[b]) }}>{highlight(pool[b].trimStart())}</span>
            </button>
          ))}
          {placed.length === 0 && (
            <div className="blocks-slot" aria-hidden>
              <i>1</i>
              <span>Нажми на первый блок</span>
            </div>
          )}
        </div>
        <div className="blocks-bank" aria-label="Блоки">
          {/* A placed block leaves the bank, so the bank gets shorter as the program grows. */}
          {order.filter((b) => !placed.includes(b)).map((b) => {
            const lvl = level(pool[b])
            return (
              <button
                key={b}
                className="blocks-chip"
                onClick={() => !checked && update([...placed, b])}
                aria-label={`${lvl ? `С отступом ${lvl}: ` : ''}${pool[b].trim()}`}
              >
                <code style={{ ['--lvl' as string]: lvl }}>{pool[b].trimStart()}</code>
              </button>
            )
          })}
          {!checked && placed.length > 0 && (
            <button className="start-over blocks-again" onClick={() => update([])}><Icon name="redo" size={16} />Заново</button>
          )}
        </div>
      </div>
    </Task>
  )
}

export const blocks = defineKind<BlocksData>({
  kind: 'blocks',
  label: 'Собери программу',
  Component: Blocks,
  describe: (d) => [
    d.text ?? 'Собери программу из блоков.',
    'Верная программа (два пробела в начале означают отступ, он входит в блок):',
    ...d.lines,
    `Лишние блоки: ${d.distractors.map((x) => `«${x}»`).join(', ')}.`,
  ].join('\n'),
})
