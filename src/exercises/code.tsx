import type { ReactNode } from 'react'

// A small highlighter for the Python-like code in exercises. Two leading spaces are one indent level.
const KEYWORDS = new Set(['repeat', 'for', 'in', 'range', 'if', 'elif', 'else', 'while', 'print', 'def', 'return', 'and', 'or', 'not', 'True', 'False', 'input', 'len'])
const TOKEN = /(#.*$)|("[^"]*"|'[^']*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g

export function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of line.matchAll(TOKEN)) {
    const i = m.index ?? 0
    if (i > last) out.push(line.slice(last, i))
    const [t, comment, str, num, word] = m
    const cls = comment ? 'c' : str ? 's' : num ? 'n' : word && KEYWORDS.has(word) ? 'k' : word ? 'v' : ''
    out.push(<span key={i} className={cls}>{t}</span>)
    last = i + t.length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

export function Code({ code, numbers }: { code: string; numbers?: boolean }) {
  const lines = code.split('\n')
  return (
    <pre className="code" style={{ margin: 0 }}>
      {lines.map((l, i) => (
        <div key={i} className="code-row">
          {numbers && <i>{i + 1}</i>}
          <span>{highlight(l)}{'\n'}</span>
        </div>
      ))}
    </pre>
  )
}
