import axios from 'axios';

const axiosInstance = axios.create({
  // Fallback to local port 5000 if VITE_BACKEND_URL is not set
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api',
  withCredentials: true, // Send HTTP Only Cookies automatically
});

export default axiosInstance;
