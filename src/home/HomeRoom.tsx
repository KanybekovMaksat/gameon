import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { navigate, usePath } from '../app/router'
import { sfx } from '../app/sfx'
import { nextLesson, useApp, useLessonStates } from '../app/store'
import { AiFace, Avatar, Icon, KIDS } from '../components'
import { TOPICS } from '../content'
import type { DeskNews } from '../world/ClassRoom'
import { RoomLoading } from '../world/RoomLoading'
import { HomeTop } from './parts'
import './room.css'

const ClassRoom = lazy(() => import('../world/ClassRoom'))

// What changed at the child's desk since the room was last on screen: items put on the desk in the shop and a new
// character. Tracked from app start, so it works whether or not the room was open at the time.
const news = { items: new Set<string>(), character: false }
useApp.subscribe((s, prev) => {
  for (const id of s.desk) if (!prev.desk.includes(id)) news.items.add(id)
  for (const id of prev.desk) if (!s.desk.includes(id)) news.items.delete(id)
  if (s.character !== prev.character) news.character = true
})

// The room takes the news when it comes on screen, to show the desk up close.
function takeNews(): DeskNews | null {
  const n = { items: [...news.items], character: news.character }
  news.items.clear()
  news.character = false
  return n.items.length || n.character ? n : null
}

// The topic chips scroll sideways; a soft edge shows there is more on that side.
function useFadeEdges() {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState('')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 2
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
      setEdges((left ? ' is-fade-left' : '') + (right ? ' is-fade-right' : ''))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [])
  return [ref, edges] as const
}

// The class room as the home screen: the child sits at a desk among groupmates and starts the lesson from there.
export function HomeRoom() {
  const states = useLessonStates()
  const { topic, lesson } = nextLesson(states)
  const [picked, setPicked] = useState<string | null>(null)
  const path = usePath()
  // The home stays mounted behind the other tabs; a card from before must not greet the child on return.
  useEffect(() => { setPicked(null) }, [path])
  const kid = KIDS.find((k) => k.name === picked)
  const start = () => navigate(`/lesson/${lesson.id}`)
  const doneAll = states[lesson.id] === 'done'
  const [chips, fade] = useFadeEdges()

  return (
    <div className="home home-room">
      <div className="room-stage">
        <Suspense fallback={<RoomLoading inset={76} />}>
          <ClassRoom selected={picked} inset={76} takeNews={takeNews} onSelect={(n) => (n === KIDS[0].name ? start() : setPicked(n))} />
        </Suspense>
        <HomeTop onDark />
        {/* The class room as its own home version: a way out to the island, which is the main home. */}
        <button className="isle-back room-out" onClick={() => { sfx('tap'); useApp.getState().set({ home: 'world' }) }}><Icon name="back" size={20} />На остров</button>
        {(kid || picked === 'robot') && (
          <div className="room-pop">
            {kid ? <Avatar kid={kid} /> : <AiFace />}
            <div>
              <b>{kid ? kid.name : 'Помощник'}</b>
              <small>{kid ? (kid.online ? `Сейчас решает тему «${kid.topic}»` : kid.away ? 'Давно не было в приложении' : `Проходит тему «${kid.topic}»`) : 'Подскажет, если застрянешь'}</small>
            </div>
          </div>
        )}
      </div>
      <div className="room-sheet">
        <div className="room-today">
          <span className="map-icon"><Icon name={topic.icon} size={22} /></span>
          <div>
            <small>{doneAll ? 'Все уроки пройдены' : `Сегодня · ${topic.title}`}</small>
            <b>{lesson.title}</b>
          </div>
          <span className="t-small">{lesson.minutes} мин</span>
        </div>
        <button className="btn btn-block" onClick={start}>{doneAll ? 'Повторить урок' : 'Сесть за парту'}</button>
        <div className={'room-topics' + fade} ref={chips}>
          {TOPICS.map((t) => {
            const k = t.lessons.filter((l) => states[l.id] === 'done').length
            return (
              <span key={t.id} className={'room-topic' + (t.id === topic.id ? ' is-now' : '')}>
                <Icon name={t.icon} size={16} />{t.title}<i>{k}/{t.lessons.length}</i>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
