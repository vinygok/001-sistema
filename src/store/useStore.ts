/**
 * useStore.ts
 * -----------
 * Store global da aplicação usando padrão Singleton + Listeners.
 *
 * O estado é mantido em memória (`storeData`) e persistido no localStorage.
 * Qualquer componente que chame `useStore()` recebe um re-render automático
 * sempre que o estado for alterado via `updateStore()`.
 *
 * Seções:
 *  1. Imports e tipos internos
 *  2. Estado inicial e persistência (localStorage)
 *  3. Helpers internos
 *  4. Singleton + sistema de listeners
 *  5. Hook `useStore` com todas as actions
 */

// =============================================================================
// 1. Imports e tipos internos
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Client,
  Strategy,
  SubStrategy,
  Asset,
  DraftNote,
  AssetMovement,
  CdiRate,
  IrBracket,
  AnbimaHoliday,
  RendaVariavelPrice,
  FundoReferencia,
  RendaFixaReferencia,
  AppUser,
} from '../types';

// Chaves de persistência
const STORAGE_KEY_MAIN   = 'portfolio_main_v3';
const LEGACY_STORAGE_KEY = 'investment_portfolio_v1';

/** Formato completo dos dados armazenados */
interface StoreData {
  users: AppUser[];
  currentUserId: string | null;
  clients: Client[];
  strategies: Strategy[];
  subStrategies: SubStrategy[];
  assets: Asset[];
  assetMovements: AssetMovement[];
  cdiRates: CdiRate[];
  irBrackets: IrBracket[];
  anbimaHolidays: AnbimaHoliday[];
  draftNotes: DraftNote[];
  rvPrices: RendaVariavelPrice[];
  fundosReferencia: FundoReferencia[];
  rendasFixasReferencia: RendaFixaReferencia[];
  selectedClientId: string | null;
}

// =============================================================================
// 2. Estado inicial, IndexedDB Engine e Persistência Híbrida Multi-Camada
// =============================================================================

const defaultUsers: AppUser[] = [
  { id: 'master-1', name: 'Master Geral', email: 'master@meroscapital.com', role: 'master_geral', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'miura-master', name: 'Miura Gestor Master', email: 'gestor@miurainvestimentos.com', role: 'escritorio_master', escritorioId: 'miura', createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 'miura-assessor-1', name: 'Carlos (Assessor Miura)', email: 'carlos@miurainvestimentos.com', role: 'assessor', escritorioId: 'miura', createdAt: '2026-01-03T00:00:00.000Z' },
  { id: 'cx3-master', name: 'CX3 Gestor Master', email: 'gestor@cx3investimentos.com', role: 'escritorio_master', escritorioId: 'cx3', createdAt: '2026-01-04T00:00:00.000Z' },
  { id: 'cx3-assessor-1', name: 'Fernanda (Assessor CX3)', email: 'fernanda@cx3investimentos.com', role: 'assessor', escritorioId: 'cx3', createdAt: '2026-01-05T00:00:00.000Z' },
  { id: 'cliente-1', name: 'João Silva (Investidor Auto-service)', email: 'joao@silva.com', role: 'cliente_final', allowedClientIds: ['client-joao-1', 'client-filho-1'], createdAt: '2026-01-06T00:00:00.000Z' },
];

/** Valores padrão para um store vazio (ex: primeiro acesso) */
const defaultData: StoreData = {
  users: defaultUsers,
  currentUserId: null,
  clients: [
    { id: 'client-joao-1', name: 'João Silva', account: '10293-4', institution: 'BTG Pactual', cpf: '111.222.333-44', createdAt: '2026-01-01T12:00:00.000Z' },
    { id: 'client-filho-1', name: 'Pedro Silva (Filho)', account: '55443-2', institution: 'BTG Pactual', cpf: '222.333.444-55', createdAt: '2026-01-02T12:00:00.000Z' },
    { id: 'client-miura-1', name: 'Ana Oliveira', account: '99887-1', institution: 'BTG Pactual', cpf: '333.444.555-66', escritorioId: 'miura', assessorId: 'miura-assessor-1', createdAt: '2026-01-03T12:00:00.000Z' },
    { id: 'client-cx3-1', name: 'Roberto Santos', account: '77665-2', institution: 'BTG Pactual', cpf: '444.555.666-77', escritorioId: 'cx3', assessorId: 'cx3-assessor-1', createdAt: '2026-01-04T12:00:00.000Z' },
  ],
  strategies: [],
  subStrategies: [],
  assets: [],
  assetMovements: [],
  cdiRates: [],
  irBrackets: [
    { id: 'ir-180', diasDe: 0,   diasAte: 180, aliquota: 22.5 },
    { id: 'ir-360', diasDe: 181, diasAte: 360, aliquota: 20   },
    { id: 'ir-720', diasDe: 361, diasAte: 720, aliquota: 17.5 },
    { id: 'ir-long', diasDe: 721,              aliquota: 15   },
  ],
  anbimaHolidays: [],
  draftNotes: [],
  rvPrices: [],
  fundosReferencia: [],
  rendasFixasReferencia: [],
  selectedClientId: null,
};

// --- TIER 1: INDEXEDDB ENGINE (Armazenamento Primário em Gigabytes) ---
const IDB_NAME = 'PortfolioGlobalDB';
const IDB_VERSION = 1;
const IDB_STORE = 'catalogs';

function getIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function idbGet<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const db = await getIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result !== undefined ? request.result : defaultValue);
      };
      request.onerror = () => resolve(defaultValue);
    });
  } catch {
    return defaultValue;
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Erro silencioso
  }
}
// ----------------------------------------------------------------------

