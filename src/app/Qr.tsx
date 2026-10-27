import { useEffect, useState } from 'react'
import { encode } from 'uqr'

// The address of this computer on the local network, as a QR code: a phone on the same Wi-Fi opens the app.
// The laptop may move to another network with the page open, so the address is asked again every few seconds,
// when the tab comes back and when the network changes.
export function PhoneLink() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const ask = () => fetch('/api/info').then((r) => r.json()).then((d: { lan: string | null }) => {
      setUrl(d.lan ? `http://${d.lan}:${location.port || 80}/` : null)
    }).catch(() => {})
    ask()
    const id = setInterval(ask, 5000)
    const onShow = () => { if (document.visibilityState === 'visible') ask() }
    document.addEventListener('visibilitychange', onShow)
    addEventListener('online', ask)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow); removeEventListener('online', ask) }
  }, [])
  if (!url) return null
  const { data, size } = encode(url, { border: 0 })
  return (
    <div className="qr">
      <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} role="img" aria-label={`QR-код: ${url}`}>
        {data.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} /> : null)))}
      </svg>
      <div>
        <b>Открой на телефоне</b>
        <small>Телефон должен быть в той же сети Wi-Fi</small>
        <code>{url.replace('http://', '')}</code>
      </div>
    </div>
  )
}
