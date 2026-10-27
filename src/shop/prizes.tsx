import { useId } from 'react'

// Flat pictures of the real prizes, in the app colors: navy, brand blue, cyan, white, the codecoin gold.
// The brand gradient appears only on Codify marks (a sticker, a print).
const NAVY = '#0a1028'
const NAVY_2 = '#2a3150'
const BLUE = '#246fff'
const CYAN = '#00c4fa'
const SOFT = '#eef4ff'

function Shadow({ w }: { w: number }) {
  return <ellipse cx="60" cy="106" rx={w} ry="4.5" fill={NAVY} opacity="0.08" />
}

// The code brackets: the mark of Codify on its merch.
function Brackets({ x, y, s, color = '#fff', width = 3 }: { x: number; y: number; s: number; color?: string; width?: number }) {
  return (
    <path
      d={`M${x - s * 0.35} ${y - s * 0.5}L${x - s} ${y}l${s * 0.65} ${s * 0.5}M${x + s * 0.35} ${y - s * 0.5}L${x + s} ${y}l${-s * 0.65} ${s * 0.5}`}
      stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  )
}

function Stickers({ grad }: { grad: string }) {
  return (
    <>
      <Shadow w={38} />
      {/* The helper sticker, behind */}
      <g transform="rotate(12 82 44)">
        <rect x="62" y="24" width="40" height="40" rx="13" fill={NAVY} opacity="0.08" transform="translate(0 3)" />
        <rect x="62" y="24" width="40" height="40" rx="13" fill="#fff" />
        <rect x="66" y="28" width="32" height="32" rx="10" fill={`url(#${grad})`} />
        <rect x="71.5" y="35" width="21" height="17" rx="6" fill="#fff" />
        <rect x="77" y="40" width="3" height="7" rx="1.5" fill={NAVY} />
        <rect x="84" y="40" width="3" height="7" rx="1.5" fill={NAVY} />
      </g>
      {/* The codecoin sticker */}
      <g transform="rotate(-8 44 76)">
        <circle cx="44" cy="79" r="23" fill={NAVY} opacity="0.08" />
        <circle cx="44" cy="76" r="23" fill="#fff" />
        <circle cx="44" cy="76" r="19" fill="var(--coin)" />
        <circle cx="44" cy="76" r="14" stroke="var(--coin-ring)" strokeWidth="2" fill="none" />
        <Brackets x={44} y={76} s={7} color="var(--coin-mark)" width={3.2} />
      </g>
      {/* The brand sticker, in front */}
      <g transform="rotate(-14 42 38)">
        <rect x="18" y="17" width="48" height="44" rx="14" fill={NAVY} opacity="0.08" transform="translate(0 3)" />
        <rect x="18" y="17" width="48" height="44" rx="14" fill="#fff" />
        <rect x="22" y="21" width="40" height="36" rx="11" fill={`url(#${grad})`} />
        <Brackets x={42} y={39} s={11} width={3.6} />
      </g>
      {/* A star sticker with a lifted corner */}
      <g transform="rotate(10 86 84)">
        <path d="M86 66l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L86 94.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8z" fill="#fff" stroke="#fff" strokeWidth="7" strokeLinejoin="round" />
        <path d="M86 66l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L86 94.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8z" fill={CYAN} />
        <path d="M98.4 98.8l-6.2-1.2 2.5-5.6z" fill={SOFT} />
      </g>
    </>
  )
}

function Notebook() {
  return (
    <>
      <Shadow w={32} />
      {/* Pages */}
      <rect x="35" y="17" width="54" height="86" rx="7" fill="#fff" />
      <path d="M86 24v72" stroke="#e6e7eb" strokeWidth="2" />
      {/* Cover */}
      <rect x="29" y="14" width="56" height="88" rx="8" fill={NAVY} />
      <rect x="29" y="14" width="10" height="88" rx="5" fill={NAVY_2} />
      {/* Ribbon and elastic band */}
      <path d="M62 100v12l4-3 4 3v-12z" fill={CYAN} />
      <rect x="74" y="14" width="5" height="88" fill={BLUE} />
      {/* Brand print */}
      <Brackets x={56} y={50} s={10} width={3.4} />
      <rect x="47" y="70" width="18" height="3" rx="1.5" fill="#fff" opacity="0.35" />
    </>
  )
}

