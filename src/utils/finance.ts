import type { DailyFloat, Debtor, Product, Transaction } from '../types/duka';
import { getCalendarWeekInfo } from './dates';

export interface DailySummary {
  date: string;
  openingCash: number;
  openingMpesa: number;
  expectedCash: number;
  expectedMpesa: number;
  todaysSales: number;
  cashSales: number;
  mpesaSales: number;
  givenOnDeni: number;
  deniRepaid: number;
  agentDeposits: number;
  agentWithdrawals: number;
  agentCommission: number;
  todaysProfit: number;
  completedCount: number;
  voidedCount: number;
}

export function computeDailySummary(
  dailyFloat: DailyFloat | undefined,
  transactions: Transaction[],
  dateKey: string
): DailySummary {
  const openingCash = dailyFloat?.openingCash ?? 0;
  const openingMpesa = dailyFloat?.openingMpesa ?? 0;

  let cashDeltaSum = 0;
  let mpesaDeltaSum = 0;
  let todaysSales = 0;
  let cashSales = 0;
  let mpesaSales = 0;
  let givenOnDeni = 0;
  let deniRepaid = 0;
  let agentDeposits = 0;
  let agentWithdrawals = 0;
  let agentCommission = 0;
  let todaysProfit = 0;
  let completedCount = 0;
  let voidedCount = 0;

  for (const tx of transactions) {
    if (tx.date !== dateKey) continue;
    if (tx.status === 'voided') {
      voidedCount += 1;
      continue;
    }

    completedCount += 1;
    cashDeltaSum += tx.cashDelta;
    mpesaDeltaSum += tx.mpesaDelta;
    todaysProfit += tx.profitDelta;

    if (tx.type === 'sale') {
      todaysSales += tx.subtotal;
      if (tx.paymentMethod === 'cash') {
        cashSales += tx.subtotal;
      } else if (tx.paymentMethod === 'mpesa') {
        mpesaSales += tx.subtotal;
      } else if (tx.paymentMethod === 'deni') {
        givenOnDeni += tx.subtotal;
      }
    } else if (tx.type === 'deni_repayment') {
      deniRepaid += tx.amountPaid;
    } else if (tx.type === 'agent_deposit') {
      agentDeposits += tx.subtotal;
      agentCommission += tx.commissionEarned;
    } else if (tx.type === 'agent_withdraw') {
      agentWithdrawals += tx.subtotal;
      agentCommission += tx.commissionEarned;
    }
  }

  return {
    date: dateKey,
    openingCash,
    openingMpesa,
    expectedCash: Math.round((openingCash + cashDeltaSum) * 100) / 100,
    expectedMpesa: Math.round((openingMpesa + mpesaDeltaSum) * 100) / 100,
    todaysSales: Math.round(todaysSales * 100) / 100,
    cashSales: Math.round(cashSales * 100) / 100,
    mpesaSales: Math.round(mpesaSales * 100) / 100,
    givenOnDeni: Math.round(givenOnDeni * 100) / 100,
    deniRepaid: Math.round(deniRepaid * 100) / 100,
    agentDeposits: Math.round(agentDeposits * 100) / 100,
    agentWithdrawals: Math.round(agentWithdrawals * 100) / 100,
    agentCommission: Math.round(agentCommission * 100) / 100,
    todaysProfit: Math.round(todaysProfit * 100) / 100,
    completedCount,
    voidedCount,
  };
}

export interface StockValuation {
  totalSkuCount: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockAssetValue: number; // SUM(buyingPrice * stockQty)
  projectedRetailValue: number; // SUM(sellingPrice * stockQty)
  projectedShelfProfit: number; // SUM((sellingPrice - buyingPrice) * stockQty)
}

export function computeStockValuation(products: Product[]): StockValuation {
  let totalUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let stockAssetValue = 0;
  let projectedRetailValue = 0;
  let projectedShelfProfit = 0;

  for (const p of products) {
    const qty = Math.max(0, p.stockQty);
    totalUnits += qty;
    if (qty <= 0) {
      outOfStockCount += 1;
    }
    if (qty <= p.lowStockAlert) {
      lowStockCount += 1;
    }
    stockAssetValue += p.buyingPrice * qty;
    projectedRetailValue += p.sellingPrice * qty;
    projectedShelfProfit += (p.sellingPrice - p.buyingPrice) * qty;
  }

  return {
    totalSkuCount: products.length,
    totalUnits,
    lowStockCount,
    outOfStockCount,
    stockAssetValue: Math.round(stockAssetValue * 100) / 100,
    projectedRetailValue: Math.round(projectedRetailValue * 100) / 100,
    projectedShelfProfit: Math.round(projectedShelfProfit * 100) / 100,
  };
}

/**
 * Calculates proportional realized profit & remaining unpaid cost when a debtor
 * makes a partial or full repayment.
 */
