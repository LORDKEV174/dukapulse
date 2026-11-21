export type ThemeMode = 'system' | 'light' | 'dark';

export type ReceivingMethod = 'till' | 'paybill' | 'pochi';

export type AgentMode = 'direct' | 'subagent';

export type TabKey = 'sell' | 'deni' | 'stock' | 'reports' | 'settings';

export interface ShopSettings {
  id: 'shop';
  shopName: string;
  receivingMethod: ReceivingMethod;
  tillNumber: string;
  paybillNumber: string;
  accountNumber: string;
  phoneNumber: string;
  pinHash: string;
  recoveryQuestion: string;
  recoveryAnswerHash: string;
  theme: ThemeMode;
  agentEnabled: boolean;
  agentMode: AgentMode;
  onboardingComplete: boolean;
  updatedAt: number;
}

export interface DailyFloat {
  date: string; // YYYY-MM-DD (Primary Key)
  openingCash: number;
  openingMpesa: number;
  createdAt: number;
  updatedAt: number;
}

export interface Product {
  id?: number;
  name: string;
  buyingPrice: number;
  sellingPrice: number;
  stockQty: number;
  lowStockAlert: number;
  updatedAt: number;
}

export interface CartItem {
  productId: number;
  name: string;
  buyingPrice: number;
  sellingPrice: number;
  qty: number;
}

export interface ActiveCart {
  id: string;
  label: string;
  createdAt: number;
  items: CartItem[];
}

export type TransactionType =
  | 'sale'
  | 'agent_deposit'
  | 'agent_withdraw'
  | 'deni_repayment';

export type PaymentMethod = 'cash' | 'mpesa' | 'deni' | 'agent';

export type TransactionStatus = 'completed' | 'voided';

export interface Transaction {
  id?: number;
  date: string; // YYYY-MM-DD (Indexed)
  timestamp: number;
  weekKey: string; // e.g. 2026-W47
  type: TransactionType;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  subtotal: number;
  costTotal: number;
  amountPaid: number;
  changeGiven: number;
  cashDelta: number;
  mpesaDelta: number;
  profitDelta: number;
  commissionEarned: number;
  mpesaCode?: string;
  debtorId?: number;
  debtorName?: string;
  status: TransactionStatus;
  voidReason?: string;
  voidedAt?: number;
  note?: string;
}

export interface MpesaLog {
  code: string; // Primary Key, 10-char uppercase /^[A-Z0-9]{10}$/
  amount: number;
  senderName: string;
  senderPhone: string;
  rawTimestamp: string;
  loggedAt: number;
  date: string;
  transactionId?: number;
}

export interface Debtor {
  id?: number;
  name: string;
  phone: string;
  balance: number;
  unpaidCost: number;
  totalGiven: number;
  totalRepaid: number;
  updatedAt: number;
}

export type AuditAction =
  | 'void_transaction'
  | 'edit_float'
  | 'stock_add'
  | 'stock_edit'
  | 'stock_delete'
  | 'pin_change'
  | 'agent_toggle'
  | 'settings_edit'
  | 'backup_restore';

export interface AuditLogEntry {
  id?: number;
  timestamp: number;
  date: string;
  action: AuditAction;
  summary: string;
  details: string;
}
