const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | null | undefined;

export type RequestOptions = RequestInit & {
  query?: Record<string, QueryValue>;
  timeoutMs?: number;
};

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function isJsonContentType(headers: Headers): boolean {
  const contentType = headers.get('content-type');
  return Boolean(contentType && contentType.toLowerCase().includes('application/json'));
}

function buildRequestHeaders(optionsHeaders?: HeadersInit, body?: BodyInit | null): Headers {
  const headers = new Headers(optionsHeaders || {});

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const hasBody = body != null;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const shouldSetJsonContentType = hasBody && !isFormData && !headers.has('Content-Type');

  if (shouldSetJsonContentType) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

function createAbortSignal(externalSignal?: AbortSignal | null, timeoutMs?: number): {
  signal?: AbortSignal;
  cleanup: () => void;
} {
  const hasTimeout = typeof timeoutMs === 'number' && timeoutMs > 0;

  if (!hasTimeout && !externalSignal) {
    return {
      signal: undefined,
      cleanup: () => undefined
    };
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const onExternalAbort = () => {
    try {
      controller.abort(externalSignal?.reason);
    } catch {
      controller.abort();
    }
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  if (hasTimeout) {
    timeoutId = setTimeout(() => {
      controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  if (isJsonContentType(response.headers)) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

function normalizeErrorMessage(body: unknown, response: Response): string {
  if (body && typeof body === 'object') {
    const candidate = body as { message?: string; error?: string };
    if (candidate.message || candidate.error) {
      return JSON.stringify(body);
    }

    return JSON.stringify(body);
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    return body;
  }

  return `Request failed with status ${response.status}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, timeoutMs, signal: externalSignal, body, ...rest } = options;
  const url = buildUrl(path, query);
  const requestHeaders = buildRequestHeaders(headers, body);
  const { signal, cleanup } = createAbortSignal(externalSignal, timeoutMs);

  try {
    const response = await fetch(url, {
      ...rest,
      body,
      signal,
      headers: requestHeaders
    });

    const parsedBody = await parseResponseBody(response);

    if (!response.ok) {
      throw new Error(normalizeErrorMessage(parsedBody, response));
    }

    return parsedBody as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request aborted: ${rest.method || 'GET'} ${url}`);
    }

    throw error;
  } finally {
    cleanup();
  }
}
