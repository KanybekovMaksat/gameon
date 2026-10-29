import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, useLayer, usePath } from '../app/router'
import { sfx } from '../app/sfx'
import { QUEST_GOAL, nextLesson, useApp, useLessonStates } from '../app/store'
import { AiFace, Avatar, Icon, KIDS, type IconName, type Kid } from '../components'
import { LESSONS, TOPICS, findLesson } from '../content'
import { SCHEDULE } from '../content/schedule'
import { island, onScene, playScene, send, setLabel, setSpawn } from '../world/island/bus'
import { KIOSK, OFFICE, QUEST, ROAD_END, SCHOOL } from '../world/island/layout'
import { IslandLoading } from '../world/island/loading'
import { GATES, STATIONS, spotAfter } from '../world/island/plan'
import { RoomLoading } from '../world/RoomLoading'
import { HomeTop, QuestCard } from './parts'
import './island.css'

const Island = lazy(() => import('../world/island/Island'))
const ClassRoom = lazy(() => import('../world/ClassRoom'))

// Starting a lesson from the island: the child comes back next to its pad.
function startLesson(lessonId: string) {
  setSpawn(spotAfter(lessonId))
  navigate(`/lesson/${lessonId}`)
}

// The status line of a groupmate, as in the class room.
function kidLine(kid: Kid) {
  return kid.online ? `Сейчас на станции «${kid.topic}»` : kid.away ? 'Давно не было на острове' : `Проходит предмет «${kid.topic}»`
}

function Card({ children, label }: { children: ReactNode; label: string }) {
  return <div className="isle-card" role="dialog" aria-label={label}>{children}</div>
}

// A lesson pad: the same content as the lesson sheet on the map.
function PadCard({ lessonId, onClose }: { lessonId: string; onClose: () => void }) {
  const states = useLessonStates()
  const found = findLesson(lessonId)
  if (!found) return null
  const { topic, lesson } = found
  const state = states[lesson.id]
  const open = state === 'now' || state === 'open' || state === 'done'
  const count = lesson.practice.length
  return (
    <Card label={lesson.title}>
      <div className="ex-kind">{topic.title}</div>
      <h3>{lesson.title}</h3>
      {open && <p className="t-small">{count} {count < 5 ? 'миссии' : 'миссий'} · около {lesson.minutes} минут</p>}
      {state === 'locked' && <p className="t-small">Сначала пройди урок перед этим. Так каждое открытие ложится на уже понятное.</p>}
      {state === 'office' && <p className="t-small">{topic.office}</p>}
      {open
        ? <button className="btn btn-block" onClick={() => startLesson(lesson.id)}>{state === 'done' ? 'Пройти ещё раз' : 'Начать миссию'}</button>
        : <button className="btn btn-secondary btn-block" onClick={onClose}>Понятно</button>}
    </Card>
  )
}

function PlaceCard({ icon, face, title, text, sub, action, onAction, second, onSecond }: {
  icon?: IconName; face?: ReactNode; title: string; text: string; sub?: string; action?: string; onAction?: () => void
  second?: string; onSecond?: () => void
}) {
  return (
    <Card label={title}>
      <div className="isle-place">
        {face ?? <span className="map-icon"><Icon name={icon ?? 'building'} size={22} /></span>}
        <div>
          <b>{title}</b>
          <p>{text}</p>
          {sub && <small>{sub}</small>}
        </div>
      </div>
      {action && <button className="btn btn-block" onClick={onAction}>{action}</button>}
      {second && <button className="btn btn-ghost btn-block isle-second" onClick={onSecond}>{second}</button>}
    </Card>
  )
}

// A label over something in the 3D scene. The scene moves it every frame; it keeps a fixed size on screen.
// `prio`: which label keeps its place when two would overlap (the gate 4, signs 3, groupmates 2, places 1).
function Label({ id, at, range = 15, prio = 1, mate, className = '', children }: {
  id: string; at?: { x: number; y: number; z: number }; range?: number; prio?: number; mate?: string; className?: string; children: ReactNode
}) {
  const ref = useCallback((el: HTMLDivElement | null) => setLabel(id, el), [id])
  return (
    <div
      ref={ref}
      className={'isle-label ' + className}
      data-x={at?.x}
      data-y={at?.y ?? 1.6}
      data-z={at?.z}
      data-range={range}
      data-prio={prio}
      data-mate={mate}
      aria-hidden
    >
      <span>{children}</span>
    </div>
  )
}

