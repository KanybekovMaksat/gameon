import type { Item, Repeat } from '../../../exercises/robot'

// A place in the program: `rep` is the id of the repeat block whose mouth holds it, null for the top level.
export type Where = { rep: number | null; index: number }

// Takes a block out of the program, a repeat block with everything inside it.
export function take(prog: Item[], id: number): { rest: Item[]; item: Item; where: Where } | null {
  const top = prog.findIndex((it) => it.id === id)
  if (top >= 0) return { rest: prog.filter((_, i) => i !== top), item: prog[top], where: { rep: null, index: top } }
  for (const it of prog) {
    if (it.t !== 'rep') continue
    const k = it.body.findIndex((c) => c.id === id)
    if (k >= 0) {
      const next: Repeat = { ...it, body: it.body.filter((_, i) => i !== k) }
      return { rest: prog.map((x) => (x === it ? next : x)), item: it.body[k], where: { rep: it.id, index: k } }
    }
  }
  return null
}

// Puts a block at a place. A repeat block never goes inside another one: the engine has one level of loops.
export function put(prog: Item[], where: Where, item: Item): Item[] {
  if (where.rep === null) return [...prog.slice(0, where.index), item, ...prog.slice(where.index)]
  if (item.t === 'rep') return prog
  return prog.map((it) => (it.id === where.rep && it.t === 'rep'
    ? { ...it, body: [...it.body.slice(0, where.index), item, ...it.body.slice(where.index)] }
    : it))
}

export const isComplete = (prog: Item[]) => prog.length > 0 && prog.every((it) => it.t !== 'rep' || it.body.length > 0)
