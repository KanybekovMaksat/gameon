import { useEffect, useState } from 'react'
import { TOPICS } from '../content'
import { Icon } from '../components'
import { playScene } from '../world/island/bus'
import { PhoneLink } from './Qr'
import { navigate } from './router'
import { useApp, type HomeVersion, type SessionVersion } from './store'

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string, string][]; onChange: (v: T) => void }) {
  return (
    <div className="demo-seg" role="radiogroup">
      {options.map(([v, label, note]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>
          <b>{label}</b>
          <small>{note}</small>
        </button>
      ))}
    </div>
  )
}

// A reset needs a second click within a few seconds: one stray click must not wipe the demo.
function ResetButton({ onReset }: { onReset: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button className={armed ? 'is-armed' : ''} onClick={() => { if (armed) { setArmed(false); onReset() } else setArmed(true) }}>
      <Icon name="redo" size={16} />{armed ? 'Нажми ещё раз, чтобы сбросить' : 'Сбросить прогресс'}
    </button>
  )
}

// The presenter's controls: versions to compare, jumps, and a reset. The panel beside the phone and the
// profile on a phone both show them. `lastTitle` names the last group where «Демо» is already the section title.
export function DemoControls({ lastTitle = 'Демо' }: { lastTitle?: string }) {
  const s = useApp()
  const officeTopics = TOPICS.filter((t) => t.office)
  return (
    <>
      <div className="demo-group">
        <h4>Главный экран</h4>
        <Seg<HomeVersion>
          value={s.home}
          onChange={(home) => { s.set({ home }); navigate('/') }}
          options={[['world', 'Остров', '3D-остров знаний'], ['map', 'Карта', 'Путь по предметам'], ['room', 'Класс', 'Комната с классом']]}
        />
      </div>

      <div className="demo-group">
        <h4>Урок</h4>
        <Seg<SessionVersion>
          value={s.session}
          onChange={(session) => s.set({ session })}
          options={[['explain', 'Сначала объяснение', 'Потом задания'], ['try', 'Сначала попытка', 'Потом объяснение']]}
        />
        <p className="demo-note">Версия урока применяется, когда урок начинается заново.</p>
      </div>

      {officeTopics.length > 0 && (
        <div className="demo-group">
          <h4>Учитель и остров</h4>
          {officeTopics.map((t) => (
            <label key={t.id} className="demo-check">
              <input type="checkbox" checked={!!s.officeDone[t.id]} onChange={() => s.toggleOffice(t.id)} />
              Урок с учителем по предмету «{t.title}» прошёл
            </label>
          ))}
        </div>
      )}

      <div className="demo-group">
        <h4>{lastTitle}</h4>
        <label className="demo-check">
          <input type="checkbox" checked={s.unlockAll} onChange={(e) => s.set({ unlockAll: e.target.checked })} />
          Открыть все уроки
        </label>
        <label className="demo-check">
          <input type="checkbox" checked={s.sound} onChange={(e) => s.set({ sound: e.target.checked })} />
          Звук
        </label>
        <div className="demo-links">
          <a href="/teacher" target="_blank" rel="noreferrer"><Icon name="users" size={16} />Кабинет учителя</a>
          <ResetButton onReset={() => { s.reset(); navigate('/') }} />
          <button onClick={() => navigate('/lab/loops')}><Icon name="loop" size={16} />Информатика: формы миссий</button>
          <a href="/design" target="_blank" rel="noreferrer"><Icon name="spark" size={16} />Дизайн-система</a>
        </div>
      </div>
    </>
  )
}

type Scene = { title: string; note: string; go: () => void }

// The order of the talk. Each step sets up the screen it needs, so the presenter clicks and speaks.
function useScenes(): Scene[] {
  const s = useApp()
  const open = (path: string) => navigate(path)
  return [
    // Island scenes set the island up from any state: the class room closes, walks and cards end.
    { title: 'Остров знаний', note: 'Пролёт камеры над островом, здания предметов.', go: () => { s.set({ home: 'world' }); playScene('world'); open('/') } },
    { title: 'Карта предметов', note: 'Одноклассники у своих уроков, квест класса.', go: () => { s.set({ home: 'map' }); open('/') } },
    { title: 'Миссия: сначала попытка', note: 'Сначала пробует сам, потом объяснение.', go: () => { s.set({ session: 'try' }); open('/lesson/loops-1') } },
    { title: 'Робик помогает', note: 'Ответь неверно и нажми «Подсказка».', go: () => { s.set({ session: 'explain' }); open('/lesson/loops-1?at=gap') } },
    { title: 'Научи Робика', note: 'Робик решает задачу по словам ребёнка.', go: () => open('/lesson/loops-1?at=teach') },
    { title: 'Кабинет учителя', note: 'Новая вкладка, обновляется вживую.', go: () => window.open('/teacher', '_blank') },
    { title: 'Класс', note: 'Ребёнок заходит в школу, класс за партами.', go: () => { s.set({ home: 'world' }); playScene('class'); open('/') } },
    { title: 'XP и достижения', note: 'Уровень, достижения и вещи на парту.', go: () => open('/rewards') },
    { title: 'Учитель и остров', note: 'Информатика пройдена, урок с учителем открывает «Русский язык».', go: () => {
      // Informatics is done on the island and the lesson with the teacher took place: «Русский язык» opens.
      // The island shows the child at the gate as it opens.
      useApp.setState((st) => ({ done: { ...st.done, 'loops-1': true, 'loops-2': true }, officeDone: { ...st.officeDone, russian: true } }))
      s.set({ home: 'world' })
      playScene('gate')
      open('/')
    } },
    { title: 'Формы миссий', note: 'Шесть форм задач по информатике.', go: () => open('/lab/loops') },
  ]
}

function Scenes() {
  const scenes = useScenes()
  const [cur, setCur] = useState<number | null>(null)
  return (
    <ol className="scenes">
      {scenes.map((sc, i) => (
        <li key={sc.title}>
          <button className={cur === i ? 'is-on' : ''} onClick={() => { setCur(i); sc.go() }}>
            <i>{i + 1}</i>
            <span><b>{sc.title}</b><small>{sc.note}</small></span>
          </button>
        </li>
      ))}
    </ol>
  )
}

export function DemoPanel() {
  const [tab, setTab] = useState<'show' | 'settings'>('show')
  return (
    <aside className="demo">
      <div className="demo-brand">
        <img src="/logo-gradient.png" alt="" />
        <div>
          <b>BilimQuest</b>
          <small>Преврати учёбу в приключение</small>
        </div>
      </div>
      <div className="demo-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'show'} onClick={() => setTab('show')}>Сценарий показа</button>
        <button role="tab" aria-selected={tab === 'settings'} onClick={() => setTab('settings')}>Настройки</button>
      </div>
      {/* The tab scrolls on a short screen; the phone link stays in view at the bottom. */}
      <div className="demo-pane">{tab === 'show' ? <Scenes /> : <DemoControls />}</div>
      <PhoneLink />
    </aside>
  )
}
