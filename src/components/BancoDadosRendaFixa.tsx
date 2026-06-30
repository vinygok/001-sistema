import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Search, Plus, Calculator, Edit2, Trash2, Save, AlertTriangle, Info, Check, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from '../store/useStore';
import { calcularValorAtualAsset } from '../utils/rendaFixa';
import Modal from './Modal';
import type { AssetIndexer, RendaFixaReferencia } from '../types';

type RfClasse = 
  | 'cdb'
  | 'cdca'
  | 'compromissada'
  | 'coe'
  | 'cpr'
  | 'cra'
  | 'cri'
  | 'debenture'
  | 'lcd'
  | 'lca'
  | 'lci'
  | 'lf'
  | 'lfsn'
  | 'lfsc'
  | 'lft'
  | 'lig'
  | 'ltf'
  | 'ltn'
  | 'ntnb'
  | 'ntnbp'
  | 'ntnb1'
  | 'ntnf'
  | 'tesouro direto - lft'
  | 'tesouro direto - ltn'
  | 'tesouro direto - ntnb'
  | 'tesouro direto - ntnb1'
  | 'tesouro direto - ntnbp'
  | 'tesouro direto - ntnf';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface RfForm {
  classe: RfClasse;
  codigo: string;
  /**
   * Codigo Completo NAO e mais digitado pelo usuario — e calculado
   * automaticamente (ver buildCodigoCompleto) a partir de Classe,
   * Emissor, Codigo, Indexador, Taxa e Vencimento. Mantido no form
   * apenas como cache do valor exibido/salvo, nunca editado via input.
   */
  codigoCompleto: string;
  isin: string;
  emissor: string;
  cnpjEmissor: string;
  tipoIndexador: AssetIndexer;
  /**
   * Taxa ou spread contratado na emissao do titulo, conforme o indexador
   * (ver formatTaxaTexto para a semantica de cada caso). Digitado como
   * texto para permitir campo vazio durante a digitacao; convertido para
   * numero em handleSave.
   */
  taxa: string;
  vencimento: string;
  dataEmissao: string;
  pagaCupom: boolean;
  periodicidadeCupom: '' | 'mensal' | 'trimestral' | 'semestral' | 'anual';
  pagaAmortizacao: boolean;
  garantiaFGC: boolean;
  rating: string;
  valorMinimoInvestimento: string;
}

const CLASSE_LABEL: Record<RfClasse, string> = {
  cdb: 'CDB',
  cdca: 'CDCA',
  compromissada: 'Compromissada',
  coe: 'COE',
  cpr: 'CPR',
  cra: 'CRA',
  cri: 'CRI',
  debenture: 'Debenture',
  lcd: 'LCD',
  lca: 'LCA',
  lci: 'LCI',
  lf: 'LF',
  lfsn: 'LFSN',
  lfsc: 'LFSC',
  lft: 'LFT',
  lig: 'LIG',
  ltf: 'LTF',
  ltn: 'LTN',
  ntnb: 'NTN-B',
  ntnbp: 'NTN-B-P',
  ntnb1: 'NTN-B1',
  ntnf: 'NTN-F',
  'tesouro direto - lft': 'Tesouro Direto - LFT',
  'tesouro direto - ltn': 'Tesouro Direto - LTN',
  'tesouro direto - ntnb': 'Tesouro Direto - NTN-B',
  'tesouro direto - ntnb1': 'Tesouro Direto - NTN-B1',
  'tesouro direto - ntnbp': 'Tesouro Direto - NTN-B-P',
  'tesouro direto - ntnf': 'Tesouro Direto - NTN-F',
};

const CLASSE_PREFIX: Record<RfClasse, string> = {
  cdb: 'CDB-',
  cdca: 'CDCA-',
  compromissada: 'COMP-',
  coe: 'COE-',
  cpr: 'CPR-',
  cra: 'CRA-',
  cri: 'CRI-',
  debenture: 'DEB-',
  lcd: 'LCD-',
  lca: 'LCA-',
  lci: 'LCI-',
  lf: 'LF-',
  lfsn: 'LFSN-',
  lfsc: 'LFSC-',
  lft: 'LFT-',
  lig: 'LIG-',
  ltf: 'LTF-',
  ltn: 'LTN-',
  ntnb: 'NTN-B-',
  ntnbp: 'NTN-B-P-',
  ntnb1: 'NTN-B1-',
  ntnf: 'NTN-F-',
  'tesouro direto - lft': 'TES-LFT-',
  'tesouro direto - ltn': 'TES-LTN-',
  'tesouro direto - ntnb': 'TES-NTN-B-',
  'tesouro direto - ntnb1': 'TES-NTN-B1-',
  'tesouro direto - ntnbp': 'TES-NTN-B-P-',
  'tesouro direto - ntnf': 'TES-NTN-F-',
};

const INDEXADOR_LABEL: Record<AssetIndexer, string> = {
  cdi_mais_spread: 'CDI + spread',
  cdi_percentual: '% do CDI',
  igpm_mais_spread: 'IGP-M + spread',
  igpm_percentual: '% do IGP-M',
  ipca_mais_spread: 'IPCA + spread',
  prefixado: 'Prefixado',
  ptxv: 'PTXV',
  selic_mais_spread: 'Selic + spread',
  selic_percentual: '% da Selic',
  tr: 'TR',
};

/**
 * Formata a taxa contratada/spread como texto legivel, replicando a
 * logica da coluna "Taxa escrita" da planilha gerencial do Btg (aba
 * Export, coluna AC). Usada para montar o sufixo de taxa no Codigo
 * Completo do titulo (ver buildCodigoCompleto abaixo).
 *
 * Diferente da planilha do Btg (que parte de um texto bruto do BTG e
 * precisa "adivinhar" o indexador), aqui o indexador ja vem como enum
 * tecnico escolhido no formulario — entao a logica e mais direta: so
 * formata o numero no padrao certo para cada indexador.
 */
