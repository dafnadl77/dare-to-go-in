export interface EchoState {
  /** 0..1, ramped by DreamEchoes while the cursor lingers over the ceiling; read by MemoryVeil to locally reduce fog near the cursor. */
  ceilingIntensity: number;
}

export function createEchoState(): EchoState {
  return { ceilingIntensity: 0 };
}
