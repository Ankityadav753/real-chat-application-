import React from 'react';

// Chat item skeleton for sidebar
export const ChatListSkeleton = () => {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-dark-300"></div>
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 bg-slate-200 dark:bg-dark-300 rounded w-3/4"></div>
            <div className="h-3 bg-slate-200 dark:bg-dark-300 rounded w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Message pane skeleton
export const MessageListSkeleton = () => {
  return (
    <div className="flex-1 space-y-6 p-6 overflow-y-auto animate-pulse flex flex-col justify-end">
      {[...Array(5)].map((_, i) => {
        const isLeft = i % 2 === 0;
        return (
          <div
            key={i}
            className={`flex items-end space-x-2.5 max-w-[70%] ${
              isLeft ? 'self-start' : 'self-end flex-row-reverse space-x-reverse'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-dark-300 flex-shrink-0"></div>
            <div className="space-y-2">
              <div
                className={`h-10 rounded-2xl w-48 bg-slate-200 dark:bg-dark-300 ${
                  isLeft ? 'rounded-bl-none' : 'rounded-br-none'
                }`}
              ></div>
              <div className={`h-3 w-12 bg-slate-200 dark:bg-dark-300 rounded ${isLeft ? 'self-start' : 'self-end ml-auto'}`}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
export default ChatListSkeleton;
