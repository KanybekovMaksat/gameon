import type { KeyboardEvent } from 'react'
import './digital.css'

// A logic circuit drawn as SVG: switches on the left, gates in columns, a lamp on the right.
// The gates kind and the logic visuals share it.

export type GateType = 'and' | 'or' | 'not'
// `in` names switches or earlier gates. Gates are listed so that a gate comes after its sources.
export type Gate = { id: string; type: GateType; in: string[] }

export const GATE_NAME: Record<GateType, string> = { and: 'И', or: 'ИЛИ', not: 'НЕ' }

export function apply(type: GateType, v: boolean[]) {
  if (type === 'and') return v.every(Boolean)
  if (type === 'or') return v.some(Boolean)
  return !v[0]
}

// The lamp shows the last gate. A circuit with no gates connects the first switch to the lamp.
export function outOf(inputs: string[], gates: Gate[]) {
  return gates.length ? gates[gates.length - 1].id : inputs[0]
}

// The value of every switch and gate. A gate with an unknown type (null) and all gates after it have no value.
export function evaluate(gates: Gate[], on: Record<string, boolean>, types: Record<string, GateType | null> = {}) {
  const val: Record<string, boolean | null> = { ...on }
  for (const g of gates) {
    const t = g.id in types ? types[g.id] : g.type
    const ins = g.in.map((i) => val[i] ?? null)
    val[g.id] = t === null || ins.some((x) => x === null) ? null : apply(t, ins as boolean[])
  }
  return val
}

// A formula in words, for the helper: (A ИЛИ B) И НЕ C. `hide` shows one gate as «?».
export function formula(id: string, gates: Gate[], hide?: string): string {
  const g = gates.find((x) => x.id === id)
  if (!g) return id
  const part = (s: string) => {
    const sub = gates.find((x) => x.id === s)
    return sub && sub.in.length > 1 ? `(${formula(s, gates, hide)})` : formula(s, gates, hide)
  }
  const name = g.id === hide ? '?' : GATE_NAME[g.type]
  return g.in.length === 1 ? `${name} ${part(g.in[0])}` : g.in.map(part).join(` ${name} `)
}

const SW = 78
const ROW = 56
const PAD = 10
const STEP = 170
const GW: Record<GateType, number> = { and: 50, or: 54, not: 47 }
const SLOT_W = 54
// Where a wire meets the back of the gate: the OR gate has a curved back.
const PIN_X: Record<GateType, number> = { and: 0, or: 6, not: 0 }

type Node = { x: number; y: number; d: number; w: number }

function layout(inputs: string[], gates: Gate[], slot?: string) {
  const nodes: Record<string, Node> = {}
  inputs.forEach((n, i) => { nodes[n] = { x: SW - 12, y: PAD + i * ROW + ROW / 2, d: 0, w: 0 } })
  for (const g of gates) {
    const src = g.in.map((i) => nodes[i])
    nodes[g.id] = {
      x: 0,
      y: src.reduce((s, n) => s + n.y, 0) / src.length,
      d: 1 + Math.max(...src.map((n) => n.d)),
      w: g.id === slot ? SLOT_W : GW[g.type],
    }
  }
  const depth = Math.max(0, ...gates.map((g) => nodes[g.id].d))
  const width = Math.max(320, SW + 60 + depth * 96)
  const colStart = SW + 6
  const colEnd = width - 66
  const colW = depth ? (colEnd - colStart) / depth : 0
  for (const g of gates) {
    const n = nodes[g.id]
    n.x = colStart + (n.d - 0.5) * colW - n.w / 2
  }
  const out = nodes[outOf(inputs, gates)]
  const lamp = { x: width - 32, y: out.y }
  const height = Math.max(inputs.length * ROW + PAD * 2, lamp.y + 32)
  return { nodes, depth, width, height, lamp }
}

// An orthogonal wire with rounded corners. It turns close to the target, so parallel wires stay apart.
function wire(x1: number, y1: number, x2: number, y2: number) {
  if (Math.abs(y1 - y2) < 0.5) return `M${x1} ${y1}H${x2}`
  const mx = Math.max(x1 + 10, x2 - 16)
  const dir = y2 > y1 ? 1 : -1
  const r = Math.min(8, Math.abs(y2 - y1) / 2)
  return `M${x1} ${y1}H${mx - r}Q${mx} ${y1} ${mx} ${y1 + dir * r}V${y2 - dir * r}Q${mx} ${y2} ${mx + r} ${y2}H${x2}`
}

