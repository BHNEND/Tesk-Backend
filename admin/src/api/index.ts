import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1/admin',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const key = import.meta.env.VITE_ADMIN_API_KEY;
  if (key) config.headers.Authorization = `Bearer ${key}`;
  return config;
});

export const getTasks = (params?: {
  state?: string;
  page?: number;
  pageSize?: number;
  startTime?: string;
  endTime?: string;
}) => api.get('/tasks', { params });

export const getTask = (taskId: string) => api.get(`/tasks/${taskId}`);

export const getStats = () => api.get('/stats');

export const createApiKey = (name: string) => api.post('/apikeys', { name });

export const getApiKeys = () => api.get('/apikeys');

export const updateApiKey = (id: string, data: { status: number }) =>
  api.patch(`/apikeys/${id}`, data);

export const deleteApiKey = (id: string) => api.delete(`/apikeys/${id}`);

export default api;
