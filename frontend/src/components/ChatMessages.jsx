import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSocket } from '../context/SocketContext';
import {
  IoCheckmark,
  IoCheckmarkDone,
  IoStar,
  IoArrowRedoOutline,
  IoCreateOutline,
  IoTrashOutline,
} from 'react-icons/io5';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const ChatMessages = () => {
  const socket = useSocket();
  const { user: currentUser } = useAuthStore();
  const {
    messages,
    selectedConversation,
    getMessages,
    nextCursor,
    isLoadMoreLoading,
    editMessage,
    deleteMessage,
    reactToMessage,
    toggleStarMessage,
    setReplyingToMessage,
  } = useChatStore();

  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');

  const messagesEndRef = useRef(null);
  const loadMoreRef = useRef(null);
  const containerRef = useRef(null);

  // Mark conversation messages as read when user scrolls/views messages
  useEffect(() => {
    if (socket && selectedConversation) {
      socket.emit('message-seen', { conversationId: selectedConversation._id });
    }
  }, [selectedConversation, messages.length, socket]);

  // Scroll to bottom on initial load or new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?._id]);

  useEffect(() => {
    // If a new message comes and the user is scrolled near bottom, auto scroll
    const container = containerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  // IntersectionObserver for Infinite Scroll (scrolling up loads older messages)
  useEffect(() => {
    if (!loadMoreRef.current || !nextCursor || isLoadMoreLoading || !selectedConversation) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting) {
          const currentHeight = containerRef.current.scrollHeight;
          const currentScroll = containerRef.current.scrollTop;

          await getMessages(selectedConversation._id, true);

          // Restore scroll position after loading older messages
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight - currentHeight + currentScroll;
            }
          }, 50);
        }
      },
      { threshold: 1.0 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [nextCursor, isLoadMoreLoading, selectedConversation]);

  const handleStartEdit = (message) => {
    setEditingMessageId(message._id);
    setEditText(message.text);
    setHoveredMessageId(null);
  };

  const handleSaveEdit = async (messageId) => {
    if (!editText.trim()) return;
    await editMessage(messageId, editText);
    setEditingMessageId(null);
  };

  // Render attachment depending on type with stable deterministic key
  const renderAttachment = (att, msgId) => {
    const stableKey =
      att?._id ||
      att?.id ||
      att?.publicId ||
      (att?.url ? `${msgId}_att_${att.url}` : null) ||
      `${msgId}_att_${att?.name || 'file'}`;

    if (att.type === 'image') {
      return (
        <a href={att.url} target="_blank" rel="noopener noreferrer" key={stableKey} className="block mt-1 max-w-xs overflow-hidden rounded-xl border border-black/5 dark:border-white/5 shadow-sm">
          <img src={att.url} alt="attachment" className="hover:scale-105 transition duration-200 max-h-60 w-full object-cover" />
        </a>
      );
    } else if (att.type === 'video') {
      return (
        <video src={att.url} controls key={stableKey} className="mt-1 max-h-60 max-w-xs rounded-xl border border-black/5 dark:border-white/5 shadow-sm focus:outline-none" />
      );
    } else {
      // Audio or PDF/File.
      // Voice notes are sent as .webm audio files. Render an audio controller!
      const isVoiceNote = att.url.endsWith('.webm') || att.url.includes('voice_note') || att.url.includes('audio');
      if (isVoiceNote) {
        return (
          <audio src={att.url} controls key={stableKey} className="mt-1 h-8 max-w-[240px] focus:outline-none" />
        );
      }
      // PDF or general file
      return (
        <a
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          key={stableKey}
          className="flex items-center space-x-2.5 mt-1 p-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl text-xs font-semibold max-w-xs truncate"
        >
          <span className="text-xl">📄</span>
          <span className="truncate flex-1 text-sky-500 hover:underline">{att.publicId || 'Download File'}</span>
        </a>
      );
    }
  };

  // Render message status checkmarks (WhatsApp style)
  const renderCheckmarks = (msg) => {
    const currentUid = (currentUser?._id || localStorage.getItem('userId') || '').toString();
    const senderUid = (msg.senderId?._id || msg.senderId || '').toString();
    const isSelf = senderUid === currentUid;

    if (!isSelf) return null;

    if (msg.isSending) {
      return <IoCheckmark className="text-slate-300 opacity-60" size={16} title="Sending..." />;
    }

    const seenByList = msg.seenBy || [];
    const deliveredToList = msg.deliveredTo || [];

    // Check who has read/received the message besides the sender
    const isSeen = seenByList.some(
      (id) => (id?._id || id || '').toString() !== currentUid
    );
    const isDelivered = deliveredToList.some(
      (id) => (id?._id || id || '').toString() !== currentUid
    );

    if (isSeen) {
      return <IoCheckmarkDone className="text-sky-400" size={16} title="Read" />;
    }
    if (isDelivered) {
      return <IoCheckmarkDone className="text-slate-400" size={16} title="Delivered" />;
    }
    return <IoCheckmark className="text-slate-400" size={16} title="Sent" />;
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-slate-50 dark:bg-dark-600 border-b border-slate-100 dark:border-dark-300 relative no-scrollbar"
    >
      {/* Intersection trigger at the top */}
      {nextCursor && (
        <div ref={loadMoreRef} className="flex justify-center py-2">
          {isLoadMoreLoading ? (
            <span className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></span>
          ) : (
            <span className="text-[10px] text-slate-400 font-semibold">Scroll up to load more messages</span>
          )}
        </div>
      )}

      {/* Messages Bubbles list */}
      {messages.map((msg) => {
        const msgId = msg._id || msg.id;
        const userId = currentUser?._id;
        const isSelf = msg.senderId?._id === userId;
        const isHovered = hoveredMessageId === msgId;
        const isEditing = editingMessageId === msgId;
        const isStarred = msg.starredBy?.includes(userId);

        return (
          <div
            key={msgId}
            onMouseEnter={() => setHoveredMessageId(msgId)}
            onMouseLeave={() => setHoveredMessageId(null)}
            className={`flex items-end space-x-2.5 max-w-[85%] md:max-w-[70%] group transition-all duration-150 ${
              isSelf ? 'ml-auto flex-row-reverse space-x-reverse' : 'mr-auto text-left'
            }`}
          >
            {/* Participant avatar (only for others in groups) */}
            {!isSelf && selectedConversation?.isGroup && (
              <img
                src={msg.senderId.profilePic || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.senderId.name}`}
                alt="avatar"
                className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-slate-200 dark:border-dark-300 mb-1"
              />
            )}

            {/* Bubble contents */}
            <div className="flex flex-col relative">
              {/* Starred indicator */}
              {isStarred && (
                <span className={`text-[10px] text-amber-500 mb-0.5 flex items-center ${isSelf ? 'justify-end' : 'justify-start'}`}>
                  <IoStar size={10} className="mr-0.5" /> Starred
                </span>
              )}

              {/* Message bubble */}
              <div
                className={`px-3.5 py-2.5 rounded-2xl relative shadow-sm border ${
                  isSelf
                    ? 'bg-sky-500 text-white rounded-br-none border-sky-400'
                    : 'bg-white dark:bg-dark-300 text-slate-800 dark:text-slate-100 rounded-bl-none border-slate-100 dark:border-dark-300'
                }`}
              >
                {/* Sender Name in group */}
                {!isSelf && selectedConversation?.isGroup && (
                  <span className="block text-[10px] font-bold text-sky-500 mb-1">
                    {msg.senderId.name}
                  </span>
                )}

                {/* Reply display header inside bubble */}
                {msg.replyTo && (
                  <div
                    className={`p-2 rounded-lg text-xs mb-1.5 border-l-3 border-sky-400 text-left ${
                      isSelf ? 'bg-sky-600/40 text-sky-100' : 'bg-slate-100 dark:bg-dark-200 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span className="font-bold block">Replying to {msg.replyTo.senderId?.name || 'User'}</span>
                    <p className="truncate mt-0.5">{msg.replyTo.text || '📷 Attachment'}</p>
                  </div>
                )}

                {/* Edit Form */}
                {isEditing ? (
                  <div className="flex flex-col space-y-1.5 min-w-[200px]">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full text-slate-800 border-none bg-slate-100 p-1.5 rounded-lg text-sm focus:ring-0 focus:outline-none resize-none"
                      rows={2}
                    />
                    <div className="flex justify-end space-x-1.5 text-[10px] font-bold">
                      <button
                        onClick={() => setEditingMessageId(null)}
                        className="bg-slate-200 text-slate-700 px-2 py-1 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(msg._id)}
                        className="bg-sky-600 text-white px-2 py-1 rounded"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Text & Attachments Content */
                  <>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">{msg.text}</p>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="space-y-1 mt-1.5">
                        {msg.attachments.map((att) => renderAttachment(att, msgId))}
                      </div>
                    )}
                  </>
                )}

                {/* Message footer timestamp + status */}
                <div
                  className={`flex items-center space-x-1 justify-end text-[9px] mt-1.5 ${
                    isSelf ? 'text-sky-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {msg.isEdited && <span className="italic mr-0.5">edited</span>}
                  <span>
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {renderCheckmarks(msg)}
                </div>
              </div>

              {/* Reactions list under bubble */}
              {msg.reactions && msg.reactions.length > 0 && (
                <div
                  className={`flex flex-wrap gap-1 mt-1 ${
                    isSelf ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {Object.entries(
                    msg.reactions.reduce((acc, curr) => {
                      acc[curr.emoji] = (acc[curr.emoji] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([emoji, count]) => (
                    <span
                      key={`${msgId}_rx_${emoji}`}
                      onClick={() => reactToMessage(msgId, emoji)}
                      className="text-[10px] bg-slate-100 dark:bg-dark-300 rounded-full px-1.5 py-0.5 shadow-sm border border-slate-200/50 dark:border-dark-400/50 cursor-pointer hover:scale-115 transition"
                    >
                      {emoji} <span className="font-semibold text-slate-500">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Hover Actions Popover */}
            {isHovered && !isEditing && !msg.isDeleted && (
              <div
                className={`flex items-center space-x-1 px-2 py-1 rounded-full bg-white dark:bg-dark-300 shadow-md border border-slate-100 dark:border-dark-400 scale-95 transition-all duration-200 z-10 ${
                  isSelf ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                {/* Quick Reactions grid */}
                <div className="flex items-center border-r border-slate-100 dark:border-dark-400 pr-1.5 mr-1.5 space-x-1">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={`${msgId}_quick_${emoji}`}
                      onClick={() => reactToMessage(msgId, emoji)}
                      className="hover:scale-130 transition duration-150 p-0.5"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Reply */}
                <button
                  onClick={() => setReplyingToMessage(msg)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-dark-400 text-slate-500 rounded-full"
                  title="Reply"
                >
                  <IoArrowRedoOutline size={14} />
                </button>

                {/* Star */}
                <button
                  onClick={() => toggleStarMessage(msgId)}
                  className={`p-1 hover:bg-slate-100 dark:hover:bg-dark-400 rounded-full ${
                    msg.starredBy?.includes(userId) ? 'text-amber-500' : 'text-slate-500'
                  }`}
                  title="Star Message"
                >
                  <IoStar size={14} />
                </button>

                {/* Edit (self only) */}
                {isSelf && (
                  <button
                    onClick={() => handleStartEdit(msg)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-dark-400 text-slate-500 rounded-full"
                    title="Edit"
                  >
                    <IoCreateOutline size={14} />
                  </button>
                )}

                {/* Delete (self only) */}
                {isSelf && (
                  <button
                    onClick={() => deleteMessage(msgId)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-red-950/40 text-red-500 rounded-full"
                    title="Delete"
                  >
                    <IoTrashOutline size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Anchor for Auto Scroll */}
      <div ref={messagesEndRef} />
    </div>
  );
};
export default ChatMessages;
