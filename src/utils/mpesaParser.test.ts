import test from 'node:test';
import assert from 'node:assert/strict';
import { isStrictMpesaCode, parseMpesaSms } from './mpesaParser';

test('parses standard Safaricom received SMS accurately', () => {
  const sms =
    'UCK4X9M2PQ Confirmed. You have received Ksh1,250.00 from JOHN KAMAU 0712345678 on 21/11/26 at 9:47 AM. New M-PESA balance is Ksh14,500.00.';
  const res = parseMpesaSms(sms);
  assert.equal(res.isValid, true);
  assert.equal(res.code, 'UCK4X9M2PQ');
  assert.equal(res.amount, 1250);
  assert.equal(res.senderName, 'JOHN KAMAU');
  assert.equal(res.senderPhone, '0712345678');
  assert.equal(res.rawTimestamp, '21/11/26 at 9:47 AM');
});

test('parses Buy Goods / Pochi format with +254 phone and decimals', () => {
  const sms =
    'SJK9P2W8RT Confirmed. Ksh485.50 paid to MAMA MBOGA SHOP from MARY WAMBUI +254722112233 on 21/11/26 at 10:15 AM.';
  const res = parseMpesaSms(sms);
  assert.equal(res.isValid, true);
  assert.equal(res.code, 'SJK9P2W8RT');
  assert.equal(res.amount, 485.5);
  assert.equal(res.senderName, 'MARY WAMBUI');
  assert.equal(res.senderPhone, '+254722112233');
});

test('rejects SMS without valid 10-character uppercase code', () => {
  const sms = 'Confirmed. Received Ksh500.00 from PETER OTIENO 0712345678.';
  const res = parseMpesaSms(sms);
  assert.equal(res.isValid, false);
  assert.equal(isStrictMpesaCode('UCK4X9M2PQ'), true);
  assert.equal(isStrictMpesaCode('uck4x9m2pq'), false);
  assert.equal(isStrictMpesaCode('SHORT123'), false);
});

test('rejects SMS without valid Ksh amount', () => {
  const sms = 'UCK4X9M2PQ Confirmed from JOHN DOE 0712345678.';
  const res = parseMpesaSms(sms);
  assert.equal(res.isValid, false);
});
