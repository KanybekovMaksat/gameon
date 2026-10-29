import { LESSONS, TOPICS } from '../../content'
import type { LessonState } from '../../app/store'
import { buildStations, roadAt, frontOf, OFFICE, QUEST, KIOSK, SCHOOL, type P } from './layout'
import type { Spot } from './bus'

// The island's plan for the course: one station per topic in TOPICS order, one pad per lesson.
// No three.js here: the HUD reads it too.
export const STATIONS = buildStations(TOPICS)
export const PADS = STATIONS.flatMap((st) => st.pads.map((p) => ({ ...p, topicId: st.topicId })))
export const GATES = STATIONS.filter((st) => st.gate).map((st) => ({ topicId: st.topicId, ...st.gate! }))

// A creek runs across the island from shore to shore and passes under the road only at the gate, so a closed gate
// really closes the rest of the road. Two arms: north of the road to the west shore, south of it to the east shore.
export const CREEK_W = 0.9
export const CREEK: P[][] = (() => {
  const g = GATES[0]
  if (!g) return []
  // Across the road: the road's normal; +n is the left of the way forward (north on this row).
  const nx = Math.cos(g.heading), nz = -Math.sin(g.heading)
  const at = (k: number): P => ({ x: g.x + nx * k, z: g.z + nz * k })
  return [
    [at(1.0), at(3.4), { x: g.x - 0.4, z: -6.8 }, { x: -1.6, z: -9.9 }, { x: -6, z: -10.9 }, { x: -10.5, z: -11.15 }, { x: -15, z: -10.9 }, { x: -23.5, z: -10.6 }],
    [at(-1.0), at(-3.2), { x: g.x + 1.1, z: 1.2 }, { x: 4.8, z: 3.6 }, { x: 9.5, z: 5.7 }, { x: 15, z: 6.9 }, { x: 25.5, z: 7.4 }],
  ]
})()

export const padOf = (lessonId: string) => PADS.find((p) => p.lessonId === lessonId)

// Where the child stands after a lesson: a step before its pad, facing along the road, so the done pad and the
// road ahead to the next lesson are in view.
export function spotAfter(lessonId: string): Spot | null {
  const pad = padOf(lessonId)
  if (!pad) return null
  const p = roadAt(pad.s - 1.9)
  return { x: p.x, z: p.z, face: p.heading }
}

// Where «К миссии» leads: the current lesson; when the next lesson waits for the office, the gate before it;
// when everything is done, the last pad.
export function goalOf(states: Record<string, LessonState>): { key: string; s: number; x: number; z: number } {
  const now = LESSONS.find(({ lesson }) => states[lesson.id] === 'now')
  if (now) {
    const p = padOf(now.lesson.id)!
    return { key: 'pad:' + p.lessonId, s: p.s, x: p.x, z: p.z }
  }
  const office = LESSONS.find(({ lesson }) => states[lesson.id] === 'office')
  const gate = office && GATES.find((g) => g.topicId === office.topic.id)
  if (gate) {
    const p = roadAt(gate.s - 1.3)
    return { key: 'gate:' + gate.topicId, s: gate.s - 1.3, x: p.x, z: p.z }
  }
  const last = PADS[PADS.length - 1]
  return { key: 'pad:' + last.lessonId, s: last.s, x: last.x, z: last.z }
}

// Places the child can walk up to and use. `at` is where the child stands; `r` how close counts as near.
export type PlaceId = 'school' | 'rewards' | 'quest' | 'office'
export const PLACES: { id: PlaceId; at: P; face: number; r: number }[] = [
  { id: 'school', at: frontOf(SCHOOL, 0.9), face: SCHOOL.rot + Math.PI, r: 1.8 },
  { id: 'rewards', at: frontOf(KIOSK, 1.0), face: KIOSK.rot + Math.PI, r: 1.9 },
  { id: 'quest', at: frontOf(QUEST, 1.3), face: QUEST.rot + Math.PI, r: 2 },
  { id: 'office', at: frontOf(OFFICE, 0.9), face: OFFICE.rot + Math.PI, r: 2 },
]
