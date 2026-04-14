export type ApiMeta = Record<string, unknown>;

export type ApiPaging = {
  limit: number;
  offset: number;
  total?: number;
  has_more?: boolean;
};

export type ApiPaginationQuery = {
  limit?: number;
  offset?: number;
};

export type ApiResponse<TData, TMeta extends ApiMeta = ApiMeta> = {
  data: TData;
  paging?: ApiPaging;
  meta?: TMeta;
};

export type ApiListResponse<TItem, TMeta extends ApiMeta = ApiMeta> = ApiResponse<TItem[], TMeta>;

export type ApiMutationResponse<TData = { success: boolean }, TMeta extends ApiMeta = ApiMeta> = ApiResponse<TData, TMeta>;

export type ApiErrorResponse = {
  error?: string;
  message?: string;
  statusCode?: number;
  details?: unknown;
  [key: string]: unknown;
};