// The lessons with the teacher, as in the teacher's room (Monday and Wednesday at 10:00): «сегодня в 10:00», «завтра в 10:00»
// or the day of the next one.
const DAYS = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу']
function officeWhen(now = new Date()) {
  const time = `${SCHEDULE.hour}:${String(SCHEDULE.minute).padStart(2, '0')}`
  const end = (SCHEDULE.hour * 60 + SCHEDULE.minute + SCHEDULE.minutes) / 60
  for (let k = 0; k < 7; k++) {
    const day = (now.getDay() + k) % 7
    if (!SCHEDULE.days.includes(day) || (k === 0 && now.getHours() + now.getMinutes() / 60 >= end)) continue
    return `${k === 0 ? 'сегодня' : k === 1 ? 'завтра' : DAYS[day]} в ${time}`
  }
  return `в ${time}`
}

// The move hint's pictures: a fingertip touching down and sliding along a short arc, or the four keys.
const SWIPE = 'M7 20 Q14 6 28 9'
function SwipeIcon() {
  return (
    <svg className="isle-hint-icon" width="34" height="26" viewBox="0 0 34 26" aria-hidden>
      <circle cx="7" cy="20" r="5.2" fill="none" stroke="#ffffffb3" strokeWidth="1.6" />
      <path d={SWIPE} fill="none" stroke="#ffffff80" strokeWidth="2" strokeDasharray="2.2 3.4" strokeLinecap="round" />
      <path d="M24.2 5.8L28.3 9l-4.4 2.6" fill="none" stroke="#ffffffcc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="isle-hint-dot" r="3.4" fill="#fff" style={{ offsetPath: `path('${SWIPE}')` }} />
    </svg>
  )
}
function KeysIcon() {
  const key = (x: number, y: number, t: string) => (
    <g key={t}>
      <rect x={x} y={y} width="10" height="9" rx="2.5" fill="none" stroke="#ffffffb3" strokeWidth="1.4" />
      <text x={x + 5} y={y + 6.8} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff">{t}</text>
    </g>
  )
  return <svg className="isle-hint-icon" width="34" height="22" viewBox="0 0 34 22" aria-hidden>{[key(12, 1, 'W'), key(1, 12, 'A'), key(12, 12, 'S'), key(23, 12, 'D')]}</svg>
}

const HELPER_HINT = 'Я Робик. Застрял на миссии? Нажми «Подсказка». Я объясню трудное место простыми словами и спрошу так, чтобы ты догадался сам.'
const touchFirst = () => !matchMedia('(hover: hover) and (pointer: fine)').matches

