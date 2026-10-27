// What the island's HUD and its 3D scene share. The scene is a lazy chunk; this file has no three.js, so the HUD
// and the demo panel import it without loading the scene. It lives for the app load: the fly-over plays once,
// and the child comes back where they were after a lesson.

export type Spot = { x: number; z: number; face: number }

// A request from the HUD to the scene; the scene takes it in its next frame.
export type Command =
  | { kind: 'lesson' }
  | { kind: 'stop' }
  | { kind: 'enter' }
  | { kind: 'exit' }
  | { kind: 'release' }

// A demo scene or a progress reset: it sets the island up from whatever state it is in.
// world: the child at the start and the fly-over; class: the child inside the school; gate: the gate opens in view;
// reset: the child at the start, no cards.
export type Scene = 'world' | 'class' | 'gate' | 'reset'

export const island = {
  // A spot asked for (after a lesson, by its pad); the scene puts the child there when it is next on screen.
  spawn: null as Spot | null,
  introDone: false,
  hintDone: false,
  // The loading screen has faded: the fly-over may start.
  shown: false,
  // A scene the 3D has not taken yet (it may not be mounted).
  scene: null as Scene | null,
  cmd: null as Command | null,
  // HUD elements the scene moves every frame without React: the floating joystick, the edge pointer and labels.
  joy: null as HTMLElement | null,
  edge: null as HTMLElement | null,
  labels: new Map<string, HTMLElement>(),
  // Changes when a label comes or goes, so the scene rebuilds its list only then.
  labelsV: 0,
  // Pixels the HUD covers at the top and at the bottom; the camera keeps the child in the space between.
  insetTop: 76,
  insetBottom: 150,
}

export function setLabel(id: string, el: HTMLElement | null) {
  if (el) island.labels.set(id, el)
  else island.labels.delete(id)
  island.labelsV++
}

export function send(cmd: Command) {
  island.cmd = cmd
}

// Intents the scene takes later: the newest wins. The spot after a lesson replaces a scene not taken yet, and a scene
// replaces a spot and a command.
export function setSpawn(sp: Spot | null) {
  island.spawn = sp
  island.scene = null
}

const listeners = new Set<(s: Scene) => void>()

// The HUD listens, to close the class room, cards and walks before a scene.
export function onScene(fn: (s: Scene) => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function playScene(s: Scene) {
  island.scene = s
  island.cmd = null
  island.spawn = null
  if (s === 'world') island.introDone = false
  if (s === 'world' || s === 'reset') island.hintDone = false
  listeners.forEach((fn) => fn(s))
}
