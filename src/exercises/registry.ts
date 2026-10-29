import { blocks } from './blocks'
import { bug } from './bug'
import { choice } from './choice'
import { gap } from './gap'
import { gates } from './gates'
import { grid } from './grid'
import type { Exercise, Kind } from './kit'
import { order } from './order'
import { pattern } from './pattern'
import { pixels } from './pixels'
import { predict } from './predict'
import { sort } from './sort'
import { teach } from './teach'
import { trace } from './trace'

// One line per exercise kind. A new kind is added here and nowhere else.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KINDS: Kind<any>[] = [choice, predict, order, bug, teach, grid, gap, trace, blocks, gates, sort, pixels, pattern]

const BY_KIND = new Map(KINDS.map((k) => [k.kind, k]))

export function kindOf(ex: Exercise) {
  const k = BY_KIND.get(ex.kind)
  if (!k) throw new Error(`Unknown exercise kind: ${ex.kind}`)
  return k
}
