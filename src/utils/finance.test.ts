import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDailySummary,
  computeDeniRepaymentSplit,
  computeShopCapitalSnapshot,
  computeStockValuation,
  groupTransactionsByCalendarWeek,
} from './finance';
import { getCalendarWeekInfo } from './dates';
import type { DailyFloat, Debtor, Product, Transaction } from '../types/duka';

test('computes daily summary isolating by date and ignoring voided entries', () => {
  const floatToday: DailyFloat = {
    date: '2026-11-21',
    openingCash: 5000,
    openingMpesa: 10000,
    createdAt: 1,
    updatedAt: 1,
  };

  const txs: Transaction[] = [
    {
      id: 1,
      date: '2026-11-21',
      timestamp: 100,
      weekKey: '2026-W47',
      type: 'sale',
      paymentMethod: 'cash',
      items: [],
      subtotal: 400,
      costTotal: 300,
      amountPaid: 500,
      changeGiven: 100,
      cashDelta: 400,
      mpesaDelta: 0,
      profitDelta: 100,
      commissionEarned: 0,
      status: 'completed',
    },
    {
      id: 2,
      date: '2026-11-21',
      timestamp: 200,
      weekKey: '2026-W47',
      type: 'sale',
      paymentMethod: 'mpesa',
      items: [],
      subtotal: 300,
      costTotal: 220,
      amountPaid: 500,
      changeGiven: 200,
      cashDelta: -200, // M-Pesa overpayment gave cash change from drawer
      mpesaDelta: 500,
      profitDelta: 80,
      commissionEarned: 0,
      mpesaCode: 'UCK4X9M2PQ',
      status: 'completed',
    },
    {
      id: 3,
      date: '2026-11-21',
      timestamp: 300,
      weekKey: '2026-W47',
      type: 'sale',
      paymentMethod: 'deni',
      items: [],
      subtotal: 250,
      costTotal: 200,
      amountPaid: 0,
      changeGiven: 0,
      cashDelta: 0,
      mpesaDelta: 0,
      profitDelta: 0, // Held until repaid
      commissionEarned: 0,
      status: 'completed',
    },
    {
      id: 4,
      date: '2026-11-21',
      timestamp: 400,
      weekKey: '2026-W47',
      type: 'sale',
      paymentMethod: 'cash',
      items: [],
      subtotal: 999,
      costTotal: 500,
      amountPaid: 999,
      changeGiven: 0,
      cashDelta: 999,
      mpesaDelta: 0,
      profitDelta: 499,
      commissionEarned: 0,
      status: 'voided',
    },
    {
      id: 5,
      date: '2026-11-20',
      timestamp: 50,
      weekKey: '2026-W47',
      type: 'sale',
      paymentMethod: 'cash',
      items: [],
      subtotal: 700,
      costTotal: 500,
      amountPaid: 700,
      changeGiven: 0,
      cashDelta: 700,
      mpesaDelta: 0,
      profitDelta: 200,
      commissionEarned: 0,
      status: 'completed',
    },
  ];

  const summary = computeDailySummary(floatToday, txs, '2026-11-21');
  assert.equal(summary.expectedCash, 5200); // 5000 + 400 - 200
  assert.equal(summary.expectedMpesa, 10500); // 10000 + 500
  assert.equal(summary.todaysSales, 950); // 400 + 300 + 250
  assert.equal(summary.givenOnDeni, 250);
  assert.equal(summary.todaysProfit, 180); // 100 + 80
  assert.equal(summary.completedCount, 3);
  assert.equal(summary.voidedCount, 1);
});

test('computes Deni partial and full repayment proportional profit realization', () => {
  // Credit sale of KES 1,000 where cost was KES 750 (profit = 250)
  const partial = computeDeniRepaymentSplit(1000, 750, 400);
  assert.equal(partial.valid, true);
  assert.equal(partial.appliedRepayment, 400);
  assert.equal(partial.costRecovered, 300);
  assert.equal(partial.realizedProfit, 100);
  assert.equal(partial.newBalance, 600);
  assert.equal(partial.newUnpaidCost, 450);

  const rest = computeDeniRepaymentSplit(partial.newBalance, partial.newUnpaidCost, 1000);
  assert.equal(rest.appliedRepayment, 600);
  assert.equal(rest.realizedProfit, 150);
  assert.equal(rest.newBalance, 0);
  assert.equal(rest.newUnpaidCost, 0);
});

test('computes stock asset valuation, shop capital snapshot, and calendar week label', () => {
  const products: Product[] = [
    { id: 1, name: 'Unga 2kg', buyingPrice: 130, sellingPrice: 160, stockQty: 10, lowStockAlert: 5, updatedAt: 1 },
    { id: 2, name: 'Milk 500ml', buyingPrice: 50, sellingPrice: 65, stockQty: 3, lowStockAlert: 5, updatedAt: 1 },
  ];
  const val = computeStockValuation(products);
  assert.equal(val.stockAssetValue, 1450); // 1300 + 150
  assert.equal(val.projectedShelfProfit, 345); // 300 + 45
  assert.equal(val.lowStockCount, 1);

  const debtors: Debtor[] = [
    { id: 1, name: 'Wanjiku', phone: '0711000111', balance: 550, unpaidCost: 400, totalGiven: 550, totalRepaid: 0, updatedAt: 1 },
  ];
  const cap = computeShopCapitalSnapshot(5200, 10500, products, debtors);
  assert.equal(cap.totalCapital, 17700); // 5200 + 10500 + 1450 + 550

  const wk = getCalendarWeekInfo('2026-11-21');
  assert.match(wk.label, /^Week \d+: Mon \d{2} \w{3} – Sun \d{2} \w{3} \d{4}$/);

  const groups = groupTransactionsByCalendarWeek([
    {
      id: 1,
      date: '2026-11-21',
      timestamp: 100,
      weekKey: wk.weekKey,
      type: 'sale',
      paymentMethod: 'cash',
      items: [],
      subtotal: 160,
      costTotal: 130,
      amountPaid: 160,
      changeGiven: 0,
      cashDelta: 160,
      mpesaDelta: 0,
      profitDelta: 30,
      commissionEarned: 0,
      status: 'completed',
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].totals.salesTotal, 160);
  assert.equal(groups[0].totals.realizedProfit, 30);
});
