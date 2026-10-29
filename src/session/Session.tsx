import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { leave, useLayer } from '../app/router'
import { Sheet } from '../app/Sheet'
import { sfx } from '../app/sfx'
import { useApp, type SessionVersion } from '../app/store'
import { HelperMark, Icon, Progress, Xp } from '../components'
import type { Explain, Lesson, Topic } from '../content/types'
import type { Answer, Exercise } from '../exercises/kit'
import { retryMemory } from '../exercises/memory'
import { kindOf } from '../exercises/registry'
import { XP_FIRST, XP_RETRY } from '../rewards/catalog'
import { Finish } from './Finish'
import { Helper, type HelperTarget } from './Helper'
import { Rich } from './text'

// `again`: the mission returns after the explanation; it keeps full XP but is not a first try.
type Step = { type: 'explain'; item: Explain } | { type: 'ex'; item: Exercise; tryFirst?: boolean; again?: boolean }

// explain: explanation cards, then practice. try: the first task comes before the explanation.
// A wrong first try is not a failure: the task comes back after the explanation.
function buildSteps(lesson: Lesson, version: SessionVersion): Step[] {
  const exp: Step[] = lesson.explain.map((item) => ({ type: 'explain', item }))
  const ex: Step[] = lesson.practice.map((item) => ({ type: 'ex', item }))
  if (version === 'try' && ex.length && exp.length) return [{ type: 'ex', item: lesson.practice[0], tryFirst: true }, ...exp, ...ex.slice(1)]
  return [...exp, ...ex]
}

const quick = () => matchMedia('(prefers-reduced-motion: reduce)').matches

type Outcome = { ok: boolean; tryFirst: boolean; tries: number; gain: number; fly: number; note?: string }

// The result sheet: it keeps the answer above it visible and slides down when the child goes on.
function ResultSheet({ r, out, onHelp, onMain }: { r: Outcome; out?: boolean; onHelp?: () => void; onMain?: () => void }) {
  const { ok, tryFirst, tries, gain, fly, note } = r
  return (
    <div className={'sheet ' + (ok ? 'is-ok' : 'is-bad') + (out ? ' is-out' : '')} inert={out}>
      <div className="sheet-head">
        <span className="sheet-icon"><Icon name={ok ? 'check' : tryFirst ? 'spark' : 'x'} size={20} /></span>
        <div className="sheet-title">
          <h3>{ok ? (tries === 0 ? 'Верно!' : 'Получилось!') : tryFirst ? 'Хорошая попытка' : 'Не совсем'}</h3>
          {ok && <span className="gain">+{gain} XP</span>}
          {!ok && (note || tryFirst) && <span className="sheet-sub">{note ?? 'Сейчас разберёмся, как это работает'}</span>}
        </div>
        {!tryFirst && (
          <button className="btn btn-tint btn-sm" onClick={onHelp}>
            {ok ? 'Почему?' : 'Подсказка'}
          </button>
        )}
      </div>
      <div className="sheet-foot">
        <button className={'btn ' + (ok ? 'btn-ok' : 'btn-bad')} onClick={onMain}>{ok ? 'Дальше' : tryFirst ? 'К объяснению' : 'Ещё раз'}</button>
      </div>
      {ok && !out && <span className="xp-fly" key={fly} aria-hidden />}
    </div>
  )
}

