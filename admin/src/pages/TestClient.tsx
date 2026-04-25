import { useState, useEffect, useRef } from 'react';
import { Play, Search, Loader2, CheckCircle2, XCircle, Info, Copy, Braces, ArrowRightLeft, Eye } from 'lucide-react';
import { createTask, getJobRecord, getApiKeys, getAppStrategies, getModelStrategies, previewTask } from '../api';

const TEXT_TO_IMAGE_TEMPLATE = {
  prompt: "A beautiful sunset over the ocean",
  aspect_ratio: "auto"
};

const IMAGE_EDIT_TEMPLATE = {
  prompt: "将他们合并在一个图片里面",
  image_urls: [
    "https://example.com/image1.png",
    "https://example.com/image2.png"
  ],
  aspect_ratio: "1:1",
  resolution: "1k",
  extra: {
    n: 1
  }
};

const APP_TASK_TEMPLATE = {
  prompt: "女人站起身来，旋转一圈。",
  image_urls: [
    "https://example.com/ref.png"
  ],
  duration: 5
};

const GEMINI_IMAGE_TEMPLATE = {
  prompt: "A photorealistic close-up portrait of a cute cat wearing sunglasses",
  aspect_ratio: "16:9",
  resolution: "2k"
};

export default function TestClient() {
  const [taskType, setTaskType] = useState<'model' | 'app'>('app');
  const [channel, setChannel] = useState<'standard' | 'economy'>('standard');
  const [identifier, setIdentifier] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('https://webhook.site/test');
  const [inputJson, setInputJson] = useState(JSON.stringify(TEXT_TO_IMAGE_TEMPLATE, null, 2));

  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [submitRes, setSubmitRes] = useState<any>(null);

  const [queryTaskId, setQueryTaskId] = useState('');
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [autoPoll, setAutoPoll] = useState(false);
  const pollTimer = useRef<any>(null);

  const [modelOptions, setModelOptions] = useState<any[]>([]);
  const [appOptions, setAppOptions] = useState<any[]>([]);

  // 自动填充逻辑
  useEffect(() => {
    const loadDefaults = async () => {
      setLoadingDefaults(true);
      try {
        const { data: keysRes } = await getApiKeys();
        const allKeys = keysRes.data?.list || keysRes.data || [];
        const activeKey = allKeys.find((k: any) => k.status === 'active');
        if (activeKey) setApiKey(activeKey.key);

        const { data: modelRes } = await getModelStrategies();
        const models = modelRes.data || [];
        setModelOptions(models);

        const { data: appRes } = await getAppStrategies();
        const apps = appRes.data || [];
        setAppOptions(apps);

        if (taskType === 'app') {
          if (apps.length > 0) setIdentifier(apps[0].appName || apps[0].appid);
        } else {
          if (models.length > 0) setIdentifier(models[0].modelName);
        }
      } catch (e) {
        console.error('Failed to load defaults', e);
      } finally {
        setLoadingDefaults(false);
      }
    };
    loadDefaults();
  }, [taskType]);

  const handleCreate = async () => {
    if (!apiKey) return alert('请输入 API Key');
    if (!identifier) return alert('请输入标识符');
    let input;
    try { input = JSON.parse(inputJson); } catch (e) { return alert('JSON 格式不正确'); }

    setSubmitting(true);
    setSubmitRes(null);
    setPreviewData(null);
    try {
      const payload: any = { type: taskType, callBackUrl: callbackUrl, input, channel };
      if (taskType === 'app') payload.appid = identifier;
      else payload.model = identifier;

      const { data } = await createTask(apiKey, payload);
      setSubmitRes(data);
      if (data.code === 200 && data.data?.taskId) {
        setQueryTaskId(data.data.taskId);
        if (autoPoll) startPolling(data.data.taskId);
        else fetchStatus(data.data.taskId);
      }
    } catch (err: any) {
      setSubmitRes(err.response?.data || { msg: err.message });
    } finally { setSubmitting(false); }
  };

  const handlePreview = async () => {
    if (!apiKey) return alert('请输入 API Key');
    if (!identifier) return alert('请输入标识符');
    let input;
    try { input = JSON.parse(inputJson); } catch (e) { return alert('JSON 格式不正确'); }

    setPreviewing(true);
    setPreviewData(null);
    try {
      const payload: any = { type: taskType, callBackUrl: callbackUrl, input };
      if (taskType === 'app') payload.appid = identifier;
      else payload.model = identifier;

      const { data } = await previewTask(apiKey, payload);
      if (data.code === 200) {
        setPreviewData(data.data);
      } else { alert(data.msg); }
    } catch (err: any) {
      alert(err.response?.data?.msg || err.message);
    } finally { setPreviewing(false); }
  };

  const fetchStatus = async (tid?: string) => {
    const id = tid || queryTaskId;
    if (!id || !apiKey) return;
    try {
      const { data } = await getJobRecord(apiKey, id);
      if (data.code === 200 && data.data) {
        setTaskStatus(data.data);
        if (['SUCCESS', 'FAILED'].includes(data.data?.state)) {
          stopPolling();
        }
      } else {
        alert(data.msg || '查询失败：任务可能不存在');
      }
    } catch (err: any) {
      console.error(err);
      alert('查询出错: ' + (err.response?.data?.msg || err.message));
    }
  };

  const startPolling = (tid: string) => {
    stopPolling();
    fetchStatus(tid);
    pollTimer.current = setInterval(() => fetchStatus(tid), 3000);
  };

  const stopPolling = () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setAutoPoll(false);
  };

  useEffect(() => {
    if (autoPoll && queryTaskId) startPolling(queryTaskId);
    else stopPolling();
    return () => stopPolling();
  }, [autoPoll]);

  const findImageUrls = (obj: any): string[] => {
    let urls: string[] = [];
    if (!obj) return urls;
    if (Array.isArray(obj?.resultUrls)) return obj.resultUrls;
    for (let k in obj) {
      if (typeof obj[k] === 'string' && obj[k].startsWith('http') && obj[k].match(/\.(jpeg|jpg|gif|png|webp|mp4)/i)) {
        urls.push(obj[k]);
      } else if (typeof obj[k] === 'object') {
        urls = urls.concat(findImageUrls(obj[k]));
      }
    }
    return urls;
  };

  const imageUrls = findImageUrls(taskStatus?.resultJson);

  const options = taskType === 'model' ? modelOptions : appOptions;
  const optionsEmpty = options.length === 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">接口测试工具</h1>
          <p className="text-sm text-slate-500 mt-1">模拟客户端发起任务请求，验证策略配置是否通畅</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
          <Info size={14} />
          仅供本地开发与验证使用
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <Play size={18} className="text-blue-600" />
              <h2 className="font-semibold text-slate-800">1. 发起任务 (Create Task)</h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    API Key {loadingDefaults && <Loader2 size={10} className="animate-spin" />}
                  </label>
                  <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Callback URL</label>
                  <input type="text" value={callbackUrl} onChange={e => setCallbackUrl(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">任务类型</label>
                  <select value={taskType} onChange={e => setTaskType(e.target.value as any)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" >
                    <option value="app">App Task (应用)</option>
                    <option value="model">Model Task (模型)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">渠道 (Channel)</label>
                  <select value={channel} onChange={e => setChannel(e.target.value as any)} disabled={taskType === 'app'} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-50 disabled:cursor-not-allowed" >
                    <option value="standard">标准版 (Standard)</option>
                    <option value="economy">经济版 (Economy)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{taskType === 'app' ? 'App Name (应用名称)' : 'Model Name (模型名称)'}</label>
                {optionsEmpty ? (
                  <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={taskType === 'model' ? "暂无模型策略，手动输入" : "暂无应用策略，手动输入"} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                ) : (
                  <select value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" >
                    {taskType === 'model'
                      ? modelOptions.map((m: any) => <option key={m.modelName} value={m.modelName}>{m.modelName}</option>)
                      : appOptions.map((a: any) => <option key={a.appName || a.appid} value={a.appName || a.appid}>{a.appName || a.appid}</option>)
                    }
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Input JSON (任务参数)</label>
                  <div className="flex gap-2">
                    <button onClick={() => setInputJson(JSON.stringify(TEXT_TO_IMAGE_TEMPLATE, null, 2))} className="text-[10px] text-blue-600 hover:underline">文生图</button>
                    <button onClick={() => setInputJson(JSON.stringify(IMAGE_EDIT_TEMPLATE, null, 2))} className="text-[10px] text-orange-600 hover:underline">图片编辑</button>
                    <button onClick={() => setInputJson(JSON.stringify(APP_TASK_TEMPLATE, null, 2))} className="text-[10px] text-purple-600 hover:underline">应用任务</button>
                    <button onClick={() => setInputJson(JSON.stringify(GEMINI_IMAGE_TEMPLATE, null, 2))} className="text-[10px] text-teal-600 hover:underline">Gemini生图</button>
                  </div>
                </div>
                <textarea value={inputJson} onChange={e => setInputJson(e.target.value)} rows={8} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition" />
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={handleCreate} disabled={submitting || previewing} className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 disabled:bg-slate-300 transition shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} 发送测试任务
                </button>
                <button onClick={handlePreview} disabled={submitting || previewing} className="w-full bg-white text-blue-600 border border-blue-200 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-50 disabled:bg-slate-50 transition flex items-center justify-center gap-2">
                  {previewing ? <Loader2 size={18} className="animate-spin" /> : <Eye size={18} />} 预览映射转换 (不执行)
                </button>
              </div>
            </div>
          </section>

          {submitRes && (
            <section className="bg-slate-900 rounded-xl p-4 overflow-hidden relative group">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Submit Response</span>
                <button onClick={() => navigator.clipboard.writeText(JSON.stringify(submitRes))} className="text-slate-500 hover:text-white transition"><Copy size={12} /></button>
              </div>
              <pre className="text-blue-300 text-[11px] font-mono overflow-auto max-h-40">{JSON.stringify(submitRes, null, 2)}</pre>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {(taskStatus?.upstreamRequest || previewData) && (
            <section className="bg-purple-50 rounded-xl border border-purple-200 overflow-hidden border-dashed animate-in fade-in duration-300">
              <div className="px-6 py-3 bg-white border-b border-purple-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft size={16} className="text-purple-600" />
                  <h2 className="text-sm font-bold text-slate-700">{previewData ? '预览：参数映射结果' : '上游 API 请求调试 (Upstream Trace)'}</h2>
                </div>
                {previewData && <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold">DRY RUN</span>}
              </div>
              <div className="p-4 space-y-3">
                {previewData?.meta && (
                  <div className="flex gap-3 flex-wrap">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                      标识符: {previewData.meta.identifier}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100">
                      Handler: {previewData.meta.handler}
                    </span>
                    {previewData.meta.platform && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-green-50 text-green-700 border border-green-100">
                        平台: {previewData.meta.platform}
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Endpoint URL</span>
                  <div className="bg-white border border-slate-200 rounded px-2 py-1 text-[10px] font-mono text-slate-600 break-all">{previewData ? previewData.url : taskStatus?.upstreamRequest?.url}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Method</span>
                  <div className="bg-white border border-slate-200 rounded px-2 py-1 text-[10px] font-mono text-slate-600">{previewData ? previewData.method : 'POST'}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Headers</span>
                  <pre className="bg-slate-900 text-green-300 p-3 rounded-lg text-[10px] font-mono overflow-auto max-h-32 shadow-inner">
                    {JSON.stringify(previewData?.headers || { "Content-Type": "application/json", "Authorization": "Bearer ***" }, null, 2)}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Request Body</span>
                  <pre className="bg-slate-900 text-purple-300 p-3 rounded-lg text-[10px] font-mono overflow-auto max-h-60 shadow-inner">
                    {JSON.stringify(previewData ? previewData.body : taskStatus?.upstreamRequest?.body, null, 2)}
                  </pre>
                </div>
              </div>
            </section>
          )}

          <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2"><Search size={18} className="text-blue-600" /><h2 className="font-semibold text-slate-800">2. 任务状态 (Status)</h2></div>
              {taskStatus && <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${taskStatus.state === 'SUCCESS' ? 'bg-green-50 text-green-700 border-green-100' : taskStatus.state === 'FAILED' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{taskStatus.state}</div>}
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <input type="text" value={queryTaskId} onChange={e => setQueryTaskId(e.target.value)} placeholder="Task ID (task_...)" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition" />
                <button
                  onClick={() => {
                    if (!queryTaskId) return alert('请先输入要查询的 Task ID');
                    setTaskStatus(null);
                    fetchStatus();
                  }}
                  className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition border border-slate-200"
                >
                  查询
                </button>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${autoPoll ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <input type="checkbox" className="hidden" checked={autoPoll} onChange={e => setAutoPoll(e.target.checked)} /><div className={`w-4 h-4 bg-white rounded-full transition-transform ${autoPoll ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-xs font-medium text-slate-600">自动轮询 (3s)</span>
                </label>
                {autoPoll && <Loader2 size={12} className="text-blue-500 animate-spin" />}
              </div>
              <div className="relative">
                <div className="absolute right-3 top-3"><Braces size={14} className="text-slate-300" /></div>
                <pre className="w-full border border-slate-100 rounded-xl p-4 text-[10px] font-mono bg-slate-50 text-slate-700 min-h-[200px] max-h-[300px] overflow-auto">{taskStatus ? JSON.stringify(taskStatus, null, 2) : '等待查询数据...'}</pre>
              </div>
            </div>
          </section>

          {taskStatus?.state === 'SUCCESS' && (
            <section className="bg-white rounded-xl shadow-sm border border-green-200 overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="px-6 py-4 bg-green-50 border-b border-green-100 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-600" />
                <h2 className="font-semibold text-green-800">3. 执行结果 (Result)</h2>
              </div>
              <div className="p-6 space-y-4">
                {imageUrls.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {imageUrls.map((url, i) => (
                      <div key={i} className="group relative rounded-lg overflow-hidden border shadow-sm">
                        {url.match(/\.(mp4|webm)/i) ? (
                          <video src={url} controls className="w-full" />
                        ) : (
                          <img src={url} alt="result" className="w-full object-contain bg-slate-50" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2"><a href={url} target="_blank" className="p-2 bg-white rounded-full text-slate-900 hover:scale-110 transition"><Info size={20} /></a></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic text-center py-4">任务成功，但未在响应中检测到可预览的媒体链接。</p>
                )}
              </div>
            </section>
          )}

          {taskStatus?.state === 'FAILED' && (
            <section className="bg-red-50 rounded-xl border border-red-100 p-6 flex flex-col items-center gap-3 animate-in shake-in duration-500">
              <XCircle size={40} className="text-red-500" /><div className="text-center"><h3 className="font-bold text-red-900">任务执行失败</h3><p className="text-xs text-red-600 mt-1">{taskStatus.failMsg || '未知错误'}</p></div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
