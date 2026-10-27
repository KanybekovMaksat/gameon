// The codecoin shop. A child starts with 120 codecoins and earns 2 to 5 per exercise (about 20 per lesson).
// The first desk items cost less than the start balance; the rest are goals.

export type ItemKind = 'desk' | 'character' | 'prize'
export type Item = { id: string; kind: ItemKind; name: string; text: string; price: number }

// Desk items appear at the child's desk in the class room. The picture is /shop/<id>.png.
export const DESK_ITEMS: Item[] = [
  { id: 'books', kind: 'desk', name: 'Стопка книг', text: 'Пусть все видят, что ты любишь читать.', price: 20 },
  { id: 'cactus', kind: 'desk', name: 'Кактус', text: 'Не просит воды. Почти как код без багов.', price: 30 },
  { id: 'lamp', kind: 'desk', name: 'Настольная лампа', text: 'Тёплый свет над партой.', price: 40 },
  { id: 'speaker', kind: 'desk', name: 'Колонка', text: 'Для любимой музыки на перемене.', price: 60 },
  { id: 'bear', kind: 'desk', name: 'Мишка-талисман', text: 'Висит на парте и болеет за тебя.', price: 80 },
  { id: 'radio', kind: 'desk', name: 'Ретро-радио', text: 'Старое, но ещё играет.', price: 150 },
  { id: 'monitor', kind: 'desk', name: 'Монитор', text: 'Большой экран и клавиатура вместо ноутбука.', price: 250 },
  { id: 'chair', kind: 'desk', name: 'Мягкое кресло', text: 'Удобно, даже когда задача трудная.', price: 300 },
]

// The Kenney Mini characters. The chosen one sits at the child's desk and is the child's avatar.
export const CHARACTERS: Item[] = ([
  ['male-a', 'Отличник', 0, 'Всегда знает, где ошибка в коде.'],
  ['female-c', 'Художница', 0, 'Рисует интерфейсы лучше всех в группе.'],
  ['female-f', 'Рок-звезда', 0, 'Пишет код под громкую музыку.'],
  ['male-f', 'Бунтарь', 60, 'Не сдаётся, даже когда код не работает.'],
  ['female-a', 'Мечтательница', 60, 'Придумывает игры, которых ещё нет.'],
  ['female-b', 'Рыжик', 60, 'Первой находит баг в любой программе.'],
  ['male-b', 'Бородач', 100, 'Помнит все команды наизусть.'],
  ['female-d', 'Начальница', 100, 'Раздаёт задачи и не срывает сроки.'],
  ['male-d', 'Директор', 100, 'Строгий костюм и чистый код.'],
  ['male-c', 'Полицейский', 150, 'Ловит баги по горячим следам.'],
  ['male-e', 'Учёный', 150, 'Ставит опыты с циклами и условиями.'],
  ['female-e', 'Учёная', 150, 'Проверяет каждую идею тестом.'],
] as const).map(([id, name, price, text]) => ({ id, kind: 'character', name, price, text }))

// Real prizes: bought with codecoins, picked up from the mentor in the office.
export const PRIZES: Item[] = [
  { id: 'stickers', kind: 'prize', name: 'Наклейки Codify', text: 'Шесть наклеек для ноутбука и телефона.', price: 250 },
  { id: 'notebook', kind: 'prize', name: 'Блокнот', text: 'Блокнот в клетку с логотипом Codify.', price: 450 },
  { id: 'bottle', kind: 'prize', name: 'Бутылка для воды', text: 'На 500 мл, с логотипом Codify.', price: 700 },
  { id: 'tshirt', kind: 'prize', name: 'Футболка Codify', text: 'Размер выберешь в офисе.', price: 1200 },
  { id: 'headphones', kind: 'prize', name: 'Наушники', text: 'Беспроводные, для музыки и уроков.', price: 2500 },
]

export const ITEMS: Record<string, Item> = Object.fromEntries([...DESK_ITEMS, ...CHARACTERS, ...PRIZES].map((i) => [i.id, i]))

export const DEFAULT_CHARACTER = 'male-a'

// The characters of the scripted children, in the order of KIDS. Their portraits are /avatars/<index>.png.
const CAST = ['male-a', 'female-a', 'male-f', 'female-b', 'male-d', 'female-c']

export const modelOf = (character: string) => `/models/kenney-mini/character-${character}.glb`
export const figureOf = (character: string) => `/shop/char-${character}.png`

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

export type Order = { no: number; prize: string; at: number }

// Codecoins the child has spent; earned = balance + spent. The shop never gives coins back.
export function spentOf(owned: Record<string, true>, orders: Order[]) {
  const items = Object.keys(owned).reduce((n, id) => n + (ITEMS[id]?.price ?? 0), 0)
  return items + orders.reduce((n, o) => n + (ITEMS[o.prize]?.price ?? 0), 0)
}

export function coinsWord(n: number) {
  const d = n % 10, h = n % 100
  if (d === 1 && h !== 11) return 'кодкоин'
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'кодкоина'
  return 'кодкоинов'
}
