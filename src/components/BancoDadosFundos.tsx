import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Search, Plus, RefreshCw, DollarSign, Edit2, Trash2, Check, AlertTriangle, Loader2, Save, Building2, Upload, Download, Settings } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from '../store/useStore';
import { getAnbimaToken, searchFundoByCnpj, fetchCotaFundo, fetchFundoDetailsByCnpj } from '../services/fundos';
import Modal from './Modal';
import type { FundoReferencia } from '../types';

const CLASSES_ANBIMA = ['Renda Fixa', 'Ações', 'Multimercado', 'Cambial', 'Previdência', 'FII', 'ETF', 'Outro'];
const LAST_UPDATE_KEY = 'ultimaAtualizacaoFundos';
const CONFIG_KEY = 'gestorConfig';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface FundoForm {
  cnpj: string;
  nomeCompleto: string;
  nomeAbreviado: string;
  gestora: string;
  administradora: string;
  classeAnbima: string;
  liquidezDPlus: string;
  cotaAtual: string;
  dataCota: string;
  ativo: boolean;
}

interface AnbimaCredentials {
  clientId: string;
  clientSecret: string;
}

function formatCnpj(cnpj: string): string {
  const n = cnpj.replace(/\D/g, '').slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

function unformatCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

function formatCurrency6(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('pt-BR');
}

function isRecentCota(dataCota?: string): boolean {
  if (!dataCota) return false;
  const cotaDate = new Date(`${dataCota}T00:00:00`);
  const now = new Date();
  const diffTime = now.getTime() - cotaDate.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays <= 3;
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

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

const emptyForm: FundoForm = {
  cnpj: '',
  nomeCompleto: '',
  nomeAbreviado: '',
  gestora: '',
  administradora: '',
  classeAnbima: '',
  liquidezDPlus: '',
  cotaAtual: '',
  dataCota: '',
  ativo: true,
};

export default function BancoDadosFundos() {
  const store = useStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FundoForm>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [updatingCotas, setUpdatingCotas] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [anbimaCredentials, setAnbimaCredentials] = useState<AnbimaCredentials>({ clientId: '', clientSecret: '' });
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_UPDATE_KEY);
      if (raw) setLastUpdate(raw);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { anbimaClientId?: string; anbimaClientSecret?: string };
        setAnbimaCredentials({
          clientId: parsed.anbimaClientId ?? '',
          clientSecret: parsed.anbimaClientSecret ?? '',
        });
      }
    } catch {}
  }, []);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const fundos = store.fundosReferencia;

  const filteredFundos = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return fundos;
    return fundos.filter(f =>
      f.nomeCompleto.toLowerCase().includes(term) ||
      f.cnpj.toLowerCase().includes(term) ||
      (f.gestora?.toLowerCase() ?? '').includes(term)
    );
  }, [fundos, search]);

  // --- LÓGICA DE PAGINAÇÃO ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.ceil(filteredFundos.length / itemsPerPage);
  const paginatedFundos = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFundos.slice(start, start + itemsPerPage);
  }, [filteredFundos, currentPage]);
  // ---------------------------

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (fundo: FundoReferencia) => {
    setForm({
      cnpj: formatCnpj(fundo.cnpj),
      nomeCompleto: fundo.nomeCompleto,
      nomeAbreviado: fundo.nomeAbreviado ?? '',
      gestora: fundo.gestora ?? '',
      administradora: fundo.administradora ?? '',
      classeAnbima: fundo.classeAnbima ?? '',
      liquidezDPlus: fundo.liquidezDPlus ?? '',
      cotaAtual: fundo.cotaAtual !== undefined ? String(fundo.cotaAtual) : '',
      dataCota: fundo.dataCota ?? '',
      ativo: fundo.ativo,
    });
    setEditingId(fundo.id);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleInputChange = (field: keyof FundoForm, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCnpjChange = (value: string) => {
    const formatted = formatCnpj(value);
    setForm(prev => ({ ...prev, cnpj: formatted }));
  };

  const getAnbimaConfig = (): { clientId: string; clientSecret: string } | null => {
    const configRaw = localStorage.getItem(CONFIG_KEY);
    const config = configRaw ? (JSON.parse(configRaw) as { anbimaClientId?: string; anbimaClientSecret?: string }) : {};
    if (!config.anbimaClientId || !config.anbimaClientSecret) return null;
    return { clientId: config.anbimaClientId, clientSecret: config.anbimaClientSecret };
  };

  const handleBuscarAnbima = async () => {
    const cnpjLimpo = unformatCnpj(form.cnpj);
    if (cnpjLimpo.length !== 14) {
      addToast('CNPJ inválido. Digite 14 números.', 'error');
      return;
    }

    try {
      const config = getAnbimaConfig();
      if (!config) {
        setShowCredentialsModal(true);
        return;
      }

      const token = await getAnbimaToken(config.clientId, config.clientSecret);
      const details = await fetchFundoDetailsByCnpj(cnpjLimpo, token);
      if (!details) {
        addToast('Fundo não encontrado na ANBIMA.', 'error');
        return;
      }

      setForm(prev => ({
        ...prev,
        nomeCompleto: details.nome ?? prev.nomeCompleto,
        nomeAbreviado: details.nomeAbreviado ?? prev.nomeAbreviado,
        gestora: details.gestor ?? prev.gestora,
        administradora: details.administrador ?? prev.administradora,
        classeAnbima: details.classe ?? prev.classeAnbima,
      }));
      addToast('Dados do fundo carregados da ANBIMA.', 'success');
    } catch (error) {
      console.error('Erro ao buscar fundo na ANBIMA:', error);
      addToast('Erro ao buscar dados na ANBIMA.', 'error');
    }
  };

  const handleSave = () => {
    const cnpjLimpo = unformatCnpj(form.cnpj);
    if (cnpjLimpo.length !== 14) {
      addToast('CNPJ inválido.', 'error');
      return;
    }
    if (!form.nomeCompleto.trim()) {
      addToast('Nome completo é obrigatório.', 'error');
      return;
    }

    const cotaAtual = form.cotaAtual.trim() === '' ? undefined : Number(form.cotaAtual.replace(',', '.'));
    const dataCota = form.dataCota.trim() === '' ? undefined : form.dataCota;

    const payload: Partial<Omit<FundoReferencia, 'id' | 'createdAt'>> = {
      cnpj: formatCnpj(cnpjLimpo),
      nomeCompleto: form.nomeCompleto,
      nomeAbreviado: form.nomeAbreviado || undefined,
      gestora: form.gestora || undefined,
      administradora: form.administradora || undefined,
      classeAnbima: form.classeAnbima || undefined,
      liquidezDPlus: form.liquidezDPlus.trim() ? form.liquidezDPlus.trim().toUpperCase() : undefined,
      cotaAtual: Number.isFinite(cotaAtual) ? cotaAtual : undefined,
      dataCota,
      ativo: form.ativo,
    };

    try {
      if (editingId) {
        store.updateFundoReferencia(editingId, payload);
        addToast('Fundo atualizado com sucesso.', 'success');
      } else {
        store.addFundoReferencia(payload as Omit<FundoReferencia, 'id' | 'createdAt'>);
        addToast('Fundo cadastrado com sucesso.', 'success');
      }
      closeModal();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Erro ao salvar fundo.', 'error');
    }
  };

  const handleDelete = (id: string) => {
    store.deleteFundoReferencia(id);
    setDeleteConfirmId(null);
    addToast('Fundo removido.', 'info');
  };

  const handleClearAllFundos = () => {
    if (!window.confirm('Tem certeza que deseja apagar TODOS os fundos cadastrados? Essa ação não pode ser desfeita.')) return;
    store.setFundosReferencia([]);
    addToast('Todos os fundos foram removidos.', 'info');
  };

  const handleToggleAtivo = (fundo: FundoReferencia) => {
    store.updateFundoReferencia(fundo.id, { ativo: !fundo.ativo });
  };

  const handleOpenCredentials = () => {
    setShowCredentialsModal(true);
  };

  const handleSaveCredentials = () => {
    if (!anbimaCredentials.clientId.trim() || !anbimaCredentials.clientSecret.trim()) {
      addToast('Preencha Client ID e Client Secret.', 'error');
      return;
    }
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      localStorage.setItem(CONFIG_KEY, JSON.stringify({
        ...parsed,
        anbimaClientId: anbimaCredentials.clientId.trim(),
        anbimaClientSecret: anbimaCredentials.clientSecret.trim(),
      }));
      setShowCredentialsModal(false);
      addToast('Credenciais ANBIMA salvas.', 'success');
    } catch {
      addToast('Erro ao salvar credenciais.', 'error');
    }
  };

  const handleAtualizarCotas = async () => {
    const config = getAnbimaConfig();
    if (!config) {
      setShowCredentialsModal(true);
      return;
    }

    const ativos = fundos.filter(f => f.ativo);
    if (ativos.length === 0) {
      addToast('Nenhum fundo ativo para atualizar.', 'info');
      return;
    }

    setUpdatingCotas(true);
    setUpdateProgress(`Atualizando 0/${ativos.length}...`);

    try {
      const token = await getAnbimaToken(config.clientId, config.clientSecret);
      let updated = 0;

      for (let i = 0; i < ativos.length; i++) {
        const fundo = ativos[i];
        setUpdateProgress(`Atualizando ${i + 1}/${ativos.length}...`);
        try {
          const codigo = fundo.codigoAnbima ?? await searchFundoByCnpj(fundo.cnpj, token);
          if (!codigo) {
            console.warn(`Código ANBIMA não encontrado para ${fundo.nomeCompleto}`);
            continue;
          }

          if (!fundo.codigoAnbima) {
            store.updateFundoReferencia(fundo.id, { codigoAnbima: codigo });
          }

          const cota = await fetchCotaFundo(codigo, token);
          if (cota) {
            store.updateCotaFundo(fundo.id, cota.cota, cota.data);
            updated += 1;
          }
        } catch (error) {
          console.error(`Erro ao atualizar ${fundo.nomeCompleto}:`, error);
        }
      }

      const now = formatDateTime(new Date());
      localStorage.setItem(LAST_UPDATE_KEY, now);
      setLastUpdate(now);
      addToast(`Cotas atualizadas: ${updated}/${ativos.length}`, 'success');
    } catch (error) {
      console.error('Erro ao atualizar cotas:', error);
      addToast('Erro ao atualizar cotas.', 'error');
    } finally {
      setUpdatingCotas(false);
      setUpdateProgress('');
    }
  };

  const handleAplicarCotas = () => {
    const now = new Date().toISOString();
    let atualizados = 0;
    for (const fundo of fundos) {
      if (!fundo.ativo || fundo.cotaAtual === undefined) continue;
      
      // Crava ao meio-dia UTC (T12:00:00.000Z) para blindar contra o fuso horário (UTC-3 Brasil)
      const dataOficialCota = fundo.dataCota ? `${fundo.dataCota}T12:00:00.000Z` : now;

      const ativosRelacionados = store.assets.filter(a => a.referenciaFundoId === fundo.id);
      for (const asset of ativosRelacionados) {
        const quantidade = asset.quantidade ?? 0;
        store.updateAsset(asset.id, {
          precoUnitario: fundo.cotaAtual,
          valorPosicao: quantidade * fundo.cotaAtual,
          dataUltimaAtualizacao: dataOficialCota,
          origemAtualizacao: 'api',
        });
        atualizados += 1;
      }
    }
    addToast(`Preços aplicados em ${atualizados} ativo(s) com a data da cota.`, 'success');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const processImportFile = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('invalid_sheet');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      let skipped = 0;
      const itemsToUpsert: Omit<FundoReferencia, 'id' | 'createdAt'>[] = [];

      for (const row of rows) {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;

        const cnpj = String(normalized.cnpj ?? '').trim();
        const cnpjLimpo = unformatCnpj(cnpj);
        if (cnpjLimpo.length !== 14) {
          skipped += 1;
          continue;
        }

        const nomeCompleto = String(normalized.nomecompleto ?? normalized.nome ?? '').trim();
        const nomeAbreviado = String(normalized.nomeabreviado ?? '').trim() || undefined;
        const gestora = String(normalized.gestora ?? normalized.gestor ?? '').trim() || undefined;
        const administradora = String(normalized.administradora ?? normalized.administrador ?? '').trim() || undefined;
        const classeAnbima = String(normalized.classeanbima ?? normalized.classe ?? '').trim() || undefined;
        const liquidezDPlus = String(normalized['d+'] ?? normalized.dplus ?? normalized.liquidez ?? '').trim() || undefined;
        const cota = parseSheetNumber(normalized.cotaatual ?? normalized.cota ?? '');
        const dataCota = parseToIsoDate(normalized.datacota ?? normalized['data cota']) || new Date().toISOString().slice(0, 10);
        const ativoRaw = normalizeKey(String(normalized.ativo ?? 'sim'));
        const ativo = !['nao', 'não', 'no', 'false', '0'].includes(ativoRaw);

        if (!nomeCompleto && !store.fundosReferencia.some(f => f.cnpjNumerico === cnpjLimpo)) {
          skipped += 1;
          continue;
        }

        itemsToUpsert.push({
          cnpj: formatCnpj(cnpjLimpo),
          cnpjNumerico: cnpjLimpo,
          nomeCompleto,
          nomeAbreviado,
          gestora,
          administradora,
          classeAnbima,
          liquidezDPlus: liquidezDPlus ? liquidezDPlus.toUpperCase() : undefined,
          cotaAtual: Number.isFinite(cota) ? cota : undefined,
          dataCota,
          ativo,
        });
      }

      if (itemsToUpsert.length > 0) {
        store.bulkUpsertFundoReferencia(itemsToUpsert);
      }

      setImportMessage(`Importacao concluida: ${itemsToUpsert.length} registro(s) processado(s), ${skipped} ignorado(s).`);
      addToast(`Importacao concluida: ${itemsToUpsert.length} registro(s) processado(s).`, 'success');
    } catch (error) {
      console.error('Erro ao importar fundos:', error);
      setImportMessage('Falha ao importar planilha.');
      addToast('Erro ao importar planilha.', 'error');
    }
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processImportFile(file);
    event.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const rows = [
      {
        CNPJ: '35.088.117/0001-53',
        NomeCompleto: 'KAPITALO ZETA II FIC FIM',
        NomeAbreviado: 'Kapitalo Zeta II',
        Gestora: 'KAPITALO',
        Administradora: 'BTG PACTUAL',
        ClasseANBIMA: 'Multimercado',
        'D+': 1,
        'Cota Atual': 1.234567,
        'Data Cota': '20/06/2026',
        Ativo: 'Sim',
      },
      {
        CNPJ: '00.000.000/0000-00',
        NomeCompleto: 'Fundo Exemplo FII',
        NomeAbreviado: 'Fundo Exemplo',
        Gestora: 'GESTORA EXEMPLO',
        Administradora: 'ADMIN EXEMPLO',
        ClasseANBIMA: 'FII',
        'D+': 'N/A',
        'Cota Atual': 0.987654,
        'Data Cota': '19/06/2026',
        Ativo: 'Sim',
      },
    ];
    const instructions = [
      ['Campo', 'Descricao'],
      ['CNPJ', 'CNPJ do fundo. Obrigatorio. Formato com ou sem pontuacao.'],
      ['NomeCompleto', 'Nome oficial do fundo. Obrigatorio para novos cadastros.'],
      ['NomeAbreviado', 'Nome curto para exibicao.'],
      ['Gestora', 'Nome da gestora.'],
      ['Administradora', 'Nome da administradora.'],
      ['ClasseANBIMA', 'Classe ANBIMA: Renda Fixa, Acoes, Multimercado, Cambial, Previdencia, FII, ETF, Outro.'],
      ['D+', 'Prazo de liquidez. Ex: 1 para D+1, 30 para D+30, ou N/A para sem liquidez.'],
      ['Cota Atual', 'Valor da cota.'],
      ['Data Cota', 'Data da cota em DD/MM/AAAA.'],
      ['Ativo', 'Sim ou Nao. Padrao: Sim.'],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_importacao_fundos.xlsx');
  };

  const totalFundos = fundos.length;
  const ativosCount = fundos.filter(f => f.ativo).length;
  const inativosCount = totalFundos - ativosCount;

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
            {toast.type === 'success' ? <Check size={16} /> : toast.type === 'error' ? <AlertTriangle size={16} /> : <Building2 size={16} />}
            {toast.message}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CNPJ ou gestora..."
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              <Plus size={16} /> Adicionar Fundo
            </button>
            <button
              onClick={handleOpenCredentials}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <Settings size={16} /> Credenciais ANBIMA
            </button>
            <button
              onClick={handleAtualizarCotas}
              disabled={updatingCotas}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white ${
                updatingCotas ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {updatingCotas ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {updatingCotas ? updateProgress || 'Atualizando...' : 'Atualizar Cotas (ANBIMA)'}
            </button>
            <button
              onClick={handleAplicarCotas}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              <DollarSign size={16} /> Aplicar Preços nos Ativos
            </button>
            <button
              onClick={handleClearAllFundos}
              className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50"
            >
              <Trash2 size={16} /> Limpar ativos
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-gray-100 pt-3">
          <button
            onClick={handleImportClick}
            className="flex items-center gap-2 px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50"
          >
            <Upload size={16} /> Importar Cotas
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50"
          >
            <Download size={16} /> Modelo de Importação
          </button>
          {importMessage && <span className="text-xs text-gray-600">{importMessage}</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Nome do Fundo</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Gestora</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">CNPJ</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Classe ANBIMA</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">D+</th>
                <th className="text-right px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Cota Atual</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Data Cota</th>
                <th className="text-right px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">PL</th>
                <th className="text-center px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Ativo</th>
                <th className="text-center px-3 py-2 text-xs font-bold text-gray-700 border-b border-gray-300">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredFundos.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-400">
                    Nenhum fundo cadastrado.
                  </td>
                </tr>
              )}
              {paginatedFundos.map(fundo => (
                <tr key={fundo.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm text-gray-800">
                    <div className="font-medium">{fundo.nomeAbreviado || fundo.nomeCompleto}</div>
                    {fundo.nomeAbreviado && <div className="text-xs text-gray-500">{fundo.nomeCompleto}</div>}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-700">{fundo.gestora || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-700 font-mono">{fundo.cnpj}</td>
                  <td className="px-3 py-2 text-sm text-gray-700">{fundo.classeAnbima || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-700">{fundo.liquidezDPlus || '—'}</td>
                  <td className="px-3 py-2 text-sm text-right text-gray-800">
                    {fundo.cotaAtual !== undefined ? (
                      <span className="font-mono">{formatCurrency6(fundo.cotaAtual)}</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Não atualizado</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {fundo.dataCota ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          isRecentCota(fundo.dataCota)
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {new Date(`${fundo.dataCota}T00:00:00`).toLocaleDateString('pt-BR')}
                        {!isRecentCota(fundo.dataCota) && <AlertTriangle size={12} />}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-gray-700">
                    {fundo.patrimonioLiquido !== undefined ? fundo.patrimonioLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handleToggleAtivo(fundo)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        fundo.ativo ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          fundo.ativo ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(fundo)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteConfirmId(fundo.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-600">
          <div className="flex items-center gap-4 flex-wrap">
            <span>Total: <strong>{totalFundos}</strong> fundo(s)</span>
            <span>Ativos: <strong>{ativosCount}</strong></span>
            <span>Inativos: <strong>{inativosCount}</strong></span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
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
          <div>
            Última atualização de cotas: {lastUpdate || '—'}
          </div>
        </div>
      </div>

      {showModal && (
        <Modal title={editingId ? 'Editar Fundo' : 'Adicionar Fundo'} onClose={closeModal} size="md">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.cnpj}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleCnpjChange(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <button
                  onClick={handleBuscarAnbima}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1"
                >
                  <Search size={14} /> Buscar na ANBIMA
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
              <input
                type="text"
                value={form.nomeCompleto}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('nomeCompleto', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Abreviado</label>
              <input
                type="text"
                value={form.nomeAbreviado}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('nomeAbreviado', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gestora</label>
                <input
                  type="text"
                  value={form.gestora}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('gestora', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Administradora</label>
                <input
                  type="text"
                  value={form.administradora}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('administradora', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Classe ANBIMA</label>
              <select
                value={form.classeAnbima}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => handleInputChange('classeAnbima', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Selecione...</option>
                {CLASSES_ANBIMA.map(classe => <option key={classe} value={classe}>{classe}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Liquidez (D+)</label>
              <input
                type="text"
                value={form.liquidezDPlus}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('liquidezDPlus', e.target.value)}
                placeholder="Ex: 1 (D+1) ou N/A"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cota Atual</label>
                <input
                  type="text"
                  value={form.cotaAtual}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('cotaAtual', e.target.value)}
                  placeholder="1,234567"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data da Cota</label>
                <input
                  type="date"
                  value={form.dataCota}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('dataCota', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('ativo', e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Ativo
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-1"><Save size={16} /> Salvar Fundo</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirmId && (
        <Modal title="Confirmar exclusão" onClose={() => setDeleteConfirmId(null)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-700">Tem certeza que deseja excluir este fundo do banco de dados?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 flex items-center gap-1"><Trash2 size={16} /> Excluir</button>
            </div>
          </div>
        </Modal>
      )}

      {showCredentialsModal && (
        <Modal title="Credenciais ANBIMA" onClose={() => setShowCredentialsModal(false)} size="md">
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              As credenciais são as mesmas usadas no botão "Atualizar Posições". Serão salvas no localStorage.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
              <input
                type="text"
                value={anbimaCredentials.clientId}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setAnbimaCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
              <input
                type="password"
                value={anbimaCredentials.clientSecret}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setAnbimaCredentials(prev => ({ ...prev, clientSecret: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCredentialsModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSaveCredentials} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-1"><Save size={16} /> Salvar Credenciais</button>
            </div>
          </div>
        </Modal>
      )}


    </div>
  );
}
