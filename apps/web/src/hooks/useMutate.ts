import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Mutacja z obsługą błędów (toast) i odświeżeniem wskazanych zapytań.
 * Sukces komunikujemy tylko, gdy podano `success`.
 */
export function useMutate<TVars = void, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { invalidate?: string[][]; success?: string | ((r: TResult) => string); onSuccess?: (r: TResult, v: TVars) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      opts.invalidate?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      opts.onSuccess?.(result, vars);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
