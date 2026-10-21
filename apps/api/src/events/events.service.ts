import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type WmsEventType =
  | 'stock.changed'
  | 'alert.created'
  | 'alert.resolved'
  | 'replenishment.changed'
  | 'receipt.changed'
  | 'issue.changed'
  | 'invoice.changed';

export interface WmsEvent {
  type: WmsEventType;
  payload?: Record<string, unknown>;
}

/** Szyna zdarzeń domenowych publikowanych do klientów przez Server-Sent Events. */
@Injectable()
export class EventsService {
  private readonly subject = new Subject<WmsEvent>();

  emit(type: WmsEventType, payload?: Record<string, unknown>) {
    this.subject.next({ type, payload });
  }

  stream(): Observable<WmsEvent> {
    return this.subject.asObservable();
  }
}
