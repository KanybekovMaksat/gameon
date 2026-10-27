import { useState } from 'react'
import { Code } from './code'
import { defineKind, mark, stateOf, Task, type ExProps } from './kit'

export type PredictData = { text?: string; code: string; options: string[]; answer: number }

function Predict({ data, checked, onAnswer }: ExProps<PredictData>) {
  const [pick, setPick] = useState<number | null>(null)
  return (
    <Task
      state={stateOf(checked, pick !== null, pick === data.answer)}
      label={predict.label}
      text={data.text ?? 'Что напечатает программа?'}
      after={
        <div className="options">
          {data.options.map((o, i) => (
            <button
              key={o}
              className={'option' + mark(checked, pick === i, i === data.answer)}
              onClick={() => {
                if (checked) return
                setPick(i)
                onAnswer({ correct: i === data.answer, text: `выбрал вариант «${o}»` })
              }}
            >
              <span className="key">{i + 1}</span>
              <code>{o}</code>
            </button>
          ))}
        </div>
      }
    >
      <Code code={data.code} />
    </Task>
  )
}

export const predict = defineKind<PredictData>({
  kind: 'predict',
  label: 'Предскажи вывод',
  Component: Predict,
  describe: (d) => `${d.text ?? 'Что напечатает программа?'}\nКод:\n${d.code}\nВарианты: ${d.options.join(', ')}. Верный ответ: ${d.options[d.answer]}.`,
})
