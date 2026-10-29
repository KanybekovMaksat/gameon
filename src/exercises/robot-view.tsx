import { useId } from 'react'
import { STEP, type Cmd, type Dir, type Frame, type Level } from './robot'

// Icons for the robot's commands, in the stroke style of the app icons.
export function CmdIcon({ t, size = 22 }: { t: Cmd | 'rep' | 'back' | 'exit'; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (t) {
    case 'F': return <svg {...p}><path d="M12 19.5V5M6.5 10.5L12 5l5.5 5.5" /></svg>
    case 'L': return <svg {...p}><path d="M16.5 19.5v-6a4.5 4.5 0 0 0-4.5-4.5H5.5" /><path d="M9.5 5l-4 4 4 4" /></svg>
    case 'R': return <svg {...p}><path d="M7.5 19.5v-6A4.5 4.5 0 0 1 12 9h6.5" /><path d="M14.5 5l4 4-4 4" /></svg>
    case 'rep': return <svg {...p}><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>
    case 'back': return <svg {...p}><path d="M9 5h10a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H9l-6-7z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" /></svg>
    case 'exit': return <svg {...p}><path d="M4 7v4a3 3 0 0 0 3 3h12" /><path d="M15 10l4 4-4 4" /></svg>
  }
}

// The robot is the helper's mark on wheels: the same screen face. Its eyes look where it will go.
export function RobotMark({ dir = 1 }: { dir?: Dir }) {
  const id = useId()
  const [dx, dy] = STEP[dir]
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3fd6b0" />
          <stop offset="1" stopColor="#0f9180" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="15" fill={`url(#${id})`} />
      <rect x="9" y="12" width="30" height="23" rx="8.5" fill="#fff" />
      <g className="robo-eyes" style={{ transform: `translate(${dx * 3}px, ${dy * 2.5}px)` }}>
        <rect x="17" y="19.5" width="4.2" height="8.5" rx="2.1" fill="#122a2e" />
        <rect x="26.8" y="19.5" width="4.2" height="8.5" rx="2.1" fill="#122a2e" />
      </g>
    </svg>
  )
}

export function FlagMark() {
  return (
    <svg viewBox="0 0 24 24" width="62%" height="62%" aria-hidden>
      <path d="M7 21V4" stroke="#122a2e" strokeWidth="2.2" strokeLinecap="round" />
      <path className="robo-flag-cloth" d="M7.5 4.5h10.2l-2.4 3.9 2.4 3.9H7.5z" fill="var(--accent)" />
    </svg>
  )
}

export function StarMark({ size = '58%' }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z" fill="var(--coin)" stroke="var(--coin-ring)" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export type Mark = 'trail' | 'hit' | 'miss' | 'end'

// The board: tiles, walls, stars, the flag and the robot. `marks` colors cells by key "x,y".
// `cell` is the largest cell size in px; by default a tall board gets smaller cells so it stays on screen.
export function Board({ lv, frame, marks, tone, win, cell }: {
  lv: Level; frame: Frame; marks?: Map<string, Mark>; tone?: 'ok' | 'bad'; win?: boolean; cell?: number
}) {
  const cells = []
  for (let y = 0; y < lv.rows; y++) {
    for (let x = 0; x < lv.cols; x++) {
      const k = `${x},${y}`
      const wall = lv.walls.some((w) => w.x === x && w.y === y)
      const star = lv.stars.findIndex((s) => s.x === x && s.y === y)
      const goal = lv.goal?.x === x && lv.goal?.y === y
      const m = marks?.get(k)
      const cls = 'robo-cell' + (wall ? ' is-wall' : '') + (goal ? ' is-goal' : '') + (m ? ` is-${m}` : '')
      cells.push(
        <div key={k} className={cls}>
          <i className="robo-tile" />
          {goal && <FlagMark />}
          {star >= 0 && <span className={'robo-star' + (frame.got.includes(star) ? ' is-got' : '')}><StarMark /></span>}
        </div>,
      )
    }
  }
  const [bx, by] = STEP[frame.dir]
  return (
    <div
      className={'robo-board' + (tone ? ` is-${tone}` : '')}
      style={{ ['--cols' as string]: lv.cols, ['--rows' as string]: lv.rows, ['--cell' as string]: `${cell ?? Math.min(52, Math.floor(200 / lv.rows))}px` }}
    >
      <div className="robo-grid">
        {cells}
        <div
          className={'robo-bot' + (frame.bump ? ' is-bump' : '') + (win ? ' is-win' : '')}
          style={{ transform: `translate(${frame.x * 100}%, ${frame.y * 100}%)`, ['--bx' as string]: bx, ['--by' as string]: by }}
        >
          <span className="robo-dir" style={{ transform: `rotate(${(frame.turn + lv.start.dir) * 90}deg)` }}><i /></span>
          <span className="robo-body"><RobotMark dir={frame.dir} /></span>
        </div>
      </div>
    </div>
  )
}
