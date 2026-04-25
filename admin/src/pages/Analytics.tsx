import { useEffect, useState, useCallback } from 'react';
import { getAnalytics, getAnalyticsApps, getAnalyticsModelDetail } from '../api';
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ERROR_LABELS: Record<string, string> = {
  TASK_EXECUTION_ERROR: '任务执行错误',
  UPSTREAM_ERROR: '上游服务异常',
  TIMEOUT: '执行超时',
  RATE_LIMIT: '频率限制',
  UNKNOWN: '未知错误',
};
const errorLabel = (code: string) => `${ERROR_LABELS[code] || code}`;

interface TimeRange { startDate: string; endDate: string }

function QuickFilters({ onPick }: { onPick: (start: Date, end: Date) => void }) {
  const ranges = [
    { label: '10分钟', minutes: 10 }, { label: '30分钟', minutes: 30 },
    { label: '1小时', minutes: 60 }, { label: '2小时', minutes: 120 },
    { label: '1天', minutes: 1440 }, { label: '7天', minutes: 10080 }, { label: '30天', minutes: 43200 },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {ranges.map(r => (
        <button key={r.minutes} onClick={() => onPick(new Date(Date.now() - r.minutes * 60 * 1000), new Date())}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition">
          {r.label}
        </button>
      ))}
    </div>
  );
}

