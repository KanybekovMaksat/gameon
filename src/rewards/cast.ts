import { createContext } from 'react'
import { DEFAULT_CHARACTER, castOf } from './catalog'

// The character of each child in KIDS order. App provides it from the store, so shared components such as
// Avatar follow the child's choice without importing the store.
export const CastContext = createContext<string[]>(castOf(DEFAULT_CHARACTER))
