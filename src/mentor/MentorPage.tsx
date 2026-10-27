import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../app/store'
import { Icon } from '../components'
import { analyze, officeWhen, type Board } from './analyze'
import { ChildPanel } from './ChildPanel'
import { ASSIGNED, GROUP, OFFICE_TOPIC, parseEvent, REAL, scriptedWeek, STUDENTS } from './data'
import { cap, count, dateLong, plural, weekday } from './format'
import { GroupTable } from './GroupTable'
import { Feed, StuckList, Suggestions } from './Insights'
import { useLive, type LiveStatus } from './live'
import { Face } from './parts'
import './mentor.css'

const GOAL = 0.9
const TICK = 10_000
const REANCHOR = 8 * 60_000
const NONE: unknown[] = []

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK)
    return () => clearInterval(id)
  }, [])
  return now
}

// How much a number grew at the last live change. The first server answer arrives together with the events
// that were already there, so a change counts only when the screen was live before it too.
function useGrowth(value: number, armed: boolean) {
  const [s, setS] = useState({ value, armed, delta: 0, n: 0 })
  if (s.value !== value || s.armed !== armed) {
    const counts = s.armed && armed && s.value !== value
    setS({ value, armed, delta: counts ? value - s.value : 0, n: counts ? s.n + 1 : s.n })
  }
  return s
}
type Growth = ReturnType<typeof useGrowth>

// A changed number slides in; the growth shows next to the tile's label for a moment.
function Num({ g, hero, suffix }: { g: Growth; hero?: boolean; suffix?: string }) {
  return (
    <span className={'mt-num' + (hero ? ' is-hero' : '')}>
      <span key={g.n} className={g.n ? 'mt-tick' : undefined}>{g.value}{suffix && <small>{suffix}</small>}</span>
    </span>
  )
}

const LIVE_TEXT: Record<LiveStatus, string> = { wait: 'Подключение', live: 'В реальном времени', off: 'Нет связи с сервером' }

function Header({ now, status }: { now: number; status: LiveStatus }) {
  return (
    <header className="mt-top">
      <div className="mt-top-in">
        <div className="mt-group">
          <img src="/logo-gradient.png" alt="Codify" />
          <div>
            <h1>{GROUP.name}</h1>
            <p>Ментор {GROUP.mentor} · {count(STUDENTS.length, 'ученик', 'ученика', 'учеников')}</p>
          </div>
        </div>
        <dl className="mt-meta">
          <div>
            <dt>Сегодня</dt>
            <dd>{cap(weekday(now))}, {dateLong(now)}</dd>
          </div>
          <div>
            <dt><Icon name="building" size={14} />Следующий урок в офисе</dt>
            <dd>{officeWhen(now)} · {OFFICE_TOPIC.title}</dd>
          </div>
        </dl>
        <span className={'mt-live is-' + status} role="status"><i />{LIVE_TEXT[status]}</span>
      </div>
    </header>
  )
}

function Tile({ label, g, suffix, children }: { label: string; g: Growth; suffix?: string; children: ReactNode }) {
  return (
    <div className="mt-tile">
      <div className="mt-tile-label">
        {label}
        {g.delta > 0 && <span key={g.n} className="mt-delta">+{g.delta}{suffix}</span>}
      </div>
      {children}
    </div>
  )
}

