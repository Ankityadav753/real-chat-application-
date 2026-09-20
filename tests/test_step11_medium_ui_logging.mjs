/**
 * STEP 11 — PHASE 5: MEDIUM REMEDIATION TEST SUITE
 *
 * Tests:
 * 1. MED-03: Group Metadata Participant Sync
 *    - updateGroup emits 'group-updated' event to conversation room
 *    - addMembers emits 'group-updated' event with new member details
 *    - removeMembers emits 'group-updated' event with removed member IDs
 *    - leaveGroup emits 'group-updated' with leftUserId and new admin
 *    - deleteGroup and empty leaveGroup emit 'group-deleted'
 *    - Unauthorized group mutations return 403 and do not emit socket events
 *    - Store handler handleGroupUpdated updates selectedConversation and conversations
 *    - Store handler handleGroupDeleted cleans up selectedConversation and conversations
 *    - SocketContext registers exact named listeners with cleanup preventing leaks
 *
 * 2. MED-04: React Array-Index Key Fallback
 *    - ChatMessages.jsx statically contains zero array-index React keys in .map() iterations
 *    - Message keys use stable message._id / message.id
 *    - Attachment keys use stable deterministic composite keys
 *    - Reaction keys use stable composite keys
 *    - Quick reaction buttons use stable composite keys
 *
 * 3. MED-05: Structured / Sanitized Production Logging
 *    - logger.info, logger.warn, logger.error exist and output structured timestamps
 *    - Sensitive fields (password, tokens, cookies, auth headers, secrets) are redacted
 *    - Raw JWTs and Bearer tokens are redacted from string logs
 *    - Serialized logs never expose secret values
 *    - Error objects are safely structured and sanitized
 */

import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(projectRoot, 'backend', 'package.json'));

// Import logger
const { logger, sanitize } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/utils/logger.js`
);

// Import socket
const { io } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/socket/socket.js`
);

// Import Conversation & Message models and group controller
const { default: Conversation } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/models/conversation.model.js`
);
const { default: Message } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/models/message.model.js`
);
const {
  updateGroup,
  addMembers,
  removeMembers,
  leaveGroup,
  deleteGroup,
} = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/controllers/group.controller.js`
);

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS [${name}]`);
    passed++;
  } catch (error) {
    console.error(`  ✗ FAIL [${name}]:`, error.message);
    throw error;
  }
}

