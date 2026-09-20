import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import modules to test
const { getAllowedOrigins, isOriginAllowed, corsOptions, socketCorsOptions } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/config/cors.js`
);
const { getCookieOptions, setTokenCookies, clearTokenCookies, generateTokens } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/utils/token.js`
);

console.log('=== RUNNING STEP 8 CORS & COOKIE CONFIGURATION TESTS ===\n');

// Helper to save/restore env
const originalEnv = { ...process.env };
const restoreEnv = () => {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  process.env.FRONTEND_URL = originalEnv.FRONTEND_URL;
};

let passedCount = 0;
let totalCount = 0;

function test(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ PASS [${name}]`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAIL [${name}]:`, err.message);
    throw err;
  } finally {
    restoreEnv();
  }
}

// -------------------------------------------------------------
// Test A: Production single origin
// -------------------------------------------------------------
test('A: Production single origin allowed', () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://mychat.com';

  assert.strictEqual(isOriginAllowed('https://mychat.com'), true, 'Configured production origin must be allowed');
  
  // Verify via corsOptions callback
  let allowedResult = null;
  corsOptions.origin('https://mychat.com', (err, allow) => {
    assert.strictEqual(err, null);
    allowedResult = allow;
  });
  assert.strictEqual(allowedResult, true, 'corsOptions must allow https://mychat.com');

  // Verify socketCorsOptions
  let socketAllowed = false;
  socketCorsOptions.origin('https://mychat.com', (err, allow) => {
    assert.strictEqual(err, null);
    socketAllowed = allow;
  });
  assert.strictEqual(socketAllowed, true, 'socketCorsOptions must allow https://mychat.com');
});

// -------------------------------------------------------------
// Test B: Production multiple comma-separated origins
// -------------------------------------------------------------
test('B: Production multiple origins allowed (comma-separated with whitespace)', () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = ' https://app1.com , https://app2.com , ';

  const allowed = getAllowedOrigins();
  assert.deepStrictEqual(allowed, ['https://app1.com', 'https://app2.com'], 'Whitespace trimmed and empty entries ignored');
  assert.strictEqual(isOriginAllowed('https://app1.com'), true, 'app1.com must be allowed');
  assert.strictEqual(isOriginAllowed('https://app2.com'), true, 'app2.com must be allowed');
});

// -------------------------------------------------------------
// Test C: Development localhost with any port
// -------------------------------------------------------------
test('C: Development localhost allowed on any port', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.FRONTEND_URL;

  assert.strictEqual(isOriginAllowed('http://localhost:5173'), true, 'localhost:5173 allowed');
  assert.strictEqual(isOriginAllowed('http://localhost:5174'), true, 'localhost:5174 allowed');
  assert.strictEqual(isOriginAllowed('http://localhost:3000'), true, 'localhost:3000 allowed');
  assert.strictEqual(isOriginAllowed('http://localhost:8080'), true, 'localhost:8080 allowed');
  assert.strictEqual(isOriginAllowed('http://localhost'), true, 'localhost without port allowed');
});

// -------------------------------------------------------------
// Test D: Development 127.0.0.1 with any port
// -------------------------------------------------------------
test('D: Development 127.0.0.1 allowed on any port', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.FRONTEND_URL;

  assert.strictEqual(isOriginAllowed('http://127.0.0.1:5173'), true, '127.0.0.1:5173 allowed');
  assert.strictEqual(isOriginAllowed('http://127.0.0.1:3000'), true, '127.0.0.1:3000 allowed');
  assert.strictEqual(isOriginAllowed('http://127.0.0.1:9999'), true, '127.0.0.1:9999 allowed');
  assert.strictEqual(isOriginAllowed('http://127.0.0.1'), true, '127.0.0.1 without port allowed');
});

// -------------------------------------------------------------
// Test E: Unapproved production origin rejected
// -------------------------------------------------------------
test('E: Unapproved production origin rejected and does not crash Express', () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://mychat.com';

  assert.strictEqual(isOriginAllowed('https://attacker.com'), false, 'attacker.com must be rejected');
  assert.strictEqual(isOriginAllowed('https://mychat.com.attacker.com'), false, 'subdomain spoofing must be rejected');
  assert.strictEqual(isOriginAllowed('http://localhost:5173'), false, 'localhost must be rejected in production');

  // Verify Express corsOptions passes callback(null, false) instead of throwing a 500 error
  let expressErr = null;
  let expressAllowed = null;
  corsOptions.origin('https://attacker.com', (err, allow) => {
    expressErr = err;
    expressAllowed = allow;
  });
  assert.strictEqual(expressErr, null, 'corsOptions must not return an error (prevents 500 crashes)');
  assert.strictEqual(expressAllowed, false, 'corsOptions must pass false for disallowed origin');

  // Verify Socket.io socketCorsOptions returns Error for disallowed origin
  let socketErr = null;
  socketCorsOptions.origin('https://attacker.com', (err, allow) => {
    socketErr = err;
  });
  assert(socketErr instanceof Error, 'socketCorsOptions must return Error for disallowed origin');
});

// -------------------------------------------------------------
// Test F: No wildcard origin with credentials: true
// -------------------------------------------------------------
test('F: No wildcard origin while credentials are enabled', () => {
  assert.strictEqual(corsOptions.credentials, true, 'Express credentials must be true');
  assert.strictEqual(socketCorsOptions.credentials, true, 'Socket.io credentials must be true');
  assert.notStrictEqual(corsOptions.origin, '*', 'Express origin must not be literal wildcard *');
  assert.notStrictEqual(socketCorsOptions.origin, '*', 'Socket.io origin must not be literal wildcard *');

  // Ensure origin callback never returns '*'
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://mychat.com';
  corsOptions.origin('https://mychat.com', (err, result) => {
    assert.notStrictEqual(result, '*', 'corsOptions callback must never return *');
  });
});

