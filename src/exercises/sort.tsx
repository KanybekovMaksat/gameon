import { useRef, useState } from 'react'
import { Icon } from '../components'
import './digital.css'
import { defineKind, stateOf, Task, type ExProps } from './kit'

// swap: sort by swapping neighbors, with at most `limit` swaps when it is set. The answer is complete when
// the list is in order or the swaps are spent; with `limit` equal to the fewest swaps, only the limit ends the task.
// pass: one pass of bubble sort, one pair at a time: the child swaps the pair or keeps it.
// look: bars with heights, cards with numbers, or cards with the numbers in binary.
export type SortData = {
  text: string
  items: number[]
  mode?: 'swap' | 'pass'
  limit?: number
  look?: 'bars' | 'cards' | 'binary'
}

type Step = { a: number; b: number; swap: boolean; ok: boolean }

const GAP = 8

// The fewest swaps of neighbors that sort the list: the number of pairs in the wrong order.
function inversions(xs: number[]) {
  let n = 0
  xs.forEach((x, i) => xs.slice(i + 1).forEach((y) => { if (x > y) n++ }))
  return n
}

const sortedOf = (xs: number[]) => [...xs].sort((a, b) => a - b)
const isSorted = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] <= x)

function hop(el: HTMLElement | null | undefined) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease-in-out' })
}

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4" />
    </svg>
  )
}

