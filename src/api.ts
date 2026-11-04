export type Project = { id: string; client_name: string; name: string; archived: number };
export type Review = { id: string; project_id: string; type: 'image' | 'site'; name: string };
export type Pin = { id: string; number: number; x_pct: number; y_pct: number; status: 'open' | 'resolved' };
export type Comment = { id: string; pin_id: string; parent_id: string | null; author_name: string; body: string; created_at: number };
export type ReviewData = { review: Review; pins: Pin[]; comments: Comment[] };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api' + path, { ...init, signal, credentials: 'same-origin' });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? 'Something went wrong. Please try again.', response.status);
  return data;
}
export function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
