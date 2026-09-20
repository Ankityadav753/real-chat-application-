import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import controllers and models to test
const { getMessages } = await import(
  `file:///${projectRoot.replace(/\\/g, '/')}/backend/controllers/message.controller.js`
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

console.log('=== RUNNING STEP 11 CRITICAL AUTHORIZATION TESTS ===\n');

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

// Common mock IDs
const CONV_ID_VALID = '507f1f77bcf86cd799439011';
const USER_A_ID = '507f191e810c19729de860ea';
const USER_B_ID = '507f191e810c19729de860eb';
const ATTACKER_ID = '507f191e810c19729de860ec';

// Save original model methods
const originalConvFindById = Conversation.findById;
const originalMessageFind = Message.find;
const originalUserFindByIdAndUpdate = User.findByIdAndUpdate;

// Mock User.findByIdAndUpdate so socket connection does not attempt DB writes
User.findByIdAndUpdate = async () => null;

// -------------------------------------------------------------
// Test 1: Authorized participant can retrieve messages
// -------------------------------------------------------------
await asyncTest('1: Authorized participant can retrieve messages', async () => {
  // Mock conversation with User A and User B
  Conversation.findById = async (id) => {
    if (id === CONV_ID_VALID) {
      return {
        _id: CONV_ID_VALID,
        participants: [
          { _id: USER_A_ID, name: 'Alice' },
          { _id: USER_B_ID, name: 'Bob' },
        ],
      };
    }
    return null;
  };

  const sampleMessages = [
    { _id: 'msg_1', conversationId: CONV_ID_VALID, text: 'Hello Bob', createdAt: new Date() },
  ];

  Message.find = (query) => {
    assert.strictEqual(query.conversationId, CONV_ID_VALID);
    return {
      populate: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => Promise.resolve([...sampleMessages]),
          }),
        }),
      }),
    };
  };

  const req = {
    user: { _id: USER_A_ID },
    params: { conversationId: CONV_ID_VALID },
    query: { limit: '30' },
  };

  let statusCode = null;
  let responseData = null;

  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          responseData = data;
        },
      };
    },
  };

  await getMessages(req, res);

  assert.strictEqual(statusCode, 200, 'Authorized participant must receive 200 OK');
  assert.strictEqual(responseData.success, true, 'success must be true');
  assert.strictEqual(responseData.messages.length, 1, 'Must return the messages');
  assert.strictEqual(responseData.messages[0].text, 'Hello Bob');
});

// -------------------------------------------------------------
// Test 2: Non-participant receives 403 Forbidden
// -------------------------------------------------------------
await asyncTest('2: Non-participant receives HTTP 403 on getMessages', async () => {
  Conversation.findById = async (id) => {
    if (id === CONV_ID_VALID) {
      return {
        _id: CONV_ID_VALID,
        // Participants only Alice and Bob
        participants: [USER_A_ID, USER_B_ID],
      };
    }
    return null;
  };

  let messageFindCalled = false;
  Message.find = () => {
    messageFindCalled = true;
    return {
      populate: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    };
  };

  const req = {
    user: { _id: ATTACKER_ID },
    params: { conversationId: CONV_ID_VALID },
    query: {},
  };

  let statusCode = null;
  let responseData = null;

  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          responseData = data;
        },
      };
    },
  };

  await getMessages(req, res);

  assert.strictEqual(statusCode, 403, 'Non-participant must receive 403 Forbidden');
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(
    responseData.message,
    'Access denied: You are not a participant in this conversation'
  );
  assert.strictEqual(messageFindCalled, false, 'Message.find must NOT be executed for non-participants');
});

// -------------------------------------------------------------
// Test 3: Invalid / Nonexistent conversation handled safely
// -------------------------------------------------------------
await asyncTest('3: Invalid / nonexistent conversation handled safely with 404', async () => {
  // 3a. Nonexistent conversation (valid ObjectId format, but not in DB)
  Conversation.findById = async () => null;

  const reqNonexistent = {
    user: { _id: USER_A_ID },
    params: { conversationId: '507f1f77bcf86cd799439099' },
    query: {},
  };

  let code3a = null;
  let data3a = null;
  const res3a = {
    status: (code) => {
      code3a = code;
      return { json: (d) => { data3a = d; } };
    },
  };

  await getMessages(reqNonexistent, res3a);
  assert.strictEqual(code3a, 404, 'Nonexistent conversation must return 404');
  assert.strictEqual(data3a.success, false);
  assert.strictEqual(data3a.message, 'Conversation not found');

  // 3b. Malformed conversation ID string
  const reqMalformed = {
    user: { _id: USER_A_ID },
    params: { conversationId: 'not_an_object_id_string' },
    query: {},
  };

  let code3b = null;
  let data3b = null;
  const res3b = {
    status: (code) => {
      code3b = code;
      return { json: (d) => { data3b = d; } };
    },
  };

  await getMessages(reqMalformed, res3b);
  assert.strictEqual(code3b, 404, 'Malformed conversation ID must return 404 cleanly');
  assert.strictEqual(data3b.success, false);
  assert.strictEqual(data3b.message, 'Conversation not found');
});

