import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTasks } from '../api';
import StatusBadge from '../components/StatusBadge';
import { Search, Filter, RefreshCcw, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

interface Task {
  id: string;
  taskType?: string;
  model: string | null;
  appid: string | null;
  state: string;
  createTime: string;
  completeTime: string | null;
  costTime: number | null;
}

const states = ['全部状态', 'PENDING', 'RUNNING', 'SUCCESS', 'FAILED'];

export default function TaskList() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stateFilter, setStateFilter] = useState('全部状态');
  const [loading, setLoading] = useState(true);
  const pageSize = 15;

  const fetch = () => {
    setLoading(true);
    const params: Record<string, any> = { page, pageSize };
    if (stateFilter !== '全部状态') params.state = stateFilter;
    getTasks(params)
      .then(({ data }) => {
        setTasks(data.data?.list || []);
        setTotal(data.data?.pagination?.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [page, stateFilter]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">任务管理</h1>
          <p className="text-sm text-slate-500 mt-1">监控并管理所有已提交的任务流</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <select
              value={stateFilter}
              onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
            >
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={fetch}
            className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
            title="刷新数据"
          >
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Task ID</th>
                <th className="px-6 py-4">类型</th>
                <th className="px-6 py-4">标识符 (Model/App)</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4">创建时间</th>
                <th className="px-6 py-4">耗时</th>
                <th className="px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search size={32} strokeWidth={1.5} />
                      <p>未发现匹配的任务数据</p>
                    </div>
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-500 tracking-tighter">
                      {t.id}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        t.taskType === 'app' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                      }`}>
                        {t.taskType === 'app' ? 'APP' : 'MODEL'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {t.appid || t.model || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge state={t.state} />
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(t.createTime).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                      {t.costTime != null ? `${(t.costTime / 1000).toFixed(2)}s` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => navigate(`/tasks/${t.id}`)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                      >
                        <ExternalLink size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
            <div className="text-xs text-slate-500">
              显示第 {(page-1)*pageSize + 1} 到 {Math.min(page*pageSize, total)} 条，共 {total} 条
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1.5 border border-slate-200 rounded-md bg-white disabled:opacity-40 hover:bg-slate-50 transition"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="px-3 text-xs font-medium text-slate-600">
                {page} / {totalPages}
              </div>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1.5 border border-slate-200 rounded-md bg-white disabled:opacity-40 hover:bg-slate-50 transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