function formatTaxaTexto(tipoIndexador: AssetIndexer, taxa: number): string {
  const taxaFmt = taxa.toFixed(2).replace('.', ',');
  switch (tipoIndexador) {
    case 'cdi_mais_spread':
      return taxa === 0 ? 'CDI' : `CDI + ${taxaFmt}%`;
    case 'cdi_percentual':
      return taxa === 100 ? 'CDI' : `${taxaFmt}% do CDI`;
    case 'igpm_mais_spread':
      return taxa === 0 ? 'IGP-M' : `IGP-M + ${taxaFmt}%`;
    case 'igpm_percentual':
      return taxa === 100 ? '100% do IGP-M' : `${taxaFmt}% do IGP-M`;
    case 'ipca_mais_spread':
      return `IPCA + ${taxaFmt}%`;
    case 'prefixado':
      return `${taxaFmt}% a.a.`;
    case 'ptxv':
      return `PTXV + ${taxaFmt}%`;
    case 'selic_mais_spread':
      return `SELIC + ${taxaFmt}%`;
    case 'selic_percentual':
      return taxa === 100 ? 'SELIC' : `${taxaFmt}% da SELIC`;
    case 'tr':
      return `TR + ${taxaFmt}%`;
    default:
      return '';
  }
}

/**
 * Monta o "Codigo Completo" do titulo, replicando a coluna AD da planilha
 * gerencial do Btg: Classe + Emissor + Codigo + Taxa (texto) + Vencimento.
 * Esse e o campo usado como chave de busca no catalogo pelo formulario
 * de Novo Ativo (ver findCatalogMatch em utils/assetClasses.ts).
 */
function buildCodigoCompleto(params: {
  classe: RfClasse;
  emissor: string;
  codigo: string;
  tipoIndexador: AssetIndexer;
  taxa: number;
  vencimento: string;
}): string {
  const taxaTexto = formatTaxaTexto(params.tipoIndexador, params.taxa);
  const vencimentoFmt = params.vencimento
    ? new Date(`${params.vencimento}T00:00:00`).toLocaleDateString('pt-BR')
    : '';
  return [CLASSE_LABEL[params.classe], params.emissor, params.codigo, taxaTexto, vencimentoFmt]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toUpperCase();
}

const emptyForm: RfForm = {
  classe: 'cdb',
  codigo: '',
  codigoCompleto: '',
  isin: '',
  emissor: '',
  cnpjEmissor: '',
  tipoIndexador: 'cdi_percentual',
  taxa: '100',
  vencimento: '',
  dataEmissao: '',
  pagaCupom: false,
  periodicidadeCupom: '',
  pagaAmortizacao: false,
  garantiaFGC: true,
  rating: '',
  valorMinimoInvestimento: '',
};

