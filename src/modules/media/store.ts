import { defineStore } from 'pinia'
import { createMediaSessionController } from './session'

// Must pass raw refs to Pinia so it can properly track reactive state.
// proxyRefs (used in createMediaSession) unwraps refs on access, which
// prevents Pinia from detecting them as state -- causing silent reactivity loss.
export const useMediaStore = defineStore('media', createMediaSessionController)
