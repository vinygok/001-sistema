import { useState } from 'react';
import { Users, Target, Briefcase, BarChart3, TrendingUp, LayoutDashboard, ChevronRight, Database } from 'lucide-react';
import { useStore } from './store/useStore';
import ClientManager from './components/ClientManager';
import StrategyManager from './components/StrategyManager';
import AssetManager from './components/AssetManager';
import PortfolioDashboard from './components/PortfolioDashboard';
import GeneralOverview from './components/GeneralOverview';
import PerformanceDashboard from './components/PerformanceDashboard';
import DatabaseDashboard from './components/DatabaseDashboard';
import PositionUpdateDashboard from './components/PositionUpdateDashboard';

type Tab = 'dashboard' | 'performance' | 'overview' | 'position_update' | 'database' | 'clients' | 'strategies' | 'assets';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = (props: { size?: number; className?: string }) => any;

const tabs: { id: Tab; label: string; icon: IconComponent }[] = [
  { id: 'dashboard', label: 'Portfólio', icon: LayoutDashboard },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'overview', label: 'Quadro Geral', icon: BarChart3 },
  { id: 'position_update', label: 'Atualizar posição', icon: TrendingUp },
  { id: 'database', label: 'Banco de Dados', icon: Database },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'strategies', label: 'Estratégias', icon: Target },
  { id: 'assets', label: 'Ativos', icon: Briefcase },
];

export default function App() {
  const store = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('clients');

  const needsClient = activeTab === 'dashboard' || activeTab === 'performance' || activeTab === 'overview' || activeTab === 'position_update' || activeTab === 'strategies' || activeTab === 'assets';
  const noClientSelected = needsClient && !store.selectedClientId;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top navbar */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 py-0 flex items-center justify-between">
          <div className="flex items-center gap-3 py-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <TrendingUp size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-gray-800 text-lg leading-tight">InvestPortfólio</h1>
              <p className="text-xs text-gray-400 leading-tight">Gestão de Investimentos</p>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex items-center h-full">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                  {tab.id === 'dashboard' && store.selectedClient && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                      {store.selectedClient.name.split(' ')[0]}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Client indicator */}
          {store.selectedClient && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">
                {store.selectedClient.name.charAt(0)}
              </div>
              <div className="text-xs">
                <div className="font-semibold text-blue-800">{store.selectedClient.name}</div>
                <div className="text-blue-500">{store.selectedClient.institution} · {store.selectedClient.account}</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-6">
        {/* Alert: no client */}
        {noClientSelected && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <div className="text-2xl">⚠️</div>
            <div>
              <p className="font-semibold text-amber-800">Nenhum cliente selecionado</p>
              <p className="text-sm text-amber-700">
                Selecione um cliente na aba{' '}
                <button
                  onClick={() => setActiveTab('clients')}
                  className="underline font-semibold hover:text-amber-900 inline-flex items-center gap-0.5"
                >
                  Clientes <ChevronRight size={13} />
                </button>
                {' '}para acessar esta funcionalidade.
              </p>
            </div>
          </div>
        )}

        {/* Tab content */}
        {activeTab === 'clients' && (
          <div className="max-w-3xl mx-auto">
            <ClientManager />
            {store.selectedClientId && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-semibold text-green-800">Cliente selecionado: {store.selectedClient?.name}</p>
                  <p className="text-sm text-green-700">
                    Agora você pode ir para{' '}
                    <button onClick={() => setActiveTab('strategies')} className="underline font-semibold">Estratégias</button>
                    {' '}e{' '}
                    <button onClick={() => setActiveTab('assets')} className="underline font-semibold">Ativos</button>
                    {' '}para configurar o portfólio, ou ir direto para{' '}
                    <button onClick={() => setActiveTab('dashboard')} className="underline font-semibold">Portfólio</button>.
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

        {activeTab === 'database' && (
          <DatabaseDashboard />
        )}

        {activeTab === 'position_update' && !noClientSelected && (
          <PositionUpdateDashboard />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-3 text-center text-xs text-gray-400">
        InvestPortfólio · Gestão de Carteiras de Investimentos · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