function formatCnpj(cnpj: string): string {
  const n = cnpj.replace(/\D/g, '').slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

function formatBrDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function getVencimentoTone(vencimento: string): 'red' | 'yellow' | 'green' {
  const now = new Date();
  const v = new Date(`${vencimento}T00:00:00`);
  if (v.getTime() < now.getTime()) return 'red';
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  if (v.getTime() - now.getTime() <= oneYear) return 'yellow';
  return 'green';
}

function parseMoney(value: string): number | undefined {
  const t = value.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function parseTaxaInput(value: string): number | undefined {
  const t = value.trim();
  if (!t) return undefined;
  // Converte vírgula para ponto e preserva pontos existentes.
  // Garante que 7,96 ou 7.96 virem exatamente 7.96 (sem multiplicar por 100!)
  const clean = t.replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? n : undefined;
}

function parseToIsoDate(value: unknown): string | undefined {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
      ? Number(value.trim())
      : null;

  if (numericValue !== null && Number.isFinite(numericValue)) {
    const parsed = XLSX.SSF.parse_date_code(numericValue);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  const text = String(value ?? '').trim();
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

/**
 * Normaliza um texto de cabecalho/chave para comparacao sem acento,
 * sem caixa e sem qualquer caractere nao-alfanumerico (espacos, barras,
 * parenteses, etc.). Essencial para que colunas com espaco no nome
 * (ex: "Data Vencimento", "Taxa Compra") sejam acessadas corretamente
 * como chaves do objeto JSON retornado por XLSX.utils.sheet_to_json.
 */
function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').trim().toLowerCase();
}

export default function BancoDadosRendaFixa() {
  const store = useStore();
  const [search, setSearch] = useState('');
  const [classeFilter, setClasseFilter] = useState<'all' | RfClasse>('all');
  const [indexFilter, setIndexFilter] = useState<'all' | AssetIndexer>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<RfForm>(emptyForm);

    const codigoCompletoCalculado = useMemo(() => {
    const taxaNum = parseTaxaInput(form.taxa);
    if (!form.codigo.trim() || !form.emissor.trim() || taxaNum === undefined) return '';
    
    const prefixo = CLASSE_PREFIX[form.classe];
    const codigoLimpo = form.codigo.trim().toUpperCase();
    // Verifica se já possui o prefixo (ex: CDB-CDB005IHZJF) para não duplicar
    const codigoComPrefixo = codigoLimpo.startsWith(prefixo) ? codigoLimpo : `${prefixo}${codigoLimpo}`;

    return buildCodigoCompleto({
      classe: form.classe,
      emissor: form.emissor.trim(),
      codigo: codigoComPrefixo,
      tipoIndexador: form.tipoIndexador,
      taxa: taxaNum,
      vencimento: form.vencimento,
    });
  }, [form.classe, form.emissor, form.codigo, form.tipoIndexador, form.taxa, form.vencimento]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const btgFileInputRef = useRef<HTMLInputElement | null>(null);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // Removido auto-preenchimento - usuario deve preencher Codigo Completo manualmente

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return store.rendasFixasReferencia
      .filter(r => {
        const bySearch = !term
          || r.codigo.toLowerCase().includes(term)
          || (r.codigoCompleto?.toLowerCase() ?? '').includes(term) // <--- Adicionado busca pelo Código Completo
          || r.emissor.toLowerCase().includes(term)
          || CLASSE_LABEL[r.classe as RfClasse]?.toLowerCase().includes(term);
        const byClasse = classeFilter === 'all' || r.classe === classeFilter;
        const byIndex = indexFilter === 'all' || r.tipoIndexador === indexFilter;
        return bySearch && byClasse && byIndex;
      })
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [store.rendasFixasReferencia, search, classeFilter, indexFilter]);

  // --- LÓGICA DE PAGINAÇÃO ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100; // Exibe 100 itens por página

  // Se o usuário pesquisar ou filtrar, volta para a página 1
  useEffect(() => {
    setCurrentPage(1);
  }, [search, classeFilter, indexFilter]);

  const totalPages = Math.ceil(rows.length / itemsPerPage);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return rows.slice(start, start + itemsPerPage);
  }, [rows, currentPage]);
  // ---------------------------

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (row: RendaFixaReferencia) => {
    setEditingId(row.id);
    setForm({
      classe: row.classe as RfClasse,
      codigo: row.codigo,
      codigoCompleto: row.codigoCompleto ?? `${CLASSE_PREFIX[row.classe as RfClasse]}${row.codigo}`,
      isin: row.isin ?? '',
      emissor: row.emissor,
      cnpjEmissor: row.cnpjEmissor ?? '',
      tipoIndexador: row.tipoIndexador,
      taxa: row.taxaContratada !== undefined
        ? String(row.taxaContratada).replace('.', ',')
        : (row.spreadContratado !== undefined ? String(row.spreadContratado).replace('.', ',') : ''),
      vencimento: row.vencimento,
      dataEmissao: row.dataEmissao ?? '',
      pagaCupom: row.pagaCupom,
      periodicidadeCupom: row.periodicidadeCupom ?? '',
      pagaAmortizacao: row.pagaAmortizacao ?? false,
      garantiaFGC: row.garantiaFGC ?? false,
      rating: row.rating ?? '',
      valorMinimoInvestimento: row.valorMinimoInvestimento !== undefined ? String(row.valorMinimoInvestimento).replace('.', ',') : '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const handleAutoFill = () => {
    if (!form.codigoCompleto.trim()) {
      addToast('Digite o Código Completo para buscar.', 'error');
      return;
    }
    const existing = store.rendasFixasReferencia.find(r => 
      r.codigoCompleto?.toLowerCase() === form.codigoCompleto.trim().toLowerCase()
    );
    if (!existing) {
      addToast('Título não encontrado no catálogo.', 'info');
      return;
    }
    setForm({
      classe: existing.classe as RfClasse,
      codigo: existing.codigo,
      codigoCompleto: existing.codigoCompleto ?? form.codigoCompleto,
      isin: existing.isin ?? '',
      emissor: existing.emissor,
      cnpjEmissor: existing.cnpjEmissor ?? '',
      tipoIndexador: existing.tipoIndexador,
      taxa: existing.taxaContratada !== undefined
        ? String(existing.taxaContratada).replace('.', ',')
        : (existing.spreadContratado !== undefined ? String(existing.spreadContratado).replace('.', ',') : ''),
      vencimento: existing.vencimento,
      dataEmissao: existing.dataEmissao ?? '',
      pagaCupom: existing.pagaCupom,
      periodicidadeCupom: existing.periodicidadeCupom ?? '',
      pagaAmortizacao: existing.pagaAmortizacao ?? false,
      garantiaFGC: existing.garantiaFGC ?? false,
      rating: existing.rating ?? '',
      valorMinimoInvestimento: existing.valorMinimoInvestimento !== undefined ? String(existing.valorMinimoInvestimento).replace('.', ',') : '',
    });
    addToast('Dados preenchidos automaticamente com base no Código Completo.', 'info');
  };

  const handleSave = () => {
    const taxaNum = parseTaxaInput(form.taxa);
    if (!form.codigo.trim() || !form.emissor.trim() || !form.vencimento || taxaNum === undefined) {
      addToast('Preencha os campos obrigatorios: Classe, Codigo, Emissor, Indexador, Taxa e Vencimento.', 'error');
      return;
    }

    const spreadIndexadores: AssetIndexer[] = ['cdi_mais_spread', 'ipca_mais_spread', 'igpm_mais_spread', 'selic_mais_spread'];
    const usaSpread = spreadIndexadores.includes(form.tipoIndexador);

    const prefixo = CLASSE_PREFIX[form.classe];
    const codigoLimpo = form.codigo.trim().toUpperCase();
    const codigoComPrefixo = codigoLimpo.startsWith(prefixo) ? codigoLimpo : `${prefixo}${codigoLimpo}`;

    const payload: Partial<Omit<RendaFixaReferencia, 'id' | 'createdAt'>> = {
      classe: form.classe,
      codigo: codigoComPrefixo,
      codigoCompleto: codigoCompletoCalculado.trim().toUpperCase(),
      isin: form.isin.trim().toUpperCase() || undefined,
      emissor: form.emissor.trim(),
      cnpjEmissor: form.cnpjEmissor.trim() ? formatCnpj(form.cnpjEmissor) : undefined,
      tipoIndexador: form.tipoIndexador,
      taxaContratada: !usaSpread ? taxaNum : undefined,
      spreadContratado: usaSpread ? taxaNum : undefined,
      vencimento: form.vencimento,
      dataEmissao: form.dataEmissao || undefined,
      pagaCupom: form.pagaCupom,
      periodicidadeCupom: form.pagaCupom ? (form.periodicidadeCupom || undefined) : undefined,
      pagaAmortizacao: form.pagaAmortizacao,
      garantiaFGC: form.classe === 'cdb' ? form.garantiaFGC : false,
      rating: form.rating.trim() || undefined,
      valorMinimoInvestimento: parseMoney(form.valorMinimoInvestimento),
      atualizadoEm: new Date().toISOString(),
    };

    try {
      if (editingId) {
        store.updateRendaFixaReferencia(editingId, payload);
        addToast('Titulo atualizado.', 'success');
      } else {
        store.addRendaFixaReferencia(payload as Omit<RendaFixaReferencia, 'id' | 'createdAt'>);
        addToast('Titulo cadastrado.', 'success');
      }
      closeModal();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Erro ao salvar titulo.', 'error');
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    store.deleteRendaFixaReferencia(deleteId);
    setDeleteId(null);
    addToast('Titulo removido.', 'info');
  };

  const handleClearAllRendaFixa = () => {
    if (!window.confirm('Tem certeza que deseja excluir TODOS os ativos de Renda Fixa? Essa ação não pode ser desfeita.')) return;
    store.setRendasFixasReferencia([]);
    addToast('Todos os ativos de Renda Fixa foram excluídos.', 'info');
  };

    const handleDownloadTemplate = () => {
    const rows = [
      {
        Classe: 'cdb',
        Codigo: 'CDB001ABC',
        CodigoCompleto: 'CDB-CDB001ABC',
        ISIN: 'BRCDB001ABC0',
        Emissor: 'BANCO ABC BRASIL',
        CNPJEmissor: '17.382.465/0001-22',
        Indexador: 'cdi_percentual',
        TaxaContratada: 110,
        Vencimento: '20/06/2029',
        DataEmissao: '20/06/2024',
        PagaCupom: 'nao',
        PeriodicidadeCupom: '',
        PagaAmortizacao: 'nao',
        GarantiaFGC: 'sim',
        Rating: 'AAA',
        ValorMinimoInvestimento: 1000,
      },
      {
        Classe: 'cra',
        Codigo: 'CRA02300CYT',
        CodigoCompleto: 'CRA-CRA02300CYT',
        ISIN: 'BRCRAOCRA005',
        Emissor: 'BTG COMMODITIES S.A.',
        CNPJEmissor: '00.000.000/0000-00',
        Indexador: 'ipca_mais_spread',
        TaxaContratada: 7.96,
        Vencimento: '15/07/2033',
        DataEmissao: '10/01/2023',
        PagaCupom: 'sim',
        PeriodicidadeCupom: 'semestral',
        PagaAmortizacao: 'sim',
        GarantiaFGC: 'nao',
        Rating: 'AA+',
        ValorMinimoInvestimento: 5000,
      },
      {
        Classe: 'tesouro direto - lft',
        Codigo: 'LFT0000000',
        CodigoCompleto: 'TES-LFT-LFT0000000',
        ISIN: 'BRLFTLFT0000',
        Emissor: 'TESOURO NACIONAL',
        CNPJEmissor: '00.000.000/0001-91',
        Indexador: 'selic',
        TaxaContratada: 100,
        Vencimento: '01/03/2029',
        DataEmissao: '01/03/2024',
        PagaCupom: 'nao',
        PeriodicidadeCupom: '',
        PagaAmortizacao: 'nao',
        GarantiaFGC: 'nao',
        Rating: 'AAA',
        ValorMinimoInvestimento: 100,
      },
    ];

    const instructions = [
      ['Campo', 'Obrigatorio', 'Opcoes Predefinidas / Descricao'],
      ['Classe', 'Sim', 'cdb, cdca, compromissada, coe, cpr, cra, cri, debenture, lcd, lca, lci, lf, lfsn, lfsc, lft, lig, ltf, ltn, ntn-b, ntn-b-p, ntn-b1, ntn-f, tesouro direto - lft, tesouro direto - ltn, tesouro direto - ntn-b, tesouro direto - ntn-b1, tesouro direto - ntn-b-p, tesouro direto - ntn-f'],
      ['Codigo', 'Sim', 'Codigo do ativo (ex: CRA02300CYT). Sem espacos.'],
      ['CodigoCompleto', 'Sim', 'Codigo completo unico (ex: CRA-CRA02300CYT). OBRIGATORIO para identificacao exclusiva.'],
      ['ISIN', 'Nao', 'Codigo ISIN do titulo (ex: BRCRAOCRA005).'],
      ['Emissor', 'Sim', 'Nome do emissor do titulo (ex: BTG COMMODITIES).'],
      ['CNPJEmissor', 'Nao', 'CNPJ do emissor do titulo.'],
      ['Indexador', 'Sim', 'cdi_mais_spread, cdi_percentual, igpm_mais_spread, ipca_mais_spread, prefixado, ptxv, selic, tr'],
      ['TaxaContratada', 'Sim', 'Taxa ou spread contratado na emissao do titulo (ex: 110 para 110% CDI, ou 7,96 para IPCA+7,96%).'],
      ['Vencimento', 'Sim', 'Data de vencimento em DD/MM/AAAA.'],
      ['DataEmissao', 'Nao', 'Data de emissao em DD/MM/AAAA.'],
      ['PagaCupom', 'Nao', 'sim ou nao. Padrao: nao.'],
      ['PeriodicidadeCupom', 'Nao', 'mensal, trimestral, semestral, anual (obrigatorio se PagaCupom for sim).'],
      ['PagaAmortizacao', 'Nao', 'sim ou nao. Padrao: nao.'],
      ['GarantiaFGC', 'Nao', 'sim ou nao. Apenas aplicavel para cdb. Padrao: nao.'],
      ['Rating', 'Nao', 'AAA, AA+, AA, A, BBB etc.'],
      ['ValorMinimoInvestimento', 'Nao', 'Valor minimo em R$.'],
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_importacao_renda_fixa.xlsx');
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('invalid_sheet');
      const rowsJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

            let skipped = 0;
      const itemsToUpsert: Omit<RendaFixaReferencia, 'id' | 'createdAt'>[] = [];
      
      const allPossibleClasses = ['cdb', 'cdca', 'compromissada', 'coe', 'cpr', 'cra', 'cri', 'debenture', 'lcd', 'lca', 'lci', 'lf', 'lfsn', 'lfsc', 'lft', 'lig', 'ltf', 'ltn', 'ntnb', 'ntnbp', 'ntnb1', 'ntnf', 'tesouro direto - lft', 'tesouro direto - ltn', 'tesouro direto - ntnb', 'tesouro direto - ntnb1', 'tesouro direto - ntnbp', 'tesouro direto - ntnf'];

      for (const row of rowsJson) {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;

        const classeRaw = normalizeKey(String(normalized.classe ?? ''));
        const classe = allPossibleClasses.find(c => c.replace(/[^a-z0-9]/g, '') === classeRaw.replace(/[^a-z0-9]/g, '')) as RfClasse | undefined;
        const codigo = String(normalized.codigo ?? '').trim().toUpperCase();
        const codigoCompleto = String(normalized.codigocompleto ?? '').trim();
        const emissor = String(normalized.emissor ?? '').trim();
        const vencimento = parseToIsoDate(normalized.vencimento);

        // Codigo Completo e obrigatorio - pular linha se estiver vazio
        if (!classe || !codigo || !codigoCompleto || !emissor || !vencimento) {
          skipped += 1;
          continue;
        }

        const indexadorRaw = normalizeKey(String(normalized.indexador ?? ''));
        const indexadorMap: Record<string, AssetIndexer> = {
          cdi_mais_spread: 'cdi_mais_spread',
          cdi_percentual: 'cdi_percentual',
          igpm_mais_spread: 'igpm_mais_spread',
          igpm_percentual: 'igpm_percentual',
          ipca_mais_spread: 'ipca_mais_spread',
          prefixado: 'prefixado',
          ptxv: 'ptxv',
          selic_mais_spread: 'selic_mais_spread',
          selic_percentual: 'selic_percentual',
          selic: 'selic_percentual',
          tr: 'tr',
        };
        const tipoIndexador = indexadorMap[indexadorRaw] ?? 'cdi_percentual';

        const isin = String(normalized.isin ?? '').trim().toUpperCase() || undefined;
        const cnpjEmissor = String(normalized.cnpjemissor ?? '').trim() ? formatCnpj(String(normalized.cnpjemissor)) : undefined;
        const dataEmissao = parseToIsoDate(normalized.dataemissao);
        const rating = String(normalized.rating ?? '').trim().toUpperCase() || undefined;
        const minInvest = parseSheetNumber(normalized.valorminimoinvestimento ?? normalized.valorminimo ?? '');
        
        // Extrai a taxa contratada da planilha
        const taxaRaw = parseSheetNumber(normalized.taxacontratada ?? normalized.taxa ?? '');
        const taxaContratadaVal = Number.isFinite(taxaRaw) ? taxaRaw : 0;

        const spreadIndexadores: AssetIndexer[] = ['cdi_mais_spread', 'ipca_mais_spread', 'igpm_mais_spread', 'selic_mais_spread'];
        const usaSpread = spreadIndexadores.includes(tipoIndexador);

        const cupomRaw = normalizeKey(String(normalized.pagacupom ?? 'nao'));
        const pagaCupom = ['sim', 'yes', 'true', '1'].includes(cupomRaw);

        const periodicidadeRaw = normalizeKey(String(normalized.periodicidadecupom ?? ''));
        const periodicidades = ['mensal', 'trimestral', 'semestral', 'anual'] as const;
        const periodicidadeCupom = periodicidades.find(p => p === periodicidadeRaw) || undefined;

        const amortRaw = normalizeKey(String(normalized.pagaamortizacao ?? 'nao'));
        const pagaAmortizacao = ['sim', 'yes', 'true', '1'].includes(amortRaw);

        const fgcRaw = normalizeKey(String(normalized.garantiafgc ?? 'nao'));
        const garantiaFGC = classe === 'cdb' && ['sim', 'yes', 'true', '1'].includes(fgcRaw);

        itemsToUpsert.push({
          classe,
          codigo,
          codigoCompleto,
          isin,
          emissor,
          cnpjEmissor,
          tipoIndexador,
          taxaContratada: !usaSpread ? taxaContratadaVal : undefined,
          spreadContratado: usaSpread ? taxaContratadaVal : undefined,
          vencimento,
          dataEmissao,
          pagaCupom,
          periodicidadeCupom,
          pagaAmortizacao,
          garantiaFGC,
          rating,
          valorMinimoInvestimento: Number.isFinite(minInvest) ? minInvest : undefined,
          atualizadoEm: new Date().toISOString(),
        });
      }

      if (itemsToUpsert.length > 0) {
        store.bulkUpsertRendaFixaReferencia(itemsToUpsert);
      }

      setImportMessage(`Importacao concluida: ${itemsToUpsert.length} registro(s) processado(s), ${skipped} ignorado(s).`);
      addToast(`Importacao de Renda Fixa concluida. Total: ${itemsToUpsert.length}`, 'success');
    } catch (error) {
      console.error('Erro ao importar renda fixa:', error);
      addToast('Erro ao importar renda fixa.', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Interpreta a coluna "Indexador" + "Taxa Compra" da planilha gerencial
   * de Renda Fixa do Btg (Relatorios > Paineis > Renda Fixa), retornando
   * o AssetIndexer e a taxa/spread correspondente.
   *
   * Regra validada empiricamente contra a planilha real do Btg (27 mil+
   * linhas, cobertura de 100%):
   *  - "PRE" / "100% PRE"           -> prefixado
   *  - "TR" / "100% TR"             -> tr
   *  - "PTXV" / "100% PTXV"         -> ptxv
   *  - "X% IPCA" / "IPCA" (X<40)    -> ipca_mais_spread, taxa = Taxa Compra
   *  - "X% IGP-M" / "IGP-M" (X<40)  -> igpm_mais_spread, taxa = Taxa Compra
   *    (IPCA e IGP-M no Btg SEMPRE representam indexador+spread, mesmo
   *    quando aparecem como "100% IPCA" — o "100%" ai e so um padrao de
   *    exibicao do extrato, nao um percentual real. Excecao: taxa >= 40
   *    e tratada como percentual explicito, para cobrir ruido raro de
   *    consulta como o caso real do titulo DEB-CVRDA6.)
   *  - "X% CDI", X != 100           -> cdi_percentual, taxa = X (do texto)
   *  - "100% CDI" / "CDI", TaxaCompra = 0     -> cdi_percentual, taxa = 100
   *  - "100% CDI" / "CDI", TaxaCompra != 0    -> cdi_mais_spread, taxa = Taxa Compra
   *  - mesma logica para SELIC
   */
  function parseBtgIndexador(indexadorTexto: string, taxaCompra: number): { tipoIndexador: AssetIndexer; taxa: number } | null {
    const texto = indexadorTexto.trim();
    const taxa = Number.isFinite(taxaCompra) ? taxaCompra : 0;

    if (texto === 'PRE' || texto === '100% PRE') return { tipoIndexador: 'prefixado', taxa };
    if (texto === 'TR' || texto === '100% TR') return { tipoIndexador: 'tr', taxa };
    if (texto === 'PTXV' || texto === '100% PTXV') return { tipoIndexador: 'ptxv', taxa };

    const match = texto.match(/^([\d.]+)%\s*(CDI|SELIC|IPCA|IGP-M)$/i) ?? texto.match(/^(CDI|SELIC|IPCA|IGP-M)$/i);
    if (!match) return null;

    let percentual: number;
    let indexador: string;
    if (match.length === 3) {
      percentual = Number(match[1]);
      indexador = match[2].toUpperCase();
    } else {
      percentual = 100;
      indexador = match[1].toUpperCase();
    }

    if (indexador === 'IPCA' || indexador === 'IGP-M') {
      const base = indexador === 'IPCA' ? 'ipca' : 'igpm';
      // Limiar de 40: cobre o caso raro de percentual explicito alto
      // (ex: DEB-CVRDA6, que aparece com taxa 100 em algumas linhas),
      // sem afetar nenhum spread real da base (todos < 40 na pratica).
      if (percentual !== 100 || taxa >= 40) {
        return { tipoIndexador: `${base}_percentual` as AssetIndexer, taxa: percentual !== 100 ? percentual : taxa };
      }
      return { tipoIndexador: `${base}_mais_spread` as AssetIndexer, taxa };
    }

    if (indexador === 'CDI' || indexador === 'SELIC') {
      const base = indexador === 'CDI' ? 'cdi' : 'selic';
      if (percentual === 100 && taxa !== 0 && taxa < 40) {
        return { tipoIndexador: `${base}_mais_spread` as AssetIndexer, taxa };
      }
      return { tipoIndexador: `${base}_percentual` as AssetIndexer, taxa: percentual !== 100 ? percentual : (taxa >= 40 ? taxa : 100) };
    }

    return null;
  }
/**
   * Importa a planilha gerencial de Renda Fixa do Btg (Relatorios >
   * Paineis > Renda Fixa), tratando os dados brutos do extrato (que vem
   * em uma unica aba, sem as colunas calculadas) para o formato do
   * catalogo do sistema — equivalente as formulas que o usuario usava
   * manualmente em planilha auxiliar antes desta funcionalidade existir.
   *
   * Cada linha do extrato e uma posicao de cliente, nao um titulo unico
   * — varios clientes podem ter o mesmo titulo. Por isso, agrupamos por
   * Codigo Completo calculado antes de fazer o upsert, para nao
   * processar o mesmo titulo centenas de vezes.
   */
    const handleImportBtgFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('invalid_sheet');
      const rowsJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const allPossibleClasses = ['cdb', 'cdca', 'compromissada', 'coe', 'cpr', 'cra', 'cri', 'debenture', 'lcd', 'lca', 'lci', 'lf', 'lfsn', 'lfsc', 'lft', 'lig', 'ltf', 'ltn', 'ntnb', 'ntnbp', 'ntnb1', 'ntnf', 'tesouro direto - lft', 'tesouro direto - ltn', 'tesouro direto - ntnb', 'tesouro direto - ntnb1', 'tesouro direto - ntnbp', 'tesouro direto - ntnf'];

      // Agrupa por Codigo Completo: o extrato tem 1 linha por posicao de
      // cliente, mas queremos 1 registro por titulo no catalogo.
      const porCodigoCompleto = new Map<string, Omit<RendaFixaReferencia, 'id' | 'createdAt'>>();
      let skipped = 0;

      for (const row of rowsJson) {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;

        const produtoRaw = normalizeKey(String(normalized.produto ?? ''));
        const classe = allPossibleClasses.find(c => c.replace(/[^a-z0-9]/g, '') === produtoRaw) as RfClasse | undefined;
        const ativo = String(normalized.ativo ?? '').trim().toUpperCase();
        const emissor = String(normalized.emissor ?? '').trim();
        const vencimento = parseToIsoDate(normalized.datavencimento);
        const indexadorTexto = String(normalized.indexador ?? '').trim();
        const taxaCompra = parseSheetNumber(normalized.taxacompra);

        if (!classe || !ativo || !emissor || !vencimento || !indexadorTexto) {
          skipped += 1;
          continue;
        }

                // Codigo: Mantém exatamente o valor original da planilha do Btg 
        // (ex: "CDB-CDB005IHZJF"), sem remover o prefixo.
        const codigo = ativo;

        const indexadorInfo = parseBtgIndexador(indexadorTexto, Number.isFinite(taxaCompra) ? taxaCompra : 0);
        if (!indexadorInfo) {
          skipped += 1;
          continue;
        }

        const codigoCompleto = buildCodigoCompleto({
          classe,
          emissor,
          codigo: ativo,
          tipoIndexador: indexadorInfo.tipoIndexador,
          taxa: indexadorInfo.taxa,
          vencimento,
        });
        if (!codigoCompleto) {
          skipped += 1;
          continue;
        }

        const spreadIndexadores: AssetIndexer[] = ['cdi_mais_spread', 'ipca_mais_spread', 'igpm_mais_spread', 'selic_mais_spread'];
        const usaSpread = spreadIndexadores.includes(indexadorInfo.tipoIndexador);

        // Upsert local: se o mesmo titulo aparecer em multiplas linhas
        // (posicoes de clientes diferentes), a ultima processada "ganha"
        // — na pratica os dados do titulo sao identicos entre elas.
        porCodigoCompleto.set(codigoCompleto, {
          classe,
          codigo,
          codigoCompleto,
          isin: undefined,
          emissor,
          cnpjEmissor: undefined,
          tipoIndexador: indexadorInfo.tipoIndexador,
          taxaContratada: !usaSpread ? indexadorInfo.taxa : undefined,
          spreadContratado: usaSpread ? indexadorInfo.taxa : undefined,
          vencimento,
          dataEmissao: undefined,
          pagaCupom: false,
          periodicidadeCupom: undefined,
          pagaAmortizacao: false,
          garantiaFGC: false,
          rating: undefined,
          valorMinimoInvestimento: undefined,
          atualizadoEm: new Date().toISOString(),
        });
      }

      const itemsToUpsert = Array.from(porCodigoCompleto.values());
      if (itemsToUpsert.length > 0) {
        store.bulkUpsertRendaFixaReferencia(itemsToUpsert);
      }

      setImportMessage(`Importacao Btg concluida: ${itemsToUpsert.length} titulo(s) unico(s) processado(s) (de ${rowsJson.length} posicoes lidas), ${skipped} linha(s) ignorada(s).`);
      addToast(`Catalogo atualizado a partir da planilha do Btg: ${itemsToUpsert.length} titulo(s).`, 'success');
    } catch (error) {
      console.error('Erro ao importar planilha do Btg:', error);
      addToast('Erro ao importar planilha do Btg.', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const handleImportBtgClick = () => {
    btgFileInputRef.current?.click();
  };

  const parseSheetNumber = (value: unknown): number => {
    if (typeof value === 'number') return value;
    const text = String(value ?? '').trim();
    if (!text) return Number.NaN;
    const cleaned = text.replace(/\s+/g, '').replace(/r\$/gi, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    if (cleaned.includes(',')) return Number(cleaned.replace(',', '.'));
    return Number(cleaned);
  };

  const handleRecalcular = () => {
    setRecalcLoading(true);
    try {
      const rfIds = new Set(store.rendasFixasReferencia.map(r => r.id));
      const holidays = store.anbimaHolidays.map(h => h.data);
      let recalculated = 0;

      for (const asset of store.assets) {
        if (!asset.referenciaRFId || !rfIds.has(asset.referenciaRFId)) continue;
        const value = calcularValorAtualAsset(asset, store.cdiRates, [], holidays);
        if (value === null) continue;

        const quantidade = asset.quantidade ?? 0;
        store.updateAsset(asset.id, {
          valorPosicao: value,
          valorCalculadoRF: value,
          dataUltimoCalculoRF: new Date().toISOString(),
          origemAtualizacao: 'api',
          ...(quantidade > 0 ? { precoUnitario: value / quantidade } : {}),
        });
        recalculated += 1;
      }

      addToast(`Recalculo concluido: ${recalculated} ativo(s) atualizado(s).`, 'success');
    } catch (error) {
      console.error(error);
      addToast('Erro ao recalcular posicoes.', 'error');
    } finally {
      setRecalcLoading(false);
    }
  };

  const total = store.rendasFixasReferencia.length;
  const cdbCount = store.rendasFixasReferencia.filter(r => r.classe === 'cdb').length;
  const criCount = store.rendasFixasReferencia.filter(r => r.classe === 'cri').length;
  const craCount = store.rendasFixasReferencia.filter(r => r.classe === 'cra').length;
  const debCount = store.rendasFixasReferencia.filter(r => r.classe === 'debenture').length;
  const coeCount = store.rendasFixasReferencia.filter(r => r.classe === 'coe').length;

  return (
    <div className="space-y-4">
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
              toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
            }`}
          >
            {toast.type === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
            {toast.message}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Buscar por codigo, emissor, classe..."
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus size={16} /> Adicionar Renda Fixa
            </button>
            <button
              onClick={handleRecalcular}
              disabled={recalcLoading}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white ${
                recalcLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <Calculator size={16} /> Recalcular Posicoes
            </button>
            <button
              onClick={handleClearAllRendaFixa}
              className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50"
            >
              <Trash2 size={16} /> Excluir ativos
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleDownloadTemplate} className="px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm hover:bg-blue-50 flex items-center gap-1"><Download size={14} /> Modelo</button>
            <button onClick={handleImportClick} className="px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50 flex items-center gap-1"><Upload size={14} /> Importar</button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
            <button
              onClick={handleImportBtgClick}
              title="Importar planilha do Btg: Relatorios > Paineis > Renda Fixa"
              className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm hover:bg-amber-50 flex items-center gap-1"
            >
              <Upload size={14} /> Importar Btg
            </button>
            <input ref={btgFileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportBtgFile} />
          </div>
          {importMessage && <p className="text-xs text-indigo-700">{importMessage}</p>}
        </div>

                <div className="flex flex-wrap items-center gap-1.5">
          {([
            'all',
            'cdb',
            'cdca',
            'compromissada',
            'coe',
            'cpr',
            'cra',
            'cri',
            'debenture',
            'lcd',
            'lca',
            'lci',
            'lf',
            'lfsn',
            'lfsc',
            'lft',
            'lig',
            'ltf',
            'ltn',
            'ntnb',
            'ntnbp',
            'ntnb1',
            'ntnf',
            'tesouro direto - lft',
            'tesouro direto - ltn',
            'tesouro direto - ntnb',
            'tesouro direto - ntnb1',
            'tesouro direto - ntnbp',
            'tesouro direto - ntnf',
          ] as const).map(c => (
            <button
              key={c}
              onClick={() => setClasseFilter(c)}
              className={`px-2 py-1 rounded border text-[11px] font-medium transition-colors ${
                classeFilter === c ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {c === 'all' ? 'Todos' : CLASSE_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
{([
            'all',
            'cdi_mais_spread',
            'cdi_percentual',
            'igpm_mais_spread',
            'igpm_percentual',
            'ipca_mais_spread',
            'prefixado',
            'ptxv',
            'selic_mais_spread',
            'selic_percentual',
            'tr',
          ] as const).map(i => (
            <button
              key={i}
              onClick={() => setIndexFilter(i)}
              className={`px-2.5 py-1.5 rounded border text-xs font-medium ${
                indexFilter === i ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-300 text-gray-600'
              }`}
            >
              {i === 'all' ? 'Todos' : INDEXADOR_LABEL[i]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full min-w-[980px] border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Classe</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Codigo Completo</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Emissor</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Codigo</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Indexador</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Vencimento</th>
                <th className="text-center px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">Nenhum titulo de renda fixa cadastrado.</td>
                </tr>
              )}
              {paginatedRows.map(row => {
                const tone = getVencimentoTone(row.vencimento);
                return (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.classe === 'cdb' ? 'bg-blue-100 text-blue-700'
                          : row.classe === 'cri' ? 'bg-emerald-100 text-emerald-700'
                            : row.classe === 'cra' ? 'bg-orange-100 text-orange-700'
                              : row.classe === 'debenture' ? 'bg-violet-100 text-violet-700'
                                : 'bg-gray-200 text-gray-700'
                      }`}
                      >
                        {CLASSE_LABEL[row.classe as RfClasse]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-800 font-medium">{row.codigoCompleto || '—'}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{row.emissor}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 font-mono">{row.codigo}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {INDEXADOR_LABEL[row.tipoIndexador]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        tone === 'red' ? 'bg-red-100 text-red-700' : tone === 'yellow' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {formatBrDate(row.vencimento)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(row)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteId(row.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap text-xs text-gray-600">
          <div>
            Total: {total} titulos | CDB: {cdbCount} | CRI: {criCount} | CRA: {craCount} | Debenture: {debCount} | COE: {coeCount}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Página {currentPage} de {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <Modal title={editingId ? 'Editar Renda Fixa' : 'Adicionar Renda Fixa'} onClose={closeModal} size="lg">
          <div className="space-y-5">
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-gray-700">Identificacao</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Classe *</label>
                  <select
                    value={form.classe}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      const next = e.target.value as RfClasse;
                      setForm(prev => ({ ...prev, classe: next, garantiaFGC: next === 'cdb' ? prev.garantiaFGC : false }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                                        <option value="cdb">CDB</option>
                    <option value="cdca">CDCA</option>
                    <option value="compromissada">Compromissada</option>
                    <option value="coe">COE</option>
                    <option value="cpr">CPR</option>
                    <option value="cra">CRA</option>
                    <option value="cri">CRI</option>
                    <option value="debenture">Debenture</option>
                    <option value="lcd">LCD</option>
                    <option value="lca">LCA</option>
                    <option value="lci">LCI</option>
                    <option value="lf">LF</option>
                    <option value="lfsn">LFSN</option>
                    <option value="lfsc">LFSC</option>
                    <option value="lft">LFT</option>
                    <option value="lig">LIG</option>
                    <option value="ltf">LTF</option>
                    <option value="ltn">LTN</option>
                    <option value="ntnb">NTN-B</option>
                    <option value="ntnbp">NTN-B-P</option>
                    <option value="ntnb1">NTN-B1</option>
                    <option value="ntnf">NTN-F</option>
                    <option value="tesouro direto - lft">Tesouro Direto - LFT</option>
                    <option value="tesouro direto - ltn">Tesouro Direto - LTN</option>
                    <option value="tesouro direto - ntnb">Tesouro Direto - NTN-B</option>
                    <option value="tesouro direto - ntnb1">Tesouro Direto - NTN-B1</option>
                    <option value="tesouro direto - ntnbp">Tesouro Direto - NTN-B-P</option>
                    <option value="tesouro direto - ntnf">Tesouro Direto - NTN-F</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Codigo *</label>
                  <input
                    value={form.codigo}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, codigo: e.target.value.toUpperCase().replace(/\s+/g, '') }))}
                    placeholder="CRA02300CYT"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Codigo Completo (calculado)</label>
                  <input
                    value={codigoCompletoCalculado || 'Preencha Codigo, Emissor, Indexador, Taxa e Vencimento'}
                    disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ISIN</label>
                  <input
                    value={form.isin}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, isin: e.target.value.toUpperCase() }))}
                    placeholder="BRCRAOCRA005"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Emissor *</label>
                  <input
                    value={form.emissor}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, emissor: e.target.value }))}
                    placeholder="BTG COMMODITIES S.A."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">CNPJ do Emissor</label>
                  <input
                    value={form.cnpjEmissor}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, cnpjEmissor: formatCnpj(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-bold text-gray-700">Caracteristicas do Titulo</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Indexador *</label>
                  <select
                    value={form.tipoIndexador}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(prev => ({ ...prev, tipoIndexador: e.target.value as AssetIndexer }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="cdi_mais_spread">CDI + Spread (ex: CDI + 2%)</option>
                    <option value="cdi_percentual">% do CDI (ex: 120%)</option>
                    <option value="igpm_mais_spread">IGP-M + Spread (ex: IGP-M + 4%)</option>
                    <option value="igpm_percentual">% do IGP-M (ex: 100%)</option>
                    <option value="ipca_mais_spread">IPCA + Spread (ex: IPCA + 5%)</option>
                    <option value="prefixado">Prefixado (% a.a.)</option>
                    <option value="ptxv">PTXV (Prefixado com Taxa Variável)</option>
                    <option value="selic_mais_spread">Selic + Spread (ex: Selic + 1%)</option>
                    <option value="selic_percentual">% da Selic (ex: 100%)</option>
                    <option value="tr">TR (Taxa Referencial)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {form.tipoIndexador.endsWith('_mais_spread')
                      ? 'Spread contratado (% a.a.) *'
                      : form.tipoIndexador === 'prefixado'
                        ? 'Taxa contratada (% a.a.) *'
                        : 'Percentual contratado (%) *'}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.taxa}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, taxa: e.target.value }))}
                    placeholder="Ex: 2 ou 102"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-blue-700 flex items-center gap-1"><Info size={12} /> Indexador e taxa sao caracteristicas do titulo na emissao — o mesmo para qualquer cliente que o adquirir. A isencao de IR continua sendo definida no cadastro do ativo na carteira.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data de Vencimento *</label>
                  <input type="date" value={form.vencimento} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, vencimento: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data de Emissao</label>
                  <input type="date" value={form.dataEmissao} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, dataEmissao: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-bold text-gray-700">Pagamentos</h4>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.pagaCupom} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, pagaCupom: e.target.checked }))} className="rounded border-gray-300 text-indigo-600" />
                Paga cupom
              </label>
              {form.pagaCupom && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Periodicidade</label>
                  <select value={form.periodicidadeCupom} onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(prev => ({ ...prev, periodicidadeCupom: e.target.value as RfForm['periodicidadeCupom'] }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">Selecione...</option>
                    <option value="mensal">Mensal</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.pagaAmortizacao} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, pagaAmortizacao: e.target.checked }))} className="rounded border-gray-300 text-indigo-600" />
                Paga amortizacao antes do vencimento
              </label>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-bold text-gray-700">Garantias</h4>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.garantiaFGC}
                  disabled={form.classe !== 'cdb'}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, garantiaFGC: e.target.checked }))}
                  className="rounded border-gray-300 text-indigo-600"
                  title={form.classe !== 'cdb' ? 'Apenas CDB possui garantia do FGC' : ''}
                />
                Garantia FGC
              </label>
              {form.classe !== 'cdb' && <p className="text-xs text-gray-500">Apenas CDB possui garantia do FGC.</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rating</label>
                  <input value={form.rating} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, rating: e.target.value.toUpperCase() }))} placeholder="AAA" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valor Minimo de Investimento (R$)</label>
                  <input value={form.valorMinimoInvestimento} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, valorMinimoInvestimento: e.target.value }))} placeholder="1000,00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </section>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-1"><Save size={16} /> Salvar</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Confirmar exclusao" onClose={() => setDeleteId(null)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-700">Deseja excluir este titulo de renda fixa?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 flex items-center gap-1"><Trash2 size={16} /> Excluir</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
