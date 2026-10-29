// Rewards on BilimQuest: XP and levels for every solved mission, achievements for milestones.
// An achievement brings an item for the child's desk in the class room; a level opens new characters.

export type ItemKind = 'desk' | 'character'
// `level`: the level a character opens at. Desk items come with achievements (achievements.ts).
export type Item = { id: string; kind: ItemKind; name: string; text: string; level?: number }

// Desk items appear at the child's desk in the class room. The picture is /rewards/<id>.png.
export const DESK_ITEMS: Item[] = [
  { id: 'books', kind: 'desk', name: 'Стопка книг', text: 'Пусть все видят, что ты любишь читать.' },
  { id: 'cactus', kind: 'desk', name: 'Кактус', text: 'Не просит воды. Растёт, как твои знания.' },
  { id: 'lamp', kind: 'desk', name: 'Настольная лампа', text: 'Тёплый свет над партой.' },
  { id: 'speaker', kind: 'desk', name: 'Колонка', text: 'Для любимой музыки на перемене.' },
  { id: 'bear', kind: 'desk', name: 'Мишка-талисман', text: 'Сидит на парте и болеет за тебя.' },
  { id: 'radio', kind: 'desk', name: 'Ретро-радио', text: 'Старое, но ещё играет.' },
  { id: 'monitor', kind: 'desk', name: 'Монитор', text: 'Большой экран для исследований.' },
  { id: 'chair', kind: 'desk', name: 'Мягкое кресло', text: 'Удобно, даже когда задача трудная.' },
]

// The Kenney Mini characters. The chosen one sits at the child's desk and is the child's avatar.
export const CHARACTERS: Item[] = ([
  ['male-a', 'Отличник', 1, 'Всегда знает, где ошибка.'],
  ['female-c', 'Художница', 1, 'Рисует карты острова лучше всех.'],
  ['female-f', 'Рок-звезда', 1, 'Учит правила под громкую музыку.'],
  ['male-f', 'Бунтарь', 2, 'Не сдаётся, даже когда задача трудная.'],
  ['female-a', 'Мечтательница', 2, 'Придумывает новые острова.'],
  ['female-b', 'Рыжик', 2, 'Первой находит ответ на загадку.'],
  ['male-b', 'Бородач', 3, 'Помнит все даты наизусть.'],
  ['female-d', 'Начальница', 3, 'Ведёт команду через любой квест.'],
  ['male-d', 'Директор', 3, 'Строгий костюм и чистая тетрадь.'],
  ['male-c', 'Полицейский', 4, 'Ловит ошибки по горячим следам.'],
  ['male-e', 'Учёный', 4, 'Ставит опыты в лаборатории.'],
  ['female-e', 'Учёная', 4, 'Проверяет каждую идею опытом.'],
] as const).map(([id, name, level, text]) => ({ id, kind: 'character', name, level, text }))

export const ITEMS: Record<string, Item> = Object.fromEntries([...DESK_ITEMS, ...CHARACTERS].map((i) => [i.id, i]))

export const DEFAULT_CHARACTER = 'male-a'

// XP: 10 for a mission solved on the first try, 5 after a retry. A level takes 100 XP.
export const XP_FIRST = 10
export const XP_RETRY = 5
export const LEVEL_XP = 100
export const levelOf = (xp: number) => 1 + Math.floor(xp / LEVEL_XP)
// The share of the current level already earned, 0 to 1.
export const levelShare = (xp: number) => (xp % LEVEL_XP) / LEVEL_XP

// The characters of the scripted children, in the order of KIDS. Their portraits are /avatars/<index>.png.
const CAST = ['male-a', 'female-a', 'male-f', 'female-b', 'male-d', 'female-c']

export const modelOf = (character: string) => `/models/kenney-mini/character-${character}.glb`
export const figureOf = (character: string) => `/rewards/char-${character}.png`

export function portraitOf(character: string) {
  const i = CAST.indexOf(character)
  return i >= 0 ? `/avatars/${i}.png` : `/avatars/${character}.png`
}

// A classmate whose character the child took gets a stand-in with other hair and other clothes, and one
// that no other child in the class has, so the room never shows twins or look-alikes.
const STAND_IN: Record<string, string> = { 'female-a': 'female-f', 'male-f': 'male-e', 'female-b': 'female-e', 'male-d': 'male-e', 'female-c': 'female-d' }

// The character of each child in KIDS order; the child is first.
export function castOf(me: string): string[] {
  return CAST.map((c, i) => (i === 0 ? me : c === me ? STAND_IN[c] : c))
}
