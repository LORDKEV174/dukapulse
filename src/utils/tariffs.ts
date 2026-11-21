import type { AgentMode } from '../types/duka';

export interface TariffBand {
  min: number;
  max: number;
  commission: number;
}

export const DEPOSIT_TARIFFS: TariffBand[] = [
  { min: 10, max: 49, commission: 0 },
  { min: 50, max: 100, commission: 4 },
  { min: 101, max: 500, commission: 11 },
  { min: 501, max: 1000, commission: 15 },
  { min: 1001, max: 1500, commission: 25 },
  { min: 1501, max: 2500, commission: 28 },
  { min: 2501, max: 3500, commission: 35 },
  { min: 3501, max: 5000, commission: 43 },
  { min: 5001, max: 7500, commission: 55 },
  { min: 7501, max: 10000, commission: 68 },
  { min: 10001, max: 15000, commission: 82 },
  { min: 15001, max: 20000, commission: 90 },
  { min: 20001, max: 35000, commission: 95 },
  { min: 35001, max: 50000, commission: 140 },
  { min: 50001, max: 250000, commission: 190 },
];

export const WITHDRAWAL_TARIFFS: TariffBand[] = [
  { min: 50, max: 100, commission: 5 },
  { min: 101, max: 500, commission: 13 },
  { min: 501, max: 1000, commission: 17 },
  { min: 1001, max: 1500, commission: 27 },
  { min: 1501, max: 2500, commission: 30 },
  { min: 2501, max: 3500, commission: 38 },
  { min: 3501, max: 5000, commission: 46 },
  { min: 5001, max: 7500, commission: 58 },
  { min: 7501, max: 10000, commission: 72 },
  { min: 10001, max: 15000, commission: 88 },
  { min: 15001, max: 20000, commission: 96 },
  { min: 20001, max: 35000, commission: 105 },
  { min: 35001, max: 50000, commission: 150 },
  { min: 50001, max: 250000, commission: 200 },
];

export interface AgentCalculation {
  valid: boolean;
  error?: string;
  baseCommission: number;
  commissionEarned: number;
  cashDelta: number;
  mpesaDelta: number;
  profitDelta: number;
}

export function lookupTariffCommission(
  type: 'deposit' | 'withdraw',
  amount: number
): number | null {
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round(amount);
  const bands = type === 'deposit' ? DEPOSIT_TARIFFS : WITHDRAWAL_TARIFFS;
  const match = bands.find((b) => rounded >= b.min && rounded <= b.max);
  return match ? match.commission : null;
}

export function calculateAgentTransaction(
  type: 'deposit' | 'withdraw',
  amount: number,
  mode: AgentMode
): AgentCalculation {
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      valid: false,
      error: 'Enter a valid amount.',
      baseCommission: 0,
      commissionEarned: 0,
      cashDelta: 0,
      mpesaDelta: 0,
      profitDelta: 0,
    };
  }

  const baseCommission = lookupTariffCommission(type, amount);
  if (baseCommission === null) {
    const min = type === 'deposit' ? 10 : 50;
    return {
      valid: false,
      error: `Amount must be between KES ${min.toLocaleString()} and KES 250,000.`,
      baseCommission: 0,
      commissionEarned: 0,
      cashDelta: 0,
      mpesaDelta: 0,
      profitDelta: 0,
    };
  }

  const splitMultiplier = mode === 'subagent' ? 0.8 : 1;
  const commissionEarned = Math.round(baseCommission * splitMultiplier * 100) / 100;

  // Deposits: +Cash in drawer, -M-Pesa float. Withdrawals: -Cash from drawer, +M-Pesa float.
  const cashDelta = type === 'deposit' ? amount : -amount;
  const mpesaDelta = type === 'deposit' ? -amount : amount;

  return {
    valid: true,
    baseCommission,
    commissionEarned,
    cashDelta,
    mpesaDelta,
    profitDelta: commissionEarned,
  };
}
