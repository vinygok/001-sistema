import { useRef, useState, useMemo, type ChangeEvent } from 'react';
import { Briefcase, Plus, Edit2, Trash2, Check, X, Search, Tag, Upload, Download, ChevronDown, ChevronRight, AlertTriangle, ArrowUpDown, Database } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from '../store/useStore';
import type { Asset, AssetMovement, AssetIndexer, AssetTargetMode, AssetUpdateSource, MovementType } from '../types';
import Modal from './Modal';
import { formatCurrency } from '../utils/portfolio';
import { validateAssetForPerformance } from '../services/performance';

interface AssetForm {
  name: string;
  nomeExibicao: string;
  tipo: string;
  tickerCodigo: string;
  cnpj: string;
  isin: string;
  identificadorExterno: string;
  referenciaRFId?: string;
  referenciaFundoId?: string;
  referenciaRVId?: string;
  strategyId: string;
  subStrategyId: string;
  quantidade: string;
  precoUnitario: string;
  valorPosicao: string;
  isentoIR: boolean;
  moeda: string;
  origemAtualizacao: AssetUpdateSource;
  modoMetaAtivo: AssetTargetMode;
  valorMetaAtivo: string;
  matchedSource: 'rv' | 'fundo' | 'rf' | null;
  vencimentoRF: string;
  tipoIndexadorRF: AssetIndexer | '';
  taxaContratada: string;
}

interface DbSuggestion {
  id: string;
  name: string;
  source: 'rv' | 'fundo' | 'rf';
  tipo?: string;
  tickerCodigo?: string;
  cnpj?: string;
  codigo?: string;
  precoUnitario?: number;
  vencimento?: string;
  tipoIndexador?: AssetIndexer;
}

interface MovementForm {
  data: string;
  tipoMovimentacao: MovementType;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  observacao: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  fileName: string;
  message: string;
  tone: 'success' | 'error';
}

const emptyForm: AssetForm = {
  name: '',
  nomeExibicao: '',
  tipo: '',
  tickerCodigo: '',
  cnpj: '',
  isin: '',
  identificadorExterno: '',
  strategyId: '',
  subStrategyId: '',
  quantidade: '',
  precoUnitario: '',
  valorPosicao: '',
  isentoIR: false,
  moeda: 'BRL',
  origemAtualizacao: 'manual',
  modoMetaAtivo: 'score',
  valorMetaAtivo: '1',
  matchedSource: null,
  vencimentoRF: '',
  tipoIndexadorRF: '',
  taxaContratada: '',
};

const emptyMovement: MovementForm = {
  data: new Date().toISOString().slice(0, 10),
  tipoMovimentacao: 'compra',
  quantidade: '',
  valorUnitario: '',
  valorTotal: '',
  observacao: '',
};

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function formatCnpj(cnpj: string): string {
  const n = cnpj.replace(/\D/g, '').slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

function parseSheetNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text) return Number.NaN;
  const cleaned = text.replace(/\s+/g, '').replace(/r\$/gi, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  if (cleaned.includes(',')) return Number(cleaned.replace(',', '.'));
  return Number(cleaned);
}

function getAssetPositionValue(asset: Asset): number {
  return asset.valorPosicao ?? asset.currentValue ?? 0;
}