// The island as the home screen. The 3D scene is a lazy chunk; this HUD shows the header, labels over the scene,
// the card of what the child stands near, «К миссии», the pointer to the current lesson, the first-time hint, and
// the class room when the child enters the school.
export function HomeWorld() {
  const states = useLessonStates()
  const done = useApp((s) => s.done)
  const officeDone = useApp((s) => s.officeDone)
  const quest = useApp((s) => s.quest)
  const path = usePath()
  const [near, setNear] = useState<string | null>(null)
  const [kid, setKid] = useState<string | null>(null)
  const [intro, setIntro] = useState(false)
  const [ready, setReady] = useState(false)
  const [moved, setMoved] = useState(island.hintDone)
  const [auto, setAuto] = useState(false)
  const [stage, setStage] = useState(false)
  const [opened, setOpened] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [entering, setEntering] = useState(false)
  // The demo scene «Класс» may ask for the class room before the island is on screen.
  const [inside, setInside] = useState(() => island.scene === 'class')
  const [leaving, setLeaving] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [robotTurn, setRobotTurn] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  const leaveTimer = useRef(0)
  const { lesson: next } = nextLesson(states)

  // The home stays mounted under a lesson and behind other tabs; on return, the card from before waits until
  // the child walks away.
  const [seenPath, setSeenPath] = useState(path)
  if (path !== seenPath) {
    setSeenPath(path)
    if (path === '/') { setKid(null); setDismissed(near) }
  }

  const onNear = useCallback((key: string | null) => {
    setNear(key)
    setDismissed((d) => (d === key ? d : null))
  }, [])
  const onKid = useCallback((name: string | null) => {
    setKid(name)
    if (name === 'robot') setRobotTurn((n) => n + 1)
  }, [])
  const onIntro = useCallback((playing: boolean) => setIntro(playing), [])
  const onReady = useCallback(() => {
    setReady(true)
    performance.mark('island-ready')
  }, [])
  const onMoved = useCallback(() => { island.hintDone = true; setMoved(true) }, [])
  const onEntered = useCallback(() => { setEntering(false); setLeaving(false); setInside(true) }, [])
  const onEnterEnd = useCallback(() => setEntering(false), [])

  // Opened straight into the class room (the demo scene «Класс» from another home), the island waits until the
  // class room has loaded, so the two do not load at once; then it loads under it.
  const [islandOn, setIslandOn] = useState(!inside)
  useEffect(() => {
    if (islandOn) return
    const start = performance.now()
    let raf = 0
    const check = () => {
      const loading = document.querySelector('.isle-class .world-wait')
      const cls = document.querySelector('.isle-class')
      if (!cls || (!loading && cls.querySelector('canvas')) || performance.now() - start > 6000) setIslandOn(true)
      else raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [islandOn])
  const onAuto = useCallback((on: boolean) => setAuto(on), [])
  const onStage = useCallback((on: boolean) => { setStage(on); if (on) setOpened(null) }, [])
  const onGateOpen = useCallback((topicId: string) => setOpened(topicId), [])
  const onBlocked = useCallback(() => setBlocked(true), [])

  useEffect(() => {
    if (!blocked) return
    const t = setTimeout(() => setBlocked(false), 2200)
    return () => clearTimeout(t)
  }, [blocked])
  useEffect(() => () => clearTimeout(leaveTimer.current), [])

  // A demo scene or a reset sets the island up from any state: the class room closes (or opens, for «Класс»),
  // cards, the gate moment and the school entry end.
  useEffect(() => onScene((s) => {
    clearTimeout(leaveTimer.current)
    setLeaving(false)
    setPicked(null)
    setInside(s === 'class')
    setKid(null)
    setOpened(null)
    setStage(false)
    setEntering(false)
    setDismissed(null)
    if (s === 'world' || s === 'reset') setMoved(false)
  }), [])

  // «Сбросить прогресс»: the island starts fresh.
  useEffect(() => useApp.subscribe((st, prev) => { if (st.resets !== prev.resets) playScene('reset') }), [])

  // Tell the camera how much of the screen the header and the dock cover.
  useLayoutEffect(() => {
    const measure = () => {
      const r = root.current?.getBoundingClientRect()
      const d = dock.current?.getBoundingClientRect()
      const top = root.current?.querySelector('.home-top')?.getBoundingClientRect()
      if (!r) return
      island.insetTop = top ? top.bottom - r.top + 6 : 76
      island.insetBottom = d && d.height > 0 ? r.bottom - d.top + 10 : 100
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (root.current) ro.observe(root.current)
    if (dock.current) ro.observe(dock.current)
    return () => ro.disconnect()
  })

  const goLesson = () => { sfx('tap'); send({ kind: 'lesson' }) }
  // Back outside the child stands at the door; the school's card waits until they walk away.
  const close = () => { setInside(false); setLeaving(false); setPicked(null); setDismissed('school'); send({ kind: 'exit' }) }
  const leave = () => {
    if (leaving) return
    clearTimeout(leaveTimer.current)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { close(); return }
    setLeaving(true)
    leaveTimer.current = window.setTimeout(close, 220)
  }
  // The class room is a step in history: the back gesture returns to the island. When a lesson starts from the
  // class room, the router closes the step on the way: the class room goes at once and the child will come back
  // by the lesson's pad, not to the door.
  useLayer(inside && !leaving, (why) => {
    if (why === 'navigate') { clearTimeout(leaveTimer.current); setInside(false); setLeaving(false); setPicked(null) }
    else leave()
  })

  // A tap on the open «Остров» tab leads out of the class room, as a phone tab returns to its first screen.
  useEffect(() => {
    if (!inside) return
    const out = () => leave()
    addEventListener('home-reselect', out)
    return () => removeEventListener('home-reselect', out)
  })

  const nextOffice = TOPICS.find((t) => t.office && !officeDone[t.id])
  // The card that a topic opened stays only while it is open (a reset closes it again).
  const openTopic = opened && officeDone[opened] ? TOPICS.find((t) => t.id === opened) : null
  const firstOfOpen = openTopic ? LESSONS.find((l) => l.topic.id === openTopic.id) : null
  let card: ReactNode = null
  let placeCard = false
  const k = KIDS.find((x) => x.name === kid)
  if (stage && !opened) card = null
  else if (openTopic && firstOfOpen) {
    const st = states[firstOfOpen.lesson.id]
    card = (
      <PlaceCard
        icon={openTopic.icon}
        title={`Предмет «${openTopic.title}» открыт`}
        text={`Урок с учителем прошёл. Первая миссия: «${firstOfOpen.lesson.title}».`}
        action={st === 'now' || st === 'open' || st === 'done' ? 'Начать миссию' : undefined}
        onAction={() => { setOpened(null); send({ kind: 'release' }); startLesson(firstOfOpen.lesson.id) }}
        second="Позже"
        onSecond={() => { setOpened(null); send({ kind: 'release' }) }}
      />
    )
  } else if (kid === 'robot') {
    const lessonLine = robotTurn % 2 === 1
    card = (
      <PlaceCard
        face={<AiFace />}
        title="Робик"
        text={lessonLine ? `Следующая миссия: «${next.title}». Проводить тебя?` : HELPER_HINT}
        action={lessonLine ? 'К миссии' : undefined}
        onAction={goLesson}
      />
    )
    // Without its own «К миссии», the helper's card keeps the chip above it.
    placeCard = !lessonLine
  } else if (k) {
    placeCard = true
    card = (
      <div className="room-pop isle-pop" role="status">
        <Avatar kid={k} />
        <div>
          <b>{k.name}</b>
          <small>{kidLine(k)}</small>
        </div>
      </div>
    )
  } else if (near && near !== dismissed) {
    const close = () => setDismissed(near)
    placeCard = !near.startsWith('pad:') && !near.startsWith('gate:')
    if (near.startsWith('pad:')) card = <PadCard lessonId={near.slice(4)} onClose={close} />
    else if (near.startsWith('gate:')) {
      const first = LESSONS.find((l) => l.topic.id === near.slice(5))
      if (first) card = <PadCard lessonId={first.lesson.id} onClose={close} />
    } else if (near === 'school') {
      card = <PlaceCard icon="building" title="Школа BilimQuest" text="Твой класс уже здесь. Заходи и садись за парту." action="Войти в класс" onAction={() => { sfx('tap'); setEntering(true); send({ kind: 'enter' }) }} />
    } else if (near === 'rewards') {
      card = <PlaceCard icon="trophy" title="Награды" text="Твой уровень, достижения и вещи на парту за них." action="Открыть награды" onAction={() => navigate('/rewards')} />
    } else if (near === 'quest') {
      card = <div className="isle-quest"><QuestCard /></div>
    } else if (near === 'office') {
      card = (
        <PlaceCard
          icon="building"
          title="Кабинет учителя"
          text={`Урок с учителем ${officeWhen()}`}
          sub={nextOffice ? `Предмет «${nextOffice.title}». После урока он откроется на острове.` : 'Учитель видит твой прогресс и открывает новые предметы.'}
        />
      )
    }
  }
  if (auto || entering) card = null
  // «К миссии» stays at hand: alone, above a place's card, or as «Идём к миссии» while the child walks there.
  const showChip = ready && !intro && !inside && !stage && !entering && (!card || placeCard)
  const showHint = !moved && ready && !intro && !inside && !stage && !card && !auto

  return (
    <div className="home isle" ref={root}>
      <div className="isle-stage">
        {islandOn && <Suspense fallback={inside ? null : <IslandLoading />}>
          <Island
            // Under the class room the island still loads and draws its first frames, then waits: closing the
            // class room shows it at once.
            paused={inside && ready}
            covered={inside}
            onReady={onReady}
            onNear={onNear}
            onKid={onKid}
            onIntro={onIntro}
            onMoved={onMoved}
            onEntered={onEntered}
            onAuto={onAuto}
            onStage={onStage}
            onGateOpen={onGateOpen}
            onBlocked={onBlocked}
            onEnterEnd={onEnterEnd}
          />
        </Suspense>}
        {ready && !inside && (
          <div className={'isle-labels' + (intro ? ' is-off' : '')}>
            {STATIONS.map((st) => {
              const topic = TOPICS.find((t) => t.id === st.topicId)!
              const k = topic.lessons.filter((l) => done[l.id]).length
              const current = topic.lessons.some((l) => states[l.id] === 'now')
              return (
                <Label key={st.topicId} id={'sign:' + st.topicId} at={{ x: st.sign.x, y: 2.35, z: st.sign.z }} range={13} prio={3} className={'is-sign' + (current ? ' is-now' : '')}>
                  <b>{topic.title}</b><small>{k} из {topic.lessons.length}</small>
                </Label>
              )
            })}
            <Label id="place:school" at={{ x: SCHOOL.x, y: 4.9, z: SCHOOL.z }} range={20}><Icon name="building" size={14} />Школа BilimQuest</Label>
            <Label id="place:office" at={{ x: OFFICE.x, y: 6.4, z: OFFICE.z }} range={20}><Icon name="building" size={14} />Кабинет учителя</Label>
            <Label id="place:rewards" at={{ x: KIOSK.x, y: 3.7, z: KIOSK.z }} range={18}><Icon name="trophy" size={14} />Награды</Label>
            <Label id="place:quest" at={{ x: QUEST.x, y: 2.9, z: QUEST.z }} range={16}><Icon name="users" size={14} />Квест класса · {quest} из {QUEST_GOAL}</Label>
            {GATES.filter((g) => !officeDone[g.topicId]).map((g) => (
              <Label key={g.topicId} id={'gate:' + g.topicId} at={{ x: g.x, y: 3.6, z: g.z }} range={16} prio={4} className="is-gate">
                <Icon name="building" size={14} />Откроется после урока с учителем
              </Label>
            ))}
            <Label id="place:end" at={{ x: ROAD_END.x + 1.6, y: 2.2, z: ROAD_END.z + 0.4 }} range={16}><Icon name="flag" size={14} />Дальше новые квесты</Label>
            {KIDS.filter((x) => x.online && !x.me).map((x) => (
              <Label key={x.name} id={'mate:' + x.name} mate={x.name} at={{ x: 0, y: 1.55, z: 0 }} range={14} prio={2} className="is-tag"><i />{x.name}</Label>
            ))}
          </div>
        )}
        <div className="isle-joy" ref={(el) => { island.joy = el }} aria-hidden><i /></div>
        <button className="isle-edge" ref={(el) => { island.edge = el }} onClick={goLesson} aria-label="К миссии" tabIndex={-1}>
          <span><Icon name="arrow" size={20} /></span>
        </button>
      </div>
      <HomeTop onDark />
      {showHint && (
        <div className="isle-hint" role="status">
          {touchFirst() ? <><SwipeIcon />Веди пальцем, чтобы идти</> : <><KeysIcon />Клавиши WASD или клик мышью, чтобы идти</>}
        </div>
      )}
      {blocked && <div className="isle-toast" role="status">Туда пока не пройти</div>}
      <div className="isle-dock" ref={dock}>
        {showChip && (auto
          ? (
            <div className="isle-go is-on" role="status">
              <Icon name="flag" size={18} />Идём к миссии
              <button className="isle-stop" onClick={() => send({ kind: 'stop' })} aria-label="Остановиться"><Icon name="close" size={16} /></button>
            </div>
          )
          : <button className={'isle-go' + (placeCard ? ' is-small' : '')} onClick={goLesson}><Icon name="flag" size={18} />К миссии</button>)}
        {!inside && card}
      </div>
      {inside && (
        <div className={'isle-class' + (leaving ? ' is-out' : '')}>
          <ClassView picked={picked} onPick={setPicked} onBack={leave} />
        </div>
      )}
    </div>
  )
}

// Inside the school: the class room with a way back to the island.
function ClassView({ picked, onPick, onBack }: { picked: string | null; onPick: (n: string | null) => void; onBack: () => void }) {
  const states = useLessonStates()
  const { topic, lesson } = nextLesson(states)
  const doneAll = states[lesson.id] === 'done'
  const kid = KIDS.find((k) => k.name === picked)
  return (
    <>
      <div className="room-stage">
        <Suspense fallback={<RoomLoading inset={64} />}>
          <ClassRoom selected={picked} inset={64} onSelect={(n) => (n === KIDS[0].name ? startLesson(lesson.id) : onPick(n))} />
        </Suspense>
        <button className="isle-back" onClick={onBack}><Icon name="back" size={20} />На остров</button>
        {(kid || picked === 'robot') && (
          <div className="room-pop">
            {kid ? <Avatar kid={kid} /> : <AiFace />}
            <div>
              <b>{kid ? kid.name : 'Робик'}</b>
              <small>{kid ? kidLine(kid) : 'Объяснит трудную тему простыми словами'}</small>
            </div>
          </div>
        )}
      </div>
      <div className="room-sheet">
        <div className="room-today">
          <span className="map-icon"><Icon name={topic.icon} size={22} /></span>
          <div>
            <small>{doneAll ? 'Весь остров пройден' : `Сегодня · ${topic.title}`}</small>
            <b>{lesson.title}</b>
          </div>
          <span className="t-small">{lesson.minutes} мин</span>
        </div>
        <button className="btn btn-block" onClick={() => startLesson(lesson.id)}>{doneAll ? 'Повторить миссию' : 'Сесть за парту'}</button>
      </div>
    </>
  )
}
