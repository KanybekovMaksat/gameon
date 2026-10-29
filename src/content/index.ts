import { biology } from './biology'
import { geography } from './geography'
import { history } from './history'
import { informatics } from './informatics'
import { math } from './math'
import { physics } from './physics'
import { russian } from './russian'
import type { Lesson, Topic } from './types'

// Subjects in the order of the island's road: one building and one station per subject. One line per subject.
export const TOPICS: Topic[] = [
  math,
  informatics,
  russian,
  history,
  geography,
  biology,
  physics,
]

// All lessons in path order; a lesson opens when the one before it is done.
export const LESSONS: { topic: Topic; lesson: Lesson }[] = TOPICS.flatMap((topic) => topic.lessons.map((lesson) => ({ topic, lesson })))

export function findLesson(lessonId: string) {
  return LESSONS.find((l) => l.lesson.id === lessonId)
}
