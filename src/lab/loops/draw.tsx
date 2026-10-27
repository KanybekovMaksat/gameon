import type { LabVariant } from '../types'
import { DrawLesson } from './draw/Lesson'

// «Нарисуй путь»: the path drawn with a finger becomes commands, and the repeats in it fold into loops.
export const draw: LabVariant = {
  id: 'draw',
  title: 'Нарисуй путь',
  tagline: 'Путь пальцем, код после',
  status: 'extra',
  what: 'Ребёнок рисует путь по клеткам и запускает робота, команды появляются под полем.',
  why: 'Действие руками идёт первым, а цикл в пути показывает приложение.',
  verdict: 'Дополнительный, для первого знакомства с циклом.',
  from: 'Брунер: действие, образ, символ.',
  Component: DrawLesson,
}
