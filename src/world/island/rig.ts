import { useGLTF } from '@react-three/drei'
import { LoopOnce, type AnimationAction, type Group } from 'three'

// Animation weights for a Kenney Mini character: idle, walk and sprint blended by speed, and a short emote on top.

export const WALK = 2.3
export const RUN = 5.2

export type Emote = { name: string; t: number; dur: number }
export type Rig = { group: Group; actions: Record<string, AnimationAction | null> }

export const LOCO = ['idle', 'walk', 'sprint'] as const
export const EMOTES = ['emote-yes', 'interact-right'] as const
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Weights from speed: idle into walk as the child starts, walk into sprint as the child runs. An emote takes over
// for its length and hands back smoothly.
export function blend(rig: Rig, speed: number, emote: Emote | null) {
  const a = rig.actions
  const move = smooth(0.08, 0.9, speed)
  const run = smooth(WALK + 0.4, RUN - 0.6, speed)
  let e = 0
  if (!emote) for (const n of EMOTES) a[n]?.setEffectiveWeight(0)
  else {
    const act = a[emote.name]
    if (act && !act.isRunning() && emote.t < 0.05) { act.reset(); act.setLoop(LoopOnce, 1); act.clampWhenFinished = true; act.play() }
    e = Math.min(1, emote.t / 0.15, (emote.dur - emote.t) / 0.2)
    act?.setEffectiveWeight(Math.max(0, e))
  }
  const k = 1 - Math.max(0, e)
  a.idle?.setEffectiveWeight((1 - move) * k)
  a.walk?.setEffectiveWeight(move * (1 - run) * k)
  a.sprint?.setEffectiveWeight(move * run * k)
  a.walk?.setEffectiveTimeScale(Math.max(0.7, Math.min(1.6, speed / 2.1)))
  a.sprint?.setEffectiveTimeScale(Math.max(0.8, Math.min(1.4, speed / 4.8)))
}

export function preloadCharacters(files: string[]) {
  for (const f of files) useGLTF.preload(f)
}
