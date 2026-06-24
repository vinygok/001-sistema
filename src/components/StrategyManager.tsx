import { useRef, useState, type ChangeEvent } from 'react';
import { Target, Plus, Edit2, Trash2, Check, X, ChevronDown, ChevronRight, GripVertical, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from '../store/useStore';
import type { Strategy, SubStrategy } from '../types';
import Modal from './Modal';

const COLORS = [
  '#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1',
  '#96CEB4', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#85C1E9', '#82E0AA', '#F0B27A', '#AED6F1', '#A9DFBF',
];

interface StratForm {
  name: string;
  targetType: 'monetary' | 'percentage';
  targetValue: string;
  color: string;
}

interface SubStratForm {
  name: string;
  percentage: string;
}

interface ImportSummary {
  strategiesCreated: number;
  strategiesUpdated: number;
  subsCreated: number;
  subsUpdated: number;
  skipped: number;
  fileName: string;
  message: string;
  tone: 'success' | 'error';
}

const emptyStrat: StratForm = { name: '', targetType: 'percentage', targetValue: '', color: COLORS[0] };
const emptySub: SubStratForm = { name: '', percentage: '' };

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseSheetNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text) return Number.NaN;

  const cleaned = text.replace(/\s+/g, '').replace(/r\$/gi, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const br = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number(br);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  if (cleaned.includes(',')) {
    const parsed = Number(cleaned.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export default function StrategyManager() {
  const store = useStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showStratModal, setShowStratModal] = useState(false);
  const [editStratId, setEditStratId] = useState<string | null>(null);
  const [stratForm, setStratForm] = useState<StratForm>(emptyStrat);
  const [showSubModal, setShowSubModal] = useState(false);
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [subParentId, setSubParentId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState<SubStratForm>(emptySub);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const clientId = store.selectedClientId;
  if (!clientId) return null;

  const strategies = store.strategies
    .filter(s => s.clientId === clientId)
    .sort((a, b) => a.order - b.order);

  const percentageStrategies = strategies.filter(strategy => strategy.targetType === 'percentage');
  const percentageTargetTotal = percentageStrategies.reduce((sum, strategy) => sum + strategy.targetValue, 0);
  const percentageTargetDiff = Math.abs(100 - percentageTargetTotal);
  const percentageTargetStatus =
    Math.abs(percentageTargetTotal - 100) <= 0.01
      ? 'ok'
      : percentageTargetTotal < 100
        ? 'missing'
        : 'exceeded';

  const getSubStrategies = (stratId: string) =>
    store.subStrategies
      .filter(ss => ss.strategyId === stratId)
      .sort((a, b) => a.order - b.order);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openAddStrat = () => {
    setStratForm(emptyStrat);
    setEditStratId(null);
    setShowStratModal(true);
  };

  const openEditStrat = (s: Strategy) => {
    setStratForm({ name: s.name, targetType: s.targetType, targetValue: String(s.targetValue), color: s.color || COLORS[0] });
    setEditStratId(s.id);
    setShowStratModal(true);
  };

  const saveStrat = () => {
    const val = parseFloat(stratForm.targetValue) || 0;
    if (editStratId) {
      store.updateStrategy(editStratId, {
        name: stratForm.name,
        targetType: stratForm.targetType,
        targetValue: val,
        color: stratForm.color,
      });
    } else {
      store.addStrategy(clientId, {
        name: stratForm.name,
        targetType: stratForm.targetType,
        targetValue: val,
        color: stratForm.color,
      });
    }
    setShowStratModal(false);
  };

  const openAddSub = (stratId: string) => {
    setSubForm(emptySub);
    setEditSubId(null);
    setSubParentId(stratId);
    setShowSubModal(true);
  };

  const openEditSub = (ss: SubStrategy) => {
    setSubForm({ name: ss.name, percentage: String(ss.percentage) });
    setEditSubId(ss.id);
    setSubParentId(ss.strategyId);
    setShowSubModal(true);
  };

  const saveSub = () => {
    const pct = parseFloat(subForm.percentage) || 0;
    if (editSubId) {
      store.updateSubStrategy(editSubId, { name: subForm.name, percentage: pct });
    } else if (subParentId) {
      store.addSubStrategy(subParentId, { name: subForm.name, percentage: pct });
    }
    setShowSubModal(false);
  };

  const handleDelete = (type: 'strategy' | 'substrategy', id: string) => {
    if (type === 'strategy') store.deleteStrategy(id);
    else store.deleteSubStrategy(id);
    setDeleteConfirm(null);
  };

  const handleDownloadTemplate = () => {
    const modelRows = [
      {
        Estrategia: 'Renda Fixa',
        TipoMeta: 'percentage',
        ValorMeta: 40,
        Cor: '#45B7D1',
        Subestrategia: 'Pos-fixado',
        PercentualSubestrategia: 60,
      },
      {
        Estrategia: 'Renda Fixa',
        TipoMeta: 'percentage',
        ValorMeta: 40,
        Cor: '#45B7D1',
        Subestrategia: 'IPCA+',
        PercentualSubestrategia: 40,
      },
    ];

    const instructionsRows = [
      ['Campo', 'Obrigatorio', 'Descricao', 'Exemplo'],
      ['Estrategia', 'Sim', 'Nome da estrategia.', 'Renda Fixa'],
      ['TipoMeta', 'Nao', 'percentage ou monetary.', 'percentage'],
      ['ValorMeta', 'Nao', 'Valor da meta: percentual (quando percentage) ou BRL (quando monetary).', '40'],
      ['Cor', 'Nao', 'Cor hexadecimal para a estrategia.', '#45B7D1'],
      ['Subestrategia', 'Nao', 'Nome da subestrategia vinculada a Estrategia da linha.', 'Pos-fixado'],
      ['PercentualSubestrategia', 'Nao', 'Percentual da subestrategia dentro da estrategia.', '60'],
      [],
      ['Regras'],
      ['1) Pode repetir a estrategia em varias linhas para cadastrar subestrategias.'],
      ['2) Se a estrategia existir, os dados da estrategia sao atualizados.'],
      ['3) Se a subestrategia existir, o percentual dela e atualizado.'],
    ];

    const wb = XLSX.utils.book_new();
    const wsModel = XLSX.utils.json_to_sheet(modelRows);
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsRows);
    XLSX.utils.book_append_sheet(wb, wsModel, 'Modelo');
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_importacao_estrategias.xlsx');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];

      if (!sheet) {
        setImportSummary({
          strategiesCreated: 0,
          strategiesUpdated: 0,
          subsCreated: 0,
          subsUpdated: 0,
          skipped: 0,
          fileName: file.name,
          message: 'Nao foi possivel ler a planilha.',
          tone: 'error',
        });
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (rows.length === 0) {
        setImportSummary({
          strategiesCreated: 0,
          strategiesUpdated: 0,
          subsCreated: 0,
          subsUpdated: 0,
          skipped: 0,
          fileName: file.name,
          message: 'A planilha esta vazia.',
          tone: 'error',
        });
        return;
      }

      const strategyMap = new Map<string, Strategy>();
      for (const strategy of strategies) {
        strategyMap.set(normalizeKey(strategy.name), strategy);
      }

      const subMap = new Map<string, SubStrategy>();
      for (const sub of store.subStrategies) {
        const parent = store.strategies.find(strategy => strategy.id === sub.strategyId);
        if (!parent || parent.clientId !== clientId) continue;
        subMap.set(`${sub.strategyId}::${normalizeKey(sub.name)}`, sub);
      }

      let strategiesCreated = 0;
      let strategiesUpdated = 0;
      let subsCreated = 0;
      let subsUpdated = 0;
      let skipped = 0;

      for (const row of rows) {
        const normalizedRow: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          normalizedRow[normalizeKey(key)] = value;
        }

        const strategyName = String(
          normalizedRow.estrategia ?? normalizedRow.strategy ?? ''
        ).trim();
        if (!strategyName) {
          skipped += 1;
          continue;
        }

        const typeRaw = normalizeKey(String(
          normalizedRow.tipometa ?? normalizedRow.targettype ?? 'percentage'
        ));
        const targetType: 'monetary' | 'percentage' = typeRaw.includes('mon') ? 'monetary' : 'percentage';
        const parsedTarget = parseSheetNumber(normalizedRow.valormeta ?? normalizedRow.targetvalue);
        const targetValue = Number.isFinite(parsedTarget) ? parsedTarget : 0;
        const colorRaw = String(normalizedRow.cor ?? normalizedRow.color ?? '').trim();
        const color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colorRaw) ? colorRaw : undefined;

        const strategyKey = normalizeKey(strategyName);
        let strategy = strategyMap.get(strategyKey);
        if (strategy) {
          store.updateStrategy(strategy.id, {
            name: strategyName,
            targetType,
            targetValue,
            color: color ?? strategy.color,
          });
          strategy = {
            ...strategy,
            name: strategyName,
            targetType,
            targetValue,
            color: color ?? strategy.color,
          };
          strategyMap.set(strategyKey, strategy);
          strategiesUpdated += 1;
        } else {
          const created = store.addStrategy(clientId, {
            name: strategyName,
            targetType,
            targetValue,
            color: color ?? COLORS[0],
          });
          if (!created) {
            skipped += 1;
            continue;
          }
          strategy = created;
          strategyMap.set(strategyKey, strategy);
          strategiesCreated += 1;
        }

        const subName = String(
          normalizedRow.subestrategia ?? normalizedRow.substrategy ?? ''
        ).trim();
        if (!subName) continue;

        const parsedSubPct = parseSheetNumber(
          normalizedRow.percentualsubestrategia ?? normalizedRow.percentualsub ?? normalizedRow.percentage
        );
        const subPct = Number.isFinite(parsedSubPct) ? parsedSubPct : 0;

        const subKey = `${strategy.id}::${normalizeKey(subName)}`;
        const existingSub = subMap.get(subKey);
        if (existingSub) {
          store.updateSubStrategy(existingSub.id, { name: subName, percentage: subPct });
          subMap.set(subKey, { ...existingSub, name: subName, percentage: subPct });
          subsUpdated += 1;
        } else {
          const createdSub = store.addSubStrategy(strategy.id, { name: subName, percentage: subPct });
          if (createdSub) {
            subMap.set(subKey, createdSub);
            subsCreated += 1;
          }
        }
      }

      const processed = strategiesCreated + strategiesUpdated + subsCreated + subsUpdated;
      setImportSummary({
        strategiesCreated,
        strategiesUpdated,
        subsCreated,
        subsUpdated,
        skipped,
        fileName: file.name,
        message: processed > 0 ? 'Importacao de estrategias concluida.' : 'Nenhuma linha valida foi importada.',
        tone: processed > 0 ? 'success' : 'error',
      });
    } catch {
      setImportSummary({
        strategiesCreated: 0,
        strategiesUpdated: 0,
        subsCreated: 0,
        subsUpdated: 0,
        skipped: 0,
        fileName: file.name,
        message: 'Falha ao processar o arquivo de estrategias.',
        tone: 'error',
      });
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-50 rounded-lg">
            <Target size={20} className="text-yellow-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">Estratégias</h2>
            <p className="text-xs text-gray-500">Defina suas estratégias e subestratégias</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
          >
            <Download size={16} />
            Baixar Modelo
          </button>
          <button
            onClick={handleImportClick}
            className="flex items-center gap-2 px-4 py-2 border border-yellow-300 text-yellow-700 rounded-lg hover:bg-yellow-50 transition-colors text-sm font-medium"
          >
            <Upload size={16} />
            Importar Planilha
          </button>
          <button
            onClick={openAddStrat}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Nova Estratégia
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleImportFile}
          className="hidden"
        />
      </div>

      <div className="px-6 py-3 border-b border-gray-50">
        <p className="text-xs text-gray-500">
          Importacao por planilha: Estrategia, TipoMeta, ValorMeta, Cor, Subestrategia, PercentualSubestrategia.
        </p>
        <div
          className={`mt-3 rounded-lg border px-3 py-2 ${
            percentageTargetStatus === 'ok'
              ? 'bg-emerald-50 border-emerald-200'
              : percentageTargetStatus === 'missing'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p
                className={`text-sm font-semibold ${
                  percentageTargetStatus === 'ok'
                    ? 'text-emerald-800'
                    : percentageTargetStatus === 'missing'
                      ? 'text-amber-800'
                      : 'text-red-800'
                }`}
              >
                Meta percentual das estrategias: {percentageTargetTotal.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500">
                {percentageTargetStatus === 'ok' && 'As estrategias percentuais somam 100%.'}
                {percentageTargetStatus === 'missing' && `Faltam ${percentageTargetDiff.toFixed(1)}% para completar 100%.`}
                {percentageTargetStatus === 'exceeded' && `Extrapolou ${percentageTargetDiff.toFixed(1)}% acima de 100%.`}
              </p>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full font-semibold ${
                percentageTargetStatus === 'ok'
                  ? 'bg-emerald-100 text-emerald-700'
                  : percentageTargetStatus === 'missing'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {percentageStrategies.length} estrategia(s) percentuais
            </span>
          </div>
        </div>
        {importSummary && (
          <div
            className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
              importSummary.tone === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <p className="font-semibold">{importSummary.message}</p>
            <p className="mt-1">
              Arquivo: {importSummary.fileName} | Estrategias criadas: {importSummary.strategiesCreated} | Estrategias atualizadas: {importSummary.strategiesUpdated}
            </p>
            <p className="mt-0.5">
              Subestrategias criadas: {importSummary.subsCreated} | Subestrategias atualizadas: {importSummary.subsUpdated} | Linhas ignoradas: {importSummary.skipped}
            </p>
          </div>
        )}
      </div>

      <div className="divide-y divide-gray-50">
        {strategies.length === 0 && (
          <div className="px-6 py-10 text-center text-gray-400">
            <Target size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma estratégia cadastrada</p>
          </div>
        )}
        {strategies.map(strategy => {
          const subs = getSubStrategies(strategy.id);
          const isOpen = expanded.has(strategy.id);
          const totalSubPct = subs.reduce((sum, ss) => sum + ss.percentage, 0);

          return (
            <div key={strategy.id}>
              <div
                className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors group"
                style={{ borderLeft: `4px solid ${strategy.color || '#e5e7eb'}` }}
              >
                <GripVertical size={16} className="text-gray-300" />
                <button
                  onClick={() => toggleExpand(strategy.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: strategy.color || '#e5e7eb' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800 truncate">{strategy.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${strategy.targetType === 'monetary' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {strategy.targetType === 'monetary'
                        ? `R$ ${strategy.targetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : `${strategy.targetValue}% do saldo`}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {subs.length} subestratégia(s)
                    {subs.length > 0 && (
                      <span className={`ml-2 ${Math.abs(totalSubPct - 100) > 0.01 ? 'text-orange-500 font-medium' : 'text-green-600'}`}>
                        (Total: {totalSubPct.toFixed(1)}%{Math.abs(totalSubPct - 100) > 0.01 ? ' ⚠ deve ser 100%' : ' ✓'})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => openAddSub(strategy.id)}
                    className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors text-xs flex items-center gap-1"
                    title="Adicionar Subestratégia"
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    onClick={() => openEditStrat(strategy)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                  {deleteConfirm === strategy.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete('strategy', strategy.id)} className="p-1 bg-red-500 text-white rounded hover:bg-red-600">
                        <Check size={12} />
                      </button>
                      <button onClick={() => setDeleteConfirm(null)} className="p-1 bg-gray-100 text-gray-500 rounded hover:bg-gray-200">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(strategy.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {isOpen && subs.length > 0 && (
                <div className="bg-gray-50">
                  {subs.map(ss => (
                    <div
                      key={ss.id}
                      className="flex items-center gap-3 pl-16 pr-6 py-2.5 hover:bg-gray-100 transition-colors group border-l-4 border-transparent"
                    >
                      <div className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                      <div className="flex-1">
                        <span className="text-sm text-gray-700 font-medium">{ss.name}</span>
                        <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{ss.percentage}% da estratégia</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditSub(ss)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                          <Edit2 size={12} />
                        </button>
                        {deleteConfirm === ss.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete('substrategy', ss.id)} className="p-1 bg-red-500 text-white rounded hover:bg-red-600">
                              <Check size={11} />
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} className="p-1 bg-gray-100 text-gray-500 rounded hover:bg-gray-200">
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(ss.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isOpen && (
                <div className="px-6 py-2 bg-gray-50 border-t border-gray-100">
                  <button
                    onClick={() => openAddSub(strategy.id)}
                    className="flex items-center gap-1 text-xs text-yellow-600 hover:text-yellow-700 font-medium"
                  >
                    <Plus size={13} /> Adicionar Subestratégia
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showStratModal && (
        <Modal
          title={editStratId ? 'Editar Estratégia' : 'Nova Estratégia'}
          onClose={() => setShowStratModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Estratégia *</label>
              <input
                type="text"
                value={stratForm.name}
                onChange={e => setStratForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Reserva de Emergência, Renda Fixa..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Meta</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setStratForm(f => ({ ...f, targetType: 'percentage' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${stratForm.targetType === 'percentage' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  Percentual do saldo
                </button>
                <button
                  onClick={() => setStratForm(f => ({ ...f, targetType: 'monetary' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${stratForm.targetType === 'monetary' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  Valor Fixo (R$)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {stratForm.targetType === 'monetary' ? 'Valor Ideal (R$)' : 'Percentual Ideal (%)'}
              </label>
              <input
                type="number"
                value={stratForm.targetValue}
                onChange={e => setStratForm(f => ({ ...f, targetValue: e.target.value }))}
                placeholder={stratForm.targetType === 'monetary' ? '50000' : '30'}
                min={0}
                max={stratForm.targetType === 'percentage' ? 100 : undefined}
                step={stratForm.targetType === 'percentage' ? '0.01' : '100'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                {stratForm.targetType === 'percentage'
                  ? 'Percentual aplicado sobre o saldo restante apos as estrategias com meta em R$'
                  : 'Valor monetario fixo que deve ser mantido nesta estrategia'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cor da Estratégia</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setStratForm(f => ({ ...f, color }))}
                    className={`w-7 h-7 rounded-full transition-transform ${stratForm.color === color ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveStrat}
                disabled={!stratForm.name.trim()}
                className="flex-1 py-2.5 bg-yellow-500 text-white rounded-lg font-medium text-sm hover:bg-yellow-600 transition-colors disabled:opacity-50"
              >
                {editStratId ? 'Salvar' : 'Criar Estratégia'}
              </button>
              <button
                onClick={() => setShowStratModal(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showSubModal && (
        <Modal
          title={editSubId ? 'Editar Subestratégia' : 'Nova Subestratégia'}
          onClose={() => setShowSubModal(false)}
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Subestratégia *</label>
              <input
                type="text"
                value={subForm.name}
                onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Pos-fixado, IPCA+, Pre-fixado..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Percentual da Estratégia (%)</label>
              <input
                type="number"
                value={subForm.percentage}
                onChange={e => setSubForm(f => ({ ...f, percentage: e.target.value }))}
                placeholder="35"
                min={0}
                max={100}
                step="0.01"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                % do valor total da estratégia pai que deve ser alocado aqui
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={saveSub}
                disabled={!subForm.name.trim()}
                className="flex-1 py-2.5 bg-yellow-500 text-white rounded-lg font-medium text-sm hover:bg-yellow-600 transition-colors disabled:opacity-50"
              >
                {editSubId ? 'Salvar' : 'Criar Subestratégia'}
              </button>
              <button
                onClick={() => setShowSubModal(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