export function GateBody({ type }: { type: GateType }) {
  if (type === 'and') return <path className="gt-body" d="M0 0H30A20 20 0 0 1 30 40H0Z" />
  if (type === 'or') return <path className="gt-body" d="M0 0Q16 20 0 40Q32 40 54 20Q32 0 0 0Z" />
  return (
    <>
      <path className="gt-body" d="M0 1L38 20L0 39Z" />
      <circle className="gt-body" cx="42.5" cy="20" r="4.5" />
    </>
  )
}

const LABEL_X: Record<GateType, number> = { and: 22, or: 27, not: 14 }

// A small gate icon for answer options.
export function GateIcon({ type }: { type: GateType }) {
  return (
    <svg className="gt-icon" viewBox="-6 -4 66 48" width="44" height="32" aria-hidden>
      <g className="gt-gate"><GateBody type={type} /></g>
    </svg>
  )
}

export type Mark = 'ok' | 'bad'

export function Circuit({ inputs, gates, on, onToggle, locked = [], slot, lampMark }: {
  inputs: string[]
  gates: Gate[]
  on: Record<string, boolean>
  // No handler: the switches do not move (after the check, or in a picture).
  onToggle?: (name: string) => void
  locked?: string[]
  // The gate the child picks: its type (null while empty) and the mark after the check.
  slot?: { id: string; type: GateType | null; mark?: Mark }
  lampMark?: Mark
}) {
  const { nodes, width, height, lamp } = layout(inputs, gates, slot?.id)
  const types = slot ? { [slot.id]: slot.type } : {}
  const val = evaluate(gates, on, types)
  const outId = outOf(inputs, gates)
  const lampOn = val[outId] === true
  const lampDelay = (nodes[outId].d + 1) * STEP

  const wires: { key: string; d: string; lit: boolean; delay: number }[] = []
  for (const g of gates) {
    const n = nodes[g.id]
    const srcs = [...g.in].sort((a, b) => nodes[a].y - nodes[b].y)
    srcs.forEach((s, k) => {
      const from = nodes[s]
      const x1 = from.x + from.w
      const py = srcs.length === 1 ? n.y : n.y + (k === 0 ? -10 : 10)
      const shown = slot?.id === g.id ? slot.type : g.type
      const px = n.x + (shown ? PIN_X[shown] : 0)
      wires.push({ key: `${s}-${g.id}-${k}`, d: wire(x1, from.y, px, py), lit: val[s] === true, delay: from.d * STEP })
    })
  }
  const out = nodes[outId]
  wires.push({ key: 'lamp', d: wire(out.x + out.w, out.y, lamp.x - 6, lamp.y), lit: lampOn, delay: out.d * STEP })

  const key = (name: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle?.(name) }
  }

  const bit = (id: string, x: number, y: number, d: number) => {
    const v = val[id]
    if (v === null || v === undefined) return null
    return <text className={'gt-bit' + (v ? ' is-on' : '')} x={x} y={y - 7.5} style={{ transitionDelay: `${d * STEP}ms` }}>{v ? 1 : 0}</text>
  }

  return (
    <svg className="gt-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Схема. Лампа ${lampOn ? 'горит' : 'не горит'}`}>
      {wires.map((w) => (
        <g key={w.key}>
          <path className="gt-wire" d={w.d} />
          <path className="gt-wire-on" d={w.d} pathLength={1} style={{ strokeDashoffset: w.lit ? 0 : 1, transitionDelay: `${w.delay}ms` }} />
        </g>
      ))}

      {inputs.map((name) => {
        const y = nodes[name].y
        const isOn = on[name]
        const isLocked = locked.includes(name)
        const active = !!onToggle && !isLocked
        return (
          <g
            key={name}
            className={'gt-switch' + (isOn ? ' is-on' : '') + (isLocked ? ' is-locked' : '') + (active ? ' is-active' : '')}
            role="switch"
            aria-checked={isOn}
            aria-label={`Выключатель ${name}${isLocked ? ', сломан' : ''}`}
            aria-disabled={!active}
            tabIndex={active ? 0 : -1}
            onClick={active ? () => onToggle(name) : undefined}
            onKeyDown={active ? key(name) : undefined}
          >
            <rect className="gt-hit" x={0} y={y - ROW / 2} width={SW - 6} height={ROW} />
            <text className="gt-name" x={4} y={y + 5.5}>{name}</text>
            <rect className="gt-track" x={22} y={y - 12} width={40} height={24} rx={12} />
            <g className="gt-knob" style={{ transform: isOn ? 'translateX(16px)' : undefined }}>
              <circle cx={34} cy={y} r={9} />
              {isLocked && <path className="gt-lock" d={`M${31} ${y - 1}h6v4.5h-6zM${32.2} ${y - 1}v-1.6a1.8 1.8 0 0 1 3.6 0v1.6`} />}
            </g>
            {bit(name, SW - 8, y, 0)}
          </g>
        )
      })}

      {gates.map((g) => {
        const n = nodes[g.id]
        const isSlot = slot?.id === g.id
        const type = isSlot ? slot.type : g.type
        const lit = val[g.id] === true
        const cls = 'gt-gate' + (lit ? ' is-on' : '') + (isSlot ? ' is-slot' + (slot.mark ? ' is-' + slot.mark : '') : '')
        return (
          <g key={g.id}>
            {type === null ? (
              <g className={cls} transform={`translate(${n.x} ${n.y - 20})`}>
                <rect className="gt-empty" width={SLOT_W} height={40} rx={10} />
                <text className="gt-q" x={SLOT_W / 2} y={26}>?</text>
              </g>
            ) : (
              // The key changes with the type, so a newly picked gate plays its short pop again.
              <g className={cls} transform={`translate(${n.x} ${n.y - 20})`} style={{ transitionDelay: `${n.d * STEP}ms` }} key={type}>
                <GateBody type={type} />
                <text className={'gt-label' + (type === 'not' ? ' is-small' : '')} x={LABEL_X[type]} y={type === 'not' ? 24 : 24.5}>{GATE_NAME[type]}</text>
              </g>
            )}
            {bit(g.id, n.x + n.w + 5, n.y, n.d)}
          </g>
        )
      })}

      {/* The lamp stands on the wire: the base sits on the line, the glass is above it. */}
      <g className={'gt-lamp' + (lampOn ? ' is-on' : '')} transform={`translate(${lamp.x} ${lamp.y})`} style={{ ['--lamp-delay' as string]: `${lampDelay}ms` }}>
        <g className="gt-rays">
          {[-180, -135, -90, -45, 0].map((deg) => {
            const a = (deg * Math.PI) / 180
            return <line key={deg} x1={Math.cos(a) * 17} y1={-19 + Math.sin(a) * 17} x2={Math.cos(a) * 21.5} y2={-19 + Math.sin(a) * 21.5} />
          })}
        </g>
        <circle className="gt-glow" cy={-19} r={17} />
        <path className="gt-bulb" d="M-6 -5C-6 -9 -12 -12 -12 -19A12 12 0 0 1 12 -19C12 -12 6 -9 6 -5Z" />
        <path className="gt-filament" d="M-2.8 -5.5V-12.5C-2.8 -17 2.8 -17 2.8 -12.5V-5.5" />
        <rect className="gt-base" x={-6} y={-3.5} width={12} height={3.2} rx={1.4} />
        <rect className="gt-base" x={-5} y={0.9} width={10} height={3.2} rx={1.4} />
        <text className={'gt-caption' + (lampMark ? ' is-' + lampMark : '')} y={24}>{lampOn ? 'горит' : 'не горит'}</text>
      </g>
    </svg>
  )
}

