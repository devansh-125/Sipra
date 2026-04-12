export type ApiResponse<T> = {
  data: T;
  paging?: {
    limit: number;
    offset: number;
  };
  meta?: Record<string, unknown>;
};
