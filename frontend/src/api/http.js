import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

function getCsrfToken() {
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='))
      ?.split('=')[1] ?? ''
  );
}

const http = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  const mutating = ['post', 'put', 'patch', 'delete'];
  if (mutating.includes(config.method?.toLowerCase())) {
    config.headers['x-csrf-token'] = getCsrfToken();
  }
  return config;
});

export default http;