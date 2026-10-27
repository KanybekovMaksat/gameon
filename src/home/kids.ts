import { KIDS, type Kid } from '../components'
import type { Topic } from '../content/types'

// Groupmates online are shown at the lesson they are on: presence on the path, without their scores.
// The map and the island both place them by this rule.
export function kidsAt(topic: Topic, lessonIndex: number): Kid[] {
  return KIDS.filter((k) => k.online && !k.me && k.topic === topic.title && Math.min(topic.lessons.length - 1, k.done >= 3 ? 1 : 0) === lessonIndex)
}
