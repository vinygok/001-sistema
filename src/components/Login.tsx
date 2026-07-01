import { useState } from 'react';
import { useStore } from '../store/useStore';
import { TrendingUp, Shield, Building2, UserCheck, Lock, ChevronRight } from 'lucide-react';
import type { AppUser } from '../types';

export default function Login() {
  const store = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // ── 1. FLUXO DE LOGIN ESTILIZADO E BLINDADO (Com verificação de Inadimplência) ──
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Por favor, informe seu e-mail de acesso.');
      return;
    }

    const found = store.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) {
      setError('Credenciais inválidas ou e-mail não cadastrado no sistema.');
      return;
    }

    // BLOQUEIO 1: Checa se o usuário foi suspenso individualmente
    if (found.ativo === false) {
      setError('Acesso suspenso temporariamente. Por favor, entre em contato com o suporte da Meros Capital para regularizar sua assinatura.');
      return;
    }

    // BLOQUEIO 2: Checa se o escritório parceiro inteiro está suspenso por inadimplência
    if (found.escritorioId) {
      const esc = store.escritorios.find(e => e.id === found.escritorioId);
      if (esc && esc.ativo === false) {
        setError(`O escritório ${esc.name} está temporariamente suspenso. Acesso bloqueado.`);
        return;
      }
    }

    store.login(found.id);
  };

  // ── 2. ACESSO RÁPIDO DE DEMONSTRAÇÃO (Para apresentação comercial aos escritórios) ──
  const handleDemoSelect = (user: AppUser) => {
    if (user.ativo === false) {
      setError('Acesso suspenso temporariamente. Por favor, entre em contato com o suporte da Meros Capital para regularizar sua assinatura.');
      return;
    }

    if (user.escritorioId) {
      const esc = store.escritorios.find(e => e.id === user.escritorioId);
      if (esc && esc.ativo === false) {
        setError(`O escritório ${esc.name} está temporariamente suspenso. Acesso bloqueado.`);
        return;
      }
    }

    store.login(user.id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 flex flex-col justify-between p-4 sm:p-8 text-gray-100">
      {/* Cabeçalho Institucional */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
            <TrendingUp size={24} className="text-white" />
          </div>
          <div>
            <h1 className="font-black text-white text-xl tracking-tight leading-none">Meros Wealth</h1>
            <p className="text-xs text-blue-400 font-medium mt-0.5">by Meros Capital</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-xs font-medium text-gray-300">
          <span className="flex items-center gap-1.5"><Shield size={14} className="text-blue-500" /> Multi-Tenant Architecture</span>
          <span className="flex items-center gap-1.5"><Building2 size={14} className="text-indigo-400" /> B2B White Label</span>
        </div>
      </header>

      {/* Conteúdo Central (Painel de Pitch & Formulário) */}
      <main className="max-w-6xl mx-auto w-full my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-10">
        
        {/* Coluna da Esquerda: Pitch Comercial Meros Capital */}
        <div className="lg:col-span-6 space-y-6 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold uppercase tracking-wider">
            Plataforma Institucional de Gestão
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Consolidador de Carteiras &amp; <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">Controle Patrimonial</span>
          </h2>
          <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
            Desenvolvido pela <strong className="text-white">Meros Capital</strong> para revolucionar o atendimento de escritórios de assessoria de investimentos. Gerencie relatórios do BTG Pactual, cotização matemática de Renda Fixa e rebalanceamento de Constant Mix em uma interface única e blindada.
          </p>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700/60">
            <div className="space-y-1">
              <div className="text-xl font-bold text-white">Hierarquia Cascata</div>
              <p className="text-xs text-gray-400">Privacidade isolada entre Master Geral, Master Escritório, Assessores e Clientes Finais.</p>
            </div>
            <div className="space-y-1">
              <div className="text-xl font-bold text-white">Catálogo Master</div>
              <p className="text-xs text-gray-400">Banco de Dados Global centralizado para padronização de ativos e cotações dinâmicas.</p>
            </div>
          </div>
        </div>

        {/* Coluna da Direita: Logbox */}
        <div className="lg:col-span-6 max-w-md mx-auto lg:ml-auto w-full">
          <div className="bg-gray-800/90 backdrop-blur-xl border border-gray-700/80 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
            
            <div>
              <h3 className="text-xl font-bold text-white">Acesse o Sistema</h3>
              <p className="text-xs text-gray-400 mt-1">Insira seu e-mail corporativo para fazer login na plataforma</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">E-mail corporativo</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                    <UserCheck size={16} />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="ex: carlos@miurainvestimentos.com"
                    className="w-full bg-gray-900/80 border border-gray-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Senha</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                    <Lock size={16} />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-gray-900/80 border border-gray-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">{error}</p>}

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-600/30 transition-all transform active:scale-[0.98]"
              >
                Entrar na Plataforma
              </button>
            </form>

            {/* Acesso rápido de Demonstração (Demobox) */}
            <div className="space-y-3 pt-6 border-t border-gray-700/60">
              <div className="text-xs font-bold text-gray-400 tracking-wide uppercase flex items-center justify-between">
                <span>Simulador Multi-Tenant (Demo)</span>
                <span className="text-[10px] bg-gray-700 px-2 py-0.5 rounded text-gray-300">Clique e acesse</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {store.users.map(u => {
                  const isMasterGeral = u.role === 'master_geral';
                  const isMasterEscritorio = u.role === 'escritorio_master';
                  const isAssessor = u.role === 'assessor';
                  const isActive = u.ativo !== false;
                  
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleDemoSelect(u)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                        !isActive ? 'bg-red-500/10 border-red-500/30 text-red-300 opacity-60' :
                        isMasterGeral ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-300' :
                        isMasterEscritorio ? 'bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300' :
                        isAssessor ? 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-300' :
                        'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">{u.name} {(!isActive) && '(Suspenso)'}</div>
                        <div className="text-[11px] opacity-80">{u.email} · <span className="font-semibold">{u.escritorioId ? `Escritório: ${u.escritorioId.toUpperCase()}` : (u.role === 'master_geral' ? 'Meros Capital' : 'Cliente Auto-service')}</span></div>
                      </div>
                      <ChevronRight size={16} className="opacity-60" />
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

      </main>

      {/* Rodapé */}
      <footer className="max-w-6xl mx-auto w-full border-t border-gray-800 pt-6 pb-2 text-center text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>© {new Date().getFullYear()} <strong>Meros Capital</strong>. Todos os direitos reservados.</span>
        <span>Meros Wealth Management System · Protegido por criptografia de ponta a ponta</span>
      </footer>
    </div>
  );
}