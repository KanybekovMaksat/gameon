import { lazy, Suspense, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { findLesson } from '../content'
import { HomeMap } from '../home/HomeMap'
import { HomeRoom } from '../home/HomeRoom'
import { HomeWorld } from '../home/HomeWorld'
import { Profile } from '../profile/Profile'
import { Session } from '../session/Session'
import { CastContext } from '../rewards/cast'
import { castOf } from '../rewards/catalog'
import { Rewards } from '../rewards/Rewards'
import { LabScreen } from '../lab/LabPage'
import { useKeyboard } from './keyboard'
import { match, navigate, useHref, usePath } from './router'
import { useApp } from './store'
import { TabBar } from './TabBar'
import { Tasks } from '../tasks/Tasks'

const DesignPage = lazy(() => import('../design/DesignPage'))
const MentorPage = lazy(() => import('../mentor/MentorPage'))

function Home() {
  const home = useApp((s) => s.home)
  return home === 'room' ? <HomeRoom /> : home === 'map' ? <HomeMap /> : <HomeWorld />
}

// Home, tasks, rewards and profile share one screen. Each tab stays mounted once opened, so it keeps its place and the
// class room is not rebuilt; tabs switch at once, as on a phone.
function Tabs({ path }: { path: string }) {
  const tab = path === '/tasks' ? 'tasks' : path === '/rewards' ? 'rewards' : path === '/profile' ? 'profile' : 'home'
  const [seen, setSeen] = useState(() => [tab])
  if (!seen.includes(tab)) setSeen([...seen, tab])
  return (
    <>
      <div className="tab-pane" hidden={tab !== 'home'}><Home /></div>
      {seen.includes('tasks') && <div className="tab-pane" hidden={tab !== 'tasks'}><Tasks /></div>}
      {seen.includes('rewards') && <div className="tab-pane" hidden={tab !== 'rewards'}><Rewards /></div>}
      {/* The demo controls are on the profile. */}
      {seen.includes('profile') && <div className="tab-pane" hidden={tab !== 'profile'}><Profile demo /></div>}
    </>
  )
}

// An unknown address goes home after render, not during it.
function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }) }, [to])
  return null
}

// A lesson restarts when its address changes, including the query (`?at=teach` from the presenter's script).
function LessonScreen({ href, active }: { href: string; active: boolean }) {
  const found = findLesson(match('/lesson/:id', href.split('?')[0])?.id ?? '')
  if (!found) return null
  return <Session topic={found.topic} lesson={found.lesson} active={active} />
}

// The lesson comes up over the tabs like a full-screen modal and goes down the same way.
type Phase = 'enter' | 'on' | 'leave'
const SLIDE = 340
const quick = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// The browser's bar takes the color at the top of the screen: grey over the class room, white elsewhere.
function useThemeColor(key: string, on: boolean) {
  useEffect(() => {
    if (!on) return
    const raf = requestAnimationFrame(() => {
      let el = document.elementFromPoint(innerWidth / 2, 1)
      while (el && /^(transparent|rgba\(.*, 0\))$/.test(getComputedStyle(el).backgroundColor)) el = el.parentElement
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', el ? getComputedStyle(el).backgroundColor : '#ffffff')
    })
    return () => cancelAnimationFrame(raf)
  }, [key, on])
}

// A long press on a phone must not open the browser's menu, except on text the child may copy.
function onContextMenu(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('input, textarea, .selectable')) e.preventDefault()
}

function Shell({ path }: { path: string }) {
  const href = useHref()
  const home = useApp((s) => s.home)
  const mobile = useRef<HTMLDivElement>(null)

  const lessonId = match('/lesson/:id', path)?.id
  const lessonHref = lessonId && findLesson(lessonId) ? href : null
  const inLesson = path.startsWith('/lesson')
  // The lab page is a screen over the tabs too: the tabs stay mounted under it and come back as they were.
  const inLab = path.startsWith('/lab/')

  // The tab under a lesson or the lab stays the one it was opened from.
  const [tabPath, setTabPath] = useState(inLesson || inLab ? '/' : path)
  if (!inLesson && !inLab && path !== tabPath) setTabPath(path)

  const [layer, setLayer] = useState<{ href: string; phase: Phase } | null>(() => (lessonHref ? { href: lessonHref, phase: 'on' } : null))
  // A lesson opened by a link mounts the tabs only when it leaves.
  const [tabsOn, setTabsOn] = useState(!lessonHref)
  const [shown, setShown] = useState(lessonHref)
  if (shown !== lessonHref) {
    setShown(lessonHref)
    if (lessonHref) setLayer(layer && layer.phase !== 'leave' ? { href: lessonHref, phase: layer.phase } : { href: lessonHref, phase: quick() ? 'on' : 'enter' })
    else {
      setTabsOn(true)
      setLayer(layer && !quick() ? { ...layer, phase: 'leave' } : null)
    }
  }
  useEffect(() => {
    if (!layer || layer.phase === 'on') return
    const t = setTimeout(() => setLayer((l) => (l?.phase === 'enter' ? { ...l, phase: 'on' } : l?.phase === 'leave' ? null : l)), SLIDE)
    return () => clearTimeout(t)
  }, [layer])

  const phoneApp = path !== '/design' && path !== '/teacher'
  useKeyboard(mobile, phoneApp)
  useThemeColor(`${tabPath}|${layer?.phase}|${home}|${inLab}`, phoneApp)

  // iOS ignores `user-scalable=no`: a pinch on the app must not zoom it.
  useEffect(() => {
    if (!phoneApp) return
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', stop)
    return () => document.removeEventListener('gesturestart', stop)
  }, [phoneApp])

  if (path === '/design') {
    return <Suspense fallback={null}><DesignPage /></Suspense>
  }
  if (path === '/teacher') {
    return <Suspense fallback={null}><MentorPage /></Suspense>
  }
  // Once the lesson has fully come up, the tabs under it are hidden, not only covered: the class room stops drawing.
  const covered = layer?.phase === 'on' || inLab
  const screen = (
    <div className="tabs-host">
      {tabsOn && (
        <div className="tabs-layer" hidden={covered} inert={(!!layer && layer.phase !== 'leave') || inLab}>
          <div className="screen has-tabs">
            <Tabs path={tabPath} />
            {inLesson && !lessonHref && <Redirect to="/" />}
          </div>
          <TabBar path={tabPath} />
        </div>
      )}
      {layer && layer.phase !== 'on' && <div className={'lesson-dim is-' + layer.phase} aria-hidden />}
      {layer && (
        <div className={'lesson-layer is-' + layer.phase}>
          <LessonScreen key={layer.href} href={layer.href} active={layer.phase !== 'leave'} />
        </div>
      )}
      {/* The lab of task forms, full screen. */}
      {inLab && <div className="lesson-layer is-on"><div className="screen"><LabScreen path={path} wide={false} /></div></div>}
    </div>
  )

  // The game opens at once: full screen on a phone, a phone-wide column in the middle of a wide screen.
  return <div className="app-host"><div className="app-mobile" ref={mobile} onContextMenu={onContextMenu}>{screen}</div></div>
}

export default function App() {
  const path = usePath()
  const character = useApp((s) => s.character)
  const cast = useMemo(() => castOf(character), [character])

  // The splash in index.html fades out once the first screen has drawn.
  useEffect(() => {
    const boot = document.getElementById('boot')
    if (!boot) return
    boot.classList.add('is-done')
    const t = setTimeout(() => boot.remove(), 350)
    return () => clearTimeout(t)
  }, [])
  return <CastContext value={cast}><Shell path={path} /></CastContext>
}
