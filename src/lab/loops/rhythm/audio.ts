import { useSyncExternalStore } from 'react'
import { sfx } from '../../../app/sfx'
import { useApp } from '../../../app/store'
import type { Inst } from './levels'

// Drum sounds made with Web Audio, no files, like `sfx`. The app's sound setting turns them off.
// The context asks for low latency, so a tap on the grid sounds at once.
let ctx: AudioContext | null = null
let out: AudioNode | null = null
let noise: AudioBuffer | null = null

// A mute for this variant only: it silences the drums and the variant's own `sfx` calls, not the lessons.
let muted = false
const subs = new Set<() => void>()
export function setMuted(v: boolean) { muted = v; subs.forEach((f) => f()) }
export const useMuted = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => muted)

const soundOn = () => useApp.getState().sound && !muted

// Every `sfx` call of the variant goes through here, so the local mute covers them too.
export function ui(name: Parameters<typeof sfx>[0]) { if (!muted) sfx(name) }

// The audio context, or null when the sound is off or the browser has no Web Audio.
// Call it inside a tap first: browsers start audio only after a gesture.
export function audio(): AudioContext | null {
  if (!soundOn()) return null
  try {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' })
      const comp = ctx.createDynamicsCompressor()
      const master = ctx.createGain()
      master.gain.value = 0.55
      master.connect(comp).connect(ctx.destination)
      out = master
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const d = noise.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

function noiseSource(c: AudioContext, t: number, dur: number) {
  const s = c.createBufferSource()
  s.buffer = noise
  s.start(t)
  s.stop(t + dur)
  return s
}

const VOICES: Record<Inst, (c: AudioContext, t: number, dest: AudioNode) => void> = {
  // A sine that drops fast in pitch.
  kick: (c, t, dest) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.14)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(1, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + 0.36)
  },
  // Three quick bursts of band-passed noise, then a short tail.
  clap: (c, t, dest) => {
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1300
    f.Q.value = 0.9
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    for (const dt of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(0.9, t + dt)
      g.gain.exponentialRampToValueAtTime(0.15, t + dt + 0.009)
    }
    g.gain.setValueAtTime(0.7, t + 0.031)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    noiseSource(c, t, 0.22).connect(f).connect(g).connect(dest)
  },
  // A short tick of high noise.
  hat: (c, t, dest) => {
    const f = c.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    noiseSource(c, t, 0.07).connect(f).connect(g).connect(dest)
  },
}

// One hit now: the answer to a tap.
// On a phone the context may still be waking up from the tap that made it; the hit waits for it, so the first tap is heard too.
export function hit(inst: Inst) {
  const c = audio()
  const dest = out
  if (!c || !dest) return
  const go = () => { try { VOICES[inst](c, c.currentTime, dest) } catch { /* audio is a nicety */ } }
  if (c.state === 'running') go()
  else void c.resume().then(go, () => {})
}

export const STEP_SEC = 0.2

// Plays a rhythm step by step and reports the step on screen. `step(i)` gives the instruments of step i,
// or null after the last one; it is read just before each step, so edits during play are heard.
// With the sound off the same clock runs silently, so the playhead still moves. Returns a stop function.
export function play(step: (i: number) => number | null, insts: Inst[], onStep: (i: number | null) => void): () => void {
  const c = audio()
  let bus: GainNode | null = null
  if (c && out) {
    bus = c.createGain()
    bus.connect(out)
  }
  const now = () => (c ? c.currentTime : performance.now() / 1000)
  // The screen follows what the ear hears, not what the context schedules.
  const lag = c ? (c.outputLatency || c.baseLatency || 0) : 0
  const t0 = now() + 0.05
  let next = 0
  let end = Infinity
  let shown = -1
  let raf = 0

  const schedule = () => {
    while (next < end && t0 + next * STEP_SEC < now() + 0.12) {
      const m = step(next)
      if (m === null) { end = next; break }
      if (c && bus && soundOn()) {
        const t = t0 + next * STEP_SEC
        insts.forEach((inst, k) => { if (m & (1 << k)) VOICES[inst](c, t, bus) })
      }
      next++
    }
  }
  const timer = setInterval(schedule, 25)
  schedule()

  const frame = () => {
    const i = Math.floor((now() - lag - t0) / STEP_SEC)
    if (i >= end) { stop(); onStep(null); return }
    if (i >= 0 && i !== shown) { shown = i; onStep(i) }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    cancelAnimationFrame(raf)
    if (c && bus) {
      const g = bus
      g.gain.setTargetAtTime(0, c.currentTime, 0.015)
      setTimeout(() => g.disconnect(), 200)
    }
  }
  return stop
}
