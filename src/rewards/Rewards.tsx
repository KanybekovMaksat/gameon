import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, useHash } from '../app/router'
import { Sheet } from '../app/Sheet'
import { sfx } from '../app/sfx'
import { ownsItem, useApp } from '../app/store'
import { Icon, Progress } from '../components'
import { ACHIEVEMENTS, type Achievement } from './achievements'
import { CHARACTERS, ITEMS, LEVEL_XP, figureOf, levelOf, levelShare, portraitOf, type Item } from './catalog'
import './rewards.css'

const SECTIONS = [
  { id: 'achievements', chip: 'Достижения', title: 'Достижения', note: 'За каждое достижение ты получаешь вещь на свою парту в классе.' },
  { id: 'character', chip: 'Персонаж', title: 'Персонаж', note: 'Новые персонажи открываются с новыми уровнями.' },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// The level card: the level, XP toward the next one.
export function LevelCard() {
  const xp = useApp((s) => s.xp)
  const level = levelOf(xp)
  const left = LEVEL_XP - (xp % LEVEL_XP)
  return (
    <div className="rw-level" role="status" aria-label={`Уровень ${level}, ${xp} XP`}>
      <span className="rw-level-badge"><Icon name="star" size={18} /><b>{level}</b></span>
      <div className="rw-level-body">
        <div className="rw-level-row"><b>Уровень {level}</b><span>{xp} XP</span></div>
        <Progress value={levelShare(xp)} />
        <small>До уровня {level + 1} ещё {left} XP</small>
      </div>
    </div>
  )
}

function Tag({ on, children }: { on?: boolean; children: string }) {
  return <span className={'rw-tag' + (on ? ' is-on' : '')}><Icon name={on ? 'check' : 'lock'} size={16} />{children}</span>
}

function AchievementRow({ a, onOpen }: { a: Achievement; onOpen: () => void }) {
  const got = useApp((s) => a.test(s))
  const onDesk = useApp((s) => s.desk.includes(a.item))
  return (
    <button className={'rw-ach' + (got ? ' is-got' : '')} onClick={onOpen}>
      <span className="rw-ach-icon"><Icon name={got ? a.icon : 'lock'} size={22} /></span>
      <span className="rw-ach-body">
        <b>{a.title}</b>
        <small>{a.text}</small>
      </span>
      <span className="rw-ach-item"><img src={`/rewards/${a.item}.png`} alt="" />{onDesk && <i><Icon name="check" size={12} /></i>}</span>
    </button>
  )
}

function CharacterCard({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const owned = useApp((s) => ownsItem(s, item.id))
  const chosen = useApp((s) => s.character === item.id)
  return (
    <button className={'rw-card rw-char' + (chosen ? ' is-on' : '') + (owned ? '' : ' is-locked')} onClick={onOpen} aria-label={item.name}>
      <span className="rw-pic">
        <img src={figureOf(item.id)} alt="" />
        {chosen && <span className="rw-check"><Icon name="check" size={16} /></span>}
      </span>
      <b>{item.name}</b>
      {chosen ? <Tag on>Выбран</Tag> : owned ? <span className="rw-tag">Открыт</span> : <Tag>{`Уровень ${item.level}`}</Tag>}
    </button>
  )
}

function Hero({ item, done }: { item: Item; done: boolean }) {
  return (
    <div className={'rw-hero is-' + item.kind}>
      {item.kind === 'desk' && <img src={`/rewards/${item.id}.png`} alt="" />}
      {item.kind === 'character' && (
        <>
          <img src={figureOf(item.id)} alt="" />
          <span className="rw-hero-face"><img src={portraitOf(item.id)} alt="" /><small>Аватар</small></span>
        </>
      )}
      {done && <span className="rw-done"><Icon name="check" size={20} /></span>}
    </div>
  )
}

// The sheet of an achievement (with its desk item) or a character: one main action for each state.
function RewardSheet({ item, achievement, onClose }: { item: Item; achievement?: Achievement; onClose: () => void }) {
  const xp = useApp((s) => s.xp)
  const owned = useApp((s) => ownsItem(s, item.id))
  const onDesk = useApp((s) => s.desk.includes(item.id))
  const chosen = useApp((s) => s.character === item.id)
  const { putOnDesk, takeFromDesk, chooseCharacter, set } = useApp.getState()
  const readyAt = useRef(0)
  useEffect(() => { readyAt.current = performance.now() + 300 }, [])

  // Taps right after the sheet opens or changes are ignored, so a double tap cannot skip a state.
  const act = (fn: () => void) => () => {
    if (performance.now() < readyAt.current) return
    fn()
    readyAt.current = performance.now() + 400
  }
  const toRoom = act(() => { set({ home: 'room' }); navigate('/') })

  let status: ReactNode = null
  let actions: (close: () => void) => ReactNode
  if (!owned) {
    status = item.kind === 'character'
      ? (
        <div className="rw-short">
          <div className="rw-short-row"><b>Откроется на уровне {item.level}</b><span>сейчас {levelOf(xp)}</span></div>
          <Progress value={Math.min(1, xp / (((item.level ?? 1) - 1) * LEVEL_XP))} />
          <p>XP дают за миссии: 10 за верный ответ с первой попытки, 5 со второй.</p>
        </div>
      )
      : <div className="rw-state"><Icon name="lock" size={18} />Получи достижение, и вещь появится на парте</div>
    actions = (close) => <button className="btn btn-block" onClick={act(close)}>Понятно</button>
  } else if (item.kind === 'desk') {
    status = onDesk
      ? <div className="rw-state is-on"><Icon name="check" size={18} />Стоит на твоей парте в классе</div>
      : <div className="rw-state is-on"><Icon name="trophy" size={18} />Достижение получено</div>
    actions = () => onDesk
      ? (
        <>
          <button className="btn btn-block" onClick={toRoom}>Посмотреть в классе</button>
          <button className="btn btn-ghost btn-block" onClick={act(() => { sfx('tap'); takeFromDesk(item.id) })}>Убрать с парты</button>
        </>
      )
      : <button className="btn btn-block" onClick={act(() => { sfx('ok'); putOnDesk(item.id) })}>Поставить на парту</button>
  } else {
    status = chosen ? <div className="rw-state is-on"><Icon name="check" size={18} />Это ты сейчас</div> : null
    actions = () => chosen
      ? <button className="btn btn-block" onClick={toRoom}>Посмотреть в классе</button>
      : <button className="btn btn-block" onClick={act(() => { sfx('ok'); chooseCharacter(item.id) })}>Выбрать</button>
  }

  return (
    <Sheet label={achievement?.title ?? item.name} className="rw-sheet" onClose={onClose}>
      {(close) => (
        <>
          <Hero item={item} done={owned && (item.kind === 'desk' || chosen)} />
          <button className="rw-x" aria-label="Закрыть" onClick={close}><Icon name="close" size={20} /></button>
          <div className="rw-kind">{achievement ? `Достижение · ${achievement.title}` : 'Персонаж'}</div>
          <h3>{item.name}</h3>
          <p className="rw-text">{achievement ? `${achievement.text} Награда: ${item.name.toLowerCase()} на парту.` : item.text}</p>
          {status}
          <div className="rw-actions">{actions(close)}</div>
        </>
      )}
    </Sheet>
  )
}

// «Награды»: the level, achievements with their desk items, and the characters the levels open.
export function Rewards() {
  const got = useApp((s) => ACHIEVEMENTS.filter((a) => a.test(s)).length)
  const [open, setOpen] = useState<{ item: Item; achievement?: Achievement } | null>(null)
  const [active, setActive] = useState<SectionId>('achievements')
  const [stuck, setStuck] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  // /rewards#character opens on that section (the profile links there to change the character).
  const hash = useHash()
  useEffect(() => {
    const id = hash.slice(1)
    if (SECTIONS.some((s) => s.id === id)) document.getElementById('rw-' + id)?.scrollIntoView()
  }, [hash])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    setStuck(el.scrollTop > 4)
    const line = el.getBoundingClientRect().top + 150
    let cur: SectionId = SECTIONS[0].id
    for (const s of SECTIONS) {
      const top = document.getElementById('rw-' + s.id)?.getBoundingClientRect().top ?? Infinity
      if (top <= line) cur = s.id
    }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) cur = SECTIONS[SECTIONS.length - 1].id
    setActive(cur)
  }

  const jump = (id: SectionId) => {
    sfx('tap')
    document.getElementById('rw-' + id)?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className="rw">
      <div className="rw-scroll" ref={scroller} onScroll={onScroll} inert={!!open}>
        <div className={'rw-top' + (stuck ? ' is-stuck' : '')}>
          <header className="rw-head">
            <h1>Награды</h1>
            <span className="rw-count"><Icon name="trophy" size={18} />{got} из {ACHIEVEMENTS.length}</span>
          </header>
          <nav className="rw-nav" aria-label="Разделы наград">
            {SECTIONS.map((s) => (
              <button key={s.id} className={'rw-chip' + (active === s.id ? ' is-on' : '')} aria-current={active === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>
                {s.chip}
              </button>
            ))}
          </nav>
        </div>

        <LevelCard />

        {SECTIONS.map((s) => (
          <section key={s.id} id={'rw-' + s.id} className="rw-sec" aria-labelledby={'rw-h-' + s.id}>
            <h2 id={'rw-h-' + s.id}>{s.title}</h2>
            <p>{s.note}</p>
            {s.id === 'achievements' && (
              <div className="rw-achs">
                {ACHIEVEMENTS.map((a) => <AchievementRow key={a.id} a={a} onOpen={() => { sfx('tap'); setOpen({ item: ITEMS[a.item], achievement: a }) }} />)}
              </div>
            )}
            {s.id === 'character' && (
              <div className="rw-grid is-3">
                {CHARACTERS.map((i) => <CharacterCard key={i.id} item={i} onOpen={() => { sfx('tap'); setOpen({ item: i }) }} />)}
              </div>
            )}
          </section>
        ))}
      </div>
      {open && <RewardSheet key={open.item.id} item={open.item} achievement={open.achievement} onClose={() => setOpen(null)} />}
    </div>
  )
}
