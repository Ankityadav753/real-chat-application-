import React from 'react';
import { motion } from 'framer-motion';
import { BsChatDots } from 'react-icons/bs';
import { useAuthStore } from '../store/useAuthStore';

export const EmptyState = () => {
  const { user } = useAuthStore();

  return (
    <div className="flex flex-col items-center justify-center flex-1 h-full p-8 text-center bg-slate-50 dark:bg-dark-600">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-md p-8 rounded-3xl glass-card flex flex-col items-center shadow-xl"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="flex items-center justify-center w-24 h-24 mb-6 text-white rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 shadow-lg shadow-sky-400/25 dark:shadow-sky-500/10"
        >
          <BsChatDots size={44} />
        </motion.div>

        <h2 className="mb-2 text-2xl font-bold text-slate-800 dark:text-white">
          Welcome, {user?.name || 'Friend'}!
        </h2>
        
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          Search for friends in the sidebar directory to start chatting, or form groups to talk with multiple contacts in real-time.
        </p>

        <div className="flex gap-2 text-xs font-semibold px-4 py-2 rounded-full bg-slate-100 dark:bg-dark-300 text-slate-600 dark:text-slate-300">
          <span>🔒 End-to-end encrypted</span>
          <span>•</span>
          <span>⚡ Realtime sync</span>
        </div>
      </motion.div>
    </div>
  );
};
export default EmptyState;
