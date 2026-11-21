import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  MessageCircle,
  Printer,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import {
  db,
  exportFullBackup,
  restoreFullBackup,
  voidTransaction,
  type BackupPayload,
} from '../db/database';
import type {
  AuditLogEntry,
  Debtor,
  Product,
  ShopSettings,
  Transaction,
} from '../types/duka';
import { formatDayDate, formatKES, formatTime } from '../utils/dates';
import {
  computeShopCapitalSnapshot,
  groupTransactionsByCalendarWeek,
  type DailySummary,
} from '../utils/finance';

interface ReportsViewProps {
  settings: ShopSettings;
  todaySummary: DailySummary;
  todayTransactions: Transaction[];
  products: Product[];
  debtors: Debtor[];
  todayDateKey: string;
  isUnlocked: boolean;
  onRequestUnlock: () => void;
  onRequirePin: (action: () => void, title: string, subtitle: string) => void;
}

const MASKED = 'KES •••••';

export const ReportsView: React.FC<ReportsViewProps> = ({
  settings,
  todaySummary,
  todayTransactions,
  products,
  debtors,
  todayDateKey,
  isUnlocked,
  onRequestUnlock,
  onRequirePin,
}) => {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadHistory = async () => {
    setLoadingWeeks(true);
    try {
      const txs = await db.transactions.toArray();
      setAllTransactions(txs);
    } finally {
      setLoadingWeeks(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [todayTransactions.length]);

  const weeklyGroups = useMemo(
    () => groupTransactionsByCalendarWeek(allTransactions),
    [allTransactions]
  );

  const activeWeek = useMemo(() => {
    if (weeklyGroups.length === 0) return null;
    return (
      weeklyGroups.find((w) => w.weekKey === selectedWeekKey) ||
      weeklyGroups[0]
    );
  }, [weeklyGroups, selectedWeekKey]);

  const capitalSnapshot = useMemo(
    () =>
      computeShopCapitalSnapshot(
        todaySummary.expectedCash,
        todaySummary.expectedMpesa,
        products,
        debtors
      ),
    [todaySummary, products, debtors]
  );

  const buildWhatsAppSummaryUrl = (): string => {
    const lines = [
      `*${settings.shopName} — Shop Summary*`,
      `Today (${formatDayDate(todayDateKey)}):`,
      `• Sales: ${formatKES(todaySummary.todaysSales)} (Cash ${formatKES(todaySummary.cashSales)}, M-Pesa ${formatKES(todaySummary.mpesaSales)})`,
      `• Deni Given: ${formatKES(todaySummary.givenOnDeni)} · Repaid: ${formatKES(todaySummary.deniRepaid)}`,
      `• Realized Profit: ${formatKES(todaySummary.todaysProfit)}`,
      `• Drawer Cash: ${formatKES(todaySummary.expectedCash)} · M-Pesa: ${formatKES(todaySummary.expectedMpesa)}`,
    ];
    if (activeWeek) {
      lines.push('');
      lines.push(`*${activeWeek.label}*`);
      lines.push(
        `• Weekly Sales: ${formatKES(activeWeek.totals.salesTotal)} · Profit: ${formatKES(activeWeek.totals.realizedProfit)}`
      );
    }
    return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  const handleExportCsv = () => {
    const headers = [
      'ID',
      'Date',
      'Week',
      'Type',
      'PaymentMethod',
      'Subtotal',
      'AmountPaid',
      'CashDelta',
      'MpesaDelta',
      'ProfitDelta',
      'MpesaCode',
      'DebtorName',
      'Status',
      'Note',
    ];
    const rows = allTransactions.map((t) => [
      t.id ?? '',
      t.date,
      t.weekKey,
      t.type,
      t.paymentMethod,
      t.subtotal,
      t.amountPaid,
      t.cashDelta,
      t.mpesaDelta,
      t.profitDelta,
      t.mpesaCode ?? '',
      t.debtorName ?? '',
      t.status,
      (t.note ?? '').replace(/"/g, '""'),
    ]);
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dukapulse-transactions-${todayDateKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJsonAfterPin = () => {
    onRequirePin(
      async () => {
        const payload = await exportFullBackup();
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dukapulse-backup-${todayDateKey}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setFeedback('Full JSON backup exported.');
      },
      'Export Full Backup',
      'Owner PIN required to export complete shop data.'
    );
  };

  const handleRestoreClickAfterPin = () => {
    onRequirePin(
      () => {
        fileInputRef.current?.click();
      },
      'Restore JSON Backup',
      'Owner PIN required before restoring shop backup.'
    );
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      await restoreFullBackup(parsed);
      await loadHistory();
      setFeedback('Database restored from backup successfully.');
      setError('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid backup JSON file.'
      );
    }
  };

  const handleOpenAuditAfterPin = () => {
    onRequirePin(
      async () => {
        const logs = await db.audit_logs.orderBy('timestamp').reverse().limit(100).toArray();
        setAuditLogs(logs);
        setShowAuditModal(true);
      },
      'Open Audit Log',
      'Owner PIN required to inspect voids, float edits, and stock changes.'
    );
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget?.id) return;
    await voidTransaction({
      txId: voidTarget.id,
      reason: voidReason || 'Voided by Owner',
    });
    setVoidTarget(null);
    setVoidReason('');
    await loadHistory();
    setFeedback(`Transaction #${voidTarget.id} marked as voided and logged.`);
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          role="status"
          className="no-print rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-4 py-3 text-xs font-semibold text-emerald-900 dark:text-emerald-200"
        >
          {feedback}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="no-print rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-4 py-3 text-xs font-semibold text-rose-800 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      {/* Total Shop Capital Snapshot */}
      <section className="no-print rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Total Shop Capital Snapshot
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Cash + M-Pesa + Stock Cost Value + Unpaid Deni
            </p>
          </div>
          {!isUnlocked && (
            <button
              type="button"
              onClick={onRequestUnlock}
              className="min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white"
            >
              Unlock Figures
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: 'Drawer Cash', val: capitalSnapshot.expectedCash },
            { label: 'M-Pesa Balance', val: capitalSnapshot.expectedMpesa },
            { label: 'Stock Cost Value', val: capitalSnapshot.stockCostValue },
            { label: 'Unpaid Deni', val: capitalSnapshot.unpaidDeni },
            {
              label: 'Total Shop Capital',
              val: capitalSnapshot.totalCapital,
              accent: true,
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3"
            >
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                {c.label}
              </p>
              <p
                className={`mt-1 font-mono-tabular text-sm font-extrabold ${
                  c.accent && isUnlocked
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-slate-50'
                }`}
              >
                {isUnlocked ? formatKES(c.val) : MASKED}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Action Bar: Report Viewer/PDF, WhatsApp, CSV, JSON, Audit Log */}
      <section className="no-print rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white"
          >
            <FileText className="h-4 w-4" />
            <span>Open Report & Print PDF</span>
          </button>

          <a
            href={buildWhatsAppSummaryUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300"
          >
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp Summary</span>
          </a>

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportJsonAfterPin}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <Download className="h-4 w-4" />
            <span>Backup JSON</span>
          </button>

          <button
            type="button"
            onClick={handleRestoreClickAfterPin}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <Upload className="h-4 w-4" />
            <span>Restore JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={(e) => void handleFileSelected(e)}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleOpenAuditAfterPin}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <History className="h-4 w-4" />
            <span>Audit Log</span>
          </button>
        </div>
      </section>

      {/* Calendar Week Report Breakdown */}
      <section className="no-print rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Weekly Performance
            </h2>
            {activeWeek && (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                {activeWeek.label}
              </p>
            )}
          </div>
          {weeklyGroups.length > 0 && (
            <select
              aria-label="Select Calendar Week"
              value={activeWeek?.weekKey || ''}
              onChange={(e) => setSelectedWeekKey(e.target.value)}
              className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
            >
              {weeklyGroups.map((w) => (
                <option key={w.weekKey} value={w.weekKey}>
                  {w.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {loadingWeeks ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Loading weekly summaries...
          </p>
        ) : !activeWeek ? (
          <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No completed transactions yet. Sales, Deni, and Agent operations will group here by calendar week automatically.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3">
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Weekly Sales
                </p>
                <p className="mt-1 font-mono-tabular text-sm font-extrabold text-slate-900 dark:text-slate-50">
                  {formatKES(activeWeek.totals.salesTotal)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3">
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Cash + M-Pesa
                </p>
                <p className="mt-1 font-mono-tabular text-xs font-bold text-slate-900 dark:text-slate-50">
                  {formatKES(activeWeek.totals.cashSales)} / {formatKES(activeWeek.totals.mpesaSales)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3">
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Agent Commission
                </p>
                <p className="mt-1 font-mono-tabular text-sm font-extrabold text-slate-900 dark:text-slate-50">
                  {formatKES(activeWeek.totals.agentCommission)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3">
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Realized Profit
                </p>
                <p className="mt-1 font-mono-tabular text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
                  {isUnlocked ? formatKES(activeWeek.totals.realizedProfit) : MASKED}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Day</th>
                    <th className="py-2 px-2 font-semibold text-right">Sales</th>
                    <th className="py-2 px-2 font-semibold text-right">Deni Repaid</th>
                    <th className="py-2 pl-2 font-semibold text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono-tabular">
                  {activeWeek.dailyRows.map((row) => (
                    <tr key={row.date}>
                      <td className="py-2.5 pr-3 font-sans font-semibold text-slate-900 dark:text-slate-100">
                        {formatDayDate(row.date)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-800 dark:text-slate-200">
                        {formatKES(row.salesTotal)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-800 dark:text-slate-200">
                        {formatKES(row.deniRepaid)}
                      </td>
                      <td className="py-2.5 pl-2 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        {isUnlocked ? formatKES(row.realizedProfit) : MASKED}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Today's Transactions (with PIN-protected Void — never hard-delete) */}
      <section className="no-print rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Today&apos;s Transactions ({todayTransactions.length})
        </h2>

        {todayTransactions.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No transactions recorded today yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...todayTransactions]
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((tx) => {
                const isVoided = tx.status === 'voided';
                return (
                  <div
                    key={tx.id}
                    className={`py-3 flex items-center justify-between gap-3 ${
                      isVoided ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {tx.type === 'sale'
                          ? `Sale (${tx.paymentMethod.toUpperCase()})`
                          : tx.type === 'deni_repayment'
                            ? `Deni Repaid (${tx.paymentMethod.toUpperCase()})`
                            : tx.type === 'agent_deposit'
                              ? 'M-Pesa Agent Deposit'
                              : 'M-Pesa Agent Withdraw'}
                        {tx.mpesaCode ? ` · ${tx.mpesaCode}` : ''}
                        {tx.debtorName ? ` · ${tx.debtorName}` : ''}
                        {isVoided ? ' · VOIDED' : ''}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                        {formatTime(tx.timestamp)}
                        {tx.items.length > 0
                          ? ` · ${tx.items.map((i) => `${i.name}×${i.qty}`).join(', ')}`
                          : tx.note
                            ? ` · ${tx.note}`
                            : ''}
                        {isVoided && tx.voidReason ? ` · Reason: ${tx.voidReason}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-mono-tabular text-xs font-extrabold ${
                          isVoided
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatKES(tx.subtotal)}
                      </span>
                      {!isVoided && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequirePin(
                              () => {
                                setVoidTarget(tx);
                                setVoidReason('');
                              },
                              `Void Transaction #${tx.id}`,
                              'Owner PIN required to void a sale or repayment. Voided items restore stock and log to Audit Trail.'
                            )
                          }
                          aria-label={`Void transaction ${tx.id}`}
                          className="min-h-[40px] px-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          <span>Void</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Void Reason Modal */}
      {voidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="void-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3
                id="void-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-50"
              >
                Void Transaction #{voidTarget.id}
              </h3>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                aria-label="Close void modal"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmVoid} className="mt-3 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                This will mark {formatKES(voidTarget.subtotal)} as voided, restore stock quantities, and record an immutable audit entry.
              </p>
              <div>
                <label
                  htmlFor="void-reason-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Reason for Void
                </label>
                <input
                  id="void-reason-input"
                  type="text"
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Customer returned item / wrong entry"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Confirm Void & Log Audit
              </button>
            </form>
          </div>
        </div>
      )}

      {/* In-App Report Viewer & Print-to-PDF Modal */}
      {showPrintModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-0 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-report-title"
        >
          <div className="print-only-sheet w-full max-w-2xl rounded-none sm:rounded-2xl bg-white text-slate-900 border border-slate-200 p-6 sm:p-8 shadow-xl">
            <div className="no-print flex items-center justify-between pb-4 border-b border-slate-200 mb-5">
              <h3 id="print-report-title" className="text-base font-extrabold">
                In-App Report Viewer
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  aria-label="Close report viewer"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 text-sm">
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-xl font-extrabold text-slate-900">
                  {settings.shopName} — Business Statement
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Generated on {formatDayDate(todayDateKey)} · Local Device Ledger (DukaPulse)
                </p>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Today&apos;s Summary ({formatDayDate(todayDateKey)})
                </h5>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono-tabular">
                  <div className="border border-slate-200 rounded-lg p-2.5">
                    <span className="font-sans text-slate-500 block">Today&apos;s Sales</span>
                    <strong>{formatKES(todaySummary.todaysSales)}</strong>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-2.5">
                    <span className="font-sans text-slate-500 block">Expected Cash</span>
                    <strong>{formatKES(todaySummary.expectedCash)}</strong>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-2.5">
                    <span className="font-sans text-slate-500 block">Expected M-Pesa</span>
                    <strong>{formatKES(todaySummary.expectedMpesa)}</strong>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-2.5">
                    <span className="font-sans text-slate-500 block">Given on Deni</span>
                    <strong>{formatKES(todaySummary.givenOnDeni)}</strong>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-2.5">
                    <span className="font-sans text-slate-500 block">Agent Commission</span>
                    <strong>{formatKES(todaySummary.agentCommission)}</strong>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-2.5">
                    <span className="font-sans text-slate-500 block">Realized Profit</span>
                    <strong>{formatKES(todaySummary.todaysProfit)}</strong>
                  </div>
                </div>
              </div>

              {activeWeek && (
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    {activeWeek.label}
                  </h5>
                  <table className="w-full text-xs border-collapse border border-slate-200 font-mono-tabular">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 p-2 text-left font-sans">Date</th>
                        <th className="border border-slate-200 p-2 text-right font-sans">Sales</th>
                        <th className="border border-slate-200 p-2 text-right font-sans">Deni Repaid</th>
                        <th className="border border-slate-200 p-2 text-right font-sans">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeWeek.dailyRows.map((r) => (
                        <tr key={r.date}>
                          <td className="border border-slate-200 p-2 font-sans">{formatDayDate(r.date)}</td>
                          <td className="border border-slate-200 p-2 text-right">{formatKES(r.salesTotal)}</td>
                          <td className="border border-slate-200 p-2 text-right">{formatKES(r.deniRepaid)}</td>
                          <td className="border border-slate-200 p-2 text-right font-bold">{formatKES(r.realizedProfit)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-bold">
                        <td className="border border-slate-200 p-2 font-sans">Weekly Total</td>
                        <td className="border border-slate-200 p-2 text-right">{formatKES(activeWeek.totals.salesTotal)}</td>
                        <td className="border border-slate-200 p-2 text-right">{formatKES(activeWeek.totals.deniRepaid)}</td>
                        <td className="border border-slate-200 p-2 text-right">{formatKES(activeWeek.totals.realizedProfit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t border-slate-200 pt-3 text-xs text-slate-600">
                Total Shop Capital Snapshot: <strong className="font-mono-tabular text-slate-900">{formatKES(capitalSnapshot.totalCapital)}</strong> (Cash {formatKES(capitalSnapshot.expectedCash)} + M-Pesa {formatKES(capitalSnapshot.expectedMpesa)} + Stock Cost {formatKES(capitalSnapshot.stockCostValue)} + Unpaid Deni {formatKES(capitalSnapshot.unpaidDeni)})
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN-Protected Audit Log Modal */}
      {showAuditModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-log-title"
        >
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-emerald-600" />
                <h3
                  id="audit-log-title"
                  className="text-base font-extrabold text-slate-900 dark:text-slate-50"
                >
                  Immutable Audit Trail
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                aria-label="Close audit log"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No audit events recorded yet.
                </p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="py-2.5 text-xs">
                    <p className="font-bold text-slate-900 dark:text-slate-100">
                      {log.summary}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {log.date} · {formatTime(log.timestamp)} · {log.details}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