// --- TIER 2: CHUNKED LOCALSTORAGE BACKUP (Proteção contra fechamento do navegador) ---
// Divide a Renda Fixa em pedaços menores (chunks) para salvar no localStorage
// sem estourar o limite de 5MB. Se o navegador limpar o IndexedDB ao fechar,
// o localStorage restaura instantaneamente!
const RF_CHUNK_SIZE = 4000;

function saveRfToLocalStorageChunks(refs: RendaFixaReferencia[]): void {
  try {
    const totalChunks = Math.ceil(refs.length / RF_CHUNK_SIZE);
    localStorage.setItem('portfolio_rf_meta_v3', JSON.stringify({ totalChunks, count: refs.length }));

    for (let i = 0; i < totalChunks; i++) {
      const chunk = refs.slice(i * RF_CHUNK_SIZE, (i + 1) * RF_CHUNK_SIZE);
      localStorage.setItem(`portfolio_rf_chunk_${i}_v3`, JSON.stringify(chunk));
    }
  } catch {
    // Erro silencioso se storage estiver cheio (IndexedDB atuará como primário)
  }
}

function loadRfFromLocalStorageChunks(): RendaFixaReferencia[] {
  try {
    const rawMeta = localStorage.getItem('portfolio_rf_meta_v3');
    if (!rawMeta) return [];
    const meta = JSON.parse(rawMeta);
    const result: RendaFixaReferencia[] = [];
    for (let i = 0; i < meta.totalChunks; i++) {
      const rawChunk = localStorage.getItem(`portfolio_rf_chunk_${i}_v3`);
      if (rawChunk) {
        result.push(...JSON.parse(rawChunk));
      }
    }
    return result;
  } catch {
    return [];
  }
}
// ----------------------------------------------------------------------

/**
 * Carrega os dados do localStorage (Core + Chunks de RF) e inicializa a migração se necessário.
 */
function loadData(): StoreData {
  try {
    // 1. Tenta carregar a chave principal nova (v3)
    const rawMain = localStorage.getItem(STORAGE_KEY_MAIN);
    if (rawMain) {
      const mainData = JSON.parse(rawMain);
      // Restaura a Renda Fixa diretamente do backup de chunks do localStorage
      const rfBackup = loadRfFromLocalStorageChunks();
      
      return {
        ...defaultData,
        ...mainData,
        users: mainData.users?.length ? mainData.users : defaultUsers,
        currentUserId: mainData.currentUserId ?? null,
        rendasFixasReferencia: rfBackup,
        // CDI, Feriados, RV e Fundos virão do IndexedDB (ou do backup secundário)
        cdiRates: [],
        anbimaHolidays: [],
        rvPrices: [],
        fundosReferencia: [],
      };
    }

    // 2. Fallback de migração do modelo antigo (v1)
    const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawLegacy) {
      const legacyParsed = { ...defaultData, ...JSON.parse(rawLegacy) } as StoreData;

      // Migração de assets
      const migratedAssets = legacyParsed.assets.map((asset): Asset => {
        const currentValue = asset.valorPosicao ?? asset.currentValue ?? 0;
        return {
          ...asset,
          nomeExibicao:          asset.nomeExibicao ?? asset.name,
          tipo:                  asset.tipo ?? 'outro',
          valorPosicao:          currentValue,
          currentValue,
          isentoIR:              asset.isentoIR ?? false,
          moeda:                 asset.moeda ?? 'BRL',
          dataUltimaAtualizacao: asset.dataUltimaAtualizacao ?? asset.createdAt ?? new Date().toISOString(),
          origemAtualizacao:     asset.origemAtualizacao ?? 'manual',
          modoMetaAtivo:         asset.modoMetaAtivo ?? asset.idealTargetMode ?? 'score',
          valorMetaAtivo:        asset.valorMetaAtivo ?? asset.idealTargetValue ?? 1,
        };
      });

      const mainData = {
        users: defaultUsers,
        currentUserId: null,
        clients: legacyParsed.clients,
        strategies: legacyParsed.strategies,
        subStrategies: legacyParsed.subStrategies,
        assets: migratedAssets,
        assetMovements: legacyParsed.assetMovements,
        irBrackets: legacyParsed.irBrackets?.length ? legacyParsed.irBrackets : defaultData.irBrackets,
        draftNotes: legacyParsed.draftNotes,
        selectedClientId: legacyParsed.selectedClientId,
      };

      // Salva no localStorage v3
      try { localStorage.setItem(STORAGE_KEY_MAIN, JSON.stringify(mainData)); } catch {}

      // Salva Renda Fixa no backup de Chunks
      if (legacyParsed.rendasFixasReferencia?.length) {
        saveRfToLocalStorageChunks(legacyParsed.rendasFixasReferencia);
        idbSet('rendasFixasReferencia', legacyParsed.rendasFixasReferencia);
      }

      // Inicia a gravação dos catálogos antigos no IndexedDB
      if (legacyParsed.cdiRates?.length) idbSet('cdiRates', legacyParsed.cdiRates);
      if (legacyParsed.anbimaHolidays?.length) idbSet('anbimaHolidays', legacyParsed.anbimaHolidays);
      if (legacyParsed.rvPrices?.length) idbSet('rvPrices', legacyParsed.rvPrices);
      if (legacyParsed.fundosReferencia?.length) idbSet('fundosReferencia', legacyParsed.fundosReferencia);

      return {
        ...mainData,
        cdiRates: legacyParsed.cdiRates ?? [],
        anbimaHolidays: legacyParsed.anbimaHolidays ?? [],
        rvPrices: legacyParsed.rvPrices ?? [],
        fundosReferencia: legacyParsed.fundosReferencia ?? [],
        rendasFixasReferencia: legacyParsed.rendasFixasReferencia ?? [],
      };
    }

    return defaultData;
  } catch {
    return defaultData;
  }
}

