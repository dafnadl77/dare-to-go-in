export interface UnlimitedAccessItem {
  userId: string;
  email: string;
  grantedAt: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseUnlimitedList(json: unknown): UnlimitedAccessItem[] | null {
  if (!isRecord(json) || !Array.isArray(json.items)) return null;
  const items: UnlimitedAccessItem[] = [];
  for (const raw of json.items) {
    if (!isRecord(raw) || typeof raw.userId !== 'string' || typeof raw.email !== 'string' || typeof raw.grantedAt !== 'string') return null;
    items.push({ userId: raw.userId, email: raw.email, grantedAt: raw.grantedAt });
  }
  return items;
}