function ModelDetailCharts({ model, range }: { model: string; range: TimeRange }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params: any = { model };
    if (range.startDate) { const s = new Date(range.startDate); params.startDate = s.toISOString(); }
    if (range.endDate) {
      const e = new Date(range.endDate);
      if (range.endDate.length <= 10) e.setHours(23, 59, 59, 999);
      params.endDate = e.toISOString();
    }
    getAnalyticsModelDetail(params)
      .then(res => setData(res.data?.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [model, range]);

  if (loading) return <div className="text-xs text-slate-400 py-4 text-center">加载中...</div>;
  if (!data || (data.timeline.length === 0 && data.errors.total === 0))
    return <div className="text-xs text-slate-400 py-4 text-center">暂无详细数据</div>;

  return (
    <div className="space-y-4 mt-2">
      {/* Avg Cost Time by Channel */}
      {data.timeline.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">平均耗时趋势（按渠道）</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" unit="s" />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="economy.avgCostTime" stroke="#22c55e" name="经济版 (s)" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="standard.avgCostTime" stroke="#3b82f6" name="标准版 (s)" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">成功率趋势（按渠道）</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="economy.successRate" stroke="#22c55e" name="经济版 %" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="standard.successRate" stroke="#3b82f6" name="标准版 %" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Error Distribution */}
      {data.errors.total > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">错误分布（按类型）</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={Object.entries(data.errors.byCode).map(([code, total]) => ({
              type: errorLabel(code),
              经济版: (data.errors.byChannel.economy?.[code] || 0) as number,
              标准版: (data.errors.byChannel.standard?.[code] || 0) as number,
              合计: total as number,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="type" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="经济版" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="标准版" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<TimeRange>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return { startDate: today, endDate: today };
  });
  const [loading, setLoading] = useState(true);
  const [modelData, setModelData] = useState<any[]>([]);
  const [appData, setAppData] = useState<any[]>([]);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [tab, setTab] = useState<'model' | 'app'>('model');

  const fetchAll = useCallback((r?: TimeRange) => {
    const q = r || range;
    const params: any = {};
    if (q.startDate) { const s = new Date(q.startDate); params.startDate = s.toISOString(); }
    if (q.endDate) {
      const e = new Date(q.endDate);
      // 仅日期格式（YYYY-MM-DD）自动补到当天末尾，完整时间戳保持原值
      if (q.endDate.length <= 10) e.setHours(23, 59, 59, 999);
      params.endDate = e.toISOString();
    }

    setLoading(true);
    Promise.all([getAnalytics(params), getAnalyticsApps(params)])
      .then(([m, a]) => {
        setModelData(m.data?.data || []);
        setAppData(a.data?.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => { fetchAll(); }, []);

  const handleQuickPick = (start: Date, end: Date) => {
    const r = { startDate: start.toISOString(), endDate: end.toISOString() };
    setRange(r);
    fetchAll(r);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">统计分析</h1>
          <p className="text-sm text-slate-500 mt-1">按模型查看渠道成功率和 Key 层级分布</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuickFilters onPick={handleQuickPick} />
          <span className="text-slate-300 mx-1">|</span>
          <input type="date" value={range.startDate.slice(0, 10)} onChange={e => setRange({ ...range, startDate: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <span className="text-slate-400 text-sm">至</span>
          <input type="date" value={range.endDate.slice(0, 10)} onChange={e => setRange({ ...range, endDate: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <button onClick={() => fetchAll()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">查询</button>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('model')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'model' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}>模型任务</button>
        <button onClick={() => setTab('app')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'app' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}>应用任务</button>
      </div>

      {loading ? <div className="text-center text-slate-400 py-12">加载中...</div> : tab === 'model' ? (
        modelData.length === 0 ? (
          <div className="text-center text-slate-400 py-12 flex flex-col items-center gap-2">
            <BarChart3 size={32} strokeWidth={1.5} />
            <p>暂无模型统计数据</p>
          </div>
        ) : (
          <div className="space-y-4">
            {modelData.map((d: any) => {
              const tierTotal = Object.values(d.standard.byTier).reduce((a: number, b: any) => a + (b as number), 0);
              const isExpanded = expandedModel === d.model;
              return (
                <div key={d.model} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* Header - always visible */}
                  <div className="px-6 py-5">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="font-mono text-sm font-bold text-slate-900">{d.model}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100 font-bold">经济 {d.economy.total}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-bold">标准 {d.standard.total}</span>
                      <div className="flex-1" />
                      <button
                        onClick={() => setExpandedModel(isExpanded ? null : d.model)}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
                      >
                        高级数据
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-green-50/50 rounded-lg p-3 border border-green-100">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-green-600 mb-2">经济渠道</div>
                        <div className="flex justify-between text-xs text-slate-600"><span>请求 / 成功</span><span className="font-mono">{d.economy.total} / {d.economy.success}</span></div>
                        <div className="flex justify-between text-xs text-slate-600 mt-1"><span>成功率</span><span className="font-bold">{d.economy.successRate ?? '-'}%</span></div>
                      </div>
                      <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-blue-600 mb-2">标准渠道</div>
                        <div className="flex justify-between text-xs text-slate-600"><span>请求 / 成功</span><span className="font-mono">{d.standard.total} / {d.standard.success}</span></div>
                        <div className="flex justify-between text-xs text-slate-600 mt-1"><span>成功率</span><span className="font-bold">{d.standard.successRate ?? '-'}%</span></div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-600 mb-2">Key 层级分布</div>
                        {tierTotal === 0 ? <div className="text-xs text-slate-400">暂无数据</div> : (
                          <div className="space-y-1.5">
                            {[0, 1, 2].map(i => {
                              const c = (d.standard.byTier[i] || 0) as number;
                              const p = Math.round(c / tierTotal * 100);
                              return (
                                <div key={i} className="flex items-center gap-3 text-xs">
                                  <span className="w-12 text-slate-500">Key {String.fromCharCode(65 + i)}</span>
                                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                    <div className={`h-full rounded-full ${['bg-blue-500', 'bg-amber-500', 'bg-red-500'][i]}`} style={{ width: `${p}%` }} />
                                  </div>
                                  <span className="w-16 text-right text-slate-700 font-mono">{c} ({p}%)</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-6 pb-5 border-t border-slate-100 pt-4">
                      <ModelDetailCharts model={d.model} range={range} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        appData.length === 0 ? (
          <div className="text-center text-slate-400 py-12 flex flex-col items-center gap-2">
            <BarChart3 size={32} strokeWidth={1.5} />
            <p>暂无应用任务数据</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {appData.map((a: any) => (
              <div key={a.app} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="font-mono text-sm font-bold text-slate-900 mb-2">{a.app}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-lg font-bold text-slate-800">{a.total}</div><div className="text-[10px] text-slate-400">总请求</div></div>
                  <div><div className="text-lg font-bold text-green-600">{a.success}</div><div className="text-[10px] text-slate-400">成功</div></div>
                  <div><div className="text-lg font-bold text-blue-600">{a.successRate ?? '-'}%</div><div className="text-[10px] text-slate-400">成功率</div></div>
                </div>
                {a.avgCostTime && <div className="mt-2 text-xs text-slate-500">平均耗时 {a.avgCostTime >= 60000 ? `${(a.avgCostTime / 60000).toFixed(1)}min` : `${(a.avgCostTime / 1000).toFixed(1)}s`}</div>}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
