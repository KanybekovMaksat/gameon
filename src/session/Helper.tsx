import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../app/Sheet'
import { useApp } from '../app/store'
import { AiFace, Icon } from '../components'
import type { Explain } from '../content/types'
import type { Answer, Exercise } from '../exercises/kit'
import { kindOf } from '../exercises/registry'
import { inline } from './text'

type Msg = { role: 'user' | 'assistant'; content: string; hidden?: boolean }

// What the helper knows: an exercise with the child's answer, or an explanation card.
export type HelperTarget =
  | { type: 'ex'; ex: Exercise; answer: Answer | null; mode: 'hint' | 'why' }
  | { type: 'explain'; item: Explain }

// The first words must come within FIRST_BYTE; the whole answer within TOTAL.
const FIRST_BYTE = 6000
const TOTAL = 25000

function context(t: HelperTarget) {
  if (t.type === 'explain') {
    return { mode: 'why' as const, task: `Ребёнок читает объяснение «${t.item.title}»:\n${t.item.body}`, why: t.item.body }
  }
  return {
    mode: t.mode,
    task: `${kindOf(t.ex).label}. ${kindOf(t.ex).describe(t.ex.data)}`,
    answer: t.answer?.text,
    hints: t.ex.hints,
    why: t.ex.why,
  }
}

// The first message the child does not type: the helper starts the talk from the situation.
function opener(t: HelperTarget): string {
  if (t.type === 'explain') return 'Объясни проще, пожалуйста.'
  if (t.mode === 'why') return 'Почему это верный ответ?'
  if (t.answer?.correct === false) return `Я ответил так: ${t.answer.text}. Это неверно. Помоги понять, где ошибка, но не говори ответ.`
  return 'Я не знаю, с чего начать. Подскажи, но не говори ответ.'
}

// Scripted text when the network or the model fails: the methodist's hints in order.
function fallback(t: HelperTarget, n: number) {
  if (t.type === 'explain') return 'Прочитай объяснение ещё раз по одному предложению. Какое слово в нём непонятное?'
  if (t.mode === 'why') return t.ex.why
  return t.ex.hints[Math.min(n, t.ex.hints.length - 1)] ?? 'Попробуй пройти задание по шагам и записать, что меняется на каждом шаге.'
}

export function Helper({ target, lessonId, onClose }: { target: HelperTarget; lessonId: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const fails = useRef(0)
  const current = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const log = useApp((s) => s.log)

  const ask = async (history: Msg[]) => {
    setMsgs(history)
    setBusy(true)
    current.current?.abort()
    const ctrl = new AbortController()
    current.current = ctrl
    const timer = setTimeout(() => ctrl.abort(), FIRST_BYTE)
    const total = setTimeout(() => ctrl.abort(), TOTAL)
    let got = ''
    try {
      const res = await fetch('/api/helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...context(target), messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error(String(res.status))
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        clearTimeout(timer)
        got += dec.decode(value, { stream: true })
        setMsgs([...history, { role: 'assistant', content: got }])
      }
      if (!got.trim()) throw new Error('empty')
    } catch {
      // Closed by the child: nothing to show. Cut off mid-answer: mark it. No answer: the methodist's hint.
      if (current.current !== ctrl) return
      if (!got.trim()) setMsgs([...history, { role: 'assistant', content: fallback(target, fails.current++) }])
      else setMsgs([...history, { role: 'assistant', content: got.trimEnd() + '…' }])
    } finally {
      clearTimeout(timer)
      clearTimeout(total)
      if (current.current === ctrl) setBusy(false)
    }
  }

  // The helper opens once per target. The start waits a tick, so StrictMode's trial mount sends nothing;
  // closing the sheet cancels the request.
  useEffect(() => {
    const t = setTimeout(() => void ask([{ role: 'user', content: opener(target), hidden: true }]), 0)
    return () => { clearTimeout(t); current.current?.abort(); current.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  // The keyboard makes the log shorter: the latest message stays in view.
  useEffect(() => {
    const log = scroller.current
    if (!log) return
    const ro = new ResizeObserver(() => log.scrollTo({ top: log.scrollHeight }))
    ro.observe(log)
    return () => ro.disconnect()
  }, [])

  const send = (content: string) => {
    const q = content.trim()
    if (!q || busy) return
    setText('')
    if (target.type === 'ex') log({ type: 'helper', lessonId, exId: target.ex.id, question: q, at: Date.now() })
    void ask([...msgs, { role: 'user', content: q }])
  }

  const last = msgs[msgs.length - 1]
  const typing = busy && last?.role === 'user'

  return (
    <Sheet label="Помощник" className="chat" onClose={onClose}>
      {(close) => (
        <>
          <div className="chat-head">
            <AiFace />
            <div>
              <b>Помощник</b>
              <small>Подсказывает, но не решает за тебя</small>
            </div>
            <button className="chat-x" aria-label="Закрыть" onClick={close}><Icon name="close" size={20} /></button>
          </div>
          <div className="chat-log" ref={scroller}>
            {msgs.filter((m) => !m.hidden).map((m, i) => (
              <p key={i} className={'chat-msg selectable' + (m.role === 'user' ? ' is-me' : '')}>{inline(m.content)}</p>
            ))}
            {typing && <p className="chat-msg is-typing" aria-label="Помощник печатает"><i /><i /><i /></p>}
          </div>
          <div className="chat-replies">
            <button className="btn btn-secondary btn-sm" onClick={close}>Понятно</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => send('Не понятно, подскажи ещё')}>Не понятно</button>
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text) }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Спроси помощника" maxLength={300} enterKeyHint="send" />
            <button type="submit" aria-label="Отправить" disabled={!text.trim() || busy}><Icon name="send" size={18} /></button>
          </form>
        </>
      )}
    </Sheet>
  )
}