function Summary({ board, armed }: { board: Board; armed: boolean }) {
  const s = board.summary
  const share = s.assigned ? s.solved / s.assigned : 0
  const pct = Math.round(share * 100)
  const need = Math.max(0, Math.ceil(s.assigned * GOAL) - s.solved)
  const active = s.active.map((i) => STUDENTS[i])
  const gActive = useGrowth(active.length, armed)
  const gShare = useGrowth(pct, armed)
  const gLessons = useGrowth(s.lessonsDone, armed)
  const gHelper = useGrowth(s.helper, armed)
  return (
    <section className="mt-summary" aria-label="Итоги недели">
      <Tile label="Сейчас занимаются" g={gActive}>
        <div className="mt-tile-value"><Num g={gActive} /><span className="mt-of">из {STUDENTS.length}</span></div>
        {active.length
          ? <div className="mt-active">{active.map((k) => <Face key={k.idx} idx={k.idx} size={24} active />)}<span>{active.map((k) => k.name).join(', ')}</span></div>
          : <p className="mt-tile-note">Сейчас в приложении никого нет</p>}
      </Tile>
      <Tile label="Задания недели" g={gShare} suffix="%">
        <div className="mt-hero">
          <Num g={gShare} hero suffix="%" />
          <p><b>{s.solved} из {s.assigned}</b> {plural(s.assigned, 'задания', 'заданий', 'заданий')} сделано<br />
            {need ? `До цели ${count(need, 'задание', 'задания', 'заданий')}` : 'Цель недели выполнена'}</p>
        </div>
        <div className="mt-meter" role="img" aria-label={`Сделано ${pct}%, цель ${GOAL * 100}%`}>
          <div className="mt-meter-track"><div className={'mt-meter-fill' + (share >= GOAL ? ' is-goal' : '')} style={{ width: `${pct}%` }} /></div>
          <div className="mt-meter-goal" style={{ left: `${GOAL * 100}%` }}><span>Цель {GOAL * 100}%</span></div>
        </div>
      </Tile>
      <Tile label="Уроков пройдено" g={gLessons}>
        <div className="mt-tile-value"><Num g={gLessons} /><span className="mt-of">из {s.lessonsAssigned}</span></div>
        <p className="mt-tile-note">По {count(ASSIGNED.length, 'уроку', 'урока', 'уроков')} на каждого ученика</p>
      </Tile>
      <Tile label="Вопросы помощнику" g={gHelper}>
        <div className="mt-tile-value"><Num g={gHelper} /></div>
        <p className="mt-tile-note">От {count(s.helperKids, 'ученика', 'учеников', 'учеников')} за неделю</p>
      </Tile>
    </section>
  )
}

// The mentor's screen: one group, the scripted week of five children and the real child live from the phone.
export default function MentorPage() {
  useEffect(() => {
    const title = document.title
    document.title = 'Codify: экран ментора'
    return () => { document.title = title }
  }, [])

  const live = useLive()
  const now = useNow()
  // The scripted week is placed around this moment. It moves forward every few minutes, so the child
  // who is in a lesson right now stays active however long the tab has been open.
  const [anchor, setAnchor] = useState(now)
  if (now - anchor > REANCHOR) setAnchor(now)
  const done = useApp((s) => s.done)
  // The store comes from localStorage: read it through the same check as the server's events.
  const storeEvents = useApp((s) => (Array.isArray(s.events) ? s.events : NONE))
  // The real child's lessons from before the demo: done in the app's progress, with no lesson in this browser's events.
  const before = useMemo(() => {
    const finished = new Set(storeEvents.map(parseEvent).flatMap((e) => (e?.type === 'lesson-done' ? [e.lessonId] : [])))
    return Object.keys(done ?? {}).filter((id) => !finished.has(id)).join(',')
  }, [done, storeEvents])
  const script = useMemo(() => scriptedWeek(anchor, before ? before.split(',') : []), [anchor, before])
  const board = useMemo(
    () => analyze([...script, ...live.events.map((e) => ({ ...e, kid: REAL.idx }))], Math.max(now, live.events.at(-1)?.at ?? 0)),
    [script, live.events, now],
  )
  const [open, setOpen] = useState<number | null>(null)
  const closePanel = useCallback(() => setOpen(null), [])
  const armed = live.status !== 'wait'

  return (
    <div className="mt">
      <Header now={now} status={live.status} />
      <main className="mt-main">
        <Summary board={board} armed={armed} />
        <div className="mt-grid">
          <div className="mt-col is-main">
            <GroupTable board={board} now={now} fresh={live.fresh} freshKid={REAL.idx} onOpen={setOpen} />
            <StuckList board={board} now={now} fresh={live.fresh} onOpen={setOpen} />
          </div>
          <div className="mt-col is-side">
            <Feed board={board} now={now} />
            <Suggestions board={board} now={now} onOpen={setOpen} />
          </div>
        </div>
      </main>
      {open !== null && (
        <ChildPanel board={board} idx={open} now={now} fresh={open === REAL.idx ? live.fresh : null} onClose={closePanel} />
      )}
    </div>
  )
}
