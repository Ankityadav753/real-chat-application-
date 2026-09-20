import React from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';

export const Login = () => {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async (data) => {
    const success = await login(data);
    if (success) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-dark-600 text-slate-800 dark:text-white relative overflow-hidden">
      {/* Glowing background circles */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-sky-400/20 dark:bg-sky-500/10 blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-indigo-400/20 dark:bg-indigo-500/10 blur-3xl"></div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md p-8 rounded-3xl glass shadow-2xl z-10 text-center"
      >
        <h2 className="text-3xl font-extrabold mb-2">Welcome Back</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
          Sign in to access your secure chat dashboard
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left">
          {/* Email or Username */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Username or Email</label>
            <input
              type="text"
              placeholder="Enter username or email"
              {...register('loginIdentifier', { required: 'Email or username is required' })}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
            />
            {errors.loginIdentifier && (
              <p className="text-[10px] text-red-500 font-semibold">{errors.loginIdentifier.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Password</label>
            </div>
            <input
              type="password"
              placeholder="Enter password"
              {...register('password', { required: 'Password is required' })}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
            />
            {errors.password && (
              <p className="text-[10px] text-red-500 font-semibold">{errors.password.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl transition duration-200 shadow-md shadow-sky-500/10 disabled:opacity-50 mt-2"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-slate-500 dark:text-slate-400 mt-6">
          New to ChitChat?{' '}
          <Link to="/register" className="text-sky-500 hover:underline font-bold">
            Create Account
          </Link>
        </p>
      </motion.div>
    </div>
  );
};
export default Login;
