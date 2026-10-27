// Russian numbers, days and times for the mentor screen.

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b > 1 && b < 5) return few
  return many
}

export const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function startOfDay(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Calendar days from a to b; rounding keeps it right across a clock change.
export const daysBetween = (a: number, b: number) => Math.round((startOfDay(b) - startOfDay(a)) / DAY)

export const hm = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

const WEEKDAY = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
// «в субботу», «во вторник».
const ON_WEEKDAY = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу']

export const dateLong = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
export const weekday = (t: number) => WEEKDAY[new Date(t).getDay()]

// «Сегодня», «Вчера», «Пятница, 25 сентября».
export function dayTitle(t: number, now: number) {
  const d = daysBetween(t, now)
  if (d === 0) return 'Сегодня'
  if (d === 1) return 'Вчера'
  return cap(`${weekday(t)}, ${dateLong(t)}`)
}

// «только что», «4 мин назад», «сегодня в 14:10», «вчера в 19:40», «в субботу в 17:47». It reads after «Был».
export function ago(t: number, now: number) {
  const s = (now - t) / 1000
  if (s < 60) return 'только что'
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`
  const d = daysBetween(t, now)
  if (d === 0) return `сегодня в ${hm(t)}`
  if (d === 1) return `вчера в ${hm(t)}`
  if (d < 7) return `${ON_WEEKDAY[new Date(t).getDay()]} в ${hm(t)}`
  return dateLong(t)
}

// The span until a moment: «через 40 мин», «через 5 ч», «через 2 дня».
export function until(t: number, now: number) {
  const m = Math.max(1, Math.round((t - now) / MIN))
  if (m < 60) return `через ${m} мин`
  const d = daysBetween(now, t)
  if (d === 0 || m < 12 * 60) return `через ${count(Math.round(m / 60), 'час', 'часа', 'часов')}`
  return `через ${count(d, 'день', 'дня', 'дней')}`
}

// A name in the dative case: Айдана → Айдане, Эмир → Эмиру.
export function dative(name: string) {
  if (/[ая]$/.test(name)) return name.slice(0, -1) + 'е'
  if (/[ь]$/.test(name)) return name.slice(0, -1) + 'ю'
  return name + 'у'
}

// The child's answer as the app writes it, without the verb: «выбрала вариант «3»» → «вариант «3»».
export const answerGist = (text: string) => text.replace(/^(выбрал|выбрала|расставил|расставила|объяснил|объяснила)\s+/, '').replace(/\n/g, ' / ')

// The same answer from a boy and a girl counts as one answer.
export const answerKey = (text: string) => text.replace(/^(выбрал|расставил|объяснил)а /, '$1 ')
