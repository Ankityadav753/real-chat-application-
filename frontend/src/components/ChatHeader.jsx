import React, { useState } from 'react';
import { IoChevronBack, IoInformationCircleOutline, IoPinOutline, IoPin } from 'react-icons/io5';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { GroupModal } from './GroupModal';

export const ChatHeader = () => {
  const { user: currentUser } = useAuthStore();
  const {
    selectedConversation,
    setSelectedConversation,
    onlineUsers,
    typingUsers,
    togglePinConversation,
    conversations,
  } = useChatStore();

  const [isGroupEditOpen, setIsGroupEditOpen] = useState(false);

  if (!selectedConversation) return null;

  const isGroup = selectedConversation.isGroup;
  
  // Find current state of conversation in list to check for pin updates
  const currentConvInStore = conversations.find(c => c._id === selectedConversation._id) || selectedConversation;
  const currentUserId = currentUser?._id || localStorage.getItem('userId');
  const isPinned = Boolean(
    currentUserId &&
    currentConvInStore.pinnedBy?.some(
      (pId) => (pId?._id || pId || '').toString() === currentUserId.toString()
    )
  );

  // 1-to-1 info
  const otherParticipant = isGroup
    ? null
    : selectedConversation.participants.find((p) => (p?._id || p || '').toString() !== (currentUser?._id || '').toString());

  const otherParticipantId = (otherParticipant?._id || '').toString();
  const isOnline = Boolean(
    otherParticipantId &&
    onlineUsers.some((uId) => (uId?._id || uId || '').toString() === otherParticipantId)
  );

  const title = isGroup ? selectedConversation.groupName : otherParticipant?.name;
  const avatar = isGroup ? selectedConversation.groupAvatar : otherParticipant?.profilePic;

  // Typing indicators
  const typers = typingUsers[selectedConversation._id] || [];
  const isTyping = typers.length > 0;

  const getSubTitle = () => {
    if (isTyping) {
      return `${typers.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing...`;
    }

    if (isGroup) {
      const names = selectedConversation.participants.map((p) => p.name.split(' ')[0]).join(', ');
      return `${selectedConversation.participants.length} members: ${names}`;
    }

    if (isOnline) {
      return 'Active now';
    }

    if (otherParticipant?.lastSeen) {
      const lastSeenDate = new Date(otherParticipant.lastSeen);
      return `Last seen ${lastSeenDate.toLocaleDateString()} at ${lastSeenDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }

    return 'Offline';
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-dark-300 bg-white/80 dark:bg-dark-200/80 backdrop-blur-md z-10">
      {/* Participant / Back button */}
      <div className="flex items-center space-x-3 min-w-0">
        <button
          onClick={() => setSelectedConversation(null)}
          className="md:hidden p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-300 text-slate-600 dark:text-slate-300"
        >
          <IoChevronBack size={20} />
        </button>

        <div className="relative cursor-pointer flex-shrink-0" onClick={() => isGroup && setIsGroupEditOpen(true)}>
          <img
            src={avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${title || 'Group'}`}
            alt="avatar"
            className="w-10 h-10 rounded-full object-cover border border-slate-100 dark:border-dark-300"
          />
          {!isGroup && isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-dark-200"></span>
          )}
        </div>

        <div className="text-left min-w-0">
          <h4
            onClick={() => isGroup && setIsGroupEditOpen(true)}
            className={`text-sm font-bold text-slate-800 dark:text-white truncate ${
              isGroup ? 'hover:text-sky-500 cursor-pointer' : ''
            }`}
          >
            {title}
          </h4>
          <p
            className={`text-xs truncate ${
              isTyping ? 'text-green-500 font-semibold pulse-slow' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {getSubTitle()}
          </p>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center space-x-1">
        {/* Toggle Pin */}
        <button
          onClick={() => togglePinConversation(selectedConversation._id)}
          className={`p-2 rounded-xl transition ${
            isPinned
              ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/20'
              : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-dark-300'
          }`}
          title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
        >
          {isPinned ? <IoPin size={18} /> : <IoPinOutline size={18} />}
        </button>

        {/* Group Info panel */}
        {isGroup && (
          <button
            onClick={() => setIsGroupEditOpen(true)}
            className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-dark-300 transition"
            title="Group info"
          >
            <IoInformationCircleOutline size={20} />
          </button>
        )}
      </div>

      {/* Group Detail Modal */}
      {isGroup && (
        <GroupModal
          isOpen={isGroupEditOpen}
          onClose={() => setIsGroupEditOpen(false)}
          editConversation={selectedConversation}
        />
      )}
    </div>
  );
};
export default ChatHeader;
