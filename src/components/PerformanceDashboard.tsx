import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { computePerformanceData, formatPctDecimal, type PerformanceRow } from '../services/performance';
import { formatCurrency } from '../utils/portfolio';

function ResultCell({ value, money = true }: { value: number; money?: boolean }) {
  const color = value < 0 ? 'text-red-600' : value > 0 ? 'text-emerald-700' : 'text-gray-700';
  return <span className={color}>{money ? formatCurrency(value) : value.toFixed(2)}</span>;
}

export default function PerformanceDashboard() {
  const store = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const clientId = store.selectedClientId;
  const client = store.selectedClient;

  const performance = useMemo(() => {
    if (!clientId) return null;
    return computePerformanceData({
      clientId,
      assets: store.assets,
      movements: store.assetMovements,
      strategies: store.strategies,
      subStrategies: store.subStrategies,
      cdiRates: store.cdiRates,
      irBrackets: store.irBrackets,
    });
  }, [clientId, store.assets, store.assetMovements, store.strategies, store.subStrategies, store.cdiRates, store.irBrackets]);

  if (!clientId || !client || !performance) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
        <BarChart3 size={48} className="mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium">Selecione um cliente</p>
      </div>
    );
  }

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const th = 'px-2 py-2 text-xs font-bold text-gray-700 border-b border-gray-300 text-right';
  const td = 'px-2 py-2 text-xs text-right border-b border-gray-100';

  const renderRow = (row: PerformanceRow, level = 0): ReactNode[] => {
    const isOpen = expanded.has(row.id);
    const children = row.children ?? [];
    const pad = level === 0 ? 'pl-3' : level === 1 ? 'pl-8' : 'pl-14';
    const bg = row.kind === 'strategy' ? 'bg-gray-50' : row.kind === 'substrategy' ? 'bg-white' : 'bg-white';
    return [
      <tr key={row.id} className={`${bg} hover:bg-blue-50/40`}>
        <td className={`px-2 py-2 text-xs border-b border-gray-100 text-left ${pad}`}>
          <div className="flex items-center gap-2">
            {children.length > 0 ? (
              <button onClick={() => toggle(row.id)} className="text-gray-400 hover:text-gray-600">
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : <span className="w-[13px]" />}
            <span className={`${row.kind === 'strategy' ? 'font-bold' : 'font-medium'} text-gray-800`}>{row.name}</span>
            {!row.isValid && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">inválido</span>}
          </div>
        </td>
        <td className={td}>{formatPctDecimal(row.portfolioPct)}</td>
        <td className={td}>{formatCurrency(row.currentValue)}</td>
        <td className={td}>{formatCurrency(row.investedCapital)}</td>
        <td className={td}><ResultCell value={row.financialReturn} /></td>
        <td className={td}>{formatCurrency(row.incomeReceived)}</td>
        <td className={td}><ResultCell value={row.totalReturn} /></td>
        <td className={td}>{formatPctDecimal(row.annualIrr)}</td>
        <td className={td}>{formatPctDecimal(row.cdiAnnual)}</td>
        <td className={`${td} ${row.cdiRelative !== undefined && row.cdiRelative < 1 ? 'text-red-600' : 'text-emerald-700'}`}>{formatPctDecimal(row.cdiRelative)}</td>
      </tr>,
      ...(isOpen ? children.flatMap(child => renderRow(child, level + 1)) : []),
    ];
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Performance</h2>
            <p className="text-sm text-gray-500">{client.name} · cálculos por fluxos de caixa gerados dinamicamente</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Valor total</div>
            <div className="font-bold text-lg text-gray-800">{formatCurrency(performance.portfolio.currentValue)}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300 text-left">Estratégias / Ativos</th>
                <th className={th}>Carteira (%)</th>
                <th className={th}>Valor atual</th>
                <th className={th}>Valor aplicado</th>
                <th className={th}>Retorno</th>
                <th className={th}>Juros / Rendimentos</th>
                <th className={th}>Retorno total</th>
                <th className={th}>Rent. a.a</th>
                <th className={th}>CDI</th>
                <th className={th}>Sobre CDI</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-gray-800 text-white font-bold">
                <td className="px-3 py-2 text-xs">TOTAL</td>
                <td className="px-2 py-2 text-xs text-right">100,00%</td>
                <td className="px-2 py-2 text-xs text-right">{formatCurrency(performance.portfolio.currentValue)}</td>
                <td className="px-2 py-2 text-xs text-right">{formatCurrency(performance.portfolio.investedCapital)}</td>
                <td className="px-2 py-2 text-xs text-right">{formatCurrency(performance.portfolio.financialReturn)}</td>
                <td className="px-2 py-2 text-xs text-right">{formatCurrency(performance.portfolio.incomeReceived)}</td>
                <td className="px-2 py-2 text-xs text-right">{formatCurrency(performance.portfolio.totalReturn)}</td>
                <td className="px-2 py-2 text-xs text-right">{formatPctDecimal(performance.portfolio.annualIrr)}</td>
                <td className="px-2 py-2 text-xs text-right">{formatPctDecimal(performance.portfolio.cdiAnnual)}</td>
                <td className="px-2 py-2 text-xs text-right">{formatPctDecimal(performance.portfolio.cdiRelative)}</td>
              </tr>
              {performance.strategies.flatMap(row => renderRow(row))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs text-gray-500">
          A tabela CDI foi movida para a aba <strong>Banco de Dados</strong>, onde voce pode importar, editar e revisar toda a serie diaria global.
        </p>
      </div>
    </div>
  );
}
