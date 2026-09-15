import { attachmentImage } from '../chat/attachments';

/** Pixel size of a PNG, JPEG, GIF or WebP image, read from its header. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < b.length) {
      if (b[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = b[offset + 1];
      const length = b.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(offset + 7), height: b.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

export interface ResolvedImage {
  mime: string;
  bytes: Buffer;
  width: number;
  height: number;
}

/** Bytes of an image element's source: an attachment or a data URL. */
export async function resolveImage(src: string): Promise<ResolvedImage | null> {
  let mime: string;
  let bytes: Buffer;
  if (src.startsWith('attachment:')) {
    const found = await attachmentImage(src.slice('attachment:'.length));
    if (!found) return null;
    ({ mime, bytes } = found);
  } else {
    const match = /^data:(image\/[\w.+-]+);base64,(.+)$/i.exec(src);
    if (!match) return null;
    mime = match[1].toLowerCase();
    bytes = Buffer.from(match[2], 'base64');
  }
  const size = mime === 'image/svg+xml' ? { width: 512, height: 512 } : imageDimensions(bytes);
  return size ? { mime, bytes, ...size } : null;
}

export const toDataUrl = (image: Pick<ResolvedImage, 'mime' | 'bytes'>) => `data:${image.mime};base64,${image.bytes.toString('base64')}`;
