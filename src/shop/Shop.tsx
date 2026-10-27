import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, useHash } from '../app/router'
import { Sheet } from '../app/Sheet'
import { sfx } from '../app/sfx'
import { ownsItem, useApp } from '../app/store'
import { CoinMark, Icon, Progress } from '../components'
import { CHARACTERS, DESK_ITEMS, PRIZES, coinsWord, figureOf, portraitOf, type Item, type ItemKind } from './catalog'
import { PrizeArt } from './prizes'
import './shop.css'

const SECTIONS: { id: ItemKind; chip: string; title: string; note: string }[] = [
  { id: 'desk', chip: 'Для парты', title: 'Для парты', note: 'Вещи появятся на твоей парте в классе.' },
  { id: 'character', chip: 'Персонаж', title: 'Персонаж', note: 'Так тебя видят в классе и в приложении.' },
  { id: 'prize', chip: 'Призы', title: 'Настоящие призы', note: 'Заказ заберёшь у ментора в офисе.' },
]
const KIND_LABEL: Record<ItemKind, string> = { desk: 'Для парты', character: 'Персонаж', prize: 'Настоящий приз' }

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// Moves a shown number to a new value, so a purchase reads as coins leaving the balance.
function useCountTo(value: number, ms = 350) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    if (start === value) return
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = reduceMotion() ? 1 : Math.min(1, (t - t0) / ms)
      const v = Math.round(start + (value - start) * (1 - Math.pow(1 - k, 3)))
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

function Balance({ coins }: { coins: number }) {
  const shown = useCountTo(coins)
  const prev = useRef(coins)
  const [spent, setSpent] = useState<{ n: number; at: number } | null>(null)
  useEffect(() => {
    if (coins < prev.current) setSpent({ n: prev.current - coins, at: performance.now() })
    prev.current = coins
  }, [coins])
  return (
    <span className="shop-balance" role="status" aria-label={`У тебя ${coins} ${coinsWord(coins)}`}>
      <CoinMark size={22} />
      <b>{shown}</b>
      {spent && <i key={spent.at} className="shop-spent" aria-hidden>−{spent.n}</i>}
    </span>
  )
}

function Price({ n }: { n: number }) {
  return <span className="shop-price"><CoinMark size={16} />{n}</span>
}

function Tag({ on, children }: { on?: boolean; children: string }) {
  return <span className={'shop-tag' + (on ? ' is-on' : '')}><Icon name="check" size={16} />{children}</span>
}

