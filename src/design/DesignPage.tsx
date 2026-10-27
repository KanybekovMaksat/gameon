import { lazy, Suspense, useState } from 'react'
import { AiBubble, AiFace, Avatar, Coins, Icon, KIDS, Progress, TopicNode } from '../components'
import { LESSONS } from '../content'
import type { Answer, Exercise } from '../exercises/kit'
import { kindOf } from '../exercises/registry'

const ClassRoom = lazy(() => import('../world/ClassRoom'))

// A standalone card with its own check button, for the exercise section.
function ExerciseCard({ ex }: { ex: Exercise }) {
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [checked, setChecked] = useState(false)
  const [round, setRound] = useState(0)
  const reset = () => { setAnswer(null); setChecked(false); setRound(round + 1) }
  const { Component } = kindOf(ex)
  const ok = answer?.correct === true
  return (
    <div className="panel ex">
      <div key={round}><Component data={ex.data} checked={checked} onAnswer={setAnswer} /></div>
      {checked && (
        <div className={'feedback ' + (ok ? 'is-ok' : 'is-bad')}>
          <Icon name={ok ? 'check' : 'x'} size={18} />
          {ok ? 'Верно! +5 кодкоинов' : 'Не совсем'}
        </div>
      )}
      <div className="ex-card-foot">
        {checked
          ? <button className="btn btn-secondary btn-block" onClick={reset}>Заново</button>
          : <button className="btn btn-block" disabled={!answer || answer.correct === null} onClick={() => setChecked(true)}>Проверить</button>}
      </div>
    </div>
  )
}

// One exercise of each kind, in the order the kinds appear on the path.
const SAMPLES: Exercise[] = LESSONS.flatMap(({ lesson }) => lesson.practice)
  .filter((ex, i, all) => all.findIndex((x) => x.kind === ex.kind) === i)

const COLORS: [string, string][] = [
  ['Текст и кнопки', '#0a1028'],
  ['Синий: выбор, прогресс', '#246fff'],
  ['Синий для текста и кнопок', '#1f66e5'],
  ['Голубой', '#00c4fa'],
  ['Фон', '#ffffff'],
  ['Поверхность', '#f4f5f7'],
  ['Рамка', '#e6e7eb'],
  ['Верно', '#15803d'],
  ['Ошибка', '#f3c34b'],
  ['Кодкоин', '#ffc53d'],
]

