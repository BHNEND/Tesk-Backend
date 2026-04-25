import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart3, ListTodo, Key, FileJson, Rocket, Cpu, Terminal, LogOut } from 'lucide-react';

const links = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard },
  { to: '/analytics', label: '统计分析', icon: BarChart3 },
  { to: '/tasks', label: '任务管理', icon: ListTodo },
  { to: '/strategies', label: '策略管理', icon: Cpu },
  { to: '/test', label: '接口测试', icon: Terminal },
  { to: '/apikeys', label: 'API 密钥', icon: Key },
  { to: '/docs', label: '接口文档', icon: FileJson },
];

export default function Layout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col">
        <div className="p-6 flex items-center gap-2 border-b border-slate-800">
          <Rocket className="text-blue-400 w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight text-white">Tesk Admin</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <l.icon size={18} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 transition"
          >
            <LogOut size={16} />
            退出登录
          </button>
          <div className="px-4 py-3 bg-slate-800/50 rounded-lg text-xs text-slate-400">
            v1.1.0-alpha
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header - Desktop */}
        <header className="h-16 bg-white border-b px-8 flex items-center justify-between hidden md:flex">
          <div className="text-sm font-medium text-gray-500 uppercase tracking-widest">
            Overview / Performance
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 text-xs rounded-full border border-green-200">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Service Operational
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            >
              <LogOut size={16} />
              退出登录
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50 pb-20 md:pb-8">
          <Outlet />
        </main>

        {/* Mobile Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-3 px-2 z-50 shadow-2xl">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 transition ${isActive ? 'text-blue-600' : 'text-gray-400'}`
              }
            >
              <l.icon size={20} />
              <span className="text-[10px] font-medium">{l.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
