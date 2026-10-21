import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { interval, map, merge, Observable } from 'rxjs';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Strumień zdarzeń (SSE). Token przekazywany w query: /api/events?token=... */
  @Sse()
  stream(): Observable<MessageEvent> {
    const heartbeat = interval(25_000).pipe(map(() => ({ type: 'ping', data: {} })));
    const events = this.events.stream().pipe(map((e) => ({ type: e.type, data: e.payload ?? {} })));
    return merge(events, heartbeat);
  }
}
