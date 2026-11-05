export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export class InputError extends Error {
  constructor(message: string, public status: 400 | 413 | 415 = 400) { super(message); }
}

export async function readBounded(request: Pick<Request, 'headers' | 'body'>, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > limit) throw new InputError('File is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new InputError('File is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

/** Reject SVG/HTML and MIME spoofing; R2 metadata always uses the sniffed type. */
export function imageType(bytes: Uint8Array): { mime: string; extension: string } {
  const starts = (signature: number[]) => signature.every((v, i) => bytes[i] === v);
  if (bytes.length >= 24 && starts([137, 80, 78, 71, 13, 10, 26, 10]) &&
      new TextDecoder().decode(bytes.slice(12, 16)) === 'IHDR') return { mime: 'image/png', extension: 'png' };
  if (bytes.length >= 4 && starts([255, 216, 255]) && bytes.at(-2) === 255 && bytes.at(-1) === 217) return { mime: 'image/jpeg', extension: 'jpg' };
  if (bytes.length >= 16 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(new TextDecoder().decode(bytes.slice(12, 16)))) return { mime: 'image/webp', extension: 'webp' };
  throw new InputError('Choose a PNG, JPG or WebP image.', 415);
}
