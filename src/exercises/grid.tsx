import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Icon } from '../components'
import { defineKind, stateOf, Task, type ExProps } from './kit'
import { retryMemory } from './memory'
import {
  CMD_WORD, countCommands, newId, parseMap, parseProgram, plural, programWords, simulate,
  type Cmd, type Item, type Level, type Run, type Simple,
} from './robot'
import { Board, CmdIcon, type Mark } from './robot-view'
import './exercises.css'

// `map` rows use the symbols of parseMap. `loops` adds the repeat block. `max` limits the number of commands:
// every chip counts, the repeat block and each command inside it. `solution` is one right program in short notation, for the helper.
export type GridData = { text?: string; map: string[]; loops?: boolean; max?: number; solution: string }

const STEP_MS = 420
const FIRST_MS = 240
const CAP = 16 // commands in one program; more does not fit the screen

const MIN_CELL = 28
const MAX_CELL = 52

// After a wrong check the child keeps the program for «Ещё раз» and fixes one command instead of starting over.
// The session remounts the task on retry, so the program waits in `retryMemory`, keyed by the task data.
const kept = retryMemory as Map<GridData, Item[]>

// The board size is set once per task, so it never jumps while the child programs or when the result shows.
// The program strip gets a fixed height, measured on hidden copies of the longest expected program
// (the solution, or as many commands as the limit allows); the board takes the rest of the screen.
// It is measured again only when the screen itself changes size, and never after the check.
let bodyPad: number | null = null

function useBoardSize(root: RefObject<HTMLDivElement | null>, rows: number, frozen: boolean) {
  const [size, setSize] = useState<{ cell: number; strip: number }>()
  useLayoutEffect(() => {
    const el = root.current
    if (!el || frozen) return
    let scroller = el.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    if (!scroller) return
    const box = scroller
    const fit = () => {
      const board = el.querySelector<HTMLElement>('.robo-board')
      const strip = el.querySelector<HTMLElement>('.robo-prog.is-live')
      const ghosts = [...el.querySelectorAll<HTMLElement>('.robo-ghost')]
      const kids = [...box.children]
      if (!board || !strip || !kids.length) return
      const reserve = Math.ceil(Math.max(...ghosts.map((g) => g.offsetHeight)))
      // The session pads the body under its result sheet (an inline style) and removes it after «Ещё раз»,
      // just after this task mounts again. Use the body's own padding, remembered from a measure without the sheet.
      const cs = getComputedStyle(box)
      if (!box.style.paddingBottom) bodyPad = parseFloat(cs.paddingBottom)
      const pads = parseFloat(cs.paddingTop) + (bodyPad ?? 0)
      const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top))
      const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom))
      const content = bottom - top + pads - strip.offsetHeight + reserve
      const free = box.clientHeight - content
      const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((board.getBoundingClientRect().height - 8 + free) / rows)))
      setSize((old) => (old && old.cell === cell && old.strip === reserve ? old : { cell, strip: reserve }))
    }
    fit()
    // Border box: the session's padding under the result sheet does not count as a new screen size.
    const ro = new ResizeObserver(fit)
    ro.observe(box, { box: 'border-box' })
    return () => ro.disconnect()
  }, [root, rows, frozen])
  return size
}

const isComplete = (prog: Item[]) => prog.length > 0 && prog.every((it) => it.t !== 'rep' || it.body.length > 0)

function outcomeWords(run: Run, lv: Level, prog: Item[], max?: number) {
  const got = run.frames[run.frames.length - 1].got.length
  switch (run.outcome) {
    case 'goal': return 'робот дошёл до флажка'
    case 'wall': return `робот упёрся в стену на шаге ${run.frames.length - 1}`
    case 'edge': return `робот упёрся в край поля на шаге ${run.frames.length - 1}`
    case 'short': return 'команды кончились, робот не дошёл до флажка'
    case 'passed': return 'робот проехал флажок и остановился дальше'
    case 'stars': return `робот дошёл до флажка, но собрал ${got} из ${lv.stars.length} звёзд`
    case 'long': return `робот дошёл до флажка, но команд ${countCommands(prog)}, а можно не больше ${max}`
  }
}

