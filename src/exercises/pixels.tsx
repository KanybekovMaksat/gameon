import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Icon } from '../components'
import './digital.css'
import { defineKind, mark, stateOf, Task, type ExProps } from './kit'

// `picture` is rows of bits: 1 is a filled pixel, 0 is empty. `name` says what it shows, for the helper.
// paint: the child fills the rows in `paint` (all rows when it is not set); the other rows are drawn.
// The answer is complete when every row to paint has a filled cell, so each of those rows needs a 1.
// Cells stay 44 px: a picture to paint has at most 5 columns, so it fits a 360 px phone.
// read: the picture is drawn; the child picks the bits of row `row` from `options`.
type Base = { text: string; name: string; picture: string[] }
export type PixelsData = (Base & { mode: 'paint'; paint?: number[] }) | (Base & { mode: 'read'; row: number; options: string[]; answer: number })

const toGrid = (picture: string[]) => picture.map((r) => [...r].map((b) => b === '1'))
const bitsOf = (row: boolean[]) => row.map((v) => (v ? '1' : '0')).join('')

function Paint({ data, checked, onAnswer }: ExProps<Base & { mode: 'paint'; paint?: number[] }>) {
  const target = toGrid(data.picture)
  const rows = data.paint ?? data.picture.map((_, i) => i)
  const [cells, setCells] = useState(() => target.map((r, i) => (rows.includes(i) ? r.map(() => false) : r)))
  const live = useRef(cells)
  const drag = useRef<boolean | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    const stop = () => { drag.current = null }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop) }
  }, [])

  const matches = (g: boolean[][]) => rows.every((r) => g[r].every((v, c) => v === target[r][c]))
  const complete = (g: boolean[][]) => rows.every((r) => g[r].some(Boolean))
  const correct = matches(cells)
  const answered = complete(cells)

  const set = (r: number, c: number, v: boolean) => {
    if (checked || !rows.includes(r) || live.current[r][c] === v) return
    const next = live.current.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row))
    live.current = next
    setCells(next)
    setTouched(true)
    onAnswer(complete(next)
      ? { correct: matches(next), text: `закрасил строки так: ${rows.map((i) => bitsOf(next[i])).join(' / ')}` }
      : { correct: null })
  }

  const down = (e: PointerEvent, r: number, c: number) => {
    if (checked || !rows.includes(r)) return
    e.preventDefault()
    drag.current = !live.current[r][c]
    set(r, c, drag.current)
  }
  const move = (e: PointerEvent) => {
    if (drag.current === null) return
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-cell]')
    if (!el) return
    set(Number(el.dataset.r), Number(el.dataset.c), drag.current)
  }

  const restart = () => {
    const empty = target.map((r, i) => (rows.includes(i) ? r.map(() => false) : r))
    live.current = empty
    setCells(empty)
    setTouched(false)
    onAnswer({ correct: null })
  }

  const cols = target[0].length
  return (
    <Task
      state={stateOf(checked, answered, correct)}
      label={pixels.label}
      text={data.text}
      after={!checked && touched && <button className="start-over dg-start-over" onClick={restart}><Icon name="redo" size={16} />Начать заново</button>}
    >
      <div className="px-scroll">
      <div
        className={'px-grid is-paint' + (checked && correct ? ' is-done' : '')}
        style={{ '--cols': cols } as CSSProperties}
        onPointerMove={move}
      >
        {cells.map((row, r) => {
          const mine = rows.includes(r)
          return [
            <code key={`b${r}`} className={'px-bits' + (mine ? ' is-mine' + (checked && correct ? ' is-ok' : '') : '')} style={{ gridRow: r + 1 }}>{data.picture[r]}</code>,
            ...row.map((v, c) => {
              let cls = 'px-cell' + (mine && !checked ? ' is-edit' : '')
              if (v) cls += mine ? ' is-mine' : ' is-on'
              // Marks only after a right check: after a wrong one they would show which cells to change.
              if (checked && correct && mine && v) cls += ' is-ok'
              return (
                <button
                  key={`${r}-${c}`}
                  className={cls}
                  data-cell
                  data-r={r}
                  data-c={c}
                  style={{ gridRow: r + 1, gridColumn: c + 2, '--d': `${(r + c) * 22}ms` } as CSSProperties}
                  disabled={!mine || checked}
                  aria-label={`Строка ${r + 1}, клетка ${c + 1}: ${v ? 'закрашена' : 'пустая'}`}
                  aria-pressed={v}
                  onPointerDown={(e) => down(e, r, c)}
                  // A click from the keyboard has no pointer events: Enter and Space toggle the cell.
                  onClick={(e) => { if (e.detail === 0) set(r, c, !v) }}
                />
              )
            }),
          ]
        })}
      </div>
      </div>
      {!checked && !touched && <p className="dg-note">Нажимай на клетки. Можно вести пальцем</p>}
      {!checked && touched && !answered && <p className="dg-note">Закрась клетки в каждой строке, потом нажми «Проверить»</p>}
    </Task>
  )
}