function Bottle() {
  return (
    <>
      <Shadow w={22} />
      {/* Cap with a loop */}
      <path d="M53 17a7 7 0 0 1 14 0" stroke={NAVY} strokeWidth="4" fill="none" />
      <rect x="47" y="15" width="26" height="14" rx="5" fill={NAVY} />
      <rect x="50" y="28" width="20" height="6" fill={NAVY_2} />
      {/* Body */}
      <path d="M42 46c0-8 5-12 12-12h12c7 0 12 4 12 12v52c0 5-3 8-8 8H50c-5 0-8-3-8-8z" fill={BLUE} />
      <rect x="48" y="44" width="4" height="52" rx="2" fill="#fff" opacity="0.28" />
      {/* Label */}
      <rect x="42" y="58" width="36" height="28" fill="#fff" />
      <Brackets x={60} y={72} s={8} color={NAVY} width={3.2} />
    </>
  )
}

function Tshirt({ grad }: { grad: string }) {
  return (
    <>
      <Shadow w={36} />
      <path
        d="M45 18L22 29.5c-2 1-2.8 3.4-1.8 5.4l6.4 13c1 2 3.4 2.8 5.4 1.8l4-2V99c0 2.8 2.2 5 5 5h37.9c2.8 0 5-2.2 5-5V47.7l4 2c2 1 4.4.2 5.4-1.8l6.4-13c1-2 .2-4.4-1.8-5.4L75 18c-2.5 6-8.3 9.5-15 9.5S47.5 24 45 18z"
        fill={NAVY}
      />
      <path d="M45 18c2.5 6 8.3 9.5 15 9.5S72.5 24 75 18" stroke={NAVY_2} strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* Chest print */}
      <rect x="47" y="46" width="26" height="24" rx="8" fill={`url(#${grad})`} />
      <Brackets x={60} y={58} s={7} width={2.8} />
    </>
  )
}

function Headphones() {
  return (
    <>
      <Shadow w={36} />
      {/* Headband */}
      <path d="M27 70V56a33 33 0 0 1 66 0v14" stroke={NAVY} strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M39 32a29 29 0 0 1 42 0" stroke={BLUE} strokeWidth="8" fill="none" strokeLinecap="round" />
      {/* Ear cups */}
      <rect x="16" y="58" width="24" height="40" rx="11" fill={BLUE} />
      <rect x="34" y="63" width="11" height="30" rx="5.5" fill={NAVY} />
      <rect x="80" y="58" width="24" height="40" rx="11" fill={BLUE} />
      <rect x="75" y="63" width="11" height="30" rx="5.5" fill={NAVY} />
      <rect x="21" y="64" width="4" height="20" rx="2" fill="#fff" opacity="0.3" />
      <rect x="85" y="64" width="4" height="20" rx="2" fill="#fff" opacity="0.3" />
    </>
  )
}

export function PrizeArt({ id }: { id: string }) {
  const grad = useId()
  return (
    <svg viewBox="7 7 106 106" width="100%" height="100%" aria-hidden>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00c4fa" />
          <stop offset="1" stopColor="#246fff" />
        </linearGradient>
      </defs>
      {id === 'stickers' && <Stickers grad={grad} />}
      {id === 'notebook' && <Notebook />}
      {id === 'bottle' && <Bottle />}
      {id === 'tshirt' && <Tshirt grad={grad} />}
      {id === 'headphones' && <Headphones />}
    </svg>
  )
}
