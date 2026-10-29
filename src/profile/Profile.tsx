import { useState, type CSSProperties } from 'react'
import { DemoControls } from '../app/DemoPanel'
import { navigate } from '../app/router'
import { useApp } from '../app/store'
import { Avatar, Icon, KIDS, XpMark } from '../components'
import { ACHIEVEMENTS } from '../rewards/achievements'
import { levelOf } from '../rewards/catalog'
import { LevelCard } from '../rewards/Rewards'
import './profile.css'

// The subjects of the monthly checkup, 0 to 100: the September checkup and the October one. Scripted.
const SKILLS: [string, number, number][] = [
  ['Математика', 52, 68],
  ['Информатика', 35, 61],
  ['Русский язык', 58, 64],
  ['История', 40, 55],
  ['География', 46, 57],
  ['Биология', 44, 50],
]

// The child's own page: who they are, their level, how their subjects grew, what they achieved.
export function Profile({ demo }: { demo: boolean }) {
  const streak = useApp((s) => s.streak)
  const lessons = useApp((s) => Object.keys(s.done).length)
  const xp = useApp((s) => s.xp)
  const got = useApp((s) => ACHIEVEMENTS.filter((a) => a.test(s)).map((a) => a.id).join())
  const me = KIDS[0]
  const [scrolled, setScrolled] = useState(false)

  return (
    <div className="prof">
      <div className={'prof-scroll' + (scrolled ? ' is-scrolled' : '')} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        <header className="prof-head">
          <button className="prof-face" onClick={() => navigate('/rewards#character')} aria-label="Сменить персонажа">
            <Avatar kid={me} />
          </button>
          <h1>{me.name}</h1>
          <p>Уровень {levelOf(xp)} · на острове с сентября</p>
          <button className="btn btn-tint btn-sm" onClick={() => navigate('/rewards#character')}>Сменить персонажа</button>
        </header>

        <div className="prof-stats">
          <div><span className="prof-num"><span className="prof-flame"><Icon name="flame" size={20} /></span>{streak}</span><small>дней подряд</small></div>
          <div><span className="prof-num"><Icon name="check" size={20} />{lessons}</span><small>уроков пройдено</small></div>
          <div><span className="prof-num"><XpMark size={20} />{xp}</span><small>XP всего</small></div>
        </div>

        <section className="prof-card" aria-labelledby="prof-skills">
          <div className="prof-card-head">
            <h2 id="prof-skills">Навыки</h2>
            <span className="prof-legend" aria-hidden><i className="is-was" />Было <i className="is-now" />Стало</span>
          </div>
          <p className="prof-note">Раз в месяц ты проходишь короткую проверку по предметам. Было: сентябрь, стало: октябрь.</p>
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

        <section className="prof-sec" aria-labelledby="prof-ach">
          <h2 id="prof-ach">Достижения</h2>
          <LevelCard />
          <ul className="prof-achs">
            {ACHIEVEMENTS.map((a) => {
              const on = got.split(',').includes(a.id)
              return (
                <li key={a.id} className={on ? 'is-got' : ''} title={a.text}>
                  <span><Icon name={on ? a.icon : 'lock'} size={20} /></span>
                  <small>{a.title}</small>
                </li>
              )
            })}
          </ul>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/rewards')}>Все награды</button>
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
