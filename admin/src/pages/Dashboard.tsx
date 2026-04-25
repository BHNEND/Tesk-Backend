import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStats, getQueueStats, getAnalyticsTimeline, getSystemStats } from '../api';
import {
  Box, TrendingUp, CheckCircle2, XCircle, Clock, Activity,
  Server, Database, HardDrive, Cpu
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Stats {
  total: number;
  todayNew: number;
  todaySuccess: number;
  todayFailed: number;
  avgCostTime: number | null;
}

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天${h}时${m}分`;
  if (h > 0) return `${h}时${m}分`;
  return `${m}分`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [queues, setQueues] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [sysStats, setSysStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([getStats(), getQueueStats(), getAnalyticsTimeline(), getSystemStats()])
      .then(([statsRes, queueRes, timelineRes, sysRes]) => {
        setStats(statsRes.data.data);
        setQueues(queueRes.data.data || []);
        setTimeline(timelineRes.data?.data || []);
        setSysStats(sysRes.data?.data || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

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
    { key: 'total', label: '累计处理任务', icon: Box, color: 'text-blue-600', bg: 'bg-blue-50', link: undefined as string | undefined },
    { key: 'todayNew', label: '今日任务总量', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50', link: undefined as string | undefined },
    { key: 'todaySuccess', label: '今日成功数量', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', link: '/tasks?state=SUCCESS' },
    { key: 'todayFailed', label: '今日失败数量', icon: XCircle, color: 'text-pink-600', bg: 'bg-pink-50', link: '/tasks?state=FAILED' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">系统运行概览</h1>
          <p className="text-sm text-slate-500 mt-1">实时监控任务队列状态与系统性能指标</p>
        </div>
        <button onClick={fetchAll} className="text-xs text-slate-400 hover:text-blue-500 transition">刷新</button>
      </div>

      {/* Main Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {mainCards.map((c) => {
          const value = (stats as any)[c.key] ?? 0;
          const clickable = !!c.link;
          return (
            <div
              key={c.key}
              onClick={clickable ? () => navigate(c.link!) : undefined}
              className={`bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group ${clickable ? 'cursor-pointer' : ''}`}
            >
              <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${c.bg} opacity-50 group-hover:scale-110 transition-transform`} />
              <div className="relative">
                <div className={`w-10 h-10 ${c.bg} ${c.color} rounded-xl flex items-center justify-center mb-4`}>
                  <c.icon size={20} />
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{c.label}</p>
                <p className="text-3xl font-bold text-slate-800 tracking-tight mt-1">{value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Queue Status */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
          <Clock size={16} className="text-blue-500" />
          实时队列状态
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {queues.map((q: any) => (
            <div key={q.name} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-3">{q.label}</div>
              <div className="flex gap-4 text-center">
                <div>
                  <span className={`text-sm font-bold font-mono ${(q.waiting || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{q.waiting || 0}</span>
                  <span className="text-[10px] text-slate-400 ml-1">等待</span>
                </div>
                <div>
                  <span className={`text-sm font-bold font-mono ${(q.active || 0) > 0 ? 'text-blue-600' : 'text-slate-400'}`}>{q.active || 0}</span>
                  <span className="text-[10px] text-slate-400 ml-1">执行</span>
                </div>
                <div>
                  <span className="text-sm font-bold font-mono text-green-600">{q.completed || 0}</span>
                  <span className="text-[10px] text-slate-400 ml-1">完成</span>
                </div>
                {(q.failed || 0) > 0 && (
                  <div>
                    <span className="text-sm font-bold font-mono text-red-500">{q.failed}</span>
                    <span className="text-[10px] text-slate-400 ml-1">失败</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <p className="text-[10px] text-green-500 flex items-center gap-1 font-bold">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            WORKERS ONLINE
          </p>
        </div>
      </div>

      {/* System Performance + Connections */}
      {sysStats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Server Resources */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-5">
              <Server size={16} className="text-blue-500" />
              服务器资源
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500 flex items-center gap-1"><Cpu size={12} /> CPU ({sysStats.system.cpuCount}核)</span>
                  <span className="text-slate-700 font-mono">Load {sysStats.system.loadAvg[0]}</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, sysStats.system.loadAvg[0] / sysStats.system.cpuCount * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500 flex items-center gap-1"><HardDrive size={12} /> 系统内存</span>
                  <span className="text-slate-700 font-mono">{sysStats.system.memory.used}/{sysStats.system.memory.total}GB</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${sysStats.system.memory.usagePercent > 80 ? 'bg-red-500' : sysStats.system.memory.usagePercent > 60 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${sysStats.system.memory.usagePercent}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500">进程内存 (Heap)</span>
                  <span className="text-slate-700 font-mono">{sysStats.process.memory.heapUsed}/{sysStats.process.memory.heapTotal}MB</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${sysStats.process.memory.heapUsed / sysStats.process.memory.heapTotal > 0.85 ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${sysStats.process.memory.heapUsed / sysStats.process.memory.heapTotal * 100}%` }} />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">进程运行</span>
                  <span className="text-slate-700 font-mono">{formatUptime(sysStats.process.uptime)}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-slate-400">PID / Node</span>
                  <span className="text-slate-700 font-mono">{sysStats.process.pid} / {sysStats.process.nodeVersion}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Connections */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-5">
              <Database size={16} className="text-purple-500" />
              服务连接状态
            </h3>
            <div className="space-y-3">
              {[
                { label: 'HTTP 连接', status: true, detail: `活跃 ${sysStats.connections.http} 个` },
                { label: 'MySQL', status: sysStats.connections.mysql === 'connected', detail: sysStats.connections.mysql === 'connected' ? '已连接' : '连接异常' },
                { label: 'Redis', status: sysStats.connections.redis.status === 'ready', detail: sysStats.connections.redis.status === 'ready' ? `已连接 · ${sysStats.connections.redis.usedMemory}` : sysStats.connections.redis.status },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.status ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-xs font-medium text-slate-700">{item.label}</span>
                  </div>
                  <span className={`text-xs font-mono ${item.status ? 'text-green-600' : 'text-red-500'}`}>{item.detail}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] text-green-500 flex items-center gap-1 font-bold">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  ALL SERVICES ONLINE
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Charts */}
      {timeline.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-blue-500" />
              请求量趋势
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" name="总请求" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="success" stroke="#22c55e" name="成功" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Activity size={16} className="text-green-500" />
              成功率 & 平均耗时
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={timeline.map(t => ({ ...t, avgCostTimeSec: t.avgCostTime ? Math.round(t.avgCostTime / 100) / 10 : null }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#94a3b8" unit="%" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" unit="s" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="successRate" stroke="#3b82f6" name="成功率 %" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="avgCostTimeSec" stroke="#f59e0b" name="平均耗时(s)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

    </div>
  );
}
