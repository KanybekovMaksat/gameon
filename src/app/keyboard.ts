import { useEffect, type RefObject } from 'react'

// The on-screen keyboard. Android resizes the page for it (`interactive-widget=resizes-content` in index.html).
// iOS lays it over the page: the visual viewport shrinks and may pan. While it is open, the app takes only the
// visible part (`is-kb`), so sheets and the lesson footer sit on the keyboard and the field stays in view.
export function useKeyboard(box: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const vv = window.visualViewport
    const el = box.current
    if (!on || !vv || !el) return
    let open = false
    const update = () => {
      const now = innerHeight - vv.height > 80
      el.style.setProperty('--vvh', `${vv.height}px`)
      // pageTop also counts a page scroll that iOS may add on top of the pan.
      el.style.setProperty('--vvtop', `${vv.pageTop}px`)
      el.classList.toggle('is-kb', now)
      if (now && !open) {
        const field = document.activeElement
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
          requestAnimationFrame(() => (field.closest('form') ?? field).scrollIntoView({ block: 'nearest' }))
        }
      }
      open = now
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      el.classList.remove('is-kb')
    }
  }, [box, on])
}
