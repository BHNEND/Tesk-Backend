import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1/admin',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器：动态附带登录后的 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理 401/403 自动跳转登录
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('admin_token');
      // 如果不是已经在登录页，则跳转
      if (!window.location.pathname.includes('/login')) {
        window.location.href = (import.meta.env.BASE_URL || '/') + 'login';
      }
    }
    return Promise.reject(error);
  }
);

// Admin APIs
export const adminLogin = (data: any) => api.post('/login', data);
export const getTasks = (params?: any) => api.get('/tasks', { params });
export const getTask = (taskId: string) => api.get(`/tasks/${taskId}`);
export const getStats = () => api.get('/stats');

// API Keys
export const getApiKeys = () => api.get('/apikeys');
export const createApiKey = (name: string) => api.post('/apikeys', { name });
export const updateApiKey = (id: string, data: any) => api.patch(`/apikeys/${id}`, data);
export const deleteApiKey = (id: string) => api.delete(`/apikeys/${id}`);

// Strategy Management
export const getModelStrategies = () => api.get('/strategies/models');
export const createModelStrategy = (data: any) => api.post('/strategies/models', data);
export const updateModelStrategy = (id: string, data: any) => api.patch(`/strategies/models/${id}`, data);
export const deleteModelStrategy = (id: string) => api.delete(`/strategies/models/${id}`);

export const getAppStrategies = () => api.get('/strategies/apps');
export const createAppStrategy = (data: any) => api.post('/strategies/apps', data);
export const updateAppStrategy = (id: string, data: any) => api.patch(`/strategies/apps/${id}`, data);
export const deleteAppStrategy = (id: string) => api.delete(`/strategies/apps/${id}`);

// Analytics
export const getAnalytics = (params?: { startDate?: string; endDate?: string }) => api.get('/analytics', { params });
export const getAnalyticsTimeline = (params?: { startDate?: string; endDate?: string; interval?: string }) => api.get('/analytics/timeline', { params });
export const getAnalyticsErrors = (params?: { startDate?: string; endDate?: string }) => api.get('/analytics/errors', { params });
export const getAnalyticsPerformance = (params?: { startDate?: string; endDate?: string }) => api.get('/analytics/performance', { params });
export const getQueueStats = () => api.get('/queue-stats');
export const getAnalyticsApps = (params?: { startDate?: string; endDate?: string }) => api.get('/analytics/apps', { params });
export const getAnalyticsDuration = (params?: { startDate?: string; endDate?: string }) => api.get('/analytics/duration', { params });
export const getAnalyticsCostByTier = (params?: { startDate?: string; endDate?: string }) => api.get('/analytics/cost-by-tier', { params });
export const getAnalyticsCostTimeline = (params?: { startDate?: string; endDate?: string }) => api.get('/analytics/cost-timeline', { params });
export const getAnalyticsModelDetail = (params: { model: string; startDate?: string; endDate?: string }) => api.get('/analytics/model-detail', { params });
export const getSystemStats = () => api.get('/system-stats');

// --- Public Job APIs (针对测试客户端使用) ---
const publicApi = axios.create({
  baseURL: '/api/v1/jobs',
  timeout: 15000,
});

export const createTask = (apiKey: string, data: any) => 
  publicApi.post('/createTask', data, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

export const previewTask = (apiKey: string, data: any) => 
  publicApi.post('/previewTask', data, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

export const getJobRecord = (apiKey: string, taskId: string) => 
  publicApi.get('/recordInfo', {
    params: { taskId },
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

export default api;