// What the child reads next to the run button after a run. The highlighted command shows the place.
function statusOf(run: Run): { ok: boolean; text: string } {
  switch (run.outcome) {
    case 'goal': return { ok: true, text: 'Робот на флажке!' }
    case 'wall': return { ok: false, text: 'Робот упёрся в стену.' }
    case 'edge': return { ok: false, text: 'Дальше край поля.' }
    case 'short': return { ok: false, text: 'Робот не дошёл до флажка.' }
    case 'passed': return { ok: false, text: 'Робот проехал мимо флажка.' }
    case 'stars': return { ok: false, text: 'Собраны не все звёзды.' }
    case 'long': return { ok: false, text: 'Команд больше, чем можно.' }
  }
}

// The reason on the result sheet: what went wrong, in one short sentence.
function noteOf(run: Run, prog: Item[], max?: number) {
  if (run.outcome === 'goal') return undefined
  if (run.outcome === 'long') return `Команд ${countCommands(prog)}, а можно не больше ${max}.`
  return statusOf(run).text
}

function answerOf(prog: Item[], lv: Level, max?: number) {
  const r = simulate(lv, prog, max)
  const full = isComplete(prog)
  const n = countCommands(prog)
  return {
    correct: full ? r.outcome === 'goal' : null,
    text: full ? `программа: ${programWords(prog)}; всего ${n} ${plural(n, 'команда', 'команды', 'команд')}. Результат: ${outcomeWords(r, lv, prog, max)}` : undefined,
    note: full ? noteOf(r, prog, max) : undefined,
    replays: full,
  }
}

