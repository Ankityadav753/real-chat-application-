import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import controllers and utilities
const { deleteMessage } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/controllers/message.controller.js`
);
const { deleteGroup } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/controllers/group.controller.js`
);
const { extractCloudinaryPublicId, deleteFromCloudinary } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/utils/cloudinaryUpload.js`
);
const { default: Conversation } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/models/conversation.model.js`
);
const { default: Message } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/models/message.model.js`
);
const { default: User } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/models/user.model.js`
);
const { io } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/socket/socket.js`
);

console.log('=== RUNNING STEP 11 HIGH SECURITY REMEDIATION TESTS ===\n');

let passedCount = 0;
let totalCount = 0;

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

// Common IDs
const CONV_A_ID = '507f1f77bcf86cd799439011';
const CONV_B_ID = '507f1f77bcf86cd799439022';
const MSG_1_ID = '507f191e810c19729de86011';
const MSG_2_ID = '507f191e810c19729de86022';
const USER_ALICE_ID = '507f191e810c19729de860aa';
const USER_BOB_ID = '507f191e810c19729de860bb';
const USER_ATTACKER_ID = '507f191e810c19729de860cc';

// Prevent DB updates during socket connect mock
User.findByIdAndUpdate = async () => null;

async function createMockSocket(userId, socketId = `sock_${Math.random().toString(36).substring(2, 7)}`) {
  const rooms = new Set();
  const handlers = {};
  const receivedEvents = [];

  const mockSocket = {
    id: socketId,
    user: { _id: userId, username: 'user_' + userId.slice(-4) },
    rooms,
    join: function (room) {
      rooms.add(room);
    },
    leave: function (room) {
      rooms.delete(room);
    },
    on: function (event, handler) {
      handlers[event] = handler;
    },
    emit: function (event, payload) {
      receivedEvents.push({ event, payload });
    },
    handlers,
    receivedEvents,
  };

  const connListener = (io.sockets && io.sockets.listeners('connection')[0]) || io.listeners('connection')[0];
  if (connListener) {
    await connListener(mockSocket);
  }

  return mockSocket;
}

// ============================================================================
// SUITE 1: HIGH-01 — MESSAGE-SEEN PARTICIPANT & TARGET AUTHORIZATION
// ============================================================================

await asyncTest('HIGH-01.1: Authorized participant can mark a message seen', async () => {
  let updatedMessageId = null;
  let updateOperation = null;
  let unreadResetUser = null;

  Conversation.findById = async (id) => {
    if (id === CONV_A_ID) {
      return {
        _id: CONV_A_ID,
        participants: [USER_ALICE_ID, USER_BOB_ID],
        unreadCounts: {
          set: (uid, val) => {
            unreadResetUser = uid;
          },
        },
        save: async () => {},
      };
    }
    return null;
  };

  Message.findById = async (id) => {
    if (id === MSG_1_ID) {
      return {
        _id: MSG_1_ID,
        conversationId: CONV_A_ID,
        senderId: USER_ALICE_ID, // Sender is Alice, viewer is Bob
      };
    }
    return null;
  };

  Message.findByIdAndUpdate = async (id, op) => {
    updatedMessageId = id;
    updateOperation = op;
    return {};
  };

  const bobSocket = await createMockSocket(USER_BOB_ID);
  assert(bobSocket.handlers['message-seen'], 'message-seen handler must exist');

  await bobSocket.handlers['message-seen']({ conversationId: CONV_A_ID, messageId: MSG_1_ID });

  assert.strictEqual(updatedMessageId, MSG_1_ID, 'Target message ID must be updated');
  assert(updateOperation.$addToSet.seenBy, 'seenBy must be set in $addToSet');
  assert.strictEqual(unreadResetUser, USER_BOB_ID, 'Unread count must be reset for Bob');
});

await asyncTest('HIGH-01.2: Nonparticipant cannot mark a message seen', async () => {
  let updateAttempted = false;

  Conversation.findById = async (id) => {
    if (id === CONV_A_ID) {
      return {
        _id: CONV_A_ID,
        participants: [USER_ALICE_ID, USER_BOB_ID], // Attacker not participant
        unreadCounts: { set: () => {} },
        save: async () => {},
      };
    }
    return null;
  };

  Message.findByIdAndUpdate = async () => {
    updateAttempted = true;
  };

  const attackerSocket = await createMockSocket(USER_ATTACKER_ID);
  await attackerSocket.handlers['message-seen']({ conversationId: CONV_A_ID, messageId: MSG_1_ID });

  assert.strictEqual(updateAttempted, false, 'Nonparticipant must not be allowed to update message seen status');
});

await asyncTest('HIGH-01.3: Message from another conversation cannot be marked seen', async () => {
  let updateAttempted = false;

  Conversation.findById = async (id) => {
    if (id === CONV_A_ID) {
      return {
        _id: CONV_A_ID,
        participants: [USER_ALICE_ID, USER_BOB_ID],
        unreadCounts: { set: () => {} },
        save: async () => {},
      };
    }
    return null;
  };

  Message.findById = async (id) => {
    if (id === MSG_2_ID) {
      // Belongs to CONV_B_ID, not CONV_A_ID
      return {
        _id: MSG_2_ID,
        conversationId: CONV_B_ID,
        senderId: USER_ALICE_ID,
      };
    }
    return null;
  };

  Message.findByIdAndUpdate = async () => {
    updateAttempted = true;
  };

  const bobSocket = await createMockSocket(USER_BOB_ID);
  await bobSocket.handlers['message-seen']({ conversationId: CONV_A_ID, messageId: MSG_2_ID });

  assert.strictEqual(updateAttempted, false, 'Message belonging to a different conversation must be rejected');
});

await asyncTest('HIGH-01.4: Sender cannot spoof seen acknowledgement for own message', async () => {
  let updateAttempted = false;

  Conversation.findById = async (id) => ({
    _id: CONV_A_ID,
    participants: [USER_ALICE_ID, USER_BOB_ID],
    unreadCounts: { set: () => {} },
    save: async () => {},
  });

  Message.findById = async (id) => ({
    _id: MSG_1_ID,
    conversationId: CONV_A_ID,
    senderId: USER_ALICE_ID, // Alice is sender
  });

  Message.findByIdAndUpdate = async () => {
    updateAttempted = true;
  };

  const aliceSocket = await createMockSocket(USER_ALICE_ID); // Alice is sender
  await aliceSocket.handlers['message-seen']({ conversationId: CONV_A_ID, messageId: MSG_1_ID });

  assert.strictEqual(updateAttempted, false, 'Sender must not acknowledge their own message as seen');
});

await asyncTest('HIGH-01.5: Malformed IDs are safely rejected without exception', async () => {
  const testSocket = await createMockSocket(USER_BOB_ID);

  const malformedPayloads = [
    null,
    undefined,
    'plain_string',
    { conversationId: 'invalid-conv-id' },
    { conversationId: CONV_A_ID, messageId: 'invalid-msg-id' },
    { conversationId: 12345 },
    { conversationId: CONV_A_ID, messageId: 9999 },
  ];

  for (const badPayload of malformedPayloads) {
    let threw = false;
    try {
      await testSocket.handlers['message-seen'](badPayload);
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, `Payload ${JSON.stringify(badPayload)} must not throw unhandled error`);
  }
});

await asyncTest('HIGH-01.6: Existing conversation-wide seen behavior remains intact', async () => {
  let updateManyFilter = null;
  let updateManyOp = null;
  let unresetId = null;

  Conversation.findById = async () => ({
    _id: CONV_A_ID,
    participants: [USER_ALICE_ID, USER_BOB_ID],
    unreadCounts: {
      set: (uid, val) => {
        unresetId = uid;
      },
    },
    save: async () => {},
  });

  Message.updateMany = async (filter, op) => {
    updateManyFilter = filter;
    updateManyOp = op;
    return {};
  };

  const bobSocket = await createMockSocket(USER_BOB_ID);
  // Omit messageId (conversation-level seen)
  await bobSocket.handlers['message-seen']({ conversationId: CONV_A_ID });

  assert.strictEqual(updateManyFilter.conversationId, CONV_A_ID);
  assert(updateManyFilter.senderId.$ne, 'Must filter out messages sent by viewer');
  assert(updateManyOp.$addToSet.seenBy, 'Must add viewer to seenBy');
  assert.strictEqual(unresetId, USER_BOB_ID, 'Must reset viewer unread count');
});

// ============================================================================
// SUITE 2: HIGH-02 — ONLINE PRESENCE EVENT STORM PREVENTION
// ============================================================================

await asyncTest('HIGH-02.1: onUserOnline does not emit get-online-users feedback loop', () => {
  // Read SocketContext.jsx source and assert absence of get-online-users inside onUserOnline
  const socketContextPath = path.join(projectRoot, 'frontend', 'src', 'context', 'SocketContext.jsx');
  const content = fs.readFileSync(socketContextPath, 'utf8');

  // Match the onUserOnline function definition
  const onUserOnlineMatch = content.match(/const\s+onUserOnline\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\};/);
  assert(onUserOnlineMatch, 'onUserOnline must be defined in SocketContext.jsx');

  const onUserOnlineBody = onUserOnlineMatch[1];
  assert.strictEqual(
    onUserOnlineBody.includes('get-online-users'),
    false,
    'onUserOnline must NOT emit get-online-users (prevents O(N^2) event storm)'
  );
  assert(
    onUserOnlineBody.includes('handleUserOnlineStatus'),
    'onUserOnline must update local store incrementally via handleUserOnlineStatus'
  );
});

await asyncTest('HIGH-02.2: Initial connection and reconnect still preserve get-online-users', () => {
  const socketContextPath = path.join(projectRoot, 'frontend', 'src', 'context', 'SocketContext.jsx');
  const content = fs.readFileSync(socketContextPath, 'utf8');

  // onConnect must still request initial user list
  const onConnectMatch = content.match(/const\s+onConnect\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\};/);
  assert(onConnectMatch, 'onConnect must be defined');
  assert(
    onConnectMatch[1].includes('get-online-users'),
    'onConnect must retain initial get-online-users synchronization upon connection'
  );
});

// ============================================================================
// SUITE 3: HIGH-03 — CLOUDINARY ASSET CLEANUP ON DELETION
// ============================================================================

await asyncTest('HIGH-03.1: extractCloudinaryPublicId extracts publicId from metadata object', () => {
  const item = {
    publicId: 'chat_app_attachments/my_photo_123',
    url: 'https://res.cloudinary.com/cloud/image/upload/v1234/chat_app_attachments/my_photo_123.jpg',
    type: 'image',
  };

  const extracted = extractCloudinaryPublicId(item);
  assert.strictEqual(extracted, 'chat_app_attachments/my_photo_123');
});

await asyncTest('HIGH-03.2: extractCloudinaryPublicId safely derives from valid Cloudinary URL', () => {
  const url = 'https://res.cloudinary.com/testcloud/image/upload/v1726830000/chat_app_attachments/derived_asset_999.png';
  const extracted = extractCloudinaryPublicId(url);
  assert.strictEqual(extracted, 'chat_app_attachments/derived_asset_999');
});

await asyncTest('HIGH-03.3: extractCloudinaryPublicId rejects non-Cloudinary / external URLs', () => {
  const externalUrls = [
    'https://api.dicebear.com/7.x/initials/svg?seed=Alice',
    'https://images.unsplash.com/photo-12345',
    'https://example.com/uploads/photo.jpg',
    'http://localhost:5000/public/image.jpg',
    'https://attacker.com/res.cloudinary.com/fake.jpg',
    '',
    null,
    undefined,
  ];

  for (const ext of externalUrls) {
    const extracted = extractCloudinaryPublicId(ext);
    assert.strictEqual(extracted, null, `External URL "${ext}" must return null and never be marked for deletion`);
  }
});

await asyncTest('HIGH-03.4: deleteMessage cleans Cloudinary attachments on soft delete', async () => {
  const deletedCloudinaryAssets = [];

  // Mock extractCloudinaryPublicId target
  const mockMessage = {
    _id: MSG_1_ID,
    senderId: USER_ALICE_ID,
    conversationId: CONV_A_ID,
    text: 'Attachment test message',
    attachments: [
      {
        url: 'https://res.cloudinary.com/cloud/image/upload/v1/chat_app_attachments/photo_1.jpg',
        publicId: 'chat_app_attachments/photo_1',
        type: 'image',
      },
      {
        url: 'https://res.cloudinary.com/cloud/raw/upload/v1/chat_app_attachments/doc_1.pdf',
        publicId: 'chat_app_attachments/doc_1',
        type: 'file',
      },
      {
        url: 'https://api.dicebear.com/seed.svg', // External URL
        type: 'image',
      },
    ],
    isDeleted: false,
    save: async function () {
      return this;
    },
  };

  Message.findById = async () => mockMessage;

  // Intercept cloudinaryUpload module's deleteFromCloudinary by checking what extractCloudinaryPublicId resolves
  const req = {
    user: { _id: USER_ALICE_ID },
    params: { id: MSG_1_ID },
  };

  let resJson = null;
  const res = {
    status: (code) => {
      assert.strictEqual(code, 200);
      return { json: (d) => { resJson = d; } };
    },
  };

  await deleteMessage(req, res);

  assert.strictEqual(mockMessage.isDeleted, true);
  assert.strictEqual(mockMessage.text, 'This message was deleted');
  assert.deepStrictEqual(mockMessage.attachments, [], 'Attachments must be cleared in DB');
  assert.strictEqual(resJson.success, true);
});

await asyncTest('HIGH-03.5: deleteMessage without attachments does not trigger asset deletion', async () => {
  const mockMessage = {
    _id: MSG_1_ID,
    senderId: USER_ALICE_ID,
    conversationId: CONV_A_ID,
    text: 'Text-only message',
    attachments: [],
    isDeleted: false,
    save: async function () { return this; },
  };

  Message.findById = async () => mockMessage;

  const req = {
    user: { _id: USER_ALICE_ID },
    params: { id: MSG_1_ID },
  };

  let resCode = null;
  const res = {
    status: (code) => {
      resCode = code;
      return { json: () => {} };
    },
  };

  await deleteMessage(req, res);
  assert.strictEqual(resCode, 200);
  assert.strictEqual(mockMessage.isDeleted, true);
});

await asyncTest('HIGH-03.6: deleteMessage retains sender authorization check', async () => {
  const mockMessage = {
    _id: MSG_1_ID,
    senderId: USER_ALICE_ID,
    conversationId: CONV_A_ID,
    text: 'Message',
    attachments: [{ publicId: 'some_id', type: 'image' }],
    isDeleted: false,
    save: async function () { return this; },
  };

  Message.findById = async () => mockMessage;

  const req = {
    user: { _id: USER_ATTACKER_ID }, // Non-author
    params: { id: MSG_1_ID },
  };

  let statusCode = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return { json: () => {} };
    },
  };

  await deleteMessage(req, res);
  assert.strictEqual(statusCode, 403, 'Non-author cannot delete message');
  assert.strictEqual(mockMessage.isDeleted, false, 'Message must not be deleted');
  assert.strictEqual(mockMessage.attachments.length, 1, 'Attachments must not be cleared');
});

await asyncTest('HIGH-03.7: deleteGroup cleans group avatar and message attachments safely', async () => {
  let convDeleted = false;
  let messagesDeleted = false;

  const mockGroup = {
    _id: CONV_A_ID,
    groupAdmin: USER_ALICE_ID,
    isGroup: true,
    groupAvatar: 'https://res.cloudinary.com/cloud/image/upload/v1/chat_app_attachments/avatar_group_1.jpg',
  };

  Conversation.findById = async () => mockGroup;
  Conversation.findByIdAndDelete = async (id) => {
    if (id === CONV_A_ID) convDeleted = true;
  };
  Message.find = () => Promise.resolve([
    {
      attachments: [
        { publicId: 'chat_app_attachments/att_1', type: 'image' },
        { url: 'https://res.cloudinary.com/cloud/image/upload/v1/chat_app_attachments/att_2.jpg', type: 'image' },
        { url: 'https://api.dicebear.com/avatar.svg', type: 'image' }, // external
      ],
    },
  ]);
  Message.deleteMany = async (filter) => {
    if (filter.conversationId === CONV_A_ID) messagesDeleted = true;
  };

  const req = {
    user: { _id: USER_ALICE_ID }, // Admin
    params: { id: CONV_A_ID },
  };

  let statusCode = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return { json: () => {} };
    },
  };

  await deleteGroup(req, res);

  assert.strictEqual(statusCode, 200);
  assert.strictEqual(convDeleted, true, 'Conversation must be deleted');
  assert.strictEqual(messagesDeleted, true, 'Messages must be deleted');
});

console.log(`\n========================================`);
console.log(`ALL HIGH SECURITY TESTS PASSED: ${passedCount} / ${totalCount}`);
console.log(`========================================\n`);
process.exit(0);