// Helper to simulate a connected socket and invoke the registered connection listener
async function createMockSocket(userId, socketId = `sock_${Math.random().toString(36).substring(2, 7)}`) {
  const rooms = new Set();
  const handlers = {};
  const receivedEvents = [];

  const mockSocket = {
    id: socketId,
    user: { _id: userId, username: 'test_user' },
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

// -------------------------------------------------------------
// Test 4: Authorized participant can join socket room
// -------------------------------------------------------------
await asyncTest('4: Authorized participant can join socket room', async () => {
  Conversation.findById = async (id) => {
    if (id === CONV_ID_VALID) {
      return {
        _id: CONV_ID_VALID,
        participants: [USER_A_ID, USER_B_ID],
      };
    }
    return null;
  };

  const authorizedSocket = await createMockSocket(USER_A_ID, 'socket_alice');
  assert(authorizedSocket.handlers['join-chat'], 'join-chat handler must be registered');

  await authorizedSocket.handlers['join-chat'](CONV_ID_VALID);

  assert(
    authorizedSocket.rooms.has(`conversation:${CONV_ID_VALID}`),
    `Socket room "conversation:${CONV_ID_VALID}" must be joined by participant Alice`
  );
});

// -------------------------------------------------------------
// Test 5: Non-participant cannot join socket room
// -------------------------------------------------------------
await asyncTest('5: Non-participant cannot join socket room', async () => {
  Conversation.findById = async (id) => {
    if (id === CONV_ID_VALID) {
      return {
        _id: CONV_ID_VALID,
        participants: [USER_A_ID, USER_B_ID], // Attacker is NOT a participant
      };
    }
    return null;
  };

  const attackerSocket = await createMockSocket(ATTACKER_ID, 'socket_attacker');
  assert(attackerSocket.handlers['join-chat'], 'join-chat handler must be registered');

  await attackerSocket.handlers['join-chat'](CONV_ID_VALID);

  assert.strictEqual(
    attackerSocket.rooms.has(`conversation:${CONV_ID_VALID}`),
    false,
    `Attacker socket must NOT be allowed to join room "conversation:${CONV_ID_VALID}"`
  );
});

// -------------------------------------------------------------
// Test 6: Invalid conversation ID cannot join
// -------------------------------------------------------------
await asyncTest('6: Invalid or malformed conversation ID cannot join socket room', async () => {
  let findByIdCalled = false;
  Conversation.findById = async () => {
    findByIdCalled = true;
    return null;
  };

  const testSocket = await createMockSocket(USER_A_ID, 'socket_test_invalid');
  const invalidInputs = [
    'invalid-non-hex-id',
    '123',
    '',
    null,
    undefined,
    12345,
    { id: CONV_ID_VALID },
  ];

  for (const badId of invalidInputs) {
    findByIdCalled = false;
    await testSocket.handlers['join-chat'](badId);

    assert.strictEqual(
      testSocket.rooms.has(`conversation:${badId}`),
      false,
      `Bad ID ${JSON.stringify(badId)} must not join any room`
    );
    assert.strictEqual(
      findByIdCalled,
      false,
      `Malformed ID ${JSON.stringify(badId)} must be validated before DB lookup`
    );
  }
});

// -------------------------------------------------------------
// Test 7: Unauthorized socket does not receive room broadcasts after rejected join
// -------------------------------------------------------------
await asyncTest('7: Unauthorized socket does not receive room broadcasts after rejected join', async () => {
  Conversation.findById = async (id) => {
    if (id === CONV_ID_VALID) {
      return {
        _id: CONV_ID_VALID,
        participants: [USER_A_ID, USER_B_ID],
      };
    }
    return null;
  };

  const aliceSocket = await createMockSocket(USER_A_ID, 'socket_alice_broadcast');
  const attackerSocket = await createMockSocket(ATTACKER_ID, 'socket_attacker_broadcast');

  // Alice attempts join -> authorized
  await aliceSocket.handlers['join-chat'](CONV_ID_VALID);
  assert.strictEqual(aliceSocket.rooms.has(`conversation:${CONV_ID_VALID}`), true);

  // Attacker attempts join -> rejected
  await attackerSocket.handlers['join-chat'](CONV_ID_VALID);
  assert.strictEqual(attackerSocket.rooms.has(`conversation:${CONV_ID_VALID}`), false);

  // Simulate room broadcast delivery check
  // Any message sent to room `conversation:${CONV_ID_VALID}` reaches only sockets in that room
  const targetRoom = `conversation:${CONV_ID_VALID}`;
  const mockMessagePayload = {
    _id: 'msg_confidential_1',
    conversationId: CONV_ID_VALID,
    text: 'Confidential message between Alice and Bob',
  };

  // Helper function mimicking Socket.io room delivery
  function deliverRoomBroadcast(room, event, payload, allSockets) {
    for (const s of allSockets) {
      if (s.rooms.has(room)) {
        s.emit(event, payload);
      }
    }
  }

  deliverRoomBroadcast(targetRoom, 'new-message', mockMessagePayload, [aliceSocket, attackerSocket]);

  // Verify Alice received the broadcast
  const aliceReceived = aliceSocket.receivedEvents.some(
    (e) => e.event === 'new-message' && e.payload._id === 'msg_confidential_1'
  );
  assert.strictEqual(aliceReceived, true, 'Alice must receive the room message');

  // Verify Attacker did NOT receive the broadcast
  const attackerReceived = attackerSocket.receivedEvents.some(
    (e) => e.event === 'new-message' && e.payload._id === 'msg_confidential_1'
  );
  assert.strictEqual(attackerReceived, false, 'Attacker must NOT receive the room message');
});

// Restore original methods
Conversation.findById = originalConvFindById;
Message.find = originalMessageFind;
User.findByIdAndUpdate = originalUserFindByIdAndUpdate;

console.log(`\n========================================`);
console.log(`ALL TESTS PASSED: ${passedCount} / ${totalCount}`);
console.log(`========================================\n`);
process.exit(0);
