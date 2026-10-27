import { useState } from 'react'
import './digital.css'
import { defineKind, stateOf, Task, type ExProps } from './kit'

// A token is a number ('8', '0101') or a shape: 'shape-color' with an optional turn in degrees, 'arrow-blue@90'.
// Shapes: circle, square, triangle, diamond, arrow. Colors: navy, blue, cyan, outline (an empty shape).
// The child fills `answer.length` empty places after `items` from the tokens in `options`.
export type PatternData = { text?: string; items: string[]; answer: string[]; options: string[] }

type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'arrow'
type Color = 'navy' | 'blue' | 'cyan' | 'outline'

function parse(t: string) {
  const [body, turn] = t.split('@')
  const [shape, color] = body.split('-') as [Shape, Color]
  return { shape, color, turn: turn ? Number(turn) : 0, hasTurn: turn !== undefined }
}

const isNumber = (t: string) => /^\d+$/.test(t)
const TEXT = 'Что будет дальше? Нажми на подходящий вариант.'

const SHAPE_WORD: Record<Shape, [string, 'm' | 'f']> = {
  circle: ['круг', 'm'], square: ['квадрат', 'm'], triangle: ['треугольник', 'm'], diamond: ['ромб', 'm'], arrow: ['стрелка', 'f'],
}
const COLOR_WORD: Record<Color, [string, string]> = {
  navy: ['тёмный', 'тёмная'], blue: ['синий', 'синяя'], cyan: ['голубой', 'голубая'], outline: ['пустой', 'пустая'],
}
const TURN_WORD: Record<number, string> = { 0: 'вверх', 90: 'вправо', 180: 'вниз', 270: 'влево' }

// A token in words, for the child's answer and the helper: «синяя стрелка вправо».
function say(t: string) {
  if (isNumber(t)) return t
  const { shape, color, turn, hasTurn } = parse(t)
  const [noun, g] = SHAPE_WORD[shape]
  return `${COLOR_WORD[color][g === 'm' ? 0 : 1]} ${noun}${hasTurn ? ' ' + TURN_WORD[((turn % 360) + 360) % 360] : ''}`
}

export function Token({ t }: { t: string }) {
  if (isNumber(t)) return <span className={'pt-num' + (t.length > 3 ? ' is-long' : '')}>{t}</span>
  const { shape, color, turn } = parse(t)
  const body = {
    circle: <circle cx="20" cy="20" r="14" />,
    square: <rect x="7" y="7" width="26" height="26" rx="5" />,
    triangle: <path d="M20 6.5L34 32H6z" />,
    diamond: <path d="M20 4.5L35.5 20L20 35.5L4.5 20z" />,
    arrow: <path d="M20 5L33 18H24.5V35H15.5V18H7z" />,
  }[shape]
  return (
    <svg className={'pt-shape is-' + color} viewBox="0 0 40 40" aria-hidden>
      <g transform={turn ? `rotate(${turn} 20 20)` : undefined}>{body}</g>
    </svg>
  )
}

function Pattern({ data, checked, onAnswer }: ExProps<PatternData>) {
  const k = data.answer.length
  const [slots, setSlots] = useState<(string | null)[]>(() => Array(k).fill(null))
  const full = slots.every((s) => s !== null)
  const correct = full && slots.every((s, i) => s === data.answer[i])
  const next = slots.indexOf(null)

  const update = (s: (string | null)[]) => {
    setSlots(s)
    const done = s.every((x) => x !== null)
    onAnswer({
      correct: done ? s.every((x, i) => x === data.answer[i]) : null,
      text: done ? `поставил: ${s.map((x) => say(x!)).join(', ')}` : undefined,
    })
  }

  const put = (t: string) => {
    if (checked) return
    const s = [...slots]
    s[next === -1 ? k - 1 : next] = t
    update(s)
  }
  const clear = (i: number) => {
    if (checked || slots[i] === null) return
    const s = [...slots]
    s[i] = null
    update(s)
  }

  const numbers = data.items.every(isNumber)
  return (
    <Task
      state={stateOf(checked, full, correct)}
      label={pattern.label}
      text={data.text ?? TEXT}
      after={
        <div className="pt-bank">
          {data.options.map((t) => (
            <button key={t} className="pt-opt" onClick={() => put(t)} disabled={checked} aria-label={say(t)}>
              <Token t={t} />
            </button>
          ))}
        </div>
      }
    >
      <div className={'pt-seq' + (numbers ? ' is-numbers' : '')}>
        {data.items.map((t, i) => (
          <span key={i} className="pt-cell" aria-label={say(t)}><Token t={t} /></span>
        ))}
        {slots.map((s, i) => {
          let cls = 'pt-cell pt-slot'
          if (s === null) cls += i === next && !checked ? ' is-next' : ''
          // After a wrong check the places keep their look: marks would tell which place to change.
          else cls += checked && correct ? ' is-ok' : ' is-filled'
          return (
            <button key={`s${i}`} className={cls} onClick={() => clear(i)} disabled={checked || s === null} aria-label={s ? `${say(s)}, убрать` : 'Пустое место'}>
              {s ? <Token t={s} key={s} /> : <span className="pt-q">?</span>}
            </button>
          )
        })}
      </div>
      {!checked && slots.some((s) => s !== null) && <p className="dg-note">Нажми на ответ в ряду, чтобы убрать его</p>}
    </Task>
  )
}

function describe(d: PatternData) {
  return `${d.text ?? TEXT}\nРяд: ${d.items.map(say).join(', ')}, дальше ${d.answer.length} ${d.answer.length === 1 ? 'пустое место' : 'пустых места'}. Варианты: ${d.options.map(say).join(', ')}. Верный ответ: ${d.answer.map(say).join(', ')}.`
}

export const pattern = defineKind<PatternData>({
  kind: 'pattern',
  label: 'Продолжи закономерность',
  Component: Pattern,
  describe,
})
