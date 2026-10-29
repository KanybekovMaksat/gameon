import { useEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../../app/sfx'
import { Icon } from '../../components'
import { CMD_WORD, newId, parseMap, plural, simulate, type Cmd, type Item, type Outcome, type Run, type Simple } from '../../exercises/robot'
import { Board, CmdIcon, RobotMark, type Mark } from '../../exercises/robot-view'
import { LEVELS, N_MAX, N_MIN, type DialLevel } from './dial/levels'
import { BodyRow, CodeView, CountSlider, Ghost } from './dial/parts'
import '../../exercises/exercises.css'
import './dial.css'

// «Живой цикл»: one repeat block always on screen. Every change of the count or of the commands inside
// redraws the robot's path on the board at once; «Пуск» plays the real run and checks it.
const FIRST_MS = 240
const STEP_MS = 330

type Phase = 'edit' | 'run' | 'ok' | 'bad'

const REP_ID = -1 // the one repeat block of a level

// What the path shows now, in plain words. It describes, it does not judge: the check comes with «Пуск».
function pathWords(run: Run, lv: ReturnType<typeof parseMap>, empty: boolean) {
  if (empty) return 'Добавь команду внутрь повтора.'
  const end = run.frames[run.frames.length - 1]
  const pass = end.iter
  switch (run.outcome) {
    case 'wall': return `На проходе ${pass} робот упрётся в стену.`
    case 'edge': return `На проходе ${pass} робот упрётся в край поля.`
    case 'short': return 'Проходы кончатся раньше флажка.'
    case 'passed': return 'Робот проедет флажок и встанет дальше.'
    case 'stars': return `Путь ведёт на флажок, звёзд ${end.got.length} из ${lv.stars.length}.`
    default: return 'Путь ведёт на флажок.'
  }
}

function resultWords(o: Outcome) {
  switch (o) {
    case 'wall': return 'Робот упёрся в стену.'
    case 'edge': return 'Робот упёрся в край поля.'
    case 'short': return 'Робот не дошёл до флажка.'
    case 'passed': return 'Робот проехал мимо флажка.'
    case 'stars': return 'Собраны не все звёзды.'
    default: return 'Робот на флажке.'
  }
}

const toBody = (cmds: Cmd[]): Simple[] => cmds.map((t) => ({ id: newId(), t }))

function LevelView({ level, index, onNext }: { level: DialLevel; index: number; onNext: () => void }) {
  const lv = useMemo(() => parseMap(level.map), [level.map])
  const [n, setN] = useState(level.n)
  const [body, setBody] = useState(() => toBody(level.body))
  // While a chip is dragged, the path follows the order it would have.
  const [preview, setPreview] = useState<Simple[] | null>(null)
  const [phase, setPhase] = useState<Phase>('edit')
  const [frame, setFrame] = useState(0)
  const [tries, setTries] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('goal')
  const [flash, setFlash] = useState(0)

  const shown = preview ?? body
  const prog = useMemo<Item[]>(() => [{ id: REP_ID, t: 'rep', n, body: shown }], [n, shown])
  const run = useMemo(() => simulate(lv, prog), [lv, prog])
  const last = run.frames.length - 1
  const busy = phase === 'run'
  const done = phase === 'ok' || phase === 'bad'
  const f = busy || done ? run.frames[Math.min(frame, last)] : run.frames[0]

  // The run: one frame per command. A star taken on the way clinks; after the last move settles, the result shows.
  useEffect(() => {
    if (phase !== 'run') return
    const t = setTimeout(() => {
      if (frame >= last) {
        setOutcome(run.outcome)
        if (run.outcome === 'goal') { sfx('ok'); setPhase('ok'); return }
        sfx('bad')
        setPhase('bad')
        setTries(tries + 1)
        setHint(level.hint(run.outcome, tries + 1))
        return
      }
      if (run.frames[frame + 1].got.length > run.frames[frame].got.length) sfx('xp')
      setFrame(frame + 1)
    }, frame === 0 ? FIRST_MS : STEP_MS)
    return () => clearTimeout(t)
  }, [phase, frame, last, run, level, tries])

  // Any change goes back to editing; the hint of the last wrong run stays until the next run.
  const edit = () => { if (phase === 'bad') setPhase('edit'); setFrame(0) }
  const changeN = (v: number) => { setN(v); setFlash((k) => k + 1); edit() }
  const changeBody = (b: Simple[]) => { setBody(b); edit() }
  // A drag after a wrong run is already an edit: the board shows the new path, not the old result.
  const previewBody = (b: Simple[] | null) => { setPreview(b); if (b) edit() }
  const add = (t: Cmd) => {
    if (body.length >= level.maxBody) return
    sfx('tap')
    changeBody([...body, { id: newId(), t }])
  }

  const empty = shown.length === 0
  const repRef = useRef<HTMLElement>(null)
  const main = () => {
    if (phase === 'ok') { sfx('tap'); onNext(); return }
    if (phase === 'run') { setPhase('edit'); setFrame(0); return }
    // «Исправить»: back to editing with the hint kept, the repeat block in view.
    if (phase === 'bad') {
      sfx('tap')
      edit()
      repRef.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      return
    }
    if (empty) return
    sfx('tap')
    setFrame(0)
    setPhase('run')
  }

  // The board after the run: the trail, and in amber the wall it hit, where it stopped or the stars it missed.
  const marks = new Map<string, Mark>()
  if (busy || done) {
    for (let i = 0; i <= Math.min(frame, last); i++) marks.set(`${run.frames[i].x},${run.frames[i].y}`, 'trail')
    if (phase === 'bad') {
      if (run.hit) marks.set(`${run.hit.x},${run.hit.y}`, 'hit')
      if (run.outcome === 'short' || run.outcome === 'passed' || run.outcome === 'edge') marks.set(`${f.x},${f.y}`, 'end')
      if (run.outcome === 'stars') lv.stars.forEach((s, i) => { if (!f.got.includes(i)) marks.set(`${s.x},${s.y}`, 'miss') })
    }
  }

  const pass = busy || done ? f.iter : 0
  const nowId = busy && frame > 0 ? f.at : null
  const nowLine = nowId === null ? null : 1 + shown.findIndex((c) => c.id === nowId)
  const state = phase === 'ok' ? 'ok' : phase === 'bad' ? 'bad' : 'active'
  const full = body.length >= level.maxBody
  const frozen = busy || phase === 'ok'

  // The message area keeps its place and its height: the live verdict on the path while the child works,
  // the result after a run. It sits above the button, so it never covers the controls.
  const dash = <svg className="lp-dial-dash" viewBox="0 0 18 4" aria-hidden><path d="M1 2h16" /></svg>
  const think = hint ? <><em>Подумай.</em> {hint}</> : level.tip
  const msg = phase === 'ok'
    ? { tone: 'ok', head: <><Icon name="check" size={18} />Верно! {resultWords('goal')}</>, text: level.why }
    : phase === 'bad'
      ? { tone: 'bad', head: <><Icon name="x" size={18} />{resultWords(outcome)}</>, text: hint }
      : busy
        ? { tone: 'work', head: <><span className="lp-dial-dot" />Робот едет: проход {Math.max(pass, 1)} из {n}</>, text: think }
        : { tone: 'work', head: <>{dash}{pathWords(run, lv, empty)}</>, text: think }

  return (
    <>
      <div className="lp-dial-scroll">
        <div className="lp-dial-level" key={index}>
          <div className="lp-dial-head">
            <span className="lp-dial-step">Уровень {index + 1} из {LEVELS.length}<span aria-hidden> · </span>{level.topic}</span>
            <span className="lp-dial-pips" aria-hidden>
              {LEVELS.map((_, i) => <i key={i} className={i < index ? 'is-done' : i === index ? 'is-now' : ''} />)}
            </span>
          </div>
          <p className="lp-dial-goal">{level.goal}</p>

          <div className="lp-dial-card" data-state={state}>
            <div className={'lp-dial-viz' + (level.side ? ' is-side' : '')}>
              <div className="lp-dial-board">
                <Board lv={lv} frame={f} marks={marks} cell={64} tone={phase === 'ok' ? 'ok' : phase === 'bad' ? 'bad' : undefined} win={phase === 'ok'} />
                {!empty && <Ghost lv={lv} run={run} dim={busy || done} />}
              </div>
              <CodeView n={n} body={shown} nowLine={busy ? (nowLine && nowLine > 0 ? nowLine : 0) : null} flash={flash} />
            </div>

            <section ref={repRef} className={'lp-dial-rep' + (busy ? ' is-busy' : '')} aria-label="Блок повтора">
              <div className="lp-dial-rep-head">
                <CmdIcon t="rep" size={18} />
                <span>повтори <b className="lp-dial-count">{n}</b> {plural(n, 'раз', 'раза', 'раз')}</span>
                {level.lockN && <span className="lp-dial-tag"><Icon name="lock" size={13} />число задано</span>}
                {level.lockBody && <span className="lp-dial-tag"><Icon name="lock" size={13} />команды готовы</span>}
              </div>
              <CountSlider value={n} min={N_MIN} max={N_MAX} locked={level.lockN} busy={frozen} pass={pass} onChange={changeN} />
              <div className="lp-dial-inside">
                <BodyRow body={body} max={level.maxBody} locked={level.lockBody} busy={frozen} now={nowId} onChange={changeBody} onPreview={previewBody} />
              </div>
              {!level.lockBody && (
                <div className="lp-dial-keys">
                  {(['F', 'L', 'R'] as Cmd[]).map((t) => (
                    <button key={t} className="lp-dial-key" disabled={full || frozen} onClick={() => add(t)}>
                      <CmdIcon t={t} size={20} /><span>{CMD_WORD[t]}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <div className="lp-dial-foot">
        <div className={`lp-dial-fb is-${msg.tone}`} role="status" aria-live="polite">
          <b>{msg.head}</b>
          {msg.text && <p>{msg.text}</p>}
        </div>
        <button
          className={'btn btn-block' + (phase === 'ok' ? ' btn-ok' : busy ? ' btn-secondary' : '')}
          disabled={phase === 'edit' && empty}
          onClick={main}
        >
          {phase === 'ok'
            ? <>{index === LEVELS.length - 1 ? 'Завершить' : 'Дальше'}<Icon name="arrow" size={18} /></>
            : phase === 'bad' ? 'Исправить'
              : busy ? <><i className="lp-dial-stop" />Стоп</> : <><Icon name="play" size={18} />Пуск</>}
        </button>
      </div>
    </>
  )
}

function Finish({ onAgain }: { onAgain: () => void }) {
  const items: [string, string][] = [
    ['Число повторов', 'решает, сколько раз робот повторит команды.'],
    ['Команды внутри', 'решают, что повторится. Проход кончается там, откуда начнётся следующий.'],
    ['Вместе', 'они задают весь путь. Меняешь одно, и путь меняется сразу.'],
  ]
  return (
    <>
      <div className="lp-dial-scroll">
        <div className="lp-dial-finish">
          <span className="lp-dial-finish-bot"><RobotMark dir={2} /></span>
          <h2>Цикл освоен</h2>
          <p className="lp-dial-finish-lead">Ты прошёл три уровня и видел, как каждое изменение сразу меняет путь.</p>
          <ul>
            {items.map(([b, t], i) => (
              <li key={b}><i>{i + 1}</i><span><b>{b}</b> {t}</span></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="lp-dial-foot">
        <button className="btn btn-block" onClick={onAgain}><Icon name="redo" size={18} />Ещё раз</button>
      </div>
    </>
  )
}

export function DialLab() {
  // `round` remounts the levels on «Ещё раз», so every level starts fresh.
  const [at, setAt] = useState(0)
  const [round, setRound] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const go = (i: number) => {
    if (i === LEVELS.length) sfx('finish')
    setAt(i)
    root.current?.querySelector('.lp-dial-scroll')?.scrollTo({ top: 0 })
  }
  return (
    <div className="lp-dial" ref={root}>
      {at < LEVELS.length
        ? <LevelView key={`${round}-${at}`} level={LEVELS[at]} index={at} onNext={() => go(at + 1)} />
        : <Finish onAgain={() => { sfx('tap'); setRound((r) => r + 1); go(0) }} />}
    </div>
  )
}