function DeskCard({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const owned = useApp((s) => ownsItem(s, item.id))
  const onDesk = useApp((s) => s.desk.includes(item.id))
  return (
    <button className={'shop-card' + (onDesk ? ' is-on' : '')} onClick={onOpen}>
      <span className="shop-pic"><img src={`/shop/${item.id}.png`} alt="" /></span>
      <b>{item.name}</b>
      {onDesk ? <Tag on>На парте</Tag> : owned ? <Tag>Куплено</Tag> : <Price n={item.price} />}
    </button>
  )
}

function CharacterCard({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const owned = useApp((s) => ownsItem(s, item.id))
  const chosen = useApp((s) => s.character === item.id)
  return (
    <button className={'shop-card shop-char' + (chosen ? ' is-on' : '')} onClick={onOpen} aria-label={item.name}>
      <span className="shop-pic">
        <img src={figureOf(item.id)} alt="" />
        {chosen && <span className="shop-check"><Icon name="check" size={16} /></span>}
      </span>
      <b>{item.name}</b>
      {chosen ? <Tag on>Выбран</Tag> : owned ? <span className="shop-tag">{item.price ? 'Куплено' : 'Бесплатно'}</span> : <Price n={item.price} />}
    </button>
  )
}

function PrizeCard({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const coins = useApp((s) => s.coins)
  const ordered = useApp((s) => s.orders.some((o) => o.prize === item.id))
  return (
    <button className="shop-prize" onClick={onOpen}>
      <span className="shop-prize-art"><PrizeArt id={item.id} /></span>
      <span className="shop-prize-body">
        <span className="shop-prize-top"><b>{item.name}</b><Price n={item.price} /></span>
        <small>{item.text}</small>
        {ordered
          ? <span className="shop-prize-goal"><Tag on>Заказано, ждёт в офисе</Tag></span>
          : (
            <span className="shop-prize-goal">
              <Progress value={Math.min(1, coins / item.price)} />
              <i>{coins >= item.price ? 'Хватает' : <>Ещё {item.price - coins}<CoinMark size={12} /></>}</i>
            </span>
          )}
      </span>
    </button>
  )
}

function Hero({ item, done, pop }: { item: Item; done: boolean; pop: boolean }) {
  return (
    <div className={'shop-hero is-' + item.kind}>
      {item.kind === 'desk' && <img src={`/shop/${item.id}.png`} alt="" />}
      {item.kind === 'character' && (
        <>
          <img src={figureOf(item.id)} alt="" />
          <span className="shop-hero-face"><img src={portraitOf(item.id)} alt="" /><small>Аватар</small></span>
        </>
      )}
      {item.kind === 'prize' && <span className="shop-hero-art"><PrizeArt id={item.id} /></span>}
      {done && <span className={'shop-done' + (pop ? ' is-pop' : '')}><Icon name="check" size={20} /></span>}
    </div>
  )
}

// The purchase sheet: a large picture, one line, the price and one main action for each state.
function BuySheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const coins = useApp((s) => s.coins)
  const owned = useApp((s) => ownsItem(s, item.id))
  const onDesk = useApp((s) => s.desk.includes(item.id))
  const chosen = useApp((s) => s.character === item.id)
  const order = useApp((s) => s.orders.find((o) => o.prize === item.id))
  const { buy, putOnDesk, takeFromDesk, chooseCharacter, set } = useApp.getState()
  const [bought, setBought] = useState(false)
  const shown = useCountTo(coins)
  const x = useRef<HTMLButtonElement>(null)
  const readyAt = useRef(0)

  useEffect(() => { readyAt.current = performance.now() + 300 }, [])

  // An action changes the buttons under the finger. Taps right after the sheet opens or changes are ignored,
  // so a double tap cannot skip the success moment; keyboard focus stays in the sheet.
  const act = (fn: () => void) => () => {
    if (performance.now() < readyAt.current) return
    fn()
    readyAt.current = performance.now() + 400
    requestAnimationFrame(() => {
      const sheet = x.current?.closest<HTMLElement>('.sh')
      if (!sheet?.contains(document.activeElement)) sheet?.focus({ preventScroll: true })
    })
  }

  const pay = act(() => {
    if (!buy(item.id)) return
    sfx('coin')
    setBought(true)
  })
  const toRoom = act(() => { set({ home: 'room' }); navigate('/') })

  const has = item.kind === 'prize' ? !!order : owned
  const missing = item.price - coins
  const free = item.kind === 'character' && item.price === 0

  let status: ReactNode = null
  let actions: (close: () => void) => ReactNode
  if (!has) {
    if (missing > 0) {
      status = (
        <div className="shop-short">
          <div className="shop-short-row"><b>Не хватает {missing} {coinsWord(missing)}</b><span>{coins} из {item.price}</span></div>
          <Progress value={coins / item.price} />
          <p>Кодкоины дают за задания в уроках: до 5 за каждое.</p>
        </div>
      )
    } else {
      status = <p className="shop-wallet">У тебя <b><CoinMark size={16} />{shown}</b>. После покупки останется {coins - item.price}.</p>
    }
    actions = () => (
      <button className="btn btn-block" disabled={missing > 0} onClick={pay}>
        Купить за <CoinMark size={18} />{item.price}
      </button>
    )
  } else if (item.kind === 'prize') {
    status = (
      <div className="shop-order">
        <Icon name="building" size={20} />
        <div><b>Заказ №{order!.no}</b><span>Забери у ментора в офисе</span></div>
      </div>
    )
    actions = (close) => (
      <>
        <button className="btn btn-block" onClick={act(close)}>Готово</button>
        <button className="btn btn-ghost btn-block" onClick={act(() => navigate('/profile#orders'))}>Мои заказы</button>
      </>
    )
  } else if (item.kind === 'desk') {
    status = onDesk
      ? <div className="shop-state is-on"><Icon name="check" size={18} />Стоит на твоей парте в классе</div>
      : bought ? null : <div className="shop-state"><Icon name="check" size={18} />Куплено</div>
    actions = (close) => onDesk
      ? (
        <>
          <button className="btn btn-block" onClick={toRoom}>Посмотреть в классе</button>
          <button className="btn btn-ghost btn-block" onClick={act(() => { sfx('tap'); takeFromDesk(item.id) })}>Убрать с парты</button>
        </>
      )
      : (
        <>
          <button className="btn btn-block" onClick={act(() => { sfx('ok'); putOnDesk(item.id) })}>Поставить на парту</button>
          {bought && <button className="btn btn-ghost btn-block" onClick={act(close)}>Потом</button>}
        </>
      )
  } else {
    status = chosen
      ? <div className="shop-state is-on"><Icon name="check" size={18} />Это ты сейчас</div>
      : bought || free ? null : <div className="shop-state"><Icon name="check" size={18} />Куплено</div>
    actions = (close) => chosen
      ? <button className="btn btn-block" onClick={toRoom}>Посмотреть в классе</button>
      : (
        <>
          <button className="btn btn-block" onClick={act(() => { sfx('ok'); chooseCharacter(item.id) })}>Выбрать</button>
          {bought && <button className="btn btn-ghost btn-block" onClick={act(close)}>Потом</button>}
        </>
      )
  }

  return (
    <Sheet label={item.name} className="shop-sheet" onClose={onClose}>
      {(close) => (
        <>
          <Hero item={item} done={bought || chosen || (has && !free)} pop={bought} />
          <button ref={x} className="shop-x" aria-label="Закрыть" onClick={close}><Icon name="close" size={20} /></button>
          <div className="shop-kind">{KIND_LABEL[item.kind]}{free && ' · бесплатно'}</div>
          <h3>{item.name}</h3>
          <p className="shop-text">{item.text}</p>
          {bought && (
            <div className="shop-ok" role="status">
              <span><Icon name="check" size={18} /></span>
              <div>
                <b>{item.kind === 'prize' ? 'Заказ оформлен' : 'Куплено'}</b>
                <small>Осталось <CoinMark size={14} />{shown}</small>
              </div>
            </div>
          )}
          {status}
          <div className="shop-actions">{actions(close)}</div>
        </>
      )}
    </Sheet>
  )
}

export function Shop() {
  const coins = useApp((s) => s.coins)
  const [open, setOpen] = useState<Item | null>(null)
  const [active, setActive] = useState<ItemKind>('desk')
  const [stuck, setStuck] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  // /shop#character opens on that section (the profile links there to change the character).
  const hash = useHash()
  useEffect(() => {
    const id = hash.slice(1)
    if (SECTIONS.some((s) => s.id === id)) document.getElementById('shop-' + id)?.scrollIntoView()
  }, [hash])

  // The chip of the section under the header is active; at the end of the page the last one is.
  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    setStuck(el.scrollTop > 4)
    const line = el.getBoundingClientRect().top + 150
    let cur = SECTIONS[0].id
    for (const s of SECTIONS) {
      const top = document.getElementById('shop-' + s.id)?.getBoundingClientRect().top ?? Infinity
      if (top <= line) cur = s.id
    }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) cur = SECTIONS[SECTIONS.length - 1].id
    setActive(cur)
  }

  const jump = (id: ItemKind) => {
    sfx('tap')
    document.getElementById('shop-' + id)?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' })
  }
  const pick = (item: Item) => { sfx('tap'); setOpen(item) }

  return (
    <div className="shop">
      <div className="shop-scroll" ref={scroller} onScroll={onScroll} inert={!!open}>
        <div className={'shop-top' + (stuck ? ' is-stuck' : '')}>
          <header className="shop-head">
            <h1>Магазин</h1>
            <Balance coins={coins} />
          </header>
          <nav className="shop-nav" aria-label="Разделы магазина">
            {SECTIONS.map((s) => (
              <button key={s.id} className={'shop-chip' + (active === s.id ? ' is-on' : '')} aria-current={active === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>
                {s.chip}
              </button>
            ))}
          </nav>
        </div>

        <p className="shop-earn"><CoinMark size={18} />Кодкоины дают только за задания в уроках: 5 за верный ответ с первой попытки, 2 со второй.</p>

        {SECTIONS.map((s) => (
          <section key={s.id} id={'shop-' + s.id} className="shop-sec" aria-labelledby={'shop-h-' + s.id}>
            <h2 id={'shop-h-' + s.id}>{s.title}</h2>
            <p>{s.note}</p>
            {s.id === 'desk' && <div className="shop-grid">{DESK_ITEMS.map((i) => <DeskCard key={i.id} item={i} onOpen={() => pick(i)} />)}</div>}
            {s.id === 'character' && <div className="shop-grid is-3">{CHARACTERS.map((i) => <CharacterCard key={i.id} item={i} onOpen={() => pick(i)} />)}</div>}
            {s.id === 'prize' && <div className="shop-prizes">{PRIZES.map((i) => <PrizeCard key={i.id} item={i} onOpen={() => pick(i)} />)}</div>}
          </section>
        ))}
      </div>
      {open && <BuySheet key={open.id} item={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
