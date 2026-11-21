import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAgentTransaction, lookupTariffCommission } from './tariffs';

test('deposit tariffs match exact Safaricom bands', () => {
  assert.equal(lookupTariffCommission('deposit', 10), 0);
  assert.equal(lookupTariffCommission('deposit', 49), 0);
  assert.equal(lookupTariffCommission('deposit', 50), 4);
  assert.equal(lookupTariffCommission('deposit', 100), 4);
  assert.equal(lookupTariffCommission('deposit', 101), 11);
  assert.equal(lookupTariffCommission('deposit', 500), 11);
  assert.equal(lookupTariffCommission('deposit', 1500), 25);
  assert.equal(lookupTariffCommission('deposit', 5000), 43);
  assert.equal(lookupTariffCommission('deposit', 50000), 140);
  assert.equal(lookupTariffCommission('deposit', 250000), 190);
  assert.equal(lookupTariffCommission('deposit', 9), null);
});

test('withdrawal tariffs match exact Safaricom bands', () => {
  assert.equal(lookupTariffCommission('withdraw', 49), null);
  assert.equal(lookupTariffCommission('withdraw', 50), 5);
  assert.equal(lookupTariffCommission('withdraw', 500), 13);
  assert.equal(lookupTariffCommission('withdraw', 1000), 17);
  assert.equal(lookupTariffCommission('withdraw', 2500), 30);
  assert.equal(lookupTariffCommission('withdraw', 10000), 72);
  assert.equal(lookupTariffCommission('withdraw', 250000), 200);
});

test('deposit and withdrawal drawer math & sub-agent 80% split', () => {
  const directDeposit = calculateAgentTransaction('deposit', 2000, 'direct');
  assert.equal(directDeposit.valid, true);
  assert.equal(directDeposit.cashDelta, 2000);
  assert.equal(directDeposit.mpesaDelta, -2000);
  assert.equal(directDeposit.commissionEarned, 28);
  assert.equal(directDeposit.profitDelta, 28);

  const subWithdraw = calculateAgentTransaction('withdraw', 2000, 'subagent');
  assert.equal(subWithdraw.valid, true);
  assert.equal(subWithdraw.cashDelta, -2000);
  assert.equal(subWithdraw.mpesaDelta, 2000);
  assert.equal(subWithdraw.baseCommission, 30);
  assert.equal(subWithdraw.commissionEarned, 24);
  assert.equal(subWithdraw.profitDelta, 24);
});
