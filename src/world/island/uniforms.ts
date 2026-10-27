import { Vector3 } from 'three'

// Shader inputs shared by many materials, updated once per frame by the scene.
export const clock = { value: 0 }
// Plants between the camera and what it looks at fade out, so the child (or the gate) is never lost behind a tree.
export const seeThrough = { eye: { value: new Vector3() }, focus: { value: new Vector3() } }
// Reduced motion: loops, pulses and flights hold still.
const mq = matchMedia('(prefers-reduced-motion: reduce)')
export const reduced = { value: mq.matches }
mq.addEventListener('change', () => { reduced.value = mq.matches })
// The current pad's beacon flares when the child arrives (0 to 1).
export const flare = { value: 0 }
