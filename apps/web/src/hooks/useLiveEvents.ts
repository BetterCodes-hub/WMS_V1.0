import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { tokenStore } from '@/api/client';

/** Mapa: zdarzenie z serwera → klucze zapytań do odświeżenia. */
const INVALIDATE: Record<string, string[][]> = {
  'stock.changed': [['inventory'], ['products'], ['product'], ['locations'], ['location'], ['handling-units'], ['handling-unit'], ['dashboard']],
  'alert.created': [['alerts'], ['dashboard'], ['products']],
  'alert.resolved': [['alerts'], ['dashboard'], ['products']],
  'replenishment.changed': [['replenishment'], ['dashboard']],
  'receipt.changed': [['receipts'], ['receipt'], ['dashboard'], ['accounting']],
  'issue.changed': [['issues'], ['issue'], ['dashboard'], ['accounting']],
  'invoice.changed': [['invoices'], ['invoice'], ['accounting'], ['issues'], ['receipts']],
};

/** Subskrypcja zdarzeń SSE — automatyczne odświeżanie widoków i powiadomienia o alertach. */
export function useLiveEvents(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const token = tokenStore.get();
    if (!token) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    // zdarzenia przychodzą seriami — odświeżamy z niewielkim opóźnieniem
    const pending = new Set<string>();
    let flush: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      Object.keys(INVALIDATE).forEach((type) =>
        source!.addEventListener(type, (e) => {
          INVALIDATE[type].forEach((key) => pending.add(JSON.stringify(key)));
          clearTimeout(flush);
          flush = setTimeout(() => {
            pending.forEach((k) => queryClient.invalidateQueries({ queryKey: JSON.parse(k) }));
            pending.clear();
          }, 250);

          if (type === 'alert.created') {
            const d = JSON.parse((e as MessageEvent).data);
            const fn = d.type === 'OUT_OF_STOCK' ? toast.error : toast.warning;
            fn(`${d.type === 'OUT_OF_STOCK' ? 'Brak towaru' : 'Niski stan'}: ${d.sku}`, {
              description: `${d.name} — stan ${d.currentQty}, minimum ${d.threshold}`,
              duration: 8000,
            });
          }
        }),
      );
      source.onerror = () => {
        source?.close();
        retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      source?.close();
      clearTimeout(retry);
      clearTimeout(flush);
    };
  }, [enabled, queryClient]);
}
