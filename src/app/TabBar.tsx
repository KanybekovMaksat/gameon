import { Icon, type IconName } from '../components'
import { navigate } from './router'
import { sfx } from './sfx'
import './tabbar.css'

const TABS: [string, string, IconName][] = [['/', 'Остров', 'home'], ['/tasks', 'Миссии', 'play'], ['/rewards', 'Награды', 'trophy'], ['/profile', 'Профиль', 'user']]

// A tap on the open tab brings its page back to the top, as on a phone. On home it also steps out of the class
// room back to the island (`home-reselect`).
function toTop() {
  dispatchEvent(new Event('home-reselect'))
  const box = document.querySelector('.tab-pane:not([hidden]) :is(.home-scroll, .tasks-scroll, .rw-scroll, .prof-scroll)')
  box?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

// The bottom tabs outside a lesson. Sheets on a screen cover it, the way a phone sheet covers its tab bar.
export function TabBar({ path }: { path: string }) {
  const current = TABS.find(([to]) => to !== '/' && path.startsWith(to))?.[0] ?? '/'
  return (
    <nav className="tabbar" aria-label="Разделы">
      {TABS.map(([to, label, icon]) => (
        <button
          key={to}
          className={'tabbar-tab' + (to === current ? ' is-on' : '')}
          aria-current={to === current ? 'page' : undefined}
          onClick={() => { if (to === current) toTop(); else { sfx('tap'); navigate(to) } }}
        >
          <span className="tabbar-icon"><Icon name={icon} size={22} /></span>
          {label}
        </button>
      ))}
    </nav>
  )
}
