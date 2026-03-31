import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: '📊 仪表盘' },
  { to: '/tasks', label: '📋 任务列表' },
  { to: '/apikeys', label: '🔑 API Key 管理' },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Nav */}
      <header className="bg-white shadow-sm border-b px-6 py-3 flex items-center">
        <h1 className="text-lg font-bold text-gray-800">🚀 Tesk 管理后台</h1>
      </header>
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r p-4 hidden md:block">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-2 rounded text-sm transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        {/* Mobile nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2 z-10">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `text-xs ${isActive ? 'text-blue-600 font-medium' : 'text-gray-500'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        {/* Content */}
        <main className="flex-1 p-6 overflow-auto mb-14 md:mb-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
