// Three levels, each with a new thing to see in the loop the app reveals after the run:
// one command repeats; a group of commands (a stair) repeats; a side of the block repeats, and it starts with the turn.
// `len` is the length of the expected drawn program: the command strip keeps room for it, so nothing jumps.
export type DrawLevel = { name: string; goal: string; map: string[]; len: number; reveal: (n: number, times: string) => string }

export const LEVELS: DrawLevel[] = [
  {
    name: 'Коридор',
    goal: 'Доведи робота до флажка и собери все звёзды.',
    map: ['.....F', '####..', '>****.'],
    len: 9,
    reveal: (n, times) => `Одна команда повторилась ${n} ${times} подряд. Цикл пишет её один раз.`,
  },
  {
    name: 'Лестница',
    goal: 'Подними робота по лестнице к флажку.',
    map: ['####F', '###..', '##..#', '#..##', '^.###'],
    len: 16,
    reveal: (n, times) => `Одна ступенька повторилась ${n} ${times}. Цикл пишет её команды один раз.`,
  },
  {
    name: 'Вокруг блока',
    goal: 'Объедь блок и доберись до флажка.',
    map: ['....', '.##.', '.##.', '<##F'],
    len: 12,
    reveal: (n, times) => `Сторона вместе с поворотом повторилась ${n} ${times}. Поворот тоже входит в цикл.`,
  },
]

// Hints after a run that failed, by what went wrong; from general to specific. They ask, they never say the fix.
export const HINTS: Record<'short' | 'stars', string[]> = {
  short: ['Докуда доходит твой путь? Где флажок?', 'С какой клетки пути можно продолжить к флажку?'],
  stars: ['Все ли звёзды лежат на твоём пути?', 'Через какие клетки должен пройти путь, чтобы забрать каждую звезду?'],
}
