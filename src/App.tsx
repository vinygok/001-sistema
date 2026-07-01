import { useState } from 'react';
import { Users, Target, Briefcase, BarChart3, TrendingUp, LayoutDashboard, ChevronRight, Database, Shield, LogOut } from 'lucide-react';
import { useStore } from './store/useStore';
import ClientManager from './components/ClientManager';
import StrategyManager from './components/StrategyManager';
import AssetManager from './components/AssetManager';
import PortfolioDashboard from './components/PortfolioDashboard';
import GeneralOverview from './components/GeneralOverview';
import PerformanceDashboard from './components/PerformanceDashboard';
import DatabaseDashboard from './components/DatabaseDashboard';
import PositionUpdateDashboard from './components/PositionUpdateDashboard';
import Login from './components/Login';
import UserManager from './components/UserManager';
import SetupPassword from './components/SetupPassword';

type Tab = 'dashboard' | 'performance' | 'overview' | 'position_update' | 'database' | 'clients' | 'strategies' | 'assets' | 'users';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = (props: { size?: number; className?: string }) => any;

const allTabs: { id: Tab; label: string; icon: IconComponent; reqMaster?: boolean; hideEndClient?: boolean }[] = [
  { id: 'dashboard', label: 'Portfólio', icon: LayoutDashboard },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'overview', label: 'Quadro Geral', icon: BarChart3 },
  { id: 'position_update', label: 'Atualizar posição', icon: TrendingUp },
  { id: 'database', label: 'Banco de Dados', icon: Database, reqMaster: true },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'strategies', label: 'Estratégias', icon: Target, hideEndClient: true },
  { id: 'assets', label: 'Ativos', icon: Briefcase, hideEndClient: true },
  { id: 'users', label: 'Gestão de Usuários', icon: Shield },
];