/** 
 * Persiste os dados de forma híbrida e seletiva Multi-Camada (Multi-Tier):
 * Core no localStorage.
 * Renda Fixa em IndexedDB (Tier 1) + Backup Chunked no localStorage (Tier 2).
 */
function saveData(next: StoreData, prev?: StoreData): void {
  try {
    const mainChanged = !prev ||
      next.users !== prev.users ||
      next.currentUserId !== prev.currentUserId ||
      next.clients !== prev.clients ||
      next.strategies !== prev.strategies ||
      next.subStrategies !== prev.subStrategies ||
      next.assets !== prev.assets ||
      next.assetMovements !== prev.assetMovements ||
      next.irBrackets !== prev.irBrackets ||
      next.draftNotes !== prev.draftNotes ||
      next.selectedClientId !== prev.selectedClientId;

    if (mainChanged) {
      const mainData = {
        users: next.users,
        currentUserId: next.currentUserId,
        clients: next.clients,
        strategies: next.strategies,
        subStrategies: next.subStrategies,
        assets: next.assets,
        assetMovements: next.assetMovements,
        irBrackets: next.irBrackets,
        draftNotes: next.draftNotes,
        selectedClientId: next.selectedClientId,
      };
      localStorage.setItem(STORAGE_KEY_MAIN, JSON.stringify(mainData));
    }

    // Bancos de Dados Globais no IndexedDB + Backup Chunked de Renda Fixa
    if (!prev || next.rendasFixasReferencia !== prev.rendasFixasReferencia) {
      idbSet('rendasFixasReferencia', next.rendasFixasReferencia);
      saveRfToLocalStorageChunks(next.rendasFixasReferencia);
    }
    if (!prev || next.cdiRates !== prev.cdiRates) {
      idbSet('cdiRates', next.cdiRates);
    }
    if (!prev || next.anbimaHolidays !== prev.anbimaHolidays) {
      idbSet('anbimaHolidays', next.anbimaHolidays);
    }
    if (!prev || next.rvPrices !== prev.rvPrices) {
      idbSet('rvPrices', next.rvPrices);
    }
    if (!prev || next.fundosReferencia !== prev.fundosReferencia) {
      idbSet('fundosReferencia', next.fundosReferencia);
    }
  } catch {
    // Erro silencioso
  }
}

// =============================================================================
// 3. Helpers internos
// =============================================================================

/** Arredonda um valor monetário para 2 casas decimais */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Normaliza uma string para comparação de duplicatas:
 * remove espaços e converte para maiúsculas.
 * NÃO deve ser usada para armazenar — apenas para comparar.
 */
