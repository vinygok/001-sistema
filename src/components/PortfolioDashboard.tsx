import { useEffect, useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Calendar, TrendingUp, TrendingDown, Minus, FileText } from 'lucide-react';
import { useStore } from '../store/useStore';
import { computePortfolio, formatCurrency, formatPct } from '../utils/portfolio';
import type { PortfolioStrategyRow, PortfolioSubStrategyRow, PortfolioAssetRow } from '../utils/portfolio';

interface StrategyNeedItem {
  id: string;
  name: string;
  need: number;
}

interface SubStrategyNeedItem {
  id: string;
  strategyId: string;
  name: string;
  need: number;
}

interface AssetNeedItem {
  id: string;
  strategyId?: string;
  subStrategyId?: string;
  name: string;
  need: number;
}

function BalanceCell({ value }: { value: number }) {
  const abs = Math.abs(value);
  if (abs < 0.01) return (
    <span className="flex items-center gap-1 text-gray-400 font-medium">
      <Minus size={13} /> {formatCurrency(0)}
    </span>
  );
  if (value > 0) return (
    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
      <TrendingUp size={13} /> {formatCurrency(value)}
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-red-500 font-semibold">
      <TrendingDown size={13} /> {formatCurrency(value)}
    </span>
  );
}

interface DraftCellProps {
  rowId: string;
  clientId: string;
  draftNote: string;
  draftValue?: number;
  onSave: (id: string, clientId: string, note: string, value?: number) => void;
}