export default function DesignPage() {
  const [picked, setPicked] = useState<string | null>(null)

  const kid = KIDS.find((k) => k.name === picked)

  return (
    <>
      <div className="page">
        <header className="header">
          <img src="/logo-gradient.png" alt="Codify" />
          <div>
            <h1>Дизайн-система приложения</h1>
            <p>Принята 27 сентября</p>
          </div>
        </header>
        <p className="intro">
          Чистый стиль по мотивам Brilliant: почти монохромный, объём только у главной кнопки. Персонажи из набора Kenney Mini Characters.
        </p>

        <section className="section">
          <h2>Цвета</h2>
          <p className="lead">Бренд с codifylab.com. Градиент остаётся для знаков бренда, в интерфейсе его нет.</p>
          <div className="panel colors">
            <div className="brand-bar" />
              <div className="brand-caption">Градиент бренда: #00c4fa → #246fff</div>
            <div className="color-list">
              {COLORS.map(([name, hex]) => (
                <div key={hex} className="color"><i style={{ background: hex }} /><div>{name}<code>{hex}</code></div></div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Шрифты</h2>
          <p className="lead">Inter, как на сайте. Код набран JetBrains Mono.</p>
          <div className="panel">
            <div className="type-row"><small>Крупный</small><span className="t-display">Циклы: повтори 3 раза</span></div>
            <div className="type-row"><small>Заголовок</small><span className="t-h1">Тема 2. Условия</span></div>
            <div className="type-row"><small>Вопрос</small><span className="t-h2">Что напечатает программа?</span></div>
            <div className="type-row"><small>Текст</small><span className="t-body">Робот делает шаг, только если впереди нет стены.</span></div>
            <div className="type-row"><small>Мелкий</small><span className="t-small">4 из 5 упражнений · 12 минут</span></div>
            <div className="type-row"><small>Код</small><span className="t-code">if wall: turn_left()</span></div>
          </div>
        </section>

        <section className="section">
          <h2>Кнопки и ответы</h2>
          <p className="lead">Объём есть только у главной кнопки: она показывает, куда нажимать дальше. При нажатии она проседает. Остальные кнопки плоские.</p>
          <div className="panel">
            <div className="row">
              <button className="btn">Проверить</button>
              <button className="btn btn-secondary">Пропустить</button>
              <button className="btn" disabled>Проверить</button>
              <button className="btn btn-ok">Дальше</button>
              <button className="btn btn-bad">Ещё раз</button>
              <button className="btn btn-tint btn-sm">Подсказка</button>
              <button className="btn btn-ghost">Подробнее</button>
            </div>
            <div className="sub">Варианты ответа: обычный, выбран, верно, ошибка</div>
            <div className="options">
              <div className="option"><span className="key">1</span>Повторить 3 раза</div>
              <div className="option is-selected"><span className="key">2</span>Повторить, пока есть кодкоины</div>
              <div className="option is-ok"><span className="key">3</span>Если стена, повернуть</div>
              <div className="option is-bad" style={{ animation: 'none' }}><span className="key">4</span>Идти всегда</div>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Мелкие элементы</h2>
          <div className="grid-wide">
            <div className="panel">
              <div className="sub" style={{ marginTop: 0 }}>Кодкоины: в шапке сессии и в магазине</div>
              <div className="row" style={{ gap: 24 }}><Coins amount={120} /><Coins amount={1450} big /></div>
              <div className="sub">Прогресс сессии</div>
              <div className="row" style={{ flexWrap: 'nowrap' }}><Progress value={0.6} /><span className="t-small">3 из 5</span></div>
            </div>
            <div className="panel">
              <div className="sub" style={{ marginTop: 0 }}>Аватары: портреты персонажей из комнаты. Точка значит «сейчас в классе»</div>
              <div className="row">{KIDS.map((k) => <Avatar key={k.name} kid={k} showName />)}</div>
            </div>
            <div className="panel">
              <div className="sub" style={{ marginTop: 0 }}>Карта тем: пройдено, сейчас, закрыто</div>
              <div className="path">
                <TopicNode state="done" /><div className="path-line is-done" />
                <TopicNode state="now"><Icon name="loop" size={26} /></TopicNode><div className="path-line" />
                <TopicNode state="locked" />
              </div>
            </div>
            <div className="panel">
              <div className="sub" style={{ marginTop: 0 }}>Помощник задаёт наводящий вопрос</div>
              <AiBubble>Что сделает робот, если впереди стена? Попробуй пройти программу шаг за шагом.</AiBubble>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Экран сессии</h2>
          <p className="lead">Одно задание на экране. Карточка задания меняет цвет: синяя в работе, янтарная при ошибке, зелёная при верном ответе. Ошибка янтарная, а не красная: ошибаться нормально. Слева внизу помощник, он отвечает вопросом на вопрос.</p>
          <a className="btn" href="/lesson/loops-1">Открыть урок в приложении</a>
        </section>

        <section className="section">
          <h2>Карточки упражнений</h2>
          <p className="lead">По одному заданию каждого типа из уроков. Их можно решать прямо здесь.</p>
          <div className="grid-wide">
            {SAMPLES.map((ex) => <ExerciseCard key={ex.id} ex={ex} />)}
          </div>
        </section>

        <section className="section">
          <h2>Комната класса</h2>
          <p className="lead">Игровой мир снаружи сессий. Дети из набора Kenney Mini Characters, мебель из Kenney Furniture Kit, робот-помощник собран из скруглённых кубов в стиле значка помощника. Наборы бесплатные, лицензия CC0. Нажми на ребёнка или на робота. Комнату можно поворачивать пальцем.</p>
          <div className="world">
            <Suspense fallback={<div className="world-loading">Загружаю комнату…</div>}>
              <ClassRoom selected={picked} onSelect={setPicked} />
            </Suspense>
            {(kid || picked === 'robot') && (
              <div className="world-hint">
                <div className="world-card">
                  {kid ? <Avatar kid={kid} /> : <AiFace />}
                  <div>
                    <b>{kid ? kid.name : 'Помощник'}</b>
                    <div className="t-small">{kid ? `${kid.me ? 'Это ты' : 'Решает тему'} «${kid.topic}» · ${kid.done} из 5` : 'Отвечает вопросом на вопрос, готовых ответов не даёт'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </>
  )
}
