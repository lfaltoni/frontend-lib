// Dev quick-login types — product-agnostic.
//
// These mirror the consumer-provided dev endpoints contract, NOT a
// foundation-sdk domain. The consumer app implements and gates these
// endpoints server-side; fsdk-ts only ships the client + hook + panel.
//
//   GET  <prefix>accounts     -> DevAccountsResponse
//   POST <prefix>quick-login  -> DevQuickLoginResponse  (body: { email })

/** A selectable dev account. Field names match the agreed wire contract. */
export interface DevAccount {
  name: string;
  email: string;
  role: string;
}

/** Response shape of `GET <prefix>accounts`. */
export interface DevAccountsResponse {
  accounts: DevAccount[];
}

/** Response shape of `POST <prefix>quick-login`. */
export interface DevQuickLoginResponse {
  ok: boolean;
  /** Where to send the user on success (consumer-decided). */
  redirect?: string;
  /** Error message when `ok` is false. */
  error?: string;
}

/** The decoupled dev API surface produced by `initDevApi` / `createDevApi`. */
export interface DevApi {
  getAccounts: () => Promise<DevAccountsResponse>;
  quickLogin: (email: string) => Promise<DevQuickLoginResponse>;
}
