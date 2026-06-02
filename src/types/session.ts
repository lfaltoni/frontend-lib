// Session types — matches foundation-sdk sessions API response shapes (snake_case keys).
//
// Mirrors foundation-sdk/foundation/sessions/api/schemas.py. The backend has NO
// camelCasing serializer for this domain, so the wire shape is marshmallow's raw
// field names: `sid` (the SessionResponseSchema field name, sourced from the
// `session_id` attribute) plus snake_case for the rest.

export interface Session {
  sid: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  location: string | null;
  created_at: string;
  last_seen_at: string | null;
  is_current: boolean;
}

export interface SessionListResponse {
  success: boolean;
  sessions: Session[];
}

export interface RevokeAllRequest {
  // Default false on the backend: log out everywhere *else*, keep current device.
  include_current?: boolean;
}

// Named with a domain prefix to avoid colliding with invite's `MessageResponse`
// in the flat types barrel (cf. AdminMessageResponse / ContentMessageResponse).
export interface SessionMessageResponse {
  success: boolean;
  message: string;
}