// -------------------------------------------------------------
// Test G: Production cookie options
// -------------------------------------------------------------
test('G: Production cookie options (httpOnly=true, secure=true, sameSite=none, path=/)', () => {
  process.env.NODE_ENV = 'production';
  const options = getCookieOptions();

  assert.strictEqual(options.httpOnly, true, 'httpOnly must be true in production');
  assert.strictEqual(options.secure, true, 'secure must be true in production');
  assert.strictEqual(options.sameSite, 'none', 'sameSite must be none in production for cross-origin');
  assert.strictEqual(options.path, '/', 'path must be / in production');
});

// -------------------------------------------------------------
// Test H: Development cookie options
// -------------------------------------------------------------
test('H: Development cookie options (httpOnly=true, secure=false, sameSite=lax, path=/)', () => {
  process.env.NODE_ENV = 'development';
  const options = getCookieOptions();

  assert.strictEqual(options.httpOnly, true, 'httpOnly must be true in development');
  assert.strictEqual(options.secure, false, 'secure must be false in development HTTP');
  assert.strictEqual(options.sameSite, 'lax', 'sameSite must be lax in development HTTP');
  assert.strictEqual(options.path, '/', 'path must be / in development');
});

// -------------------------------------------------------------
// Test I: Cookie deletion attributes match creation attributes
// -------------------------------------------------------------
test('I: Cookie deletion (clearTokenCookies uses compatible path/security/sameSite attributes)', () => {
  // Production deletion
  process.env.NODE_ENV = 'production';
  const clearedProd = [];
  const mockProdRes = {
    clearCookie: (name, options) => {
      clearedProd.push({ name, options });
    },
  };
  clearTokenCookies(mockProdRes);
  assert.strictEqual(clearedProd.length, 2, 'Must clear 2 cookies');
  assert.strictEqual(clearedProd[0].name, 'accessToken');
  assert.strictEqual(clearedProd[0].options.secure, true);
  assert.strictEqual(clearedProd[0].options.sameSite, 'none');
  assert.strictEqual(clearedProd[0].options.path, '/');
  assert.strictEqual(clearedProd[1].name, 'refreshToken');
  assert.strictEqual(clearedProd[1].options.secure, true);
  assert.strictEqual(clearedProd[1].options.sameSite, 'none');
  assert.strictEqual(clearedProd[1].options.path, '/');

  // Development deletion
  process.env.NODE_ENV = 'development';
  const clearedDev = [];
  const mockDevRes = {
    clearCookie: (name, options) => {
      clearedDev.push({ name, options });
    },
  };
  clearTokenCookies(mockDevRes);
  assert.strictEqual(clearedDev.length, 2, 'Must clear 2 cookies in dev');
  assert.strictEqual(clearedDev[0].options.secure, false);
  assert.strictEqual(clearedDev[0].options.sameSite, 'lax');
  assert.strictEqual(clearedDev[0].options.path, '/');
});

// -------------------------------------------------------------
// Test J: Cookie names remain accessToken and refreshToken
// -------------------------------------------------------------
test('J: Cookie names remain exactly accessToken and refreshToken', () => {
  process.env.NODE_ENV = 'production';
  const cookiesSet = [];
  const mockRes = {
    cookie: (name, val, options) => {
      cookiesSet.push({ name, val, options });
    },
  };
  setTokenCookies(mockRes, 'fake-access-token', 'fake-refresh-token');

  assert.strictEqual(cookiesSet.length, 2, 'Must set 2 cookies');
  assert.strictEqual(cookiesSet[0].name, 'accessToken', 'First cookie must be accessToken');
  assert.strictEqual(cookiesSet[1].name, 'refreshToken', 'Second cookie must be refreshToken');
});

// -------------------------------------------------------------
// Test K: Existing token durations remain 15m and 7d
// -------------------------------------------------------------
test('K: Existing token durations remain 15m and 7d', () => {
  const cookiesSet = [];
  const mockRes = {
    cookie: (name, val, options) => {
      cookiesSet.push({ name, val, options });
    },
  };
  setTokenCookies(mockRes, 'dummy-access', 'dummy-refresh');

  const accessCookie = cookiesSet.find((c) => c.name === 'accessToken');
  const refreshCookie = cookiesSet.find((c) => c.name === 'refreshToken');

  assert.strictEqual(accessCookie.options.maxAge, 15 * 60 * 1000, 'accessToken maxAge must be 15 mins (900,000 ms)');
  assert.strictEqual(refreshCookie.options.maxAge, 7 * 24 * 60 * 60 * 1000, 'refreshToken maxAge must be 7 days (604,800,000 ms)');
});

// -------------------------------------------------------------
// Test L: Server-to-server / non-browser requests (no Origin header) allowed
// -------------------------------------------------------------
test('L: Requests without Origin header allowed without error', () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://mychat.com';

  assert.strictEqual(isOriginAllowed(undefined), true, 'undefined Origin allowed for server-to-server/curl');
  assert.strictEqual(isOriginAllowed(''), true, 'empty Origin allowed');

  let corsAllowed = null;
  corsOptions.origin(undefined, (err, allow) => {
    assert.strictEqual(err, null);
    corsAllowed = allow;
  });
  assert.strictEqual(corsAllowed, true, 'corsOptions allows requests with undefined origin');
});

console.log(`\n========================================`);
console.log(`ALL TESTS PASSED: ${passedCount} / ${totalCount}`);
console.log(`========================================\n`);
