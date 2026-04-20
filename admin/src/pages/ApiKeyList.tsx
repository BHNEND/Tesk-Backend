import { useEffect, useState } from 'react';
import { getApiKeys, createApiKey, updateApiKey, deleteApiKey } from '../api';
import { Key, Plus, Trash2, ShieldCheck, Copy, Check, Info, Settings, Zap, Activity, X, Globe } from 'lucide-react';

interface ApiKey {
  id: string;
  key: string;
  name: string;
  status: string;
  rpmLimit: number; // 每分钟并发/请求上限
  concurrencyLimit: number; // 瞬时最大任务数
  ipWhitelist: string; // IP 白名单
  createdAt: string;
}

export default function ApiKeyList() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // 配置弹窗状态
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [editRpm, setEditRpm] = useState(60);
  const [editConcurrency, setEditConcurrency] = useState(5);
  const [editIpWhitelist, setEditIpWhitelist] = useState('');

  const fetch = () => {
    setLoading(true);
    getApiKeys()
      .then(({ data }) => setKeys(data.data?.list || data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const { data } = await createApiKey(newName.trim());
      setCreatedKey(data.data?.key || '已创建');
      setNewName('');
      setShowCreate(false);
      fetch();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggle = async (item: ApiKey) => {
    const newStatus = item.status === 'active' ? 'disabled' : 'active';
    await updateApiKey(item.id, { status: newStatus as any });
    fetch();
  };

  const handleSaveConfig = async () => {
    if (!editingKey) return;
    try {
      await updateApiKey(editingKey.id, { 
        rpmLimit: editRpm, 
        concurrencyLimit: editConcurrency,
        ipWhitelist: editIpWhitelist
      });
      setEditingKey(null);
      fetch();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要永久删除此 API Key 吗？此操作不可撤销。')) return;
    await deleteApiKey(id);
    fetch();
  };

  const copyKey = (text: string, id: string = 'new') => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const maskKey = (key: string) => {
    if (!key) return '-';
    return key.slice(0, 8) + '••••••••' + key.slice(-4);
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">API 密钥管理</h1>
          <p className="text-sm text-slate-500 mt-1">控制每个业务端的请求频率、并发上限与安全 IP 白名单</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm"
        >
          <Plus size={18} />
          新建密钥
        </button>
      </div>

      {/* Success Notification */}
      {createdKey && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
            <ShieldCheck size={80} />
          </div>
          <div className="flex items-start gap-4 relative z-10">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Check size={20} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-900">API 密钥创建成功！</p>
              <p className="text-xs text-blue-700 mt-1 mb-4 flex items-center gap-1 text-[11px]">
                <Info size={12} /> 请立即保存，出于安全考虑，该密钥仅显示一次。
              </p>
              <div className="flex items-center gap-2 max-w-xl">
                <code className="flex-1 bg-white border border-blue-200 px-3 py-2 rounded-lg text-xs font-mono text-slate-700 break-all">
                  {createdKey}
                </code>
                <button 
                  onClick={() => copyKey(createdKey)}
                  className="p-2 bg-white border border-blue-200 rounded-lg hover:bg-blue-100 transition text-blue-600"
                >
                  {copiedId === 'new' ? <Check size={18} /> : <Copy size={18} />}
                </button>
                <button 
                  onClick={() => setCreatedKey(null)}
                  className="px-4 py-2 text-blue-600 text-sm font-medium hover:underline"
                >
                  我已保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Create Form */}
      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-end gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">密钥描述 (如：业务端-生产环境)</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="输入名称后按回车创建..."
              className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">确认</button>
            <button onClick={() => setShowCreate(false)} className="px-6 py-2 text-slate-500 text-sm font-medium hover:bg-slate-50 rounded-lg">取消</button>
          </div>
        </div>
      )}

      {/* Keys Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 text-xs">密钥凭证</th>
                <th className="px-6 py-4 text-xs">名称</th>
                <th className="px-6 py-4 text-xs">每分钟上限 / 并发</th>
                <th className="px-6 py-4 text-xs">IP 白名单</th>
                <th className="px-6 py-4 text-xs">状态</th>
                <th className="px-6 py-4 text-right text-xs">管理操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <Key size={32} className="mx-auto mb-2 opacity-20" />
                    <p>暂无 API 密钥</p>
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{maskKey(k.key)}</span>
                        <button onClick={() => copyKey(k.key, k.id)} className="p-1 text-slate-300 hover:text-blue-600 rounded transition">
                          {copiedId === k.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">{k.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5 text-blue-600 font-medium" title="每分钟请求上限 (RPM)">
                          <Zap size={12} />
                          <span>{k.rpmLimit || 60} /min</span>
                        </div>
                        <div className="text-slate-300">|</div>
                        <div className="flex items-center gap-1.5 text-indigo-600 font-medium" title="最大并发任务数">
                          <Activity size={12} />
                          <span>Max {k.concurrencyLimit || 5}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {k.ipWhitelist ? (
                         <div className="flex items-center gap-1.5 text-slate-600 text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 w-fit">
                           <Globe size={12} className="text-slate-400" />
                           <span className="truncate max-w-[120px]">{k.ipWhitelist}</span>
                         </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">不限制 IP</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${
                        k.status === 'active' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {k.status === 'active' ? '已启用' : '已禁用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-1">
                      <button
                        onClick={() => {
                          setEditingKey(k);
                          setEditRpm(k.rpmLimit || 60);
                          setEditConcurrency(k.concurrencyLimit || 5);
                          setEditIpWhitelist(k.ipWhitelist || '');
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="配置限制参数"
                      >
                        <Settings size={16} />
                      </button>
                      <button
                        onClick={() => handleToggle(k)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          k.status === 'active' ? 'text-slate-600 hover:bg-slate-100' : 'text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        {k.status === 'active' ? '禁用' : '启用'}
                      </button>
                      <button onClick={() => handleDelete(k.id)} className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Config Modal */}
      {editingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Settings size={18} className="text-blue-600" />
                资源与安全配置
              </h3>
              <button onClick={() => setEditingKey(null)} className="text-slate-400 hover:text-slate-600 transition">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-8">
              {/* RPM Section */}
              <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 uppercase tracking-wide">
                      <Zap size={14} className="text-blue-500" />
                      每分钟请求上限 (RPM)
                    </label>
                    <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{editRpm} Req/min</span>
                  </div>
                  <input
                    type="range" min="10" max="1000" step="10"
                    value={editRpm}
                    onChange={(e) => setEditRpm(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono px-1">
                    <span>10</span>
                    <span>1000</span>
                  </div>
                </div>

                {/* Concurrency Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 uppercase tracking-wide">
                      <Activity size={14} className="text-indigo-500" />
                      并发上限 (最大进行中任务)
                    </label>
                    <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Max {editConcurrency}</span>
                  </div>
                  <input
                    type="range" min="1" max="50" step="1"
                    value={editConcurrency}
                    onChange={(e) => setEditConcurrency(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                   <div className="flex justify-between text-[10px] text-slate-400 font-mono px-1">
                    <span>1</span>
                    <span>50</span>
                  </div>
                </div>

                {/* IP Whitelist Section */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 uppercase tracking-wide">
                    <Globe size={14} className="text-emerald-500" />
                    IP 安全白名单
                  </label>
                  <textarea
                    value={editIpWhitelist}
                    onChange={(e) => setEditIpWhitelist(e.target.value)}
                    placeholder="例如: 127.0.0.1, 192.168.1.100"
                    rows={2}
                    className="w-full border border-slate-200 rounded-lg px-4 py-3 text-xs focus:ring-2 focus:ring-emerald-500 outline-none transition font-mono"
                  />
                  <p className="text-[10px] text-slate-400 italic">
                    * 多个 IP 请用英文逗号分隔。留空表示允许任何 IP 访问。
                  </p>
                </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setEditingKey(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white rounded-lg transition border border-transparent hover:border-slate-200"
              >
                取消
              </button>
              <button
                onClick={handleSaveConfig}
                className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-200 transition"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
