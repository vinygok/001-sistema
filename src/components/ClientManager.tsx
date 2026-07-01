import { useState, useRef, useMemo, type ChangeEvent } from 'react';
import { Users, Plus, Edit2, Trash2, Check, X, Building2, UserCheck, Shield, Download, Upload, Search, ChevronUp, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from '../store/useStore';
import type { Client } from '../types';
import Modal from './Modal';

interface ClientFormData {
  name: string;
  account: string;
  institution: string;
  cpf: string;
  escritorioId: string;
  assessorId: string;
  clienteFinalUserId: string;
}

const empty: ClientFormData = { name: '', account: '', institution: '', cpf: '', escritorioId: '', assessorId: '', clienteFinalUserId: '' };

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export default function ClientManager() {
  const store = useStore();
  const currentUser = store.currentUser;
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientFormData>(empty);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Estados de Filtro e Ordenação (Pesquisa, Setas e Dropdowns Dependentes)
  const [searchClient, setSearchClient] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterEscritorio, setFilterEscritorio] = useState<string>('all');
  const [filterAssessor, setFilterAssessor] = useState<string>('all');

  const handleAdd = () => {
    // Pré-preenche escritório e assessor automaticamente com base em quem está logado
    setForm({
      ...empty,
      escritorioId: currentUser?.escritorioId || '',
      assessorId: currentUser?.role === 'assessor' ? currentUser.id : '',
    });
    setShowAdd(true);
    setEditId(null);
  };

  const handleEdit = (client: Client) => {
    setForm({
      name: client.name,
      account: client.account,
      institution: client.institution,
      cpf: client.cpf,
      escritorioId: client.escritorioId || '',
      assessorId: client.assessorId || '',
      clienteFinalUserId: client.clienteFinalUserId || '',
    });
    setEditId(client.id);
    setShowAdd(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.account.trim()) return;
    
    const payload = {
      name: form.name.trim(),
      account: form.account.trim(),
      institution: form.institution.trim(),
      cpf: form.cpf,
      escritorioId: form.escritorioId.trim() ? form.escritorioId.trim().toLowerCase() : undefined,
      assessorId: form.assessorId || undefined,
      clienteFinalUserId: form.clienteFinalUserId || undefined,
    };

    if (editId) {
      store.updateClient(editId, payload);
    } else {
      store.addClient(payload);
    }
    setShowAdd(false);
    setEditId(null);
    setForm(empty);
  };

  const handleDelete = (id: string) => {
    store.deleteClient(id);
    setDeleteConfirm(null);
    if (store.selectedClientId === id) store.selectClient(null);
  };

  // ── REGRAS DE FILTRAGEM PARA O FORMULÁRIO ──
  // Master Geral vê assessores de todos os escritórios. Master de escritório vê apenas os seus.
    // Listas de seleção para o formulário
  const availableAssessores = store.users.filter(u => {
    if (u.role !== 'assessor') return false;
    if (currentUser?.role === 'escritorio_master') return u.escritorioId === currentUser.escritorioId;
    if (form.escritorioId) return u.escritorioId === form.escritorioId;
    return true;
  });

  const availableEndClients = store.users.filter(u => u.role === 'cliente_final');

  // Identifica todos os escritórios existentes no sistema para o Master Geral escolher
  const allEscritorios = store.escritorios;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- FUNÇÕES DE IMPORTAÇÃO E EXPORTAÇÃO EXCEL ---
  const downloadClientTemplate = () => {
    const rows = [
      {
        Nome: 'Carlos Rodrigues da Silva',
        Conta: '12938-4',
        Instituicao: 'BTG Pactual',
        CPF: '111.222.333-44',
        Escritorio: 'miura',
        Assessor: 'miura-assessor-1',
        LoginClienteFinal: 'carlos@silva.com',
      },
      {
        Nome: 'Mariana Costa Sousa',
        Conta: '88392-1',
        Instituicao: 'XP Investimentos',
        CPF: '555.666.777-88',
        Escritorio: 'cx3',
        Assessor: 'cx3-assessor-1',
        LoginClienteFinal: 'mariana@costa.com',
      },
    ];

    const instructions = [
      ['Colunas', 'Obrigatório', 'Descrição / Instruções Importantes'],
      ['Nome', 'Sim', 'Nome completo do cliente.'],
      ['Conta', 'Sim', 'Número da conta com dígito (Ex: 12938-4).'],
      ['Instituicao', 'Sim', 'Nome do Banco / Corretora (Ex: BTG Pactual, XP, Itaú).'],
      ['CPF', 'Não', 'CPF do titular.'],
      ['Escritorio', 'Sim/Não', 'ID curto oficial do escritório no sistema (Ex: miura, cx3). Se você for Assessor ou Master do Escritório, o sistema usará seu próprio escritório, ignorando esta coluna.'],
      ['Assessor', 'Sim/Não', 'ID do Assessor Responsável no sistema. Se você for Assessor, o sistema usará o seu próprio login, ignorando esta coluna.'],
      ['LoginClienteFinal', 'Não', 'E-mail ou ID do investidor auto-service para ele poder visualizar a conta no celular.'],
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instrucoes');
    XLSX.writeFile(wb, 'modelo_importacao_clientes.xlsx');
  };

  const exportClients = () => {
    const rows = store.activeClients.map(c => ({
      Nome: c.name,
      Conta: c.account,
      Instituicao: c.institution,
      CPF: c.cpf,
      Escritorio: c.escritorioId || 'Meros Capital / Direto',
      Assessor: c.assessorId || 'Nenhum',
      LoginClienteFinal: c.clienteFinalUserId || 'Nenhum',
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Clientes Ativos');
    XLSX.writeFile(wb, `base_clientes_${currentUser?.escritorioId || 'geral'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importClients = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('invalid_sheet');
      const rowsJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const itemsToPush: Omit<Client, 'id' | 'createdAt'>[] = [];
      let skipped = 0;

      for (const row of rowsJson) {
        // Normaliza chaves para evitar problemas com espaços
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          const cleanKey = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
          normalized[cleanKey] = v;
        }

        const name = String(normalized.nome ?? '').trim();
        const account = String(normalized.conta ?? '').trim();
        const institution = String(normalized.instituicao ?? '').trim();
        const cpf = String(normalized.cpf ?? '').trim();
        const escRaw = String(normalized.escritorio ?? '').trim().toLowerCase();
        const assRaw = String(normalized.assessor ?? '').trim();
        const loginRaw = String(normalized.loginclientefinal ?? '').trim();

        if (!name || !account) {
          skipped += 1;
          continue;
        }

        // Regras de subordinação militar Multi-Tenant (Cascata)
        // Se for Master Geral, respeita o que está na planilha. Se for Assessor ou Master de Escritório, força o ID do seu próprio escritório!
        const finalEscritorio = currentUser?.role !== 'master_geral' ? currentUser?.escritorioId : (escRaw || undefined);
        
        // Se for Assessor comum (não co-gestor), força o seu próprio ID como assessor da conta
        const finalAssessor = (currentUser?.role === 'assessor' && !currentUser?.isCoMaster) ? currentUser.id : (assRaw || undefined);

        // Busca se existe um e-mail de cliente final para vincular
        let finalClienteFinalId: string | undefined = loginRaw || undefined;
        if (loginRaw && loginRaw.includes('@')) {
          const endUser = store.users.find(u => u.email.toLowerCase() === loginRaw.toLowerCase());
          if (endUser) finalClienteFinalId = endUser.id;
        }

        itemsToPush.push({
          name,
          account,
          institution,
          cpf: cpf ? formatCPF(cpf) : '',
          escritorioId: finalEscritorio,
          assessorId: finalAssessor,
          clienteFinalUserId: finalClienteFinalId,
        });
      }

      if (itemsToPush.length > 0) {
        store.bulkAddClients(itemsToPush);
        alert(`Importação concluída com sucesso! ${itemsToPush.length} clientes cadastrados no portfólio. (Linhas ignoradas: ${skipped})`);
      } else {
        alert('Nenhum cliente válido encontrado na planilha. Verifique se as colunas Nome e Conta estão preenchidas.');
      }
    } catch (error) {
      console.error('Erro ao importar planilha de clientes:', error);
      alert('Erro ao processar arquivo Excel de clientes. Verifique se seguiu o modelo correto.');
        } finally {
      event.target.value = '';
    }
  };
  // ----------------------------------------------

  // --- MOTOR DE FILTRAGEM DEPENDENTE MULTI-TENANT ---
  const filteredAndSortedClients = useMemo(() => {
    const term = searchClient.trim().toLowerCase();

    const filtered = store.activeClients.filter(c => {
      const matchSearch = !term || c.name.toLowerCase().includes(term) || c.account.toLowerCase().includes(term) || (c.cpf && c.cpf.includes(term));

      // Regra da Caixa de Escritórios (Master Geral)
      let matchEsc = true;
      if (currentUser?.role === 'master_geral' && filterEscritorio !== 'all') {
        if (filterEscritorio === 'clientes_finais') {
          matchEsc = !c.escritorioId && !c.assessorId;
        } else {
          matchEsc = c.escritorioId === filterEscritorio;
        }
      }

      // Regra da Caixa de Assessores (Master Geral e Master Escritório/Co-Gestor)
      let matchAss = true;
      if (filterAssessor !== 'all' && filterEscritorio !== 'clientes_finais') {
        matchAss = c.assessorId === filterAssessor;
      }

      return matchSearch && matchEsc && matchAss;
    });

    return [...filtered].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [store.activeClients, currentUser, searchClient, filterEscritorio, filterAssessor, sortOrder]);

  const filterAssessoresList = store.users.filter(u => {
    if (u.role !== 'assessor') return false;
    if (currentUser?.role === 'master_geral' && filterEscritorio !== 'all' && filterEscritorio !== 'clientes_finais') {
      return u.escritorioId === filterEscritorio;
    }
    if (currentUser?.role === 'escritorio_master' || currentUser?.isCoMaster) {
      return u.escritorioId === currentUser?.escritorioId;
    }
    return true;
  });

  // Escritório do usuário logado (se houver)
  const escritorioOficial = currentUser?.escritorioId ? store.escritorios.find(e => e.id === currentUser.escritorioId) : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4 px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Users size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">Clientes</h2>
            <p className="text-xs text-gray-500">Gerencie os portfólios dos clientes</p>
          </div>
        </div>
        {store.currentUser?.role !== 'cliente_final' && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={downloadClientTemplate}
              className="flex items-center gap-1.5 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
              title="Baixar planilha modelo com aba de Instruções"
            >
              <Download size={15} /> Modelo
            </button>
            <button
              onClick={exportClients}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              title="Exportar base de clientes visível"
            >
              <Download size={15} /> Exportar
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors"
              title="Cadastrar clientes em lote por planilha Excel"
            >
              <Upload size={15} /> Importar Planilha
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importClients} />

            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
            >
              <Plus size={16} />
              Novo Cliente
            </button>
          </div>
        )}
      </div>

      {/* PAINEL DE PESQUISA, SETAS E DROPDOWNS DEPENDENTES */}
      <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
          <div className="relative flex-1 w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              value={searchClient}
              onChange={e => setSearchClient(e.target.value)}
              placeholder="Pesquisar por nome, conta ou CPF..."
              className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
            />
          </div>

          <button
            onClick={() => setSortOrder(p => p === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm shrink-0"
            title="Organizar por Nome em ordem crescente ou decrescente"
          >
            <span>Nome</span>
            {sortOrder === 'asc' ? <ChevronUp size={14} className="text-blue-600 font-bold" /> : <ChevronDown size={14} className="text-blue-600 font-bold" />}
          </button>
        </div>

        {/* CAIXAS DE SELEÇÃO DE ESCRITÓRIOS E ASSESSORES (Ocultas para Cliente Final) */}
        {currentUser && currentUser.role !== 'cliente_final' && (
          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
            
            {/* Caixa 1: Escritório */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Escritório Parceiro</label>
              {currentUser.role === 'master_geral' ? (
                <select
                  value={filterEscritorio}
                  onChange={e => { setFilterEscritorio(e.target.value); setFilterAssessor('all'); }}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[170px] shadow-sm"
                >
                  <option value="all">Todos os Clientes</option>
                  <option value="clientes_finais">Clientes finais (Meros Capital / Direto)</option>
                  {[...store.escritorios].sort((a, b) => a.name.localeCompare(b.name)).map(esc => (
                    <option key={esc.id} value={esc.id}>{esc.name} ({esc.id.toUpperCase()})</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={escritorioOficial ? escritorioOficial.name : 'Meros Capital / Direto'}
                  disabled
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-500 font-bold min-w-[170px]"
                />
              )}
            </div>

            {/* Caixa 2: Assessor */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Assessor Responsável</label>
              {currentUser.role === 'assessor' && !currentUser.isCoMaster ? (
                <input
                  type="text"
                  value={currentUser.name}
                  disabled
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-500 font-medium min-w-[170px]"
                />
              ) : (
                <select
                  value={filterAssessor}
                  onChange={e => setFilterAssessor(e.target.value)}
                  disabled={filterEscritorio === 'clientes_finais'}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[170px] shadow-sm disabled:opacity-40 disabled:bg-gray-100"
                >
                  <option value="all">Todos os Assessores</option>
                  {filterAssessoresList.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>

          </div>
        )}
      </div>

      <div className="divide-y divide-gray-50">
        {filteredAndSortedClients.length === 0 && (
          <div className="px-6 py-10 text-center text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum cliente encontrado para este filtro</p>
            {store.currentUser?.role !== 'cliente_final' && <p className="text-xs mt-1">Verifique a pesquisa ou limpe os filtros de escritório/assessor</p>}
          </div>
        )}
        {filteredAndSortedClients.map(client => (
          <div
            key={client.id}
            className={`flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${store.selectedClientId === client.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
            onClick={() => store.selectClient(client.id)}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${store.selectedClientId === client.id ? 'bg-blue-500' : 'bg-gray-400'}`}>
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{client.name}</span>
                  {store.selectedClientId === client.id && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Ativo</span>
                  )}
                  {client.escritorioId && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold border border-indigo-200 flex items-center gap-1">
                      <Building2 size={11} /> {client.escritorioId.toUpperCase()}
                    </span>
                  )}
                  {client.assessorId && store.currentUser?.role !== 'assessor' && (
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                      <UserCheck size={11} /> Assessor: {store.users.find(u => u.id === client.assessorId)?.name || client.assessorId}
                    </span>
                  )}
                  {client.clienteFinalUserId && store.currentUser?.role !== 'cliente_final' && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                      <Shield size={11} /> Vinculado ao Login: {store.users.find(u => u.id === client.clienteFinalUserId)?.name || client.clienteFinalUserId}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  <span className="mr-3">Conta: <strong>{client.account}</strong></span>
                  <span className="mr-3">{client.institution}</span>
                  <span>CPF: {client.cpf}</span>
                </div>
              </div>
            </div>
            {store.currentUser?.role !== 'cliente_final' && (
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => handleEdit(client)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 size={15} />
                </button>
                {deleteConfirm === client.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-600 mr-1">Confirmar?</span>
                    <button onClick={() => handleDelete(client.id)} className="p-1.5 text-white bg-red-500 rounded hover:bg-red-600 transition-colors">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setDeleteConfirm(null)} className="p-1.5 text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(client.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <Modal
          title={editId ? 'Editar Cliente' : 'Novo Cliente'}
          onClose={() => { setShowAdd(false); setEditId(null); }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nome completo do cliente"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número da Conta *</label>
              <input
                type="text"
                value={form.account}
                onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                placeholder="Ex: 12345-6"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instituição</label>
              <input
                type="text"
                value={form.institution}
                onChange={e => setForm(f => ({ ...f, institution: e.target.value }))}
                placeholder="Ex: BTG, XP, Itaú..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
              <input
                type="text"
                value={form.cpf}
                onChange={e => setForm(f => ({ ...f, cpf: formatCPF(e.target.value) }))}
                placeholder="000.000.000-00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* VINCULAÇÃO MULTI-TENANT */}
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cascata de Acesso (Multi-Tenant)</h4>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Escritório *</label>
                {currentUser?.role === 'master_geral' ? (
                  <select
                    value={form.escritorioId}
                    onChange={e => setForm(f => ({ ...f, escritorioId: e.target.value, assessorId: '' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— Sem Escritório (Meros Capital / Direto) —</option>
                    {allEscritorios.map(esc => (
                      <option key={esc.id} value={esc.id}>{esc.name} ({esc.id.toUpperCase()})</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.escritorioId ? form.escritorioId.toUpperCase() : 'Meros Capital / Direto'}
                    disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 font-bold"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assessor Responsável</label>
                {currentUser?.role === 'assessor' ? (
                  <input
                    type="text"
                    value={currentUser.name}
                    disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 font-medium"
                  />
                ) : (
                  <select
                    value={form.assessorId}
                    onChange={e => setForm(f => ({ ...f, assessorId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— Nenhum (Disponível para todo o escritório) —</option>
                    {availableAssessores.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vínculo de Login para o Cliente Final (Auto-service)</label>
                <select
                  value={form.clienteFinalUserId}
                  onChange={e => setForm(f => ({ ...f, clienteFinalUserId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Sem vínculo de login auto-service —</option>
                  {availableEndClients.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-0.5">Vincule ao e-mail do cliente final para que ele veja esta conta pelo celular/web em modo de leitura.</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.account.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editId ? 'Salvar Alterações' : 'Cadastrar Cliente'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setEditId(null); }}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
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