import multer from 'multer';
import path from 'path';

// Use memory storage to avoid writing to ephemeral local disks (e.g., on Render or Vercel)
const storage = multer.memoryStorage();

// Disallowed executable and script extensions
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.sh', '.bash', '.vbs', '.vbe',
  '.js', '.mjs', '.cjs', '.jar', '.msi', '.php', '.py', '.scr',
  '.pif', '.com', '.cpl', '.hta', '.ps1', '.reg',
]);

// Allowed MIME prefixes or types for chat attachments
const ALLOWED_ATTACHMENT_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

/**
 * Filter for avatar uploads (profile picture or group avatar)
 */
export const avatarFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return cb(new Error('Executable and script files are strictly forbidden'));
  }
  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    return cb(new Error('Invalid file type. Profile and group avatars must be an image (JPEG, PNG, WebP, GIF).'));
  }
  cb(null, true);
};

/**
 * Filter for message attachments
 */
export const attachmentFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return cb(new Error('Executable and script files are strictly forbidden'));
  }
  const isAllowedMime =
    ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => file.mimetype && file.mimetype.startsWith(prefix)) ||
    ALLOWED_ATTACHMENT_MIMES.has(file.mimetype);

  if (!isAllowedMime) {
    return cb(new Error('File type is not supported. Only images, videos, audio, and standard documents are allowed.'));
  }
  cb(null, true);
};

/**
 * Generic file filter dispatching based on field name
 */
export const genericFileFilter = (req, file, cb) => {
  if (file.fieldname === 'profilePic' || file.fieldname === 'groupAvatar') {
    return avatarFileFilter(req, file, cb);
  }
  return attachmentFileFilter(req, file, cb);
};

// File size limits: 25MB per attachment, max 5 attachments
export const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
    files: 5,
  },
  fileFilter: genericFileFilter,
});

/**
 * Middleware wrapper that catches Multer errors and returns safe 400 Bad Request JSON responses.
 * @param {Function} multerMiddleware - A multer middleware instance like upload.single(...) or upload.array(...)
 */
export const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size limit exceeded. Maximum file size is 25MB.',
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          message: 'Too many files uploaded or unexpected field name. Maximum 5 attachments allowed.',
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Invalid file upload',
      });
    }
    next();
  });
};

