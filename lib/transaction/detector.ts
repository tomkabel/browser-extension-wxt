export interface TransactionResult {
  amount: string;
  recipient: string;
  iban?: string;
}

export interface Detector {
  name: string;
  urlPattern: RegExp;
  detect(): TransactionResult | null;
}
