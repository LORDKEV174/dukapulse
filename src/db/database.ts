import Dexie, { type Table } from 'dexie';
import type {
  ActiveCart,
  AgentMode,
  AuditAction,
  AuditLogEntry,
  CartItem,
  DailyFloat,
  Debtor,
  MpesaLog,
  Product,
  ShopSettings,
  Transaction,
} from '../types/duka';
import { getCalendarWeekInfo, getTodayDateKey } from '../utils/dates';
import { computeDailySummary, computeDeniRepaymentSplit } from '../utils/finance';
import type { ParsedMpesaSms } from '../utils/mpesaParser';
import { calculateAgentTransaction } from '../utils/tariffs';

export class DuplicateMpesaError extends Error {
  existingLog: MpesaLog;
  constructor(existingLog: MpesaLog) {
    super(`Duplicate M-Pesa code ${existingLog.code} already used on ${existingLog.date}.`);
    this.name = 'DuplicateMpesaError';
    this.existingLog = existingLog;
  }
}

class DukaPulseDatabase extends Dexie {
  settings!: Table<ShopSettings, 'shop'>;
  daily_floats!: Table<DailyFloat, string>;
  products!: Table<Product, number>;
  active_carts!: Table<ActiveCart, string>;
  transactions!: Table<Transaction, number>;
  mpesa_logs!: Table<MpesaLog, string>;
  debtors!: Table<Debtor, number>;
  audit_logs!: Table<AuditLogEntry, number>;

  constructor() {
    super('DukaPulseDB');
    this.version(1).stores({
      settings: 'id',
      daily_floats: 'date',
      products: '++id, name, stockQty',
      active_carts: 'id, createdAt',
      transactions: '++id, date, weekKey, status, type, timestamp',
      mpesa_logs: 'code, date, loggedAt',
      debtors: '++id, name, balance',
      audit_logs: '++id, date, timestamp, action',
    });
  }
}

export const db = new DukaPulseDatabase();

export async function logAudit(
  action: AuditAction,
  summary: string,
  details: string,
  dateKey = getTodayDateKey()
): Promise<void> {
  await db.audit_logs.add({
    timestamp: Date.now(),
    date: dateKey,
    action,
    summary,
    details,
  });
}

export async function getPreviousWorkDayClosing(
  todayDateKey: string
): Promise<{ prevDate: string; closingCash: number; closingMpesa: number } | null> {
  const prevFloat = await db.daily_floats
    .where('date')
    .below(todayDateKey)
    .reverse()
    .first();

  if (!prevFloat) return null;

  const prevTxs = await db.transactions
    .where('date')
    .equals(prevFloat.date)
    .toArray();

  const summary = computeDailySummary(prevFloat, prevTxs, prevFloat.date);
  return {
    prevDate: prevFloat.date,
    closingCash: summary.expectedCash,
    closingMpesa: summary.expectedMpesa,
  };
}

function summarizeCart(items: CartItem[]) {
  let subtotal = 0;
  let costTotal = 0;
  for (const item of items) {
    subtotal += item.sellingPrice * item.qty;
    costTotal += item.buyingPrice * item.qty;
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    costTotal: Math.round(costTotal * 100) / 100,
  };
}

async function decrementCartStock(items: CartItem[]) {
  const now = Date.now();
  for (const item of items) {
    const prod = await db.products.get(item.productId);
    if (!prod) {
      throw new Error(`Product "${item.name}" no longer exists in Stock.`);
    }
    if (prod.stockQty < item.qty) {
      throw new Error(
        `Insufficient stock for "${prod.name}". Only ${prod.stockQty} left.`
      );
    }
    await db.products.update(item.productId, {
      stockQty: prod.stockQty - item.qty,
      updatedAt: now,
    });
  }
}

