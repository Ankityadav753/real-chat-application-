import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoCamera } from 'react-icons/io5';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

export const ProfileModal = ({ isOpen, onClose }) => {
  const { user, updateProfile, updatePassword, isUpdatingProfile } = useAuthStore();
  
  // Profile state
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [activeTab, setActiveTab] = useState('profile'); // profile, password

  useEffect(() => {
    if (user && isOpen) {
      setName(user.name || '');
      setUsername(user.username || '');
      setBio(user.bio || '');
      setAvatarPreview(user.profilePic || '');
      setAvatarFile(null);
      
      // Reset password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveTab('profile');
    }
  }, [user, isOpen]);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) {
      return toast.error('Name and username are required');
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('username', username);
    formData.append('bio', bio);
    if (avatarFile) {
      formData.append('profilePic', avatarFile);
    }

    const success = await updateProfile(formData);
    if (success) onClose();
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      return toast.error('All password fields are required');
    }
    if (newPassword !== confirmPassword) {
      return toast.error('New passwords do not match');
    }
    if (newPassword.length < 8) {
      return toast.error('New password must be at least 8 characters');
    }

    const success = await updatePassword({ currentPassword, newPassword });
    if (success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-dark-200 text-slate-800 dark:text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-dark-300">
            <h3 className="text-xl font-bold">Settings</h3>
            <button
              onClick={onClose}
              className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-dark-300"
            >
              <IoClose size={24} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100 dark:border-dark-300 text-sm font-semibold">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 py-3 text-center border-b-2 transition-all ${
                activeTab === 'profile' ? 'border-sky-500 text-sky-500' : 'border-transparent'
              }`}
            >
              Edit Profile
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`flex-1 py-3 text-center border-b-2 transition-all ${
                activeTab === 'password' ? 'border-sky-500 text-sky-500' : 'border-transparent'
              }`}
            >
              Security
            </button>
          </div>

          {/* Form */}
          <div className="p-6">
            {activeTab === 'profile' ? (
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                {/* Avatar upload */}
                <div className="flex flex-col items-center">
                  <div className="relative group cursor-pointer w-24 h-24 rounded-full overflow-hidden border-2 border-slate-200 dark:border-dark-300 bg-slate-100 dark:bg-dark-300">
                    <img
                      src={avatarPreview || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.name}`}
                      alt="profile avatar"
                      className="w-full h-full object-cover"
                    />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <IoCamera className="text-white" size={24} />
                      <input type="file" onChange={handleAvatarChange} accept="image/*" className="hidden" />
                    </label>
                  </div>
                  <span className="text-xs text-slate-400 mt-2">Change Avatar</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Bio</label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-dark-300">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-dark-400 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Current Password</label>
                  <input
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">New Password</label>
                  <input
                    type="password"
                    placeholder="Min 8 chars (upper, lower, digit, symbol)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Confirm New Password</label>
                  <input
                    type="password"
                    placeholder="Verify new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
                  />
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-dark-300">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-dark-400 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition"
                  >
                    Update Password
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
export default ProfileModal;
