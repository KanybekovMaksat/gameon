import type { ComponentType } from 'react'

// One way to practise a topic, built as a small working lesson of its own. The lab shows several side by side,
// so the team can compare forms of interaction on a phone before one goes into the lessons.
// The record of what was learned lives in the hub, `notes/exercise-patterns.md`; the lab shows the same words.
// Texts are Russian, one sentence each: `what` the child does, `why` it helps, `verdict` the decision, `from` the source.
// A dropped form keeps its card but has no `Component`.
export type LabStatus = 'base' | 'extra' | 'dropped'

export type LabVariant = {
  id: string
  title: string
  tagline: string
  status: LabStatus
  what: string
  why: string
  verdict: string
  from: string
  Component?: ComponentType
}

export const STATUS: Record<LabStatus, string> = { base: 'Основа', extra: 'Дополнительный', dropped: 'Отклонён' }
