import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Shield, Users, UserPlus, Trash2, Building2 } from 'lucide-react';
import type { UserRole } from '../types';
import Modal from './Modal';

export default function UserManager() {
  const store = useStore();
  const currentUser = store.currentUser;
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('assessor');
  const [escritorioId, setEscritorioId] = useState('');
  const [allowedClientsText, setAllowedClientsText] = useState('');
  const [message, setMessage] = useState('');

  if (!currentUser || (currentUser.role !== 'master_geral' && currentUser.role !== 'escritorio_master')) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-gray-100 shadow-sm max-w-2xl mx-auto my-12">
        <Shield size={48} className="mx-auto mb-4 text-red-500 opacity-80" />
        <h2 className="text-xl font-bold text-gray-800">Acesso Restrito</h2>
        <p className="text-sm text-gray-500 mt-1">Apenas o Master Geral (Meros Capital) ou Masters de Escritórios podem acessar a gestão de usuários.</p>
      </div>
    );
  }

  // Se for master_geral, vê todos os usuários. Se for master de escritório, vê apenas os de seu escritório.
  const visibleUsers = store.users.filter(u => {
    if (currentUser.role === 'master_geral') return true;
    return u.escritorioId === currentUser.escritorioId;
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setMessage('Preencha nome e e-mail.');
      return;
    }

    if (store.users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      setMessage('E-mail já cadastrado no sistema.');
      return;
    }

    // Se o criador for escritório master, força afiliação ao seu escritório
    const assignedEscritorio = currentUser.role === 'escritorio_master' ? currentUser.escritorioId : (escritorioId.trim().toLowerCase() || undefined);

    const allowedClients = role === 'cliente_final' ? allowedClientsText.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    store.addUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      escritorioId: role === 'cliente_final' ? undefined : assignedEscritorio,
      allowedClientIds: allowedClients,
    });

    setMessage('');
    setShowModal(false);
    setName('');
    setEmail('');
    setEscritorioId('');
    setAllowedClientsText('');
  };

  const ROLE_BADGES: Record<UserRole, { label: string; bg: string }> = {
    master_geral: { label: 'Master Geral (Meros Capital)', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
    escritorio_master: { label: 'Master Escritório', bg: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
    assessor: { label: 'Assessor de Investimentos', bg: 'bg-blue-100 text-blue-800 border-blue-300' },
    cliente_final: { label: 'Cliente Final / Auto-service', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
            <Users size={24} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Gestão de Usuários &amp; Permissões</h2>
            <p className="text-xs text-gray-500">Controle de acessos da hierarquia Multi-Tenant (Meros Capital &amp; Escritórios Parceiros)</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 shadow-sm transition-colors"
        >
          <UserPlus size={16} /> Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Nome / E-mail</th>
                <th className="px-6 py-3">Nível de Acesso</th>
                <th className="px-6 py-3">Filiação (Escritório)</th>
                <th className="px-6 py-3">Vínculo de Carteiras</th>
                <th className="px-6 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {visibleUsers.map(u => {
                const badge = ROLE_BADGES[u.role];
                return (
                  <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-800">
                      {u.escritorioId ? (
                        <span className="inline-flex items-center gap-1 text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-150">
                          <Building2 size={13} /> {u.escritorioId.toUpperCase()}
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
                    </td>
                    <td className="px-6 py-4 text-center">
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
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        title="Revogar acesso"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="Cadastrar Novo Usuário" onClose={() => setShowModal(false)} size="md">
          <form onSubmit={handleCreateUser} className="space-y-4">
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

            {role !== 'master_geral' && role !== 'cliente_final' && currentUser.role === 'master_geral' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Identificador do Escritório *</label>
                <input
                  type="text"
                  value={escritorioId}
                  onChange={e => setEscritorioId(e.target.value)}
                  placeholder="ex: miura ou cx3"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  required={role === 'escritorio_master' || role === 'assessor'}
                />
                <p className="text-[11px] text-gray-500 mt-1">Use um código curto sem espaços (ex: `miura`). Assessores desse código só verão clientes com este mesmo código.</p>
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

            {message && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">{message}</p>}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-medium rounded-xl text-sm hover:bg-blue-700 shadow-sm flex items-center gap-1">Cadastrar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}