// Environment configuration for fsdk-ts
//
// fsdk-ts is the agnostic library: it reads ZERO environment variables and
// holds ZERO product-specific defaults. The consumer app injects all config
// once at entry via initEnv() (mirrors the initBillingApi() pattern).

export interface EnvConfig {
  apiUrl: string;
  foundationUrl: string;
  // Route the consumer app should be sent to after a forced (401) logout.
  // Configurable so apps that mount their login at a non-default path can override it.
  loginPath: string;
  // Google OAuth client id. Set to enable "Continue with Google" (useGoogleSignIn);
  // unset ⇒ the hook reports { available: false } and the consumer hides the button.
  googleClientId?: string;
}

let _cfg: EnvConfig = { apiUrl: '', foundationUrl: '', loginPath: '/login' };

// Called once by the consumer app at entry, with values read from its own env.
export function initEnv(cfg: Partial<EnvConfig>): void {
  _cfg = { ..._cfg, ...cfg };
}

// Live read — always returns the current config, so readers must call this at
// use time (not snapshot it at module load, which would capture pre-init values).
export const getEnvConfig = (): EnvConfig => _cfg;
