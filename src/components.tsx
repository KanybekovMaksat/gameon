import { useContext, useId, type ReactNode } from 'react'
import { CastContext } from './rewards/cast'
import { levelOf, portraitOf } from './rewards/catalog'

export type Kid = {
  name: string
  topic: string
  done: number
  online: boolean
  // Away for days: the seat in the class room stays empty.
  away?: boolean
  me?: boolean
}

// Other children are scripted in the prototype. `online` matches who the mentor screen shows as active now. The index of a child is their seat in the class room.
// Avatars are portraits of the room characters; the child's own follows the character chosen in «Награды».
export const KIDS: Kid[] = [
  { name: 'Амир', topic: 'Информатика', done: 3, online: true, me: true },
  { name: 'Айдана', topic: 'Информатика', done: 4, online: true },
  { name: 'Эмир', topic: 'Информатика', done: 1, online: false },
  { name: 'Алина', topic: 'Информатика', done: 4, online: true },
  { name: 'Нурсултан', topic: 'Математика', done: 4, online: false },
  { name: 'Дана', topic: 'Математика', done: 1, online: false, away: true },
]

export type IconName =
  | 'check' | 'lock' | 'close' | 'x' | 'arrow' | 'redo' | 'loop' | 'spark'
  | 'steps' | 'branch' | 'box' | 'gate' | 'binary' | 'sort' | 'flame' | 'home' | 'bag' | 'user'
  | 'send' | 'share' | 'back' | 'play' | 'building' | 'sound' | 'mute' | 'users' | 'flag'
  | 'math' | 'book' | 'scroll' | 'globe' | 'leaf' | 'atom' | 'star' | 'trophy'

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'steps': return <svg {...p}><path d="M4 19h5v-5h5V9h6" /><path d="M17 6l3 3-3 3" /></svg>
    case 'branch': return <svg {...p}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7v10M18 10c0 4-5 3-11 7" /></svg>
    case 'box': return <svg {...p}><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" /></svg>
    case 'gate': return <svg {...p}><path d="M5 5h6a7 7 0 0 1 0 14H5z" /><path d="M2 9h3M2 15h3M18 12h4" /></svg>
    case 'binary': return <svg {...p}><rect x="4" y="4" width="4" height="7" rx="2" /><path d="M14 4v7M12 5.5l2-1.5M6 13v7M4 14.5L6 13" /><rect x="14" y="13" width="4" height="7" rx="2" /></svg>
    case 'sort': return <svg {...p}><path d="M5 20V14M10 20V10M15 20V7M20 20V4" /></svg>
    case 'flame': return <svg {...p}><path d="M12 21c4 0 7-2.7 7-6.5 0-3-2-5.5-3.5-7-.3 1.8-1.2 3-2.5 3.5.5-3-1-6-4-8 0 3-1.5 5-3 6.6C4.8 10.8 5 12.5 5 14.5 5 18.3 8 21 12 21z" /></svg>
    case 'home': return <svg {...p}><path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></svg>
    case 'bag': return <svg {...p}><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
    case 'user': return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" /></svg>
    case 'users': return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.5-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.9 2.6 2.7 3 5.2" /></svg>
    case 'send': return <svg {...p}><path d="M5 12h13M13 6l6 6-6 6" /></svg>
    case 'share': return <svg {...p}><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /></svg>
    case 'back': return <svg {...p}><path d="M15 5l-7 7 7 7" /></svg>
    case 'play': return <svg {...p}><path d="M8 5.5v13l10-6.5z" /></svg>
    case 'building': return <svg {...p}><path d="M4 20V6l8-3v17M12 8l8 3v9M2 20h20M7.5 9h1M7.5 13h1M15.5 13h1M15.5 16.5h1" /></svg>
    case 'sound': return <svg {...p}><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></svg>
    case 'mute': return <svg {...p}><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M16 10l4 4M20 10l-4 4" /></svg>
    case 'flag': return <svg {...p}><path d="M6 21V4M6 4h11l-2 4 2 4H6" /></svg>
    case 'check': return <svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    case 'x': return <svg {...p}><path d="M7 7l10 10M17 7L7 17" /></svg>
    case 'close': return <svg {...p} strokeWidth={1.75}><path d="M6 6l12 12M18 6L6 18" /></svg>
    case 'arrow': return <svg {...p}><path d="M5 12h13M13 7l5 5-5 5" /></svg>
    case 'redo': return <svg {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></svg>
    case 'lock': return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
    case 'loop': return <svg {...p}><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>
    case 'math': return <svg {...p}><path d="M7 4v6M4 7h6M14.5 7h5.5M4.5 15.5l5 5M9.5 15.5l-5 5M14.5 16h5.5M14.5 20h5.5" /></svg>
    case 'book': return <svg {...p}><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" /><path d="M12 6.5v13" /></svg>
    case 'scroll': return <svg {...p}><path d="M4 20h16M5 20v-9M9.5 20v-9M14.5 20v-9M19 20v-9M3.5 11h17L12 4z" /></svg>
    case 'globe': return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 3.6 5.4 3.6 8.5s-1.1 6-3.6 8.5c-2.5-2.5-3.6-5.4-3.6-8.5S9.5 6 12 3.5z" /></svg>
    case 'leaf': return <svg {...p}><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19l8-8" /></svg>
    case 'atom': return <svg {...p}><circle cx="12" cy="12" r="1.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)" /></svg>
    case 'star': return <svg {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>
    case 'trophy': return <svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8.5 20h7M9.5 17h5v3h-5z" /></svg>
    case 'spark': return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>
  }
}

