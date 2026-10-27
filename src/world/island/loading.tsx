import '../world.css'
import './loading.css'

// The island while its code and models load: a calm outline of the island with the road, and a thin progress
// line, in the manner of the class room's loading state. Without `progress` the line just runs.
export function IslandLoading({ progress, done }: { progress?: number; done?: boolean }) {
  return (
    <div className={'world-wait isle-wait' + (done ? ' is-done' : '')} role="status" aria-live="polite">
      <svg className="isle-wait-map" viewBox="0 0 200 220" aria-hidden>
        <path className="is-sand" d="M104 10 C150 12 186 44 190 96 C194 150 170 200 112 210 C56 218 14 186 10 124 C6 62 46 8 104 10 Z" />
        <path className="is-grass" d="M104 22 C144 24 176 52 179 98 C182 146 160 188 110 197 C62 204 26 176 22 122 C18 68 52 20 104 22 Z" />
        <path className="is-road" d="M100 172 C80 160 50 158 40 140 C32 122 60 116 100 116 C140 116 168 110 166 90 C164 70 130 72 96 72 C62 72 36 64 44 46 C52 32 90 36 118 34" />
        {[[100, 172], [52, 146], [120, 116], [160, 92], [88, 72], [52, 50]].map(([x, y], i) => (
          <circle key={i} className="is-pad" cx={x} cy={y} r="6.5" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </svg>
      <div className={'world-wait-bar' + (progress == null ? ' is-idle' : '')}>
        <i style={progress == null ? undefined : { width: `${Math.max(8, Math.min(100, progress))}%` }} />
      </div>
      <small>Собираем остров{progress == null ? '' : ` · ${Math.round(progress)}%`}</small>
    </div>
  )
}
