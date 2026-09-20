import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';

/**
 * Uploads a file buffer from memory to Cloudinary via stream.
 * @param {Buffer} fileBuffer - The file buffer in memory
 * @param {string} mimetype - The MIME type of the file
 * @param {string} originalname - The original name of the file
 * @returns {Promise<{url: string, publicId: string, type: 'image'|'video'|'file'}>}
 */
export const uploadToCloudinary = (fileBuffer, mimetype, originalname) => {
  return new Promise((resolve, reject) => {
    // 1. Verify Cloudinary configuration
    if (!isCloudinaryConfigured()) {
      const configError = new Error('Cloudinary service is not configured. Media uploads are currently disabled.');
      configError.code = 'CLOUDINARY_NOT_CONFIGURED';
      return reject(configError);
    }

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      return reject(new Error('Invalid or empty file buffer provided'));
    }

    let folder = 'chat_app_attachments';
    let resourceType = 'raw'; // Default for PDFs and generic documents

    if (mimetype && mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (mimetype && mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else if (mimetype && mimetype.startsWith('audio/')) {
      // Cloudinary processes audio under video resource type
      resourceType = 'video';
    }

    const sanitizedName = (originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.[^/.]+$/, '') // strip extension for public_id
      .slice(0, 50);

    const publicId = `${sanitizedName}_${Date.now()}`;

    let isSettled = false;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: publicId,
      },
      (error, result) => {
        if (isSettled) return;
        isSettled = true;

        if (error) {
          console.error('Cloudinary stream upload error:', error.message || error);
          reject(new Error(error.message || 'Upload to Cloudinary failed'));
        } else {
          // Schema enum for Message.attachments[].type is ['image', 'video', 'file']
          let messageAttachmentType = 'file';
          if (mimetype && mimetype.startsWith('image/')) {
            messageAttachmentType = 'image';
          } else if (mimetype && mimetype.startsWith('video/')) {
            messageAttachmentType = 'video';
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            type: messageAttachmentType,
          });
        }
      }
    );

    uploadStream.on('error', (streamError) => {
      if (isSettled) return;
      isSettled = true;
      console.error('Cloudinary uploadStream stream error:', streamError.message || streamError);
      reject(new Error(streamError.message || 'Stream error during upload'));
    });

    uploadStream.end(fileBuffer);
  });
};

/**
 * Deletes a resource from Cloudinary.
 * @param {string} publicId - The Cloudinary public ID
 * @param {'image'|'video'|'file'} type - The resource type
 * @returns {Promise<boolean>} Whether deletion was successful or not needed
 */
export const deleteFromCloudinary = async (publicId, type) => {
  try {
    if (!isCloudinaryConfigured() || !publicId) {
      return false;
    }
    let resourceType = 'raw';
    if (type === 'image') resourceType = 'image';
    if (type === 'video') resourceType = 'video';

    const res = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    // If resource wasn't found under raw (e.g. audio uploaded as video but schema type is file)
    if (res && res.result === 'not found' && type === 'file') {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    }
    return true;
  } catch (error) {
    console.error('Cloudinary deletion error:', error.message || error);
    return false;
  }
};

/**
 * Safely extracts Cloudinary public_id from an attachment object or Cloudinary URL.
 * Never targets arbitrary external URLs or non-Cloudinary assets.
 * @param {string|object} item - Attachment object { url, publicId } or URL string
 * @returns {string|null} The validated public_id, or null if not Cloudinary-managed
 */
export const extractCloudinaryPublicId = (item) => {
  if (!item) return null;

  let publicIdCandidate = null;
  let urlCandidate = null;

  if (typeof item === 'object') {
    if (typeof item.publicId === 'string' && item.publicId.trim()) {
      publicIdCandidate = item.publicId.trim();
    }
    if (typeof item.url === 'string') {
      urlCandidate = item.url.trim();
    }
  } else if (typeof item === 'string') {
    urlCandidate = item.trim();
  }

  // 1. If publicId is explicitly stored, validate it
  if (publicIdCandidate) {
    if (!publicIdCandidate.includes('..') && /^[a-zA-Z0-9_\-./]+$/.test(publicIdCandidate)) {
      return publicIdCandidate;
    }
  }

  // 2. If no valid publicId was directly stored, derive it ONLY from verified Cloudinary URLs
  if (urlCandidate) {
    if (!urlCandidate.includes('res.cloudinary.com') && !urlCandidate.includes('cloudinary.com')) {
      return null;
    }

    const uploadIdx = urlCandidate.indexOf('/upload/');
    if (uploadIdx === -1) return null;

    let pathAfterUpload = urlCandidate.slice(uploadIdx + '/upload/'.length);
    // Strip version prefix if present, e.g. v1623456789/
    pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, '');
    // Strip file extension at the end
    const derived = pathAfterUpload.replace(/\.[^/.]+$/, '').trim();

    if (derived && !derived.includes('..') && /^[a-zA-Z0-9_\-./]+$/.test(derived)) {
      return derived;
    }
  }

  return null;
};


