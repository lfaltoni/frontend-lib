# fsdk-ts

Reusable frontend library for Foundation-SDK applications, providing authentication, user management, and utility functions.

## Installation

```bash
npm install fsdk-ts
```

## Usage

### Authentication

```typescript
import { useLogin, useAuth } from 'fsdk-ts';

// Login Form Component
function LoginForm() {
  const { login, isLoading, error } = useLogin();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password });
      // Login successful - user is automatically stored
    } catch (error) {
      // Handle login error
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Your form fields */}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Logging in...' : 'Login'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}

// Auth State Management
function App() {
  const { user, isAuthenticated, logout } = useAuth();
  
  return (
    <div>
      {isAuthenticated ? (
        <div>
          Welcome, {user?.first_name}!
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <LoginForm />
      )}
    </div>
  );
}
```

`useAuth` is backed by a single module-level reactive store (`authStore`), so
**every** call site shares one source of truth. A `401` from either HTTP client
(on any non-`/api/auth/` endpoint) clears the session and notifies all
consumers — so disabling/force-logging-out an account de-authenticates the UI
everywhere, with no per-component wiring and no provider to mount.

#### Protecting routes (`useRequireAuth`)

Guard authenticated-only routes. It redirects **once** auth resolves to
unauthenticated (never during the optimistic first paint, so valid users aren't
flashed to login), and returns `{ isAuthenticated, isLoading }` so you can render
a loader instead of protected content while revalidating:

```typescript
import { useRequireAuth } from 'fsdk-ts';
import { useRouter } from 'next/navigation';

function AccountGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Omit onUnauthenticated to default to a full-page redirect to envConfig.loginPath.
  const { isAuthenticated, isLoading } = useRequireAuth({
    onUnauthenticated: () => router.push('/login'),
  });

  if (isLoading || !isAuthenticated) return <div>Loading…</div>;
  return <>{children}</>;
}
```

### API Calls

```typescript
import { authApi } from 'fsdk-ts';

// Direct API usage
const handleLogin = async () => {
  try {
    const response = await authApi.login({
      email: 'user@example.com',
      password: 'password123'
    });
    
    if (response.success) {
      console.log('User logged in:', response.user);
    }
  } catch (error) {
    console.error('Login failed:', error);
  }
};
```

### Storage Utilities

```typescript
import { storage } from 'fsdk-ts';

// Manual storage management
storage.setUser(userData);
const user = storage.getUser();
storage.clearUser();
const hasSession = storage.hasValidSession();
```

### Logging

```typescript
import { getLogger } from 'fsdk-ts';

const logger = getLogger('MyComponent');

logger.info('Component mounted');
logger.error('Something went wrong', { details: 'error info' });
```

## Features

- ✅ Authentication (login, register, logout)
- ✅ Session management with localStorage
- ✅ Type-safe API calls
- ✅ React hooks for easy integration
- ✅ Comprehensive logging
- ✅ Error handling
- ✅ TypeScript support

## API Reference

### Hooks

- `useLogin()` - Login and registration functionality
- `useAuth()` - Authentication state management
- `useSessions()` - Active session / device management

### API Functions

- `authApi.login(credentials)` - Authenticate user
- `authApi.register(userData)` - Register new user
- `authApi.logout()` - Logout current user
- `authApi.getProfile()` - Get user profile
- `sessionsApi.listSessions()` - List active sessions / devices
- `sessionsApi.revokeSession(sid)` - Revoke a single session
- `sessionsApi.revokeAllSessions(req?)` - Log out everywhere (keeps current device by default)

### Utilities

- `storage` - localStorage management
- `getLogger(context)` - Logging utility

## Environment Variables

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000  # Backend API URL
```

## Development

```bash
npm run dev    # Watch mode
npm run build  # Build for production
npm run clean  # Clean build files
```
