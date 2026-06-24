import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CalendarDays, Database, Download, Landmark, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, Upload, X, Building2, BookOpen } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from '../store/useStore';
import { fetchMultipleQuotes } from '../services/marketData';
import BancoDadosFundos from './BancoDadosFundos';
import BancoDadosRendaFixa from './BancoDadosRendaFixa';
import Modal from './Modal';
import type { AnbimaHoliday, IrBracket } from '../types';

type DatabaseTab = 'cdi' | 'ir' | 'holidays' | 'rv' | 'fundos' | 'rf';

interface CdiDraft {
  data: string;
  taxaDiaria: string;
  taxaDecimal: string;
}

interface IrDraft {
  diasDe: string;
  diasAte: string;
  aliquota: string;
}

interface HolidayDraft {
  data: string;
  diaSemana: string;
  feriado: string;
}

interface RvDraft {
  tickerCodigo: string;
  classe: string;
  precoUnitario: string;
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text) return Number.NaN;
  const cleaned = text.replace(/\s+/g, '').replace('%', '');
  if (cleaned.includes(',') && cleaned.includes('.')) return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  if (cleaned.includes(',')) return Number(cleaned.replace(',', '.'));
  return Number(cleaned);
}

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, '');
}

function toIsoDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = String(parsed.y).padStart(4, '0');
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
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
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

function formatIsoDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function DatabaseDashboard() {
  const store = useStore();
  const cdiFileInputRef = useRef<HTMLInputElement | null>(null);
  const holidayFileInputRef = useRef<HTMLInputElement | null>(null);
  const rvFileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<DatabaseTab>('cdi');

  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newRate, setNewRate] = useState('');
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [cdiDraft, setCdiDraft] = useState<CdiDraft>({ data: '', taxaDiaria: '', taxaDecimal: '' });

  const [editingIrId, setEditingIrId] = useState<string | null>(null);
  const [irDraft, setIrDraft] = useState<IrDraft>({ diasDe: '', diasAte: '', aliquota: '' });

  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [holidayDraft, setHolidayDraft] = useState<HolidayDraft>({ data: '', diaSemana: '', feriado: '' });
  const [holidayImportMessage, setHolidayImportMessage] = useState('');

  const [editingRvId, setEditingRvId] = useState<string | null>(null);
  const [rvDraft, setRvDraft] = useState<RvDraft>({ tickerCodigo: '', classe: '', precoUnitario: '' });
  const [rvImportMessage, setRvImportMessage] = useState('');
  const [rvUpdateMessage, setRvUpdateMessage] = useState('');
  const [brapiToken, setBrapiToken] = useState('');
  const [rvApiLoading, setRvApiLoading] = useState(false);
  const [rvApiMessage, setRvApiMessage] = useState('');
  const [showRvDateModal, setShowRvDateModal] = useState(false);
  const [rvImportDate, setRvImportDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const pendingRvFileRef = useRef<File | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('gestorConfig');
      if (raw) {
        const parsed = JSON.parse(raw) as { brapiToken?: string };
        if (parsed.brapiToken) setBrapiToken(parsed.brapiToken);
      }
    } catch (error) {
      console.error('Erro ao carregar token brapi:', error);
    }
  }, []);

  const cdiRows = useMemo(
    () => [...store.cdiRates].sort((a, b) => b.data.localeCompare(a.data)),
    [store.cdiRates]
  );

  const irRows = useMemo(
    () => [...store.irBrackets].sort((a, b) => a.diasDe - b.diasDe),
    [store.irBrackets]
  );

  const holidayRows = useMemo(
    () => [...store.anbimaHolidays].sort((a, b) => a.data.localeCompare(b.data)),
    [store.anbimaHolidays]
  );

  const rvRows = useMemo(
    () => [...store.rvPrices].sort((a, b) => a.tickerCodigo.localeCompare(b.tickerCodigo)),
    [store.rvPrices]
  );

  const replaceCdiRows = (rows: Array<{ data: string; taxaDiaria: number; taxaDecimal: number }>) => {
    const dedup = new Map<string, { data: string; taxaDiaria: number; taxaDecimal: number }>();
    for (const row of rows) {
      if (!row.data || !Number.isFinite(row.taxaDiaria)) continue;
      dedup.set(row.data, row);
    }
    store.setCdiRates(Array.from(dedup.values()).sort((a, b) => a.data.localeCompare(b.data)));
  };

  const addManualRate = () => {
    const taxaDiaria = parseNumber(newRate);
    if (!newDate || !Number.isFinite(taxaDiaria)) return;
    store.addCdiRate({ data: newDate, taxaDiaria, taxaDecimal: taxaDiaria / 100 });
    setNewRate('');
  };

  const removeRate = (date: string) => {
    const next = store.cdiRates
      .filter(row => row.data !== date)
      .map(row => ({ data: row.data, taxaDiaria: row.taxaDiaria, taxaDecimal: row.taxaDecimal }));
    replaceCdiRows(next);
  };

  const startCdiEdit = (date: string) => {
    const row = store.cdiRates.find(r => r.data === date);
    if (!row) return;
    setEditingDate(date);
    setCdiDraft({ data: row.data, taxaDiaria: String(row.taxaDiaria), taxaDecimal: String(row.taxaDecimal) });
  };

  const saveCdiEdit = () => {
    if (!editingDate) return;
    const taxaDiaria = parseNumber(cdiDraft.taxaDiaria);
    const taxaDecimalInput = parseNumber(cdiDraft.taxaDecimal);
    if (!cdiDraft.data || !Number.isFinite(taxaDiaria)) return;
    const taxaDecimal = Number.isFinite(taxaDecimalInput) ? taxaDecimalInput : taxaDiaria / 100;
    const next = store.cdiRates
      .filter(r => r.data !== editingDate)
      .map(r => ({ data: r.data, taxaDiaria: r.taxaDiaria, taxaDecimal: r.taxaDecimal }));
    next.push({ data: cdiDraft.data, taxaDiaria, taxaDecimal });
    replaceCdiRows(next);
    setEditingDate(null);
  };

  const importCdi = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const mapped = rows.map(row => {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;
        const data = toIsoDate(normalized.data);
        const taxaDiaria = parseNumber(normalized.taxadiaria ?? normalized.taxa ?? 0);
        const taxaDecimalRaw = parseNumber(normalized.taxadecimal);
        return {
          data,
          taxaDiaria,
          taxaDecimal: Number.isFinite(taxaDecimalRaw) ? taxaDecimalRaw : taxaDiaria / 100,
        };
      }).filter((row): row is { data: string; taxaDiaria: number; taxaDecimal: number } => Boolean(row.data));
      replaceCdiRows(mapped);
    } finally {
      event.target.value = '';
    }
  };

  const downloadCdiTemplate = () => {
    const wb = XLSX.utils.book_new();
    const model = [
      { Data: '02/01/2026', TaxaDiaria: 0.05, TaxaDecimal: 0.0005 },
      { Data: '03/01/2026', TaxaDiaria: 0.05, TaxaDecimal: 0.0005 },
    ];
    const instructions = [
      ['Campo', 'Descricao'],
      ['Data', 'Use preferencialmente DD/MM/AAAA no Excel (tambem aceita AAAA-MM-DD).'],
      ['TaxaDiaria', 'Taxa diaria em percentual. Ex: 0,05 para 0,05%.'],
      ['TaxaDecimal', 'Opcional. Se vazio, sistema usa TaxaDiaria / 100.'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(model), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_cdi.xlsx');
  };

  const exportCdi = () => {
    const wb = XLSX.utils.book_new();
    const rows = [...store.cdiRates]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(r => ({ Data: formatIsoDate(r.data), TaxaDiaria: r.taxaDiaria, TaxaDecimal: r.taxaDecimal, IndiceAcumulado: r.indiceAcumulado }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'CDI');
    XLSX.writeFile(wb, 'cdi_base_global.xlsx');
  };

  const startIrEdit = (row: IrBracket) => {
    setEditingIrId(row.id);
    setIrDraft({
      diasDe: String(row.diasDe),
      diasAte: row.diasAte === undefined ? '' : String(row.diasAte),
      aliquota: String(row.aliquota),
    });
  };

  const saveIrEdit = () => {
    if (!editingIrId) return;
    const diasDe = parseNumber(irDraft.diasDe);
    const diasAte = parseNumber(irDraft.diasAte);
    const aliquota = parseNumber(irDraft.aliquota);
    if (!Number.isFinite(diasDe) || !Number.isFinite(aliquota)) return;
    const next = store.irBrackets.map(row => row.id === editingIrId
      ? {
          ...row,
          diasDe,
          diasAte: Number.isFinite(diasAte) ? diasAte : undefined,
          aliquota,
        }
      : row
    );
    store.setIrBrackets(next.sort((a, b) => a.diasDe - b.diasDe));
    setEditingIrId(null);
  };

  const addIrRow = () => {
    const next = [
      ...store.irBrackets,
      { id: makeId('ir'), diasDe: 0, diasAte: undefined, aliquota: 0 },
    ];
    store.setIrBrackets(next.sort((a, b) => a.diasDe - b.diasDe));
  };

  const removeIrRow = (id: string) => {
    store.setIrBrackets(store.irBrackets.filter(row => row.id !== id).sort((a, b) => a.diasDe - b.diasDe));
  };

  const importHolidays = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      let skipped = 0;
      const mapped = rows.flatMap(row => {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;
        const data = toIsoDate(normalized.data);
        if (!data) {
          skipped += 1;
          return [];
        }
        return [{
          data,
          diaSemana: String(normalized.diadasemana ?? '').trim(),
          feriado: String(normalized.feriado ?? '').trim(),
        }];
      });
      store.setAnbimaHolidays(mapped);
      setHolidayImportMessage(`Importacao concluida: ${mapped.length} feriado(s), ${skipped} linha(s) ignorada(s).`);
    } catch {
      setHolidayImportMessage('Falha ao importar a planilha de feriados.');
    } finally {
      event.target.value = '';
    }
  };

  const downloadHolidayTemplate = () => {
    const wb = XLSX.utils.book_new();
    const model = [
      { Data: '01/01/2026', 'Dia da semana': 'quinta-feira', Feriado: 'Confraternizacao Universal' },
      { Data: '25/12/2026', 'Dia da semana': 'sexta-feira', Feriado: 'Natal' },
    ];
    const instructions = [
      ['Campo', 'Descricao'],
      ['Data', 'Data do feriado em DD/MM/AAAA.'],
      ['Dia da semana', 'Nome do dia da semana como segunda-feira, terça-feira etc.'],
      ['Feriado', 'Descricao do feriado.'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(model), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_feriados_anbima.xlsx');
  };

  const exportHolidays = () => {
    const wb = XLSX.utils.book_new();
    const rows = holidayRows.map(row => ({
      Data: formatIsoDate(row.data),
      'Dia da semana': row.diaSemana,
      Feriado: row.feriado,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Feriados ANBIMA');
    XLSX.writeFile(wb, 'feriados_anbima.xlsx');
  };

  // ---- Renda Variável ----
  const startRvEdit = (row: import('../types').RendaVariavelPrice) => {
    setEditingRvId(row.id);
    setRvDraft({
      tickerCodigo: row.tickerCodigo,
      classe: row.classe,
      precoUnitario: String(row.precoUnitario),
    });
  };

  const saveRvEdit = () => {
    if (!editingRvId) return;
    const preco = parseNumber(rvDraft.precoUnitario);
    if (!rvDraft.tickerCodigo.trim() || !Number.isFinite(preco)) return;
    store.updateRvPrice(editingRvId, {
      tickerCodigo: rvDraft.tickerCodigo.trim().toUpperCase(),
      classe: rvDraft.classe.trim(),
      precoUnitario: preco,
      atualizadoEm: new Date().toISOString(),
    });
    setEditingRvId(null);
  };

  const addRvRow = () => {
    const newPrice = store.addRvPrice({ tickerCodigo: '', classe: '', precoUnitario: 0, atualizadoEm: new Date().toISOString() });
    setEditingRvId(newPrice.id);
    setRvDraft({ tickerCodigo: '', classe: '', precoUnitario: '' });
  };

  const removeRvRow = (id: string) => {
    store.deleteRvPrice(id);
  };

  const handleRvFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    pendingRvFileRef.current = file;
    setRvImportDate(new Date().toISOString().slice(0, 10));
    setShowRvDateModal(true);
    event.target.value = '';
  };

  const processRvImport = async () => {
    if (!pendingRvFileRef.current) return;
    const file = pendingRvFileRef.current;
    pendingRvFileRef.current = null;
    setShowRvDateModal(false);

    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      console.log('Colunas detectadas na planilha RV:', rows.length > 0 ? Object.keys(rows[0]) : 'nenhuma');

      let skipped = 0;
      const mapped = rows.flatMap((row, idx) => {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;

        const tickerCodigo = String(
          normalized.tickercodigo ??
          normalized.ticker ??
          normalized.codigo ??
          normalized['ticker/codigo'] ??
          normalized['codigodoticker'] ??
          ''
        ).trim().toUpperCase();

        const classe = String(
          normalized.classe ??
          normalized.tipo ??
          normalized.categoria ??
          normalized.segmento ??
          ''
        ).trim();

        const precoRaw =
          normalized.precounitario ??
          normalized.preco ??
          normalized.valor ??
          normalized.precoatual ??
          normalized['precounitario'] ??
          0;
        const preco = parseNumber(precoRaw);

        if (!tickerCodigo || !Number.isFinite(preco)) {
          console.warn(`Linha ${idx + 1} ignorada: ticker="${tickerCodigo}", preco=${preco}`, normalized);
          skipped += 1;
          return [];
        }
        return [{ tickerCodigo, classe, precoUnitario: preco, atualizadoEm: new Date(`${rvImportDate}T12:00:00`).toISOString() }];
      });

      const merged = new Map(store.rvPrices.map(p => [p.tickerCodigo, p]));
      for (const item of mapped) {
        merged.set(item.tickerCodigo, { ...item, id: makeId('rv') });
      }
      store.setRvPrices(Array.from(merged.values()).sort((a, b) => a.tickerCodigo.localeCompare(b.tickerCodigo)));
      setRvImportMessage(`Importacao concluida: ${mapped.length} preco(s), ${skipped} linha(s) ignorada(s).`);
    } catch (error) {
      console.error('Erro na importacao RV:', error);
      setRvImportMessage('Falha ao importar a planilha de precos. Verifique o console para detalhes.');
    }
  };

  const downloadRvTemplate = () => {
    const wb = XLSX.utils.book_new();
    const model = [
      { 'Ticker/Codigo': 'PETR4', Classe: 'acao', 'Preco Unitario': 38.5 },
      { 'Ticker/Codigo': 'KNRI11', Classe: 'fii', 'Preco Unitario': 142.3 },
      { 'Ticker/Codigo': 'IVVB11', Classe: 'etf', 'Preco Unitario': 310.0 },
    ];
    const instructions = [
      ['Campo', 'Descricao'],
      ['Ticker/Codigo', 'Codigo do ativo (ex: PETR4, KNRI11).'],
      ['Classe', 'Tipo do ativo: acao, fii, etf, bdr, cripto.'],
      ['Preco Unitario', 'Preco de mercado atual do ativo.'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(model), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_renda_variavel.xlsx');
  };

  const exportRvPrices = () => {
    const wb = XLSX.utils.book_new();
    const rows = rvRows.map(row => ({
      'Ticker/Codigo': row.tickerCodigo,
      Classe: row.classe,
      'Preco Unitario': row.precoUnitario,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Renda Variavel');
    XLSX.writeFile(wb, 'precos_renda_variavel.xlsx');
  };

  const updateAssetPricesFromRv = () => {
    const priceMap = new Map(store.rvPrices.map(p => [p.tickerCodigo, { preco: p.precoUnitario, data: p.atualizadoEm }]));
    let atualizados = 0;
    let naoEncontrados = 0;

    for (const asset of store.assets) {
      if (!asset.tickerCodigo) continue;
      const ticker = asset.tickerCodigo.trim().toUpperCase();
      const priceData = priceMap.get(ticker);
      if (priceData === undefined) {
        naoEncontrados += 1;
        continue;
      }
      const quantidade = asset.quantidade ?? 0;
      store.updateAsset(asset.id, {
        precoUnitario: priceData.preco,
        valorPosicao: quantidade * priceData.preco,
        dataUltimaAtualizacao: priceData.data || new Date().toISOString(),
        origemAtualizacao: 'api',
      });
      atualizados += 1;
    }

    setRvUpdateMessage(`Atualizacao concluida: ${atualizados} ativo(s) atualizado(s), ${naoEncontrados} sem correspondencia.`);
  };

  const handleAtualizarPrecosBrapi = async () => {
    if (!brapiToken.trim()) {
      setRvApiMessage('Informe o token da brapi para atualizar os precos.');
      return;
    }
    if (store.rvPrices.length === 0) {
      setRvApiMessage('Nenhum ticker cadastrado na tabela de Renda Variavel.');
      return;
    }

    setRvApiLoading(true);
    setRvApiMessage('');
    try {
      const tickers = store.rvPrices.map(p => p.tickerCodigo);
      const quotes = await fetchMultipleQuotes(tickers, brapiToken.trim());

      const now = new Date().toISOString();
      let atualizados = 0;
      let naoEncontrados = 0;

      const nextPrices = store.rvPrices.map(price => {
        const novoPreco = quotes.get(price.tickerCodigo);
        if (novoPreco === undefined) {
          naoEncontrados += 1;
          return price;
        }
        atualizados += 1;
        return { ...price, precoUnitario: novoPreco, atualizadoEm: now };
      });

      store.setRvPrices(nextPrices);
      setRvApiMessage(`Precos atualizados via brapi: ${atualizados} ticker(s), ${naoEncontrados} nao encontrado(s).`);
    } catch (error) {
      console.error('Erro ao atualizar precos via brapi:', error);
      setRvApiMessage('Falha ao buscar precos na brapi. Verifique o token e a conexao.');
    } finally {
      setRvApiLoading(false);
    }
  };

  const startHolidayEdit = (row: AnbimaHoliday) => {
    setEditingHolidayId(row.id);
    setHolidayDraft({ data: row.data, diaSemana: row.diaSemana, feriado: row.feriado });
  };

  const saveHolidayEdit = () => {
    if (!editingHolidayId || !holidayDraft.data) return;
    store.updateAnbimaHoliday(editingHolidayId, holidayDraft);
    setEditingHolidayId(null);
  };

  const tabs = [
    { id: 'cdi' as const, label: 'Historico do CDI', icon: Database, count: store.cdiRates.length },
    { id: 'ir' as const, label: 'Tabela de IR', icon: Landmark, count: store.irBrackets.length },
    { id: 'holidays' as const, label: 'Feriados ANBIMA', icon: CalendarDays, count: store.anbimaHolidays.length },
    { id: 'rv' as const, label: 'Renda Variavel', icon: Download, count: store.rvPrices.length },
    { id: 'fundos' as const, label: 'Fundos de Investimento', icon: Building2, count: store.fundosReferencia.length },
    { id: 'rf' as const, label: 'Renda Fixa', icon: BookOpen, count: store.rendasFixasReferencia.length },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-lg">
            <Database size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">Banco de Dados Global</h2>
            <p className="text-xs text-gray-500">Tabelas compartilhadas entre todos os clientes</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap border-b border-gray-100">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={15} />
                {tab.label}
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'cdi' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-semibold text-gray-800">Historico do CDI</h3>
                <p className="text-xs text-gray-500">Taxas diarias e indice acumulado global</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={downloadCdiTemplate} className="px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm hover:bg-blue-50 flex items-center gap-1"><Download size={14} /> Modelo</button>
                <button onClick={exportCdi} className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"><Download size={14} /> Exportar</button>
                <button onClick={() => cdiFileInputRef.current?.click()} className="px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50 flex items-center gap-1"><Upload size={14} /> Importar</button>
                <input ref={cdiFileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importCdi} />
              </div>
            </div>

            <div className="mt-4 flex items-end gap-2 flex-wrap">
              <div>
                <label className="text-xs text-gray-500">Data</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="block border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Taxa diaria (%)</label>
                <input value={newRate} onChange={e => setNewRate(e.target.value)} className="block border border-gray-200 rounded-lg px-3 py-2 text-sm w-36" placeholder="0,05" />
              </div>
              <button onClick={addManualRate} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Adicionar taxa</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Data</th>
                    <th className="text-right px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Taxa diaria (%)</th>
                    <th className="text-right px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Taxa decimal</th>
                    <th className="text-right px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Indice acumulado</th>
                    <th className="text-center px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {cdiRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">Nenhum registro CDI cadastrado.</td>
                    </tr>
                  )}
                  {cdiRows.map(row => {
                    const editing = editingDate === row.data;
                    return (
                      <tr key={row.data} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-700">
                          {editing ? (
                            <input type="date" value={cdiDraft.data} onChange={e => setCdiDraft(prev => ({ ...prev, data: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs" />
                          ) : formatIsoDate(row.data)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-gray-700">
                          {editing ? (
                            <input value={cdiDraft.taxaDiaria} onChange={e => setCdiDraft(prev => ({ ...prev, taxaDiaria: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs text-right w-24" />
                          ) : row.taxaDiaria.toFixed(6)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-gray-700">
                          {editing ? (
                            <input value={cdiDraft.taxaDecimal} onChange={e => setCdiDraft(prev => ({ ...prev, taxaDecimal: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs text-right w-24" />
                          ) : row.taxaDecimal.toFixed(8)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-mono text-gray-800">{row.indiceAcumulado.toFixed(8)}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {editing ? (
                              <>
                                <button onClick={saveCdiEdit} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700"><Save size={13} /></button>
                                <button onClick={() => setEditingDate(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={13} /></button>
                              </>
                            ) : (
                              <button onClick={() => startCdiEdit(row.data)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700"><Pencil size={13} /></button>
                            )}
                            <button onClick={() => removeRate(row.data)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'ir' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between gap-4 flex-wrap p-4 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-gray-800">Tabela de IR</h3>
              <p className="text-xs text-gray-500">Faixas usadas nos calculos de rendimento</p>
            </div>
            <button onClick={addIrRow} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"><Plus size={14} /> Nova faixa</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Dias de</th>
                  <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Dias ate</th>
                  <th className="text-right px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Aliquota (%)</th>
                  <th className="text-center px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {irRows.map(row => {
                  const editing = editingIrId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-700">
                        {editing ? <input value={irDraft.diasDe} onChange={e => setIrDraft(prev => ({ ...prev, diasDe: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-24" /> : row.diasDe}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700">
                        {editing ? <input value={irDraft.diasAte} onChange={e => setIrDraft(prev => ({ ...prev, diasAte: e.target.value }))} placeholder="sem limite" className="border border-gray-200 rounded px-2 py-1 text-xs w-24" /> : row.diasAte ?? 'sem limite'}
                      </td>
                      <td className="px-3 py-2 text-sm text-right text-gray-700">
                        {editing ? <input value={irDraft.aliquota} onChange={e => setIrDraft(prev => ({ ...prev, aliquota: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs text-right w-24" /> : row.aliquota.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {editing ? (
                            <>
                              <button onClick={saveIrEdit} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700"><Save size={13} /></button>
                              <button onClick={() => setEditingIrId(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={13} /></button>
                            </>
                          ) : (
                            <button onClick={() => startIrEdit(row)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700"><Pencil size={13} /></button>
                          )}
                          <button onClick={() => removeIrRow(row.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'holidays' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-semibold text-gray-800">Feriados ANBIMA</h3>
                <p className="text-xs text-gray-500">Base global importada por planilha</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={downloadHolidayTemplate} className="px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm hover:bg-blue-50 flex items-center gap-1"><Download size={14} /> Modelo</button>
                <button onClick={exportHolidays} className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"><Download size={14} /> Exportar</button>
                <button onClick={() => holidayFileInputRef.current?.click()} className="px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50 flex items-center gap-1"><Upload size={14} /> Importar</button>
                <input ref={holidayFileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importHolidays} />
              </div>
            </div>
            {holidayImportMessage && <p className="mt-2 text-xs text-indigo-700">{holidayImportMessage}</p>}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full min-w-[760px] border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Data</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Dia da semana</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Feriado</th>
                    <th className="text-center px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {holidayRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">Nenhum feriado ANBIMA importado.</td>
                    </tr>
                  )}
                  {holidayRows.map(row => {
                    const editing = editingHolidayId === row.id;
                    return (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-700">
                          {editing ? <input type="date" value={holidayDraft.data} onChange={e => setHolidayDraft(prev => ({ ...prev, data: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs" /> : formatIsoDate(row.data)}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-700">
                          {editing ? <input value={holidayDraft.diaSemana} onChange={e => setHolidayDraft(prev => ({ ...prev, diaSemana: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-40" /> : row.diaSemana}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-700">
                          {editing ? <input value={holidayDraft.feriado} onChange={e => setHolidayDraft(prev => ({ ...prev, feriado: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-full" /> : row.feriado}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {editing ? (
                              <>
                                <button onClick={saveHolidayEdit} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700"><Save size={13} /></button>
                                <button onClick={() => setEditingHolidayId(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={13} /></button>
                              </>
                            ) : (
                              <button onClick={() => startHolidayEdit(row)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700"><Pencil size={13} /></button>
                            )}
                            <button onClick={() => store.deleteAnbimaHoliday(row.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'rv' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-semibold text-gray-800">Precos de Renda Variavel</h3>
                <p className="text-xs text-gray-500">Base global de precos aplicada a todos os clientes</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={downloadRvTemplate} className="px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm hover:bg-blue-50 flex items-center gap-1"><Download size={14} /> Modelo</button>
                <button onClick={exportRvPrices} className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"><Download size={14} /> Exportar</button>
                <button onClick={() => rvFileInputRef.current?.click()} className="px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50 flex items-center gap-1"><Upload size={14} /> Importar</button>
                <input ref={rvFileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleRvFileSelect} />
                <button onClick={updateAssetPricesFromRv} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"><RefreshCw size={14} /> Aplicar preços nos ativos</button>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-end gap-2 flex-wrap border-t border-gray-100 pt-4">
              <div className="flex-1 min-w-[260px]">
                <label className="block text-xs text-gray-500 mb-1">Token brapi.dev</label>
                <input
                  type="password"
                  value={brapiToken}
                  onChange={e => setBrapiToken(e.target.value)}
                  placeholder="cole seu token da brapi.dev"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <button
                onClick={handleAtualizarPrecosBrapi}
                disabled={rvApiLoading || !brapiToken.trim()}
                className={`px-3 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1 ${
                  rvApiLoading || !brapiToken.trim()
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {rvApiLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {rvApiLoading ? 'Buscando...' : 'Atualizar precos via brapi'}
              </button>
            </div>

            {rvImportMessage && <p className="mt-2 text-xs text-indigo-700">{rvImportMessage}</p>}
            {rvUpdateMessage && <p className="mt-2 text-xs text-emerald-700">{rvUpdateMessage}</p>}
            {rvApiMessage && <p className="mt-2 text-xs text-blue-700">{rvApiMessage}</p>}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h4 className="font-medium text-gray-800 text-sm">Tabela de precos</h4>
              <button onClick={addRvRow} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"><Plus size={14} /> Cadastrar novo ativo</button>
            </div>
            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full min-w-[600px] border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Ticker / Codigo</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Classe</th>
                    <th className="text-right px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Preco Unitario</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Atualizado em</th>
                    <th className="text-center px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {rvRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">Nenhum preco de renda variavel cadastrado.</td>
                    </tr>
                  )}
                  {rvRows.map(row => {
                    const editing = editingRvId === row.id;
                    return (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-700">
                          {editing ? (
                            <input value={rvDraft.tickerCodigo} onChange={e => setRvDraft(prev => ({ ...prev, tickerCodigo: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-32" />
                          ) : row.tickerCodigo}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-700">
                          {editing ? (
                            <input value={rvDraft.classe} onChange={e => setRvDraft(prev => ({ ...prev, classe: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-32" />
                          ) : row.classe}
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-gray-700">
                          {editing ? (
                            <input value={rvDraft.precoUnitario} onChange={e => setRvDraft(prev => ({ ...prev, precoUnitario: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs text-right w-28" />
                          ) : row.precoUnitario.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {row.atualizadoEm
                            ? new Date(row.atualizadoEm).toLocaleString('pt-BR')
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {editing ? (
                              <>
                                <button onClick={saveRvEdit} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700"><Save size={13} /></button>
                                <button onClick={() => setEditingRvId(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={13} /></button>
                              </>
                            ) : (
                              <button onClick={() => startRvEdit(row)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700"><Pencil size={13} /></button>
                            )}
                            <button onClick={() => removeRvRow(row.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'fundos' && <BancoDadosFundos />}
      {activeTab === 'rf' && <BancoDadosRendaFixa />}

      {showRvDateModal && (
        <Modal title="Data de Referência dos Preços" onClose={() => { setShowRvDateModal(false); pendingRvFileRef.current = null; }} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-700">Qual a data de referência dos preços listados na tabela a ser importada?</p>
            <input
              type="date"
              value={rvImportDate}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRvImportDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setShowRvDateModal(false); pendingRvFileRef.current = null; }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={processRvImport} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-1"><Upload size={16} /> Continuar Importação</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
