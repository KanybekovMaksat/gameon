import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components'
import { inline } from '../session/text'
import { Code } from './code'
import { defineKind, stateOf, Task, type ExProps } from './kit'
import './teach.css'

// The child teaches Robik, an AI student. Robik solves `code` using only the child's words:
// a wrong explanation gives a wrong answer, so the child sees the gap in their own understanding.
export type TeachData = {
  concept: string
  ask: string
  understanding: string
  code: string
  answer: string
  // Words that a right explanation has; used only when the AI is not reachable.
  keywords: string[]
}

type Msg = { from: 'robik' | 'me'; text: string }
type Verdict = { state: 'asking' | 'solved' | 'wrong'; attempt: string | null }

const MAX_TURNS = 3
// A hanging network must not freeze the chat: after this the offline check answers.
const TIMEOUT = 12000

export function RobikMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="robik-mark">
      <path d="M24 4v6" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="4.5" r="3" fill="var(--coin)" />
      <rect x="4" y="10" width="40" height="34" rx="13" fill="var(--ink)" />
      <rect x="10" y="17" width="28" height="19" rx="7" fill="var(--ink)" opacity="0.6" />
      <circle cx="18.5" cy="26.5" r="3.4" fill="var(--cyan)" />
      <circle cx="29.5" cy="26.5" r="3.4" fill="var(--cyan)" />
      <path d="M20.5 32.2q3.5 2 7 0" stroke="var(--cyan)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// Without the AI: a rough check by key words, so the demo still works offline.
function offline(data: TeachData, text: string, turns: number): Verdict & { reply: string } {
  const t = text.toLowerCase()
  const hits = data.keywords.filter((k) => t.includes(k.toLowerCase())).length
  if (hits >= Math.min(2, data.keywords.length) && t.length > 20) {
    return { state: 'solved', attempt: data.answer, reply: `Кажется, понял! Тогда у меня получается ${data.answer}.` }
  }
  if (turns >= MAX_TURNS) return { state: 'wrong', attempt: '?', reply: 'Я запутался и не смог решить. Давай начнём сначала?' }
  return { state: 'asking', attempt: null, reply: 'Можешь объяснить подробнее? Что именно происходит по шагам?' }
}

function Teach({ data, checked, onAnswer }: ExProps<TeachData>) {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'robik', text: data.ask }])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const alive = useRef<AbortController | null>(null)
  const result = useRef<HTMLDivElement>(null)
  const left = useRef<HTMLDivElement>(null)

  useEffect(() => () => { alive.current?.abort(); alive.current = null }, [])
  const turns = msgs.filter((m) => m.from === 'me').length
  const over = checked || verdict?.state === 'solved' || turns >= MAX_TURNS

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])

  const send = async () => {
    const q = text.trim()
    if (!q || busy || over) return
    const next: Msg[] = [...msgs, { from: 'me', text: q }]
    setMsgs(next)
    setText('')
    setBusy(true)
    const n = turns + 1
    let r: (Verdict & { reply: string }) | null = null
    const ctrl = new AbortController()
    alive.current = ctrl
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
    try {
      const res = await fetch('/api/student', {
        signal: ctrl.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: data.concept,
          understanding: data.understanding,
          task: data.code,
          answer: data.answer,
          // The robot speaks as the assistant, the child as the user.
          messages: next.map((m) => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text })),
        }),
      })
      if (res.ok) r = await res.json()
    } catch { /* offline below */ }
    clearTimeout(timer)
    if (alive.current !== ctrl) return
    r ??= offline(data, q, n)
    setMsgs([...next, { from: 'robik', text: r.reply }])
    setBusy(false)
    const explained = next.filter((m) => m.from === 'me').map((m) => m.text).join(' / ')
    if (r.state === 'asking') {
      onAnswer({ correct: null })
      setVerdict(null)
      // Keep the input and the count of explanations left above the lesson's footer.
      requestAnimationFrame(() => left.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
      return
    }
    setVerdict({ state: r.state, attempt: r.attempt })
    // Robik's answer appears under the chat; bring it into view above the lesson's footer.
    requestAnimationFrame(() => result.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    onAnswer({ correct: r.state === 'solved', text: `объяснил Робику: «${explained}». Робик ответил ${r.attempt ?? 'без ответа'}` })
  }

  const state = stateOf(checked, verdict !== null, verdict?.state === 'solved')

  return (
    <Task
      state={state}
      label={teach.label}
      text={<>Робик знает только то, что ты ему объяснишь. Объясни своими словами, и он решит задачу сам.</>}
      after={verdict && (
        <div ref={result} className={'teach-result is-' + (checked ? verdict.state : 'pending')}>
          {checked && <span className="teach-result-icon"><Icon name={verdict.state === 'solved' ? 'check' : 'x'} size={18} /></span>}
          <div>
            <small>Ответ Робика</small>
            <b>{verdict.attempt ?? 'нет ответа'}</b>
          </div>
          {verdict.state === 'wrong' && !checked && turns < MAX_TURNS && <span className="teach-more">Объясни ещё раз</span>}
        </div>
      )}
    >
      <div className="teach">
        <div className="teach-task">
          <small>Задача Робика</small>
          <Code code={data.code} />
        </div>
        <div className="teach-log" ref={log}>
          {msgs.map((m, i) => (
            <div key={i} className={'teach-msg is-' + m.from}>
              {m.from === 'robik' && <RobikMark size={30} />}
              <p>{inline(m.text)}</p>
            </div>
          ))}
          {busy && <div className="teach-msg is-robik"><RobikMark size={30} /><p className="teach-typing"><i /><i /><i /></p></div>}
        </div>
        {!over && (
          <form className="teach-input" onSubmit={(e) => { e.preventDefault(); void send() }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={turns ? 'Объясни ещё' : 'Объясни Робику'} maxLength={400} enterKeyHint="send" />
            <button type="submit" aria-label="Отправить" disabled={!text.trim() || busy}><Icon name="send" size={18} /></button>
          </form>
        )}
        {!over && <div ref={left} className="teach-left">Осталось объяснений: {MAX_TURNS - turns}</div>}
      </div>
    </Task>
  )
}

export const teach = defineKind<TeachData>({
  kind: 'teach',
  label: 'Научи Робика',
  Component: Teach,
  describe: (d) => `Объясни роботу-ученику тему «${d.concept}», чтобы он решил задачу:\n${d.code}\nВерный ответ: ${d.answer}. Суть темы: ${d.understanding}. Помогай ребёнку объяснить понятнее, но не объясняй тему за него целиком.`,
})
