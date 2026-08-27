import axios from 'axios';
import { getCsrfToken, ensureCsrfToken } from './csrf';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const http = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

http.interceptors.request.use(async (config) => {
  const mutating = ['post', 'put', 'patch', 'delete'];
  if (mutating.includes(config.method?.toLowerCase())) {
    await ensureCsrfToken();
    config.headers['x-csrf-token'] = getCsrfToken();
  }
  return config;
});

export default http;