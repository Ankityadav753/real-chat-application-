# ChitChat: Production-Ready MERN Stack Real-Time Chat Application

ChitChat is a full-stack, real-time messaging application designed with modern engineering principles. It features 1-to-1 chats, group chats, typing indicators, read receipts, rich file attachments, voice notes, message starring, reactions, and an active online user dashboard. The frontend is styled using a responsive WhatsApp + Discord inspired glassmorphic aesthetic.

---

## Folder Structure

```
c:\Users\ankit\Desktop\chat app\
├── backend/
│   ├── config/
│   │   ├── cloudinary.js           # Cloudinary Node SDK config
│   │   ├── cors.js                 # Centralized CORS & allowed origins (Step 8)
│   │   └── db.js                   # MongoDB Connection (Mongoose)
│   ├── controllers/
│   │   ├── auth.controller.js      # Auth endpoints (Register, Login, Logout, Refresh, getMe)
│   │   ├── conversation.controller.js # Chat thread (1-to-1, pins, unread flags)
│   │   ├── group.controller.js     # Group actions (Create, update, add/remove, admin tasks)
│   │   ├── message.controller.js   # Message actions (Send, edit, soft-delete, stars, reactions)
│   │   └── user.controller.js      # User management (Regex-safe search, profiles, settings)
│   ├── middlewares/
│   │   ├── auth.middleware.js      # Route guard (verify access/refresh tokens)
│   │   ├── upload.middleware.js    # Multer parser config
│   │   └── validation.middleware.js# Express validator response collector
│   ├── models/
│   │   ├── conversation.model.js
│   │   ├── message.model.js
│   │   ├── notification.model.js
│   │   └── user.model.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── conversation.routes.js
│   │   ├── group.routes.js
│   │   ├── message.routes.js
│   │   └── user.routes.js
│   ├── socket/
│   │   └── socket.js               # Socket.io auth handshake, events, status broadcaster
│   ├── utils/
│   │   ├── cloudinaryUpload.js     # Stream uploads/deletions helper
│   │   └── token.js                # JWT access/refresh token helpers
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── ting.mp3                # Message notification sound
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ChatHeader.jsx      # Mobile back buttons, statuses, group edits
│   │   │   ├── ChatInput.jsx       # Custom emoji grids, voice triggers, attachments
│   │   │   ├── ChatMessages.jsx    # Infinite scroll list, reactions hover popover, checkmarks
│   │   │   ├── EmptyState.jsx      # Glassmorphic welcome pane
│   │   │   ├── GroupModal.jsx      # Add/Remove members, edit names/avatars modal
│   │   │   ├── ProfileModal.jsx    # Update details, profiles, passwords modal
│   │   │   ├── Sidebar.jsx         # Online scroll lists, contacts search directories
│   │   │   ├── SkeletonLoader.jsx  # Page skeleton placeholders
│   │   │   └── VoiceRecorder.jsx   # Browser MediaRecorder audio generator
│   │   ├── context/
│   │   │   └── SocketContext.jsx   # Client Socket connection binder
│   │   ├── hooks/
│   │   │   └── useDebounce.js      # Debounce search trigger
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Layout coordinator
│   │   │   ├── LandingPage.jsx     # Modern welcome landing screen
│   │   │   ├── Login.jsx           # Sign in page
│   │   │   ├── NotFound.jsx        # 404 handler
│   │   │   └── Register.jsx        # Account registration page
│   │   ├── store/
│   │   │   ├── useAuthStore.js     # Zustand Auth store
│   │   │   └── useChatStore.js     # Zustand Chat store
│   │   ├── utils/
│   │   │   └── axios.js            # Base Axios setup (withCredentials)
│   │   ├── App.jsx                 # Routing controller, Toaster
│   │   ├── index.css               # Global glass tokens
│   │   └── main.jsx
│   ├── .env.example
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.js
│   └── package.json
├── tests/
│   ├── test_step8_cors_cookies.mjs # Step 8 CORS & cookie security tests
│   └── test_step9_regex_security.mjs # Step 9 search regex & ReDoS tests
├── .gitignore
├── package.json                    # Workspace orchestration & test runner
└── README.md
```

---

## Database Schemas

1. **User Schema**: Handles profiles, encrypted passwords, online flags, and last-seen timestamps.
2. **Conversation Schema**: Handles standard chats & group metadata (names, admin controls, pin records, unread count maps).
3. **Message Schema**: Manages attachments (URLs, types), nested emoji reactions, replies (referencing parent messages), starred arrays, and seen/delivered receipt status lists.
4. **Notification Schema**: Tracks alert triggers (new messages, group invites, mentions).