// XP: a flat gold badge with a star. No gradient, no glow.
export function XpMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="var(--xp)" />
      <circle cx="12" cy="12" r="8.2" stroke="var(--xp-ring)" strokeWidth="1.4" />
      <path d="M12 7.3l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z" fill="var(--xp-mark)" stroke="var(--xp-mark)" strokeWidth="0.8" />
    </svg>
  )
}

// The child's XP; `level` shows the level next to it, as in the header.
export function Xp({ amount, big, level }: { amount: number; big?: boolean; level?: boolean }) {
  return (
    <span className={'xp' + (big ? ' is-big' : '')} aria-label={level ? `Уровень ${levelOf(amount)}, ${amount} XP` : `${amount} XP`}>
      <XpMark size={big ? 30 : 20} />
      {level ? <>Ур. {levelOf(amount)}</> : <>{amount} XP</>}
    </span>
  )
}

export function Progress({ value }: { value: number }) {
  return <div className="progress"><div style={{ width: `${Math.max(4, Math.round(value * 100))}%` }} /></div>
}

export function Avatar({ kid, showName }: { kid: Kid; showName?: boolean }) {
  const cast = useContext(CastContext)
  return (
    <div>
      <div className={'avatar' + (kid.me ? ' is-me' : '')}>
        <img src={portraitOf(cast[KIDS.indexOf(kid)])} alt={kid.name} />
        {kid.online && !kid.me && <span className="dot" />}
      </div>
      {showName && <div className="avatar-name">{kid.name}</div>}
    </div>
  )
}

export function TopicNode({ state, children }: { state: 'done' | 'now' | 'locked'; children?: ReactNode }) {
  return (
    <button className={'node is-' + state} aria-label={state}>
      {state === 'done' ? <Icon name="check" /> : state === 'locked' ? <Icon name="lock" /> : children}
    </button>
  )
}

// Robik's mark: a screen with two eyes on the brand gradient.
export function HelperMark() {
  const id = useId()
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" role="img" aria-label="Робик">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3fd6b0" />
          <stop offset="1" stopColor="#0f9180" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="16" fill={`url(#${id})`} />
      <rect x="10" y="13" width="28" height="22" rx="8" fill="#fff" />
      <rect x="17.5" y="20" width="4" height="8" rx="2" fill="#122a2e" />
      <rect x="26.5" y="20" width="4" height="8" rx="2" fill="#122a2e" />
    </svg>
  )
}

export function AiFace() {
  return <span className="ai-face"><HelperMark /></span>
}

export function AiBubble({ children }: { children: ReactNode }) {
  return (
    <div className="ai">
      <AiFace />
      <div className="ai-bubble"><b>Робик</b>{children}</div>
    </div>
  )
}
