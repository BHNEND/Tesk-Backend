import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Terminal, Info, BookOpen, AlertTriangle } from 'lucide-react';

const ApiDocs = () => {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 行业规范：使用 BASE_URL 自动适应不同的部署子路径
    const docUrl = `${import.meta.env.BASE_URL}api.md`;
    
    fetch(docUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`文档获取失败 (HTTP ${res.status})`);
        return res.text();
      })
      .then((text) => {
        setMarkdown(text);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setMarkdown(`# 文档加载失败\n\n路径: \`${docUrl}\`\n\n错误信息: \`${err.message}\``);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/* Header Area */}
      <div className="border-b pb-8">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="text-blue-600" size={32} />
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">API 开发文档</h1>
        </div>
        <p className="text-slate-600 leading-relaxed">
          欢迎使用 Tesk 后端中转服务接口。本系统采用异步任务模式，提交任务后请通过 Webhook 或轮询接口获取结果。
          <br/>
          <span className="text-sm text-slate-400 mt-2 block italic">提示：本页内容动态同步自 docs/api.md</span>
        </p>
      </div>

      {/* Main Content Area */}
      <div className="prose prose-slate max-w-none 
        prose-headings:text-slate-800 prose-headings:font-bold 
        prose-h2:text-xl prose-h2:mt-12 prose-h2:pb-3 prose-h2:border-b
        prose-h3:text-lg prose-h3:mt-8
        prose-p:text-slate-600 prose-p:leading-7
        prose-table:border prose-table:rounded-lg prose-table:overflow-hidden
        prose-th:bg-slate-50 prose-th:px-4 prose-th:py-3 prose-th:text-slate-700
        prose-td:px-4 prose-td:py-3 prose-td:border-t
        prose-code:bg-slate-100 prose-code:text-blue-600 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-slate-900 prose-pre:text-blue-300 prose-pre:p-6 prose-pre:rounded-xl prose-pre:shadow-lg
        prose-strong:text-slate-900
        prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:p-4 prose-blockquote:rounded-r-lg prose-blockquote:text-slate-700
      ">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            // 针对不同区块渲染特定的 UI 装饰（可选，通过 header 识别）
            h2: ({node, ...props}) => {
              const icons: Record<string, any> = {
                '认证方式': Info,
                '任务状态': AlertTriangle,
                '任务接口': Terminal,
                '参数映射规范': Info,
                '映射关系': Info
              };
              const Icon = Object.entries(icons).find(([k]) => String(props.children).includes(k))?.[1] || Info;
              return (
                <h2 {...props} className="flex items-center gap-3">
                  <Icon className="text-blue-500 shrink-0" size={22} />
                  {props.children}
                </h2>
              );
            }
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default ApiDocs;
