import { useEffect, useState } from 'react'
import { QUEST_GOAL, nextLesson, useApp, useLessonStates } from '../app/store'
import { Avatar, Icon, KIDS, Progress, Xp } from '../components'
import { levelOf } from '../rewards/catalog'

export function Streak({ days }: { days: number }) {
  return (
    <span className="streak" aria-label={`${days} дней подряд`}>
      <Icon name="flame" size={18} />{days}
    </span>
  )
}

export function HomeTop({ onDark }: { onDark?: boolean }) {
  const xp = useApp((s) => s.xp)
  const streak = useApp((s) => s.streak)
  const { topic } = nextLesson(useLessonStates())
  return (
    <header className={'home-top' + (onDark ? ' is-float' : '')}>
      <Avatar kid={KIDS[0]} />
      <div className="home-hello">
        <b>Привет, {KIDS[0].name}!</b>
        <small>Уровень {levelOf(xp)} · {topic.title}</small>
      </div>
      <Streak days={streak} />
      <Xp amount={xp} />
    </header>
  )
}

// "Alone together": the child sees who is learning now, without chat, scores or errors.
// The count of all BilimQuest students online moves a little, like a live number.
// «Айдана», «Айдана и Алина», «Айдана, Алина и ещё 2».
function names(list: string[]) {
  if (list.length <= 2) return list.join(' и ')
  return `${list[0]}, ${list[1]} и ещё ${list.length - 2}`
}

// The number lives outside the block, so it does not jump when the child comes back to the screen.
let online = 37

export function ClassNow() {
  const others = KIDS.filter((k) => k.online && !k.me)
  const [all, setAll] = useState(online)
  useEffect(() => {
    const id = setInterval(() => {
      online = Math.max(34, Math.min(41, online + (Math.random() < 0.5 ? -1 : 1)))
      setAll(online)
    }, 4000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="class-now">
      <div className="stack">
        {others.slice(0, 3).map((k) => <Avatar key={k.name} kid={k} />)}
      </div>
      <div>
        <b>{others.length ? `Сейчас учатся ${names(others.map((k) => k.name))}` : 'Из класса сейчас никого нет'}</b>
        <small><span className="live-dot" />{all} учеников на острове</small>
      </div>
    </div>
  )
}

export function QuestCard() {
  const quest = useApp((s) => s.quest)
  return (
    <div className="card quest">
      <div className="card-row"><Icon name="users" size={18} /><b>Квест класса на неделю</b><span className="t-small">{quest} из {QUEST_GOAL}</span></div>
      <Progress value={quest / QUEST_GOAL} />
      <p className="t-small">Решайте миссии всем классом. На {QUEST_GOAL} учитель откроет на уроке игру-викторину «Битва знатоков».</p>
    </div>
  )
}
