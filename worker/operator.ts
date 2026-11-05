/** Temporary local development gate. Replaced by magic-link sessions in #6.
 * No production hostname can use it, even if DEV_OPERATOR_TOKEN is set there.
 */
export async function isLocalOperator(request: Request, secret?: string): Promise<boolean> {
  if (!secret || secret.length < 32 || !['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)) return false;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(supplied), digest(secret)]);
  return (crypto.subtle as WorkerSubtleCrypto).timingSafeEqual(a, b);
}
// Workers' documented extension is absent from lib.dom's SubtleCrypto type.
interface WorkerSubtleCrypto extends SubtleCrypto {
  timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean;
}
