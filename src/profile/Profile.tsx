import { useEffect, useState, type CSSProperties } from 'react'
import { DemoControls } from '../app/DemoPanel'
import { navigate, useHash } from '../app/router'
import { useApp } from '../app/store'
import { Avatar, CoinMark, Icon, KIDS } from '../components'
import { ITEMS, spentOf } from '../shop/catalog'
import { PrizeArt } from '../shop/prizes'
import './profile.css'

// The six skills of the monthly checkup, 0 to 100: the August checkup and the September one. Scripted.
// Four thinking skills, then the two literacies the checkup tests.
const SKILLS: [string, number, number][] = [
  ['Логика', 42, 58],
  ['Алгоритмы', 35, 61],
  ['Внимательность', 50, 57],
  ['Работа с ИИ', 20, 38],
  ['Компьютерная грамотность', 46, 55],
  ['Цифровая грамотность', 44, 52],
]

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

// The child's own page: who they are, what they did, how their skills grew, what they ordered.
export function Profile({ demo }: { demo: boolean }) {
  const streak = useApp((s) => s.streak)
  const lessons = useApp((s) => Object.keys(s.done).length)
  const coins = useApp((s) => s.coins)
  const owned = useApp((s) => s.owned)
  const orders = useApp((s) => s.orders)
  const earned = coins + spentOf(owned, orders)
  const me = KIDS[0]
  const [scrolled, setScrolled] = useState(false)

  // /profile#orders opens on the orders (the shop links there after a prize order).
  const hash = useHash()
  useEffect(() => {
    if (hash === '#orders') document.getElementById('prof-orders')?.scrollIntoView()
  }, [hash])

  return (
    <div className="prof">
      <div className={'prof-scroll' + (scrolled ? ' is-scrolled' : '')} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        <header className="prof-head">
          <button className="prof-face" onClick={() => navigate('/shop#character')} aria-label="Сменить персонажа">
            <Avatar kid={me} />
          </button>
          <h1>{me.name}</h1>
          <p>Уровень 1 · в Codify с сентября</p>
          <button className="btn btn-tint btn-sm" onClick={() => navigate('/shop#character')}>Сменить персонажа</button>
        </header>

        <div className="prof-stats">
          <div><span className="prof-num"><span className="prof-flame"><Icon name="flame" size={20} /></span>{streak}</span><small>дней подряд</small></div>
          <div><span className="prof-num"><Icon name="check" size={20} />{lessons}</span><small>уроков пройдено</small></div>
          <div><span className="prof-num"><CoinMark size={20} />{earned}</span><small>заработано</small></div>
        </div>

        <section className="prof-card" aria-labelledby="prof-skills">
          <div className="prof-card-head">
            <h2 id="prof-skills">Навыки</h2>
            <span className="prof-legend" aria-hidden><i className="is-was" />Было <i className="is-now" />Стало</span>
          </div>
          <p className="prof-note">Раз в месяц ты проходишь короткую проверку. Было: август, стало: сентябрь.</p>
          <ul className="prof-skills">
            {SKILLS.map(([name, was, now], i) => (
              <li key={name} style={{ '--i': i } as CSSProperties}>
                <div className="prof-skill-top">
                  <b>{name}</b>
                  <span aria-label={`было ${was}, стало ${now} из 100`}>{was} → <strong>{now}</strong></span>
                  <em>+{now - was}</em>
                </div>
                <div className="prof-bar is-was"><i style={{ width: `${was}%` }} /></div>
                <div className="prof-bar is-now"><i style={{ width: `${now}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="prof-sec" aria-labelledby="prof-orders">
          <h2 id="prof-orders">Заказы</h2>
          {orders.length === 0 ? (
            <div className="prof-empty">
              <p>Пока нет заказов. За кодкоины можно взять настоящий приз: наклейки, блокнот, футболку.</p>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/shop#prize')}>Посмотреть призы</button>
            </div>
          ) : (
            <ul className="prof-orders">
              {[...orders].reverse().map((o) => (
                <li key={o.no}>
                  <span className="prof-order-art"><PrizeArt id={o.prize} /></span>
                  <div>
                    <b>{ITEMS[o.prize]?.name}</b>
                    <small>Забери у ментора в офисе</small>
                    <span className="prof-order-meta">Заказ №{o.no} · {DATE.format(o.at)}</span>
                  </div>
                  <span className="prof-order-state"><Icon name="building" size={14} />Ждёт</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {demo && (
          <section className="prof-sec prof-demo" aria-labelledby="prof-demo">
            <h2 id="prof-demo">Демо</h2>
            <p className="prof-note">Настройки для показа прототипа. В настоящем приложении их нет.</p>
            <DemoControls lastTitle="Прогресс и звук" />
          </section>
        )}
      </div>
    </div>
  )
}
