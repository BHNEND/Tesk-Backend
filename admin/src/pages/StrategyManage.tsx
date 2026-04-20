import { useEffect, useState } from 'react';
import { getModelStrategies, createModelStrategy, updateModelStrategy, deleteModelStrategy, getAppStrategies, createAppStrategy, updateAppStrategy, deleteAppStrategy } from '../api';
import { ShieldCheck, ShieldAlert, Plus, Trash2, Cpu, Box, Edit2 } from 'lucide-react';

interface Strategy {
  id: string;
  identifier: string; // modelName or appId
  handler: string;
  name: string;
  description: string;
  status: string;
  config?: any;
  createdAt: string;
}

const AVAILABLE_HANDLERS = [
  { value: 'defaultModelHandler', label: 'Default Model Handler' },
  { value: 'defaultAppHandler', label: 'Default App Handler' },
  { value: 'runningHubHandler', label: 'RunningHub Handler' }
];

export default function StrategyManage() {
  const [tab, setTab] = useState<'model' | 'app'>('model');
  const [items, setItems] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [handler, setHandler] = useState(AVAILABLE_HANDLERS[0].value);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState('');

  const fetch = () => {
    setLoading(true);
    const req = tab === 'model' ? getModelStrategies() : getAppStrategies();
    req.then(({ data }) => {
      const list = data.data || [];
      setItems(list.map((item: any) => ({
        id: item.id,
        identifier: tab === 'model' ? item.modelName : item.appId,
        handler: item.handler,
        name: item.name || '',
        description: item.description || '',
        status: item.status,
        config: item.config,
        createdAt: item.createdAt
      })));
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
    resetForm();
  }, [tab]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setIdentifier('');
    setHandler(AVAILABLE_HANDLERS[0].value);
    setName('');
    setDescription('');
    setConfig('');
  };

  const handleEdit = (item: Strategy) => {
    setEditingId(item.id);
    setIdentifier(item.identifier);
    setHandler(item.handler);
    setName(item.name);
    setDescription(item.description);
    setConfig(item.config ? JSON.stringify(item.config, null, 2) : '');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!identifier.trim() || !handler) return;
    try {
      let parsedConfig = null;
      if (config.trim()) {
        try {
          parsedConfig = JSON.parse(config);
        } catch (e) {
          alert('JSON 配置格式错误，请检查');
          return;
        }
      }

      const payload = {
        [tab === 'model' ? 'modelName' : 'appId']: identifier.trim(),
        handler,
        name: name.trim(),
        description: description.trim(),
        config: parsedConfig
      };
      
      if (editingId) {
        if (tab === 'model') await updateModelStrategy(editingId, payload);
        else await updateAppStrategy(editingId, payload);
      } else {
        if (tab === 'model') await createModelStrategy(payload);
        else await createAppStrategy(payload);
      }
      
      resetForm();
      fetch();
    } catch (e: any) {
      alert(e.response?.data?.msg || 'Error saving strategy');
    }
  };

  const handleToggle = async (item: Strategy) => {
    const newStatus = item.status === 'active' ? 'disabled' : 'active';
    try {
      if (tab === 'model') await updateModelStrategy(item.id, { status: newStatus });
      else await updateAppStrategy(item.id, { status: newStatus });
      fetch();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要永久删除此路由配置吗？此操作不可撤销。')) return;
    try {
      if (tab === 'model') await deleteModelStrategy(id);
      else await deleteAppStrategy(id);
      fetch();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">策略管理</h1>
          <p className="text-sm text-slate-500 mt-1">动态注册并分配 App / Model 对应的底层处理逻辑</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setTab('model')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === 'model' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu size={16} />
            模型策略 (Model)
          </button>
          <button
            onClick={() => setTab('app')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === 'app' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Box size={16} />
            应用策略 (App)
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm shadow-blue-200"
          >
            <Plus size={18} />
            {tab === 'model' ? '注册新模型' : '注册新应用'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="text-sm font-bold text-slate-800 mb-4">
            {editingId ? '编辑路由配置' : (tab === 'model' ? '注册新模型路由' : '注册新应用路由')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {tab === 'model' ? 'Model Name (模型标识)' : 'RunningHub App ID (数字 ID)'} *
              </label>
              <input
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={tab === 'model' ? "例如：video-gen-v2" : "例如：12345"}
                className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">处理策略 (Handler) *</label>
              <select
                value={handler}
                onChange={(e) => setHandler(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition bg-white"
              >
                {AVAILABLE_HANDLERS.map(h => (
                  <option key={h.value} value={h.value}>{h.label} ({h.value})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">展示名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：跑马圈文本生成"
                className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">用途说明</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述"
                className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
              />
            </div>
          </div>

          {(tab === 'app' || (tab === 'model' && editingId)) && handler === 'runningHubHandler' && (
            <div className="space-y-2 mb-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                <span>RunningHub 节点配置 (JSON)</span>
                <span className="text-blue-500 font-normal normal-case">提示：填入包含 nodeInfoList 的配置</span>
              </label>
              <textarea
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                rows={6}
                placeholder={`{\n  "nodeInfoList": [\n    { "nodeId": "10", "fieldName": "text", "description": "提示词" },\n    { "nodeId": "584", "fieldName": "image", "description": "参考图" }\n  ]\n}`}
                className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none transition"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={resetForm}
              className="px-6 py-2 text-slate-500 text-sm font-medium hover:bg-slate-50 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              {editingId ? '保存修改' : '确认注册'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">{tab === 'model' ? 'Model Name' : 'App ID'}</th>
                <th className="px-6 py-4">处理策略 (Handler)</th>
                <th className="px-6 py-4">名称</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Cpu size={32} strokeWidth={1.5} />
                      <p>暂无{tab === 'model' ? '模型' : '应用'}策略配置</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-700 font-bold">
                      {k.identifier}
                      {k.config && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-normal">
                          已配置节点
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] text-blue-600 bg-blue-50/50 rounded">
                      {k.handler}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{k.name || '-'}</div>
                      {k.description && <div className="text-[10px] text-slate-400 mt-0.5">{k.description}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        k.status === 'active' 
                          ? 'bg-green-50 text-green-700 border border-green-100' 
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {k.status === 'active' ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                        {k.status === 'active' ? '已启用' : '已禁用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-1">
                      <button
                        onClick={() => handleEdit(k)}
                        className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium transition"
                        title="编辑配置"
                      >
                        <Edit2 size={14} className="inline mr-1" />
                        编辑
                      </button>
                      <button
                        onClick={() => handleToggle(k)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          k.status === 'active' 
                            ? 'text-slate-600 hover:bg-slate-100' 
                            : 'text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        {k.status === 'active' ? '禁用' : '启用'}
                      </button>
                      <button
                        onClick={() => handleDelete(k.id)}
                        className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition"
                      >
                        <Trash2 size={14} className="inline mr-1" />
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
