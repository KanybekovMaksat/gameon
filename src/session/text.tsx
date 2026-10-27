import type { ReactNode } from 'react'

// Renders content text: a blank line starts a paragraph, `backticks` mark code.
export function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? <code key={i} className="inline-code">{part.slice(1, -1)}</code> : part,
  )
}

export function Rich({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).map((p, i) => <p key={i}>{inline(p)}</p>)}</>
}
