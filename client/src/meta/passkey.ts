/* パスキー(WebAuthn)クライアント補助 */

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export function passkeySupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  return startRegistration({ optionsJSON: options });
}

export async function assertPasskey(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  return startAuthentication({ optionsJSON: options });
}

export function passkeyErrorMessage(e: unknown): string {
  if (!(e instanceof Error)) return 'パスキー操作に失敗しました';
  const name = e.name || '';
  if (name === 'NotAllowedError') return 'パスキー操作がキャンセルされました';
  if (name === 'InvalidStateError') return 'このパスキーは既に登録されています';
  if (name === 'NotSupportedError') return 'この端末ではパスキーを利用できません';
  if (name === 'SecurityError') return 'セキュリティ上の理由でパスキーを利用できません';
  return e.message || 'パスキー操作に失敗しました';
}