function Sort({ data, checked, onAnswer }: ExProps<SortData>) {
  const { items, limit } = data
  const mode = data.mode ?? 'swap'
  const look = data.look ?? 'bars'
  const n = items.length
  const [order, setOrder] = useState(() => items.map((_, i) => i))
  const [sel, setSel] = useState<number | null>(null)
  const [swaps, setSwaps] = useState(0)
  const [steps, setSteps] = useState<Step[]>([])
  const [bump, setBump] = useState(0)
  const inner = useRef<(HTMLSpanElement | null)[]>([])

  const values = order.map((id) => items[id])
  const max = Math.max(...items)
  const bits = max.toString(2).length
  const label = (v: number) => (look === 'binary' ? v.toString(2).padStart(bits, '0') : String(v))
  const passDone = steps.length === n - 1
  const target = sortedOf(items)
  const spent = limit !== undefined && swaps >= limit
  const answered = mode === 'swap' ? swaps > 0 && (isSorted(values) || spent) : passDone
  const correct = mode === 'swap' ? isSorted(values) : steps.every((s) => s.ok)
  const noun = look === 'bars' ? 'столбик' : 'карточку'

  const swapAt = (p: number) => {
    const next = [...order]
    ;[next[p], next[p + 1]] = [next[p + 1], next[p]]
    setOrder(next)
    hop(inner.current[order[p]])
    return next
  }

  const tap = (pos: number) => {
    if (checked || mode !== 'swap') return
    if (sel === null || sel === pos) { setSel(sel === pos ? null : pos); return }
    if (Math.abs(sel - pos) !== 1) { setSel(pos); return }
    if (spent) { setBump((b) => b + 1); return }
    const next = swapAt(Math.min(sel, pos))
    const count = swaps + 1
    setSwaps(count)
    setSel(null)
    const vals = next.map((id) => items[id])
    const complete = isSorted(vals) || (limit !== undefined && count >= limit)
    onAnswer(complete
      ? { correct: isSorted(vals), text: `сделал ${count} ${plural(count, 'обмен', 'обмена', 'обменов')}, получилось ${vals.join(', ')}` }
      : { correct: null })
  }

  const decide = (swap: boolean) => {
    if (checked || passDone) return
    const k = steps.length
    const [a, b] = [values[k], values[k + 1]]
    const step = { a, b, swap, ok: (a > b) === swap }
    const next = swap ? swapAt(k) : order
    const all = [...steps, step]
    setSteps(all)
    if (all.length === n - 1) {
      const text = all.map((s) => `${s.a} и ${s.b}: ${s.swap ? 'поменял' : 'оставил'}`).join('; ')
      onAnswer({ correct: all.every((s) => s.ok), text: `${text}. После прохода: ${next.map((id) => items[id]).join(', ')}` })
    }
  }

  const restart = () => {
    setOrder(items.map((_, i) => i)); setSel(null); setSwaps(0); setSteps([])
    onAnswer({ correct: null })
  }

  const pair = mode === 'pass' && !passDone ? steps.length : -1
  // After a pass the numbers at the end that already stand on their final places turn green.
  let placed = n
  while (placed > 0 && values[placed - 1] === target[placed - 1]) placed--
  const itemClass = (pos: number) => {
    let c = 'st-item'
    // A wrong check shows no marks on the items: they would tell which places or decisions to change.
    if (checked && correct && (mode === 'swap' || pos >= placed)) c += ' is-ok'
    else if (!checked && sel === pos) c += ' is-selected'
    else if (!checked && sel !== null && Math.abs(sel - pos) === 1 && !spent) c += ' is-near'
    if (pair >= 0 && (pos === pair || pos === pair + 1)) c += ' is-pair'
    return c
  }
  const Item = mode === 'swap' && !checked ? 'button' : 'div'
  const width = `calc((100% - ${(n - 1) * GAP}px) / ${n})`
  const gapAt = (k: number) => `calc(${(k + 1) / n} * (100% - ${(n - 1) * GAP}px) + ${(k + 0.5) * GAP}px)`

  let status: string
  if (mode === 'pass') status = !passDone ? `Сравни ${values[pair]} и ${values[pair + 1]}` : checked ? 'Проход закончен' : 'Проход закончен. Нажми «Проверить»'
  else if (checked) status = correct ? 'Всё по порядку' : 'Пока не по порядку'
  else if (spent) status = 'Обмены закончились. Нажми «Проверить»'
  else if (answered) status = 'Всё по порядку? Нажми «Проверить»'
  else if (sel !== null) status = 'Теперь нажми на соседа слева или справа'
  else status = swaps ? 'Меняй дальше, пока всё не встанет по порядку' : `Нажми на ${noun}, потом на ${look === 'bars' ? 'его' : 'её'} соседа`

  return (
    <Task
      state={stateOf(checked, answered, correct)}
      label={sort_.label}
      text={data.text}
      after={!checked && (swaps > 0 || steps.length > 0) && (
        <button className="start-over dg-start-over" onClick={restart}><Icon name="redo" size={16} />Начать заново</button>
      )}
    >
      <div className={'st st-' + look}>
        {mode === 'swap' && limit !== undefined && (
          <div className="st-meter" key={bump} data-bump={bump > 0 || undefined} aria-label={`Обменов ${swaps} из ${limit}`}>
            <span>Обмены</span>
            <span className="st-dots">
              {Array.from({ length: limit }, (_, i) => <i key={i} className={i < swaps ? 'is-used' : undefined} />)}
            </span>
            <b>{swaps} из {limit}</b>
          </div>
        )}
        {mode === 'swap' && limit === undefined && (
          <div className="st-meter"><span>Обменов:</span><b>{swaps}</b></div>
        )}

        <div className="st-row">
          {order.map((id, pos) => (
            <Item
              key={id}
              className={itemClass(pos)}
              style={{ width, transform: `translateX(calc(${pos} * (100% + ${GAP}px)))` }}
              onClick={mode === 'swap' ? () => tap(pos) : undefined}
              aria-label={`${label(items[id])}, место ${pos + 1}`}
            >
              <span className="st-face" ref={(el) => { inner.current[id] = el }} style={look === 'bars' ? { height: `${28 + (items[id] / max) * 96}px` } : undefined}>
                {label(items[id])}
              </span>
            </Item>
          ))}
        </div>

        {mode === 'pass' && (
          <div className="st-marks" aria-hidden>
            {Array.from({ length: n - 1 }, (_, k) => {
              const s = steps[k]
              const cls = s ? (checked && correct ? ' is-ok' : ' is-done') : k === pair ? ' is-now' : ''
              return (
                <span key={k} className={'st-mark' + cls} style={{ left: gapAt(k) }}>
                  {s ? (s.swap ? <SwapIcon /> : <Icon name="arrow" size={14} />) : null}
                </span>
              )
            })}
          </div>
        )}

        <p className={'dg-note st-status' + (mode === 'pass' && !passDone ? ' is-prompt' : '')} aria-live="polite">{status}</p>

        {mode === 'pass' && !checked && !passDone && (
          <div className="st-actions">
            <button className="btn btn-secondary" onClick={() => decide(true)}><SwapIcon />Поменять</button>
            <button className="btn btn-secondary" onClick={() => decide(false)}><Icon name="arrow" size={16} />Оставить</button>
          </div>
        )}
      </div>
    </Task>
  )
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function describe(d: SortData) {
  const bin = d.look === 'binary'
  const bits = Math.max(...d.items).toString(2).length
  const show = (xs: number[]) => xs.map((v) => (bin ? `${v.toString(2).padStart(bits, '0')} (${v})` : String(v))).join(', ')
  if ((d.mode ?? 'swap') === 'pass') {
    const xs = [...d.items]
    const steps: string[] = []
    for (let k = 0; k < xs.length - 1; k++) {
      const swap = xs[k] > xs[k + 1]
      steps.push(`${xs[k]} и ${xs[k + 1]}: ${swap ? 'поменять' : 'оставить'}`)
      if (swap) [xs[k], xs[k + 1]] = [xs[k + 1], xs[k]]
    }
    return `${d.text}\nОдин проход пузырьковой сортировки по числам ${show(d.items)}: сравнивать соседей слева направо и менять, если левое больше. Верные шаги: ${steps.join('; ')}. После прохода: ${xs.join(', ')}.`
  }
  const need = inversions(d.items)
  const lim = d.limit !== undefined ? ` Можно сделать не больше ${d.limit} обменов.` : ''
  return `${d.text}\nЧисла: ${show(d.items)}. Нужно расставить по возрастанию, меняя местами соседей.${lim} Ответ: ${show(sortedOf(d.items))}. Меньше всего обменов: ${need}.`
}

const sort_ = defineKind<SortData>({
  kind: 'sort',
  label: 'Сортировка',
  Component: Sort,
  describe,
})
export { sort_ as sort }
