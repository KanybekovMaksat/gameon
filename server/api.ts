import type { IncomingMessage, ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { Connect, Plugin } from 'vite'

// The local server of the prototype, inside the Vite process:
// POST /api/helper streams the helper's answer from OpenRouter. The key stays here, never in the browser.
// POST /api/student plays the AI student that the child teaches.
// POST /api/events and GET /api/events?since=N keep the learning events for a live mentor screen.
// GET /api/info gives the address of this computer on the local network, for the QR code in the demo panel.

const MODELS = ['deepseek/deepseek-v4-flash', 'z-ai/glm-5.3-flash']
const MAX_FIELD = 4000
const MAX_TURNS = 16
const MAX_BODY = 64_000
const MAX_EVENTS = 2000
const UPSTREAM_TIMEOUT = 20_000
// Model calls per client address per minute: enough for a child, too few to use the key as a free proxy.
const RATE_LIMIT = 40

type Turn = { role: 'user' | 'assistant'; content: string }
type HelperRequest = {
  mode: 'hint' | 'why'
  task: string
  answer?: string
  hints?: string[]
  why?: string
  messages: Turn[]
}

function systemPrompt(r: HelperRequest) {
  const rules = r.mode === 'why'
    ? [
        'Ребёнок уже решил задание верно и спрашивает, почему ответ такой.',
        'Объясни коротко и понятно, 2–4 предложения. Опирайся на объяснение методиста.',
      ]
    : [
        'Никогда не называй верный ответ и не говори, какой вариант правильный, даже если ребёнок просит или настаивает.',
        'Отвечай одним наводящим вопросом или одной подсказкой, 1–2 коротких предложения.',
        'Если ребёнок ошибся, опирайся на его ответ: помоги ему самому увидеть, где ошибка.',
        'Используй подсказки методиста по порядку, но своими словами.',
        'Не называй числа, слова или варианты, из которых состоит ответ, и не доводи вычисление до ответа. Задай вопрос про один следующий шаг.',
        'Если ребёнок просит подсказать ещё, не повторяй свой прошлый вопрос: подойди на шаг ближе к месту ошибки, возьми следующую подсказку методиста или предложи проверить один конкретный шаг.',
      ]
  return [
    'Ты помощник в приложении Codify. Дети 11–14 лет учатся думать как программисты.',
    'Говори по-русски, на «ты», просто и тепло, без сюсюканья. Без markdown, без списков, без эмодзи, без тире. Код пиши в `обратных кавычках`.',
    ...rules,
    'Говори только про это задание и программирование. Если ребёнок уходит в сторону, мягко верни его к заданию.',
    '',
    `Задание:\n${r.task}`,
    r.answer ? `Текущий ответ ребёнка: ${r.answer}` : 'Ребёнок ещё не ответил.',
    r.hints?.length ? `Подсказки методиста:\n${r.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}` : '',
    r.mode === 'why' && r.why ? `Объяснение методиста: ${r.why}` : '',
  ].filter(Boolean).join('\n')
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > MAX_BODY) { reject(new Error('too large')); req.destroy() }
    })
    req.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
}

// A model call that gives up after a while and stops when the browser goes away.
function upstreamCall(key: string, body: object, res: ServerResponse) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT)
  res.on('close', () => ctrl.abort())
  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Codify prototype' },
    body: JSON.stringify({ models: MODELS, reasoning: { enabled: false }, ...body }),
    signal: ctrl.signal,
  }).catch(() => null).finally(() => clearTimeout(timer))
}

// The app's text has no em dashes; models add them anyway. A dash between words becomes a comma.
const undash = (t: string) => t.replace(/\s*[—–]\s*/g, ', ')

const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_FIELD) : undefined)

