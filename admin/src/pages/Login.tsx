import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../api';
import { ShieldCheck, User, Lock, ArrowRight, AlertCircle } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await adminLogin({ username, password });
      if (data.code === 200) {
        // 保存 Token 到 localStorage
        localStorage.setItem('admin_token', data.data.token);
        // 跳转到首页
        navigate('/');
      } else {
        setError(data.msg || '登录失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.msg || '账号或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-xl shadow-blue-200 mb-4">
            <ShieldCheck className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight italic">TESK ADMIN</h1>
          <p className="text-slate-500 text-sm mt-2">任务中转管理后台</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">管理员账号</label>
                <div className="relative group">
                  <User className="absolute left-3 top-3 text-slate-400 group-focus-within:text-blue-600 transition" size={18} />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                    placeholder="Username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">验证密码</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-3 text-slate-400 group-focus-within:text-blue-600 transition" size={18} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                    placeholder="Password"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-medium animate-in shake duration-300">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 group transition-all transform active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  进入管理后台
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition" />
                </>
              )}
            </button>
          </form>
          
          <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>SECURE ACCESS ONLY</span>
            <span>V1.0.0</span>
          </div>
        </div>
        
        <p className="text-center mt-8 text-slate-400 text-xs">
          请使用环境变量配置的管理员凭证进行登录
        </p>
      </div>
    </div>
  );
};

export default Login;
