import type { Cmd, Outcome } from '../../../exercises/robot'

// One level of «Живой цикл»: a map, the repeat block the child starts from and what the child may change.
// `topic` names what the level teaches about loops. `hint` is a guiding question after a wrong run, never the answer.
export type DialLevel = {
  topic: string
  goal: string
  // What to do with the controls, shown in the message area until a hint takes its place.
  tip: string
  map: string[]
  n: number
  body: Cmd[]
  lockN?: boolean
  lockBody?: boolean
  maxBody: number
  // The board beside the code (a square board) or above it (a long corridor).
  side: boolean
  hint: (o: Outcome, tries: number) => string
  why: string
}

export const N_MIN = 1
export const N_MAX = 8

export const LEVELS: DialLevel[] = [
  {
    topic: 'Сколько раз',
    goal: 'Подбери число повторов до флажка.',
    tip: 'Двигай ползунок и смотри, где кончается пунктир.',
    map: ['>.....F#'],
    n: 3,
    body: ['F'],
    lockBody: true,
    maxBody: 1,
    side: false,
    hint: (o, tries) => tries > 1
      ? 'На сколько клеток сдвигает робота один проход? А сколько клеток до флажка?'
      : o === 'short'
        ? 'Пунктир обрывается раньше флажка. Сколько клеток ему не хватает?'
        : 'Пунктир уходит дальше флажка. Какие проходы лишние?',
    why: 'Один проход двигает робота на клетку. До флажка шесть клеток.',
  },
  {
    topic: 'Что внутри',
    goal: 'Поправь команды внутри повтора.',
    tip: 'Места хватит на 4 команды. Нажми на команду, чтобы убрать, или тяни её вбок.',
    map: ['....F', '....#', '...##', '..###', '^####'],
    n: 4,
    body: ['F', 'F', 'R', 'L'],
    lockN: true,
    maxBody: 4,
    side: true,
    hint: (_o, tries) => tries > 1
      ? 'Что должно стоять между двумя поворотами, чтобы робот шагнул вправо?'
      : 'Где в одном проходе робот делает шаг вправо? Посмотри на пунктир.',
    why: 'Проход кончается так же, как начался: робот снова смотрит вверх.',
  },
  {
    topic: 'Всё вместе',
    goal: 'Собери звёзды и встань на флажок.',
    tip: 'Места хватит на 4 команды. Номера на поле считают проходы.',
    map: ['.....', '.>*..', '..#*.', '.F*..', '.....'],
    n: 2,
    body: ['F', 'R'],
    maxBody: 4,
    side: true,
    hint: (o, tries) => {
      if (tries > 2) return 'Сколько раз «вперёд» в одной стороне обхода? И сколько сторон до флажка?'
      if (o === 'wall' || o === 'edge') return 'Сколько шагов в одной стороне обхода, до поворота?'
      if (o === 'stars') return 'Какие звёзды пунктир обходит стороной? Какая сторона вышла короче?'
      return 'Сколько сторон обхода нужно пройти, чтобы встать на флажок?'
    },
    why: 'Сторона обхода: два шага и поворот. Флажок стоит после третьей стороны.',
  },
]
