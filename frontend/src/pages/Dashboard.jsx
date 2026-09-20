import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { ChatHeader } from '../components/ChatHeader';
import { ChatMessages } from '../components/ChatMessages';
import { ChatInput } from '../components/ChatInput';
import { EmptyState } from '../components/EmptyState';
import { useChatStore } from '../store/useChatStore';

export const Dashboard = () => {
  const { selectedConversation } = useChatStore();

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-slate-100 dark:bg-dark-600">
      {/* Sidebar - hides on mobile when a chat is selected */}
      <Sidebar />

      {/* Chat Window Panel - hides on mobile when no chat is selected */}
      <div
        className={`flex-1 h-full flex flex-col min-w-0 ${
          !selectedConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selectedConversation ? (
          <>
            <ChatHeader />
            <ChatMessages />
            <ChatInput />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
};
export default Dashboard;
