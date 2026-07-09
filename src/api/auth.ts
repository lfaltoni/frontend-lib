import {
  ConsumePasswordlessResult,
  LoginCredentials,
  MagicLinkRequestResult,
  PasswordlessRequestResult,
  RegisterData,
  User,
} from '../types/auth';
import { getLogger } from '../utils/logging';
import { foundationRequest } from './foundation-client';
import { storage } from '../utils/storage';

const logger = getLogger('auth-api');

// Structured response from auth endpoints
interface AuthResponse<T = unknown> {
  success: boolean;
  message?: string;
  user?: T;
  token?: string;
  error?: string;
  // Passwordless consume only: true when the sign-in created a new account.
  is_new_user?: boolean;
}

// Authentication API functions
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<User> => {
    logger.info('Attempting login', { email: credentials.email });

    const response = await foundationRequest<AuthResponse<User>>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (!response.user) {
      throw new Error('Invalid response: user data missing');
    }

    // Store JWT for cross-service auth
    if (response.token) {
      storage.setToken(response.token);
    }

    logger.info('Login successful', { userId: response.user.user_id });
    return response.user;
  },

  register: async (userData: RegisterData): Promise<User> => {
    logger.info('Attempting registration', { email: userData.email });

    const response = await foundationRequest<AuthResponse<User>>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (!response.user) {
      throw new Error('Invalid response: user data missing');
    }

    // Store JWT for cross-service auth
    if (response.token) {
      storage.setToken(response.token);
    }

    logger.info('Registration successful', { userId: response.user.user_id });
    return response.user;
  },

  logout: async (): Promise<{ success: boolean; message: string }> => {
    logger.info('Attempting logout');

    const response = await foundationRequest<{ success: boolean; message: string }>('/api/auth/logout', {
      method: 'POST',
    });

    logger.info('Logout successful');
    return response;
  },

  requestPasswordReset: async (email: string): Promise<{ success: boolean; message: string }> => {
    logger.info('Requesting password reset', { email });

    const response = await foundationRequest<{ success: boolean; message: string }>('/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    logger.info('Password reset requested');
    return response;
  },

  confirmPasswordReset: async (token: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    logger.info('Confirming password reset');

    const response = await foundationRequest<{ success: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    logger.info('Password reset confirmed');
    return response;
  },

  resendVerification: async (): Promise<{ success: boolean; message: string }> => {
    // Login-gated + body-less: the cookie session / JWT identifies the current
    // user, so no email is sent in the body. Mirrors the message-response shape
    // of requestPasswordReset.
    logger.info('Requesting verification email resend');

    const response = await foundationRequest<{ success: boolean; message: string }>('/api/auth/resend-verification', {
      method: 'POST',
    });

    logger.info('Verification email resend requested');
    return response;
  },

  googleLogin: async (credential: string): Promise<User> => {
    logger.info('Attempting Google login');

    const response = await foundationRequest<AuthResponse<User>>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });

    if (!response.user) {
      throw new Error('Invalid response: user data missing');
    }

    if (response.token) {
      storage.setToken(response.token);
    }

    logger.info('Google login successful', { userId: response.user.user_id });
    return response.user;
  },

  requestMagicLink: async (email: string): Promise<MagicLinkRequestResult> => {
    // Enumeration-safe: the backend always returns a generic success regardless
    // of whether the email exists. The client does no special-casing. Mirrors
    // requestPasswordReset (body-ful POST { email }, message envelope).
    logger.info('Requesting magic link', { email });

    const response = await foundationRequest<MagicLinkRequestResult>('/api/auth/magic/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    logger.info('Magic link requested');
    return response;
  },

  consumeMagicLink: async (token: string): Promise<User> => {
    // Consume the one-time token from the emailed link. On success the backend
    // returns the SAME LoginResponse envelope as /login (user, token, is_first_login)
    // and sets the cookie session. Never log the raw token.
    logger.info('Consuming magic link');

    const response = await foundationRequest<AuthResponse<User>>('/api/auth/magic/consume', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });

    if (!response.user) {
      throw new Error('Invalid response: user data missing');
    }

    // Store JWT for cross-service auth (same handling as login/google).
    if (response.token) {
      storage.setToken(response.token);
    }

    logger.info('Magic link consumed', { userId: response.user.user_id });
    return response.user;
  },

  requestPasswordless: async (email: string): Promise<PasswordlessRequestResult> => {
    // Enumeration-safe: the backend always returns a generic success regardless
    // of whether the email exists. The client does no special-casing. Mirrors
    // requestMagicLink (body-ful POST { email }, message envelope). The backend
    // will CREATE the account at consume time if the email is new.
    logger.info('Requesting passwordless sign-in link', { email });

    const response = await foundationRequest<PasswordlessRequestResult>('/api/auth/passwordless/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    logger.info('Passwordless link requested');
    return response;
  },

  consumePasswordless: async (token: string): Promise<ConsumePasswordlessResult> => {
    // Consume the one-time token from the emailed link. On success the backend
    // returns the SAME LoginResponse envelope as /login (user, token,
    // is_first_login) PLUS is_new_user, and sets the cookie session. If the email
    // was new the account was just created. Never log the raw token.
    logger.info('Consuming passwordless link');

    const response = await foundationRequest<AuthResponse<User>>('/api/auth/passwordless/consume', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });

    if (!response.user) {
      throw new Error('Invalid response: user data missing');
    }

    // Store JWT for cross-service auth (same handling as login/google/magic).
    if (response.token) {
      storage.setToken(response.token);
    }

    logger.info('Passwordless link consumed', {
      userId: response.user.user_id,
      isNewUser: response.is_new_user ?? false,
    });
    return { user: response.user, is_new_user: response.is_new_user ?? false };
  },
};
