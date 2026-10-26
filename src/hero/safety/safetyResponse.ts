/** A route's safety answer ({ safety: { level } }, status 200), or null. Shared by the browser callers of every AI route. */
export function safetyLevelOf(data: unknown): 'uncertain' | 'concern' | 'danger' | 'threat' | null {
  const level = data && typeof data === 'object' ? ((data as { safety?: { level?: unknown } }).safety?.level ?? null) : null;
  return level === 'uncertain' || level === 'concern' || level === 'danger' || level === 'threat' ? level : null;
}
