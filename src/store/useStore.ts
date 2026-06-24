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

const STORAGE_KEY = 'investment_portfolio_v1';

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

const defaultData: StoreData = {
  clients: [],
  strategies: [],
  subStrategies: [],
  assets: [],
  assetMovements: [],
  cdiRates: [],
  irBrackets: [
    { id: 'ir-180', diasDe: 0, diasAte: 180, aliquota: 22.5 },
    { id: 'ir-360', diasDe: 181, diasAte: 360, aliquota: 20 },
    { id: 'ir-720', diasDe: 361, diasAte: 720, aliquota: 17.5 },
    { id: 'ir-long', diasDe: 721, aliquota: 15 },
  ],
  anbimaHolidays: [],
  draftNotes: [],
  rvPrices: [],
  fundosReferencia: [],
  rendasFixasReferencia: [],
  selectedClientId: null,
};

function loadData(): StoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = { ...defaultData, ...JSON.parse(raw) } as StoreData;
      const migratedAssets = parsed.assets.map((asset) => {
        const currentValue = asset.valorPosicao ?? asset.currentValue ?? 0;
        const nomeExibicao = asset.nomeExibicao ?? asset.name;
        return {
          ...asset,
          nomeExibicao,
          tipo: asset.tipo ?? 'outro',
          valorPosicao: currentValue,
          currentValue,
          isentoIR: asset.isentoIR ?? false,
          moeda: asset.moeda ?? 'BRL',
          dataUltimaAtualizacao: asset.dataUltimaAtualizacao ?? asset.createdAt ?? new Date().toISOString(),
          origemAtualizacao: asset.origemAtualizacao ?? 'manual',
          modoMetaAtivo: asset.modoMetaAtivo ?? asset.idealTargetMode ?? 'score',
          valorMetaAtivo: asset.valorMetaAtivo ?? asset.idealTargetValue ?? 1,
        } as Asset;
      });
      return {
        ...parsed,
        assets: migratedAssets,
        assetMovements: parsed.assetMovements ?? [],
        cdiRates: parsed.cdiRates ?? [],
        irBrackets: parsed.irBrackets?.length ? parsed.irBrackets : defaultData.irBrackets,
        anbimaHolidays: parsed.anbimaHolidays ?? [],
        rvPrices: parsed.rvPrices ?? [],
        fundosReferencia: parsed.fundosReferencia ?? [],
        rendasFixasReferencia: parsed.rendasFixasReferencia ?? [],
      };
    }
  } catch {}
  return defaultData;
}

function saveData(data: StoreData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Singleton store with listeners
let storeData: StoreData = loadData();
const listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach(fn => fn());
}

function updateStore(updater: (prev: StoreData) => StoreData) {
  storeData = updater(storeData);
  saveData(storeData);
  notify();
}

