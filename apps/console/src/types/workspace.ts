export type Environment = "live" | "test";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  env: Environment;
  created: string;
  lastUsed: string | null;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
}

export interface Transaction {
  id: string;
  label: string;
  amount: number;
  bonus: number;
  date: string;
}

export interface AutoReload {
  enabled: boolean;
  threshold: number;
  amount: number;
}

export interface TopUpPreset {
  amount: number;
  /** Fraction of the amount granted as extra credits. */
  bonus: number;
}
