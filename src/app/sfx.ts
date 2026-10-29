import { useApp } from './store'

// Short sounds made with Web Audio, no files. Vibration where the phone supports it.
let ctx: AudioContext | null = null

function tone(freq: number, start: number, dur: number, gain = 0.08, type: OscillatorType = 'sine') {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  const t = ctx.currentTime + start
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

const SOUNDS = {
  ok: () => { tone(660, 0, 0.18); tone(990, 0.09, 0.28) },
  bad: () => { tone(220, 0, 0.22, 0.07, 'triangle') },
  xp: () => { tone(1320, 0, 0.12, 0.05); tone(1760, 0.06, 0.16, 0.05) },
  tap: () => { tone(880, 0, 0.05, 0.03) },
  // A detent or a snap: a soft click with a short buzz, for sliders, dials and blocks that land.
  tick: () => { tone(1500, 0, 0.025, 0.02, 'square') },
  finish: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.35, 0.07)) },
}

const BUZZ: Partial<Record<keyof typeof SOUNDS, number | number[]>> = { tick: 8, ok: 20, bad: [30, 40, 30], finish: [20, 60, 20] }

export function sfx(name: keyof typeof SOUNDS) {
  if (!useApp.getState().sound) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    SOUNDS[name]()
    const b = BUZZ[name]
    if (b && 'vibrate' in navigator) navigator.vibrate(b)
  } catch { /* audio is a nicety */ }
}
