import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoCamera } from 'react-icons/io5';
import { useChatStore } from '../store/useChatStore';
import axiosInstance from '../utils/axios';

export const GroupModal = ({ isOpen, onClose, editConversation = null }) => {
  const { createGroup, updateGroup, addGroupMembers, removeGroupMembers } = useChatStore();
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [tab, setTab] = useState('info'); // info, members

  // Fetch users for list
  useEffect(() => {
    if (isOpen) {
      const fetchUsers = async () => {
        try {
          const res = await axiosInstance.get('/users');
          setAllUsers(res.data.users);
        } catch (error) {
          console.error(error);
        }
      };
      fetchUsers();
    }
  }, [isOpen]);

  // Load existing group details for edit mode
  useEffect(() => {
    if (editConversation) {
      setGroupName(editConversation.groupName || '');
      setSelectedMembers(editConversation.participants.map((p) => p._id));
      setAvatarPreview(editConversation.groupAvatar || '');
      setTab('info');
    } else {
      setGroupName('');
      setSelectedMembers([]);
      setAvatar(null);
      setAvatarPreview('');
      setTab('info');
    }
  }, [editConversation, isOpen]);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatar(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const toggleMember = (userId) => {
    if (editConversation) {
      // In edit mode, members are added/removed through explicit button triggers
      return;
    }
    if (selectedMembers.includes(userId)) {
      setSelectedMembers(selectedMembers.filter((id) => id !== userId));
    } else {
      setSelectedMembers([...selectedMembers, userId]);
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    const formData = new FormData();
    formData.append('groupName', groupName);
    formData.append('memberIds', JSON.stringify(selectedMembers));
    if (avatar) {
      formData.append('groupAvatar', avatar);
    }
    const success = await createGroup(formData);
    if (success) onClose();
  };

  const handleUpdateInfo = async () => {
    if (!groupName.trim()) return;
    const formData = new FormData();
    formData.append('groupName', groupName);
    if (avatar) {
      formData.append('groupAvatar', avatar);
    }
    const success = await updateGroup(editConversation._id, formData);
    if (success) onClose();
  };

  const handleAddMember = async (userId) => {
    await addGroupMembers(editConversation._id, [userId]);
  };

  const handleRemoveMember = async (userId) => {
    await removeGroupMembers(editConversation._id, [userId]);
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase())
  );

  const isAdmin = editConversation
    ? editConversation.groupAdmin?.toString() === localStorage.getItem('userId') || 
      editConversation.groupAdmin?._id?.toString() === localStorage.getItem('userId')
    : true;

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
            <h3 className="text-xl font-bold">
              {editConversation ? 'Group Details' : 'Create Group Chat'}
            </h3>
            <button
              onClick={onClose}
              className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-dark-300"
            >
              <IoClose size={24} />
            </button>
          </div>

          {/* Group Tabs (Only in Edit mode) */}
          {editConversation && (
            <div className="flex border-b border-slate-100 dark:border-dark-300 text-sm font-semibold">
              <button
                onClick={() => setTab('info')}
                className={`flex-1 py-3 text-center border-b-2 transition-all ${
                  tab === 'info' ? 'border-sky-500 text-sky-500' : 'border-transparent'
                }`}
              >
                Information
              </button>
              <button
                onClick={() => setTab('members')}
                className={`flex-1 py-3 text-center border-b-2 transition-all ${
                  tab === 'members' ? 'border-sky-500 text-sky-500' : 'border-transparent'
                }`}
              >
                Members ({editConversation.participants.length})
              </button>
            </div>
          )}

          {/* Body */}
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {tab === 'info' ? (
              <div className="space-y-6">
                {/* Avatar upload */}
                <div className="flex flex-col items-center">
                  <div className="relative group cursor-pointer w-24 h-24 rounded-full overflow-hidden border-2 border-slate-200 dark:border-dark-300 bg-slate-100 dark:bg-dark-300">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="group avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        Group
                      </div>
                    )}
                    {isAdmin && (
                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <IoCamera className="text-white" size={24} />
                        <input type="file" onChange={handleAvatarChange} accept="image/*" className="hidden" />
                      </label>
                    )}
                  </div>
                  {isAdmin && (
                    <span className="text-xs text-slate-400 mt-2">Upload group image</span>
                  )}
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Group Name</label>
                  <input
                    type="text"
                    placeholder="Enter group name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    disabled={!isAdmin}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
                  />
                </div>

                {/* Selection panel (Only on Creation) */}
                {!editConversation && (
                  <div className="space-y-3">
                    <label className="text-sm font-semibold">Add Members</label>
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
                    />

                    <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                      {filteredUsers.map((u) => {
                        const isSelected = selectedMembers.includes(u._id);
                        return (
                          <div
                            key={u._id}
                            onClick={() => toggleMember(u._id)}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800'
                                : 'hover:bg-slate-50 dark:hover:bg-dark-300 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <img
                                src={u.profilePic || `https://api.dicebear.com/7.x/initials/svg?seed=${u.name}`}
                                alt="avatar"
                                className="w-8 h-8 rounded-full object-cover"
                              />
                              <div>
                                <h4 className="text-sm font-medium">{u.name}</h4>
                                <p className="text-xs text-slate-400">@{u.username}</p>
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                            />
                          </div>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">No users found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Members list (Edit mode only)
              <div className="space-y-4">
                {isAdmin && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Invite New Members</label>
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-dark-300"
                    />

                    <div className="max-h-32 overflow-y-auto space-y-2 pr-1 border border-slate-100 dark:border-dark-300 p-2 rounded-xl">
                      {filteredUsers
                        .filter((u) => !editConversation.participants.some((p) => p._id === u._id))
                        .map((u) => (
                          <div key={u._id} className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-dark-300 rounded-lg">
                            <div className="flex items-center space-x-2">
                              <img
                                src={u.profilePic || `https://api.dicebear.com/7.x/initials/svg?seed=${u.name}`}
                                alt="avatar"
                                className="w-6 h-6 rounded-full"
                              />
                              <span className="text-xs font-medium">{u.name}</span>
                            </div>
                            <button
                              onClick={() => handleAddMember(u._id)}
                              className="text-xs bg-sky-500 text-white px-2.5 py-1 rounded-md hover:bg-sky-600 font-semibold"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                      {allUsers.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-2">No users to add</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Current Members */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold">Group Participants</label>
                  <div className="space-y-2">
                    {editConversation.participants.map((p) => {
                      const isMemberAdmin =
                        editConversation.groupAdmin === p._id ||
                        editConversation.groupAdmin?._id === p._id;
                      const isSelf = p._id === localStorage.getItem('userId');

                      return (
                        <div key={p._id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-dark-300 rounded-xl">
                          <div className="flex items-center space-x-3">
                            <img
                              src={p.profilePic || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`}
                              alt="avatar"
                              className="w-8 h-8 rounded-full"
                            />
                            <div>
                              <h4 className="text-sm font-medium">{p.name} {isSelf && '(You)'}</h4>
                              <p className="text-xs text-slate-400">@{p.username}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {isMemberAdmin && (
                              <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                                Admin
                              </span>
                            )}
                            {isAdmin && !isMemberAdmin && (
                              <button
                                onClick={() => handleRemoveMember(p._id)}
                                className="text-xs text-red-500 hover:text-red-600 font-semibold px-2 py-1"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end space-x-3 bg-slate-50 dark:bg-dark-300 px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-dark-400 transition"
            >
              Cancel
            </button>
            {editConversation ? (
              isAdmin && tab === 'info' && (
                <button
                  onClick={handleUpdateInfo}
                  className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition"
                >
                  Save Changes
                </button>
              )
            ) : (
              <button
                onClick={handleCreate}
                disabled={!groupName.trim() || selectedMembers.length === 0}
                className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Group
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
export default GroupModal;