export function useStore() {
  const [, rerender] = useState(0);

  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  // ---- Clients ----
  const addClient = useCallback((data: Omit<Client, 'id' | 'createdAt'>) => {
    const client: Client = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    updateStore(s => ({ ...s, clients: [...s.clients, client] }));
    return client;
  }, []);

  const updateClient = useCallback((id: string, data: Partial<Omit<Client, 'id'>>) => {
    updateStore(s => ({ ...s, clients: s.clients.map(c => c.id === id ? { ...c, ...data } : c) }));
  }, []);

  const deleteClient = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      clients: s.clients.filter(c => c.id !== id),
      strategies: s.strategies.filter(x => x.clientId !== id),
      subStrategies: s.subStrategies.filter(x => s.strategies.find(st => st.id === x.strategyId && st.clientId !== id) === undefined ? true : false),
      assets: s.assets.filter(x => x.clientId !== id),
      assetMovements: s.assetMovements.filter(x => x.clientId !== id),
      draftNotes: s.draftNotes.filter(x => x.clientId !== id),
      selectedClientId: s.selectedClientId === id ? null : s.selectedClientId,
    }));
  }, []);

  const selectClient = useCallback((id: string | null) => {
    updateStore(s => ({ ...s, selectedClientId: id }));
  }, []);

  // ---- Strategies ----
  const addStrategy = useCallback((clientId: string, data: Omit<Strategy, 'id' | 'clientId' | 'order'>) => {
    let created: Strategy | null = null;
    updateStore(s => {
      const maxOrder = s.strategies.filter(x => x.clientId === clientId).reduce((m, x) => Math.max(m, x.order), -1);
      const strategy: Strategy = { ...data, id: uuidv4(), clientId, order: maxOrder + 1 };
      created = strategy;
      return { ...s, strategies: [...s.strategies, strategy] };
    });
    return created;
  }, []);

  const updateStrategy = useCallback((id: string, data: Partial<Omit<Strategy, 'id' | 'clientId'>>) => {
    updateStore(s => ({ ...s, strategies: s.strategies.map(x => x.id === id ? { ...x, ...data } : x) }));
  }, []);

  const deleteStrategy = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      strategies: s.strategies.filter(x => x.id !== id),
      subStrategies: s.subStrategies.filter(x => x.strategyId !== id),
      assets: s.assets.map(a => a.strategyId === id ? { ...a, strategyId: undefined, subStrategyId: undefined } : a),
    }));
  }, []);

  const reorderStrategies = useCallback((clientId: string, orderedIds: string[]) => {
    updateStore(s => ({
      ...s,
      strategies: s.strategies.map(x => {
        const idx = orderedIds.indexOf(x.id);
        return x.clientId === clientId && idx >= 0 ? { ...x, order: idx } : x;
      }),
    }));
  }, []);

  // ---- SubStrategies ----
  const addSubStrategy = useCallback((strategyId: string, data: Omit<SubStrategy, 'id' | 'strategyId' | 'order'>) => {
    let created: SubStrategy | null = null;
    updateStore(s => {
      const maxOrder = s.subStrategies.filter(x => x.strategyId === strategyId).reduce((m, x) => Math.max(m, x.order), -1);
      const sub: SubStrategy = { ...data, id: uuidv4(), strategyId, order: maxOrder + 1 };
      created = sub;
      return { ...s, subStrategies: [...s.subStrategies, sub] };
    });
    return created;
  }, []);

  const updateSubStrategy = useCallback((id: string, data: Partial<Omit<SubStrategy, 'id' | 'strategyId'>>) => {
    updateStore(s => ({ ...s, subStrategies: s.subStrategies.map(x => x.id === id ? { ...x, ...data } : x) }));
  }, []);

  const deleteSubStrategy = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      subStrategies: s.subStrategies.filter(x => x.id !== id),
      assets: s.assets.map(a => a.subStrategyId === id ? { ...a, subStrategyId: undefined } : a),
    }));
  }, []);

  // ---- Assets ----
  const addAsset = useCallback((
    clientId: string,
    data: Partial<Omit<Asset, 'id' | 'clientId' | 'order' | 'createdAt'>> & { name: string }
  ) => {
    updateStore(s => {
      const maxOrder = s.assets.filter(x => x.clientId === clientId).reduce((m, x) => Math.max(m, x.order), -1);
      const now = new Date().toISOString();
      const providedValue = data.valorPosicao ?? data.currentValue ?? 0;
      const positionValueRaw = data.quantidade !== undefined && data.precoUnitario !== undefined
        ? data.quantidade * data.precoUnitario
        : providedValue;
      const positionValue = roundMoney(positionValueRaw);
      const asset: Asset = {
        ...data,
        id: uuidv4(),
        clientId,
        order: maxOrder + 1,
        createdAt: now,
        name: data.name,
        nomeExibicao: data.nomeExibicao || data.name,
        tipo: data.tipo || 'outro',
        valorPosicao: positionValue,
        currentValue: positionValue,
        isentoIR: data.isentoIR ?? false,
        moeda: data.moeda ?? 'BRL',
        dataUltimaAtualizacao: data.dataUltimaAtualizacao ?? now,
        origemAtualizacao: data.origemAtualizacao ?? 'manual',
        modoMetaAtivo: data.modoMetaAtivo ?? data.idealTargetMode ?? 'score',
        valorMetaAtivo: data.valorMetaAtivo ?? data.idealTargetValue ?? 1,
      };
      return { ...s, assets: [...s.assets, asset] };
    });
  }, []);

  const updateAsset = useCallback((id: string, data: Partial<Omit<Asset, 'id' | 'clientId'>>) => {
    updateStore(s => ({
      ...s,
      assets: s.assets.map(x => {
        if (x.id !== id) return x;
        const merged = { ...x, ...data } as Asset;
        const valueRaw = merged.quantidade !== undefined && merged.precoUnitario !== undefined
          ? merged.quantidade * merged.precoUnitario
          : merged.valorPosicao;
        const value = roundMoney(valueRaw ?? 0);
        return {
          ...merged,
          nomeExibicao: merged.nomeExibicao || merged.name,
          valorPosicao: value,
          currentValue: value,
          dataUltimaAtualizacao: merged.dataUltimaAtualizacao || new Date().toISOString(),
          modoMetaAtivo: merged.modoMetaAtivo ?? merged.idealTargetMode ?? 'score',
          valorMetaAtivo: merged.valorMetaAtivo ?? merged.idealTargetValue ?? 1,
        };
      }),
    }));
  }, []);

  const deleteAsset = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      assets: s.assets.filter(x => x.id !== id),
      assetMovements: s.assetMovements.filter(x => x.assetId !== id),
      draftNotes: s.draftNotes.filter(x => x.id !== id),
    }));
  }, []);

  const addAssetMovement = useCallback((data: Omit<AssetMovement, 'id'>) => {
    const movement: AssetMovement = { ...data, id: uuidv4() };
    updateStore(s => ({ ...s, assetMovements: [...s.assetMovements, movement] }));
    return movement;
  }, []);

  const updateAssetMovement = useCallback((id: string, data: Partial<Omit<AssetMovement, 'id' | 'clientId' | 'assetId'>>) => {
    updateStore(s => ({
      ...s,
      assetMovements: s.assetMovements.map(m => (m.id === id ? { ...m, ...data } : m)),
    }));
  }, []);

  const deleteAssetMovement = useCallback((id: string) => {
    updateStore(s => ({ ...s, assetMovements: s.assetMovements.filter(m => m.id !== id) }));
  }, []);

  const setCdiRates = useCallback((rates: Omit<CdiRate, 'id' | 'indiceAcumulado'>[]) => {
    const sorted = [...rates].sort((a, b) => a.data.localeCompare(b.data));
    let acc = 1;
    const withIndex: CdiRate[] = sorted.map(rate => {
      const decimal = rate.taxaDecimal || rate.taxaDiaria / 100;
      acc *= 1 + decimal;
      return {
        ...rate,
        id: uuidv4(),
        taxaDecimal: decimal,
        indiceAcumulado: acc,
      };
    });
    updateStore(s => ({ ...s, cdiRates: withIndex }));
  }, []);

  const addCdiRate = useCallback((rate: Omit<CdiRate, 'id' | 'indiceAcumulado'>) => {
    const next = [...storeData.cdiRates.map(({ data, taxaDiaria, taxaDecimal }) => ({ data, taxaDiaria, taxaDecimal })), rate];
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

  const setIrBrackets = useCallback((brackets: IrBracket[]) => {
    updateStore(s => ({ ...s, irBrackets: brackets }));
  }, []);

  const setAnbimaHolidays = useCallback((holidays: Omit<AnbimaHoliday, 'id'>[]) => {
    const byDate = new Map<string, Omit<AnbimaHoliday, 'id'>>();
    holidays.forEach(item => {
      if (item.data) byDate.set(item.data, item);
    });
    const sorted = Array.from(byDate.values()).sort((a, b) => a.data.localeCompare(b.data));
    updateStore(s => ({
      ...s,
      anbimaHolidays: sorted.map(item => ({ ...item, id: uuidv4() })),
    }));
  }, []);

  const updateAnbimaHoliday = useCallback((id: string, data: Partial<Omit<AnbimaHoliday, 'id'>>) => {
    updateStore(s => ({
      ...s,
      anbimaHolidays: s.anbimaHolidays
        .map(holiday => (holiday.id === id ? { ...holiday, ...data } : holiday))
        .sort((a, b) => a.data.localeCompare(b.data)),
    }));
  }, []);

  const deleteAnbimaHoliday = useCallback((id: string) => {
    updateStore(s => ({ ...s, anbimaHolidays: s.anbimaHolidays.filter(holiday => holiday.id !== id) }));
  }, []);

  // ---- Renda Variável Prices ----
  const setRvPrices = useCallback((prices: RendaVariavelPrice[]) => {
    updateStore(s => ({ ...s, rvPrices: prices }));
  }, []);

  const addRvPrice = useCallback((data: Omit<RendaVariavelPrice, 'id'>) => {
    const price: RendaVariavelPrice = { ...data, id: uuidv4() };
    updateStore(s => ({ ...s, rvPrices: [...s.rvPrices, price] }));
    return price;
  }, []);

  const updateRvPrice = useCallback((id: string, data: Partial<Omit<RendaVariavelPrice, 'id'>>) => {
    updateStore(s => ({
      ...s,
      rvPrices: s.rvPrices.map(p => (p.id === id ? { ...p, ...data } : p)),
    }));
  }, []);

  const deleteRvPrice = useCallback((id: string) => {
    updateStore(s => ({ ...s, rvPrices: s.rvPrices.filter(p => p.id !== id) }));
  }, []);

  // ---- Fundos Referencia ----
  const addFundoReferencia = useCallback((data: Omit<FundoReferencia, 'id' | 'createdAt'>) => {
    const cnpjNumerico = data.cnpj.replace(/\D/g, '');
    const duplicate = storeData.fundosReferencia.some(f => f.cnpjNumerico === cnpjNumerico);
    if (duplicate) throw new Error('Fundo com este CNPJ já cadastrado');

    const created: FundoReferencia = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      cnpjNumerico,
    };

    updateStore(s => ({ ...s, fundosReferencia: [...s.fundosReferencia, created] }));
    return created;
  }, []);

  const updateFundoReferencia = useCallback((id: string, data: Partial<Omit<FundoReferencia, 'id' | 'createdAt'>>) => {
    updateStore(s => ({
      ...s,
      fundosReferencia: s.fundosReferencia.map(fundo => {
        if (fundo.id !== id) return fundo;
        const nextCnpj = data.cnpj ?? fundo.cnpj;
        const nextCnpjNumerico = nextCnpj.replace(/\D/g, '');
        return {
          ...fundo,
          ...data,
          cnpjNumerico: nextCnpjNumerico,
        };
      }),
    }));
  }, []);

  const deleteFundoReferencia = useCallback((id: string) => {
    updateStore(s => ({ ...s, fundosReferencia: s.fundosReferencia.filter(f => f.id !== id) }));
  }, []);

  const bulkUpsertFundoReferencia = useCallback((items: Omit<FundoReferencia, 'id' | 'createdAt'>[]) => {
    updateStore(s => {
      const nextRefs = [...s.fundosReferencia];
      items.forEach(item => {
        const cnpjNumerico = item.cnpj.replace(/\D/g, '');
        const existingIdx = nextRefs.findIndex(f => f.cnpjNumerico === cnpjNumerico);
        if (existingIdx >= 0) {
          nextRefs[existingIdx] = { ...nextRefs[existingIdx], ...item, cnpjNumerico };
        } else {
          nextRefs.push({ ...item, id: uuidv4(), createdAt: new Date().toISOString(), cnpjNumerico });
        }
      });
      return { ...s, fundosReferencia: nextRefs };
    });
  }, []);

  const updateCotaFundo = useCallback((id: string, cotaAtual: number, dataCota: string, patrimonioLiquido?: number) => {
    updateStore(s => ({
      ...s,
      fundosReferencia: s.fundosReferencia.map(fundo => {
        if (fundo.id !== id) return fundo;
        return {
          ...fundo,
          cotaAtual,
          dataCota,
          patrimonioLiquido,
          atualizadoEm: new Date().toISOString(),
        };
      }),
    }));
  }, []);

  // ---- Rendas Fixas Referencia ----
  const addRendaFixaReferencia = useCallback((data: Omit<RendaFixaReferencia, 'id' | 'createdAt'>) => {
    if (!data.codigoCompleto || !data.codigoCompleto.trim()) {
      throw new Error('Codigo Completo e obrigatorio');
    }
    const fullCode = data.codigoCompleto.toUpperCase().replace(/\s+/g, '');
    const duplicate = storeData.rendasFixasReferencia.some(
      r => (r.codigoCompleto || '').toUpperCase().replace(/\s+/g, '') === fullCode
    );
    if (duplicate) throw new Error('Código Completo já cadastrado');

    const created: RendaFixaReferencia = {
      ...data,
      codigo: data.codigo.toUpperCase().replace(/\s+/g, ''),
      codigoCompleto: fullCode,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };

    updateStore(s => ({ ...s, rendasFixasReferencia: [...s.rendasFixasReferencia, created] }));
    return created;
  }, []);

  const updateRendaFixaReferencia = useCallback((id: string, data: Partial<Omit<RendaFixaReferencia, 'id' | 'createdAt'>>) => {
    updateStore(s => ({
      ...s,
      rendasFixasReferencia: s.rendasFixasReferencia.map(ref => {
        if (ref.id !== id) return ref;
        const nextCodigo = data.codigo ? data.codigo.toUpperCase().replace(/\s+/g, '') : ref.codigo;
        const nextCodigoCompleto = data.codigoCompleto ? data.codigoCompleto.toUpperCase().replace(/\s+/g, '') : ref.codigoCompleto;
        return {
          ...ref,
          ...data,
          codigo: nextCodigo,
          codigoCompleto: nextCodigoCompleto,
        };
      }),
    }));
  }, []);

  const deleteRendaFixaReferencia = useCallback((id: string) => {
    updateStore(s => ({ ...s, rendasFixasReferencia: s.rendasFixasReferencia.filter(r => r.id !== id) }));
  }, []);

  const bulkUpsertRendaFixaReferencia = useCallback((items: Omit<RendaFixaReferencia, 'id' | 'createdAt'>[]) => {
    updateStore(s => {
      const nextRefs = [...s.rendasFixasReferencia];
      
      items.forEach(item => {
        if (!item.codigoCompleto || !item.codigoCompleto.trim()) return; // Pular itens sem Codigo Completo
        
        const fullCode = item.codigoCompleto.toUpperCase().replace(/\s+/g, '');
        const existingIdx = nextRefs.findIndex(
          r => (r.codigoCompleto || '').toUpperCase().replace(/\s+/g, '') === fullCode
        );
        
        const codigoNorm = item.codigo.toUpperCase().replace(/\s+/g, '');
        const codigoCompletoNorm = fullCode;

        if (existingIdx >= 0) {
          nextRefs[existingIdx] = {
            ...nextRefs[existingIdx],
            ...item,
            codigo: codigoNorm,
            codigoCompleto: codigoCompletoNorm,
          };
        } else {
          nextRefs.push({
            ...item,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            codigo: codigoNorm,
            codigoCompleto: codigoCompletoNorm,
          });
        }
      });

      return { ...s, rendasFixasReferencia: nextRefs };
    });
  }, []);

  // ---- Draft Notes ----
  const setDraftNote = useCallback((id: string, clientId: string, note: string, value?: number) => {
    updateStore(s => {
      const existing = s.draftNotes.find(x => x.id === id && x.clientId === clientId);
      if (existing) {
        return { ...s, draftNotes: s.draftNotes.map(x => x.id === id && x.clientId === clientId ? { ...x, note, value } : x) };
      }
      return { ...s, draftNotes: [...s.draftNotes, { id, clientId, note, value }] };
    });
  }, []);

  const getDraftNote = useCallback((id: string, clientId: string): DraftNote | undefined => {
    return storeData.draftNotes.find(x => x.id === id && x.clientId === clientId);
  }, []);

  return {
    // State
    clients: storeData.clients,
    strategies: storeData.strategies,
    subStrategies: storeData.subStrategies,
    assets: storeData.assets,
    assetMovements: storeData.assetMovements,
    cdiRates: storeData.cdiRates,
    irBrackets: storeData.irBrackets,
    anbimaHolidays: storeData.anbimaHolidays,
    draftNotes: storeData.draftNotes,
    rvPrices: storeData.rvPrices,
    fundosReferencia: storeData.fundosReferencia,
    rendasFixasReferencia: storeData.rendasFixasReferencia,
    selectedClientId: storeData.selectedClientId,
    selectedClient: storeData.clients.find(c => c.id === storeData.selectedClientId) ?? null,
    // Client actions
    addClient,
    updateClient,
    deleteClient,
    selectClient,
    // Strategy actions
    addStrategy,
    updateStrategy,
    deleteStrategy,
    reorderStrategies,
    // SubStrategy actions
    addSubStrategy,
    updateSubStrategy,
    deleteSubStrategy,
    // Asset actions
    addAsset,
    updateAsset,
    deleteAsset,
    addAssetMovement,
    updateAssetMovement,
    deleteAssetMovement,
    setCdiRates,
    addCdiRate,
    setIrBrackets,
    setAnbimaHolidays,
    updateAnbimaHoliday,
    deleteAnbimaHoliday,
    // Renda Variável Prices
    setRvPrices,
    addRvPrice,
    updateRvPrice,
    deleteRvPrice,
    // Fundos Referencia
    addFundoReferencia,
    updateFundoReferencia,
    deleteFundoReferencia,
    bulkUpsertFundoReferencia,
    updateCotaFundo,
    // Rendas Fixas Referencia
    addRendaFixaReferencia,
    updateRendaFixaReferencia,
    deleteRendaFixaReferencia,
    bulkUpsertRendaFixaReferencia,
    // Draft notes
    setDraftNote,
    getDraftNote,
  };
}