function normalizeForComparison(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

// =============================================================================
// 4. Singleton + sistema de listeners
// =============================================================================

/**
 * Estado singleton: existe uma única instância em memória por sessão.
 * Isso evita inconsistências entre múltiplos componentes.
 */
let storeData: StoreData = loadData();

/** Conjunto de callbacks registrados pelos componentes via useEffect */
const listeners: Set<() => void> = new Set();

/** Notifica todos os componentes ouvintes para re-renderizar */
function notify(): void {
  listeners.forEach(fn => fn());
}

/**
 * Atualiza o estado global, persiste no storage híbrido e notifica os listeners.
 * @param updater Função pura que recebe o estado atual e retorna o novo estado
 */
function updateStore(updater: (prev: StoreData) => StoreData): void {
  const prevData = storeData;
  storeData = updater(storeData);
  saveData(storeData, prevData);
  notify();
}

// Flag para garantir que o IndexedDB só carregue uma vez no boot
let idbInitialized = false;

// =============================================================================
// 5. Hook `useStore`
// =============================================================================

export function useStore() {
  // Força re-render quando o store notifica uma mudança
  const [, rerender] = useState(0);

  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);

    if (!idbInitialized) {
      idbInitialized = true;
      Promise.all([
        idbGet<CdiRate[]>('cdiRates', []),
        idbGet<AnbimaHoliday[]>('anbimaHolidays', []),
        idbGet<RendaVariavelPrice[]>('rvPrices', []),
        idbGet<FundoReferencia[]>('fundosReferencia', []),
        idbGet<RendaFixaReferencia[]>('rendasFixasReferencia', []),
      ]).then(([cdi, holidays, rv, fundos, rf]) => {
        const currentRf = storeData.rendasFixasReferencia;
        // Se o IndexedDB tiver mais itens que o backup do localStorage, usa o IndexedDB.
        // Se o IndexedDB foi limpo pelo navegador, mantém o backup do localStorage e re-salva no IndexedDB!
        const bestRf = rf.length > currentRf.length ? rf : currentRf;
        if (bestRf.length > 0 && rf.length === 0) {
          idbSet('rendasFixasReferencia', bestRf);
        }

        storeData = {
          ...storeData,
          cdiRates: cdi.length ? cdi : storeData.cdiRates,
          anbimaHolidays: holidays.length ? holidays : storeData.anbimaHolidays,
          rvPrices: rv.length ? rv : storeData.rvPrices,
          fundosReferencia: fundos.length ? fundos : storeData.fundosReferencia,
          rendasFixasReferencia: bestRf,
        };
        notify();
      });
    }
        return () => { listeners.delete(fn); };
  }, []);

  // ---------------------------------------------------------------------------
  // USERS & MULTI-TENANT AUTHORIZATION (Cascata de Gerenciamento)
  // ---------------------------------------------------------------------------

  const currentUser = useMemo(() => {
    return storeData.users.find(u => u.id === storeData.currentUserId) ?? null;
  }, [storeData.currentUserId, storeData.users]);

  // Filtra clientes de acordo com a regra de permissão Multi-Tenant (Cascata de Gerenciamento)
  const activeClients = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'master_geral') {
      return storeData.clients; // Master Geral (Meros Capital) vê todos os clientes de todos os escritórios
    }
    if (currentUser.role === 'escritorio_master') {
      // Master do escritório vê todos os clientes daquele escritório específico
      return storeData.clients.filter(c => c.escritorioId === currentUser.escritorioId);
    }
    if (currentUser.role === 'assessor') {
      // Assessor vê os clientes especificamente vinculados a ele, ou clientes do escritório sem assessor atribuído
      return storeData.clients.filter(c => c.assessorId === currentUser.id || (c.escritorioId === currentUser.escritorioId && !c.assessorId));
    }
    if (currentUser.role === 'cliente_final') {
      // Cliente final vê apenas os IDs listados em allowedClientIds (sua conta e/ou do filho)
      return storeData.clients.filter(c => currentUser.allowedClientIds?.includes(c.id));
    }
    return [];
  }, [currentUser, storeData.clients]);

  const login = useCallback((userId: string) => {
    updateStore(s => ({ ...s, currentUserId: userId, selectedClientId: null }));
  }, []);

  const logout = useCallback(() => {
    updateStore(s => ({ ...s, currentUserId: null, selectedClientId: null }));
  }, []);

  const addUser = useCallback((data: Omit<AppUser, 'id' | 'createdAt'>) => {
    const user: AppUser = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    updateStore(s => ({ ...s, users: [...s.users, user] }));
    return user;
  }, []);

  const updateUser = useCallback((id: string, data: Partial<AppUser>) => {
    updateStore(s => ({
      ...s,
      users: s.users.map(u => u.id === id ? { ...u, ...data } : u),
    }));
  }, []);

  const deleteUser = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      users: s.users.filter(u => u.id !== id),
      currentUserId: s.currentUserId === id ? null : s.currentUserId,
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // CLIENTS
  // ---------------------------------------------------------------------------

  /** Cadastra um novo cliente */
  const addClient = useCallback((data: Omit<Client, 'id' | 'createdAt'>) => {
    const client: Client = { 
      ...data, 
      id: uuidv4(), 
      createdAt: new Date().toISOString(),
      escritorioId: currentUser?.escritorioId || data.escritorioId,
      assessorId: currentUser?.role === 'assessor' ? currentUser.id : data.assessorId,
    };
    updateStore(s => ({ ...s, clients: [...s.clients, client] }));
    return client;
  }, [currentUser]);

  /** Atualiza campos de um cliente existente */
  const updateClient = useCallback((id: string, data: Partial<Omit<Client, 'id'>>) => {
    updateStore(s => ({
      ...s,
      clients: s.clients.map(c => (c.id === id ? { ...c, ...data } : c)),
    }));
  }, []);

  /**
   * Remove um cliente e todos os dados relacionados:
   * strategies, subStrategies, assets, movements e draftNotes
   */
  const deleteClient = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      clients:         s.clients.filter(c => c.id !== id),
      strategies:      s.strategies.filter(x => x.clientId !== id),
      subStrategies:   s.subStrategies.filter(x =>
        s.strategies.find(st => st.id === x.strategyId && st.clientId !== id) === undefined
          ? true
          : false
      ),
      assets:          s.assets.filter(x => x.clientId !== id),
      assetMovements:  s.assetMovements.filter(x => x.clientId !== id),
      draftNotes:      s.draftNotes.filter(x => x.clientId !== id),
      selectedClientId: s.selectedClientId === id ? null : s.selectedClientId,
    }));
  }, []);

  /** Define o cliente ativo no contexto da aplicação */
  const selectClient = useCallback((id: string | null) => {
    updateStore(s => ({ ...s, selectedClientId: id }));
  }, []);

  // ---------------------------------------------------------------------------
  // STRATEGIES
  // ---------------------------------------------------------------------------

  /** Adiciona uma estratégia ao cliente, respeitando a ordem */
  const addStrategy = useCallback((clientId: string, data: Omit<Strategy, 'id' | 'clientId' | 'order'>) => {
    let created: Strategy | null = null;
    updateStore(s => {
      const maxOrder = s.strategies
        .filter(x => x.clientId === clientId)
        .reduce((m, x) => Math.max(m, x.order), -1);
      const strategy: Strategy = { ...data, id: uuidv4(), clientId, order: maxOrder + 1 };
      created = strategy;
      return { ...s, strategies: [...s.strategies, strategy] };
    });
    return created;
  }, []);

  /** Atualiza campos de uma estratégia */
  const updateStrategy = useCallback((id: string, data: Partial<Omit<Strategy, 'id'>>) => {
    updateStore(s => ({
      ...s,
      strategies: s.strategies.map(x => (x.id === id ? { ...x, ...data } : x)),
    }));
  }, []);

  /** Remove uma estratégia e desvincula assets relacionados */
  const deleteStrategy = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      strategies:    s.strategies.filter(x => x.id !== id),
      subStrategies: s.subStrategies.filter(x => x.strategyId !== id),
      assets:        s.assets.map(a =>
        a.strategyId === id
          ? { ...a, strategyId: undefined, subStrategyId: undefined }
          : a
      ),
    }));
  }, []);

  /** Reordena as estratégias de um cliente conforme array de IDs */
  const reorderStrategies = useCallback((clientId: string, orderedIds: string[]) => {
    updateStore(s => ({
      ...s,
      strategies: s.strategies.map(x => {
        const idx = orderedIds.indexOf(x.id);
        return x.clientId === clientId && idx >= 0 ? { ...x, order: idx } : x;
      }),
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // SUB-STRATEGIES
  // ---------------------------------------------------------------------------

  /** Adiciona uma sub-estratégia à estratégia informada */
  const addSubStrategy = useCallback((strategyId: string, data: Omit<SubStrategy, 'id' | 'strategyId' | 'order'>) => {
    let created: SubStrategy | null = null;
    updateStore(s => {
      const maxOrder = s.subStrategies
        .filter(x => x.strategyId === strategyId)
        .reduce((m, x) => Math.max(m, x.order), -1);
      const sub: SubStrategy = { ...data, id: uuidv4(), strategyId, order: maxOrder + 1 };
      created = sub;
      return { ...s, subStrategies: [...s.subStrategies, sub] };
    });
    return created;
  }, []);

  /** Atualiza campos de uma sub-estratégia */
  const updateSubStrategy = useCallback((id: string, data: Partial<Omit<SubStrategy, 'id'>>) => {
    updateStore(s => ({
      ...s,
      subStrategies: s.subStrategies.map(x => (x.id === id ? { ...x, ...data } : x)),
    }));
  }, []);

  /** Remove uma sub-estratégia e desvincula assets relacionados */
  const deleteSubStrategy = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      subStrategies: s.subStrategies.filter(x => x.id !== id),
      assets:        s.assets.map(a =>
        a.subStrategyId === id ? { ...a, subStrategyId: undefined } : a
      ),
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // ASSETS
  // ---------------------------------------------------------------------------

  /** Cadastra um novo ativo, calculando automaticamente o valorPosicao */
  const addAsset = useCallback((
    clientId: string,
    data: Partial<Omit<Asset, 'id' | 'clientId' | 'createdAt'>> & { name: string }
  ) => {
    updateStore(s => {
      const maxOrder = s.assets
        .filter(x => x.clientId === clientId)
        .reduce((m, x) => Math.max(m, x.order), -1);

      const now = new Date().toISOString();
      const providedValue    = data.valorPosicao ?? data.currentValue ?? 0;
      const positionValueRaw = (data.quantidade !== undefined && data.precoUnitario !== undefined)
        ? data.quantidade * data.precoUnitario
        : providedValue;
      const positionValue = roundMoney(positionValueRaw);

      const asset: Asset = {
        ...data,
        id:                    uuidv4(),
        clientId,
        order:                 maxOrder + 1,
        createdAt:             now,
        name:                  data.name,
        nomeExibicao:          data.nomeExibicao || data.name,
        tipo:                  data.tipo || 'outro',
        valorPosicao:          positionValue,
        currentValue:          positionValue,
        isentoIR:              data.isentoIR ?? false,
        moeda:                 data.moeda ?? 'BRL',
        dataUltimaAtualizacao: data.dataUltimaAtualizacao ?? now,
        origemAtualizacao:     data.origemAtualizacao ?? 'manual',
        modoMetaAtivo:         data.modoMetaAtivo ?? data.idealTargetMode ?? 'score',
        valorMetaAtivo:        data.valorMetaAtivo ?? data.idealTargetValue ?? 1,
      };

      return { ...s, assets: [...s.assets, asset] };
    });
  }, []);

  /** Atualiza campos de um ativo, recalculando valorPosicao se necessário */
  const updateAsset = useCallback((id: string, data: Partial<Omit<Asset, 'id'>>) => {
    updateStore(s => ({
      ...s,
      assets: s.assets.map(x => {
        if (x.id !== id) return x;

        const merged    = { ...x, ...data } as Asset;
        const valueRaw  = (merged.quantidade !== undefined && merged.precoUnitario !== undefined)
          ? merged.quantidade * merged.precoUnitario
          : merged.valorPosicao;
        const value = roundMoney(valueRaw ?? 0);

        return {
          ...merged,
          nomeExibicao:          merged.nomeExibicao || merged.name,
          valorPosicao:          value,
          currentValue:          value,
          dataUltimaAtualizacao: merged.dataUltimaAtualizacao || new Date().toISOString(),
          modoMetaAtivo:         merged.modoMetaAtivo ?? merged.idealTargetMode ?? 'score',
          valorMetaAtivo:        merged.valorMetaAtivo ?? merged.idealTargetValue ?? 1,
        };
      }),
    }));
  }, []);

  /** Remove um ativo e todos os seus movimentos e rascunhos associados */
  const deleteAsset = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      assets:         s.assets.filter(x => x.id !== id),
      assetMovements: s.assetMovements.filter(x => x.assetId !== id),
      draftNotes:     s.draftNotes.filter(x => x.id !== id),
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // ASSET MOVEMENTS
  // ---------------------------------------------------------------------------

  /** Registra um novo movimento (compra, venda, etc.) para um ativo */
  const addAssetMovement = useCallback((data: Omit<AssetMovement, 'id'>) => {
    const movement: AssetMovement = { ...data, id: uuidv4() };
    updateStore(s => ({ ...s, assetMovements: [...s.assetMovements, movement] }));
    return movement;
  }, []);

  /** Atualiza campos de um movimento existente */
  const updateAssetMovement = useCallback((id: string, data: Partial<Omit<AssetMovement, 'id'>>) => {
    updateStore(s => ({
      ...s,
      assetMovements: s.assetMovements.map(m => (m.id === id ? { ...m, ...data } : m)),
    }));
  }, []);

  /** Remove um movimento pelo ID */
  const deleteAssetMovement = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      assetMovements: s.assetMovements.filter(m => m.id !== id),
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // CDI RATES
  // ---------------------------------------------------------------------------

  /**
   * Substitui toda a série histórica de taxas CDI.
   * Recalcula o índice acumulado em ordem cronológica.
   */
  const setCdiRates = useCallback((rates: Omit<CdiRate, 'id' | 'indiceAcumulado'>[]) => {
    const sorted = [...rates].sort((a, b) => a.data.localeCompare(b.data));
    let acc = 1;
    const withIndex: CdiRate[] = sorted.map(rate => {
      const decimal = rate.taxaDecimal || rate.taxaDiaria / 100;
      acc *= 1 + decimal;
      return { ...rate, id: uuidv4(), taxaDecimal: decimal, indiceAcumulado: acc };
    });
    updateStore(s => ({ ...s, cdiRates: withIndex }));
  }, []);

  /**
   * Adiciona ou substitui uma taxa CDI por data.
   * Recalcula o índice acumulado de toda a série.
   */
  const addCdiRate = useCallback((rate: Omit<CdiRate, 'id' | 'indiceAcumulado'>) => {
    const next = [
      ...storeData.cdiRates.map(({ data, taxaDiaria, taxaDecimal }) => ({ data, taxaDiaria, taxaDecimal })),
      rate,
    ];
    const byDate = new Map<string, Omit<CdiRate, 'id' | 'indiceAcumulado'>>();
    next.forEach(item => byDate.set(item.data, item));
    const sorted = Array.from(byDate.values()).sort((a, b) => a.data.localeCompare(b.data));

    let acc = 1;
    const withIndex: CdiRate[] = sorted.map(item => {
      const decimal = item.taxaDecimal || item.taxaDiaria / 100;
      acc *= 1 + decimal;
      return { ...item, id: uuidv4(), taxaDecimal: decimal, indiceAcumulado: acc };
    });

    updateStore(s => ({ ...s, cdiRates: withIndex }));
  }, []);

  // ---------------------------------------------------------------------------
  // IR BRACKETS
  // ---------------------------------------------------------------------------

  /** Substitui a tabela regressiva de alíquotas de IR */
  const setIrBrackets = useCallback((brackets: IrBracket[]) => {
    updateStore(s => ({ ...s, irBrackets: brackets }));
  }, []);

  // ---------------------------------------------------------------------------
  // ANBIMA HOLIDAYS
  // ---------------------------------------------------------------------------

  /**
   * Substitui toda a lista de feriados ANBIMA.
   * Itens sem data são ignorados; duplicatas por data são descartadas.
   */
  const setAnbimaHolidays = useCallback((holidays: Omit<AnbimaHoliday, 'id'>[]) => {
    const byDate = new Map<string, Omit<AnbimaHoliday, 'id'>>();
    holidays.forEach(item => { if (item.data) byDate.set(item.data, item); });
    const sorted = Array.from(byDate.values()).sort((a, b) => a.data.localeCompare(b.data));
    updateStore(s => ({
      ...s,
      anbimaHolidays: sorted.map(item => ({ ...item, id: uuidv4() })),
    }));
  }, []);

  /** Atualiza um feriado ANBIMA e mantém a lista ordenada por data */
  const updateAnbimaHoliday = useCallback((id: string, data: Partial<Omit<AnbimaHoliday, 'id'>>) => {
    updateStore(s => ({
      ...s,
      anbimaHolidays: s.anbimaHolidays
        .map(holiday => (holiday.id === id ? { ...holiday, ...data } : holiday))
        .sort((a, b) => a.data.localeCompare(b.data)),
    }));
  }, []);

  /** Remove um feriado ANBIMA pelo ID */
  const deleteAnbimaHoliday = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      anbimaHolidays: s.anbimaHolidays.filter(holiday => holiday.id !== id),
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // RENDA VARIÁVEL PRICES
  // ---------------------------------------------------------------------------

  /** Substitui toda a lista de preços de renda variável */
  const setRvPrices = useCallback((prices: RendaVariavelPrice[]) => {
    updateStore(s => ({ ...s, rvPrices: prices }));
  }, []);

  /** Adiciona um preço de renda variável */
  const addRvPrice = useCallback((data: Omit<RendaVariavelPrice, 'id'>) => {
    const price: RendaVariavelPrice = { ...data, id: uuidv4() };
    updateStore(s => ({ ...s, rvPrices: [...s.rvPrices, price] }));
    return price;
  }, []);

  /** Atualiza campos de um preço de renda variável */
  const updateRvPrice = useCallback((id: string, data: Partial<Omit<RendaVariavelPrice, 'id'>>) => {
    updateStore(s => ({
      ...s,
      rvPrices: s.rvPrices.map(p => (p.id === id ? { ...p, ...data } : p)),
    }));
  }, []);

  /** Remove um preço de renda variável pelo ID */
  const deleteRvPrice = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      rvPrices: s.rvPrices.filter(p => p.id !== id),
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // FUNDOS DE REFERÊNCIA
  // ---------------------------------------------------------------------------

  /**
   * Cadastra um fundo de referência.
   * Lança erro se já existir um fundo com o mesmo CNPJ.
   */
  const addFundoReferencia = useCallback((data: Omit<FundoReferencia, 'id' | 'createdAt' | 'cnpjNumerico'>) => {
    const cnpjNumerico = data.cnpj.replace(/\D/g, '');
    const isDuplicate  = storeData.fundosReferencia.some(f => f.cnpjNumerico === cnpjNumerico);
    if (isDuplicate) throw new Error('Fundo com este CNPJ já cadastrado');

    const created: FundoReferencia = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      cnpjNumerico,
    };
    updateStore(s => ({ ...s, fundosReferencia: [...s.fundosReferencia, created] }));
    return created;
  }, []);

  /** Atualiza campos de um fundo de referência, recalculando cnpjNumerico se necessário */
  const updateFundoReferencia = useCallback((id: string, data: Partial<Omit<FundoReferencia, 'id'>>) => {
    updateStore(s => ({
      ...s,
      fundosReferencia: s.fundosReferencia.map(fundo => {
        if (fundo.id !== id) return fundo;
        const nextCnpj         = data.cnpj ?? fundo.cnpj;
        const nextCnpjNumerico = nextCnpj.replace(/\D/g, '');
        return { ...fundo, ...data, cnpjNumerico: nextCnpjNumerico };
      }),
    }));
  }, []);

  /** Remove um fundo de referência pelo ID */
  const deleteFundoReferencia = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      fundosReferencia: s.fundosReferencia.filter(f => f.id !== id),
    }));
  }, []);

  /** Substitui toda a lista de fundos de referência (ex: limpar tudo) */
  const setFundosReferencia = useCallback((fundos: FundoReferencia[]) => {
  updateStore(s => ({ ...s, fundosReferencia: fundos }));
  }, []);

  /**
   * Importação em lote de fundos de referência (upsert por CNPJ).
   * Se já existir um fundo com o mesmo CNPJ, atualiza; caso contrário, insere.
   */
  const bulkUpsertFundoReferencia = useCallback((items: Omit<FundoReferencia, 'id' | 'createdAt' | 'cnpjNumerico'>[]) => {
    updateStore(s => {
      const nextRefs = [...s.fundosReferencia];

      items.forEach(item => {
        const cnpjNumerico  = item.cnpj.replace(/\D/g, '');
        const existingIndex = nextRefs.findIndex(f => f.cnpjNumerico === cnpjNumerico);

        if (existingIndex >= 0) {
          nextRefs[existingIndex] = { ...nextRefs[existingIndex], ...item, cnpjNumerico };
        } else {
          nextRefs.push({ ...item, id: uuidv4(), createdAt: new Date().toISOString(), cnpjNumerico });
        }
      });

      return { ...s, fundosReferencia: nextRefs };
    });
  }, []);

  /** Atualiza a cota atual de um fundo de referência */
  const updateCotaFundo = useCallback((
    id: string,
    cotaAtual: number,
    dataCota: string,
    patrimonioLiquido?: number
  ) => {
    updateStore(s => ({
      ...s,
      fundosReferencia: s.fundosReferencia.map(fundo => {
        if (fundo.id !== id) return fundo;
        return { ...fundo, cotaAtual, dataCota, patrimonioLiquido, atualizadoEm: new Date().toISOString() };
      }),
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // RENDAS FIXAS DE REFERÊNCIA
  // ---------------------------------------------------------------------------

  /**
   * Cadastra um título de renda fixa de referência.
   *
   * Regras:
   * - `codigoCompleto` é obrigatório e deve ser único.
   * - A unicidade é verificada de forma case-insensitive e ignorando espaços.
   * - O valor é armazenado exatamente como fornecido (sem forçar maiúsculas),
   *   preservando acentos, espaços e capitalização original da planilha.
   * - O campo `codigo` (curto) é normalizado para maiúsculas sem espaços.
   */
  const addRendaFixaReferencia = useCallback((data: Omit<RendaFixaReferencia, 'id' | 'createdAt'>) => {
    if (!data.codigoCompleto?.trim()) {
      throw new Error('Código Completo é obrigatório');
    }

    // Normaliza apenas para comparação de duplicata — não altera o valor salvo
    const codigoCompletoParaSalvar  = data.codigoCompleto.trim();
    const codigoCompletoNormalizado = normalizeForComparison(codigoCompletoParaSalvar);

    const isDuplicate = storeData.rendasFixasReferencia.some(r =>
      normalizeForComparison(r.codigoCompleto || '') === codigoCompletoNormalizado
    );
    if (isDuplicate) throw new Error('Código Completo já cadastrado');

    const created: RendaFixaReferencia = {
      ...data,
      id:              uuidv4(),
      createdAt:       new Date().toISOString(),
      codigo:          data.codigo.toUpperCase().replace(/\s+/g, ''), // código curto: sempre normalizado
      codigoCompleto:  codigoCompletoParaSalvar,                      // código longo: preservado como veio
    };

    updateStore(s => ({ ...s, rendasFixasReferencia: [...s.rendasFixasReferencia, created] }));
    return created;
  }, []);

  /**
   * Atualiza campos de um título de renda fixa de referência.
   * - `codigo` (curto) continua sendo normalizado para maiúsculas sem espaços.
   * - `codigoCompleto` é preservado como fornecido (trim apenas).
   */
  const updateRendaFixaReferencia = useCallback((id: string, data: Partial<Omit<RendaFixaReferencia, 'id'>>) => {
    updateStore(s => ({
      ...s,
      rendasFixasReferencia: s.rendasFixasReferencia.map(ref => {
        if (ref.id !== id) return ref;

        const nextCodigo         = data.codigo
          ? data.codigo.toUpperCase().replace(/\s+/g, '')  // código curto: normalizado
          : ref.codigo;

        const nextCodigoCompleto = data.codigoCompleto
          ? data.codigoCompleto.trim()                      // código longo: apenas trim
          : ref.codigoCompleto;

        return { ...ref, ...data, codigo: nextCodigo, codigoCompleto: nextCodigoCompleto };
      }),
    }));
  }, []);

  /** Remove um título de renda fixa de referência pelo ID */
  const deleteRendaFixaReferencia = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      rendasFixasReferencia: s.rendasFixasReferencia.filter(r => r.id !== id),
    }));
  }, []);

  /** Substitui toda a lista de rendas fixas de referência (ex: limpar tudo) */
