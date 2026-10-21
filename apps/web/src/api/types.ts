export type Role = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'ACCOUNTANT';
export type LocationType = 'RECEIVING' | 'STORAGE' | 'PICKING' | 'SHIPPING' | 'QUARANTINE';
export type ProductUnit = 'PCS' | 'PACK' | 'ROLL' | 'SET' | 'KG';
export type ContractorType = 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
export type ReceiptStatus = 'DRAFT' | 'RECEIVING' | 'COMPLETED' | 'CANCELLED';
export type ReceiptMode = 'PIECE' | 'PALLET' | 'MIXED_PALLET';
export type IssueStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
export type InvoiceType = 'SALES' | 'PURCHASE';
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'TRANSFER' | 'CASH' | 'CARD';
export type MovementType =
  | 'RECEIPT' | 'PUTAWAY' | 'TRANSFER' | 'REPLENISHMENT' | 'ISSUE' | 'ADJUSTMENT_PLUS' | 'ADJUSTMENT_MINUS' | 'CONSUMPTION';
export type AlertType = 'LOW_STOCK' | 'OUT_OF_STOCK';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'URGENT' | 'HIGH' | 'NORMAL';
export type HuType = 'PALLET' | 'CARTON';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active?: boolean;
  createdAt?: string;
}

export interface Contractor {
  id: string;
  type: ContractorType;
  name: string;
  shortName?: string | null;
  nip?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string;
  email?: string | null;
  phone?: string | null;
  paymentDays?: number | null;
  active: boolean;
}

export interface LocationRef {
  id: string;
  code: string;
  type: LocationType;
  zone?: string;
}

export interface Location extends LocationRef {
  name?: string | null;
  zone: string;
  maxPallets?: number | null;
  active: boolean;
  totalQty: number;
  stockLines: number;
  pallets: number;
}

export interface ProductRef {
  id: string;
  sku: string;
  name: string;
  unit: ProductUnit;
}

export interface PickFace {
  id: string;
  productId: string;
  locationId: string;
  minQty: number;
  maxQty: number;
  location: { id?: string; code: string };
}

export interface Product extends ProductRef {
  ean?: string | null;
  description?: string | null;
  category?: string | null;
  purchasePrice: number;
  avgCost: number;
  salePrice: number;
  vatRate: number;
  minStock: number;
  reorderQty: number;
  unitsPerCarton?: number | null;
  unitsPerPallet?: number | null;
  isPackaging: boolean;
  trackBatches: boolean;
  active: boolean;
  pickFaces: PickFace[];
  stock?: number;
  belowMin?: boolean;
}

export interface StockItem {
  id: string;
  productId: string;
  locationId: string;
  handlingUnitId?: string | null;
  batch?: string | null;
  expiryDate?: string | null;
  quantity: number;
  receivedAt: string;
  product: ProductRef & { avgCost?: number };
  location: LocationRef;
  handlingUnit?: { id: string; code: string; type: HuType; parent?: { id: string; code: string } | null } | null;
}

export interface ProductDetail extends Omit<Product, 'stock' | 'pickFaces'> {
  totalStock: number;
  stockValue: number;
  stock: StockItem[];
  pickFaces: (PickFace & { location: Location })[];
  alerts: Alert[];
}

export interface Alert {
  id: string;
  productId: string;
  type: AlertType;
  status: AlertStatus;
  threshold: number;
  currentQty: number;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  product: ProductRef & { reorderQty: number; isPackaging: boolean; category?: string | null };
  acknowledgedBy?: { name: string } | null;
}

export interface Movement {
  id: string;
  type: MovementType;
  quantity: number;
  batch?: string | null;
  documentNo?: string | null;
  reason?: string | null;
  createdAt: string;
  product: { sku: string; name: string; unit: ProductUnit };
  fromLocation?: { code: string } | null;
  toLocation?: { code: string } | null;
  handlingUnit?: { code: string } | null;
  user: { name: string };
}

export interface HuNode {
  id: string;
  code: string;
  type: HuType;
  status: 'ACTIVE' | 'EMPTY';
  stock: (StockItem & { product: ProductRef })[];
  ownQty: number;
  totalQty: number;
  children: HuNode[];
}

export interface HandlingUnitListItem {
  id: string;
  code: string;
  type: HuType;
  status: 'ACTIVE' | 'EMPTY';
  createdAt: string;
  location?: LocationRef | null;
  parent?: { id: string; code: string } | null;
  receipt?: { id: string; number: string } | null;
  childCount: number;
  totalQty: number;
  products: { id: string; sku: string; name: string; quantity: number }[];
}

export interface HandlingUnitDetail {
  id: string;
  code: string;
  type: HuType;
  status: 'ACTIVE' | 'EMPTY';
  createdAt: string;
  location?: (LocationRef & { name?: string | null }) | null;
  parent?: { id: string; code: string; type: HuType } | null;
  receipt?: { id: string; number: string; supplier: { name: string } } | null;
  tree: HuNode;
  totalQty: number;
  cartonCount: number;
  summary: { product: ProductRef; quantity: number; units: number }[];
  history: Movement[];
}