function DraftCell({ rowId, clientId, draftNote, draftValue, onSave }: DraftCellProps) {
  const [editing, setEditing] = useState(false);
  const [localNote, setLocalNote] = useState(draftNote);
  const [localValue, setLocalValue] = useState(draftValue !== undefined ? String(draftValue) : '');
  const ref = useRef<HTMLDivElement>(null);

  const handleSave = () => {
    const val = localValue !== '' ? parseFloat(localValue.replace(',', '.')) : undefined;
    onSave(rowId, clientId, localNote, val);
    setEditing(false);
  };

  const handleKeyDown = (e: { key: string; ctrlKey: boolean }) => {
    if (e.key === 'Escape') setEditing(false);
    if (e.key === 'Enter' && e.ctrlKey) handleSave();
  };

  if (editing) {
    return (
      <div ref={ref} className="flex flex-col gap-1 min-w-[190px]" onKeyDown={handleKeyDown}>
        <input
          type="number"
          value={localValue}
          onChange={e => setLocalValue(e.target.value)}
          placeholder="Valor rascunho (R$)"
          step="0.01"
          className="w-full border border-yellow-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400 bg-yellow-50"
          autoFocus
        />
        <textarea
          value={localNote}
          onChange={e => setLocalNote(e.target.value)}
          placeholder="Anotação livre..."
          rows={2}
          className="w-full border border-yellow-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400 bg-yellow-50 resize-none"
        />
        <div className="flex gap-1">
          <button
            onMouseDown={e => { e.preventDefault(); handleSave(); }}
            className="flex-1 py-1 bg-yellow-500 text-white rounded text-xs font-medium hover:bg-yellow-600 transition-colors"
          >
            Salvar
          </button>
          <button
            onMouseDown={e => { e.preventDefault(); setEditing(false); }}
            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => { setLocalNote(draftNote); setLocalValue(draftValue !== undefined ? String(draftValue) : ''); setEditing(true); }}
      className="cursor-pointer min-h-[32px] min-w-[140px] group"
    >
      {draftValue !== undefined || draftNote ? (
        <div className="space-y-0.5">
          {draftValue !== undefined && (
            <div className={`text-xs font-semibold ${draftValue > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {formatCurrency(draftValue)}
            </div>
          )}
          {draftNote && (
            <div className="text-xs text-gray-500 italic truncate max-w-[180px]">{draftNote}</div>
          )}
        </div>
      ) : (
        <div className="text-gray-300 text-xs group-hover:text-yellow-400 transition-colors flex items-center gap-1">
          <FileText size={11} /> clique para anotar
        </div>
      )}
    </div>
  );
}

export default function PortfolioDashboard() {
  const store = useStore();
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [expandedSubStrategies, setExpandedSubStrategies] = useState<Set<string>>(new Set());
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<Set<string>>(new Set());
  const [selectedSubStrategyIds, setSelectedSubStrategyIds] = useState<Set<string>>(new Set());
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [adjustmentInput, setAdjustmentInput] = useState('');
  const [clearDraftsBeforeSimulation, setClearDraftsBeforeSimulation] = useState(true);
  const [showIdealBookPct, setShowIdealBookPct] = useState(true);
  const [showIdealPortfolioPct, setShowIdealPortfolioPct] = useState(true);
  const [showCurrentPortfolioPct, setShowCurrentPortfolioPct] = useState(true);
  const [isHydratingPrefs, setIsHydratingPrefs] = useState(false);

  const clientId = store.selectedClientId;
  const client = store.selectedClient;

  useEffect(() => {
    if (!clientId) return;

    setIsHydratingPrefs(true);
    const key = `portfolio_view_prefs_${clientId}`;
    const raw = localStorage.getItem(key);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          showIdealBookPct?: boolean;
          showIdealPortfolioPct?: boolean;
          showCurrentPortfolioPct?: boolean;
          expandedStrategies?: string[];
          expandedSubStrategies?: string[];
        };

        setShowIdealBookPct(parsed.showIdealBookPct ?? true);
        setShowIdealPortfolioPct(parsed.showIdealPortfolioPct ?? true);
        setShowCurrentPortfolioPct(parsed.showCurrentPortfolioPct ?? true);
        setExpandedStrategies(new Set(parsed.expandedStrategies ?? []));
        setExpandedSubStrategies(new Set(parsed.expandedSubStrategies ?? []));
      } catch {
        setShowIdealBookPct(true);
        setShowIdealPortfolioPct(true);
        setShowCurrentPortfolioPct(true);
        setExpandedStrategies(new Set());
        setExpandedSubStrategies(new Set());
      }
    } else {
      setShowIdealBookPct(true);
      setShowIdealPortfolioPct(true);
      setShowCurrentPortfolioPct(true);
      setExpandedStrategies(new Set());
      setExpandedSubStrategies(new Set());
    }

    setIsHydratingPrefs(false);
  }, [clientId]);

  useEffect(() => {
    if (!clientId || isHydratingPrefs) return;

    const key = `portfolio_view_prefs_${clientId}`;
    const payload = {
      showIdealBookPct,
      showIdealPortfolioPct,
      showCurrentPortfolioPct,
      expandedStrategies: Array.from(expandedStrategies),
      expandedSubStrategies: Array.from(expandedSubStrategies),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  }, [
    clientId,
    isHydratingPrefs,
    showIdealBookPct,
    showIdealPortfolioPct,
    showCurrentPortfolioPct,
    expandedStrategies,
    expandedSubStrategies,
  ]);

  if (!clientId || !client) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
        <TrendingUp size={48} className="mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium">Selecione um cliente</p>
        <p className="text-sm mt-1">Escolha um cliente na aba "Clientes" para ver o portfólio</p>
      </div>
    );
  }

  const portfolio = computePortfolio(
    store.strategies,
    store.subStrategies,
    store.assets,
    store.draftNotes,
    clientId
  );

  const toggleExpandStrategy = (id: string) => {
    setExpandedStrategies(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExpandSubStrategy = (id: string) => {
    setExpandedSubStrategies(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const strategyNeedItems: StrategyNeedItem[] = portfolio.strategies
    .map(strategy => ({
      id: strategy.id,
      name: strategy.name,
      need: strategy.idealValue - strategy.currentValue,
    }))
    .filter(item => item.need > 0.009)
    .sort((a, b) => b.need - a.need);

  const allSubNeeds: SubStrategyNeedItem[] = [];
  const allAssetNeeds: AssetNeedItem[] = [];

  for (const strategy of portfolio.strategies) {
    for (const child of strategy.children) {
      if (child.kind === 'substrategy') {
        const subNeed = child.idealValue - child.currentValue;
        if (subNeed > 0.009) {
          allSubNeeds.push({
            id: child.id,
            strategyId: strategy.id,
            name: child.name,
            need: subNeed,
          });
        }

        for (const asset of child.assets) {
          const assetNeed = asset.idealValue - asset.currentValue;
          if (assetNeed > 0.009) {
            allAssetNeeds.push({
              id: asset.id,
              strategyId: strategy.id,
              subStrategyId: child.id,
              name: asset.name,
              need: assetNeed,
            });
          }
        }
      } else {
        const assetNeed = child.idealValue - child.currentValue;
        if (assetNeed > 0.009) {
          allAssetNeeds.push({
            id: child.id,
            strategyId: strategy.id,
            name: child.name,
            need: assetNeed,
          });
        }
      }
    }
  }

  const subNeedItems = allSubNeeds
    .filter(item => selectedStrategyIds.has(item.strategyId))
    .sort((a, b) => b.need - a.need);

  const assetNeedItems = allAssetNeeds
    .filter(item => {
      if (!item.strategyId || !selectedStrategyIds.has(item.strategyId)) return false;
      if (item.subStrategyId) return selectedSubStrategyIds.has(item.subStrategyId);
      return true;
    })
    .sort((a, b) => b.need - a.need);

  const selectedStrategyItems = strategyNeedItems.filter(item => selectedStrategyIds.has(item.id));
  const selectedStrategyNeedTotal = selectedStrategyItems.reduce((sum, item) => sum + item.need, 0);
  const rawAdjustmentValue = Number(adjustmentInput.replace(',', '.'));
  const adjustmentValue = Number.isFinite(rawAdjustmentValue) ? Math.max(0, rawAdjustmentValue) : 0;
  const adjustmentToApply = Math.min(adjustmentValue, selectedStrategyNeedTotal);

  const defaultMostNeeded = strategyNeedItems[0];
  const suggestedName = selectedStrategyItems.length > 0
    ? selectedStrategyItems.map(item => item.name).join(', ')
    : defaultMostNeeded?.name ?? 'Carteira alinhada';
  const suggestedValue = selectedStrategyItems.length > 0
    ? selectedStrategyNeedTotal
    : defaultMostNeeded?.need ?? 0;

  const toggleStrategySelection = (id: string, checked: boolean) => {
    setSelectedStrategyIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

    if (!checked) {
      setSelectedSubStrategyIds(prev => {
        const next = new Set(prev);
        for (const sub of allSubNeeds) {
          if (sub.strategyId === id) next.delete(sub.id);
        }
        return next;
      });

      setSelectedAssetIds(prev => {
        const next = new Set(prev);
        for (const asset of allAssetNeeds) {
          if (asset.strategyId === id) next.delete(asset.id);
        }
        return next;
      });
    }
  };

  const toggleSubStrategySelection = (id: string, checked: boolean) => {
    setSelectedSubStrategyIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

    if (!checked) {
      setSelectedAssetIds(prev => {
        const next = new Set(prev);
        for (const asset of allAssetNeeds) {
          if (asset.subStrategyId === id) next.delete(asset.id);
        }
        return next;
      });
    }
  };

  const toggleAssetSelection = (id: string, checked: boolean) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const round2 = (value: number) => Math.round(value * 100) / 100;

  const clearAllDraftValues = () => {
    for (const strategy of portfolio.strategies) {
      const existingStrategyDraft = store.getDraftNote(strategy.id, clientId);
      store.setDraftNote(strategy.id, clientId, existingStrategyDraft?.note ?? '', undefined);

      for (const child of strategy.children) {
        if (child.kind === 'substrategy') {
          const existingSubDraft = store.getDraftNote(child.id, clientId);
          store.setDraftNote(child.id, clientId, existingSubDraft?.note ?? '', undefined);

          for (const asset of child.assets) {
            const existingAssetDraft = store.getDraftNote(asset.id, clientId);
            store.setDraftNote(asset.id, clientId, existingAssetDraft?.note ?? '', undefined);
          }
        } else {
          const existingAssetDraft = store.getDraftNote(child.id, clientId);
          store.setDraftNote(child.id, clientId, existingAssetDraft?.note ?? '', undefined);
        }
      }
    }

    for (const asset of portfolio.unclassified.assets) {
      const existingAssetDraft = store.getDraftNote(asset.id, clientId);
      store.setDraftNote(asset.id, clientId, existingAssetDraft?.note ?? '', undefined);
    }
  };

  const runSimulation = () => {
    if (selectedStrategyNeedTotal <= 0 || adjustmentToApply <= 0) return;

    if (clearDraftsBeforeSimulation) {
      clearAllDraftValues();
    }

    const strategyAllocation = new Map<string, number>();
    for (const strategy of selectedStrategyItems) {
      strategyAllocation.set(
        strategy.id,
        round2((adjustmentToApply * strategy.need) / selectedStrategyNeedTotal)
      );
    }

    const subAllocation = new Map<string, number>();
    const assetAllocation = new Map<string, number>();

    for (const strategy of selectedStrategyItems) {
      const strategyAlloc = strategyAllocation.get(strategy.id) ?? 0;
      const selectedSubs = subNeedItems.filter(
        item => item.strategyId === strategy.id && selectedSubStrategyIds.has(item.id)
      );
      const selectedDirectAssets = allAssetNeeds.filter(
        item =>
          item.strategyId === strategy.id &&
          !item.subStrategyId &&
          selectedAssetIds.has(item.id)
      );

      const topLevelNeedTotal =
        selectedSubs.reduce((sum, item) => sum + item.need, 0) +
        selectedDirectAssets.reduce((sum, item) => sum + item.need, 0);

      if (topLevelNeedTotal <= 0.009 || strategyAlloc <= 0) continue;

      for (const sub of selectedSubs) {
        subAllocation.set(sub.id, round2((strategyAlloc * sub.need) / topLevelNeedTotal));
      }

      for (const asset of selectedDirectAssets) {
        assetAllocation.set(asset.id, round2((strategyAlloc * asset.need) / topLevelNeedTotal));
      }
    }

    for (const sub of subNeedItems.filter(item => selectedSubStrategyIds.has(item.id))) {
      const parentSubAlloc = subAllocation.get(sub.id) ?? 0;
      if (parentSubAlloc <= 0) continue;

      const selectedAssetsInSub = assetNeedItems.filter(
        item => item.subStrategyId === sub.id && selectedAssetIds.has(item.id)
      );
      const totalNeedInSub = selectedAssetsInSub.reduce((sum, item) => sum + item.need, 0);

      if (totalNeedInSub <= 0.009) continue;

      for (const asset of selectedAssetsInSub) {
        assetAllocation.set(asset.id, round2((parentSubAlloc * asset.need) / totalNeedInSub));
      }
    }

    for (const strategy of selectedStrategyItems) {
      const existing = store.getDraftNote(strategy.id, clientId);
      store.setDraftNote(strategy.id, clientId, existing?.note ?? '', strategyAllocation.get(strategy.id) ?? 0);
    }

    for (const subId of selectedSubStrategyIds) {
      const existing = store.getDraftNote(subId, clientId);
      store.setDraftNote(subId, clientId, existing?.note ?? '', subAllocation.get(subId) ?? 0);
    }

    for (const assetId of selectedAssetIds) {
      const existing = store.getDraftNote(assetId, clientId);
      store.setDraftNote(assetId, clientId, existing?.note ?? '', assetAllocation.get(assetId) ?? 0);
    }
  };

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const thClass = "text-center text-xs font-bold text-gray-600 uppercase tracking-wide py-2 px-2";
  const tdClass = "px-2 py-2 text-xs";
  const numClass = "text-right font-mono";
  const centerNumClass = "text-center font-mono";
  const visibleIdealCols = 1 + (showIdealBookPct ? 1 : 0) + (showIdealPortfolioPct ? 1 : 0);
  const visibleCurrentCols = 1 + (showCurrentPortfolioPct ? 1 : 0);
  const tableColumnCount = 1 + visibleIdealCols + visibleCurrentCols + 1 + 1;

  const renderAssetRow = (asset: PortfolioAssetRow, level: number = 0) => {
    const balVal = asset.idealValue - asset.currentValue;
    const paddingLeft = level === 1 ? 'pl-8' : level === 2 ? 'pl-16' : 'pl-4';

    return (
      <tr key={asset.id} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors group">
        {/* ATIVO */}
        <td className={`${tdClass} ${paddingLeft}`}>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="text-gray-700 font-medium">{asset.name}</span>
          </div>
        </td>
        {showIdealBookPct && (
          <td className={`${tdClass} ${centerNumClass} text-gray-500`}>{formatPct(asset.idealBookPct)}</td>
        )}
        {showIdealPortfolioPct && (
          <td className={`${tdClass} ${centerNumClass} text-gray-500`}>{formatPct(asset.idealPortfolioPct)}</td>
        )}
        {/* IDEAL: R$ */}
        <td className={`${tdClass} ${centerNumClass} text-gray-700`}>{formatCurrency(asset.idealValue)}</td>
        {showCurrentPortfolioPct && (
          <td className={`${tdClass} ${centerNumClass} text-gray-500`}>{formatPct(asset.currentPct)}</td>
        )}
        {/* ATUAL: R$ */}
        <td className={`${tdClass} ${centerNumClass} font-semibold text-gray-800`}>{formatCurrency(asset.currentValue)}</td>
        {/* BALANC */}
        <td className={`${tdClass} ${numClass}`}>
          <BalanceCell value={balVal} />
        </td>
        {/* RASCUNHO */}
        <td className={`${tdClass} bg-yellow-50/50`}>
          <DraftCell
            rowId={asset.id}
            clientId={clientId}
            draftNote={asset.draftNote}
            draftValue={asset.draftValue}
            onSave={store.setDraftNote}
          />
        </td>
      </tr>
    );
  };

  const renderSubStrategyRow = (ss: PortfolioSubStrategyRow) => {
    const isExpanded = expandedSubStrategies.has(ss.id);
    const balVal = ss.idealValue - ss.currentValue;
    const assetRows = isExpanded ? ss.assets.map(a => renderAssetRow(a, 2)) : [];

    return [
      <tr key={ss.id} className="border-t border-gray-100 bg-gray-50/60 hover:bg-gray-100/60">
        <td
          className={`${tdClass} pl-8 cursor-pointer`}
          onClick={() => toggleExpandSubStrategy(ss.id)}
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-4">
              {ss.assets.length > 0 ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
            </span>
            <span className="font-semibold text-gray-700 text-xs">{ss.name}</span>
            <span className="text-xs text-gray-400">({ss.assets.length} ativo{ss.assets.length !== 1 ? 's' : ''})</span>
          </div>
        </td>
        {showIdealBookPct && (
          <td className={`${tdClass} ${centerNumClass} text-gray-600`}>{formatPct(ss.idealBookPct)}</td>
        )}
        {showIdealPortfolioPct && (
          <td className={`${tdClass} ${centerNumClass} text-gray-600`}>{formatPct(ss.idealPortfolioPct)}</td>
        )}
        <td className={`${tdClass} ${centerNumClass} font-semibold text-gray-700`}>{formatCurrency(ss.idealValue)}</td>
        {showCurrentPortfolioPct && (
          <td className={`${tdClass} ${centerNumClass} text-gray-600`}>{formatPct(ss.currentPct)}</td>
        )}
        <td className={`${tdClass} ${centerNumClass} font-bold text-gray-800`}>{formatCurrency(ss.currentValue)}</td>
        <td className={`${tdClass} ${numClass}`}><BalanceCell value={balVal} /></td>
        <td className={`${tdClass} bg-yellow-50/50`} onClick={e => e.stopPropagation()}>
          <DraftCell
            rowId={ss.id}
            clientId={clientId}
            draftNote={ss.draftNote}
            draftValue={ss.draftValue}
            onSave={store.setDraftNote}
          />
        </td>
      </tr>,
      ...assetRows,
      <tr key={`${ss.id}-divider`} className="bg-gray-50/50">
        <td colSpan={tableColumnCount} className="py-1">
          <div className="mx-6 border-t border-gray-200" />
        </td>
      </tr>,
    ];
  };

  const renderStrategyRow = (strat: PortfolioStrategyRow) => {
    const isExpanded = expandedStrategies.has(strat.id);
    const balVal = strat.idealValue - strat.currentValue;
    const childCount = strat.children.length;

    return [
      <tr
        key={strat.id}
        className="border-t-2 border-gray-200 transition-opacity"
        style={{ backgroundColor: strat.color ? `${strat.color}22` : '#f9fafb' }}
      >
        <td
          className={`${tdClass} pl-4 cursor-pointer hover:opacity-90`}
          onClick={() => toggleExpandStrategy(strat.id)}
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: strat.color || '#e5e7eb' }} />
            <span className="text-gray-400 w-4">
              {childCount > 0 ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
            </span>
            <span className="font-bold text-gray-800 text-sm">{strat.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: strat.color ? `${strat.color}44` : '#e5e7eb', color: '#374151' }}>
              {strat.targetType === 'monetary' ? 'R$ fixo' : '% do saldo'}
            </span>
          </div>
        </td>
        {showIdealBookPct && (
          <td className={`${tdClass} ${centerNumClass} font-bold`}>100,00%</td>
        )}
        {showIdealPortfolioPct && (
          <td className={`${tdClass} ${centerNumClass} font-bold text-gray-700`}>{formatPct(strat.idealPortfolioPct)}</td>
        )}
        <td className={`${tdClass} ${centerNumClass} font-bold text-gray-800`}>{formatCurrency(strat.idealValue)}</td>
        {showCurrentPortfolioPct && (
          <td className={`${tdClass} ${centerNumClass} font-bold text-gray-700`}>{formatPct(strat.currentPct)}</td>
        )}
        <td className={`${tdClass} ${centerNumClass} font-bold text-gray-800`}>{formatCurrency(strat.currentValue)}</td>
        <td className={`${tdClass} ${numClass}`}><BalanceCell value={balVal} /></td>
        <td className={`${tdClass} bg-yellow-50/50`} onClick={e => e.stopPropagation()}>
          <DraftCell
            rowId={strat.id}
            clientId={clientId}
            draftNote={strat.draftNote}
            draftValue={strat.draftValue}
            onSave={store.setDraftNote}
          />
        </td>
      </tr>,
      ...(isExpanded
        ? strat.children.flatMap(child =>
            child.kind === 'substrategy'
              ? renderSubStrategyRow(child as PortfolioSubStrategyRow)
              : [renderAssetRow(child as PortfolioAssetRow, 1)]
          )
        : []),
    ];
  };

  // Totals
  const totalBalance = portfolio.strategies.reduce((sum, s) => sum + (s.idealValue - s.currentValue), 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{client.name.toUpperCase()}</h1>
            <p className="text-blue-200 text-sm mt-0.5">{client.institution} · Conta: {client.account}</p>
          </div>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-lg">
            <Calendar size={16} className="text-blue-200" />
            <span className="text-white font-bold text-sm">{today}</span>
          </div>
        </div>
        <div className="flex gap-6 mt-4">
          <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-2">
            <div className="text-blue-200 text-xs font-medium">PATRIMÔNIO ATUAL</div>
            <div className="text-white font-bold text-lg">{formatCurrency(portfolio.totalCurrentValue)}</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-2">
            <div className="text-blue-200 text-xs font-medium">DESTINO SUGERIDO</div>
            <div className="text-white font-semibold text-sm mt-0.5">
              {suggestedName}
            </div>
            <div className={`font-bold text-lg ${suggestedValue > 0 ? 'text-yellow-300' : 'text-green-300'}`}>
              {formatCurrency(suggestedValue)}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Estrategias que precisam encher
            </p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 space-y-1">
              {strategyNeedItems.length === 0 && (
                <p className="text-xs text-gray-400 px-2 py-1">Nenhuma estrategia com falta de alocacao.</p>
              )}
              {strategyNeedItems.map(item => (
                <label key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 rounded">
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedStrategyIds.has(item.id)}
                      onChange={e => toggleStrategySelection(item.id, e.target.checked)}
                    />
                    <span className="truncate text-gray-700">{item.name}</span>
                  </span>
                  <span className="font-semibold text-amber-700">{formatCurrency(item.need)}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Subestrategias selecionaveis
            </p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 space-y-1">
              {subNeedItems.length === 0 && (
                <p className="text-xs text-gray-400 px-2 py-1">Selecione estrategias para listar subestrategias.</p>
              )}
              {subNeedItems.map(item => (
                <label key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 rounded">
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedSubStrategyIds.has(item.id)}
                      onChange={e => toggleSubStrategySelection(item.id, e.target.checked)}
                    />
                    <span className="truncate text-gray-700">{item.name}</span>
                  </span>
                  <span className="font-semibold text-amber-700">{formatCurrency(item.need)}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Ativos selecionaveis
            </p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 space-y-1">
              {assetNeedItems.length === 0 && (
                <p className="text-xs text-gray-400 px-2 py-1">Selecione subestrategias para listar ativos.</p>
              )}
              {assetNeedItems.map(item => (
                <label key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 rounded">
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedAssetIds.has(item.id)}
                      onChange={e => toggleAssetSelection(item.id, e.target.checked)}
                    />
                    <span className="truncate text-gray-700">{item.name}</span>
                  </span>
                  <span className="font-semibold text-amber-700">{formatCurrency(item.need)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Valor de ajuste</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={adjustmentInput}
              onChange={e => setAdjustmentInput(e.target.value)}
              className="w-44 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="0,00"
            />
          </div>
          <div className="text-xs text-gray-500">
            <p>Total faltante selecionado: <strong className="text-gray-700">{formatCurrency(selectedStrategyNeedTotal)}</strong></p>
            <p>Valor considerado na simulacao: <strong className="text-gray-700">{formatCurrency(adjustmentToApply)}</strong></p>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={clearDraftsBeforeSimulation}
              onChange={e => setClearDraftsBeforeSimulation(e.target.checked)}
            />
            Limpar rascunhos anteriores antes de simular
          </label>
          <button
            onClick={clearAllDraftValues}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100"
          >
            Limpar rascunhos agora
          </button>
          <button
            onClick={runSimulation}
            disabled={selectedStrategyNeedTotal <= 0 || adjustmentToApply <= 0}
            className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Simular balanceamento
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="px-4 py-2 border-b border-gray-200 bg-white flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-gray-600 mr-1">Visualizacao:</span>
          <button
            onClick={() => setShowIdealBookPct(prev => !prev)}
            className={`px-2 py-1 rounded border ${showIdealBookPct ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-300 text-gray-600'}`}
          >
            IDEAL % BOOK
          </button>
          <button
            onClick={() => setShowIdealPortfolioPct(prev => !prev)}
            className={`px-2 py-1 rounded border ${showIdealPortfolioPct ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-300 text-gray-600'}`}
          >
            IDEAL % CART.
          </button>
          <button
            onClick={() => setShowCurrentPortfolioPct(prev => !prev)}
            className={`px-2 py-1 rounded border ${showCurrentPortfolioPct ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-300 text-gray-600'}`}
          >
            ATUAL % CART.
          </button>
        </div>
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className={`${thClass} text-left pl-4 text-white`} rowSpan={2}>ATIVO / ESTRATÉGIA</th>
              <th className={`${thClass} text-white border-l border-gray-600`} colSpan={visibleIdealCols}>IDEAL</th>
              <th className={`${thClass} text-white border-l border-gray-600`} colSpan={visibleCurrentCols}>ATUAL</th>
              <th className={`${thClass} text-white border-l border-gray-600`} rowSpan={2}>BALANCEAMENTO</th>
              <th className={`${thClass} bg-yellow-800 text-yellow-100 border-l border-yellow-700`} rowSpan={2}>RASCUNHO</th>
            </tr>
            <tr className="bg-gray-700 text-white">
              {showIdealBookPct && (
                <th className={`${thClass} text-white border-l border-gray-600 text-xs`}>% BOOK</th>
              )}
              {showIdealPortfolioPct && (
                <th className={`${thClass} text-white ${showIdealBookPct ? '' : 'border-l border-gray-600'} text-xs`}>% CART.</th>
              )}
              <th className={`${thClass} text-white ${!showIdealBookPct && !showIdealPortfolioPct ? 'border-l border-gray-600' : ''} text-xs`}>R$</th>
              {showCurrentPortfolioPct && (
                <th className={`${thClass} text-white border-l border-gray-600 text-xs`}>% CART.</th>
              )}
              <th className={`${thClass} text-white text-xs`}>R$</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.strategies.length === 0 && portfolio.unclassified.assets.length === 0 && (
              <tr>
                <td colSpan={tableColumnCount} className="text-center py-12 text-gray-400">
                  <TrendingUp size={40} className="mx-auto mb-3 opacity-20" />
                  <p>Nenhum dado para exibir</p>
                  <p className="text-xs mt-1">Cadastre estratégias e ativos nas abas de configuração</p>
                </td>
              </tr>
            )}

            {/* Strategy rows */}
            {portfolio.strategies.map(strat => renderStrategyRow(strat))}

            {/* Unclassified assets */}
            {portfolio.unclassified.assets.length > 0 && (
              <>
                <tr className="border-t-2 border-gray-300 bg-gray-100">
                  <td className={`${tdClass} pl-4`}>
                    <span className="font-bold text-gray-600 text-sm">⚠ Sem Classificação</span>
                  </td>
                  {showIdealBookPct && <td className={`${tdClass} ${centerNumClass} text-gray-400`}>—</td>}
                  {showIdealPortfolioPct && <td className={`${tdClass} ${centerNumClass} text-gray-400`}>—</td>}
                  <td className={`${tdClass} ${centerNumClass} text-gray-400`}>—</td>
                  {showCurrentPortfolioPct && (
                    <td className={`${tdClass} ${centerNumClass} text-gray-600`}>{formatPct(portfolio.unclassified.currentPct)}</td>
                  )}
                  <td className={`${tdClass} ${centerNumClass} font-bold text-gray-700`}>{formatCurrency(portfolio.unclassified.currentValue)}</td>
                  <td className={`${tdClass} ${numClass} text-gray-400`}>—</td>
                  <td className={`${tdClass} bg-yellow-50/50`} />
                </tr>
                {portfolio.unclassified.assets.map(a => renderAssetRow(a, 1))}
              </>
            )}

            {/* Total row */}
            <tr className="border-t-2 border-gray-800 bg-gray-800 text-white">
              <td className={`${tdClass} pl-4 font-bold text-sm`}>TOTAL</td>
              {showIdealBookPct && <td className={`${tdClass} ${centerNumClass} font-bold`}>100,00%</td>}
              {showIdealPortfolioPct && <td className={`${tdClass} ${centerNumClass} font-bold`}>100,00%</td>}
              <td className={`${tdClass} ${centerNumClass} font-bold`}>{formatCurrency(portfolio.totalIdealValue)}</td>
              {showCurrentPortfolioPct && <td className={`${tdClass} ${centerNumClass} font-bold`}>100,00%</td>}
              <td className={`${tdClass} ${centerNumClass} font-bold`}>{formatCurrency(portfolio.totalCurrentValue)}</td>
              <td className={`${tdClass} ${numClass}`}>
                <span className={`font-bold text-sm ${Math.abs(totalBalance) < 0.01 ? 'text-green-300' : totalBalance > 0 ? 'text-yellow-300' : 'text-red-300'}`}>
                  {formatCurrency(totalBalance)}
                </span>
              </td>
              <td className="bg-yellow-900/30" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary panel */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          💡 Clique nas estratégias para expandir/recolher · Clique em "RASCUNHO" para adicionar anotações · Valores negativos = sobrealocado · Valores positivos = subalocado
        </p>
      </div>
    </div>
  );
}
