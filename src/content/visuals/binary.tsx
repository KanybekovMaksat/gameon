import { useEffect, useState, type CSSProperties } from 'react'
import './digital-visuals.css'

// Each new bit doubles the combinations: the old ones with 0 in front and the old ones with 1 in front.
export function BitCombos() {
  const [n, setN] = useState(1)
  const list = Array.from({ length: 2 ** n }, (_, k) => k.toString(2).padStart(n, '0'))
  const half = list.length / 2
  return (
    <div className="dv">
      <div className="dv-combos-head">
        <b>{n} {n === 1 ? 'бит' : 'бита'}</b>
        <span>{list.length} {list.length === 2 || list.length === 4 ? 'сочетания' : 'сочетаний'}</span>
      </div>
      <div className="dv-combos" key={n}>
        {list.map((s, i) => (
          <code key={s} className="dv-combo" style={{ '--i': i } as CSSProperties}>
            {n > 1 ? <><b className={i < half ? '' : 'is-one'}>{s[0]}</b>{s.slice(1)}</> : <b className={s === '1' ? 'is-one' : ''}>{s}</b>}
          </code>
        ))}
      </div>
      <button className="btn btn-secondary btn-sm dv-step" onClick={() => setN(n === 3 ? 1 : n + 1)}>
        {n === 3 ? 'Сначала' : 'Добавить бит'}
      </button>
    </div>
  )
}

const WEIGHTS = [16, 8, 4, 2, 1]

// Five bit cards with weights 16, 8, 4, 2, 1. A tap flips a card; the number is the sum of weights under the ones.
export function BitCards() {
  const [bits, setBits] = useState([false, false, true, false, true])
  const on = WEIGHTS.filter((_, i) => bits[i])
  const sum = on.reduce((s, w) => s + w, 0)
  return (
    <div className="dv">
      <div className="dv-cards">
        {WEIGHTS.map((w, i) => (
          <button
            key={w}
            className={'dv-card' + (bits[i] ? ' is-on' : '')}
            aria-pressed={bits[i]}
            aria-label={`Вес ${w}, бит ${bits[i] ? 1 : 0}`}
            onClick={() => setBits(bits.map((b, j) => (j === i ? !b : b)))}
          >
            <small>{w}</small>
            <b key={String(bits[i])}>{bits[i] ? 1 : 0}</b>
          </button>
        ))}
      </div>
      <div className="dv-sum" aria-live="polite">
        <code>{bits.map((b) => (b ? 1 : 0)).join('')}</code>
        <span>=</span>
        <span className="dv-sum-parts">{on.length ? on.join(' + ') : '0'}</span>
        <span>=</span>
        <b className={sum === 11 ? 'is-goal' : undefined}>{sum}</b>
      </div>
    </div>
  )
}

const SMILEY = ['00111100', '01000010', '10100101', '10000001', '10100101', '10011001', '01000010', '00111100']

// Bits become a picture: the rows draw one after another.
export function BitsPicture() {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(reduced ? SMILEY.length : 0)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (reduced) return
    let k = 0
    const id = setInterval(() => {
      k += 1
      setShown(k)
      if (k >= SMILEY.length) clearInterval(id)
    }, 320)
    return () => clearInterval(id)
  }, [run, reduced])

  return (
    <div className="dv">
      <div className="dv-pic">
        {SMILEY.map((row, r) => (
          <div key={r} className={'dv-pic-row' + (r < shown ? ' is-drawn' : '') + (r === shown - 1 && shown < SMILEY.length ? ' is-now' : '')}>
            <code>{row}</code>
            <span className="dv-arrow" aria-hidden>→</span>
            <span className="dv-pixels">
              {[...row].map((b, c) => <i key={c} className={b === '1' ? 'is-on' : ''} style={{ '--c': c } as CSSProperties} />)}
            </span>
          </div>
        ))}
      </div>
      <button className="btn btn-secondary btn-sm dv-step" onClick={() => { setShown(0); setRun(run + 1) }} disabled={shown < SMILEY.length}>
        Нарисовать ещё раз
      </button>
    </div>
  )
}

// Two bits a pixel give four colors. A tap on a color shows its pixels.
const PALETTE = [
  { code: '00', name: 'белый', cls: 'c0' },
  { code: '01', name: 'голубой', cls: 'c1' },
  { code: '10', name: 'синий', cls: 'c2' },
  { code: '11', name: 'тёмный', cls: 'c3' },
]
const HELPER = [
  '0101010110101010',
  '0100000000000010',
  '0100110000110010',
  '0100110000110010',
  '0100000000000010',
  '0101010110101010',
]

export function ColorBits() {
  const [pick, setPick] = useState<string | null>(null)
  const rows = HELPER.map((r) => r.match(/../g) ?? [])
  return (
    <div className="dv">
      <div className="dv-color-pic" role="img" aria-label="Помощник из пикселей четырёх цветов">
        {rows.map((row, r) => row.map((code, c) => (
          <span key={`${r}-${c}`} className={'c' + parseInt(code, 2) + (pick && pick !== code ? ' is-dim' : '')}>
            {pick === code && <small>{code}</small>}
          </span>
        )))}
      </div>
      <div className="dv-palette">
        {PALETTE.map((p) => (
          <button key={p.code} className={pick === p.code ? 'is-on' : ''} aria-pressed={pick === p.code} onClick={() => setPick(pick === p.code ? null : p.code)}>
            <i className={p.cls} />
            <code>{p.code}</code>
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
