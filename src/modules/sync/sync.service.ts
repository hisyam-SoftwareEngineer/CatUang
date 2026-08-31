import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { RedisService } from '../../common/services/redis.service';

export interface SyncEvent {
  businessId: string;
  type: string;
  payload: any;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly event$ = new Subject<SyncEvent>();

  constructor(private readonly redis: RedisService) {
    // Di sini kita bisa mengaktifkan listener Redis Pub/Sub untuk menyebarkan event antar instance backend.
    // Untuk development & single-instance, RxJS Subject saja sudah cukup.
  }

  /**
   * Mendaftarkan client SSE untuk mendengarkan event berdasarkan businessId mereka.
   */
  getEventStream(businessId: string): Observable<MessageEvent> {
    return this.event$.asObservable().pipe(
      filter((event) => event.businessId === businessId),
      map((event) => {
        return {
          data: {
            type: event.type,
            payload: event.payload,
          },
        } as MessageEvent;
      }),
    );
  }

  /**
   * Menembakkan event sinkronisasi ke seluruh klien yang terhubung di bisnis yang sama.
   */
  emitEvent(businessId: string, type: string, payload: any) {
    this.logger.log(`Emitting sync event [${type}] to Business [${businessId}]`);
    this.event$.next({ businessId, type, payload });
  }
}
export interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}