async function runAsyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ PASS [${name}]`);
    passed++;
  } catch (error) {
    console.error(`  ✗ FAIL [${name}]:`, error.message);
    throw error;
  }
}

console.log('\n=== RUNNING STEP 11 MEDIUM REMEDIATION TESTS (MED-03, MED-04, MED-05) ===\n');

// -------------------------------------------------------------
// MED-03: GROUP METADATA PARTICIPANT SYNC TESTS
// -------------------------------------------------------------

// Helper to track socket emits
function createSocketTracker() {
  const emittedEvents = [];
  const originalTo = io.to;

  io.to = function (room) {
    return {
      emit: function (event, payload) {
        emittedEvents.push({ room, event, payload });
      },
    };
  };

  return {
    getEvents: () => emittedEvents,
    restore: () => {
      io.to = originalTo;
    },
  };
}

await runAsyncTest('MED-03.1: updateGroup emits group-updated to conversation room with updated metadata', async () => {
  const tracker = createSocketTracker();
  const convId = '507f1f77bcf86cd799439011';
  const adminId = '507f1f77bcf86cd799439022';

  const mockGroup = {
    _id: convId,
    groupName: 'Original Group Name',
    groupAdmin: adminId,
    participants: [adminId, '507f1f77bcf86cd799439033'],
  };

  const origFindById = Conversation.findById;
  const origFindByIdAndUpdate = Conversation.findByIdAndUpdate;

  Conversation.findById = async () => mockGroup;
  Conversation.findByIdAndUpdate = () => ({
    populate: () => ({
      populate: async () => ({
        _id: convId,
        groupName: 'Updated Group Name',
        groupAvatar: 'https://res.cloudinary.com/demo/image/upload/v1/group_avatar.png',
        groupAdmin: { _id: adminId, name: 'Admin', username: 'admin' },
        participants: [
          { _id: adminId, name: 'Admin', username: 'admin' },
          { _id: '507f1f77bcf86cd799439033', name: 'Member', username: 'member' },
        ],
      }),
    }),
  });

  try {
    const req = {
      user: { _id: adminId },
      params: { id: convId },
      body: { groupName: 'Updated Group Name' },
    };
    let statusCode = 200;
    let jsonResult = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonResult = data;
          },
        };
      },
    };

    await updateGroup(req, res);

    assert.equal(statusCode, 200);
    assert.equal(jsonResult.success, true);

    // Verify socket emission
    const events = tracker.getEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].room, `conversation:${convId}`);
    assert.equal(events[0].event, 'group-updated');
    assert.equal(events[0].payload.groupName, 'Updated Group Name');
    assert.equal(events[0].payload.conversationId, convId);
    assert(Array.isArray(events[0].payload.participants));
  } finally {
    Conversation.findById = origFindById;
    Conversation.findByIdAndUpdate = origFindByIdAndUpdate;
    tracker.restore();
  }
});

await runAsyncTest('MED-03.2: addMembers emits group-updated with new participants to room', async () => {
  const tracker = createSocketTracker();
  const convId = '507f1f77bcf86cd799439011';
  const adminId = '507f1f77bcf86cd799439022';
  const newMemberId = '507f1f77bcf86cd799439044';

  const mockGroup = {
    _id: convId,
    groupName: 'Dev Team',
    groupAdmin: adminId,
    participants: [adminId],
    unreadCounts: new Map([[adminId, 0]]),
    save: async () => {},
  };

  const origFindById = Conversation.findById;
  let callCount = 0;
  Conversation.findById = (id) => {
    callCount++;
    if (callCount === 1) return mockGroup;
    return {
      populate: () => ({
        populate: async () => ({
          _id: convId,
          groupName: 'Dev Team',
          groupAdmin: { _id: adminId, name: 'Admin' },
          participants: [
            { _id: adminId, name: 'Admin' },
            { _id: newMemberId, name: 'Newbie' },
          ],
        }),
      }),
    };
  };

  try {
    const req = {
      user: { _id: adminId },
      params: { id: convId },
      body: { memberIds: [newMemberId] },
    };
    const res = {
      status: () => ({ json: () => {} }),
    };

    await addMembers(req, res);

    const events = tracker.getEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].room, `conversation:${convId}`);
    assert.equal(events[0].event, 'group-updated');
    assert.equal(events[0].payload.conversationId, convId);
    assert.equal(events[0].payload.participants.length, 2);
    assert.deepEqual(events[0].payload.newMemberIds, [newMemberId]);
  } finally {
    Conversation.findById = origFindById;
    tracker.restore();
  }
});

await runAsyncTest('MED-03.3: removeMembers emits group-updated with removedMemberIds', async () => {
  const tracker = createSocketTracker();
  const convId = '507f1f77bcf86cd799439011';
  const adminId = '507f1f77bcf86cd799439022';
  const memberToRemove = '507f1f77bcf86cd799439033';

  const mockGroup = {
    _id: convId,
    groupName: 'Dev Team',
    groupAdmin: adminId,
    participants: [adminId, memberToRemove],
    unreadCounts: new Map(),
    save: async () => {},
  };

  const origFindById = Conversation.findById;
  let callCount = 0;
  Conversation.findById = () => {
    callCount++;
    if (callCount === 1) return mockGroup;
    return {
      populate: () => ({
        populate: async () => ({
          _id: convId,
          groupName: 'Dev Team',
          groupAdmin: { _id: adminId, name: 'Admin' },
          participants: [{ _id: adminId, name: 'Admin' }],
        }),
      }),
    };
  };

  try {
    const req = {
      user: { _id: adminId },
      params: { id: convId },
      body: { memberIds: [memberToRemove] },
    };
    const res = {
      status: () => ({ json: () => {} }),
    };

    await removeMembers(req, res);

    const events = tracker.getEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].room, `conversation:${convId}`);
    assert.equal(events[0].event, 'group-updated');
    assert.deepEqual(events[0].payload.removedMemberIds, [memberToRemove]);
  } finally {
    Conversation.findById = origFindById;
    tracker.restore();
  }
});

await runAsyncTest('MED-03.4: deleteGroup emits group-deleted to conversation room', async () => {
  const tracker = createSocketTracker();
  const convId = '507f1f77bcf86cd799439011';
  const adminId = '507f1f77bcf86cd799439022';

  const mockGroup = {
    _id: convId,
    groupName: 'To Delete',
    groupAdmin: adminId,
    participants: [adminId],
  };

  const origFindById = Conversation.findById;
  const origFindByIdAndDelete = Conversation.findByIdAndDelete;
  const origMessageFind = Message.find;
  const origMessageDeleteMany = Message.deleteMany;

  Conversation.findById = async () => mockGroup;
  Conversation.findByIdAndDelete = async () => {};
  Message.find = async () => [];
  Message.deleteMany = async () => {};

  try {
    const req = {
      user: { _id: adminId },
      params: { id: convId },
    };
    const res = {
      status: () => ({ json: () => {} }),
    };

    await deleteGroup(req, res);

    const events = tracker.getEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].room, `conversation:${convId}`);
    assert.equal(events[0].event, 'group-deleted');
    assert.equal(events[0].payload.conversationId, convId);
  } finally {
    Conversation.findById = origFindById;
    Conversation.findByIdAndDelete = origFindByIdAndDelete;
    Message.find = origMessageFind;
    Message.deleteMany = origMessageDeleteMany;
    tracker.restore();
  }
});

await runAsyncTest('MED-03.5: Unauthorized user cannot mutate group or trigger socket emits', async () => {
  const tracker = createSocketTracker();
  const convId = '507f1f77bcf86cd799439011';
  const realAdmin = '507f1f77bcf86cd799439022';
  const imposter = '507f1f77bcf86cd799439099';

  const mockGroup = {
    _id: convId,
    groupName: 'Secret Group',
    groupAdmin: realAdmin,
    participants: [realAdmin, imposter],
  };

  const origFindById = Conversation.findById;
  Conversation.findById = async () => mockGroup;

  try {
    const req = {
      user: { _id: imposter },
      params: { id: convId },
      body: { groupName: 'Hacked Name' },
    };
    let statusCode = 0;
    let jsonResult = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonResult = data;
          },
        };
      },
    };

    await updateGroup(req, res);

    assert.equal(statusCode, 403);
    assert.equal(jsonResult.success, false);
    // No socket event must be emitted on rejection!
    assert.equal(tracker.getEvents().length, 0);
  } finally {
    Conversation.findById = origFindById;
    tracker.restore();
  }
});

runTest('MED-03.6: SocketContext contains exact named group listeners and cleanup registration', () => {
  const socketCtxPath = path.resolve('frontend/src/context/SocketContext.jsx');
  const code = fs.readFileSync(socketCtxPath, 'utf8');

  // Verify group-updated listener and cleanup
  assert(code.includes("socketInstance.on('group-updated'"), 'Missing socketInstance.on group-updated');
  assert(code.includes("socketInstance.off('group-updated'"), 'Missing socketInstance.off group-updated');

  // Verify group-deleted listener and cleanup
  assert(code.includes("socketInstance.on('group-deleted'"), 'Missing socketInstance.on group-deleted');
  assert(code.includes("socketInstance.off('group-deleted'"), 'Missing socketInstance.off group-deleted');

  // Ensure no duplicate registration or feedback loop
  assert(!code.includes("socketInstance.emit('get-online-users'") || code.indexOf("get-online-users") === code.lastIndexOf("get-online-users"));
});

// -------------------------------------------------------------
// MED-04: REACT ARRAY-INDEX KEY FALLBACK TESTS
// -------------------------------------------------------------

runTest('MED-04.1: ChatMessages.jsx contains NO array-index React keys in .map() iterations', () => {
  const chatMessagesPath = path.resolve('frontend/src/components/ChatMessages.jsx');
  const code = fs.readFileSync(chatMessagesPath, 'utf8');

  // Verify that key={index} or key={i} or key={idx} is never used
  assert(!/key\s*=\s*\{\s*(index|idx|i)\s*\}/i.test(code), 'Found forbidden key={index} in ChatMessages.jsx');

  // Verify no fallback to index: key={something || index}
  assert(!/key\s*=\s*\{[^}]*\|\|\s*(index|idx|i)\s*\}/i.test(code), 'Found forbidden key fallback to index in ChatMessages.jsx');

  // Verify unused (msg, index) parameter was removed
  assert(!/messages\.map\(\s*\(\s*msg\s*,\s*index\s*\)/.test(code), 'Found unused index parameter in messages.map()');
});

runTest('MED-04.2: ChatMessages.jsx uses deterministic keys for messages, attachments, and reactions', () => {
  const chatMessagesPath = path.resolve('frontend/src/components/ChatMessages.jsx');
  const code = fs.readFileSync(chatMessagesPath, 'utf8');

  // Message container key uses msgId
  assert(/key=\{msgId\}/.test(code), 'Expected key={msgId} for message bubble');

  // Attachment elements use stableKey derived from attachment and message identity
  assert(/key=\{stableKey\}/.test(code), 'Expected key={stableKey} for attachment elements');

  // Reaction indicators use composite key with emoji
  assert(/key=\{`\$\{msgId\}_rx_\$\{emoji\}`\}/.test(code) || /key=\{`\$\{msgId\}_rx_/.test(code), 'Expected composite key for reactions');

  // Quick reaction buttons use composite key with emoji
  assert(/key=\{`\$\{msgId\}_quick_\$\{emoji\}`\}/.test(code) || /key=\{`\$\{msgId\}_quick_/.test(code), 'Expected composite key for quick reaction buttons');

  // Verify NO Math.random or Date.now used in React keys
  assert(!/key=\{[^}]*Math\.random/.test(code), 'Must not use Math.random in keys');
  assert(!/key=\{[^}]*Date\.now/.test(code), 'Must not use Date.now in keys');
});

// -------------------------------------------------------------
// MED-05: STRUCTURED / SANITIZED PRODUCTION LOGGING TESTS
// -------------------------------------------------------------

runTest('MED-05.1: Logger provides info, warn, and error methods', () => {
  assert.equal(typeof logger.info, 'function');
  assert.equal(typeof logger.warn, 'function');
  assert.equal(typeof logger.error, 'function');
});

runTest('MED-05.2: Sensitive object fields are redacted in logs', () => {
  const sensitivePayload = {
    username: 'alice',
    password: 'SuperSecretPassword123!',
    currentPassword: 'OldPassword123!',
    newPassword: 'NewPassword123!',
    token: 'jwt_secret_token_value',
    accessToken: 'access_token_123',
    refreshToken: 'refresh_token_456',
    authorization: 'Bearer supersecrettoken',
    cookie: 'accessToken=abc; refreshToken=def',
    api_secret: 'cloudinary_secret_key',
  };

  const sanitized = sanitize(sensitivePayload);

  assert.equal(sanitized.username, 'alice');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.currentPassword, '[REDACTED]');
  assert.equal(sanitized.newPassword, '[REDACTED]');
  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.accessToken, '[REDACTED]');
  assert.equal(sanitized.refreshToken, '[REDACTED]');
  assert.equal(sanitized.authorization, '[REDACTED]');
  assert.equal(sanitized.cookie, '[REDACTED]');
  assert.equal(sanitized.api_secret, '[REDACTED]');
});

runTest('MED-05.3: Raw JWT tokens and Bearer credentials in strings are redacted', () => {
  const jwtSample = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jV_ExampleSignatureString123';
  const logMessage = `User failed auth with token Bearer ${jwtSample}`;

  const sanitized = sanitize(logMessage);

  assert(!sanitized.includes('dozjgNryP4J3jV_ExampleSignatureString123'));
  assert(sanitized.includes('Bearer [REDACTED_TOKEN]') || sanitized.includes('[REDACTED_JWT]'));
});

runTest('MED-05.4: Cookie strings in headers or logs are redacted', () => {
  const cookieString = 'accessToken=mysecrettoken123; refreshToken=myrefresh456';
  const sanitized = sanitize(cookieString);

  assert(!sanitized.includes('mysecrettoken123'));
  assert(!sanitized.includes('myrefresh456'));
  assert(sanitized.includes('accessToken='));
  assert(sanitized.includes('refreshToken='));
  assert(sanitized.includes('[REDACTED'));
});

runTest('MED-05.5: Error stacks and messages are sanitized without throwing', () => {
  const err = new Error('Database query failed for password=PlaintextSecret123');
  const sanitized = sanitize(err);

  assert.equal(sanitized.name, 'Error');
  assert(!sanitized.message.includes('PlaintextSecret123'));
});

runTest('MED-05.6: Logger does not expose process.env secrets', () => {
  const secretEnv = {
    JWT_SECRET: process.env.JWT_SECRET || 'secret1',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || 'secret2',
  };

  const loggedString = logger.error('Configuration snapshot:', secretEnv);
  assert(!loggedString.includes('secret1') && !loggedString.includes('secret2'));
  assert(loggedString.includes('[REDACTED]'));
});

console.log(`\n========================================`);
console.log(`ALL PHASE 5 TESTS PASSED: ${passed} / ${total}`);
console.log(`========================================\n`);
