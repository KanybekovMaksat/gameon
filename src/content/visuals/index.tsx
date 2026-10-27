import { CodeStepper } from './CodeStepper'
import { RobotRun } from './RobotRun'
import './visuals.css'

export { Fork } from './Fork'
export { IfElse } from './IfElse'
export { OrderSwap } from './OrderSwap'
export { RangeLine } from './RangeLine'

// The visuals of the explanation cards. Each one is a component without props, as the card expects.

const ALG_MAP = ['F..', '...', '..^']
export const AlgRobot = () => <RobotRun map={ALG_MAP} program="F F L F F" view="list" />

export const AlgTopDown = () => (
  <CodeStepper
    code={'print("Раз")\nprint("Два")\nprint("Три")'}
    screen
    intro="Экран пока пустой: программа ещё не начала работать."
    steps={[
      { line: 1, out: 'Раз', note: 'Компьютер начинает с первой строки.' },
      { line: 2, out: 'Два', note: 'Потом переходит к следующей.' },
      { line: 3, out: 'Три', note: 'Строки кончились, и программа закончилась.' },
    ]}
  />
)

const LOOP_MAP = ['>***F']
export const LoopRobot = () => <RobotRun map={LOOP_MAP} program="4(F)" view="code" />

const INDENT_MAP = ['...', '...', '...', '...', '^..']
const INDENT_VARIANTS = [
  { label: 'right() внутри', program: '4(F R)' },
  { label: 'right() после', program: '4(F) R' },
]
export const LoopIndent = () => <RobotRun map={INDENT_MAP} variants={INDENT_VARIANTS} view="code" side cell={38} />

export const LoopCounter = () => (
  <CodeStepper
    code={'for i in range(3):\n  print(i)\nprint("Готово")'}
    vars={['i']}
    screen
    intro="Счётчика `i` пока нет. Он появится в первом повторе."
    steps={[
      { line: 1, set: { i: 0 }, note: 'Первый повтор: `i` равно 0.' },
      { line: 2, out: '0' },
      { line: 1, set: { i: 1 }, note: 'Второй повтор: `i` стало 1.' },
      { line: 2, out: '1' },
      { line: 1, set: { i: 2 }, note: 'Третий повтор: `i` стало 2.' },
      { line: 2, out: '2' },
      { line: 3, out: 'Готово', note: 'Числа в `range(3)` кончились, цикл закончен.' },
    ]}
  />
)

export const VarBox = () => (
  <CodeStepper
    code={'score = 0\nscore = score + 10\nscore = score * 2\nprint(score)'}
    vars={['score']}
    screen
    intro="Коробка `score` пока пустая."
    steps={[
      { line: 1, set: { score: 0 }, note: 'Кладём 0 в коробку `score`.' },
      { line: 2, set: { score: 10 }, note: 'Берём 0 и прибавляем 10. В коробке теперь 10.' },
      { line: 3, set: { score: 20 }, note: 'Берём 10 и умножаем на 2. Старое значение пропало.' },
      { line: 4, out: '20', note: '`print` показывает, что лежит в коробке.' },
    ]}
  />
)

export const VarPlus = () => (
  <CodeStepper
    code={'x = 4\nx = x + 1\nx = x + 1'}
    vars={['x']}
    intro="Смотри, в каком порядке меняется значение в коробке `x`."
    steps={[
      { line: 1, set: { x: 4 }, note: 'В `x` лежит 4.' },
      { line: 2, note: 'Сначала правая часть: `x + 1` даёт 4 + 1 = 5.' },
      { line: 2, set: { x: 5 }, note: 'Потом результат кладём в `x`. Теперь там 5.' },
      { line: 3, note: 'Снова правая часть: 5 + 1 = 6.' },
      { line: 3, set: { x: 6 }, note: 'В `x` теперь 6. Так считает любой счётчик.' },
    ]}
  />
)

export const VarSwap = () => (
  <CodeStepper
    code={'a = 3\nb = 7\nt = a\na = b\nb = t'}
    vars={['a', 'b', 't']}
    intro="Пока все три коробки пустые."
    steps={[
      { line: 1, set: { a: 3 }, note: 'Кладём 3 в коробку `a`.' },
      { line: 2, set: { b: 7 }, note: 'Задача: поменять значения `a` и `b` местами.' },
      { line: 3, set: { t: 3 }, note: 'Копируем `a` в запасную коробку `t`.' },
      { line: 4, set: { a: 7 }, note: 'Кладём в `a` значение `b`. Число 3 не пропало, оно в `t`.' },
      { line: 5, set: { b: 3 }, note: 'Кладём в `b` то, что было в `t`. Обмен готов.' },
    ]}
  />
)
