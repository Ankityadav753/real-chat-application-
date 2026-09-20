import React, { useState, useEffect } from 'react';
import {
  IoSearch,
  IoLogOutOutline,
  IoAddCircleOutline,
  IoMoonOutline,
  IoSunnyOutline,
} from 'react-icons/io5';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useDebounce } from '../hooks/useDebounce';
import axiosInstance from '../utils/axios';
import { GroupModal } from './GroupModal';
import { ProfileModal } from './ProfileModal';

export const Sidebar = () => {
  const { user, logout, theme, setTheme } = useAuthStore();
  const {
    conversations,
    getConversations,
    selectedConversation,
    setSelectedConversation,
    onlineUsers,
    typingUsers,
  } = useChatStore();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Modal states
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Load active chats on load
  useEffect(() => {
    getConversations();
  }, []);

  // Search new users from DB
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearch.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const res = await axiosInstance.get(`/users?search=${encodeURIComponent(debouncedSearch.trim())}`);
        setSearchResults(res.data.users);
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsSearching(false);
      }
    };
    performSearch();
  }, [debouncedSearch]);

  const handleStartChat = async (participantId) => {
    try {
      const res = await axiosInstance.post('/conversations', { participantId });
      // Clear search
      setSearch('');
      // Set active chat
      setSelectedConversation(res.data.conversation);
      // Refresh chats list
      getConversations();
    } catch (err) {
      console.error('Error starting conversation:', err);
    }
  };

  // Filter active chats locally by search term
  const filteredConversations = conversations.filter((c) => {
    if (c.isGroup) {
      return c.groupName.toLowerCase().includes(search.toLowerCase());
    } else {
      const otherParticipant = c.participants.find((p) => p._id !== user?._id);
      return (
        otherParticipant?.name.toLowerCase().includes(search.toLowerCase()) ||
        otherParticipant?.username.toLowerCase().includes(search.toLowerCase())
      );
    }
  });

  return (
    <div
      className={`h-full w-full md:w-80 flex flex-col bg-white dark:bg-dark-400 border-r border-slate-100 dark:border-dark-300 transition-all ${
        selectedConversation ? 'hidden md:flex' : 'flex'
      }`}
    >
      {/* Sidebar Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-dark-300">
        <div
          onClick={() => setIsProfileOpen(true)}
          className="flex items-center space-x-2.5 cursor-pointer group"
        >
          <div className="relative">
            <img
              src={user?.profilePic || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.name}`}
              alt="Avatar"
              className="w-10 h-10 rounded-full object-cover border-2 border-transparent group-hover:border-sky-500 transition-all"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-dark-400"></span>
          </div>
          <div className="text-left">
            <h4 className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-sky-500 transition-colors truncate max-w-[120px]">
              {user?.name}
            </h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[120px]">@{user?.username}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* Theme switcher */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-300 transition"
            title="Toggle theme"
          >
            {theme === 'dark' ? <IoSunnyOutline size={20} /> : <IoMoonOutline size={20} />}
          </button>

          {/* New Group */}
          <button
            onClick={() => setIsGroupOpen(true)}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-300 transition"
            title="Create group"
          >
            <IoAddCircleOutline size={20} />
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
            title="Logout"
          >
            <IoLogOutOutline size={20} />
          </button>
        </div>
      </div>

      {/* Online Users List */}
      {onlineUsers.length > 1 && (
        <div className="py-3 border-b border-slate-100 dark:border-dark-300 bg-slate-50/50 dark:bg-dark-500/10">
          <p className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase px-4 mb-2">
            Online Now
          </p>
          <div className="flex items-center space-x-3 overflow-x-auto px-4 no-scrollbar">
            {conversations
              .filter((c) => !c.isGroup)
              .map((c) => {
                const other = c.participants.find((p) => p._id !== user?._id);
                const isOnline = other ? onlineUsers.includes(other._id) : false;
                if (!isOnline || !other) return null;

                return (
                  <div
                    key={c._id}
                    onClick={() => setSelectedConversation(c)}
                    className="flex flex-col items-center flex-shrink-0 cursor-pointer group"
                  >
                    <div className="relative">
                      <img
                        src={other.profilePic || `https://api.dicebear.com/7.x/initials/svg?seed=${other.name}`}
                        alt="avatar"
                        className="w-10 h-10 rounded-full border-2 border-transparent group-hover:border-sky-500 transition-all object-cover"
                      />
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-dark-500"></span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1 truncate max-w-[50px]">
                      {other.name.split(' ')[0]}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="p-3">
        <div className="relative flex items-center bg-slate-100 dark:bg-dark-300 rounded-xl px-3 py-2 text-slate-500 dark:text-slate-400">
          <IoSearch size={18} className="mr-2 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search conversations or users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            className="w-full bg-transparent text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* Render Search Results if searching */}
        {search.trim() ? (
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase px-4 py-2 bg-slate-50 dark:bg-dark-500/10">
              {isSearching ? 'Searching...' : `Search Results (${searchResults.length + filteredConversations.length})`}
            </p>

            {/* Global Directory Results */}
            {searchResults.length > 0 && (
              <div className="divide-y divide-slate-50 dark:divide-dark-300/50">
                {searchResults.map((u) => (
                  <div
                    key={u._id}
                    onClick={() => handleStartChat(u._id)}
                    className="flex items-center space-x-3 p-3 hover:bg-slate-50 dark:hover:bg-dark-300 cursor-pointer transition-colors"
                  >
                    <img
                      src={u.profilePic || `https://api.dicebear.com/7.x/initials/svg?seed=${u.name}`}
                      alt="avatar"
                      className="w-11 h-11 rounded-full object-cover"
                    />
                    <div className="text-left">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{u.name}</h4>
                      <p className="text-xs text-slate-400">@{u.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active chat filter results */}
            <div className="divide-y divide-slate-50 dark:divide-dark-300/50">
              {filteredConversations.map((c) => {
                const isSelected = selectedConversation?._id === c._id;
                const displayTitle = c.isGroup
                  ? c.groupName
                  : c.participants.find((p) => p._id !== user?._id)?.name;
                const displayAvatar = c.isGroup
                  ? c.groupAvatar || ''
                  : c.participants.find((p) => p._id !== user?._id)?.profilePic;

                return (
                  <div
                    key={c._id}
                    onClick={() => setSelectedConversation(c)}
                    className={`flex items-center space-x-3 p-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-sky-50 dark:bg-sky-950/20' : 'hover:bg-slate-50 dark:hover:bg-dark-300'
                    }`}
                  >
                    <img
                      src={
                        displayAvatar ||
                        `https://api.dicebear.com/7.x/initials/svg?seed=${displayTitle || 'Group'}`
                      }
                      alt="avatar"
                      className="w-11 h-11 rounded-full object-cover"
                    />
                    <div className="text-left flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                        {displayTitle}
                      </h4>
                      <p className="text-xs text-sky-500 font-medium truncate">Already chatting</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {searchResults.length === 0 && filteredConversations.length === 0 && !isSearching && (
              <p className="text-center text-xs text-slate-400 py-6">No users or chats found</p>
            )}
          </div>
        ) : (
          /* Normal Conversations List */
          <div className="divide-y divide-slate-50 dark:divide-dark-300/30">
            {conversations.map((c) => {
              const isSelected = selectedConversation?._id === c._id;
              const otherParticipant = c.isGroup
                ? null
                : c.participants.find((p) => (p?._id || p || '').toString() !== (user?._id || '').toString());

              const otherParticipantId = (otherParticipant?._id || '').toString();
              const isOnline = Boolean(
                otherParticipantId &&
                onlineUsers.some((uId) => (uId?._id || uId || '').toString() === otherParticipantId)
              );

              const displayTitle = c.isGroup ? c.groupName : otherParticipant?.name;
              const displayAvatar = c.isGroup ? c.groupAvatar : otherParticipant?.profilePic;

              const unreadCount = c.unreadCounts?.[user?._id] || 0;
              const isPinned = c.pinnedBy?.includes(user?._id);

              // Check if someone is typing
              const typers = typingUsers[c._id] || [];
              const isTyping = typers.length > 0;

              return (
                <div
                  key={c._id}
                  onClick={() => setSelectedConversation(c)}
                  className={`flex items-center justify-between p-3.5 cursor-pointer border-l-4 transition-all ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-sky-950/20 border-sky-500'
                      : 'hover:bg-slate-50 dark:hover:bg-dark-300 border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="relative flex-shrink-0">
                      <img
                        src={
                          displayAvatar ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${displayTitle || 'Group'}`
                        }
                        alt="avatar"
                        className="w-12 h-12 rounded-full object-cover border border-slate-100 dark:border-dark-300"
                      />
                      {!c.isGroup && isOnline && (
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-dark-400"></span>
                      )}
                    </div>

                    <div className="text-left flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate mr-2">
                          {displayTitle}
                        </h4>
                        {c.lastMessage && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                            {new Date(c.lastMessage.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        {isTyping ? (
                          <span className="text-xs text-green-500 font-medium pulse-slow">
                            typing...
                          </span>
                        ) : (
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate flex-1 pr-2">
                            {c.lastMessage
                              ? c.lastMessage.isDeleted
                                ? '🗑️ Message was deleted'
                                : c.lastMessage.text || '📷 Attachment'
                              : 'No messages yet'}
                          </p>
                        )}

                        <div className="flex items-center space-x-1.5 flex-shrink-0">
                          {isPinned && <span className="text-[10px] text-slate-400">📌</span>}
                          {unreadCount > 0 && (
                            <span className="flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-sky-500 text-[10px] font-bold text-white shadow shadow-sky-500/20">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 h-64">
                <p className="text-sm mb-1">No chats yet</p>
                <p className="text-xs text-slate-500">Search for users above to start a conversation!</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <GroupModal isOpen={isGroupOpen} onClose={() => setIsGroupOpen(false)} />
      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </div>
  );
};
export default Sidebar;
