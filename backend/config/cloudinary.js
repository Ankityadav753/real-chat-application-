import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Checks whether Cloudinary credentials are fully configured and not placeholder values.
 * @returns {boolean}
 */
export const isCloudinaryConfigured = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return false;
  }
  const placeholders = [
    'your_cloud_name',
    'your_api_key',
    'your_api_secret',
    'placeholder_cloud_name',
    'placeholder_api_key',
    'placeholder_api_secret',
  ];
  if (
    placeholders.includes(CLOUDINARY_CLOUD_NAME) ||
    placeholders.includes(CLOUDINARY_API_KEY) ||
    placeholders.includes(CLOUDINARY_API_SECRET)
  ) {
    return false;
  }
  return true;
};

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;

