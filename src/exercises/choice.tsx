import { useState } from 'react'
import { defineKind, mark, stateOf, Task, type ExProps } from './kit'
import './exercises.css'

// A question with one right option, for any subject. `card` is what the question is about, shown large:
// an example «3/4 + 1/8», a sentence, a word. Without `card` the options follow the question at once.
export type ChoiceData = { text: string; card?: string; options: string[]; answer: number }

function Choice({ data, checked, onAnswer }: ExProps<ChoiceData>) {
  const [pick, setPick] = useState<number | null>(null)
  const options = (
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
          {o}
        </button>
      ))}
    </div>
  )
  const state = stateOf(checked, pick !== null, pick === data.answer)
  if (!data.card) {
    return <div className="ex task" data-state={state}><div className="ex-kind">{choice.label}</div><p className="ex-text">{data.text}</p>{options}</div>
  }
  return (
    <Task state={state} label={choice.label} text={data.text} after={options}>
      <p className="choice-card">{data.card}</p>
    </Task>
  )
}

export const choice = defineKind<ChoiceData>({
  kind: 'choice',
  label: 'Выбери ответ',
  Component: Choice,
  describe: (d) => `${d.text}${d.card ? `\n${d.card}` : ''}\nВарианты: ${d.options.join('; ')}. Верный ответ: ${d.options[d.answer]}.`,
})
