import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTasks } from '../api';
import StatusBadge from '../components/StatusBadge';

interface Task {
  task_id: string;
  model: string;
  state: string;
  create_time: string;
  complete_time: string | null;
  cost_time: number | null;
}

const states = ['全部', 'PENDING', 'RUNNING', 'SUCCESS', 'FAILED'];

export default function TaskList() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stateFilter, setStateFilter] = useState('全部');
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const fetch = () => {
    setLoading(true);
    const params: Record<string, unknown> = { page, pageSize };
    if (stateFilter !== '全部') params.state = stateFilter;
    getTasks(params)
      .then(({ data }) => {
        setTasks(data.data?.list || data.data || []);
        setTotal(data.data?.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [page, stateFilter]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">任务列表</h2>
        <select
          value={stateFilter}
          onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm"
        >
          {states.map((s) => (
            <option key={s} value={s}>{s === '全部' ? '全部状态' : s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-500">加载中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-lg shadow text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Task ID</th>
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">完成时间</th>
                <th className="px-4 py-3">耗时</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无数据</td></tr>
              ) : (
                tasks.map((t) => (
                  <tr
                    key={t.task_id}
                    onClick={() => navigate(`/tasks/${t.task_id}`)}
                    className="border-t hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{t.task_id}</td>
                    <td className="px-4 py-3">{t.model}</td>
                    <td className="px-4 py-3"><StatusBadge state={t.state} /></td>
                    <td className="px-4 py-3">{t.create_time}</td>
                    <td className="px-4 py-3">{t.complete_time || '-'}</td>
                    <td className="px-4 py-3">
                      {t.cost_time != null ? `${(t.cost_time / 1000).toFixed(1)}s` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1 border rounded text-sm disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages} (共 {total} 条)
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1 border rounded text-sm disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
