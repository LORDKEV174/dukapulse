export interface ParsedMpesaSms {
  isValid: boolean;
  code: string;
  amount: number;
  senderName: string;
  senderPhone: string;
  rawTimestamp: string;
  error?: string;
}

const CODE_REGEX = /\b([A-Z0-9]{10})\b/;
const AMOUNT_REGEX = /Ksh\s*([\d,]+(?:\.\d{1,2})?)/i;
const PHONE_REGEX = /(?:\+?254|0)(?:7\d{8}|1\d{8})/;
const TIMESTAMP_REGEX = /on\s+(\d{1,2}\/\d{1,2}\/\d{2,4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i;

/**
 * Extracts Safaricom 10-character uppercase code, Amount, Sender Name,
 * Phone number, and Timestamp from pasted or auto-intercepted M-Pesa SMS.
 */
export function parseMpesaSms(rawText: string): ParsedMpesaSms {
  const text = rawText.trim();
  if (!text) {
    return {
      isValid: false,
      code: '',
      amount: 0,
      senderName: '',
      senderPhone: '',
      rawTimestamp: '',
      error: 'Paste an M-Pesa confirmation SMS message.',
    };
  }

  // Look for 10-character uppercase alphanumeric code (must contain at least one letter and one digit or match Safaricom prefix)
  const upperNormalized = text.replace(/\b([a-z0-9]{10})\b/g, (m) => {
    // Only uppercase candidate codes at start or before "Confirmed"
    return /^[a-z0-9]{10}$/i.test(m) && /[a-z]/i.test(m) && /\d/.test(m)
      ? m.toUpperCase()
      : m;
  });

  // Find candidate 10-char codes that aren't Kenyan phone numbers (07xxxxxxxx / 01xxxxxxxx)
  const allTenCharMatches = upperNormalized.match(/\b[A-Z0-9]{10}\b/g) || [];
  const code =
    allTenCharMatches.find(
      (candidate) =>
        /^[A-Z0-9]{10}$/.test(candidate) &&
        /[A-Z]/.test(candidate) &&
        !/^0[17]\d{8}$/.test(candidate)
    ) || '';

  if (!code) {
    return {
      isValid: false,
      code: '',
      amount: 0,
      senderName: '',
      senderPhone: '',
      rawTimestamp: '',
      error: 'Could not find a valid 10-character M-Pesa transaction code (e.g. UCK4X9M2PQ).',
    };
  }

  const amountMatch = text.match(AMOUNT_REGEX);
  const amount = amountMatch
    ? parseFloat(amountMatch[1].replace(/,/g, ''))
    : NaN;

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      isValid: false,
      code,
      amount: 0,
      senderName: '',
      senderPhone: '',
      rawTimestamp: '',
      error: 'Could not find a valid KES / Ksh amount in the M-Pesa message.',
    };
  }

  const phoneMatch = text.match(PHONE_REGEX);
  const senderPhone = phoneMatch ? phoneMatch[0] : '';

  // Extract sender name:
  // Pattern 1: "received from JOHN DOE 0712345678 on ..."
  // Pattern 2: "from JANE WAMBUI 2547..." or "from JANE WAMBUI on ..."
  // Pattern 3: "paid to SHOP NAME ... from JOHN DOE ..."
  let senderName = '';
  const fromMatch =
    text.match(/(?:received\s+from|from)\s+([A-Za-z][A-Za-z\s'.-]{1,40}?)(?=\s+(?:\+?254|0)[17]\d{8}|\s+on\s+\d|\s*\.)/i) ||
    text.match(/(?:received\s+from|from)\s+([A-Za-z][A-Za-z\s'.-]{1,40})/i);

  if (fromMatch && fromMatch[1]) {
    senderName = fromMatch[1].trim().replace(/\s+/g, ' ');
  }

  const tsMatch = text.match(TIMESTAMP_REGEX);
  const rawTimestamp = tsMatch ? tsMatch[1].trim() : '';

  return {
    isValid: true,
    code,
    amount,
    senderName: senderName || 'M-Pesa Customer',
    senderPhone,
    rawTimestamp,
  };
}

export function isStrictMpesaCode(code: string): boolean {
  return /^[A-Z0-9]{10}$/.test(code.trim());
}

export { CODE_REGEX };