export function computeDeniRepaymentSplit(
  debtorBalance: number,
  debtorUnpaidCost: number,
  repayAmount: number
): {
  valid: boolean;
  error?: string;
  appliedRepayment: number;
  realizedProfit: number;
  costRecovered: number;
  newBalance: number;
  newUnpaidCost: number;
} {
  if (!Number.isFinite(repayAmount) || repayAmount <= 0) {
    return {
      valid: false,
      error: 'Enter a repayment amount greater than KES 0.',
      appliedRepayment: 0,
      realizedProfit: 0,
      costRecovered: 0,
      newBalance: debtorBalance,
      newUnpaidCost: debtorUnpaidCost,
    };
  }
  if (debtorBalance <= 0) {
    return {
      valid: false,
      error: 'This customer has no unpaid Deni balance.',
      appliedRepayment: 0,
      realizedProfit: 0,
      costRecovered: 0,
      newBalance: 0,
      newUnpaidCost: 0,
    };
  }

  const appliedRepayment = Math.min(repayAmount, debtorBalance);
  const ratio = appliedRepayment / debtorBalance;
  const costRecovered = Math.round(debtorUnpaidCost * ratio * 100) / 100;
  const realizedProfit = Math.round((appliedRepayment - costRecovered) * 100) / 100;
  const newBalance = Math.max(0, Math.round((debtorBalance - appliedRepayment) * 100) / 100);
  const newUnpaidCost = Math.max(0, Math.round((debtorUnpaidCost - costRecovered) * 100) / 100);

  return {
    valid: true,
    appliedRepayment,
    realizedProfit,
    costRecovered,
    newBalance,
    newUnpaidCost,
  };
}

export interface DailySubtotalRow {
  date: string;
  salesTotal: number;
  cashSales: number;
  mpesaSales: number;
  deniGiven: number;
  deniRepaid: number;
  agentCommission: number;
  realizedProfit: number;
  txCount: number;
}

export interface WeeklyReportGroup {
  weekKey: string;
  label: string;
  startDate: string;
  endDate: string;
  dailyRows: DailySubtotalRow[];
  totals: {
    salesTotal: number;
    cashSales: number;
    mpesaSales: number;
    deniGiven: number;
    deniRepaid: number;
    agentCommission: number;
    realizedProfit: number;
    txCount: number;
  };
}

export function groupTransactionsByCalendarWeek(
  transactions: Transaction[]
): WeeklyReportGroup[] {
  const weekMap = new Map<string, WeeklyReportGroup>();

  for (const tx of transactions) {
    if (tx.status === 'voided') continue;
    const weekInfo = getCalendarWeekInfo(tx.date);

    let weekGroup = weekMap.get(weekInfo.weekKey);
    if (!weekGroup) {
      weekGroup = {
        weekKey: weekInfo.weekKey,
        label: weekInfo.label,
        startDate: weekInfo.startDate,
        endDate: weekInfo.endDate,
        dailyRows: [],
        totals: {
          salesTotal: 0,
          cashSales: 0,
          mpesaSales: 0,
          deniGiven: 0,
          deniRepaid: 0,
          agentCommission: 0,
          realizedProfit: 0,
          txCount: 0,
        },
      };
      weekMap.set(weekInfo.weekKey, weekGroup);
    }

    let dayRow = weekGroup.dailyRows.find((r) => r.date === tx.date);
    if (!dayRow) {
      dayRow = {
        date: tx.date,
        salesTotal: 0,
        cashSales: 0,
        mpesaSales: 0,
        deniGiven: 0,
        deniRepaid: 0,
        agentCommission: 0,
        realizedProfit: 0,
        txCount: 0,
      };
      weekGroup.dailyRows.push(dayRow);
    }

    dayRow.txCount += 1;
    dayRow.realizedProfit += tx.profitDelta;
    weekGroup.totals.txCount += 1;
    weekGroup.totals.realizedProfit += tx.profitDelta;

    if (tx.type === 'sale') {
      dayRow.salesTotal += tx.subtotal;
      weekGroup.totals.salesTotal += tx.subtotal;
      if (tx.paymentMethod === 'cash') {
        dayRow.cashSales += tx.subtotal;
        weekGroup.totals.cashSales += tx.subtotal;
      } else if (tx.paymentMethod === 'mpesa') {
        dayRow.mpesaSales += tx.subtotal;
        weekGroup.totals.mpesaSales += tx.subtotal;
      } else if (tx.paymentMethod === 'deni') {
        dayRow.deniGiven += tx.subtotal;
        weekGroup.totals.deniGiven += tx.subtotal;
      }
    } else if (tx.type === 'deni_repayment') {
      dayRow.deniRepaid += tx.amountPaid;
      weekGroup.totals.deniRepaid += tx.amountPaid;
    } else if (tx.type === 'agent_deposit' || tx.type === 'agent_withdraw') {
      dayRow.agentCommission += tx.commissionEarned;
      weekGroup.totals.agentCommission += tx.commissionEarned;
    }
  }

  const sorted = Array.from(weekMap.values()).sort((a, b) =>
    b.weekKey.localeCompare(a.weekKey)
  );
  for (const wk of sorted) {
    wk.dailyRows.sort((a, b) => b.date.localeCompare(a.date));
  }
  return sorted;
}

export interface ShopCapitalSnapshot {
  expectedCash: number;
  expectedMpesa: number;
  stockCostValue: number;
  unpaidDeni: number;
  totalCapital: number;
}

export function computeShopCapitalSnapshot(
  expectedCash: number,
  expectedMpesa: number,
  products: Product[],
  debtors: Debtor[]
): ShopCapitalSnapshot {
  const stockCostValue = computeStockValuation(products).stockAssetValue;
  const unpaidDeni = Math.round(
    debtors.reduce((acc, d) => acc + Math.max(0, d.balance), 0) * 100
  ) / 100;
  const totalCapital = Math.round(
    (expectedCash + expectedMpesa + stockCostValue + unpaidDeni) * 100
  ) / 100;

  return {
    expectedCash,
    expectedMpesa,
    stockCostValue,
    unpaidDeni,
    totalCapital,
  };
}