// The browser is not trusted: keep only known fields, cut their length.
function parseHelper(v: unknown): HelperRequest | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const task = str(o.task)
  if (!task || !Array.isArray(o.messages)) return null
  const messages = o.messages.slice(-MAX_TURNS).flatMap((m): Turn[] => {
    if (!m || typeof m !== 'object') return []
    const t = m as Record<string, unknown>
    const content = str(t.content)
    return (t.role === 'user' || t.role === 'assistant') && content ? [{ role: t.role, content }] : []
  })
  if (!messages.length || messages[messages.length - 1].role !== 'user') return null
  return {
    mode: o.mode === 'why' ? 'why' : 'hint',
    task,
    answer: str(o.answer),
    hints: Array.isArray(o.hints) ? o.hints.map(str).filter((h): h is string => !!h).slice(0, 6) : undefined,
    why: str(o.why),
    messages,
  }
}

async function helper(req: IncomingMessage, res: ServerResponse, key: string | undefined) {
  if (!key) { res.statusCode = 503; res.end('no key'); return }
  const r = parseHelper(await readJson(req).catch(() => null))
  if (!r) { res.statusCode = 400; res.end('bad request'); return }

  const upstream = await upstreamCall(key, {
    stream: true,
    max_tokens: r.mode === 'why' ? 320 : 160,
    temperature: 0.5,
    messages: [{ role: 'system', content: systemPrompt(r) }, ...r.messages],
  }, res)
  if (!upstream?.ok || !upstream.body) { res.statusCode = 502; res.end('upstream'); return }

  // OpenRouter sends server-sent events; the browser gets plain text chunks.
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' })
  const reader = upstream.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
    if (done || res.destroyed) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content
        if (delta) res.write(undash(delta))
      } catch { /* a keep-alive comment or a partial line */ }
    }
  }
  res.end()
}

// The AI student: the child explains a concept, the robot solves a task using only that explanation.
// Learning by teaching (Betty's Brain, Vanderbilt): a wrong explanation shows up as the robot's wrong answer.
type StudentRequest = { concept: string; understanding: string; task: string; answer: string; messages: Turn[] }
type StudentReply = { reply: string; state: 'asking' | 'solved' | 'wrong'; attempt: string | null }

function parseStudent(v: unknown): StudentRequest | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const base = parseHelper({ task: o.task, messages: o.messages })
  const concept = str(o.concept)
  const understanding = str(o.understanding)
  const answer = str(o.answer)
  if (!base || !concept || !understanding || !answer) return null
  return { concept, understanding, task: base.task, answer, messages: base.messages }
}

function studentPrompt(r: StudentRequest, turns: number) {
  return [
    'Ты Робик, робот-ученик. Ребёнок 11–14 лет учит тебя программированию. Ты сам ничего не знаешь про тему, кроме того, что тебе объяснил ребёнок.',
    'Главное правило: ты не добавляешь к словам ребёнка ничего от себя. Нельзя уточнять, дополнять или пересказывать его объяснение точнее, чем он сказал. Нельзя подсказывать, как правильно. Если он сказал расплывчато, ты понял ровно так же расплывчато.',
    `Тема: ${r.concept}`,
    `Верное понимание (ты его не знаешь и никогда не произносишь, это только для оценки): ${r.understanding}`,
    `Проверочная задача, которую решаешь ТЫ сам: ${r.task}`,
    `Верный ответ задачи: ${r.answer}`,
    '',
    'Как решить, что делать:',
    '1. Если объяснение ребёнка верное и его хватает, чтобы решить задачу, реши задачу сам по шагам, опираясь только на его слова, и получи верный ответ. state = "solved".',
    turns < 3
      ? '2. Если объяснение неполное или непонятное, задай один короткий вопрос о том, чего тебе не хватает, не называя ответа (например «А сколько раз?» или «А какие строки?»). Не пересказывай тему, не предлагай готовую формулировку, не проси ребёнка решать задачу. state = "asking".'
      : '2. Ребёнок уже объяснял три раза: больше не спрашивай.',
    '3. Если в объяснении ошибка, реши задачу так, как следует из этой ошибки, и получи неверный ответ. Скажи, что у тебя получилось, и спроси, правильно ли ты понял. state = "wrong".',
    '',
    'Пиши по-русски, от первого лица, как весёлый ученик: 1–3 коротких предложения, без markdown, эмодзи и тире. Код в `обратных кавычках`.',
    'Ответ строго в JSON: {"reply": "твоя реплика", "state": "asking" | "solved" | "wrong", "attempt": "твой ответ на задачу одной строкой или null, если ты спрашиваешь"}',
  ].join('\n')
}