---

## Environment Variables

### Backend Configuration (`backend/.env`)
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/chat_db?retryWrites=true&w=majority
JWT_SECRET=your_jwt_access_secret_key_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_here
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Cloudinary credentials (Required for media uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Frontend Configuration (`frontend/.env`)
Create a `.env` file in the `frontend/` directory:
```env
VITE_BACKEND_URL=http://localhost:5000/api
```

---

## API Endpoints

### 🔑 Authentication (`/api/auth`)
* `POST /register` - Registers a new user.
* `POST /login` - Verifies credentials, sets access + refresh cookies.
* `POST /refresh` - Validates refresh token cookie and issues new access token.
* `POST /logout` - Clears session cookies, updates online status.
* `GET /me` - Returns logged-in user profile.

### 👤 User Services (`/api/users`)
* `GET /` - Searches and retrieves users (excludes self, supports debounced keywords).
* `GET /user/:id` - Fetches specific profile by ID.
* `PUT /profile` - Edits user profile metadata and uploads new avatars.
* `PUT /password` - Updates security passwords.

### 💬 Conversation Services (`/api/conversations`)
* `GET /` - Fetches conversation logs (sorted by active timestamps).
* `POST /` - Obtains or constructs a 1-to-1 conversation panel.
* `PUT /:id/pin` - Pins/unpins conversations.

### ✉️ Message Services (`/api/messages`)
* `GET /:conversationId` - Paginated messages fetch (uses cursor timestamps for infinite scroll).
* `POST /` - Sends message (supports text, replies, and file uploads).
* `PUT /:id` - Edits message content.
* `DELETE /:id` - Soft-deletes a message (marks content as deleted).
* `PUT /:id/react` - Toggles emojis reactions.
* `PUT /:id/star` - Stars/unstars messages.

### 👥 Group Services (`/api/groups`)
* `POST /` - Creates a group (with avatar and multiple members).
* `PUT /:id` - Renames or updates group settings.
* `PUT /:id/add-members` - Invites members to a group.
* `PUT /:id/remove-members` - Evicts members from group.
* `PUT /:id/leave` - Leaves a group.
* `DELETE /:id` - Deletes a group.

---

## Real-Time Socket Events

* `get-online-users`: Emitted by client to request initial online presence list.
* `online-users`: Syncs current list of connected IDs.
* `user-online` / `user-offline`: Broadcasts status updates of contacts.
* `typing` / `stop-typing`: Relays keyboard statuses.
* `new-message`: Relays new message bubbles.
* `message-notification`: Rings playbacks on background messages.
* `message-delivered`: Confirms message delivery receipt from recipient client.
* `message-edited` / `message-deleted`: Dispatches updates across threads.
* `message-reaction`: Updates emoji lists.
* `message-seen`: Resets unread maps and updates read tick status.

---

## Getting Started Locally

### Setup
Ensure Node.js is installed. Run the workspace installation script from the root:
```bash
npm run install:all
```
This automatically installs the backend packages and frontend peer-dependencies.

### Run Regression & Security Tests
Run the comprehensive CORS, cookie, and search regex security test suite:
```bash
npm test
```

### Run Development Servers
Start both backend & frontend concurrently with:
```bash
npm run dev
```
The backend will launch on `http://localhost:5000` and the frontend will open on `http://localhost:5173`.

---

## Deployment Guide

### Database (MongoDB Atlas)
1. Register on MongoDB Atlas and spawn a free Shared Cluster.
2. Under **Network Access**, allow IP access `0.0.0.0/0` (or Render's outbound IPs).
3. Under **Database Access**, create a user with read/write privileges.
4. Copy the connection string and insert credentials into backend `MONGODB_URI`.

### Backend (Render)
1. Create a Web Service linked to your GitHub repository.
2. Root directory: `backend`
3. Build command: `npm install`
4. Start command: `node server.js`
5. Navigate to **Environment** and copy all items in the `.env` file (e.g. `MONGODB_URI`, `JWT_SECRET`, etc.). Set `NODE_ENV` to `production` and update `FRONTEND_URL` to your production URL.

### Frontend (Vercel)
1. Add a new project on Vercel importing your repository.
2. Root directory: `frontend`
3. Framework preset: `Vite`
4. Set build command: `npm run build`
5. Build output: `dist`
6. Add Environment Variable `VITE_BACKEND_URL` pointing to your Render server (e.g., `https://your-app.onrender.com/api`).
7. Deploy!