export default function App() {
  const store = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('clients');

  // INTERCEPTADOR DE ONBOARDING: Verifica se há um link de convite na URL
  const setupUserId = new URLSearchParams(window.location.search).get('setup');
  if (setupUserId) {
    return <SetupPassword userId={setupUserId} />;
  }

  const currentUser = store.currentUser;
  if (!currentUser) {
    return <Login />;
  }

  const needsClient = activeTab === 'dashboard' || activeTab === 'performance' || activeTab === 'overview' || activeTab === 'position_update' || activeTab === 'strategies' || activeTab === 'assets';
  const noClientSelected = needsClient && !store.selectedClientId;

  // ── MÁGICA DA PERMISSÃO DO CLIENTE FINAL (Direto Meros Capital vs Assessoria) ──
  const selectedClient = store.selectedClient;
  const isDirectEndClient = currentUser.role === 'cliente_final' && selectedClient && !selectedClient.escritorioId;

  // Filtra as abas exibidas de acordo com o nível de permissão (Cascata Multi-Tenant)
  const visibleTabs = allTabs.filter(tab => {
    if (tab.id === 'database' && currentUser.role !== 'master_geral') return false;
    if (tab.id === 'users' && currentUser.role !== 'master_geral' && currentUser.role !== 'escritorio_master' && !currentUser.isCoMaster) return false;
    // Se a aba for de edição (Estratégias / Ativos) e for cliente_final:
    // Só esconde se a carteira atual pertencer a um escritório parceiro (Ex: Miura). Se for direta (Meros Capital), libera a edição!
    if (tab.hideEndClient && currentUser.role === 'cliente_final' && !isDirectEndClient) return false;
    return true;
  });

  const ROLE_NAMES = {
    master_geral: 'Master Geral · Meros Capital',
    escritorio_master: `Gestor Master · ${currentUser.escritorioId?.toUpperCase() || 'Escritório'}`,
    assessor: `Assessor ${currentUser.isCoMaster ? '(Co-Gestor)' : ''} · ${currentUser.escritorioId?.toUpperCase() || 'Escritório'}`,
    cliente_final: 'Investidor Auto-service',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Cabeçalho Institucional */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-[1500px] mx-auto px-4 py-0 flex items-center justify-between gap-4 overflow-x-auto">
          <div className="flex items-center gap-3 py-3 shrink-0">
            <div className="p-2 bg-blue-600 rounded-xl shadow-md shadow-blue-500/20">
              <TrendingUp size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-gray-800 text-lg leading-tight tracking-tight">Meros Wealth</h1>
              <p className="text-[11px] text-blue-600 font-bold leading-tight">by Meros Capital</p>
            </div>
          </div>

          {/* Abas */}
          <nav className="flex items-center h-full shrink-0">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600 font-semibold'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                  {tab.id === 'dashboard' && store.selectedClient && (
                    <span className="text-[11px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                      {store.selectedClient.name.split(' ')[0]}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Indicadores de Usuário e Cliente */}
          <div className="flex items-center gap-3 py-2 shrink-0">
            {store.selectedClient && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                  {store.selectedClient.name.charAt(0)}
                </div>
                <div className="text-xs">
                  <div className="font-bold text-blue-900">{store.selectedClient.name}</div>
                  <div className="text-blue-600 text-[11px] font-medium">{store.selectedClient.institution} · {store.selectedClient.account}</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="text-right">
                <div className="text-xs font-bold text-gray-800">{currentUser.name}</div>
                <div className="text-[11px] font-medium text-gray-500">{ROLE_NAMES[currentUser.role]}</div>
              </div>
              <button
                onClick={() => store.logout()}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                title="Sair do sistema"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[1500px] mx-auto w-full px-4 py-6">
        {/* Alert: no client */}
        {noClientSelected && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 shadow-sm">
            <div className="text-2xl">⚠️</div>
            <div>
              <p className="font-bold text-amber-900">Nenhum cliente selecionado</p>
              <p className="text-sm text-amber-800">
                Selecione um cliente na aba{' '}
                <button
                  onClick={() => setActiveTab('clients')}
                  className="underline font-bold hover:text-amber-950 inline-flex items-center gap-0.5"
                >
                  Clientes <ChevronRight size={13} />
                </button>
                {' '}para acessar os cálculos de portfólio e performance.
              </p>
            </div>
          </div>
        )}
        {/* Telas das abas */}
        {activeTab === 'clients' && (
          <div className="max-w-4xl mx-auto">
            <ClientManager />
            {store.selectedClientId && (
              <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 shadow-sm">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-emerald-900">Carteira Ativa: {store.selectedClient?.name}</p>
                  <p className="text-sm text-emerald-800">
                    {currentUser.role !== 'cliente_final' && (
                      <>
                        Configure a alocação em{' '}
                        <button onClick={() => setActiveTab('strategies')} className="underline font-bold">Estratégias</button>
                        {' '}e{' '}
                        <button onClick={() => setActiveTab('assets')} className="underline font-bold">Ativos</button>
                        , ou{' '}
                      </>
                    )}
                    acesse direto o painel de{' '}
                    <button onClick={() => setActiveTab('dashboard')} className="underline font-bold">Portfólio</button>{' '}
                    e{' '}
                    <button onClick={() => setActiveTab('performance')} className="underline font-bold">Performance</button>.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'strategies' && !noClientSelected && (
          <div className="max-w-3xl mx-auto">
            <StrategyManager />
          </div>
        )}

        {activeTab === 'assets' && !noClientSelected && (
          <div className="max-w-3xl mx-auto">
            <AssetManager />
          </div>
        )}

        {activeTab === 'dashboard' && !noClientSelected && (
          <PortfolioDashboard />
        )}

        {activeTab === 'performance' && !noClientSelected && (
          <PerformanceDashboard />
        )}

        {activeTab === 'overview' && !noClientSelected && (
          <GeneralOverview />
        )}

        {activeTab === 'database' && currentUser.role === 'master_geral' && (
          <DatabaseDashboard />
        )}

        {activeTab === 'position_update' && !noClientSelected && (
          <PositionUpdateDashboard />
        )}

        {activeTab === 'users' && (
          <UserManager />
        )}
      </main>

      {/* Rodapé */}
      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500 font-medium">
        <strong>Meros Wealth</strong> · Gestão Institucional de Portfólios · Criado por <strong>Meros Capital</strong> · © {new Date().getFullYear()}
      </footer>
    </div>
  );
}