import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import ApiKeyList from './pages/ApiKeyList';
import ApiDocs from './pages/ApiDocs';
import StrategyManage from './pages/StrategyManage';
import TestClient from './pages/TestClient';
import Login from './pages/Login';

// 路由守卫组件
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* 公开路由 */}
        <Route path="/login" element={<Login />} />

        {/* 受保护路由 */}
        <Route element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/strategies" element={<StrategyManage />} />
          <Route path="/apikeys" element={<ApiKeyList />} />
          <Route path="/docs" element={<ApiDocs />} />
          <Route path="/test" element={<TestClient />} />
        </Route>

        {/* 404 回退 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
