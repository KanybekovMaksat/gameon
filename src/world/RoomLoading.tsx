import './world.css'

// The class room drawn flat, at the angle of the 3D room: floor, walls, board and the six desks.
const DESKS = [
  'M95.3 81.8 L111.1 91 L102.7 95.8 L86.9 86.7 Z', 'M131.5 102.7 L147.3 111.9 L138.9 116.7 L123.1 107.6 Z',
  'M73.8 94.2 L89.6 103.4 L81.2 108.2 L65.4 99.1 Z', 'M110 115.1 L125.8 124.3 L117.4 129.1 L101.6 120 Z',
  'M52.3 106.6 L68.1 115.8 L59.7 120.6 L43.9 111.5 Z', 'M88.5 127.5 L104.3 136.7 L95.9 141.5 L80.1 132.4 Z',
]
const FRONTS = [
  'M86.9 86.7 L102.7 95.8 L102.7 99.7 L86.9 90.6 Z', 'M123.1 107.6 L138.9 116.7 L138.9 120.6 L123.1 111.5 Z',
  'M65.4 99.1 L81.2 108.2 L81.2 112.1 L65.4 103 Z', 'M101.6 120 L117.4 129.1 L117.4 133 L101.6 123.9 Z',
  'M43.9 111.5 L59.7 120.6 L59.7 124.5 L43.9 115.4 Z', 'M80.1 132.4 L95.9 141.5 L95.9 145.4 L80.1 136.3 Z',
]

// The room while its code and models load: a calm outline of the class and a thin progress line.
// Without `progress` the line runs on its own (the room's code is still loading); `done` fades it out.
export function RoomLoading({ progress, done, inset = 0 }: { progress?: number; done?: boolean; inset?: number }) {
  return (
    <div className={'world-wait' + (done ? ' is-done' : '')} style={{ paddingTop: inset }} role="status" aria-live="polite">
      <svg className="world-wait-room" viewBox="8 8 206 168" aria-hidden>
        <path className="is-wall" d="M100.7 16.6 L204.8 76.7 L204.8 118.5 L100.7 58.4 Z" />
        <path className="is-wall is-side" d="M100.7 16.6 L100.7 58.4 L15.8 107.4 L15.8 65.6 Z" />
        <path className="is-floor" d="M100.7 58.4 L204.8 118.5 L119.9 167.5 L15.8 107.4 Z" />
        <path className="is-board" d="M132.4 43.4 L177.6 69.5 L177.6 93.1 L132.4 66.9 Z" />
        {DESKS.map((d, i) => (
          <g key={i} className="is-desk" style={{ animationDelay: `${i * 90}ms` }}>
            <path d={FRONTS[i]} className="is-front" />
            <path d={d} />
          </g>
        ))}
      </svg>
      <div className={'world-wait-bar' + (progress == null ? ' is-idle' : '')}>
        <i style={progress == null ? undefined : { width: `${Math.max(8, Math.min(100, progress))}%` }} />
      </div>
      <small>Собираем класс{progress == null ? '' : ` · ${Math.round(progress)}%`}</small>
    </div>
  )
}
