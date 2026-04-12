import { useMemo } from 'react';

export function useShipmentDetail() {
  return useMemo(
    () => ({
      isLoading: false,
      error: null as string | null,
      data: null
    }),
    []
  );
}