function Grid({ data, checked, onAnswer, onSettled }: ExProps<GridData>) {
  const lv = useMemo(() => parseMap(data.map), [data.map])
  const [prog, setProg] = useState<Item[]>(() => kept.get(data) ?? [])
  // The repeat block that receives new commands; null means the end of the program.
  const [open, setOpen] = useState<number | null>(null)
  const [played, setPlayed] = useState(false)
  const [frame, setFrame] = useState(0)

  const run = useMemo(() => simulate(lv, prog, data.max), [lv, prog, data.max])
  const count = countCommands(prog)
  const complete = isComplete(prog)
  const correct = complete && run.outcome === 'goal'
  // The check plays the program when the child did not run it.
  const showing = (played || checked) && complete
  const last = run.frames.length - 1
  const done = showing && frame >= last
  const playing = showing && !done

  // A kept program is an answer from the first render.
  useEffect(() => {
    if (prog.length) onAnswer(answerOf(prog, lv, data.max))
    // Only on mount: later answers come from the edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!checked) return
    if (correct) kept.delete(data)
    else kept.set(data, prog)
  }, [checked, correct, data, prog])

  const root = useRef<HTMLDivElement>(null)
  const size = useBoardSize(root, lv.rows, checked)
  // Hidden copies that size the program strip: the right program and a flat row of the most commands expected.
  const ghosts = useMemo(() => {
    const sol = parseProgram(data.solution)
    const n = data.max ?? countCommands(sol) + 2
    return [sol, Array.from({ length: n }, (): Simple => ({ id: newId(), t: 'F' }))]
  }, [data.solution, data.max])
  const stripRef = useRef<HTMLDivElement>(null)
  // The strip keeps its height; a longer program scrolls inside it, and the newest command stays in view.
  useEffect(() => {
    const st = stripRef.current
    if (st) st.scrollTop = st.scrollHeight
  }, [prog])

  useEffect(() => {
    if (!showing || frame >= last) return
    const t = setTimeout(() => setFrame((f) => f + 1), frame === 0 ? FIRST_MS : STEP_MS)
    return () => clearTimeout(t)
  }, [showing, frame, last])

  const f = showing ? run.frames[Math.min(frame, last)] : run.frames[0]

  const commit = (next: Item[], nextOpen: number | null) => {
    setProg(next)
    setOpen(nextOpen)
    setPlayed(false)
    setFrame(0)
    onAnswer(answerOf(next, lv, data.max))
  }

  const add = (t: Cmd) => {
    if (checked || count >= CAP) return
    const c: Simple = { id: newId(), t }
    if (open !== null) commit(prog.map((it) => (it.id === open && it.t === 'rep' ? { ...it, body: [...it.body, c] } : it)), open)
    else commit([...prog, c], null)
  }
  const addRepeat = () => {
    if (checked || count >= CAP - 1) return
    const id = newId()
    commit([...prog, { id, t: 'rep', n: 2, body: [] }], id)
  }
  // Backspace removes one command before the insertion point. At the end of a repeat block it steps inside.
  const back = () => {
    if (checked) return
    const target = open !== null ? prog.find((it) => it.id === open) : prog[prog.length - 1]
    if (!target) return
    if (target.t === 'rep' && target.body.length) commit(prog.map((it) => (it === target ? { ...target, body: target.body.slice(0, -1) } : it)), target.id)
    else commit(prog.filter((it) => it !== target), null)
  }
  const remove = (id: number) => {
    if (checked) return
    commit(prog.filter((it) => it.id !== id).map((it) => (it.t === 'rep' ? { ...it, body: it.body.filter((c) => c.id !== id) } : it)), open === id ? null : open)
  }
  const setCount = (id: number, n: number) => {
    if (checked || n < 2 || n > 9) return
    commit(prog.map((it) => (it.id === id && it.t === 'rep' ? { ...it, n } : it)), open)
  }
  // After the check the result waits until the robot stops: at once if the child already watched the run.
  useEffect(() => {
    if (checked && done) onSettled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, done])

  const toggleRun = () => {
    if (checked || !complete) return
    setFrame(0)
    setPlayed(!playing)
  }

  const marks = new Map<string, Mark>()
  if (showing) {
    for (let i = 0; i <= Math.min(frame, last); i++) marks.set(`${run.frames[i].x},${run.frames[i].y}`, 'trail')
    if (done) {
      if (run.hit) marks.set(`${run.hit.x},${run.hit.y}`, 'hit')
      if (run.outcome === 'short' || run.outcome === 'passed' || run.outcome === 'edge') marks.set(`${f.x},${f.y}`, 'end')
      if (run.outcome === 'stars') lv.stars.forEach((s, i) => { if (!f.got.includes(i)) marks.set(`${s.x},${s.y}`, 'miss') })
    }
  }

  const status = done ? statusOf(run) : null
  const failId = done ? run.failId : null
  const chipCls = (id: number) => 'robo-chip'
    + (playing && f.at === id ? ' is-now' : '')
    + (failId === id ? ' is-fail' : '')
    + (checked && correct ? ' is-ok' : '')
  const over = !!data.max && count > data.max
  const openRep = prog.find((it) => it.id === open)

  const chip = (c: Simple, live: boolean) => (
    <button
      key={c.id}
      className={live ? chipCls(c.id) : 'robo-chip'}
      aria-label={`${CMD_WORD[c.t]}. Нажми, чтобы убрать`}
      tabIndex={live ? undefined : -1}
      onClick={live ? (e) => { e.stopPropagation(); remove(c.id) } : undefined}
    >
      <CmdIcon t={c.t} size={20} />
    </button>
  )

  // The program as chips; a repeat block shows its count between − and +, and its pass while the robot runs.
  const strip = (items: Item[], live: boolean) => {
    const lastIsBlock = items[items.length - 1]?.t === 'rep'
    return (
      <>
        {items.length === 0 && <span className="robo-empty">Нажимай на команды внизу</span>}
        {items.map((it) => it.t === 'rep' ? (
          <div
            key={it.id}
            className={'robo-rep' + (live && open === it.id && !checked ? ' is-open' : '') + (live && playing && f.rep === it.id ? ' is-now' : '')}
            onClick={live ? (e) => { e.stopPropagation(); if (!checked) setOpen(it.id) } : undefined}
          >
            <span className="robo-rep-head">
              <CmdIcon t="rep" size={16} />
              <span className="robo-stepper">
                <button aria-label="Меньше повторов" tabIndex={live ? undefined : -1} disabled={checked || it.n <= 2} onClick={live ? (e) => { e.stopPropagation(); setCount(it.id, it.n - 1) } : undefined}>−</button>
                {live && playing && f.rep === it.id
                  ? <b className="is-iter">{f.iter} из {it.n}</b>
                  : <b>{it.n} {plural(it.n, 'раз', 'раза', 'раз')}</b>}
                <button aria-label="Больше повторов" tabIndex={live ? undefined : -1} disabled={checked || it.n >= 9} onClick={live ? (e) => { e.stopPropagation(); setCount(it.id, it.n + 1) } : undefined}>+</button>
              </span>
            </span>
            {it.body.map((c) => chip(c, live))}
            {live && open === it.id && !checked && <i className="robo-caret" />}
            {it.body.length === 0 && !(live && open === it.id) && <span className="robo-empty">пусто</span>}
          </div>
        ) : chip(it, live))}
        {(!live || (open === null && !checked)) && items.length > 0 && !lastIsBlock && <i className="robo-caret" />}
      </>
    )
  }

  const note = status
    ? <span className={status.ok ? 'is-ok' : 'is-bad'}><Icon name={status.ok ? 'check' : 'x'} size={16} />{status.text}</span>
    : playing ? `Шаг ${frame} из ${last}`
      : openRep && !checked ? 'Команды попадают внутрь повтора.'
        : data.max ? <span className={'robo-goal' + (over ? ' is-bad' : '')}>{count} {plural(count, 'команда', 'команды', 'команд')}, можно {data.max}</span>
          : complete ? 'Запусти и посмотри, что будет.' : 'Робот ждёт программу.'

  return (
    <Task
      state={stateOf(checked, complete, correct)}
      label={grid.label}
      text={data.text ?? 'Доведи робота до флажка.'}
      after={!checked && (
        <div className="robo-keys" data-n={data.loops ? 5 : 4}>
          {(['F', 'L', 'R'] as Cmd[]).map((t) => (
            <button key={t} className="robo-key" disabled={count >= CAP} onClick={() => add(t)}>
              <CmdIcon t={t} size={20} /><span>{CMD_WORD[t]}</span>
            </button>
          ))}
          {data.loops && (openRep
            ? <button className="robo-key is-on" onClick={() => setOpen(null)}><CmdIcon t="exit" size={20} /><span>выйти</span></button>
            : <button className="robo-key" disabled={count >= CAP - 1} onClick={addRepeat}><CmdIcon t="rep" size={20} /><span>повтори</span></button>)}
          <button className="robo-key" disabled={!prog.length} onClick={back} aria-label="Стереть последнюю команду">
            <CmdIcon t="back" size={20} /><span>стереть</span>
          </button>
        </div>
      )}
    >
      <div className="robo" ref={root}>
        <Board lv={lv} frame={f} marks={marks} tone={checked ? (correct ? 'ok' : 'bad') : undefined} win={done && run.outcome === 'goal'} cell={size?.cell} />
        <div className="robo-bar">
          <div className="robo-status" aria-live="polite">{note}</div>
          {!checked && (
            <button className={'robo-run' + (playing ? ' is-stop' : '')} disabled={!complete} onClick={toggleRun}>
              {playing ? <><i className="robo-stop" />Стоп</> : <><Icon name="play" size={16} />Пуск</>}
            </button>
          )}
        </div>
        <div
          ref={stripRef}
          className={'robo-prog is-live' + (open === null && !checked ? ' is-open' : '')}
          style={size ? { height: size.strip } : undefined}
          onClick={() => !checked && setOpen(null)}
        >
          {strip(prog, true)}
        </div>
        {ghosts.map((g, i) => <div key={i} className="robo-prog robo-ghost" aria-hidden>{strip(g, false)}</div>)}
      </div>
    </Task>
  )
}

export const grid = defineKind<GridData>({
  kind: 'grid',
  label: 'Программируй робота',
  Component: Grid,
  describe: (d) => {
    const lv = parseMap(d.map)
    return [
      d.text ?? 'Доведи робота до флажка.',
      `Поле ${lv.cols}×${lv.rows}, ряды сверху вниз:`,
      ...d.map,
      'Обозначения: ^ > v < показывают робота и сторону, куда он смотрит; F флажок; # стена; * звезда; . пусто.',
      `Команды: вперёд (на одну клетку туда, куда смотрит робот), налево и направо (поворот на месте)${d.loops ? ', повтори N раз (повторяет команды внутри блока)' : ''}.`,
      lv.stars.length ? 'Нужно собрать все звёзды и закончить на флажке.' : 'Нужно закончить на флажке.',
      d.max ? `Можно не больше ${d.max} команд. Считаются все команды: сам блок повтора и каждая команда внутри него.` : '',
      `Один из верных ответов: ${programWords(parseProgram(d.solution))}.`,
    ].filter(Boolean).join('\n')
  },
})
