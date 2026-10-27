import { useState } from 'react'
import { highlight } from './code'
import { defineKind, mark, stateOf, Task, type ExProps } from './kit'

export type BugData = { text: string; code: string; answer: number }

function Bug({ data, checked, onAnswer }: ExProps<BugData>) {
  const [pick, setPick] = useState<number | null>(null)
  const lines = data.code.split('\n')
  return (
    <Task state={stateOf(checked, pick !== null, pick === data.answer)} label={bug.label} text={data.text}>
      <div className="code">
        {lines.map((l, i) => (
          <button
            key={i}
            className={'code-line' + mark(checked, pick === i, i === data.answer)}
            onClick={() => {
              if (checked) return
              setPick(i)
              onAnswer({ correct: i === data.answer, text: `выбрал строку ${i + 1}: ${l.trim()}` })
            }}
          >
            <i>{i + 1}</i><span style={{ whiteSpace: 'pre' }}>{highlight(l)}</span>
          </button>
        ))}
      </div>
    </Task>
  )
}

export const bug = defineKind<BugData>({
  kind: 'bug',
  label: 'Найди ошибку',
  Component: Bug,
  describe: (d) => `${d.text}\nКод:\n${d.code.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')}\nОшибка в строке ${d.answer + 1}.`,
})
