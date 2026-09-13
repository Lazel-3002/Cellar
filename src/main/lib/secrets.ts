/**
 * Encrypts API keys and tokens at rest with Electron's safeStorage (DPAPI on Windows).
 * The encryptor is injected so unit tests can run without Electron.
 */
export interface SecretCodec {
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

let codec: SecretCodec | null = null;

export function setSecretCodec(c: SecretCodec): void {
  codec = c;
}

const PLAIN_PREFIX = 'plain:';
const ENC_PREFIX = 'enc:';

export function sealSecret(value: string): string {
  if (!value) return '';
  if (codec?.available()) return ENC_PREFIX + codec.encrypt(value).toString('base64');
  return PLAIN_PREFIX + value;
}

export function openSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (stored.startsWith(ENC_PREFIX)) {
    if (!codec?.available()) return '';
    try {
      return codec.decrypt(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'));
    } catch {
      return '';
    }
  }
  if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length);
  return stored;
}
