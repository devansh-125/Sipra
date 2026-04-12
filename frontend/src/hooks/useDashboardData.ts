import { useMemo } from 'react';

export function useDashboardData() {
  return useMemo(
    () => ({
      isLoading: false,
      error: null as string | null,
      data: null
    }),
    []
  );
}
