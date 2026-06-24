import { useState } from 'react';
import { Users, Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Client } from '../types';
import Modal from './Modal';

interface ClientFormData {
  name: string;
  account: string;
  institution: string;
  cpf: string;
}

const empty: ClientFormData = { name: '', account: '', institution: '', cpf: '' };

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export default function ClientManager() {
  const store = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientFormData>(empty);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleAdd = () => {
    setForm(empty);
    setShowAdd(true);
    setEditId(null);
  };

  const handleEdit = (client: Client) => {
    setForm({ name: client.name, account: client.account, institution: client.institution, cpf: client.cpf });
    setEditId(client.id);
    setShowAdd(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.account.trim()) return;
    if (editId) {
      store.updateClient(editId, form);
    } else {
      store.addClient(form);
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Users size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">Clientes</h2>
            <p className="text-xs text-gray-500">Gerencie os portfólios dos clientes</p>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          Novo Cliente
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {store.clients.length === 0 && (
          <div className="px-6 py-10 text-center text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum cliente cadastrado</p>
            <p className="text-xs mt-1">Clique em "Novo Cliente" para começar</p>
          </div>
        )}
        {store.clients.map(client => (
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
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{client.name}</span>
                  {store.selectedClientId === client.id && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Ativo</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  <span className="mr-3">Conta: <strong>{client.account}</strong></span>
                  <span className="mr-3">{client.institution}</span>
                  <span>CPF: {client.cpf}</span>
                </div>
              </div>
            </div>
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
