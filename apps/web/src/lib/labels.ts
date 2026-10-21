import type {
  AlertType, ContractorType, InvoiceStatus, IssueStatus, LocationType, MovementType, PaymentMethod,
  ProductUnit, ReceiptMode, ReceiptStatus, Role, TaskPriority,
} from '@/api/types';

export const ROLE: Record<Role, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Kierownik magazynu',
  OPERATOR: 'Magazynier',
  ACCOUNTANT: 'Księgowość',
};

export const LOCATION_TYPE: Record<LocationType, string> = {
  RECEIVING: 'Przyjęcia',
  STORAGE: 'Składowanie',
  PICKING: 'Kompletacja',
  SHIPPING: 'Wysyłka',
  QUARANTINE: 'Kwarantanna',
};

export const UNIT_NAME: Record<ProductUnit, string> = {
  PCS: 'sztuka', PACK: 'opakowanie', ROLL: 'rolka', SET: 'komplet', KG: 'kilogram',
};

export const CONTRACTOR_TYPE: Record<ContractorType, string> = { SUPPLIER: 'Dostawca', CUSTOMER: 'Odbiorca', BOTH: 'Dostawca i odbiorca' };

export const RECEIPT_STATUS: Record<ReceiptStatus, string> = {
  DRAFT: 'Awizacja', RECEIVING: 'W trakcie', COMPLETED: 'Zakończone', CANCELLED: 'Anulowane',
};

export const RECEIPT_MODE: Record<ReceiptMode, string> = { PIECE: 'Na sztuki', PALLET: 'Palety', MIXED_PALLET: 'Paleta matczyna' };

export const ISSUE_STATUS: Record<IssueStatus, string> = { DRAFT: 'Szkic', CONFIRMED: 'Wydane', CANCELLED: 'Anulowane' };

export const INVOICE_STATUS: Record<InvoiceStatus, string> = { ISSUED: 'Nieopłacona', PAID: 'Opłacona', CANCELLED: 'Anulowana' };

export const PAYMENT: Record<PaymentMethod, string> = { TRANSFER: 'Przelew', CASH: 'Gotówka', CARD: 'Karta' };

export const MOVEMENT: Record<MovementType, string> = {
  RECEIPT: 'Przyjęcie',
  PUTAWAY: 'Rozlokowanie',
  TRANSFER: 'Przesunięcie',
  REPLENISHMENT: 'Uzupełnienie',
  ISSUE: 'Wydanie',
  ADJUSTMENT_PLUS: 'Korekta +',
  ADJUSTMENT_MINUS: 'Korekta −',
  CONSUMPTION: 'Zużycie wewn.',
};

export const ALERT_TYPE: Record<AlertType, string> = { LOW_STOCK: 'Niski stan', OUT_OF_STOCK: 'Brak towaru' };

export const PRIORITY: Record<TaskPriority, string> = { URGENT: 'Pilne', HIGH: 'Wysoki', NORMAL: 'Normalny' };
