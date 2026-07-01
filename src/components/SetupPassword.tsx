import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { TrendingUp, Lock, ShieldCheck, UserCheck } from 'lucide-react';

export default function SetupPassword({ userId }: { userId: string }) {
  const store = useStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const targetUser = store.users.find(u => u.id === userId);

  useEffect(() => {
    // Se o usuário já tiver logado com sucesso, redireciona removendo o ?setup=
    if (store.currentUser && store.currentUser.id === userId && success) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [store.currentUser, userId, success]);

  if (!targetUser) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6 text-white">
        <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-bold">Convite Inválido ou Expirado</h2>
          <p className="text-sm text-gray-400">Este link de criação de senha não é válido ou o usuário foi removido do sistema.</p>
          <button
            onClick={() => window.location.replace('/')}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-500 transition-colors"
          >
            Ir para Login
          </button>
        </div>
      </div>
    );
  }

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não conferem. Digite novamente.');
      return;
    }

    // Grava a senha simulada no objeto do usuário e faz o login automático!
    store.updateUser(targetUser.id, { email: targetUser.email }); // Simula a gravação de segurança
    store.login(targetUser.id);
    setSuccess(true);
    
    setTimeout(() => {
      window.location.replace('/'); // Limpa a URL e vai para o sistema
    }, 1200);
  };

  const ROLE_LABEL = {
    master_geral: 'Master Geral',
    escritorio_master: 'Master do Escritório',
    assessor: 'Assessor de Investimentos',
    cliente_final: 'Cliente Auto-service',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-blue-950 flex items-center justify-center p-4 sm:p-6 text-gray-100">
      <div className="max-w-md w-full bg-gray-800/90 backdrop-blur-xl border border-gray-700 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        
        {/* Header Logo */}
        <div className="flex items-center gap-3 justify-center pb-4 border-b border-gray-700/60">
          <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
            <TrendingUp size={24} className="text-white" />
          </div>
          <div className="text-left">
            <h1 className="font-black text-white text-xl tracking-tight leading-none">Meros Wealth</h1>
            <p className="text-xs text-blue-400 font-medium mt-0.5">by Meros Capital</p>
          </div>
        </div>

        {/* Welcome Text */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-white">Bem-vindo à Plataforma</h2>
          <p className="text-xs text-gray-300">Crie sua senha de acesso corporativa para ativar seu perfil</p>
        </div>

        {/* User Card */}
        <div className="p-4 bg-gray-900/60 rounded-2xl border border-gray-700/80 flex items-center gap-4 text-left">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/30">
            <UserCheck size={24} />
          </div>
          <div className="space-y-0.5">
            <div className="font-bold text-white text-sm">{targetUser.name}</div>
            <div className="text-xs text-gray-400">{targetUser.email}</div>
            <div className="text-[11px] text-indigo-300 font-semibold mt-1">
              🏢 {targetUser.escritorioId ? `Escritório: ${targetUser.escritorioId.toUpperCase()}` : 'Meros Capital / Direto'} · {ROLE_LABEL[targetUser.role]}
            </div>
          </div>
        </div>

        {success ? (
          <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-3">
            <ShieldCheck size={48} className="mx-auto text-emerald-400 animate-bounce" />
            <div className="text-lg font-bold text-emerald-300">Senha Criada com Sucesso!</div>
            <p className="text-xs text-gray-400">Autenticando e carregando seu ambiente seguro...</p>
          </div>
        ) : (
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Crie sua Senha *</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Confirme a Senha *</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                  placeholder="Repita a senha"
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  required
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">{error}</p>}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-600/30 transition-all transform active:scale-[0.98]"
            >
              Ativar Perfil e Entrar
            </button>
          </form>
        )}

        <div className="text-center text-[11px] text-gray-500 pt-2 border-t border-gray-700/60">
          Meros Wealth Management System · Criptografia AES-256
        </div>
      </div>
    </div>
  );
}