// `active` is false while the lesson slides away: it no longer guards the back step.
export function Session({ topic, lesson, active = true }: { topic: Topic; lesson: Lesson; active?: boolean }) {
  const version = useApp((s) => s.session)
  const xp = useApp((s) => s.xp)
  const { addXp, log, completeLesson, questStep } = useApp.getState()

  const [steps, setSteps] = useState(() => buildSteps(lesson, version))
  // `?at=<kind>` opens the lesson at the first task of that kind: the presenter jumps to «Научи Робика».
  const [i, setI] = useState(() => {
    const at = new URLSearchParams(location.search).get('at')
    return Math.max(0, at ? steps.findIndex((st) => st.type === 'ex' && st.item.kind === at) : 0)
  })
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [checked, setChecked] = useState(false)
  const [tries, setTries] = useState(0)
  const [round, setRound] = useState(0)
  const [helper, setHelper] = useState<HelperTarget | null>(null)
  const [exit, setExit] = useState(false)
  const [stats, setStats] = useState({ firstTry: 0, total: 0, xp: 0 })
  const [fly, setFly] = useState(0)
  const [finished, setFinished] = useState(false)
  // The child did something here: leaving now asks first. `quitting`: the child chose to leave.
  const [dirty, setDirty] = useState(false)
  const [quitting, setQuitting] = useState(false)
  const [leaving, setLeaving] = useState<Outcome | null>(null)
  const logged = useRef(false)
  const letGoTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [replaying, setReplaying] = useState(false)
  const replayTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // The right or wrong result of a check whose task is still playing it.
  const waiting = useRef<boolean | null>(null)
  // A new run of the lesson starts every task clean.
  useState(() => retryMemory.clear())

  // Back in a lesson with progress opens the exit question instead of leaving at once.
  useLayer(active && dirty && !finished && !exit && !quitting, (why) => { if (why === 'back') setExit(true) })
  const quit = () => { setQuitting(true); leave() }
  const onAnswer = (a: Answer) => { setAnswer(a); setDirty(true) }

  useEffect(() => {
    if (logged.current) return
    logged.current = true
    log({ type: 'lesson-start', lessonId: lesson.id, at: Date.now() })
  }, [lesson.id, log])

  const root = useRef<HTMLDivElement>(null)

  // On a laptop, Enter presses the main button of the moment: check, next, or try again.
  useEffect(() => {
    // Not when a control already handled Enter, not on a held key, not while typing, not outside the lesson.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat) return
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      if (t !== document.body && !root.current?.contains(t)) return
      const btn = root.current?.querySelector<HTMLButtonElement>('.sheet:not(.is-out) .sheet-foot .btn:not(:disabled), .session-foot .btn:not(:disabled)')
      if (btn && !root.current?.querySelector('.sh')) { e.preventDefault(); btn.click() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const body = useRef<HTMLDivElement>(null)

  // The result sheet must not hide the answer: the body gets room under it and scrolls the answer into view.
  useLayoutEffect(() => {
    const b = body.current
    const sheet = root.current?.querySelector<HTMLElement>('.sheet:not(.is-out)')
    if (!b) return
    if (!checked || replaying || !sheet) { b.style.paddingBottom = ''; return }
    const h = sheet.offsetHeight
    const contentBottom = b.scrollHeight
    b.style.paddingBottom = `${h + 12}px`
    const hidden = contentBottom - (b.scrollTop + b.clientHeight - h)
    if (hidden > 0) b.scrollBy({ top: hidden + 12, behavior: 'smooth' })
  }, [checked, replaying, i])

  const step = steps[i]
  const ok = checked && answer?.correct === true
  const progress = (i + (ok || step?.type === 'explain' ? 0.5 : 0)) / steps.length
  const Kind = useMemo(() => (step?.type === 'ex' ? kindOf(step.item) : null), [step])
  const gain = tries === 0 ? XP_FIRST : XP_RETRY
  const tryFirst = step?.type === 'ex' && !!step.tryFirst
  const outcome: Outcome | null = step?.type === 'ex' && checked && !replaying ? { ok, tryFirst, tries, gain, fly, note: answer?.note } : null

  // The result sheet that is going away stays a moment to slide down.
  const letGo = () => {
    if (!outcome || quick()) return
    setLeaving(outcome)
    clearTimeout(letGoTimer.current)
    letGoTimer.current = setTimeout(() => setLeaving(null), 240)
  }
  useEffect(() => () => { clearTimeout(letGoTimer.current); clearTimeout(replayTimer.current) }, [])

  const advance = () => {
    retryMemory.clear()
    letGo()
    setDirty(true)
    setAnswer(null); setChecked(false); setTries(0); setHelper(null); setRound((r) => r + 1)
    if (i + 1 < steps.length) { setI(i + 1); return }
    completeLesson(lesson.id)
    log({ type: 'lesson-done', lessonId: lesson.id, ...stats, at: Date.now() })
    sfx('finish')
    setFinished(true)
  }

  const result = (correct: boolean) => {
    if (step.type !== 'ex') return
    if (correct) {
      const gain = tries === 0 ? XP_FIRST : XP_RETRY
      sfx('ok')
      setTimeout(() => sfx('xp'), 380)
      addXp(gain)
      questStep()
      setFly((f) => f + 1)
      const first = tries === 0 && !step.again
      setStats((s) => ({ firstTry: s.firstTry + (first ? 1 : 0), total: s.total + 1, xp: s.xp + gain }))
    } else {
      sfx('bad')
      setTries((t) => t + 1)
    }
  }

  const settled = () => {
    const correct = waiting.current
    if (correct === null) return
    waiting.current = null
    clearTimeout(replayTimer.current)
    setReplaying(false)
    result(correct)
  }

  const check = () => {
    if (step.type !== 'ex' || !answer || answer.correct === null) return
    setChecked(true)
    log({ type: 'attempt', lessonId: lesson.id, exId: step.item.id, correct: answer.correct, answer: answer.text, at: Date.now() })
    // The task may play the answer first (the robot runs the program); the result comes when it ends.
    if (!answer.replays || quick()) { result(answer.correct); return }
    waiting.current = answer.correct
    setReplaying(true)
    // A task that never reports the end still shows its result.
    replayTimer.current = setTimeout(settled, 10000)
  }

  const retry = () => { letGo(); setAnswer(null); setChecked(false); setRound((r) => r + 1) }

  // After a wrong first try the task returns right after the explanation cards.
  const toExplanation = () => {
    if (step.type === 'ex') {
      const after = i + 1 + lesson.explain.length
      setSteps([...steps.slice(0, after), { type: 'ex', item: step.item, again: true }, ...steps.slice(after)])
    }
    advance()
  }

  if (finished) return <Finish topic={topic} lesson={lesson} stats={stats} />

  return (
    <div className="session" ref={root}>
      <div className="session-top">
        <button className="session-close" aria-label="Выйти из урока" onClick={() => (dirty ? setExit(true) : quit())}><Icon name="close" size={22} /></button>
        <Progress value={progress} />
        <span className={'xp-wrap' + (fly ? ' is-bump' : '')} key={fly}><Xp amount={xp} /></span>
      </div>

      <div className="session-body" ref={body}>
        <div key={`${i}-${round}`} className="step-in">
          {step.type === 'explain' ? (
            <div className="explain">
              <div className="ex-kind">{topic.title} · объяснение</div>
              <h2 className="explain-title">{step.item.title}</h2>
              {step.item.visual && <div className="explain-visual"><step.item.visual /></div>}
              <div className="explain-body"><Rich text={step.item.body} /></div>
            </div>
          ) : (
            <>
              {tryFirst && !checked && (
                <div className="try-banner"><Icon name="spark" size={18} />Попробуй сам, даже если пока не знаешь. Объяснение будет сразу после.</div>
              )}
              {Kind && <Kind.Component data={step.item.data} checked={checked} onAnswer={onAnswer} onSettled={settled} />}
            </>
          )}
        </div>
      </div>

      {step.type === 'explain' && (
        <div className="session-foot">
          <button className="helper-btn" aria-label="Спросить Робика" onClick={() => setHelper({ type: 'explain', item: step.item })}><HelperMark /></button>
          <button className="btn" style={{ flex: 1 }} onClick={advance}>Дальше</button>
        </div>
      )}

      {step.type === 'ex' && !checked && (
        <div className="session-foot">
          <button className="helper-btn" aria-label="Спросить Робика" onClick={() => setHelper({ type: 'ex', ex: step.item, answer, mode: 'hint' })}><HelperMark /></button>
          <button className="btn" style={{ flex: 1 }} disabled={!answer || answer.correct === null} onClick={check}>Проверить</button>
        </div>
      )}

      {leaving && <ResultSheet r={leaving} out />}
      {step.type === 'ex' && outcome && (
        <ResultSheet
          r={outcome}
          onHelp={() => setHelper({ type: 'ex', ex: step.item, answer, mode: ok ? 'why' : 'hint' })}
          onMain={ok ? advance : tryFirst ? toExplanation : retry}
        />
      )}

      {helper && <Helper target={helper} lessonId={lesson.id} onClose={() => setHelper(null)} />}

      {exit && (
        <Sheet label="Выйти из урока?" className="confirm" onClose={() => setExit(false)}>
          {(close) => (
            <>
              <h3>Выйти из урока?</h3>
              <p>XP за решённые миссии останутся. Урок можно начать заново в любой момент.</p>
              <button className="btn btn-block" onClick={close}>Продолжить урок</button>
              <button className="btn btn-ghost btn-block" onClick={quit}>Выйти</button>
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}