function round8(value: number): number {
  return Math.round(value * 100000000) / 100000000;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatIsoDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseToIsoDate(value: unknown): string | undefined {
  // Valor numerico do Excel (ex: 43749 => 11/10/2019) ou string numerica
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
      ? Number(value.trim())
      : null;

  if (numericValue !== null && Number.isFinite(numericValue)) {
    const parsed = XLSX.SSF.parse_date_code(numericValue);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = String(parsed.y).padStart(4, '0');
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Usa componentes locais para evitar deslocamento de fuso horario
    const y = String(value.getFullYear()).padStart(4, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const text = String(value ?? '').trim();
  if (!text) return undefined;

  const brMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
    return `${year}-${month}-${day}`;
  }

  const isoMatch = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  return undefined;
}

function getSignedMovementQuantity(movement: AssetMovement): number {
  if (movement.quantidade === undefined) return 0;
  const absQty = Math.abs(movement.quantidade);
  if (movement.tipoMovimentacao === 'compra') return absQty;
  if (movement.tipoMovimentacao === 'venda') return -absQty;
  return 0;
}

function resolveAssetByPriority(existingAssets: Asset[], candidate: {
  identificadorExterno?: string;
  isin?: string;
  cnpj?: string;
  tickerCodigo?: string;
  name?: string;
}) {
  if (candidate.identificadorExterno) {
    const found = existingAssets.find(a => normalizeKey(a.identificadorExterno ?? '') === normalizeKey(candidate.identificadorExterno ?? ''));
    if (found) return found;
  }
  if (candidate.isin) {
    const found = existingAssets.find(a => normalizeKey(a.isin ?? '') === normalizeKey(candidate.isin ?? ''));
    if (found) return found;
  }
  if (candidate.cnpj) {
    const found = existingAssets.find(a => normalizeKey(a.cnpj ?? '') === normalizeKey(candidate.cnpj ?? ''));
    if (found) return found;
  }
  if (candidate.tickerCodigo) {
    const found = existingAssets.find(a => normalizeKey(a.tickerCodigo ?? '') === normalizeKey(candidate.tickerCodigo ?? ''));
    if (found) return found;
  }
  if (candidate.name) {
    const found = existingAssets.find(a => normalizeKey(a.name) === normalizeKey(candidate.name ?? ''));
    if (found) return found;
  }
  return undefined;
}

export default function AssetManager() {
  const store = useStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const movementFileInputRef = useRef<HTMLInputElement | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [performanceFilter, setPerformanceFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [nameSort, setNameSort] = useState<'asc' | 'desc'>('asc');
  const [movementSort, setMovementSort] = useState<'desc' | 'asc'>('desc');
  const [expandedAssetIds, setExpandedAssetIds] = useState<Set<string>>(new Set());
  const [movementAssetId, setMovementAssetId] = useState<string | null>(null);
  const [movementEditId, setMovementEditId] = useState<string | null>(null);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovement);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [movementImportResult, setMovementImportResult] = useState<ImportResult | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<DbSuggestion[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const clientId = store.selectedClientId;
  if (!clientId) return null;

  const clientAssets = useMemo(() => 
    store.assets.filter(a => a.clientId === clientId).sort((a, b) => a.order - b.order),
    [store.assets, clientId, refreshKey]
  );
  const assets = useMemo(() => 
    clientAssets
      .filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || (a.nomeExibicao ?? '').toLowerCase().includes(search.toLowerCase()))
      .filter(a => strategyFilter === 'all' ? true : (strategyFilter === 'none' ? !a.strategyId : a.strategyId === strategyFilter))
      .filter(a => {
        if (performanceFilter === 'all') return true;
        const validation = validateAssetForPerformance(a, store.assetMovements.filter(m => m.assetId === a.id));
        return performanceFilter === 'valid' ? validation.valid : !validation.valid;
      })
      .sort((a, b) => nameSort === 'asc'
        ? (a.nomeExibicao || a.name).localeCompare(b.nomeExibicao || b.name)
        : (b.nomeExibicao || b.name).localeCompare(a.nomeExibicao || a.name)),
    [clientAssets, search, strategyFilter, performanceFilter, nameSort, store.assetMovements, refreshKey]
  );
  const strategies = store.strategies.filter(s => s.clientId === clientId).sort((a, b) => a.order - b.order);
  const movements = store.assetMovements.filter(m => m.clientId === clientId);

  const getSubStrategies = (strategyId: string) => store.subStrategies.filter(ss => ss.strategyId === strategyId).sort((a, b) => a.order - b.order);
  const getStrategyName = (strategyId?: string) => strategies.find(s => s.id === strategyId)?.name;
  const getSubStrategyName = (subStrategyId?: string) => store.subStrategies.find(s => s.id === subStrategyId)?.name;

  const buildSuggestions = (searchTerm: string): DbSuggestion[] => {
    if (searchTerm.length < 2) return [];
    const term = searchTerm.toLowerCase();
    const results: DbSuggestion[] = [];
    
    // Renda Variavel
    store.rvPrices
      .filter(r => r.tickerCodigo.toLowerCase().includes(term) || r.classe.toLowerCase().includes(term))
      .slice(0, 5)
      .forEach(r => {
        results.push({
          id: r.id,
          name: r.tickerCodigo,
          source: 'rv',
          tipo: r.classe,
          tickerCodigo: r.tickerCodigo,
          precoUnitario: r.precoUnitario,
        });
      });
    
    // Fundos
    store.fundosReferencia
      .filter(f => f.nomeCompleto.toLowerCase().includes(term) || (f.nomeAbreviado ?? '').toLowerCase().includes(term) || f.cnpj.includes(term))
      .slice(0, 5)
      .forEach(f => {
        results.push({
          id: f.id,
          name: f.nomeAbreviado || f.nomeCompleto,
          source: 'fundo',
          tipo: 'fundo',
          cnpj: f.cnpj,
          precoUnitario: f.cotaAtual,
        });
      });
    
// Renda Fixa - usa Codigo Completo como nome principal (so mostra se tiver codigoCompleto preenchido)
    store.rendasFixasReferencia
      .filter(r => {
        if (!r.codigoCompleto) return false; // So mostra ativos com Codigo Completo preenchido
        return r.codigoCompleto.toLowerCase().includes(term) || 
               r.codigo.toLowerCase().includes(term) || 
               r.emissor.toLowerCase().includes(term);
      })
      .slice(0, 5)
      .forEach(r => {
        results.push({
          id: r.id,
          name: r.codigoCompleto!,
          source: 'rf',
          tipo: r.classe,
          codigo: r.codigo,
          vencimento: r.vencimento,
          tipoIndexador: r.tipoIndexador,
        });
      });
    
    return results.slice(0, 10);
  };

  const handleNameChange = (value: string) => {
    setForm(prev => ({ ...prev, name: value }));
    const sugg = buildSuggestions(value);
    setSuggestions(sugg);
    setShowSuggestions(sugg.length > 0 && value.length >= 2);
    setRefreshKey(prev => prev + 1); // Força atualização visual
  };

const selectSuggestion = (s: DbSuggestion) => {
    setForm(prev => ({
      ...prev,
      name: s.name,
      tipo: s.tipo ?? '',
      tickerCodigo: s.source === 'rv' ? (s.tickerCodigo ?? '') : '',
      cnpj: s.source === 'fundo' ? (s.cnpj ? formatCnpj(s.cnpj) : '') : '',
      precoUnitario: s.precoUnitario !== undefined ? String(s.precoUnitario) : '',
      referenciaRVId: s.source === 'rv' ? s.id : undefined,
      referenciaFundoId: s.source === 'fundo' ? s.id : undefined,
      referenciaRFId: s.source === 'rf' ? s.id : undefined,
      matchedSource: s.source,
      identificadorExterno: s.source === 'rf' ? (s.codigo ?? '') : '',
      vencimentoRF: s.source === 'rf' ? (s.vencimento ?? '') : '',
      tipoIndexadorRF: s.source === 'rf' ? (s.tipoIndexador ?? '') : '',
      taxaContratada: '',
      quantidade: '',
    }));
    setShowSuggestions(false);
    setSuggestions([]);
    setRefreshKey(prev => prev + 1);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditId(null);
    setShowSuggestions(false);
    setSuggestions([]);
    setShowModal(true);
  };

const openEdit = (asset: Asset) => {
    const matchedSource: 'rv' | 'fundo' | 'rf' | null =
      asset.referenciaRVId ? 'rv' : asset.referenciaFundoId ? 'fundo' : asset.referenciaRFId ? 'rf' : null;
    setForm({
      name: asset.name,
      nomeExibicao: asset.nomeExibicao ?? asset.name,
      tipo: asset.tipo ?? '',
      tickerCodigo: asset.tickerCodigo ?? '',
      cnpj: asset.cnpj ?? '',
      isin: asset.isin ?? '',
      identificadorExterno: asset.identificadorExterno ?? '',
      referenciaRFId: asset.referenciaRFId,
      referenciaFundoId: asset.referenciaFundoId,
      referenciaRVId: asset.referenciaRVId,
      strategyId: asset.strategyId ?? '',
      subStrategyId: asset.subStrategyId ?? '',
      quantidade: asset.quantidade !== undefined ? String(asset.quantidade) : '',
      precoUnitario: asset.precoUnitario !== undefined ? String(asset.precoUnitario) : '',
      valorPosicao: String(getAssetPositionValue(asset)),
      isentoIR: asset.isentoIR ?? false,
      moeda: asset.moeda ?? 'BRL',
      origemAtualizacao: asset.origemAtualizacao ?? 'manual',
      modoMetaAtivo: asset.modoMetaAtivo ?? asset.idealTargetMode ?? 'score',
      valorMetaAtivo: String(asset.valorMetaAtivo ?? asset.idealTargetValue ?? 1),
      matchedSource,
      vencimentoRF: asset.dataVencimento ?? '',
      tipoIndexadorRF: asset.tipoIndexador ?? '',
      taxaContratada: asset.taxaContratada !== undefined
        ? String(asset.taxaContratada)
        : (asset.spreadContratado !== undefined ? String(asset.spreadContratado) : ''),
    });
    setEditId(asset.id);
    setShowModal(true);
  };

const handleSave = () => {
    const quantidade = parseSheetNumber(form.quantidade);
    const precoUnitario = parseSheetNumber(form.precoUnitario);
    const valorPosicaoInput = parseSheetNumber(form.valorPosicao);
    const valorPosicao = Number.isFinite(quantidade) && Number.isFinite(precoUnitario)
      ? roundMoney(quantidade * precoUnitario)
      : roundMoney(Number.isFinite(valorPosicaoInput) ? valorPosicaoInput : 0);

    const isRendaFixa = form.matchedSource === 'rf';
    const spreadIndexadores: AssetIndexer[] = ['cdi_mais_spread', 'ipca_mais_spread', 'igpm_mais_spread'];
    const taxaContratadaNum = parseSheetNumber(form.taxaContratada);
    const usaSpread = isRendaFixa && form.tipoIndexadorRF && spreadIndexadores.includes(form.tipoIndexadorRF as AssetIndexer);

    const payload: Partial<Omit<Asset, 'id' | 'clientId'>> = {
      name: form.name.trim(),
      nomeExibicao: (form.nomeExibicao || form.name).trim(),
      tipo: form.matchedSource ? (form.tipo || 'outro') : 'outro',
      tickerCodigo: form.tickerCodigo || undefined,
      cnpj: form.cnpj || undefined,
      isin: form.isin || undefined,
      identificadorExterno: form.identificadorExterno || undefined,
      strategyId: form.strategyId || undefined,
      subStrategyId: form.subStrategyId || undefined,
      referenciaRFId: form.referenciaRFId || undefined,
      referenciaFundoId: form.referenciaFundoId || undefined,
      referenciaRVId: form.referenciaRVId || undefined,
      quantidade: Number.isFinite(quantidade) ? quantidade : undefined,
      precoUnitario: Number.isFinite(precoUnitario) ? precoUnitario : undefined,
      valorPosicao,
      currentValue: valorPosicao,
      isentoIR: form.isentoIR,
      moeda: form.moeda || 'BRL',
      dataUltimaAtualizacao: new Date().toISOString(),
      origemAtualizacao: form.origemAtualizacao,
      modoMetaAtivo: form.modoMetaAtivo,
      valorMetaAtivo: Number.isFinite(parseSheetNumber(form.valorMetaAtivo)) ? parseSheetNumber(form.valorMetaAtivo) : 0,
      idealTargetMode: form.modoMetaAtivo,
      idealTargetValue: Number.isFinite(parseSheetNumber(form.valorMetaAtivo)) ? parseSheetNumber(form.valorMetaAtivo) : 0,
      dataVencimento: isRendaFixa ? (form.vencimentoRF || undefined) : undefined,
      tipoIndexador: isRendaFixa ? (form.tipoIndexadorRF || undefined) : undefined,
      taxaContratada: isRendaFixa && !usaSpread && Number.isFinite(taxaContratadaNum) ? taxaContratadaNum : undefined,
      spreadContratado: isRendaFixa && usaSpread && Number.isFinite(taxaContratadaNum) ? taxaContratadaNum : undefined,
    };

    if (editId) {
      store.updateAsset(editId, payload);
    } else {
      store.addAsset(clientId, payload as Partial<Omit<Asset, 'id' | 'clientId' | 'order' | 'createdAt'>> & { name: string });
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    store.deleteAsset(id);
    setDeleteConfirm(null);
  };

  const handleExport = () => {
    const rows = clientAssets.map(asset => ({
      ID: asset.id,
      Nome: asset.name,
      NomeExibicao: asset.nomeExibicao ?? asset.name,
      Tipo: asset.tipo,
      TickerCodigo: asset.tickerCodigo ?? '',
      CNPJ: asset.cnpj ?? '',
      ISIN: asset.isin ?? '',
      IdentificadorExterno: asset.identificadorExterno ?? '',
      Quantidade: asset.quantidade ?? '',
      PrecoUnitario: asset.precoUnitario ?? '',
      ValorPosicao: getAssetPositionValue(asset),
      IsentoIR: asset.isentoIR ? 'sim' : 'nao',
      Moeda: asset.moeda ?? 'BRL',
      OrigemAtualizacao: asset.origemAtualizacao ?? 'manual',
      Estrategia: getStrategyName(asset.strategyId) ?? '',
      Subestrategia: getSubStrategyName(asset.subStrategyId) ?? '',
      ModoMetaAtivo: asset.modoMetaAtivo ?? 'score',
      ValorMetaAtivo: asset.valorMetaAtivo ?? 1,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Ativos');
    XLSX.writeFile(wb, `ativos_${store.selectedClient?.account ?? 'cliente'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const rows = [
      {
        ID: '',
        Nome: 'TESOURO SELIC 2029',
        NomeExibicao: 'Tesouro Selic 2029',
        Tipo: 'outro',
        TickerCodigo: '',
        CNPJ: '',
        ISIN: 'BRTESOURO001',
        IdentificadorExterno: '',
        Quantidade: '',
        PrecoUnitario: '',
        ValorPosicao: 10000,
        IsentoIR: 'nao',
        Moeda: 'BRL',
        OrigemAtualizacao: 'manual',
        Estrategia: 'Renda Fixa',
        Subestrategia: 'Pos-fixado',
        ModoMetaAtivo: 'score',
        ValorMetaAtivo: 7,
      },
      {
        ID: '',
        Nome: 'PETR4',
        NomeExibicao: 'Petrobras PN',
        Tipo: 'acao',
        TickerCodigo: 'PETR4',
        CNPJ: '',
        ISIN: 'BRPETRACNPR6',
        IdentificadorExterno: '',
        Quantidade: 100,
        PrecoUnitario: 35.5,
        ValorPosicao: '',
        IsentoIR: 'nao',
        Moeda: 'BRL',
        OrigemAtualizacao: 'importacao_excel',
        Estrategia: 'Renda Variavel',
        Subestrategia: 'Acoes',
        ModoMetaAtivo: 'percentage',
        ValorMetaAtivo: 25,
      },
    ];

    const instructions = [
      ['Campo', 'Obrigatorio', 'Descricao'],
      ['Nome', 'Sim', 'Nome do ativo.'],
      ['Tipo', 'Nao', 'acao, fii, etf, bdr, fundo, cdb, cri, cra, debenture, coe, cripto, conta_corrente, valores_em_transito, outro.'],
      ['Quantidade/PrecoUnitario', 'Nao', 'Se ambos preenchidos, ValorPosicao = Quantidade x PrecoUnitario.'],
      ['ValorPosicao', 'Nao', 'Usado quando quantidade/preco nao estiverem completos.'],
      ['ID/IdentificadorExterno/ISIN/CNPJ/TickerCodigo', 'Nao', 'Usados para match de atualizacao nessa ordem de prioridade.'],
      ['Estrategia/Subestrategia', 'Nao', 'Classificacao opcional.'],
      ['ModoMetaAtivo/ValorMetaAtivo', 'Nao', 'score ou percentage para regra ideal do ativo.'],
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_importacao_ativos.xlsx');
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('invalid_sheet');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;

        const name = String(normalized.nome ?? normalized.ativo ?? '').trim();
        if (!name) {
          skipped += 1;
          continue;
        }

        const tipo = normalizeKey(String(normalized.tipo ?? 'outro')) || 'outro';
        const qtd = parseSheetNumber(normalized.quantidade);
        const unit = parseSheetNumber(normalized.precounitario);
        const rawValor = parseSheetNumber(normalized.valorposicao ?? normalized.valor);
        const valorPosicao = Number.isFinite(qtd) && Number.isFinite(unit)
          ? roundMoney(qtd * unit)
          : roundMoney(Number.isFinite(rawValor) ? rawValor : 0);

        const strategyName = String(normalized.estrategia ?? '').trim();
        const subName = String(normalized.subestrategia ?? '').trim();
        const strategy = strategies.find(s => normalizeKey(s.name) === normalizeKey(strategyName));
        const strategyId = strategy?.id;
        const subStrategyId = strategyId
          ? getSubStrategies(strategyId).find(ss => normalizeKey(ss.name) === normalizeKey(subName))?.id
          : undefined;

        const candidate = {
          identificadorExterno: String(normalized.identificadorexterno ?? '').trim() || undefined,
          isin: String(normalized.isin ?? '').trim() || undefined,
          cnpj: String(normalized.cnpj ?? '').trim() || undefined,
          tickerCodigo: String(normalized.tickercodigo ?? normalized.ticker ?? '').trim() || undefined,
          name,
        };

        const existing = resolveAssetByPriority(clientAssets, candidate);

        // Buscar referências no Banco de Dados
        let referenciaRVId: string | undefined;
        let referenciaFundoId: string | undefined;
        let referenciaRFId: string | undefined;
        const codigoRF = String(normalized.codigo ?? normalized.codigoativo ?? candidate.tickerCodigo ?? '').trim();

        if (candidate.tickerCodigo) {
          const rvMatch = store.rvPrices.find(r => r.tickerCodigo.toUpperCase() === candidate.tickerCodigo!.toUpperCase());
          if (rvMatch) referenciaRVId = rvMatch.id;
        }
        if (candidate.cnpj) {
          const fundoMatch = store.fundosReferencia.find(f => f.cnpjNumerico === candidate.cnpj!.replace(/\D/g, ''));
          if (fundoMatch) referenciaFundoId = fundoMatch.id;
        }
        if (codigoRF) {
          // Busca por Codigo Completo (prioridade) ou Codigo simples
          const rfMatch = store.rendasFixasReferencia.find(r => {
            if (r.codigoCompleto) {
              return r.codigoCompleto.toUpperCase() === codigoRF.toUpperCase();
            }
            return r.codigo.toUpperCase() === codigoRF.toUpperCase();
          });
          if (rfMatch) referenciaRFId = rfMatch.id;
        }

        const modeRaw = normalizeKey(String(normalized.modometaativo ?? 'score'));
        const modoMetaAtivo: AssetTargetMode = modeRaw === 'percentage' || modeRaw === 'percentual' ? 'percentage' : 'score';
        const valorMetaAtivo = parseSheetNumber(normalized.valormetaativo);
        const isentoRaw = normalizeKey(String(normalized.isentoir ?? 'nao'));
        const isentoIR = ['sim', 'yes', 'true', '1'].includes(isentoRaw);

        const payload: Partial<Omit<Asset, 'id' | 'clientId'>> = {
          name,
          nomeExibicao: String(normalized.nomeexibicao ?? name),
          tipo,
          tickerCodigo: candidate.tickerCodigo,
          cnpj: candidate.cnpj,
          isin: candidate.isin,
          identificadorExterno: candidate.identificadorExterno,
          referenciaRVId,
          referenciaFundoId,
          referenciaRFId,
          quantidade: Number.isFinite(qtd) ? qtd : undefined,
          precoUnitario: Number.isFinite(unit) ? unit : undefined,
          valorPosicao,
          currentValue: valorPosicao,
          isentoIR,
          moeda: String(normalized.moeda ?? 'BRL') || 'BRL',
          origemAtualizacao: (normalizeKey(String(normalized.origematualizacao ?? 'importacao_excel')) as AssetUpdateSource) || 'importacao_excel',
          dataUltimaAtualizacao: new Date().toISOString(),
          strategyId,
          subStrategyId,
          modoMetaAtivo,
          valorMetaAtivo: Number.isFinite(valorMetaAtivo) ? valorMetaAtivo : 1,
          idealTargetMode: modoMetaAtivo,
          idealTargetValue: Number.isFinite(valorMetaAtivo) ? valorMetaAtivo : 1,
        };

        if (existing) {
          store.updateAsset(existing.id, payload);
          updated += 1;
        } else {
          store.addAsset(clientId, payload as Partial<Omit<Asset, 'id' | 'clientId' | 'order' | 'createdAt'>> & { name: string });
          created += 1;
        }
      }

      const processed = created + updated;
      setImportResult({
        created,
        updated,
        skipped,
        fileName: file.name,
        message: processed > 0 ? 'Importacao concluida.' : 'Nenhum ativo valido encontrado.',
        tone: processed > 0 ? 'success' : 'error',
      });
      setRefreshKey(prev => prev + 1);
    } catch {
      setImportResult({ created: 0, updated: 0, skipped: 0, fileName: file.name, message: 'Falha ao processar arquivo.', tone: 'error' });
    } finally {
      event.target.value = '';
    }
  };

  const handleDownloadMovementTemplate = () => {
    const rows = [
      {
        IDdoAtivo: 'id-do-ativo-1',
        NomeDoAtivo: 'PETR4',
        Data: '15/06/2026',
        TipoMovimentacao: 'compra',
        Quantidade: 100,
        ValorUnitario: 35.5,
        ValorTotal: 3550,
      },
      {
        IDdoAtivo: 'id-do-ativo-2',
        NomeDoAtivo: 'KNRI11',
        Data: '15/06/2026',
        TipoMovimentacao: 'dividendo',
        Quantidade: '',
        ValorUnitario: '',
        ValorTotal: 120,
      },
    ];

    const instructions = [
      ['Campo', 'Obrigatorio', 'Descricao'],
      ['IDdoAtivo', 'Sim', 'ID do ativo no sistema. E o identificador principal para vincular a movimentacao.'],
      ['NomeDoAtivo', 'Nao', 'Nome do ativo. Usado como fallback caso o ID nao seja encontrado.'],
      ['Data', 'Nao', 'Data da movimentacao em DD/MM/AAAA. Se vazio, usa a data atual.'],
      ['TipoMovimentacao', 'Sim', 'compra, venda, rendimento, dividendo, juros, amortizacao, aporte, retirada, ajuste, outro.'],
      ['Quantidade', 'Nao', 'Quantidade de ativos movimentados. Obrigatorio para compra/venda.'],
      ['ValorUnitario', 'Nao', 'Preco unitario. Se vazio, sera calculado por ValorTotal / Quantidade.'],
      ['ValorTotal', 'Nao', 'Valor total da movimentacao. Se vazio, sera calculado por Quantidade x ValorUnitario.'],
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_importacao_movimentacoes.xlsx');
  };

  const handleImportMovementClick = () => movementFileInputRef.current?.click();

  const handleExportMovements = () => {
    const wb = XLSX.utils.book_new();

    const assetRows = clientAssets.map(asset => ({
      ID: asset.id,
      Nome: asset.name,
      NomeExibicao: asset.nomeExibicao ?? asset.name,
      TickerCodigo: asset.tickerCodigo ?? '',
      Tipo: asset.tipo,
    }));

    const movementRows = movements
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(movement => {
        const asset = clientAssets.find(a => a.id === movement.assetId);
        return {
          IDdoAtivo: movement.assetId,
          NomeDoAtivo: asset?.name ?? '',
          Data: formatIsoDate(movement.data),
          TipoMovimentacao: movement.tipoMovimentacao,
          Quantidade: movement.quantidade ?? '',
          ValorUnitario: movement.valorUnitario ?? '',
          ValorTotal: movement.valorTotal,
          Observacao: movement.observacao ?? '',
        };
      });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assetRows), 'Ativos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movementRows), 'Movimentacoes');
    XLSX.writeFile(wb, `movimentacoes_${store.selectedClient?.account ?? 'cliente'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportMovementFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

      // Procura a aba "Movimentacoes" (ou variantes); se nao encontrar, usa a primeira aba.
      const sheetName = wb.SheetNames.find(name => {
        const n = normalizeKey(name);
        return n.includes('movimentacao') || n.includes('movimentacoes') || n.includes('movimentos');
      }) ?? wb.SheetNames[0];

      const sheet = wb.Sheets[sheetName];
      if (!sheet) throw new Error('invalid_sheet');

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      console.log(`Importando movimentacoes da aba "${sheetName}": ${rows.length} linha(s) encontrada(s).`);

      let created = 0;
      let skipped = 0;
      let duplicated = 0;
      const importedMovements: AssetMovement[] = [];
      const affectedAssetIds = new Set<string>();

      // Helper para detectar duplicidade considerando ativo, data, tipo, quantidade e valor total
      const isDuplicate = (candidate: { assetId: string; data: string; tipoMovimentacao: MovementType; quantidade?: number; valorTotal: number }) => {
        const same = (m: AssetMovement) =>
          m.assetId === candidate.assetId &&
          m.data === candidate.data &&
          m.tipoMovimentacao === candidate.tipoMovimentacao &&
          (m.quantidade ?? 0) === (candidate.quantidade ?? 0) &&
          m.valorTotal === candidate.valorTotal;

        const existsInStore = store.assetMovements.some(same);
        const existsInImported = importedMovements.some(same);
        return existsInStore || existsInImported;
      };

      for (const row of rows) {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;

        const assetId = String(normalized.iddoativo ?? normalized.id ?? normalized.idativo ?? '').trim();
        const assetName = String(normalized.nomedoativo ?? normalized.nome ?? normalized.ativo ?? '').trim();
        const tipoRaw = normalizeKey(String(normalized.tipomovimentacao ?? normalized.tipo ?? ''));

        const tiposValidos: MovementType[] = ['compra', 'venda', 'rendimento', 'dividendo', 'juros', 'amortizacao', 'aporte', 'retirada', 'ajuste', 'outro'];
        const tipoMovimentacao = tiposValidos.find(t => t === tipoRaw) ?? 'outro';

        let asset = clientAssets.find(a => a.id === assetId);
        if (!asset && assetName) {
          asset = clientAssets.find(a => normalizeKey(a.name) === normalizeKey(assetName) || normalizeKey(a.nomeExibicao ?? '') === normalizeKey(assetName));
        }

        if (!asset) {
          console.warn('Movimentacao ignorada: ativo nao encontrado', { assetId, assetName });
          skipped += 1;
          continue;
        }

        const dataRaw = String(normalized.data ?? '').trim();
        const data = parseToIsoDate(dataRaw) ?? new Date().toISOString().slice(0, 10);
        const qtd = parseSheetNumber(normalized.quantidade);
        const unit = parseSheetNumber(normalized.valorunitario);
        const total = parseSheetNumber(normalized.valortotal);

        const valorTotal = Number.isFinite(total)
          ? roundMoney(total)
          : roundMoney(Number.isFinite(qtd) && Number.isFinite(unit) ? qtd * unit : 0);

        if (!Number.isFinite(valorTotal) && tipoMovimentacao !== 'compra' && tipoMovimentacao !== 'venda') {
          console.warn('Movimentacao ignorada: valor total ausente', { assetId, assetName, data, tipoMovimentacao });
          skipped += 1;
          continue;
        }

        const candidate = {
          assetId: asset.id,
          data,
          tipoMovimentacao,
          quantidade: Number.isFinite(qtd) ? qtd : undefined,
          valorTotal,
        };

        if (isDuplicate(candidate)) {
          duplicated += 1;
          continue;
        }

        const createdMovement = store.addAssetMovement({
          clientId,
          assetId: asset.id,
          data,
          tipoMovimentacao,
          quantidade: Number.isFinite(qtd) ? qtd : undefined,
          valorUnitario: Number.isFinite(unit) ? unit : undefined,
          valorTotal,
          observacao: 'Importado via planilha',
        });

        importedMovements.push(createdMovement);
        affectedAssetIds.add(asset.id);
        created += 1;
      }

      // Sincroniza a quantidade dos ativos afetados APENAS UMA VEZ, com todas as movimentacoes
      for (const assetId of affectedAssetIds) {
        const next = [...movements.filter(m => m.assetId === assetId), ...importedMovements.filter(m => m.assetId === assetId)];
        syncAssetQuantityFromHistory(assetId, next);
      }

      const totalProcessed = created + duplicated;
      setMovementImportResult({
        created,
        updated: 0,
        skipped: skipped + duplicated,
        fileName: file.name,
        message: totalProcessed > 0
          ? `Importacao concluida: ${created} movimentacao(oes) criada(s)${duplicated > 0 ? `, ${duplicated} duplicada(s) ignorada(s)` : ''}.`
          : 'Nenhuma movimentacao valida encontrada.',
        tone: totalProcessed > 0 ? 'success' : 'error',
      });
    } catch (error) {
      console.error('Erro ao importar movimentacoes:', error);
      setMovementImportResult({ created: 0, updated: 0, skipped: 0, fileName: file.name, message: 'Falha ao processar arquivo.', tone: 'error' });
    } finally {
      event.target.value = '';
    }
  };

  const totalValue = clientAssets.reduce((sum, asset) => sum + getAssetPositionValue(asset), 0);
  const subStrategiesForSelected = form.strategyId ? getSubStrategies(form.strategyId) : [];

  const getNetHistoryQuantity = (assetMovements: AssetMovement[]): number | undefined => {
    const qtyMovements = assetMovements.filter(m => (m.tipoMovimentacao === 'compra' || m.tipoMovimentacao === 'venda') && m.quantidade !== undefined);
    if (qtyMovements.length === 0) return undefined;
    return round8(qtyMovements.reduce((sum, movement) => sum + getSignedMovementQuantity(movement), 0));
  };

  const syncAssetQuantityFromHistory = (assetId: string, nextMovements: AssetMovement[]) => {
    const asset = clientAssets.find(a => a.id === assetId);
    if (!asset) return;

    const currentMovements = movements.filter(m => m.assetId === assetId);
    const previousNet = getNetHistoryQuantity(currentMovements);
    const nextNet = getNetHistoryQuantity(nextMovements);
    if (nextNet === undefined) return;

    const quantityIsAuto = asset.quantidade === undefined || (previousNet !== undefined && Math.abs(asset.quantidade - previousNet) < 0.0001);
    if (quantityIsAuto) {
      store.updateAsset(assetId, {
        quantidade: nextNet,
        dataUltimaAtualizacao: new Date().toISOString(),
        origemAtualizacao: 'manual',
      });
    }
  };

  const openMovementModal = (assetId: string) => {
    setMovementAssetId(assetId);
    setMovementForm(emptyMovement);
    setMovementEditId(null);
  };

  const openEditMovementModal = (movement: AssetMovement) => {
    setMovementAssetId(movement.assetId);
    setMovementEditId(movement.id);
    setMovementForm({
      data: movement.data,
      tipoMovimentacao: movement.tipoMovimentacao,
      quantidade: movement.quantidade !== undefined ? String(movement.quantidade) : '',
      valorUnitario: movement.valorUnitario !== undefined ? String(movement.valorUnitario) : '',
      valorTotal: String(movement.valorTotal),
      observacao: movement.observacao ?? '',
    });
  };

  const closeMovementModal = () => {
    setMovementAssetId(null);
    setMovementEditId(null);
    setMovementForm(emptyMovement);
  };

  const handleDeleteMovement = (movement: AssetMovement) => {
    store.deleteAssetMovement(movement.id);
    const next = movements.filter(m => m.assetId === movement.assetId && m.id !== movement.id);
    syncAssetQuantityFromHistory(movement.assetId, next);
  };

  const saveMovement = () => {
    if (!movementAssetId) return;
    const qtd = parseSheetNumber(movementForm.quantidade);
    const unit = parseSheetNumber(movementForm.valorUnitario);
    const total = parseSheetNumber(movementForm.valorTotal);
    const valorTotal = Number.isFinite(total)
      ? roundMoney(total)
      : roundMoney(Number.isFinite(qtd) && Number.isFinite(unit) ? qtd * unit : 0);

    if (movementEditId) {
      const before = movements.find(m => m.id === movementEditId);
      if (!before) return;
      store.updateAssetMovement(movementEditId, {
        data: movementForm.data,
        tipoMovimentacao: movementForm.tipoMovimentacao,
        quantidade: Number.isFinite(qtd) ? qtd : undefined,
        valorUnitario: Number.isFinite(unit) ? unit : undefined,
        valorTotal,
        observacao: movementForm.observacao || undefined,
      });
      const next = movements
        .filter(m => m.assetId === movementAssetId)
        .map(m => m.id === movementEditId ? {
          ...m,
          data: movementForm.data,
          tipoMovimentacao: movementForm.tipoMovimentacao,
          quantidade: Number.isFinite(qtd) ? qtd : undefined,
          valorUnitario: Number.isFinite(unit) ? unit : undefined,
          valorTotal,
          observacao: movementForm.observacao || undefined,
        } : m);
      syncAssetQuantityFromHistory(movementAssetId, next);
    } else {
      const created = store.addAssetMovement({
        clientId,
        assetId: movementAssetId,
        data: movementForm.data,
        tipoMovimentacao: movementForm.tipoMovimentacao,
        quantidade: Number.isFinite(qtd) ? qtd : undefined,
        valorUnitario: Number.isFinite(unit) ? unit : undefined,
        valorTotal,
        observacao: movementForm.observacao || undefined,
      });
      const next = [...movements.filter(m => m.assetId === movementAssetId), created];
      syncAssetQuantityFromHistory(movementAssetId, next);
    }

    closeMovementModal();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg"><Briefcase size={20} className="text-green-600" /></div>
          <div>
            <h2 className="font-bold text-gray-800">Ativos</h2>
            <p className="text-xs text-gray-500">{clientAssets.length} ativo(s) · Total: {formatCurrency(totalValue)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"><Plus size={16} />Novo Ativo</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleImportClick} className="flex items-center gap-2 px-3 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 text-sm font-medium"><Upload size={16} />Importar Ativos</button>
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"><Download size={16} />Exportar Ativos</button>
            <button onClick={handleDownloadTemplate} className="flex items-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 text-sm font-medium"><Download size={16} />Modelo de Ativos</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleImportMovementClick} className="flex items-center gap-2 px-3 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 text-sm font-medium"><Upload size={16} />Importar Movimentacoes</button>
            <button onClick={handleExportMovements} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"><Download size={16} />Exportar Movimentacoes</button>
            <button onClick={handleDownloadMovementTemplate} className="flex items-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 text-sm font-medium"><Download size={16} />Modelo de Movimentacoes</button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} className="hidden" />
        <input ref={movementFileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportMovementFile} className="hidden" />
      </div>

      <div className="px-6 py-3 border-b border-gray-50">
        <div className="grid gap-2 md:grid-cols-[1fr_160px_180px_130px]">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Pesquisar ativo..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
        </div>
          <select value={performanceFilter} onChange={e => setPerformanceFilter(e.target.value as 'all' | 'valid' | 'invalid')} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="all">Todos</option>
            <option value="valid">Performance valida</option>
            <option value="invalid">Performance invalida</option>
          </select>
          <select value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="all">Todas estrategias</option>
            <option value="none">Sem classificacao</option>
            {strategies.map(strategy => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
          </select>
          <select value={nameSort} onChange={e => setNameSort(e.target.value as 'asc' | 'desc')} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="asc">Nome A-Z</option>
            <option value="desc">Nome Z-A</option>
          </select>
        </div>
        {importResult && <p className={`mt-2 text-xs ${importResult.tone === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>{importResult.message} ({importResult.fileName}) · Criados: {importResult.created} · Atualizados: {importResult.updated} · Ignorados: {importResult.skipped}</p>}
        {movementImportResult && <p className={`mt-2 text-xs ${movementImportResult.tone === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>{movementImportResult.message} ({movementImportResult.fileName}) · Criadas: {movementImportResult.created} · Ignoradas: {movementImportResult.skipped}</p>}
      </div>

      <div className="divide-y divide-gray-50 max-h-[560px] overflow-y-auto">
        {assets.map(asset => {
          const strategyName = getStrategyName(asset.strategyId);
          const subName = getSubStrategyName(asset.subStrategyId);
          const strategy = strategies.find(s => s.id === asset.strategyId);
          const expanded = expandedAssetIds.has(asset.id);
          const assetMovements = movements
            .filter(m => m.assetId === asset.id)
            .sort((a, b) => movementSort === 'desc' ? b.data.localeCompare(a.data) : a.data.localeCompare(b.data));
          const performanceValidation = validateAssetForPerformance(asset, assetMovements);
          const historyNetQty = getNetHistoryQuantity(assetMovements);
          const displayedQty = asset.quantidade ?? historyNetQty;
          const isQtyDivergent = historyNetQty !== undefined && asset.quantidade !== undefined && Math.abs(asset.quantidade - historyNetQty) > 0.0001;

          return (
            <div key={asset.id} className="group">
              <div className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                <button
                  onClick={() => setExpandedAssetIds(prev => {
                    const next = new Set(prev);
                    next.has(asset.id) ? next.delete(asset.id) : next.add(asset.id);
                    return next;
                  })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="w-2 h-8 rounded-full" style={{ backgroundColor: strategy?.color || '#e5e7eb' }} />
                <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2">
                     <span className="font-medium text-gray-800 text-sm truncate">{asset.nomeExibicao || asset.name}</span>
                     <span className={`text-xs px-2 py-0.5 rounded-full ${performanceValidation.valid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                       {performanceValidation.valid ? 'Performance OK' : 'Performance invalida'}
                     </span>
                     {!asset.strategyId && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex items-center gap-1"><Tag size={10} />Sem classificacao</span>}
                     {(asset.referenciaRVId || asset.referenciaFundoId || asset.referenciaRFId) && (
                       <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Database size={10} />BD-OK</span>
                     )}
                     {!(asset.referenciaRVId || asset.referenciaFundoId || asset.referenciaRFId) && (
                       <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Database size={10} />BD-NOK</span>
                     )}
                   </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-green-700">{formatCurrency(getAssetPositionValue(asset))}</span>
                    <span>{asset.tipo}</span>
                    {strategyName && <span>{strategyName}</span>}
                    {subName && <span>{subName}</span>}
                    {asset.tickerCodigo && <span>Ticker: {asset.tickerCodigo}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(asset)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                  {deleteConfirm === asset.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(asset.id)} className="p-1 bg-red-500 text-white rounded hover:bg-red-600"><Check size={12} /></button>
                      <button onClick={() => setDeleteConfirm(null)} className="p-1 bg-gray-100 text-gray-500 rounded hover:bg-gray-200"><X size={12} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(asset.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="px-10 pb-4 bg-gray-50/70 border-t border-gray-100">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 text-xs">
                    <div>
                      <span className="text-gray-400">Quantidade</span>
                      <p className="font-semibold text-gray-700">{displayedQty ?? '-'}</p>
                      {historyNetQty !== undefined && asset.quantidade === undefined && (
                        <p className="text-[11px] text-blue-600">Calculada automaticamente pelo historico</p>
                      )}
                      {isQtyDivergent && (
                        <p className="text-[11px] text-amber-700 flex items-center gap-1">
                          <AlertTriangle size={11} /> Divergente do historico ({historyNetQty})
                        </p>
                      )}
                    </div>
                    <div><span className="text-gray-400">Preco Unitario</span><p className="font-semibold text-gray-700">{asset.precoUnitario !== undefined ? formatCurrency(asset.precoUnitario) : '-'}</p></div>
                    <div><span className="text-gray-400">Valor Posicao</span><p className="font-semibold text-gray-700">{formatCurrency(getAssetPositionValue(asset))}</p></div>
                    <div><span className="text-gray-400">Tipo</span><p className="font-semibold text-gray-700">{asset.tipo}</p></div>
                    <div><span className="text-gray-400">Ticker/Codigo</span><p className="font-semibold text-gray-700">{asset.tickerCodigo || '-'}</p></div>
                    <div><span className="text-gray-400">CNPJ</span><p className="font-semibold text-gray-700">{asset.cnpj || '-'}</p></div>
                    <div><span className="text-gray-400">ISIN</span><p className="font-semibold text-gray-700">{asset.isin || '-'}</p></div>
                    <div><span className="text-gray-400">Isento IR</span><p className="font-semibold text-gray-700">{asset.isentoIR ? 'Sim' : 'Nao'}</p></div>
                    <div><span className="text-gray-400">Ultima Atualizacao</span><p className="font-semibold text-gray-700">{new Date(asset.dataUltimaAtualizacao).toLocaleDateString('pt-BR')}</p></div>
                    <div><span className="text-gray-400">Origem</span><p className="font-semibold text-gray-700">{asset.origemAtualizacao}</p></div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Historico de movimentacoes</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMovementSort(prev => prev === 'desc' ? 'asc' : 'desc')}
                        className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                        title="Alternar ordem do historico"
                      >
                        <ArrowUpDown size={12} />
                        {movementSort === 'desc' ? 'Mais nova primeiro' : 'Mais antiga primeiro'}
                      </button>
                      <button onClick={() => openMovementModal(asset.id)} className="text-xs px-3 py-1.5 rounded border border-green-300 text-green-700 hover:bg-green-50">Adicionar movimentacao</button>
                    </div>
                  </div>

                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[700px] text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="py-2">Data</th><th>Tipo</th><th>Quantidade</th><th>Valor Unitario</th><th>Valor Total</th><th>Observacao</th><th>Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assetMovements.length === 0 && <tr><td colSpan={7} className="py-3 text-gray-400">Sem movimentacoes registradas.</td></tr>}
                        {assetMovements.map((movement: AssetMovement) => (
                          <tr key={movement.id} className="border-b border-gray-100">
                            <td className="py-2">{formatIsoDate(movement.data)}</td>
                            <td>{movement.tipoMovimentacao}</td>
                            <td>{movement.quantidade ?? '-'}</td>
                            <td>{movement.valorUnitario !== undefined ? formatCurrency(movement.valorUnitario) : '-'}</td>
                            <td>{formatCurrency(movement.valorTotal)}</td>
                            <td className="text-gray-500">{movement.observacao || '-'}</td>
                            <td>
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEditMovementModal(movement)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                                  <Edit2 size={12} />
                                </button>
                                <button onClick={() => handleDeleteMovement(movement)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal title={editId ? 'Editar Ativo' : 'Novo Ativo'} onClose={() => setShowModal(false)} size="lg">

<div className="flex flex-col gap-3">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Digite para buscar no Banco de Dados..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => selectSuggestion(s)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-800">{s.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          s.source === 'rv' ? 'bg-blue-100 text-blue-700' :
                          s.source === 'fundo' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-violet-100 text-violet-700'
                        }`}>
                          {s.source === 'rv' ? 'RV' : s.source === 'fundo' ? 'Fundo' : 'RF'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {s.tickerCodigo && `Ticker: ${s.tickerCodigo}`}
                        {s.cnpj && `CNPJ: ${s.cnpj}`}
                        {s.codigo && `Código: ${s.codigo}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome exibicao</label>
              <input value={form.nomeExibicao} onChange={e => setForm(prev => ({ ...prev, nomeExibicao: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estrategia</label>
              <select value={form.strategyId} onChange={e => setForm(prev => ({ ...prev, strategyId: e.target.value, subStrategyId: '' }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Sem classificacao</option>
                {strategies.map(strategy => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subestrategia</label>
              <select value={form.subStrategyId} onChange={e => setForm(prev => ({ ...prev, subStrategyId: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Sem subestrategia</option>
                {subStrategiesForSelected.map(ss => <option key={ss.id} value={ss.id}>{ss.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modo meta ativo</label>
              <select value={form.modoMetaAtivo} onChange={e => setForm(prev => ({ ...prev, modoMetaAtivo: e.target.value as AssetTargetMode }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="score">score</option>
                <option value="percentage">percentage</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor meta ativo</label>
              <input type="number" value={form.valorMetaAtivo} onChange={e => setForm(prev => ({ ...prev, valorMetaAtivo: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor Posicao</label>
              <input type="number" step="0.01" value={form.valorPosicao} onChange={e => setForm(prev => ({ ...prev, valorPosicao: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.isentoIR} onChange={e => setForm(prev => ({ ...prev, isentoIR: e.target.checked }))} />
              Isento de IR
            </label>

            {form.matchedSource && (
              <>
                <div className="border-t border-gray-100 pt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <input value={form.tipo} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                  <input type="number" step="0.00000001" value={form.quantidade} onChange={e => setForm(prev => ({ ...prev, quantidade: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preco Unitario</label>
                  <input type="number" step="0.00000001" value={form.precoUnitario} onChange={e => setForm(prev => ({ ...prev, precoUnitario: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </>
            )}

            {form.matchedSource === 'rv' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticker/Codigo</label>
                <input value={form.tickerCodigo} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
              </div>
            )}

            {form.matchedSource === 'fundo' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input value={form.cnpj} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
              </div>
            )}

            {form.matchedSource === 'rf' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Codigo (Renda Fixa)</label>
                  <input value={form.identificadorExterno} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                  <input type="date" value={form.vencimentoRF} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Indexador *</label>
                  <input value={form.tipoIndexadorRF} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Taxa contratada</label>
                  <input type="number" step="0.01" value={form.taxaContratada} onChange={e => setForm(prev => ({ ...prev, taxaContratada: e.target.value }))} placeholder="Ex: 2 ou 0,3" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleSave} disabled={!form.name.trim()} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50">{editId ? 'Salvar alteracoes' : 'Cadastrar ativo'}</button>
            <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
          </div>
        </Modal>
      )}

      {movementAssetId && (
        <Modal title={movementEditId ? 'Editar movimentacao' : 'Adicionar movimentacao'} onClose={closeMovementModal}>
          <div className="space-y-3">
            <input type="date" value={movementForm.data} onChange={e => setMovementForm(prev => ({ ...prev, data: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <select value={movementForm.tipoMovimentacao} onChange={e => setMovementForm(prev => ({ ...prev, tipoMovimentacao: e.target.value as MovementType }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {['compra','venda','rendimento','dividendo','juros','amortizacao','aporte','retirada','ajuste','outro'].map(type => <option key={type} value={type}>{type}</option>)}
            </select>
            <input type="number" step="0.00000001" placeholder="Quantidade" value={movementForm.quantidade} onChange={e => setMovementForm(prev => ({ ...prev, quantidade: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input type="number" step="0.00000001" placeholder="Valor unitario" value={movementForm.valorUnitario} onChange={e => setMovementForm(prev => ({ ...prev, valorUnitario: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input
              type="number"
              step="0.01"
              placeholder="Valor total"
              value={movementForm.valorTotal}
              onFocus={() => {
                const qty = parseSheetNumber(movementForm.quantidade);
                const unit = parseSheetNumber(movementForm.valorUnitario);
                if (Number.isFinite(qty) && Number.isFinite(unit)) {
                  setMovementForm(prev => ({ ...prev, valorTotal: String(roundMoney(qty * unit)) }));
                }
              }}
              onChange={e => setMovementForm(prev => ({ ...prev, valorTotal: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <textarea placeholder="Observacao" value={movementForm.observacao} onChange={e => setMovementForm(prev => ({ ...prev, observacao: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
            <div className="flex gap-3">
              <button onClick={saveMovement} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">{movementEditId ? 'Salvar alteracoes' : 'Salvar movimentacao'}</button>
              <button onClick={closeMovementModal} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