const setRendasFixasReferencia = useCallback((refs: RendaFixaReferencia[]) => {
  updateStore(s => ({ ...s, rendasFixasReferencia: refs }));
  }, []);

  /**
   * Importação em lote de títulos de renda fixa (upsert por CodigoCompleto).
   *
   * Regras:
   * - Itens sem `codigoCompleto` são ignorados.
   * - A busca de duplicatas é case-insensitive e ignora espaços.
   * - O `codigoCompleto` é armazenado exatamente como fornecido (apenas trim),
   *   preservando acentos, espaços e capitalização original da planilha.
   * - O `codigo` (curto) é normalizado para maiúsculas sem espaços.
   */
  const bulkUpsertRendaFixaReferencia = useCallback((items: Omit<RendaFixaReferencia, 'id' | 'createdAt'>[]) => {
    updateStore(s => {
      const nextRefs = [...s.rendasFixasReferencia];

      items.forEach(item => {
        // Ignora itens sem codigoCompleto
        if (!item.codigoCompleto?.trim()) return;

        const codigoCompletoParaSalvar  = item.codigoCompleto.trim();       // valor preservado
        const codigoCompletoNormalizado = normalizeForComparison(codigoCompletoParaSalvar); // para busca
        const codigoNormalizado         = item.codigo.toUpperCase().replace(/\s+/g, '');    // código curto

        const existingIndex = nextRefs.findIndex(r =>
          normalizeForComparison(r.codigoCompleto || '') === codigoCompletoNormalizado
        );

        if (existingIndex >= 0) {
          // Atualiza registro existente preservando o codigoCompleto original
          nextRefs[existingIndex] = {
            ...nextRefs[existingIndex],
            ...item,
            codigo:         codigoNormalizado,
            codigoCompleto: codigoCompletoParaSalvar,
          };
        } else {
          // Insere novo registro
          nextRefs.push({
            ...item,
            id:             uuidv4(),
            createdAt:      new Date().toISOString(),
            codigo:         codigoNormalizado,
            codigoCompleto: codigoCompletoParaSalvar,
          });
        }
      });

      return { ...s, rendasFixasReferencia: nextRefs };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // DRAFT NOTES
  // ---------------------------------------------------------------------------

  /** Cria ou atualiza um rascunho de nota para um ativo de um cliente */
  const setDraftNote = useCallback((id: string, clientId: string, note: string, value?: number) => {
    updateStore(s => {
      const existing = s.draftNotes.find(x => x.id === id && x.clientId === clientId);
      if (existing) {
        return {
          ...s,
          draftNotes: s.draftNotes.map(x =>
            x.id === id && x.clientId === clientId ? { ...x, note, value } : x
          ),
        };
      }
      return { ...s, draftNotes: [...s.draftNotes, { id, clientId, note, value }] };
    });
  }, []);

  /** Busca um rascunho de nota por ID e cliente (leitura direta do singleton) */
  const getDraftNote = useCallback((id: string, clientId: string): DraftNote | undefined => {
    return storeData.draftNotes.find(x => x.id === id && x.clientId === clientId);
  }, []);

    // ---------------------------------------------------------------------------
  // Retorno do hook — estado + actions
  // ---------------------------------------------------------------------------

  return {
    // ── Estado & Multi-Tenant ───────────────────────────────────────────────
    users:                   storeData.users,
    currentUser,
    activeClients,
    clients:                 storeData.clients,
    strategies:              storeData.strategies,
    subStrategies:           storeData.subStrategies,
    assets:                  storeData.assets,
    assetMovements:          storeData.assetMovements,
    cdiRates:                storeData.cdiRates,
    irBrackets:              storeData.irBrackets,
    anbimaHolidays:          storeData.anbimaHolidays,
    draftNotes:              storeData.draftNotes,
    rvPrices:                storeData.rvPrices,
    fundosReferencia:        storeData.fundosReferencia,
    rendasFixasReferencia:   storeData.rendasFixasReferencia,
    selectedClientId:        storeData.selectedClientId,
    selectedClient:          activeClients.find(c => c.id === storeData.selectedClientId) ?? null,

    // ── User & Auth actions ──────────────────────────────────────────────────
    login,
    logout,
    addUser,
    updateUser,
    deleteUser,

    // ── Client actions ───────────────────────────────────────────────────────
    addClient,
    updateClient,
    deleteClient,
    selectClient,

    // ── Strategy actions ─────────────────────────────────────────────────────
    addStrategy,
    updateStrategy,
    deleteStrategy,
    reorderStrategies,

    // ── SubStrategy actions ──────────────────────────────────────────────────
    addSubStrategy,
    updateSubStrategy,
    deleteSubStrategy,

    // ── Asset actions ────────────────────────────────────────────────────────
    addAsset,
    updateAsset,
    deleteAsset,
    addAssetMovement,
    updateAssetMovement,
    deleteAssetMovement,

    // ── CDI / IR / Feriados ──────────────────────────────────────────────────
    setCdiRates,
    addCdiRate,
    setIrBrackets,
    setAnbimaHolidays,
    updateAnbimaHoliday,
    deleteAnbimaHoliday,

    // ── Renda Variável Prices ────────────────────────────────────────────────
    setRvPrices,
    addRvPrice,
    updateRvPrice,
    deleteRvPrice,

    // ── Fundos de Referência ─────────────────────────────────────────────────
    addFundoReferencia,
    updateFundoReferencia,
    deleteFundoReferencia,
    setFundosReferencia,
    bulkUpsertFundoReferencia,
    updateCotaFundo,

    // ── Rendas Fixas de Referência ───────────────────────────────────────────
    addRendaFixaReferencia,
    updateRendaFixaReferencia,
    deleteRendaFixaReferencia,
    setRendasFixasReferencia,
    bulkUpsertRendaFixaReferencia,

    // ── Draft Notes ──────────────────────────────────────────────────────────
    setDraftNote,
    getDraftNote,
  };
}
