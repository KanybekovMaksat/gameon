import type { LabVariant } from '../types'
import { DialLab } from './dial'
import { Rhythm } from './rhythm'
import { TurtleLab } from './turtle'
import { blocks } from './blocks'
import { draw } from './draw'

// Forms of interaction for loop tasks, in the order the lab shows them: the base first, then the supporting
// forms, then what was dropped. The hub's `notes/exercise-patterns.md` holds the full cards.
export const LOOP_VARIANTS: LabVariant[] = [
  blocks,
  draw,
  {
    id: 'dial',
    title: 'Живой цикл',
    tagline: 'Число меняется, путь меняется сразу',
    status: 'extra',
    what: 'Ребёнок двигает число повторов и команды внутри повтора.',
    why: 'Пунктир показывает путь и ошибку до запуска.',
    verdict: 'Превью пути берём, управление улучшить.',
    from: 'Брет Виктор, «Learnable Programming».',
    Component: DialLab,
  },
  {
    id: 'turtle',
    title: 'Узоры',
    tagline: 'Цикл рисует фигуру',
    status: 'extra',
    what: 'Ребёнок подбирает число повторов и угол, черепашка чертит узор.',
    why: 'Весь цикл виден как одна фигура, а угол 360 / N ребёнок находит сам.',
    verdict: 'Дополнительный, связывает циклы с геометрией.',
    from: 'Logo, Сеймур Пейперт.',
    Component: TurtleLab,
  },
  {
    id: 'rhythm',
    title: 'Ритм',
    tagline: 'Цикл слышно',
    status: 'extra',
    what: 'Ребёнок собирает такт из 4 шагов и число повторов.',
    why: '4 шага дают 16 ударов, и слышно, что идёт после цикла.',
    verdict: 'Дополнительный.',
    from: 'Степ-секвенсоры, Sonic Pi.',
    Component: Rhythm,
  },
  {
    id: 'compress',
    title: 'Сожми программу',
    tagline: 'Найди повтор в длинной программе',
    status: 'dropped',
    what: 'Ребёнок выделяет одинаковые куски и сворачивает их в повтор.',
    why: 'Два действия подряд, и ребёнок собирает абстракцию до того, как увидел её.',
    verdict: 'Отклонён, трудно следить.',
    from: 'Распознавание паттернов.',
  },
]
