/**
 * What the central interaction area is currently showing. Owned by
 * HeroDream since siblings (title dissolve, prompt hush, dream fragments)
 * all need to react to it, not just HoldToRemember itself.
 */
export type CentralMode = 'hold' | 'recording' | 'typing' | 'settled';
