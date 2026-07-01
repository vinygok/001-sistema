import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Shield, Users, UserPlus, Trash2, Building2, Edit2, Building, ChevronUp, ChevronDown, Search } from 'lucide-react';
import type { AppUser, UserRole, EscritorioParceiro } from '../types';
import Modal from './Modal';

// ============================================================================
// PAINEL DE GESTÃO DE USUÁRIOS, ESCRITÓRIOS E CONTROLE DE INADIMPLÊNCIA
// ============================================================================

export default function UserManager() {
  const store = useStore();
  const currentUser = store.currentUser;
  
  // Controle de Sub-abas (Escritórios vs Usuários)
  const [activeSubTab, setActiveSubTab] = useState<'usuarios' | 'escritorios'>('usuarios');

  // Estados da barra de pesquisa e filtros
  const [searchUser, setSearchUser] = useState('');
  const [filterEscritorio, setFilterEscritorio] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');

  // Estados de Ordenação (Sort)
  const [sortField, setSortField] = useState<'name' | 'role' | 'escritorio'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Estado do Modal de Usuários
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('assessor');
  const [escritorioId, setEscritorioId] = useState('');
  const [allowedClientsText, setAllowedClientsText] = useState('');
  const [isCoMaster, setIsCoMaster] = useState(false);
  const [userMessage, setUserMessage] = useState('');

  // Estado do Modal de Escritórios
  const [showEscritorioModal, setShowEscritorioModal] = useState(false);
  const [editingEscritorioId, setEditingEscritorioId] = useState<string | null>(null);
  const [escritorioInputId, setEscritorioInputId] = useState('');
  const [escritorioName, setEscritorioName] = useState('');
  const [escritorioMessage, setEscritorioMessage] = useState('');

  // Proteção militar contra acessos indevidos
  if (!currentUser || (currentUser.role !== 'master_geral' && currentUser.role !== 'escritorio_master' && !currentUser.isCoMaster)) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-gray-100 shadow-sm max-w-2xl mx-auto my-12">
        <Shield size={48} className="mx-auto mb-4 text-red-500 opacity-80" />
        <h2 className="text-xl font-bold text-gray-800">Acesso Restrito</h2>
        <p className="text-sm text-gray-500 mt-1">Apenas o Master Geral (Meros Capital) ou Masters/Co-Gestores de Escritórios podem acessar a gestão de usuários.</p>
      </div>
    );
  }

  // Se for master_geral, vê todos os usuários. Se for master de escritório ou co-gestor, vê apenas os de seu escritório.
  const visibleUsers = store.users.filter(u => {
    if (currentUser.role === 'master_geral') return true;
    return u.escritorioId === currentUser.escritorioId;
  });

  // Aplica filtros combinados e ordenação (Sort)
  const filteredAndSortedUsers = useMemo(() => {
    const term = searchUser.trim().toLowerCase();

    const filtered = visibleUsers.filter(u => {
      const matchSearch = !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
      const matchEsc = filterEscritorio === 'all' || (filterEscritorio === 'direto' ? !u.escritorioId : u.escritorioId === filterEscritorio);
      const matchRole = filterRole === 'all' || u.role === filterRole;
      return matchSearch && matchEsc && matchRole;
    });

    return [...filtered].sort((a, b) => {
      let valA = '';
      let valB = '';
      if (sortField === 'name') { valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); }
      if (sortField === 'role') { valA = a.role; valB = b.role; }
      if (sortField === 'escritorio') { valA = a.escritorioId || ''; valB = b.escritorioId || ''; }
      
      const cmp = valA.localeCompare(valB);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [visibleUsers, searchUser, filterEscritorio, filterRole, sortField, sortDirection]);

  const handleSort = (field: 'name' | 'role' | 'escritorio') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // ── 1. AÇÕES DE USUÁRIOS (Criar, Editar, Alternar Status) ──
  const openAddUser = () => {
    setEditingUserId(null);
    setName('');
    setEmail('');
    setRole('assessor');
    setEscritorioId(currentUser.role !== 'master_geral' ? (currentUser.escritorioId || '') : '');
    setAllowedClientsText('');
    setIsCoMaster(false);
    setUserMessage('');
    setShowUserModal(true);
  };

  const openEditUser = (u: AppUser) => {
    setEditingUserId(u.id);
    setName(u.name);
    setEmail(u.email);
    setRole(u.role);
    setEscritorioId(u.escritorioId || '');
    setAllowedClientsText(u.allowedClientIds?.join(', ') || '');
    setIsCoMaster(u.isCoMaster || false);
    setUserMessage('');
    setShowUserModal(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setUserMessage('Preencha nome e e-mail.');
      return;
    }

    if (!editingUserId && store.users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      setUserMessage('E-mail já cadastrado no sistema.');
      return;
    }

    const assignedEscritorio = currentUser.role !== 'master_geral' ? currentUser.escritorioId : (escritorioId.trim() || undefined);
    const allowedClients = role === 'cliente_final' ? allowedClientsText.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    if (editingUserId) {
      store.updateUser(editingUserId, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        escritorioId: role === 'cliente_final' ? undefined : assignedEscritorio,
        allowedClientIds: allowedClients,
        isCoMaster: role === 'assessor' ? isCoMaster : false,
      });
    } else {
      store.addUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        escritorioId: role === 'cliente_final' ? undefined : assignedEscritorio,
        allowedClientIds: allowedClients,
        ativo: true,
        isCoMaster: role === 'assessor' ? isCoMaster : false,
      });
    }

    setShowUserModal(false);
  };

  // Alterna entre Adimplente (Liberado) e Inadimplente (Suspenso)
  const toggleUserStatus = (u: AppUser) => {
    if (u.id === currentUser.id) {
      alert('Você não pode desativar a si mesmo.');
      return;
    }
    const currentStatus = u.ativo !== false;
    store.updateUser(u.id, { ativo: !currentStatus });
  };

  // ── 2. AÇÕES DE ESCRITÓRIOS PARCEIROS (Criar, Editar, Alternar Status) ──
  const openAddEscritorio = () => {
    setEditingEscritorioId(null);
    setEscritorioInputId('');
    setEscritorioName('');
    setEscritorioMessage('');
    setShowEscritorioModal(true);
  };

  const openEditEscritorio = (esc: EscritorioParceiro) => {
    setEditingEscritorioId(esc.id);
    setEscritorioInputId(esc.id);
    setEscritorioName(esc.name);
    setEscritorioMessage('');
    setShowEscritorioModal(true);
  };

  const handleSaveEscritorio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!escritorioName.trim() || (!editingEscritorioId && !escritorioInputId.trim())) {
      setEscritorioMessage('Preencha todos os campos obrigatórios.');
      return;
    }

    const cleanId = escritorioInputId.trim().toLowerCase().replace(/\s+/g, '');

    if (!editingEscritorioId && store.escritorios.some(esc => esc.id === cleanId)) {
      setEscritorioMessage('Identificador já cadastrado para outro escritório.');
      return;
    }

    if (editingEscritorioId) {
      store.updateEscritorio(editingEscritorioId, { name: escritorioName.trim() });
    } else {
      store.addEscritorio({
        id: cleanId,
        name: escritorioName.trim(),
        ativo: true,
      });
    }

    setShowEscritorioModal(false);
  };

  // Trava Master B2B: Suspende um escritório inteiro (Ex: Miura) por falta de pagamento
  const toggleEscritorioStatus = (esc: EscritorioParceiro) => {
    const currentStatus = esc.ativo !== false;
    if (confirm(`Deseja ${currentStatus ? 'suspender' : 'reativar'} o escritório ${esc.name}? ${currentStatus ? 'Todos os assessores desse escritório perderão acesso temporariamente.' : 'O acesso de todos os assessores será liberado.'}`)) {
      store.updateEscritorio(esc.id, { ativo: !currentStatus });
    }
  };

  const ROLE_BADGES: Record<UserRole, { label: string; bg: string }> = {
    master_geral: { label: 'Master Geral (Meros Capital)', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
    escritorio_master: { label: 'Master Escritório', bg: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
    assessor: { label: 'Assessor de Investimentos', bg: 'bg-blue-100 text-blue-800 border-blue-300' },
    cliente_final: { label: 'Cliente Final / Auto-service', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <Users size={24} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Gestão de Usuários &amp; Escritórios Parceiros</h2>
              <p className="text-xs text-gray-500">Controle de acessos, subordinação e inadimplência (SaaS B2B)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser.role === 'master_geral' && activeSubTab === 'escritorios' ? (
              <button
                onClick={openAddEscritorio}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 shadow-sm transition-colors"
              >
                <Building2 size={16} /> Cadastrar Escritório
              </button>
            ) : (
              <button
                onClick={openAddUser}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 shadow-sm transition-colors"
              >
                <UserPlus size={16} /> Novo Usuário
              </button>
            )}
          </div>
        </div>

        {/* Barra de navegação de Sub-abas */}
        <div className="flex items-center gap-2 pt-4">
          <button
            onClick={() => setActiveSubTab('usuarios')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeSubTab === 'usuarios'
                ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold'
                : 'text-gray-600 hover:bg-gray-50 border border-transparent'
            }`}
          >
            <Users size={16} /> Assessores &amp; Clientes Finais ({visibleUsers.length})
          </button>

          {currentUser.role === 'master_geral' && (
            <button
              onClick={() => setActiveSubTab('escritorios')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeSubTab === 'escritorios'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold'
                  : 'text-gray-600 hover:bg-gray-50 border border-transparent'
              }`}
            >
              <Building size={16} /> Escritórios de Assessoria ({store.escritorios.length})
            </button>
          )}
        </div>
      </div>

      {/* SUB-ABA: TABELA DE USUÁRIOS */}
      {activeSubTab === 'usuarios' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden space-y-4">
          {/* BARRA DE PESQUISA E FILTROS */}
          <div className="p-6 pb-0 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-100 pb-6">
            <div className="relative flex-1 w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
                placeholder="Pesquisar por nome ou e-mail..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>

            {currentUser.role === 'master_geral' && (
              <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Filtrar por Escritório</label>
                  <select
                    value={filterEscritorio}
                    onChange={e => setFilterEscritorio(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[170px]"
                  >
                    <option value="all">Todos os Escritórios</option>
                    <option value="direto">Meros Capital / Direto</option>
                    {store.escritorios.map(esc => (
                      <option key={esc.id} value={esc.id}>{esc.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Nível de Acesso</label>
                  <select
                    value={filterRole}
                    onChange={e => setFilterRole(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[170px]"
                  >
                    <option value="all">Todos os Níveis</option>
                    <option value="master_geral">Master Geral</option>
                    <option value="escritorio_master">Master do Escritório</option>
                    <option value="assessor">Assessor de Investimentos</option>
                    <option value="cliente_final">Cliente Final / Auto-service</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Nome / E-mail</span>
                      <span className="text-gray-400 group-hover:text-gray-600">
                        {sortField === 'name' ? (sortDirection === 'asc' ? <ChevronUp size={14} className="text-blue-600 font-bold" /> : <ChevronDown size={14} className="text-blue-600 font-bold" />) : <ChevronUp size={14} className="opacity-30" />}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('role')}
                    className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Nível de Acesso</span>
                      <span className="text-gray-400 group-hover:text-gray-600">
                        {sortField === 'role' ? (sortDirection === 'asc' ? <ChevronUp size={14} className="text-blue-600 font-bold" /> : <ChevronDown size={14} className="text-blue-600 font-bold" />) : <ChevronUp size={14} className="opacity-30" />}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('escritorio')}
                    className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Filiação (Escritório)</span>
                      <span className="text-gray-400 group-hover:text-gray-600">
                        {sortField === 'escritorio' ? (sortDirection === 'asc' ? <ChevronUp size={14} className="text-blue-600 font-bold" /> : <ChevronDown size={14} className="text-blue-600 font-bold" />) : <ChevronUp size={14} className="opacity-30" />}
                      </span>
                    </div>
                  </th>
                  <th className="px-6 py-3">Vínculo de Carteiras</th>
                  <th className="px-6 py-3 text-center">Status (Acesso)</th>
                  <th className="px-6 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {filteredAndSortedUsers.map(u => {
                  const badge = ROLE_BADGES[u.role];
                  const isUserActive = u.ativo !== false;
                  const escritorio = u.escritorioId ? store.escritorios.find(e => e.id === u.escritorioId) : null;
                  const isEscritorioActive = !escritorio || escritorio.ativo !== false;

                  return (
                    <tr key={u.id} className={`hover:bg-gray-50/70 transition-colors ${!isUserActive ? 'opacity-70 bg-red-50/20' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{u.name}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}>
                            {badge.label}
                          </span>
                          {u.isCoMaster && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300" title="Possui permissão total para gerenciar o escritório">
                              🛡️ Co-Gestor Master
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-800">
                        {escritorio ? (
                          <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded border ${
                            isEscritorioActive ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-red-700 bg-red-50 border-red-200'
                          }`}>
                            <Building2 size={13} /> {escritorio.name} {(!isEscritorioActive) && '(Suspenso)'}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">— (Meros Capital / Direto)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600">
                        {u.role === 'master_geral' && <span className="text-amber-700 font-semibold">Acesso irrestrito (Todas as contas)</span>}
                        {u.role === 'escritorio_master' && <span className="text-indigo-700 font-semibold">Todas as contas do escritório {u.escritorioId?.toUpperCase()}</span>}
                        {u.role === 'assessor' && <span className="text-blue-700 font-semibold">Contas atribuídas a este Assessor</span>}
                        {u.role === 'cliente_final' && (
                          <div>
                            <div className="font-semibold text-emerald-700">Contas autorizadas:</div>
                            <div className="font-mono text-[11px] text-gray-500 mt-0.5">{u.allowedClientIds?.join(', ') || 'Nenhuma'}</div>
                          </div>
                        )}

                        {/* LINK DE CONVITE SIMULADO (Onboarding) */}
                        {u.id !== currentUser.id && (
                          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 font-medium">Link de Convite:</span>
                            <input
                              type="text"
                              readOnly
                              value={`${window.location.origin}/?setup=${u.id}`}
                              className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-600 w-48 outline-none"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/?setup=${u.id}`);
                                alert(`Link de convite para ${u.name} copiado para a área de transferência!`);
                              }}
                              className="text-[10px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded px-2 py-0.5 font-bold transition-colors"
                            >
                              Copiar
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleUserStatus(u)}
                          disabled={u.id === currentUser.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            isUserActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } disabled:opacity-50 disabled:pointer-events-none`}
                          title={isUserActive ? 'Clique para suspender acesso' : 'Clique para reativar acesso'}
                        >
                          <span className={`w-2 h-2 rounded-full ${isUserActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          {isUserActive ? 'Liberado' : 'Suspenso'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditUser(u)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar usuário"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              if (u.id === currentUser.id) {
                                alert('Você não pode excluir a si mesmo.');
                                return;
                              }
                              if (confirm(`Deseja revogar o acesso de ${u.name}?`)) {
                                store.deleteUser(u.id);
                              }
                            }}
                            disabled={u.id === currentUser.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            title="Excluir usuário"
                          >
                            <Trash2 size={16} />
                          </button>
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

      {/* SUB-ABA: TABELA DE ESCRITÓRIOS */}
      {activeSubTab === 'escritorios' && currentUser.role === 'master_geral' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Identificador (ID)</th>
                  <th className="px-6 py-3">Nome do Escritório</th>
                  <th className="px-6 py-3">Assessores / Clientes Finais</th>
                  <th className="px-6 py-3 text-center">Status (Adimplência)</th>
                  <th className="px-6 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {store.escritorios.map(esc => {
                  const isEscActive = esc.ativo !== false;
                  const assessoresCount = store.users.filter(u => u.escritorioId === esc.id).length;
                  const clientesCount = store.clients.filter(c => c.escritorioId === esc.id).length;

                  return (
                    <tr key={esc.id} className={`hover:bg-gray-50/70 transition-colors ${!isEscActive ? 'opacity-70 bg-red-50/20' : ''}`}>
                      <td className="px-6 py-4 font-mono font-bold text-indigo-700 text-sm">
                        {esc.id.toUpperCase()}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">
                        {esc.name}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600">
                        <strong>{assessoresCount}</strong> credenciais ativas · <strong>{clientesCount}</strong> portfólios cadastrados
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleEscritorioStatus(esc)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            isEscActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-red-100 text-red-800 hover:bg-red-200'
                          }`}
                          title={isEscActive ? 'Clique para suspender escritório por inadimplência' : 'Clique para liberar acesso'}
                        >
                          <span className={`w-2 h-2 rounded-full ${isEscActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          {isEscActive ? 'Adimplente (Liberado)' : 'Inadimplente (Suspenso)'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditEscritorio(esc)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar escritório"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Deseja descontinuar o escritório ${esc.name}? Todos os assessores desse escritório perderão o acesso.`)) {
                                store.deleteEscritorio(esc.id);
                              }
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Descontinuar escritório"
                          >
                            <Trash2 size={16} />
                          </button>
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

      {/* MODAL DE USUÁRIOS */}
      {showUserModal && (
        <Modal title={editingUserId ? 'Editar Usuário' : 'Cadastrar Novo Usuário'} onClose={() => setShowUserModal(false)} size="md">
          <form onSubmit={handleSaveUser} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome Completo *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ex: Carlos Oliveira"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail Corporativo / Acesso *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ex: carlos@miurainvestimentos.com"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
                disabled={!!editingUserId} // E-mail funciona como chave primária de login
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nível de Acesso (Papel) *</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as UserRole)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                {currentUser.role === 'master_geral' && <option value="master_geral">Master Geral (Meros Capital)</option>}
                {currentUser.role === 'master_geral' && <option value="escritorio_master">Master do Escritório</option>}
                <option value="assessor">Assessor de Investimentos</option>
                <option value="cliente_final">Cliente Final / Auto-service</option>
              </select>
            </div>

            {role === 'assessor' && (
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-indigo-900 bg-indigo-50 p-3 rounded-xl border border-indigo-200 cursor-pointer hover:bg-indigo-100/80 transition-colors">
                  <input type="checkbox" checked={isCoMaster} onChange={e => setIsCoMaster(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                  <span>🛡️ Conceder privilégio de Co-Gestor (Master do Escritório) a este Assessor</span>
                </label>
                <p className="text-[11px] text-gray-500 mt-1 pl-1">O assessor continuará atendendo sua própria carteira, mas terá acesso total para visualizar todos os clientes e gerenciar a equipe do escritório.</p>
              </div>
            )}

            {role !== 'master_geral' && role !== 'cliente_final' && currentUser.role === 'master_geral' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Escritório Parceiro (Filiação) *</label>
                <select
                  value={escritorioId}
                  onChange={e => setEscritorioId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  required={role === 'escritorio_master' || role === 'assessor'}
                >
                  <option value="">— Selecione um Escritório Cadastrado —</option>
                  {store.escritorios.map(esc => (
                    <option key={esc.id} value={esc.id}>{esc.name} ({esc.id.toUpperCase()})</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">Selecione na lista oficial de escritórios. Cadastre novos na sub-aba 'Escritórios'.</p>
              </div>
            )}

            {role === 'cliente_final' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">IDs dos Clientes Autorizados (Separados por vírgula)</label>
                <input
                  type="text"
                  value={allowedClientsText}
                  onChange={e => setAllowedClientsText(e.target.value)}
                  placeholder="ex: client-joao-1, client-filho-1"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
                <p className="text-[11px] text-gray-500 mt-1">Informe os IDs exatos das contas que este login pode acessar (ex: a carteira dele e a do filho).</p>
              </div>
            )}

            {userMessage && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">{userMessage}</p>}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setShowUserModal(false)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-medium rounded-xl text-sm hover:bg-blue-700 shadow-sm flex items-center gap-1">{editingUserId ? 'Salvar Alterações' : 'Cadastrar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL DE ESCRITÓRIOS */}
      {showEscritorioModal && (
        <Modal title={editingEscritorioId ? 'Editar Escritório' : 'Cadastrar Novo Escritório'} onClose={() => setShowEscritorioModal(false)} size="sm">
          <form onSubmit={handleSaveEscritorio} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Identificador Único (ID) *</label>
              <input
                type="text"
                value={escritorioInputId}
                onChange={e => setEscritorioInputId(e.target.value)}
                placeholder="ex: miura ou cx3"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                required
                disabled={!!editingEscritorioId} // Não altera o ID se estiver editando
              />
              <p className="text-[11px] text-gray-500 mt-1">Código curto sem espaços. Será usado como chave nos portfólios e relatórios.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome Oficial do Escritório *</label>
              <input
                type="text"
                value={escritorioName}
                onChange={e => setEscritorioName(e.target.value)}
                placeholder="ex: Miura Investimentos"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            {escritorioMessage && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">{escritorioMessage}</p>}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setShowEscritorioModal(false)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl text-sm hover:bg-indigo-700 shadow-sm flex items-center gap-1">{editingEscritorioId ? 'Salvar Alterações' : 'Cadastrar Escritório'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}