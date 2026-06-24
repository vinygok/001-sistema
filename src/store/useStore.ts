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

import { useState, useEffect, useCallback } from 'react';
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
} from '../types';

// Chave usada para persistência no localStorage
const STORAGE_KEY = 'investment_portfolio_v1';

/** Formato completo dos dados armazenados */
interface StoreData {
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
// 2. Estado inicial e persistência (localStorage)
// =============================================================================

/** Valores padrão para um store vazio (ex: primeiro acesso) */
const defaultData: StoreData = {
  clients: [],
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

/**
 * Carrega os dados do localStorage e aplica migrações necessárias
 * para garantir compatibilidade com versões anteriores do schema.
 */
function loadData(): StoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;

    const parsed = { ...defaultData, ...JSON.parse(raw) } as StoreData;

    // Migração de assets: garante que campos novos existam em registros antigos
    const migratedAssets = parsed.assets.map((asset): Asset => {
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

    return {
      ...parsed,
      assets:                  migratedAssets,
      assetMovements:          parsed.assetMovements          ?? [],
      cdiRates:                parsed.cdiRates                ?? [],
      irBrackets:              parsed.irBrackets?.length ? parsed.irBrackets : defaultData.irBrackets,
      anbimaHolidays:          parsed.anbimaHolidays          ?? [],
      rvPrices:                parsed.rvPrices                ?? [],
      fundosReferencia:        parsed.fundosReferencia        ?? [],
      rendasFixasReferencia:   parsed.rendasFixasReferencia   ?? [],
    };
  } catch {
    return defaultData;
  }
}

/** Persiste os dados no localStorage (erros silenciosos para não travar a UI) */
function saveData(data: StoreData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Sem ação — pode ocorrer em modo privado com storage cheio
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
 * Atualiza o estado global, persiste no localStorage e notifica os listeners.
 * @param updater Função pura que recebe o estado atual e retorna o novo estado
 */
function updateStore(updater: (prev: StoreData) => StoreData): void {
  storeData = updater(storeData);
  saveData(storeData);
  notify();
}

// =============================================================================
// 5. Hook `useStore`
// =============================================================================

export function useStore() {
  // Força re-render quando o store notifica uma mudança
  const [, rerender] = useState(0);

  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  // ---------------------------------------------------------------------------
  // CLIENTS
  // ---------------------------------------------------------------------------

  /** Cadastra um novo cliente */
  const addClient = useCallback((data: Omit<Client, 'id' | 'createdAt'>) => {
    const client: Client = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    updateStore(s => ({ ...s, clients: [...s.clients, client] }));
    return client;
  }, []);

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
    // ── Estado ──────────────────────────────────────────────────────────────
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
    selectedClient:          storeData.clients.find(c => c.id === storeData.selectedClientId) ?? null,

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
    bulkUpsertFundoReferencia,
    updateCotaFundo,

    // ── Rendas Fixas de Referência ───────────────────────────────────────────
    addRendaFixaReferencia,
    updateRendaFixaReferencia,
    deleteRendaFixaReferencia,
    bulkUpsertRendaFixaReferencia,

    // ── Draft Notes ──────────────────────────────────────────────────────────
    setDraftNote,
    getDraftNote,
  };
}
