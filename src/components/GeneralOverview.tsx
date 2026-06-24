import { useStore } from '../store/useStore';
import { computePortfolio, formatCurrency, formatPct } from '../utils/portfolio';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function GeneralOverview() {
  const store = useStore();
  const clientId = store.selectedClientId;

  if (!clientId) return null;

  const portfolio = computePortfolio(
    store.strategies,
    store.subStrategies,
    store.assets,
    store.draftNotes,
    clientId
  );

  const thClass = "text-center text-xs font-bold py-2 px-3 uppercase tracking-wide";
  const tdClass = "px-3 py-2 text-xs";
  const numClass = "text-right font-mono";

  function BalBadge({ value }: { value: number }) {
    if (Math.abs(value) < 0.01) return <span className="text-gray-400 font-mono text-xs flex items-center gap-1"><Minus size={11} />R$ 0,00</span>;
    if (value > 0) return (
      <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">
        <TrendingUp size={11} />{formatCurrency(value)}
      </span>
    );
    return (
      <span className="text-red-500 font-bold text-xs flex items-center gap-1">
        <TrendingDown size={11} />{formatCurrency(value)}
      </span>
    );
  }

  const totalBalance = portfolio.strategies.reduce((s, st) => s + (st.idealValue - st.currentValue), 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
        <div className="p-2 bg-purple-50 rounded-lg">
          <BarChart3 size={20} className="text-purple-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-800">Quadro Geral — Patrimônio Atual</h2>
          <p className="text-xs text-gray-500">Visão consolidada por estratégia</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className={`${thClass} text-left pl-6 text-white`} rowSpan={2}>ESTRATÉGIA / SUBESTRATÉGIA</th>
              <th className={`${thClass} text-white border-l border-gray-600`} colSpan={2}>IDEAL</th>
              <th className={`${thClass} text-white border-l border-gray-600`} colSpan={2}>ATUAL</th>
              <th className={`${thClass} text-white border-l border-gray-600`} rowSpan={2}>BALANCEAMENTO</th>
            </tr>
            <tr className="bg-gray-700 text-white">
              <th className={`${thClass} text-white border-l border-gray-600 text-xs`}>%</th>
              <th className={`${thClass} text-white text-xs`}>R$</th>
              <th className={`${thClass} text-white border-l border-gray-600 text-xs`}>%</th>
              <th className={`${thClass} text-white text-xs`}>R$</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.strategies.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                  Nenhuma estratégia cadastrada
                </td>
              </tr>
            )}

            {portfolio.strategies.map(strat => {
              const subs = strat.children.filter(c => c.kind === 'substrategy');
              const hasDirectAssets = strat.children.some(c => c.kind === 'asset');
              const balVal = strat.idealValue - strat.currentValue;

              return [
                // Strategy row
                <tr
                  key={strat.id}
                  className="border-t-2 border-gray-200"
                  style={{ backgroundColor: strat.color ? `${strat.color}22` : '#f9fafb' }}
                >
                  <td className={`${tdClass} pl-6`}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: strat.color || '#e5e7eb' }} />
                      <span className="font-bold text-gray-800 text-sm">{strat.name}</span>
                    </div>
                  </td>
                  <td className={`${tdClass} ${numClass} font-bold text-gray-700`}>{formatPct(strat.idealPortfolioPct)}</td>
                  <td className={`${tdClass} ${numClass} font-bold text-gray-800`}>{formatCurrency(strat.idealValue)}</td>
                  <td className={`${tdClass} ${numClass} font-bold text-gray-700`}>{formatPct(strat.currentPct)}</td>
                  <td className={`${tdClass} ${numClass} font-bold text-gray-800`}>{formatCurrency(strat.currentValue)}</td>
                  <td className={`${tdClass} ${numClass}`}><BalBadge value={balVal} /></td>
                </tr>,

                // Sub-strategy rows
                ...subs.map(child => {
                  if (child.kind !== 'substrategy') return null;
                  const ss = child as import('../utils/portfolio').PortfolioSubStrategyRow;
                  const ssBalVal = ss.idealValue - ss.currentValue;
                  return (
                    <tr key={ss.id} className="border-t border-gray-100 bg-white/60">
                      <td className={`${tdClass} pl-14`}>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          <span className="text-gray-700 text-xs font-medium">{ss.name}</span>
                          <span className="text-xs text-gray-400">({formatPct(ss.idealBookPct)} da estratégia)</span>
                        </div>
                      </td>
                      <td className={`${tdClass} ${numClass} text-gray-600`}>{formatPct(ss.idealPortfolioPct)}</td>
                      <td className={`${tdClass} ${numClass} text-gray-700 font-semibold`}>{formatCurrency(ss.idealValue)}</td>
                      <td className={`${tdClass} ${numClass} text-gray-600`}>{formatPct(ss.currentPct)}</td>
                      <td className={`${tdClass} ${numClass} text-gray-700 font-semibold`}>{formatCurrency(ss.currentValue)}</td>
                      <td className={`${tdClass} ${numClass}`}><BalBadge value={ssBalVal} /></td>
                    </tr>
                  );
                }).filter(Boolean),

                // Direct assets without substrategy
                ...(!hasDirectAssets ? [] : strat.children
                  .filter(c => c.kind === 'asset')
                  .map(child => {
                    const asset = child as import('../utils/portfolio').PortfolioAssetRow;
                    const aBalVal = asset.idealValue - asset.currentValue;
                    return (
                      <tr key={asset.id} className="border-t border-gray-50 bg-white/40">
                        <td className={`${tdClass} pl-14`}>
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                            <span className="text-gray-600 text-xs">{asset.name}</span>
                          </div>
                        </td>
                        <td className={`${tdClass} ${numClass} text-gray-500`}>{formatPct(asset.idealPortfolioPct)}</td>
                        <td className={`${tdClass} ${numClass} text-gray-600`}>{formatCurrency(asset.idealValue)}</td>
                        <td className={`${tdClass} ${numClass} text-gray-500`}>{formatPct(asset.currentPct)}</td>
                        <td className={`${tdClass} ${numClass} text-gray-600`}>{formatCurrency(asset.currentValue)}</td>
                        <td className={`${tdClass} ${numClass}`}><BalBadge value={aBalVal} /></td>
                      </tr>
                    );
                  })),
              ];
            })}

            {/* Unclassified */}
            {portfolio.unclassified.assets.length > 0 && (
              <tr className="border-t-2 border-gray-300 bg-gray-100">
                <td className={`${tdClass} pl-6`}>
                  <span className="font-bold text-gray-600 text-sm">⚠ Sem Classificação</span>
                </td>
                <td className={`${tdClass} ${numClass} text-gray-400`}>—</td>
                <td className={`${tdClass} ${numClass} text-gray-400`}>—</td>
                <td className={`${tdClass} ${numClass} text-gray-600 font-semibold`}>{formatPct(portfolio.unclassified.currentPct)}</td>
                <td className={`${tdClass} ${numClass} text-gray-700 font-bold`}>{formatCurrency(portfolio.unclassified.currentValue)}</td>
                <td className={`${tdClass} ${numClass} text-gray-400`}>—</td>
              </tr>
            )}

            {/* Total */}
            <tr className="border-t-2 border-gray-800 bg-gray-800 text-white">
              <td className={`${tdClass} pl-6 font-bold text-sm`}>TOTAL</td>
              <td className={`${tdClass} ${numClass} font-bold`}>100,00%</td>
              <td className={`${tdClass} ${numClass} font-bold`}>{formatCurrency(portfolio.totalIdealValue)}</td>
              <td className={`${tdClass} ${numClass} font-bold`}>100,00%</td>
              <td className={`${tdClass} ${numClass} font-bold`}>{formatCurrency(portfolio.totalCurrentValue)}</td>
              <td className={`${tdClass} ${numClass}`}>
                <span className={`font-bold text-sm ${Math.abs(totalBalance) < 0.01 ? 'text-green-300' : totalBalance > 0 ? 'text-yellow-300' : 'text-red-300'}`}>
                  {formatCurrency(totalBalance)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
