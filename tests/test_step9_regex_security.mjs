import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import modules
const { escapeRegex, getUsers } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/controllers/user.controller.js`
);
const { default: User } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/models/user.model.js`
);

console.log('=== RUNNING STEP 9 SEARCH REGEX INJECTION & REDOS HARDENING TESTS ===\n');

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
  }
}

async function asyncTest(name, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  ✓ PASS [${name}]`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAIL [${name}]:`, err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// Test A: Normal literal search (case-insensitive substring match)
// -------------------------------------------------------------
test('A: Normal literal search matches case-insensitively', () => {
  const input = 'alice';
  const escaped = escapeRegex(input);
  const regex = new RegExp(escaped, 'i');

  assert.strictEqual(regex.test('Alice Smith'), true, 'Matches capitalized name');
  assert.strictEqual(regex.test('alice_99'), true, 'Matches lowercase username');
  assert.strictEqual(regex.test('ALICE_CHIT_CHAT'), true, 'Matches uppercase username');
  assert.strictEqual(regex.test('Bob Jones'), false, 'Does not match unrelated user');
});

// -------------------------------------------------------------
// Test B: Literal brackets do not throw syntax errors
// -------------------------------------------------------------
test('B: Literal brackets do not throw regex syntax errors', () => {
  const bracketInputs = ['[', ']', '[a-z', '[[', '[]', '[0-9]+'];
  for (const input of bracketInputs) {
    let regex;
    assert.doesNotThrow(() => {
      const escaped = escapeRegex(input);
      regex = new RegExp(escaped, 'i');
    }, `Escaped "${input}" must not throw SyntaxError`);

    // Verify it matches literal bracket text
    assert.strictEqual(regex.test(`User with ${input} in name`), true, `Must match literal "${input}"`);
    assert.strictEqual(regex.test('User with abc in name'), false, 'Must not act as character class [a-z]');
  }
});

// -------------------------------------------------------------
// Test C: Literal parentheses do not throw syntax errors
// -------------------------------------------------------------
test('C: Literal parentheses do not throw regex syntax errors', () => {
  const parenInputs = ['(', ')', '(work)', '(((', ')(', '(a|b)'];
  for (const input of parenInputs) {
    let regex;
    assert.doesNotThrow(() => {
      const escaped = escapeRegex(input);
      regex = new RegExp(escaped, 'i');
    }, `Escaped "${input}" must not throw SyntaxError`);

    assert.strictEqual(regex.test(`John ${input}`), true, `Must match literal "${input}"`);
    assert.strictEqual(regex.test('John a'), false, 'Must not act as capture group / alternation');
  }
});

// -------------------------------------------------------------
// Test D: Literal quantifiers (*, +, ?) treated literally
// -------------------------------------------------------------
test('D: Literal quantifiers (*, +, ?) treated literally', () => {
  const quantifiers = ['*', '+', '?', '*+', '???', 'a*b+c?'];
  for (const input of quantifiers) {
    let regex;
    assert.doesNotThrow(() => {
      const escaped = escapeRegex(input);
      regex = new RegExp(escaped, 'i');
    }, `Escaped "${input}" must not throw SyntaxError`);

    assert.strictEqual(regex.test(`Name with ${input}`), true, `Must match literal "${input}"`);
  }
});

// -------------------------------------------------------------
// Test E: Literal regex characters (., .*, ^, $) do NOT become wildcards
// -------------------------------------------------------------
test('E: Literal regex characters (., .*, ^, $) do not act as wildcards/anchors', () => {
  // Dot (.) must match literal dot only, not every character
  const dotRegex = new RegExp(escapeRegex('.'), 'i');
  assert.strictEqual(dotRegex.test('dr.john'), true, 'Matches literal dot in dr.john');
  assert.strictEqual(dotRegex.test('alice'), false, 'Must NOT match "alice" because it is a literal dot');

  // Wildcard (.*) must match literal ".*" only
  const wildcardRegex = new RegExp(escapeRegex('.*'), 'i');
  assert.strictEqual(wildcardRegex.test('alice'), false, 'Must NOT match "alice"');
  assert.strictEqual(wildcardRegex.test('test.*user'), true, 'Matches literal .*');

  // Caret (^) must match literal caret only
  const caretRegex = new RegExp(escapeRegex('^'), 'i');
  assert.strictEqual(caretRegex.test('alice'), false, 'Must NOT match "alice"');
  assert.strictEqual(caretRegex.test('^user'), true, 'Matches literal ^');

  // Dollar ($) must match literal dollar only
  const dollarRegex = new RegExp(escapeRegex('$'), 'i');
  assert.strictEqual(dollarRegex.test('alice'), false, 'Must NOT match "alice"');
  assert.strictEqual(dollarRegex.test('price$'), true, 'Matches literal $');
});

// -------------------------------------------------------------
// Test F: Backslashes (\, \\, \d, \w) treated as literal search strings
// -------------------------------------------------------------
test('F: Backslashes (\\, \\\\, \\d, \\w) treated as literal search strings', () => {
  const slashInputs = ['\\', '\\\\', '\\d', '\\w', '\\s+'];
  for (const input of slashInputs) {
    let regex;
    assert.doesNotThrow(() => {
      const escaped = escapeRegex(input);
      regex = new RegExp(escaped, 'i');
    }, `Escaped "${input}" must not throw SyntaxError`);

    assert.strictEqual(regex.test(`User ${input}`), true, `Must match literal "${input}"`);
    // For \d, ensure it does NOT match arbitrary digits like "9" unless the string has "\d"
    if (input === '\\d') {
      assert.strictEqual(regex.test('User 999'), false, 'Must not act as digit metacharacter');
    }
  }
});

// -------------------------------------------------------------
// Test G: ReDoS-like strings are properly escaped, not executable patterns
// -------------------------------------------------------------
test('G: ReDoS-like strings are escaped and cannot cause catastrophic backtracking', () => {
  const redosPatterns = [
    '(a+)+$',
    '(a|aa)+$',
    '([a-zA-Z]+)*$',
    '(a|a?)+$',
    '((a+)+)+$',
  ];

  for (const pattern of redosPatterns) {
    const escaped = escapeRegex(pattern);
    // Escaped string must escape all parentheses, pluses, and dollars
    assert(escaped.includes('\\(') && escaped.includes('\\)') && escaped.includes('\\+'), `Parentheses and pluses must be escaped in ${pattern}`);
    const regex = new RegExp(escaped, 'i');

    // Matching against repetitive string must execute instantaneously (< 5ms)
    const startTime = process.hrtime.bigint();
    const repetitiveString = 'a'.repeat(30) + '!';
    const matchResult = regex.test(repetitiveString);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    assert.strictEqual(matchResult, false, 'Should not match');
    assert(durationMs < 50, `Matching took ${durationMs}ms, must be virtually instant`);
  }
});

// -------------------------------------------------------------
// Test H: Excessive length bounded to configured maximum (100 characters)
// -------------------------------------------------------------
await asyncTest('H: Excessive length (10,000 chars) is bounded to 100 characters', async () => {
  let capturedQuery = null;
  const originalFind = User.find;
  User.find = (query) => {
    capturedQuery = query;
    return {
      select: () => ({
        limit: () => Promise.resolve([]),
      }),
    };
  };

  try {
    const hugeSearch = 'a'.repeat(10000);
    const req = {
      user: { _id: 'my-user-id' },
      query: { search: hugeSearch },
    };
    const res = {
      status: (code) => {
        assert.strictEqual(code, 200);
        return {
          json: (data) => {
            assert.strictEqual(data.success, true);
          },
        };
      },
    };

    await getUsers(req, res);

    assert(capturedQuery, 'Query must be captured');
    assert(capturedQuery.$or, '$or must be generated');
    const regex = capturedQuery.$or[0].name;
    assert(regex instanceof RegExp, 'Must be a RegExp instance');
    // Source of regex must be bounded to at most 100 characters
    assert(regex.source.length <= 100, `Regex source length ${regex.source.length} must be <= 100`);
  } finally {
    User.find = originalFind;
  }
});

// -------------------------------------------------------------
// Test I: Non-string query parameters handled safely without exception
// -------------------------------------------------------------
await asyncTest('I: Non-string query parameters (arrays, objects) treated safely as absent', async () => {
  const originalFind = User.find;
  const invalidInputs = [
    ['item1', 'item2'],
    { $gt: '' },
    { $regex: '.*' },
    12345,
    true,
    null,
  ];

  for (const badInput of invalidInputs) {
    let capturedQuery = null;
    User.find = (query) => {
      capturedQuery = query;
      return {
        select: () => ({
          limit: () => Promise.resolve([]),
        }),
      };
    };

    const req = {
      user: { _id: 'current-user-123' },
      query: { search: badInput },
    };
    let jsonResult = null;
    const res = {
      status: (code) => {
        assert.strictEqual(code, 200, `Must return 200 OK for input ${JSON.stringify(badInput)}`);
        return {
          json: (data) => {
            jsonResult = data;
          },
        };
      },
    };

    await getUsers(req, res);

    assert.strictEqual(jsonResult.success, true);
    // Invalid input should be ignored and NOT add $or operator
    assert.strictEqual(capturedQuery.$or, undefined, `Must not add $or for non-string ${JSON.stringify(badInput)}`);
    assert.deepStrictEqual(capturedQuery._id, { $ne: 'current-user-123' }, 'Must retain user exclusion');
  }

  User.find = originalFind;
});

// -------------------------------------------------------------
// Test J: Empty search preserves directory behavior
// -------------------------------------------------------------
await asyncTest('J: Empty / omitted / whitespace search preserves directory query', async () => {
  const originalFind = User.find;
  const emptyInputs = ['', '   ', '\t\n', undefined];

  for (const emptyInput of emptyInputs) {
    let capturedQuery = null;
    User.find = (query) => {
      capturedQuery = query;
      return {
        select: () => ({
          limit: () => Promise.resolve([{ _id: 'other1' }, { _id: 'other2' }]),
        }),
      };
    };

    const req = {
      user: { _id: 'current-user-123' },
      query: emptyInput === undefined ? {} : { search: emptyInput },
    };
    let jsonResult = null;
    const res = {
      status: (code) => {
        assert.strictEqual(code, 200);
        return {
          json: (data) => {
            jsonResult = data;
          },
        };
      },
    };

    await getUsers(req, res);

    assert.strictEqual(jsonResult.success, true);
    assert.strictEqual(jsonResult.users.length, 2);
    // Preserves { _id: { $ne: currentUserId } } without $or
    assert.strictEqual(capturedQuery.$or, undefined, 'Must not add $or when search is empty');
    assert.deepStrictEqual(capturedQuery._id, { $ne: 'current-user-123' }, 'Excludes current user');
  }

  User.find = originalFind;
});

// -------------------------------------------------------------
// Test K: Result limit (.limit(50)) is applied
// -------------------------------------------------------------
await asyncTest('K: Result limit (.limit(50)) is strictly applied', async () => {
  const originalFind = User.find;
  let limitArg = null;
  let selectArg = null;

  User.find = () => {
    return {
      select: (fields) => {
        selectArg = fields;
        return {
          limit: (n) => {
            limitArg = n;
            return Promise.resolve([]);
          },
        };
      },
    };
  };

  try {
    const req = {
      user: { _id: 'current-user-123' },
      query: { search: 'test' },
    };
    const res = {
      status: (code) => ({
        json: () => {},
      }),
    };

    await getUsers(req, res);

    assert.strictEqual(limitArg, 50, '.limit(50) must be applied');
    assert.strictEqual(selectArg, 'name username email profilePic bio onlineStatus lastSeen', 'Projection preserved');
  } finally {
    User.find = originalFind;
  }
});

// -------------------------------------------------------------
// Test L: Frontend URL encoding prevents query string corruption
// -------------------------------------------------------------
test('L: Frontend URL encoding properly handles special characters', () => {
  const dangerousSearch = 'John & Jane + Dr. Who? #1';
  const encoded = encodeURIComponent(dangerousSearch.trim());

  assert.strictEqual(encoded.includes('&'), false, '& must be encoded as %26');
  assert.strictEqual(encoded.includes('#'), false, '# must be encoded as %23');
  assert.strictEqual(encoded.includes('?'), false, '? must be encoded as %3F');
  assert.strictEqual(encoded.includes('+'), false, '+ must be encoded as %2B');
  assert.strictEqual(decodeURIComponent(encoded), dangerousSearch.trim(), 'Decodes accurately back to original');
});

// -------------------------------------------------------------
// Test M: Existing search contract remains intact
// -------------------------------------------------------------
await asyncTest('M: Search contract response shape and fields preserved', async () => {
  const originalFind = User.find;
  User.find = () => {
    return {
      select: () => ({
        limit: () => Promise.resolve([
          {
            _id: 'u1',
            name: 'Alice',
            username: 'alice',
            email: 'alice@test.com',
            profilePic: '',
            bio: 'Hello',
            onlineStatus: true,
            lastSeen: new Date(),
          },
        ]),
      }),
    };
  };

  try {
    const req = {
      user: { _id: 'u0' },
      query: { search: 'ali' },
    };
    let responseData = null;
    const res = {
      status: (code) => {
        assert.strictEqual(code, 200);
        return {
          json: (data) => {
            responseData = data;
          },
        };
      },
    };

    await getUsers(req, res);

    assert.strictEqual(responseData.success, true);
    assert(Array.isArray(responseData.users));
    assert.strictEqual(responseData.users.length, 1);
    assert.strictEqual(responseData.users[0].name, 'Alice');
  } finally {
    User.find = originalFind;
  }
});

console.log(`\n========================================`);
console.log(`ALL TESTS PASSED: ${passedCount} / ${totalCount}`);
console.log(`========================================\n`);
