import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { Icon, type IconName } from '../../components'

// Text and glyphs on the island are drawn on canvases: the app's own icons and Inter, so signs match the UI.
const FONT = '"Inter Variable", Inter, system-ui, sans-serif'
const INK = '#0a1028'
export const BLUE = '#246fff'

const ICONS: IconName[] = ['check', 'lock', 'building', 'steps', 'loop', 'branch', 'box', 'gate', 'binary', 'sort', 'flag', 'bag', 'users', 'spark']
const COLORS = ['#ffffff', BLUE, '#1f66e5', '#8a909e', INK]

// The markup of each icon, rendered once with React when this chunk loads (outside any render).
const SVG = new Map<IconName, string>()
for (const name of ICONS) {
  const div = document.createElement('div')
  const root = createRoot(div)
  flushSync(() => root.render(createElement(Icon, { name, size: 24 })))
  SVG.set(name, div.innerHTML)
  root.unmount()
}

const images = new Map<string, HTMLImageElement>()

async function loadIcon(name: IconName, color: string) {
  const svg = SVG.get(name)!.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" color="${color}" `).replace('width="24" height="24"', 'width="192" height="192"')
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  images.set(name + color, img)
}

// Fonts and glyphs are ready before the scene draws its first sign.
export const texturesReady: Promise<void> = Promise.all([
  document.fonts.load(`700 48px ${FONT}`),
  document.fonts.load(`600 48px ${FONT}`),
  document.fonts.load(`500 48px ${FONT}`),
  document.fonts.load('600 48px "JetBrains Mono"'),
  ...ICONS.flatMap((n) => COLORS.map((c) => loadIcon(n, c))),
]).then(() => undefined, () => undefined)

function glyph(ctx: CanvasRenderingContext2D, name: IconName, color: string, x: number, y: number, size: number) {
  const img = images.get(name + color)
  if (img) ctx.drawImage(img, x, y, size, size)
}

function texture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  draw(ctx)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Text that does not fit is scaled down to the width it has.
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  const w = ctx.measureText(text).width
  if (w <= max) { ctx.fillText(text, x, y); return }
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(max / w, 1)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

// The board of a topic station: the topic icon on a rounded tile, blue for the current topic. Outside the tile the
// canvas stays transparent, so the corners never show dark.
export function signTexture(icon: IconName, current: boolean) {
  return texture(256, 256, (ctx) => {
    ctx.fillStyle = current ? BLUE : INK
    ctx.beginPath(); ctx.roundRect(8, 8, 240, 240, 56); ctx.fill()
    glyph(ctx, icon, '#ffffff', 44, 44, 168)
  })
}

// A glyph alone on a transparent square, laid on top of a lesson pad.
export function glyphTexture(icon: IconName, color: string) {
  return texture(256, 256, (ctx) => glyph(ctx, icon, color, 32, 32, 192))
}

// A variable's name on a box, in the code font; `value` draws a bare white number for the value cube.
export function codeTexture(text: string, value = false) {
  return texture(256, 128, (ctx) => {
    if (!value) {
      ctx.fillStyle = INK
      ctx.beginPath(); ctx.roundRect(8, 16, 240, 96, 24); ctx.fill()
    }
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${value ? 104 : 56}px "JetBrains Mono", ui-monospace, monospace`
    fitText(ctx, text, 128, 68, 210)
  })
}
