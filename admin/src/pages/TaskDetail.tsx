import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTask } from '../api';
import StatusBadge from '../components/StatusBadge';

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;
    getTask(taskId)
      .then(({ data }) => setTask(data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <div className="text-gray-500">加载中...</div>;
  if (!task) return <div className="text-red-500">任务不存在</div>;

  const fields: [string, string][] = [
    ['Task ID', 'id'],
    ['模型', 'model'],
    ['渠道', 'channel'],
    ['状态', 'state'],
    ['回调 URL', 'callBackUrl'],
    ['进度回调 URL', 'progressCallBackUrl'],
    ['失败码', 'failCode'],
    ['失败信息', 'failMsg'],
    ['耗时', 'costTime'],
    ['创建时间', 'createTime'],
    ['更新时间', 'updateTime'],
    ['完成时间', 'completeTime'],
  ];

  const jsonFields: [string, string][] = [
    ['输入参数', 'param'],
    ['返回结果', 'resultJson'],
    ['原始错误 (内部排查)', 'rawError'],
  ];

  return (
    <div>
      <button
        onClick={() => navigate('/tasks')}
        className="text-blue-600 hover:underline text-sm mb-4 inline-block"
      >
        ← 返回任务列表
      </button>
      <h2 className="text-xl font-bold text-gray-800 mb-6">任务详情</h2>
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        {fields.map(([label, key]) => (
          <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1">
            <span className="text-sm text-gray-500 w-28 shrink-0">{label}</span>
            <span className="text-sm">
              {key === 'state' ? (
                <StatusBadge state={String(task[key] || '')} />
              ) : key === 'channel' ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                  task[key] === 'economy'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-blue-50 text-blue-700 border border-blue-100'
                }`}>
                  {task[key] === 'economy' ? '经济版' : '标准版'}
                </span>
              ) : key === 'costTime' && task[key] != null ? (
                `${(Number(task[key]) / 1000).toFixed(1)}s`
              ) : (
                String(task[key] ?? '-')
              )}
            </span>
          </div>
        ))}
        {jsonFields.map(([label, key]) => {
          const val = task[key];
          if (!val) return null;
          return (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">{label}</span>
              <pre className="bg-gray-50 rounded p-3 text-xs overflow-auto max-h-64">
                {typeof val === 'string' ? JSON.stringify(JSON.parse(val), null, 2) : JSON.stringify(val, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
