export type LichessUsername = string & { readonly __brand: 'LichessUsername' };

export function toLichessUsername(raw: string): LichessUsername {
  return raw.trim().toLowerCase() as LichessUsername;
}
