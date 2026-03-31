import { useEffect, useState } from 'react';
import { getApiKeys, createApiKey, updateApiKey, deleteApiKey } from '../api';

interface ApiKey {
  id: string;
  key: string;
  name: string;
  status: number;
  create_time: string;
}

export default function ApiKeyList() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

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
    await updateApiKey(item.id, { status: item.status === 1 ? 0 : 1 });
    fetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此 API Key 吗？')) return;
    await deleteApiKey(id);
    fetch();
  };

  const maskKey = (key: string) => key.slice(0, 8) + '...' + key.slice(-4);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">API Key 管理</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
        >
          + 创建 API Key
        </button>
      </div>

      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
          <p className="text-sm text-green-700 mb-1">✅ API Key 创建成功（请妥善保存，仅显示一次）：</p>
          <code className="text-xs bg-white px-2 py-1 rounded break-all select-all">{createdKey}</code>
          <button onClick={() => setCreatedKey(null)} className="ml-2 text-green-700 text-xs underline">关闭</button>
        </div>
      )}

      {showCreate && (
        <div className="bg-white rounded-lg shadow p-4 mb-4 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="输入名称"
            className="border rounded px-3 py-1.5 text-sm flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm"
          >
            确认
          </button>
          <button
            onClick={() => setShowCreate(false)}
            className="text-gray-500 px-3 py-1.5 text-sm"
          >
            取消
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">加载中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-lg shadow text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">暂无数据</td></tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="border-t">
                    <td className="px-4 py-3 font-mono text-xs">{maskKey(k.key)}</td>
                    <td className="px-4 py-3">{k.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${k.status === 1 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {k.status === 1 ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{k.create_time}</td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        onClick={() => handleToggle(k)}
                        className={`text-xs px-2 py-1 rounded ${k.status === 1 ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                      >
                        {k.status === 1 ? '禁用' : '启用'}
                      </button>
                      <button
                        onClick={() => handleDelete(k.id)}
                        className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
