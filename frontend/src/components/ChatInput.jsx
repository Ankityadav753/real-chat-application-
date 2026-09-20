import React, { useState, useRef, useEffect } from 'react';
import { IoPaperPlane, IoHappyOutline, IoAttachOutline, IoMicOutline, IoClose } from 'react-icons/io5';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSocket } from '../context/SocketContext';
import { VoiceRecorder } from './VoiceRecorder';

const COMMON_EMOJIS = ['😀', '😂', '😊', '😍', '😘', '😜', '😎', '😭', '😡', '👍', '👎', '👏', '🔥', '🎉', '🚀', '❤️', '💔', '✨'];

export const ChatInput = () => {
  const socket = useSocket();
  const { user } = useAuthStore();
  const { selectedConversation, sendMessage, replyingToMessage, setReplyingToMessage } = useChatStore();

  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingConvIdRef = useRef(null);

  // Clear states when active conversation changes
  useEffect(() => {
    setText('');
    setAttachments([]);
    setAttachmentPreviews([]);
    setIsRecording(false);
    setShowEmojiPicker(false);
    setReplyingToMessage(null);

    // Stop typing for the previous conversation if user was actively typing
    if (isTyping && socket && typingConvIdRef.current) {
      socket.emit('stop-typing', {
        conversationId: typingConvIdRef.current,
        username: user?.username,
      });
      setIsTyping(false);
      typingConvIdRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [selectedConversation?._id]);

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (socket && typingConvIdRef.current) {
        socket.emit('stop-typing', {
          conversationId: typingConvIdRef.current,
          username: user?.username,
        });
      }
    };
  }, [socket, user?.username]);

  // Handle typing indicators
  const handleInputChange = (e) => {
    setText(e.target.value);

    if (!socket || !selectedConversation) return;

    if (!isTyping) {
      setIsTyping(true);
      typingConvIdRef.current = selectedConversation._id;
      socket.emit('typing', {
        conversationId: selectedConversation._id,
        username: user?.username,
      });
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      if (typingConvIdRef.current) {
        socket.emit('stop-typing', {
          conversationId: typingConvIdRef.current,
          username: user?.username,
        });
        typingConvIdRef.current = null;
      }
      setIsTyping(false);
    }, 2000);
  };

  const handleEmojiClick = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Limit to max 5 attachments
    const newAttachments = [...attachments, ...files].slice(0, 5);
    setAttachments(newAttachments);

    const newPreviews = newAttachments.map((file) => {
      if (file.type.startsWith('image/')) {
        return { type: 'image', url: URL.createObjectURL(file), name: file.name };
      } else if (file.type.startsWith('video/')) {
        return { type: 'video', url: URL.createObjectURL(file), name: file.name };
      } else {
        return { type: 'file', url: null, name: file.name };
      }
    });
    setAttachmentPreviews(newPreviews);
  };

  const removeAttachment = (index) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    setAttachments(newAttachments);

    // Revoke URL to prevent memory leaks
    if (attachmentPreviews[index]?.url) {
      URL.revokeObjectURL(attachmentPreviews[index].url);
    }
    setAttachmentPreviews(attachmentPreviews.filter((_, i) => i !== index));
  };

  const handleSendVoiceNote = async (audioFile) => {
    const formData = new FormData();
    formData.append('conversationId', selectedConversation._id);
    formData.append('attachments', audioFile); // Send voice note as file attachment
    
    await sendMessage(formData);
    setIsRecording(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && attachments.length === 0) return;

    const formData = new FormData();
    formData.append('conversationId', selectedConversation._id);
    formData.append('text', text);

    if (replyingToMessage) {
      formData.append('replyTo', replyingToMessage._id);
    }

    attachments.forEach((file) => {
      formData.append('attachments', file);
    });

    // Clear inputs locally first (optimistic UI flow inside store handles adding placeholder)
    setText('');
    setAttachments([]);
    setAttachmentPreviews([]);
    setReplyingToMessage(null);

    // Stop typing immediately on send
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (socket && selectedConversation) {
      socket.emit('stop-typing', {
        conversationId: selectedConversation._id,
        username: user?.username,
      });
      setIsTyping(false);
      typingConvIdRef.current = null;
    }

    await sendMessage(formData);
  };

  return (
    <div className="p-3 border-t border-slate-100 dark:border-dark-300 bg-white dark:bg-dark-200">
      {/* Reply Preview Header */}
      {replyingToMessage && (
        <div className="flex items-center justify-between bg-slate-50 dark:bg-dark-300 p-2.5 rounded-xl mb-2.5 border-l-4 border-sky-500 text-xs">
          <div className="text-left truncate">
            <span className="font-bold text-sky-500">Replying to {replyingToMessage.senderId.name}</span>
            <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {replyingToMessage.text || '📷 Attachment'}
            </p>
          </div>
          <button
            onClick={() => setReplyingToMessage(null)}
            className="text-slate-400 hover:text-slate-600 rounded-full p-1"
          >
            <IoClose size={16} />
          </button>
        </div>
      )}

      {/* Attachment Previews row */}
      {attachmentPreviews.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mb-2.5 p-2 bg-slate-50 dark:bg-dark-300 rounded-xl">
          {attachmentPreviews.map((preview, index) => (
            <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-dark-400 bg-slate-100 dark:bg-dark-400 flex items-center justify-center">
              {preview.type === 'image' ? (
                <img src={preview.url} alt="preview" className="w-full h-full object-cover" />
              ) : preview.type === 'video' ? (
                <video src={preview.url} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-bold text-center px-1 truncate max-w-full text-slate-500">
                  📄 {preview.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5"
              >
                <IoClose size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recording Pane OR Input form */}
      {isRecording ? (
        <VoiceRecorder onSend={handleSendVoiceNote} onCancel={() => setIsRecording(false)} />
      ) : (
        <form onSubmit={handleSubmit} className="flex items-center space-x-2 relative">
          {/* Emojis & Attachments group */}
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2.5 rounded-full transition ${
                showEmojiPicker
                  ? 'text-sky-500 bg-sky-50 dark:bg-sky-950/20'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-300'
              }`}
              title="Emoji"
            >
              <IoHappyOutline size={22} />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-300 transition"
              title="Attach File"
            >
              <IoAttachOutline size={22} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept="image/*,video/*,application/pdf"
              className="hidden"
            />
          </div>

          {/* Emoji Picker Popover */}
          {showEmojiPicker && (
            <div className="absolute bottom-14 left-2 z-20 grid grid-cols-6 gap-2 p-3 bg-white dark:bg-dark-300 rounded-2xl shadow-xl border border-slate-100 dark:border-dark-400">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="text-xl p-1.5 hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Input field */}
          <input
            type="text"
            value={text}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 rounded-full border border-slate-200 dark:border-dark-300 px-4 py-2.5 bg-slate-50/50 dark:bg-dark-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 dark:text-white"
          />

          {/* Action buttons */}
          <div className="flex items-center">
            {text.trim() || attachments.length > 0 ? (
              <button
                type="submit"
                className="p-2.5 rounded-full bg-sky-500 text-white hover:bg-sky-600 transition shadow hover:shadow-sky-500/20"
              >
                <IoPaperPlane size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsRecording(true)}
                className="p-2.5 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-300 transition"
                title="Record audio"
              >
                <IoMicOutline size={22} />
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
export default ChatInput;
