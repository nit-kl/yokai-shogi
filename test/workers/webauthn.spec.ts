import { describe, expect, it } from 'vitest';
import { parseTransports, resolveRp, toUint8Array } from '../../server/src/lib/webauthn';

describe('webauthn helpers', () => {
  it('resolveRp: 許可オリジンから hostname を RP ID にする', () => {
    const env = { ALLOWED_ORIGINS: 'http://localhost:5173,https://yokai-shogi.nit-games.com' } as any;
    expect(resolveRp(env, 'http://localhost:5173')).toEqual({
      origin: 'http://localhost:5173',
      rpID: 'localhost',
    });
    expect(resolveRp(env, 'https://yokai-shogi.nit-games.com')).toEqual({
      origin: 'https://yokai-shogi.nit-games.com',
      rpID: 'yokai-shogi.nit-games.com',
    });
    expect(resolveRp(env, 'https://evil.example')).toBeNull();
    expect(resolveRp(env, undefined)).toBeNull();
  });

  it('toUint8Array / parseTransports', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(toUint8Array(bytes)).toEqual(bytes);
    expect(toUint8Array(bytes.buffer)).toEqual(bytes);
    expect(parseTransports('["internal","hybrid"]')).toEqual(['internal', 'hybrid']);
    expect(parseTransports(null)).toBeUndefined();
    expect(parseTransports('not-json')).toBeUndefined();
  });
});