async function student(req: IncomingMessage, res: ServerResponse, key: string | undefined) {
  if (!key) { res.statusCode = 503; res.end('no key'); return }
  const r = parseStudent(await readJson(req).catch(() => null))
  if (!r) { res.statusCode = 400; res.end('bad request'); return }
  const turns = r.messages.filter((m) => m.role === 'user').length
  const upstream = await upstreamCall(key, {
    response_format: { type: 'json_object' },
    max_tokens: 300,
    temperature: 0.4,
    messages: [{ role: 'system', content: studentPrompt(r, turns) }, ...r.messages],
  }, res)
  const data = (upstream?.ok ? await upstream.json().catch(() => null) : null) as { choices?: { message?: { content?: string } }[] } | null
  let out: StudentReply | null = null
  try {
    const o = JSON.parse(data?.choices?.[0]?.message?.content ?? '')
    const state = ['asking', 'solved', 'wrong'].includes(o.state) ? o.state : null
    if (typeof o.reply === 'string' && state) out = { reply: undash(o.reply), state, attempt: typeof o.attempt === 'string' ? o.attempt : null }
  } catch { /* a reply that is not JSON */ }
  if (!out) { res.statusCode = 502; res.end('upstream'); return }
  // After three explanations the robot must decide.
  if (out.state === 'asking' && turns >= 3) out.state = 'wrong'
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(out))
}

// Events live in memory while the dev server runs. A restart clears them; `boot` tells the mentor screen it happened.
const events: unknown[] = []
const boot = Date.now().toString(36)

async function eventsRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'POST') {
    const e = await readJson(req).catch(() => null)
    if (e && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string' && events.length < MAX_EVENTS) events.push(e)
    res.statusCode = 204
    res.end()
    return
  }
  const since = Number(new URL(req.url ?? '', 'http://x').searchParams.get('since') ?? 0) || 0
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ next: events.length, events: events.slice(since), boot }))
}

// Wi-Fi and Ethernet first: virtual bridges (Docker, VMs, tethering) have addresses a phone cannot reach.
function lanAddress() {
  const all = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })))
  const real = all.find((a) => /^(en|eth|wlan|wl)\d/.test(a.name) && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address))
  return (real ?? all[0])?.address ?? null
}

// Only pages of this app may post: JSON body, and an Origin (when the browser sends one) that matches this host.
function sameApp(req: IncomingMessage) {
  const type = req.headers['content-type'] ?? ''
  const origin = req.headers.origin
  if (!type.startsWith('application/json')) return false
  try { return !origin || new URL(origin).host === req.headers.host } catch { return false }
}

const calls = new Map<string, number[]>()
function allowCall(req: IncomingMessage) {
  const ip = req.socket.remoteAddress ?? '?'
  const now = Date.now()
  const recent = (calls.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  calls.set(ip, recent)
  return recent.length <= RATE_LIMIT
}

function middleware(key: string | undefined): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? ''
    if (url === '/api/info') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ lan: lanAddress(), helper: !!key }))
      return
    }
    if (req.method === 'POST' && url.startsWith('/api/') && !sameApp(req)) { res.statusCode = 403; res.end(); return }
    if ((url === '/api/helper' || url === '/api/student') && req.method === 'POST' && !allowCall(req)) { res.statusCode = 429; res.end(); return }
    if (url === '/api/helper' && req.method === 'POST') helper(req, res, key).catch(() => { res.statusCode = 500; res.end() })
    else if (url === '/api/student' && req.method === 'POST') student(req, res, key).catch(() => { res.statusCode = 500; res.end() })
    else if (url.startsWith('/api/events')) eventsRoute(req, res).catch(() => { res.statusCode = 500; res.end() })
    else next()
  }
}

export function api(key: string | undefined): Plugin {
  return {
    name: 'codify-api',
    configureServer: (s) => { s.middlewares.use(middleware(key)) },
    configurePreviewServer: (s) => { s.middlewares.use(middleware(key)) },
  }
}