export interface ReceiptLine {
  id: string;
  productId: string;
  expectedQty: number;
  receivedQty: number;
  unitPrice: number;
  batch?: string | null;
  expiryDate?: string | null;
  difference: number;
  value: number;
  product: ProductRef & {
    ean?: string | null;
    unitsPerPallet?: number | null;
    unitsPerCarton?: number | null;
    trackBatches: boolean;
    vatRate: number;
  };
  entries: {
    id: string;
    mode: ReceiptMode;
    quantity: number;
    createdAt: string;
    handlingUnit?: { id: string; code: string; type: HuType; parentId?: string | null } | null;
    user: { name: string };
  }[];
}

export interface ReceiptListItem {
  id: string;
  number: string;
  status: ReceiptStatus;
  supplierDocNo?: string | null;
  expectedDate?: string | null;
  createdAt: string;
  completedAt?: string | null;
  supplier: { id: string; name: string };
  purchaseInvoice?: { id: string; number: string } | null;
  lineCount: number;
  expectedQty: number;
  receivedQty: number;
  receivedValue: number;
  progress: number;
  palletCount: number;
}

export interface ReceiptDetail {
  id: string;
  number: string;
  status: ReceiptStatus;
  supplierDocNo?: string | null;
  expectedDate?: string | null;
  notes?: string | null;
  createdAt: string;
  completedAt?: string | null;
  supplier: Contractor;
  createdBy: { name: string };
  purchaseInvoice?: { id: string; number: string; externalNumber?: string | null; netTotal: number; grossTotal: number } | null;
  lines: ReceiptLine[];
  handlingUnits: {
    id: string;
    code: string;
    type: HuType;
    status: 'ACTIVE' | 'EMPTY';
    location?: { code: string; type: LocationType } | null;
    _count: { children: number };
  }[];
  totals: { expectedQty: number; receivedQty: number; expectedValue: number; receivedValue: number; discrepancies: number };
}

export interface IssueListItem {
  id: string;
  number: string;
  status: IssueStatus;
  issueDate: string;
  createdAt: string;
  customer: { id: string; name: string };
  invoice?: { id: string; number: string } | null;
  lineCount: number;
  totalQty: number;
  netValue: number;
  costValue: number;
}

export interface IssueDetail {
  id: string;
  number: string;
  status: IssueStatus;
  issueDate: string;
  notes?: string | null;
  confirmedAt?: string | null;
  customer: Contractor;
  createdBy: { name: string };
  invoice?: { id: string; number: string; status: InvoiceStatus } | null;
  lines: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    unitCost: number;
    net: number;
    vat: number;
    gross: number;
    costValue: number;
    available: number | null;
    product: ProductRef & { ean?: string | null; avgCost: number };
    allocations: { id: string; locationCode: string; handlingUnitCode?: string | null; batch?: string | null; expiryDate?: string | null; quantity: number }[];
  }[];
  totals: { quantity: number; net: number; vat: number; gross: number; cost: number };
  canConfirm: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  type: InvoiceType;
  externalNumber?: string | null;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  paymentMethod: PaymentMethod;
  status: InvoiceStatus;
  paidAt?: string | null;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
  notes?: string | null;
  overdue: boolean;
  contractor: Contractor;
}

export interface InvoiceDetail extends Invoice {
  lines: { id: string; name: string; unit: string; quantity: number; unitNet: number; vatRate: number; net: number; vat: number; gross: number }[];
  goodsIssues: { id: string; number: string; issueDate: string }[];
  receipt?: { id: string; number: string } | null;
  createdBy: { name: string };
  breakdown: { vatRate: number; net: number; vat: number; gross: number }[];
  amountInWords: string;
  receiptValue: number | null;
  receiptDifference: number | null;
  seller: Company | null;
}

export interface Company {
  name: string;
  nip: string;
  street: string;
  postalCode: string;
  city: string;
  bankAccount?: string | null;
  bankName?: string | null;
  email?: string | null;
  phone?: string | null;
  invoicePaymentDays: number;
  expiryWarningDays: number;
}

export interface ReplenishmentRow {
  pickFaceId: string;
  product: ProductRef & { unitsPerCarton?: number | null };
  location: { id: string; code: string; zone: string };
  minQty: number;
  maxQty: number;
  current: number;
  pending: number;
  openTasks: { id: string; number: string; quantity: number }[];
  status: 'OK' | 'REQUIRED' | 'IN_PROGRESS' | 'NO_RESERVE';
  needed: number;
  reserveQty: number;
  priority: TaskPriority;
  fillPercent: number;
  suggestions: {
    fromLocationId: string;
    fromLocationCode: string;
    handlingUnitId?: string | null;
    handlingUnitCode?: string | null;
    batch?: string | null;
    expiryDate?: string | null;
    quantity: number;
  }[];
}

export interface ReplenishmentTask {
  id: string;
  number: string;
  quantity: number;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  completedAt?: string | null;
  product: ProductRef;
  fromLocation: { code: string };
  toLocation: { code: string };
  handlingUnit?: { code: string } | null;
  createdBy: { name: string };
  completedBy?: { name: string } | null;
}
