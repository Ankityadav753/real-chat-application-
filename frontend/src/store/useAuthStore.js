import { create } from 'zustand';
import axiosInstance from '../utils/axios';
import toast from 'react-hot-toast';

let refreshPromise = null;
let tokenRefreshTimer = null;
const PROACTIVE_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes (safely within 15m access token lifetime)

const startTokenRefreshTimer = (refreshFn) => {
  if (tokenRefreshTimer) clearInterval(tokenRefreshTimer);
  tokenRefreshTimer = setInterval(() => {
    refreshFn();
  }, PROACTIVE_REFRESH_INTERVAL);
};

const stopTokenRefreshTimer = () => {
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
};

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isCheckingAuth: true,
  isUpdatingProfile: false,
  theme: localStorage.getItem('chat-theme') || 'dark',

  // Initialize theme on app load
  initTheme: () => {
    const currentTheme = get().theme;
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },

  // Toggle theme
  setTheme: (newTheme) => {
    localStorage.setItem('chat-theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme: newTheme });
  },

  // Check auth
  checkAuth: async () => {
    try {
      const res = await axiosInstance.get('/auth/me');
      set({ user: res.data.user, isAuthenticated: true, isCheckingAuth: false });
      startTokenRefreshTimer(get().refreshToken);
    } catch {
      stopTokenRefreshTimer();
      set({ user: null, isAuthenticated: false, isCheckingAuth: false });
    }
  },

  // Refresh access token using existing refresh cookie (with shared-promise lock for concurrency)
  refreshToken: async () => {
    // Return existing in-flight promise if multiple callers request refresh simultaneously
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const res = await axiosInstance.post('/auth/refresh');
        if (res.data?.success && res.data?.user) {
          set({ user: res.data.user, isAuthenticated: true });
          startTokenRefreshTimer(get().refreshToken);
          return { success: true, user: res.data.user };
        }
        throw new Error('Refresh response not successful');
      } catch (error) {
        // If 404 (e.g. older backend route), fallback to /auth/me which also refreshes via protectRoute
        if (error.response?.status === 404) {
          try {
            const meRes = await axiosInstance.get('/auth/me');
            if (meRes.data?.success && meRes.data?.user) {
              set({ user: meRes.data.user, isAuthenticated: true });
              startTokenRefreshTimer(get().refreshToken);
              return { success: true, user: meRes.data.user };
            }
          } catch {
            // Fallback also failed
          }
        }

        // If refresh failed with 401 or invalid session, session is expired
        if (error.response?.status === 401) {
          stopTokenRefreshTimer();
          set({ user: null, isAuthenticated: false });
          localStorage.removeItem('userId');
        }
        return { success: false, error };
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  },

  // Register
  register: async (data) => {
    const loadingToast = toast.loading('Registering user...');
    try {
      const res = await axiosInstance.post('/auth/register', data);
      set({ user: res.data.user, isAuthenticated: true });
      startTokenRefreshTimer(get().refreshToken);
      toast.success('Registration successful!', { id: loadingToast });
      return true;
    } catch (error) {
      const message = error.response?.data?.message || error.response?.data?.errors?.[0]?.message || 'Registration failed';
      toast.error(message, { id: loadingToast });
      return false;
    }
  },

  // Login
  login: async (data) => {
    const loadingToast = toast.loading('Logging in...');
    try {
      const res = await axiosInstance.post('/auth/login', data);
      set({ user: res.data.user, isAuthenticated: true });
      startTokenRefreshTimer(get().refreshToken);
      toast.success('Welcome back!', { id: loadingToast });
      return true;
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed';
      toast.error(message, { id: loadingToast });
      return false;
    }
  },

  // Logout
  logout: async () => {
    stopTokenRefreshTimer();
    const loadingToast = toast.loading('Logging out...');
    try {
      await axiosInstance.post('/auth/logout');
    } catch {
      // Proceed with local logout regardless of network failure
    } finally {
      set({ user: null, isAuthenticated: false });
      localStorage.removeItem('userId');
      toast.success('Logged out successfully', { id: loadingToast });
    }
  },

  // Update profile details and avatar
  updateProfile: async (formData) => {
    set({ isUpdatingProfile: true });
    const loadingToast = toast.loading('Updating profile...');
    try {
      const res = await axiosInstance.put('/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set({ user: res.data.user, isUpdatingProfile: false });
      toast.success('Profile updated successfully!', { id: loadingToast });
      return true;
    } catch (error) {
      set({ isUpdatingProfile: false });
      const message = error.response?.data?.message || 'Failed to update profile';
      toast.error(message, { id: loadingToast });
      return false;
    }
  },

  // Update Password
  updatePassword: async (passwords) => {
    const loadingToast = toast.loading('Updating password...');
    try {
      await axiosInstance.put('/users/password', passwords);
      toast.success('Password updated successfully!', { id: loadingToast });
      return true;
    } catch (error) {
      const message = error.response?.data?.message || error.response?.data?.errors?.[0]?.message || 'Failed to update password';
      toast.error(message, { id: loadingToast });
      return false;
    }
  },
}));
