import { parseMap, plural, type Item, type Level, type Run } from '../../../exercises/robot'

// Three levels: what repeats and how many times, several blocks inside, and one block after the loop.
export type BlocksLevel = {
  title: string
  goal: string
  lv: Level
  max: number
  // Height of the right program in px, so the board gets the rest of the screen from the start.
  progH: number
  why: string
  hint: (run: Run, prog: Item[], tries: number) => string
}

// The numbers on the count slider of the repeat block.
export const COUNT_MIN = 2
export const COUNT_MAX = 6

// Hints go from general to specific: the first wrong try gets the first question of the list that fits the mistake.
const byTry = (list: string[], tries: number) => list[Math.min(Math.max(tries, 1), list.length) - 1]
const repOf = (prog: Item[]) => prog.find((it): it is Extract<Item, { t: 'rep' }> => it.t === 'rep')
const bodyIs = (prog: Item[], code: string) => repOf(prog)?.body.map((c) => c.t).join('') === code

export const LEVELS: BlocksLevel[] = [
  {
    title: 'Коридор',
    goal: 'Доведи робота до флажка, собери звёзды.',
    lv: parseMap(['>****F']),
    max: 2,
    progH: 132,
    why: 'Блок внутри повтора сработал пять раз.',
    hint: (run, prog, tries) => {
      if (run.outcome === 'long') return byTry(['Какой блок стоит несколько раз подряд?', 'Как сказать роботу повторить блок, а не ставить его снова?'], tries)
      if (!repOf(prog)) return byTry(['Какой блок умеет повторять другие блоки?', 'Что можно положить внутрь блока «повтори»?'], tries)
      if (run.outcome === 'short' || run.outcome === 'edge') return byTry(['Где остановился робот? Сколько клеток до флажка?', 'Сколько раз сейчас повторяется блок? Хватит ли этого до флажка?'], tries)
      return byTry(['Куда смотрит робот? Какой блок везёт его вперёд?', 'Что лежит внутри повтора?'], tries)
    },
  },
  {
    title: 'Лестница',
    goal: 'Подними робота к флажку, собери звёзды.',
    lv: parseMap(['....F', '...*.', '..*.#', '.*.##', '>.###']),
    max: 5,
    progH: 272,
    why: 'Повтор прошёл все четыре ступеньки.',
    hint: (run, prog, tries) => {
      if (run.outcome === 'long') return byTry(['Какие блоки повторяются на каждой ступеньке?', 'Что можно положить внутрь повтора, чтобы не ставить блоки заново?'], tries)
      if (bodyIs(prog, 'FLFR')) return byTry(['Где остановился робот? Сколько ступенек он прошёл?', 'Сколько ступенек до флажка? А сколько раз повторяется блок?'], tries)
      return byTry([
        'Какие движения робот делает на одной ступеньке?',
        'Куда смотрит робот в конце ступеньки? Сможет ли он пройти следующую так же?',
        'Сколько ступенек до флажка?',
      ], tries)
    },
  },
  {
    title: 'Спуск',
    goal: 'Спусти робота к флажку, собери звёзды.',
    lv: parseMap(['>....', '#*...', '##*..', '###*F']),
    max: 6,
    progH: 318,
    why: 'Шаг вне повтора выполнился один раз.',
    hint: (run, prog, tries) => {
      if (run.outcome === 'long') return byTry(['Какие блоки повторяются на каждой ступеньке?', 'Какие блоки можно убрать внутрь повтора?'], tries)
      // The classic mistake: the last step went into the loop, so it runs on every pass.
      if (bodyIs(prog, 'FRFLF') || bodyIs(prog, 'FFRFL')) {
        return byTry([
          'На какой ступеньке робот сбился?',
          'Что робот сделал лишнего на этой ступеньке?',
          'Какие блоки нужны на каждой ступеньке, а какой только в самом конце?',
          'Сколько раз выполняется блок внутри повтора? А блок после повтора?',
        ], tries)
      }
      const end = run.frames[run.frames.length - 1]
      if (run.outcome === 'short' && end.x === 3 && end.y === 3) return byTry(['Где остановился робот? Что осталось сделать до флажка?', 'Этот шаг нужен на каждой ступеньке или один раз?'], tries)
      return byTry([
        'Что робот делает на одной ступеньке вниз?',
        'Что остаётся сделать, когда ступеньки кончились?',
        'Последний шаг нужен на каждой ступеньке или один раз?',
      ], tries)
    },
  },
]

// The first line of the card after a run: what happened, and on which pass when it was inside the loop.
export function whatHappened(run: Run, blocks: number, max: number) {
  const end = run.frames[run.frames.length - 1]
  const pass = end.rep !== null && end.iter > 0 ? ` на ${end.iter}-м повторе` : ''
  switch (run.outcome) {
    case 'wall': return `Робот упёрся в стену${pass}.`
    case 'edge': return `Робот упёрся в край поля${pass}.`
    case 'short': return 'Робот не доехал до флажка.'
    case 'passed': return 'Робот проехал мимо флажка.'
    case 'stars': return 'Робот на флажке, но собрал не все звёзды.'
    case 'long': return `Робот на флажке, но ${blocks} ${plural(blocks, 'блок', 'блока', 'блоков')}, а можно ${max}.`
    case 'goal': return 'Робот на флажке!'
  }
}
