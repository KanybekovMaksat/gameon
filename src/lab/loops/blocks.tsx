import type { LabVariant } from '../types'
import { BlocksLesson } from './blocks/Lesson'

export const blocks: LabVariant = {
  id: 'blocks',
  title: 'Блоки руками',
  tagline: 'Блоки в программу, повтор в форме C',
  status: 'base',
  what: 'Ребёнок тащит блоки в программу и внутрь блока «повтори».',
  why: 'Ошибок синтаксиса нет, а «внутри цикла» видно по форме блока.',
  verdict: 'Основа для объяснения кода.',
  from: 'Scratch, Blockly.',
  Component: BlocksLesson,
}
