import { algorithms } from './algorithms'
import { binary } from './binary'
import { conditions } from './conditions'
import { logic } from './logic'
import { loops } from './loops'
import { sorting } from './sorting'
import type { Lesson, Topic } from './types'
import { variables } from './variables'

// Topics in the order of the path. One line per topic.
export const TOPICS: Topic[] = [
  algorithms,
  loops,
  conditions,
  variables,
  logic,
  binary,
  sorting,
]

// All lessons in path order; a lesson opens when the one before it is done.
export const LESSONS: { topic: Topic; lesson: Lesson }[] = TOPICS.flatMap((topic) => topic.lessons.map((lesson) => ({ topic, lesson })))

export function findLesson(lessonId: string) {
  return LESSONS.find((l) => l.lesson.id === lessonId)
}