function Read({ data, checked, onAnswer }: ExProps<Base & { mode: 'read'; row: number; options: string[]; answer: number }>) {
  const [pick, setPick] = useState<number | null>(null)
  const cells = toGrid(data.picture)
  const cols = cells[0].length
  const correct = pick === data.answer
  // A wrong check shows only the card state: marking the option or the bits would leave one option to try.
  const done = checked && correct
  const rowMark = done ? ' is-ok' : pick !== null ? ' is-picked' : ''
  return (
    <Task
      state={stateOf(checked, pick !== null, correct)}
      label={pixels.label}
      text={data.text}
      after={
        <div className="options px-opts">
          {data.options.map((o, i) => (
            <button
              key={o}
              className={'option' + mark(done, pick === i, true)}
              aria-pressed={pick === i}
              onClick={() => {
                if (checked) return
                setPick(i)
                onAnswer({ correct: i === data.answer, text: `выбрал биты ${o} для строки ${data.row + 1}` })
              }}
            >
              <span className="key">{i + 1}</span>
              <code>{o}</code>
            </button>
          ))}
        </div>
      }
    >
      <div className="px-grid is-read" style={{ '--cols': cols, '--cell': '28px' } as CSSProperties}>
        <div className={'px-rowmark' + rowMark} style={{ gridRow: data.row + 1 }} aria-hidden />
        {cells.map((row, r) => row.map((v, c) => {
          // The picked bits are written on the cells of the row, so the child sees each bit over its pixel.
          const bit = r === data.row && pick !== null ? data.options[pick][c] : null
          return (
            <span key={`${r}-${c}`} className={'px-cell' + (v ? ' is-on' : '')} style={{ gridRow: r + 1, gridColumn: c + 1 }}>
              {bit !== null && <b key={pick}>{bit}</b>}
            </span>
          )
        }))}
      </div>
    </Task>
  )
}

function Pixels(props: ExProps<PixelsData>) {
  const { data } = props
  return data.mode === 'paint' ? <Paint {...props} data={data} /> : <Read {...props} data={data} />
}

function describe(d: PixelsData) {
  const pic = d.picture.map((r, i) => `${i + 1}: ${r}`).join('; ')
  if (d.mode === 'read') {
    return `${d.text}\nКартинка «${d.name}», строки битов: ${pic}. Нужно выбрать биты строки ${d.row + 1}. Варианты: ${d.options.join(', ')}. Верный ответ: ${d.options[d.answer]}.`
  }
  const rows = d.paint ?? d.picture.map((_, i) => i)
  return `${d.text}\nКартинка «${d.name}», строки битов: ${pic}. 1 значит клетка закрашена, 0 пустая. ${d.paint ? `Ребёнок закрашивает строки ${rows.map((r) => r + 1).join(', ')}, остальные уже нарисованы.` : 'Ребёнок закрашивает всю картинку.'} Верно, когда закрашены ровно клетки с единицами.`
}

export const pixels = defineKind<PixelsData>({
  kind: 'pixels',
  label: 'Пиксели из битов',
  Component: Pixels,
  describe,
})
