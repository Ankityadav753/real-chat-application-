import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BsChatSquareHeart } from 'react-icons/bs';

export const LandingPage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-dark-600 text-slate-800 dark:text-white relative overflow-hidden">
      {/* Background glowing blobs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-sky-400/20 dark:bg-sky-500/10 blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-indigo-400/20 dark:bg-indigo-500/10 blur-3xl"></div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl text-center z-10 space-y-8"
      >
        {/* App Logo */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-sky-500/20">
            <BsChatSquareHeart size={38} />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            Connect Instantly with{' '}
            <span className="bg-gradient-to-r from-sky-400 to-indigo-500 bg-clip-text text-transparent">
              ChitChat
            </span>
          </h1>
          <p className="text-base md:text-lg text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
            A real-time communication platform featuring rich file sharing, voice notes, reaction emojis, and secure end-to-end synced group chats.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <Link
            to="/register"
            className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white font-bold px-8 py-3 rounded-2xl shadow-lg shadow-sky-500/25 transition duration-200"
          >
            Create Account
          </Link>
          <Link
            to="/login"
            className="w-full sm:w-auto bg-slate-200 hover:bg-slate-300 dark:bg-dark-300 dark:hover:bg-dark-200 text-slate-800 dark:text-white font-bold px-8 py-3 rounded-2xl transition duration-200 border border-slate-300 dark:border-dark-400"
          >
            Sign In
          </Link>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 pt-10 border-t border-slate-200 dark:border-dark-300 max-w-md mx-auto">
          <div>
            <h3 className="text-2xl font-bold text-sky-500">⚡</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Real-Time</p>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-indigo-500">🔒</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Secure</p>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-teal-500">📂</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">File Sharing</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
export default LandingPage;
