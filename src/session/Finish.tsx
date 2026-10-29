import { useEffect, useState } from 'react'
import { leave } from '../app/router'
import { Sheet } from '../app/Sheet'
import { QUEST_GOAL, useApp } from '../app/store'
import { Icon, Progress, XpMark } from '../components'
import type { Lesson, Topic } from '../content/types'
import { levelOf } from '../rewards/catalog'

// Counts a number up from zero; the reward reads as earned, not given.
function useCount(to: number, ms = 700) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return n
}

// Copies without the Clipboard API: on the local network over http it does not exist.
function copyText(text: string) {
  const area = document.createElement('textarea')
  area.value = text
  area.readOnly = true
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  area.remove()
  return ok
}

// Without the system share sheet (http on the local network): the text to copy and links to messengers.
function ShareSheet({ text, onDone, onClose }: { text: string; onDone: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const copy = async () => {
    let ok = false
    try { await navigator.clipboard.writeText(text); ok = true } catch { ok = copyText(text) }
    setCopied(ok)
    if (ok) onDone()
  }
  const q = encodeURIComponent(text)
  return (
    <Sheet label="Отправь задание родителю" className="share" onClose={onClose}>
      <h3>Отправь задание родителю</h3>
      <p className="share-lead">Скопируй текст и вставь его в чат с родителем.</p>
      <p className="share-text selectable">{text}</p>
      <button className={'btn btn-block' + (copied ? ' btn-ok' : '')} onClick={copy}>
        <Icon name={copied ? 'check' : 'share'} size={18} />{copied ? 'Скопировано' : 'Скопировать текст'}
      </button>
      {copied !== null && (
        <p className={'share-status' + (copied ? ' is-ok' : '')} role="status">
          {copied ? 'Текст скопирован. Вставь его в чат с родителем.' : 'Не получилось скопировать. Нажми на текст и держи, чтобы выделить его.'}
        </p>
      )}
      <div className="share-links">
        <a className="btn btn-secondary" href={`https://wa.me/?text=${q}`} target="_blank" rel="noreferrer" onClick={onDone}>WhatsApp</a>
        <a className="btn btn-secondary" href={`https://t.me/share/url?url=${q}`} target="_blank" rel="noreferrer" onClick={onDone}>Telegram</a>
      </div>
    </Sheet>
  )
}

export function Finish({ topic, lesson, stats }: { topic: Topic; lesson: Lesson; stats: { firstTry: number; total: number; xp: number } }) {
  const streak = useApp((s) => s.streak)
  const quest = useApp((s) => s.quest)
  const gained = useCount(stats.xp)
  const total = useApp((s) => s.xp)
  const levelUp = levelOf(total) > levelOf(total - stats.xp)
  const [shared, setShared] = useState(false)
  const [sheet, setSheet] = useState(false)
  const text = `Задание от ребёнка из BilimQuest: ${lesson.parentTask}`

  const share = async () => {
    if (!navigator.share) { setSheet(true); return }
    try {
      await navigator.share({ title: 'Задание для родителя', text })
      setShared(true)
    } catch { /* the child closed the share sheet */ }
  }

  return (
    <div className="finish">
      <div className="finish-body">
        <div className="finish-badge"><Icon name="check" size={44} /></div>
        <div className="finish-kicker">{topic.title}</div>
        <h1 className="finish-title">{levelUp ? `Уровень ${levelOf(total)}!` : 'Миссия выполнена'}</h1>
        <p className="finish-sub">{lesson.title}</p>

        <div className="finish-stats">
          <div><span className="finish-num"><XpMark size={22} />+{gained}</span><small>XP</small></div>
          <div><span className="finish-num">{stats.firstTry} из {stats.total}</span><small>с первой попытки</small></div>
          <div><span className="finish-num"><span className="flame"><Icon name="flame" size={20} /></span>{streak}</span><small>дней подряд</small></div>
        </div>

        <div className="card quest">
          <div className="card-row"><Icon name="users" size={18} /><b>Квест класса</b><span className="t-small">{quest} из {QUEST_GOAL}</span></div>
          <Progress value={quest / QUEST_GOAL} />
          <p className="t-small">Твой вклад: {stats.total} {stats.total === 1 ? 'миссия' : stats.total < 5 ? 'миссии' : 'миссий'}. Когда класс дойдёт до {QUEST_GOAL}, учитель откроет на уроке игру-викторину «Битва знатоков».</p>
        </div>

        {lesson.parentTask && (
          <div className="card parent">
            <div className="card-row"><Icon name="home" size={18} /><b>Задание для родителя</b></div>
            <p className="selectable">{lesson.parentTask}</p>
            <button className="btn btn-secondary btn-sm" onClick={share}><Icon name="share" size={16} />{shared ? 'Отправлено' : 'Отправить родителю'}</button>
          </div>
        )}
      </div>
      <div className="session-foot">
        <button className="btn btn-block" onClick={() => leave()}>Готово</button>
      </div>
      {sheet && <ShareSheet text={text} onDone={() => setShared(true)} onClose={() => setSheet(false)} />}
    </div>
  )
}
