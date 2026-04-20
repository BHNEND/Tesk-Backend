import { useEffect, useState } from 'react';
import { getStats } from '../api';
import { 
  Box, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Activity,
  Zap,
  ArrowUpRight
} from 'lucide-react';

interface Stats {
  total: number;
  todayNew: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  runningCount: number;
  avgCostTime: number | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(({ data }) => setStats(data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
  
  if (!stats) return (
    <div className="p-8 bg-red-50 border border-red-100 rounded-xl text-red-700 flex items-center gap-3">
      <XCircle size={20} />
      数据加载失败，请检查后端连接
    </div>
  );

  const mainCards = [
    { key: 'total' as const, label: '累计处理任务', icon: Box, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'todayNew' as const, label: '今日新增请求', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
    { key: 'successCount' as const, label: '成功交付数', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { key: 'failedCount' as const, label: '异常失败数', icon: XCircle, color: 'text-pink-600', bg: 'bg-pink-50' },
  ];

  const successRate = stats.total > 0 ? ((stats.successCount / stats.total) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">系统运行概览</h1>
        <p className="text-sm text-slate-500 mt-1">实时监控任务队列状态与系统性能指标</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {mainCards.map((c) => (
          <div key={c.key} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${c.bg} opacity-50 group-hover:scale-110 transition-transform`} />
            <div className="relative">
              <div className={`w-10 h-10 ${c.bg} ${c.color} rounded-xl flex items-center justify-center mb-4`}>
                <c.icon size={20} />
              </div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{c.label}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-3xl font-bold text-slate-800 tracking-tight">{stats[c.key] ?? 0}</p>
                <ArrowUpRight size={14} className="text-slate-300" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Metrics */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-8 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-6">
            <Activity size={16} className="text-blue-500" />
            核心性能指标
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="space-y-1">
              <p className="text-xs text-slate-400">系统平均耗时</p>
              <p className="text-2xl font-bold text-slate-800">
                {stats.avgCostTime != null ? `${(stats.avgCostTime / 1000).toFixed(2)}s` : '-'}
              </p>
              <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-blue-500 w-3/4" />
              </div>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-slate-400">总成功率</p>
              <p className="text-2xl font-bold text-green-600">{successRate}%</p>
              <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${successRate}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-400">队列并发度</p>
              <p className="text-2xl font-bold text-orange-600">3x <span className="text-xs font-normal text-slate-400">Concurrency</span></p>
              <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-orange-500 w-1/2" />
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Status */}
        <div className="bg-slate-900 rounded-2xl p-8 text-white relative overflow-hidden">
          <Zap className="absolute top-4 right-4 text-yellow-400 opacity-20" size={80} />
          <h3 className="text-sm font-bold flex items-center gap-2 mb-8 relative z-10">
            <Clock size={16} className="text-yellow-400" />
            实时队列状态
          </h3>
          
          <div className="space-y-6 relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">运行中任务</span>
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-mono font-bold">
                {stats.runningCount ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">等待调度 (Pending)</span>
              <span className="px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-xs font-mono font-bold">
                {stats.pendingCount ?? 0}
              </span>
            </div>
            <hr className="border-slate-800" />
            <div className="pt-2">
              <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-widest font-bold">
                Worker Node: tesk-backend-main
              </p>
              <p className="text-[10px] text-green-500 mt-1 flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                STATUS: LISTENING
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

