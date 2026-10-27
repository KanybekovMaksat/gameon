import type { ComponentType } from 'react'
import type { IconName } from '../components'
import type { Exercise } from '../exercises/kit'

// An explanation card: a short text and, when it helps, a picture or a small animation.
// In `body`, a blank line starts a new paragraph and `backticks` mark code.
export type Explain = { id: string; title: string; body: string; visual?: ComponentType }

export type Lesson = {
  id: string
  title: string
  minutes: number
  explain: Explain[]
  practice: Exercise[]
  // A small task the child gives to a parent after the lesson.
  parentTask?: string
}

export type Topic = {
  id: string
  title: string
  subtitle: string
  icon: IconName
  lessons: Lesson[]
  // The topic opens only after its lesson in the office: office and phone unlock each other.
  office?: string
}
