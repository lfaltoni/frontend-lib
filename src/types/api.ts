// API response types — shared contracts for paginated endpoints and response envelope

/** Standard paginated response shape returned by list endpoints. */
export interface PaginatedResponse<T> {
  total: number;
  page: number;
  perPage: number;
  results: T[];
}

/** Toast notification metadata attached by with_toast() on the server. */
export interface Toast {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Response envelope fields added by FoundationResponseSchema.
 *
 * _toast and _field_errors are optional — only present when the server
 * calls with_toast() or with_field_errors(). All blueprint response
 * types that inherit from FoundationResponseSchema may include these.
 */
export interface ResponseEnvelope {
  _toast?: Toast;
  _field_errors?: Record<string, string>;
}
