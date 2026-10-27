import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'

// The home keeps its 3D scene mounted behind other tabs; the scene stops drawing while it is not on screen,
// and while something covers it (`paused`).
export function PauseWhenHidden({ paused = false }: { paused?: boolean }) {
  const gl = useThree((s) => s.gl)
  const setFrameloop = useThree((s) => s.setFrameloop)
  const [shown, setShown] = useState(true)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setShown(e.isIntersecting))
    io.observe(gl.domElement)
    return () => io.disconnect()
  }, [gl])
  useEffect(() => { setFrameloop(shown && !paused ? 'always' : 'never') }, [shown, paused, setFrameloop])
  return null
}
