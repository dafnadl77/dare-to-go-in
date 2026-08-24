export interface EchoState {
  /** 0..1, ramped by DreamEchoes while the cursor lingers over the ceiling; read by MemoryVeil to locally reduce fog near the cursor. */
  ceilingIntensity: number;
  /** 0..1, ramped while lingering over the bed; read by MemoryVeil for the same local clarity treatment, revealing real bedding texture. */
  bedIntensity: number;
}

export function createEchoState(): EchoState {
  return { ceilingIntensity: 0, bedIntensity: 0 };
}