export async function createNextCustomerCart(): Promise<ActiveCart> {
  const existing = await db.active_carts.orderBy('createdAt').toArray();
  const maxNum = existing.reduce((max, c) => {
    const m = c.label.match(/#(\d+)/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const newCart: ActiveCart = {
    id: crypto.randomUUID ? crypto.randomUUID() : `cart-${Date.now()}-${Math.random()}`,
    label: `Customer #${maxNum + 1}`,
    createdAt: Date.now(),
    items: [],
  };
  await db.active_carts.add(newCart);
  return newCart;
}

let ensureCartInFlight: Promise<ActiveCart> | null = null;

export async function ensureAtLeastOneCart(): Promise<ActiveCart> {
  if (ensureCartInFlight) return ensureCartInFlight;
  ensureCartInFlight = db
    .transaction('rw', db.active_carts, async () => {
      const existing = await db.active_carts.orderBy('createdAt').first();
      if (existing) return existing;
      const cart: ActiveCart = {
        id: crypto.randomUUID ? crypto.randomUUID() : `cart-${Date.now()}`,
        label: 'Customer #1',
        createdAt: Date.now(),
        items: [],
      };
      await db.active_carts.add(cart);
      return cart;
    })
    .finally(() => {
      ensureCartInFlight = null;
    });
  return ensureCartInFlight;
}

export async function recordCashSale(params: {
  cart: ActiveCart;
  amountTendered: number;
  dateKey?: string;
}): Promise<number> {
  const dateKey = params.dateKey || getTodayDateKey();
  const weekInfo = getCalendarWeekInfo(dateKey);
  const { subtotal, costTotal } = summarizeCart(params.cart.items);
  if (subtotal <= 0 || params.cart.items.length === 0) {
    throw new Error('Cart is empty.');
  }
  const tendered = params.amountTendered > 0 ? params.amountTendered : subtotal;
  if (tendered < subtotal) {
    throw new Error('Cash tendered is less than cart total.');
  }
  const changeGiven = Math.round((tendered - subtotal) * 100) / 100;
  const profitDelta = Math.round((subtotal - costTotal) * 100) / 100;

  return db.transaction(
    'rw',
    [db.products, db.transactions, db.active_carts],
    async () => {
      await decrementCartStock(params.cart.items);
      const txId = await db.transactions.add({
        date: dateKey,
        timestamp: Date.now(),
        weekKey: weekInfo.weekKey,
        type: 'sale',
        paymentMethod: 'cash',
        items: params.cart.items,
        subtotal,
        costTotal,
        amountPaid: tendered,
        changeGiven,
        cashDelta: subtotal,
        mpesaDelta: 0,
        profitDelta,
        commissionEarned: 0,
        status: 'completed',
      });
      await db.active_carts.delete(params.cart.id);
      return txId;
    }
  );
}

export async function recordMpesaSale(params: {
  cart: ActiveCart;
  parsedSms: ParsedMpesaSms;
  dateKey?: string;
}): Promise<{ txId: number; cashChange: number }> {
  const dateKey = params.dateKey || getTodayDateKey();
  const weekInfo = getCalendarWeekInfo(dateKey);
  const { subtotal, costTotal } = summarizeCart(params.cart.items);

  if (subtotal <= 0 || params.cart.items.length === 0) {
    throw new Error('Cart is empty.');
  }
  if (!params.parsedSms.isValid) {
    throw new Error(params.parsedSms.error || 'Invalid M-Pesa confirmation SMS.');
  }
  if (params.parsedSms.amount < subtotal) {
    throw new Error(
      `M-Pesa amount (KES ${params.parsedSms.amount}) is less than cart total (KES ${subtotal}).`
    );
  }

  const cashChange = Math.round((params.parsedSms.amount - subtotal) * 100) / 100;
  const cashDelta = -cashChange;
  const mpesaDelta = params.parsedSms.amount;
  const profitDelta = Math.round((subtotal - costTotal) * 100) / 100;

  return db.transaction(
    'rw',
    [db.products, db.transactions, db.mpesa_logs, db.active_carts],
    async () => {
      const existing = await db.mpesa_logs.get(params.parsedSms.code);
      if (existing) {
        throw new DuplicateMpesaError(existing);
      }

      await decrementCartStock(params.cart.items);

      const txId = await db.transactions.add({
        date: dateKey,
        timestamp: Date.now(),
        weekKey: weekInfo.weekKey,
        type: 'sale',
        paymentMethod: 'mpesa',
        items: params.cart.items,
        subtotal,
        costTotal,
        amountPaid: params.parsedSms.amount,
        changeGiven: cashChange,
        cashDelta,
        mpesaDelta,
        profitDelta,
        commissionEarned: 0,
        mpesaCode: params.parsedSms.code,
        note: `${params.parsedSms.senderName}${params.parsedSms.senderPhone ? ` (${params.parsedSms.senderPhone})` : ''}`,
        status: 'completed',
      });

      await db.mpesa_logs.add({
        code: params.parsedSms.code,
        amount: params.parsedSms.amount,
        senderName: params.parsedSms.senderName,
        senderPhone: params.parsedSms.senderPhone,
        rawTimestamp: params.parsedSms.rawTimestamp,
        loggedAt: Date.now(),
        date: dateKey,
        transactionId: txId,
      });

      await db.active_carts.delete(params.cart.id);
      return { txId, cashChange };
    }
  );
}

export async function recordDeniSale(params: {
  cart: ActiveCart;
  debtorId?: number;
  newDebtorName?: string;
  newDebtorPhone?: string;
  dateKey?: string;
}): Promise<number> {
  const dateKey = params.dateKey || getTodayDateKey();
  const weekInfo = getCalendarWeekInfo(dateKey);
  const { subtotal, costTotal } = summarizeCart(params.cart.items);

  if (subtotal <= 0 || params.cart.items.length === 0) {
    throw new Error('Cart is empty.');
  }

  return db.transaction(
    'rw',
    [db.products, db.transactions, db.debtors, db.active_carts],
    async () => {
      await decrementCartStock(params.cart.items);

      let targetDebtorId = params.debtorId;
      let targetDebtorName = params.newDebtorName?.trim() || '';
      const now = Date.now();

      if (targetDebtorId) {
        const existingDebtor = await db.debtors.get(targetDebtorId);
        if (!existingDebtor) {
          throw new Error('Selected customer not found in Deni Book.');
        }
        targetDebtorName = existingDebtor.name;
        await db.debtors.update(targetDebtorId, {
          balance: Math.round((existingDebtor.balance + subtotal) * 100) / 100,
          unpaidCost: Math.round((existingDebtor.unpaidCost + costTotal) * 100) / 100,
          totalGiven: Math.round((existingDebtor.totalGiven + subtotal) * 100) / 100,
          updatedAt: now,
        });
      } else {
        if (!targetDebtorName) {
          throw new Error('Customer name is required for Deni credit.');
        }
        targetDebtorId = await db.debtors.add({
          name: targetDebtorName,
          phone: (params.newDebtorPhone || '').trim(),
          balance: subtotal,
          unpaidCost: costTotal,
          totalGiven: subtotal,
          totalRepaid: 0,
          updatedAt: now,
        });
      }

      const txId = await db.transactions.add({
        date: dateKey,
        timestamp: now,
        weekKey: weekInfo.weekKey,
        type: 'sale',
        paymentMethod: 'deni',
        items: params.cart.items,
        subtotal,
        costTotal,
        amountPaid: 0,
        changeGiven: 0,
        cashDelta: 0,
        mpesaDelta: 0,
        profitDelta: 0,
        commissionEarned: 0,
        debtorId: targetDebtorId,
        debtorName: targetDebtorName,
        status: 'completed',
      });

      await db.active_carts.delete(params.cart.id);
      return txId;
    }
  );
}

export async function recordDeniRepayment(params: {
  debtorId: number;
  amount: number;
  method: 'cash' | 'mpesa';
  parsedSms?: ParsedMpesaSms;
  dateKey?: string;
}): Promise<number> {
  const dateKey = params.dateKey || getTodayDateKey();
  const weekInfo = getCalendarWeekInfo(dateKey);

  return db.transaction(
    'rw',
    [db.debtors, db.transactions, db.mpesa_logs],
    async () => {
      const debtor = await db.debtors.get(params.debtorId);
      if (!debtor) throw new Error('Customer not found.');

      const split = computeDeniRepaymentSplit(
        debtor.balance,
        debtor.unpaidCost,
        params.amount
      );
      if (!split.valid) {
        throw new Error(split.error || 'Invalid repayment amount.');
      }

      if (params.method === 'mpesa') {
        if (!params.parsedSms || !params.parsedSms.isValid) {
          throw new Error(
            params.parsedSms?.error || 'Paste a valid M-Pesa SMS for repayment verification.'
          );
        }
        const existingLog = await db.mpesa_logs.get(params.parsedSms.code);
        if (existingLog) {
          throw new DuplicateMpesaError(existingLog);
        }
      }

      const now = Date.now();
      await db.debtors.update(params.debtorId, {
        balance: split.newBalance,
        unpaidCost: split.newUnpaidCost,
        totalRepaid: Math.round((debtor.totalRepaid + split.appliedRepayment) * 100) / 100,
        updatedAt: now,
      });

      const txId = await db.transactions.add({
        date: dateKey,
        timestamp: now,
        weekKey: weekInfo.weekKey,
        type: 'deni_repayment',
        paymentMethod: params.method,
        items: [],
        subtotal: split.appliedRepayment,
        costTotal: split.costRecovered,
        amountPaid: split.appliedRepayment,
        changeGiven: 0,
        cashDelta: params.method === 'cash' ? split.appliedRepayment : 0,
        mpesaDelta: params.method === 'mpesa' ? split.appliedRepayment : 0,
        profitDelta: split.realizedProfit,
        commissionEarned: 0,
        mpesaCode: params.method === 'mpesa' ? params.parsedSms?.code : undefined,
        debtorId: debtor.id,
        debtorName: debtor.name,
        note: `Deni repayment by ${debtor.name}`,
        status: 'completed',
      });

      if (params.method === 'mpesa' && params.parsedSms) {
        await db.mpesa_logs.add({
          code: params.parsedSms.code,
          amount: params.parsedSms.amount,
          senderName: params.parsedSms.senderName,
          senderPhone: params.parsedSms.senderPhone,
          rawTimestamp: params.parsedSms.rawTimestamp,
          loggedAt: now,
          date: dateKey,
          transactionId: txId,
        });
      }

      return txId;
    }
  );
}

export async function recordAgentOperation(params: {
  opType: 'deposit' | 'withdraw';
  amount: number;
  mode: AgentMode;
  customerPhone?: string;
  dateKey?: string;
}): Promise<number> {
  const dateKey = params.dateKey || getTodayDateKey();
  const weekInfo = getCalendarWeekInfo(dateKey);
  const calc = calculateAgentTransaction(params.opType, params.amount, params.mode);
  if (!calc.valid) {
    throw new Error(calc.error || 'Invalid agent transaction.');
  }

  return db.transactions.add({
    date: dateKey,
    timestamp: Date.now(),
    weekKey: weekInfo.weekKey,
    type: params.opType === 'deposit' ? 'agent_deposit' : 'agent_withdraw',
    paymentMethod: 'agent',
    items: [],
    subtotal: params.amount,
    costTotal: 0,
    amountPaid: params.amount,
    changeGiven: 0,
    cashDelta: calc.cashDelta,
    mpesaDelta: calc.mpesaDelta,
    profitDelta: calc.profitDelta,
    commissionEarned: calc.commissionEarned,
    note: `${params.opType === 'deposit' ? 'Deposit' : 'Withdraw'} (${params.mode === 'direct' ? 'Direct 100%' : 'Sub-Agent 80%'})${params.customerPhone ? ` · ${params.customerPhone}` : ''}`,
    status: 'completed',
  });
}

export async function voidTransaction(params: {
  txId: number;
  reason: string;
}): Promise<void> {
  const cleanReason = params.reason.trim() || 'Voided by Owner';
  await db.transaction(
    'rw',
    [db.transactions, db.products, db.debtors, db.audit_logs],
    async () => {
      const tx = await db.transactions.get(params.txId);
      if (!tx) throw new Error('Transaction not found.');
      if (tx.status === 'voided') throw new Error('Transaction is already voided.');

      const now = Date.now();
      await db.transactions.update(params.txId, {
        status: 'voided',
        voidReason: cleanReason,
        voidedAt: now,
      });

      // Restore stock if sale
      if (tx.type === 'sale' && tx.items.length > 0) {
        for (const item of tx.items) {
          const prod = await db.products.get(item.productId);
          if (prod) {
            await db.products.update(item.productId, {
              stockQty: prod.stockQty + item.qty,
              updatedAt: now,
            });
          }
        }
      }

      // Reverse debtor balance if Deni sale
      if (tx.type === 'sale' && tx.paymentMethod === 'deni' && tx.debtorId) {
        const debtor = await db.debtors.get(tx.debtorId);
        if (debtor) {
          await db.debtors.update(tx.debtorId, {
            balance: Math.max(0, Math.round((debtor.balance - tx.subtotal) * 100) / 100),
            unpaidCost: Math.max(0, Math.round((debtor.unpaidCost - tx.costTotal) * 100) / 100),
            totalGiven: Math.max(0, Math.round((debtor.totalGiven - tx.subtotal) * 100) / 100),
            updatedAt: now,
          });
        }
      }

      // Reverse debtor balance if Deni repayment was voided
      if (tx.type === 'deni_repayment' && tx.debtorId) {
        const debtor = await db.debtors.get(tx.debtorId);
        if (debtor) {
          await db.debtors.update(tx.debtorId, {
            balance: Math.round((debtor.balance + tx.amountPaid) * 100) / 100,
            unpaidCost: Math.round((debtor.unpaidCost + tx.costTotal) * 100) / 100,
            totalRepaid: Math.max(0, Math.round((debtor.totalRepaid - tx.amountPaid) * 100) / 100),
            updatedAt: now,
          });
        }
      }

      await db.audit_logs.add({
        timestamp: now,
        date: getTodayDateKey(),
        action: 'void_transaction',
        summary: `Voided ${tx.type.replace('_', ' ')} #${tx.id} (KES ${tx.subtotal})`,
        details: `Date: ${tx.date} · Method: ${tx.paymentMethod} · Reason: ${cleanReason}`,
      });
    }
  );
}

export interface BackupPayload {
  app: 'DukaPulse';
  version: 1;
  exportedAt: string;
  settings?: ShopSettings;
  daily_floats: DailyFloat[];
  products: Product[];
  transactions: Transaction[];
  mpesa_logs: MpesaLog[];
  debtors: Debtor[];
  audit_logs: AuditLogEntry[];
}

export async function exportFullBackup(): Promise<BackupPayload> {
  const [settings, daily_floats, products, transactions, mpesa_logs, debtors, audit_logs] =
    await Promise.all([
      db.settings.get('shop'),
      db.daily_floats.toArray(),
      db.products.toArray(),
      db.transactions.toArray(),
      db.mpesa_logs.toArray(),
      db.debtors.toArray(),
      db.audit_logs.toArray(),
    ]);

  return {
    app: 'DukaPulse',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    daily_floats,
    products,
    transactions,
    mpesa_logs,
    debtors,
    audit_logs,
  };
}

export async function restoreFullBackup(payload: BackupPayload): Promise<void> {
  if (!payload || payload.app !== 'DukaPulse' || !Array.isArray(payload.products)) {
    throw new Error('Invalid DukaPulse backup JSON file.');
  }

  await db.transaction(
    'rw',
    [
      db.settings,
      db.daily_floats,
      db.products,
      db.transactions,
      db.mpesa_logs,
      db.debtors,
      db.audit_logs,
    ],
    async () => {
      await Promise.all([
        db.daily_floats.clear(),
        db.products.clear(),
        db.transactions.clear(),
        db.mpesa_logs.clear(),
        db.debtors.clear(),
        db.audit_logs.clear(),
      ]);

      if (payload.settings) {
        await db.settings.put({ ...payload.settings, id: 'shop' });
      }
      if (payload.daily_floats.length) await db.daily_floats.bulkPut(payload.daily_floats);
      if (payload.products.length) await db.products.bulkPut(payload.products);
      if (payload.transactions.length) await db.transactions.bulkPut(payload.transactions);
      if (payload.mpesa_logs.length) await db.mpesa_logs.bulkPut(payload.mpesa_logs);
      if (payload.debtors.length) await db.debtors.bulkPut(payload.debtors);
      if (payload.audit_logs.length) await db.audit_logs.bulkPut(payload.audit_logs);

      await db.audit_logs.add({
        timestamp: Date.now(),
        date: getTodayDateKey(),
        action: 'backup_restore',
        summary: 'Restored shop database from JSON backup',
        details: `Backup exported at ${payload.exportedAt}`,
      });
    }
  );
}