// A truth table turned on its side: one column per combination of switches, the last row is the lamp.
export function TruthTable({ inputs, cols, current, title }: {
  inputs: string[]
  cols: { vals: boolean[]; lamp: boolean | null; mark?: Mark }[]
  current?: number
  title?: string
}) {
  return (
    <div className="gt-table-wrap">
      {title && <div className="gt-table-title">{title}</div>}
      <table className="gt-table">
        <tbody>
          {inputs.map((name, r) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              {cols.map((c, i) => <td key={i} className={i === current ? 'is-current' : undefined}>{c.vals[r] ? 1 : 0}</td>)}
            </tr>
          ))}
          <tr className="gt-table-lamp">
            <th scope="row">Лампа</th>
            {cols.map((c, i) => (
              <td key={i} className={(i === current ? 'is-current' : '') + (c.mark ? ' is-' + c.mark : '')}>
                {c.lamp === null
                  ? <span className="gt-dot is-unknown" aria-label="пока неизвестно">?</span>
                  : <span className={'gt-dot' + (c.lamp ? ' is-on' : '')} aria-label={c.lamp ? 'горит' : 'не горит'} />}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Every combination of n switches in counting order: 00, 01, 10, 11.
export function combos(n: number) {
  return Array.from({ length: 2 ** n }, (_, k) => Array.from({ length: n }, (_, i) => ((k >> (n - 1 - i)) & 1) === 1))
}
