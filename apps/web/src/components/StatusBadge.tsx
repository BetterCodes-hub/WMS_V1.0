import type { AlertType, InvoiceStatus, IssueStatus, LocationType, ReceiptStatus, TaskPriority } from '@/api/types';
import { ALERT_TYPE, INVOICE_STATUS, ISSUE_STATUS, LOCATION_TYPE, PRIORITY, RECEIPT_STATUS } from '@/lib/labels';
import { Badge, Tone } from './ui/Badge';

const RECEIPT_TONE: Record<ReceiptStatus, Tone> = { DRAFT: 'gray', RECEIVING: 'blue', COMPLETED: 'green', CANCELLED: 'red' };
const ISSUE_TONE: Record<IssueStatus, Tone> = { DRAFT: 'gray', CONFIRMED: 'green', CANCELLED: 'red' };
const LOCATION_TONE: Record<LocationType, Tone> = {
  RECEIVING: 'blue', STORAGE: 'gray', PICKING: 'indigo', SHIPPING: 'violet', QUARANTINE: 'red',
};
const PRIORITY_TONE: Record<TaskPriority, Tone> = { URGENT: 'red', HIGH: 'amber', NORMAL: 'gray' };

export const ReceiptStatusBadge = ({ status }: { status: ReceiptStatus }) => (
  <Badge tone={RECEIPT_TONE[status]} dot>{RECEIPT_STATUS[status]}</Badge>
);
export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => (
  <Badge tone={ISSUE_TONE[status]} dot>{ISSUE_STATUS[status]}</Badge>
);
export const InvoiceStatusBadge = ({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) =>
  overdue ? (
    <Badge tone="red" dot>Po terminie</Badge>
  ) : (
    <Badge tone={status === 'PAID' ? 'green' : status === 'CANCELLED' ? 'gray' : 'amber'} dot>
      {INVOICE_STATUS[status]}
    </Badge>
  );
export const LocationTypeBadge = ({ type }: { type: LocationType }) => <Badge tone={LOCATION_TONE[type]}>{LOCATION_TYPE[type]}</Badge>;
export const AlertTypeBadge = ({ type }: { type: AlertType }) => (
  <Badge tone={type === 'OUT_OF_STOCK' ? 'red' : 'amber'} dot>{ALERT_TYPE[type]}</Badge>
);
export const PriorityBadge = ({ priority }: { priority: TaskPriority }) => (
  <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY[priority]}</Badge>
);
