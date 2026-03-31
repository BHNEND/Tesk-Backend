import { useEffect, useState } from 'react';
import { getStats } from '../api';

interface Stats {
  total: number;
  todayNew: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  runningCount: number;
  avgCostTime: number | null;
}

const cards = [
  { key: 'total' as const, label: '总任务数', icon: '📦', color: 'bg-blue-500' },
  { key: 'todayNew' as const, label: '今日新增', icon: '📈', color: 'bg-purple-500' },
  { key: 'successCount' as const, label: '成功数', icon: '✅', color: 'bg-green-500' },
  { key: 'failedCount' as const, label: '失败数', icon: '❌', color: 'bg-red-500' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(({ data }) => setStats(data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500">加载中...</div>;
  if (!stats) return <div className="text-red-500">加载失败</div>;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-6">仪表盘</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.key} className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="text-2xl font-bold mt-1">{stats[c.key] ?? 0}</p>
              </div>
              <span className={`w-10 h-10 ${c.color} rounded-lg flex items-center justify-center text-lg`}>
                {c.icon}
              </span>
            </div>
          </div>
        ))}
      </div>
      {/* Extra stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">运行中</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.runningCount ?? 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">平均耗时</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {stats.avgCostTime != null ? `${(stats.avgCostTime / 1000).toFixed(1)}s` : '-'}
          </p>
        </div>
      </div>
    </div>
  );
}
