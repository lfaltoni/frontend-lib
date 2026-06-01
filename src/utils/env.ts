// Environment configuration for fsdk-ts

export interface EnvConfig {
  apiUrl: string;
  foundationUrl: string;
  // Route the consumer app should be sent to after a forced (401) logout.
  // Configurable so apps that mount their login at a non-default path can override it.
  loginPath: string;
}

// Default configuration
const defaultConfig: EnvConfig = {
  apiUrl: 'http://localhost:5000',  // Bookease-pro (bookings, slots, experiences)
  foundationUrl: 'http://localhost:5001',  // Foundation SDK server (auth, profiles, media)
  loginPath: '/login',  // rihla consumer login route ((auth)/login -> /login)
};

// Get configuration from environment or window object
export const getEnvConfig = (): EnvConfig => {
  if (typeof window !== 'undefined') {
    // Browser environment - check window object first, then env
    return {
      apiUrl: (window as any).__API_URL__ || defaultConfig.apiUrl,
      foundationUrl: (window as any).__FOUNDATION_URL__ || (window as any).__MEDIA_API_URL__ || defaultConfig.foundationUrl,
      loginPath: (window as any).__LOGIN_PATH__ || defaultConfig.loginPath,
    };
  }

  // Server environment - use process.env
  return {
    apiUrl: defaultConfig.apiUrl,
    foundationUrl: defaultConfig.foundationUrl,
    loginPath: defaultConfig.loginPath,
  };
};

export const envConfig = getEnvConfig();
