export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function normalizeRecoveryAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string): Promise<string> {
  return sha256(`dukapulse-pin:${pin}`);
}

export async function hashRecoveryAnswer(answer: string): Promise<string> {
  return sha256(`dukapulse-recovery:${normalizeRecoveryAnswer(answer)}`);
}
