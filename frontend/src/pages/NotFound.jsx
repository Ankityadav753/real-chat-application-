import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export const NotFound = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-dark-600 text-slate-800 dark:text-white">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center p-8 rounded-3xl glass-card shadow-lg"
      >
        <h1 className="text-8xl font-black text-sky-500 mb-2">404</h1>
        <h2 className="text-2xl font-bold mb-4">Page Not Found</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          The link you followed may be broken, or the page may have been removed. Let's get you back to your chats!
        </p>
        <Link
          to="/dashboard"
          className="bg-sky-500 hover:bg-sky-600 text-white font-semibold px-6 py-2.5 rounded-xl shadow-md transition"
        >
          Go to Dashboard
        </Link>
      </motion.div>
    </div>
  );
};
export default NotFound;
