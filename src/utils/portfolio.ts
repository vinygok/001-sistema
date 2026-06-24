import type { Strategy, SubStrategy, Asset, DraftNote } from '../types';

export interface PortfolioAssetRow {
  kind: 'asset';
  id: string;
  assetId: string;
  name: string;
  strategyId?: string;
  subStrategyId?: string;
  // IDEAL
  idealBookPct: number;       // % within book/strategy
  idealPortfolioPct: number;  // % of total portfolio
  idealValue: number;
  // ATUAL
  currentPct: number;
  currentValue: number;
  // BALANC
  balanceValue: number;
  // DRAFT
  draftNote: string;
  draftValue?: number;
}

export interface PortfolioSubStrategyRow {
  kind: 'substrategy';
  id: string;
  subStrategyId: string;
  strategyId: string;
  name: string;
  // IDEAL
  idealBookPct: number;      // % within strategy (user defined)
  idealPortfolioPct: number; // derived
  idealValue: number;        // derived
  // ATUAL
  currentPct: number;
  currentValue: number;
  // BALANC
  balanceValue: number;
  // DRAFT
  draftNote: string;
  draftValue?: number;
  assets: PortfolioAssetRow[];
}

export interface PortfolioStrategyRow {
  kind: 'strategy';
  id: string;
  strategyId: string;
  name: string;
  color?: string;
  targetType: 'monetary' | 'percentage';
  // IDEAL
  idealPortfolioPct: number;
  idealValue: number;
  // ATUAL
  currentPct: number;
  currentValue: number;
  // BALANC
  balanceValue: number;
  // DRAFT
  draftNote: string;
  draftValue?: number;
  children: (PortfolioSubStrategyRow | PortfolioAssetRow)[];
}

export interface PortfolioUnclassifiedRow {
  kind: 'unclassified';
  assets: PortfolioAssetRow[];
  currentValue: number;
  currentPct: number;
}

export interface PortfolioData {
  totalCurrentValue: number;
  totalIdealValue: number;
  strategies: PortfolioStrategyRow[];
  unclassified: PortfolioUnclassifiedRow;
}

function fmt(n: number) {
  return Math.round(n * 100) / 100;
}

function getAssetValue(asset: Asset): number {
  return asset.valorPosicao ?? asset.currentValue ?? 0;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

interface AssetIdealShare {
  assetId: string;
  pctInGroup: number;
}

function computeAssetIdealShares(groupAssets: Asset[]): AssetIdealShare[] {
  const hasConfiguredTargets = groupAssets.some(
    asset =>
      asset.modoMetaAtivo === 'score' ||
      asset.modoMetaAtivo === 'percentage' ||
      asset.idealTargetMode === 'score' ||
      asset.idealTargetMode === 'percentage'
  );

  if (!hasConfiguredTargets) {
    const totalCurrent = groupAssets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
    return groupAssets.map(asset => ({
      assetId: asset.id,
      pctInGroup: totalCurrent > 0 ? fmt((getAssetValue(asset) / totalCurrent) * 100) : 0,
    }));
  }

  const percentageAssets = groupAssets.filter(asset => (asset.modoMetaAtivo ?? asset.idealTargetMode) === 'percentage');
  const scoreAssets = groupAssets.filter(asset => (asset.modoMetaAtivo ?? asset.idealTargetMode) !== 'percentage');

  const fixedPct = percentageAssets.reduce(
    (sum, asset) => sum + clampPct(asset.valorMetaAtivo ?? asset.idealTargetValue ?? 0),
    0
  );

  const remainingPct = Math.max(0, 100 - fixedPct);
  const totalScore = scoreAssets.reduce((sum, asset) => sum + Math.max(0, asset.valorMetaAtivo ?? asset.idealTargetValue ?? 0), 0);

  return groupAssets.map(asset => {
    if ((asset.modoMetaAtivo ?? asset.idealTargetMode) === 'percentage') {
      return {
        assetId: asset.id,
        pctInGroup: clampPct(asset.valorMetaAtivo ?? asset.idealTargetValue ?? 0),
      };
    }

    const score = Math.max(0, asset.valorMetaAtivo ?? asset.idealTargetValue ?? 0);
    const pctFromScore = totalScore > 0 ? (remainingPct * score) / totalScore : 0;
    return {
      assetId: asset.id,
      pctInGroup: fmt(pctFromScore),
    };
  });
}

function buildAssetRows(
  groupAssets: Asset[],
  groupIdealValue: number,
  totalCurrentValue: number,
  getDraft: (id: string) => DraftNote | undefined,
  strategyId?: string,
  subStrategyId?: string
): PortfolioAssetRow[] {
  const shares = computeAssetIdealShares(groupAssets);
  const pctByAssetId = new Map(shares.map(item => [item.assetId, item.pctInGroup]));

  return groupAssets.map(asset => {
    const currentValue = getAssetValue(asset);
    const assetCurrentPct = totalCurrentValue > 0 ? fmt((currentValue / totalCurrentValue) * 100) : 0;
    const assetIdealBookPct = pctByAssetId.get(asset.id) ?? 0;
    const assetIdealValue = fmt((groupIdealValue * assetIdealBookPct) / 100);
    const assetIdealPortfolioPct = totalCurrentValue > 0 ? fmt((assetIdealValue / totalCurrentValue) * 100) : 0;
    const draftA = getDraft(asset.id);

    return {
      kind: 'asset',
      id: asset.id,
      assetId: asset.id,
      name: asset.name,
      strategyId,
      subStrategyId,
      idealBookPct: assetIdealBookPct,
      idealPortfolioPct: assetIdealPortfolioPct,
      idealValue: assetIdealValue,
      currentPct: assetCurrentPct,
      currentValue,
      balanceValue: fmt(assetIdealValue - currentValue),
      draftNote: draftA?.note ?? '',
      draftValue: draftA?.value,
    };
  });
}

export function computePortfolio(
  strategies: Strategy[],
  subStrategies: SubStrategy[],
  assets: Asset[],
  draftNotes: DraftNote[],
  clientId: string
): PortfolioData {
  const clientAssets = assets.filter(a => a.clientId === clientId);
  const clientStrategies = strategies
    .filter(s => s.clientId === clientId)
    .sort((a, b) => a.order - b.order);

  const totalCurrentValue = clientAssets.reduce((sum, a) => sum + getAssetValue(a), 0);

  const monetaryStrategies = clientStrategies.filter(s => s.targetType === 'monetary');
  const percentageStrategies = clientStrategies.filter(s => s.targetType === 'percentage');
  const totalMonetaryTarget = monetaryStrategies.reduce((sum, s) => sum + (s.targetValue || 0), 0);
  const remainingAfterMonetary = totalCurrentValue - totalMonetaryTarget;
  const percentageBase = Math.max(0, remainingAfterMonetary);
  const percentageWeightSum = percentageStrategies.reduce((sum, s) => sum + (s.targetValue || 0), 0);

  // Mixed rule:
  // 1) Monetary strategies consume their fixed BRL targets first.
  // 2) Percentage strategies split the remaining amount proportionally to their percentage weights.
  const getStrategyIdealValue = (s: Strategy): number => {
    if (s.targetType === 'monetary') return s.targetValue;

    if (percentageWeightSum <= 0) return 0;
    return fmt((percentageBase * s.targetValue) / percentageWeightSum);
  };

  const getStrategyIdealPct = (s: Strategy): number => {
    if (totalCurrentValue === 0) return 0;

    const idealValue = getStrategyIdealValue(s);
    return fmt((idealValue / totalCurrentValue) * 100);
  };

  const getDraft = (id: string): DraftNote | undefined =>
    draftNotes.find(d => d.id === id && d.clientId === clientId);

  // Build strategy rows
  const strategyRows: PortfolioStrategyRow[] = clientStrategies.map(strategy => {
    const stratIdealValue = getStrategyIdealValue(strategy);
    const stratIdealPct = getStrategyIdealPct(strategy);

    const stratSubs = subStrategies
      .filter(ss => ss.strategyId === strategy.id)
      .sort((a, b) => a.order - b.order);

    const stratAssets = clientAssets.filter(
      a => a.strategyId === strategy.id && !a.subStrategyId
    );

    let children: (PortfolioSubStrategyRow | PortfolioAssetRow)[] = [];

    if (stratSubs.length > 0) {
      // Build substrategy rows
      const subRows: PortfolioSubStrategyRow[] = stratSubs.map(ss => {
        const ssIdealPct = ss.percentage; // % of strategy
        const ssIdealValue = fmt((stratIdealValue * ss.percentage) / 100);
        const ssIdealPortfolioPct = totalCurrentValue > 0
          ? fmt((ssIdealValue / totalCurrentValue) * 100)
          : 0;

        const ssAssets = clientAssets.filter(a => a.subStrategyId === ss.id);
        const ssCurrentValue = ssAssets.reduce((sum, a) => sum + getAssetValue(a), 0);
        const ssCurrentPct = totalCurrentValue > 0 ? fmt((ssCurrentValue / totalCurrentValue) * 100) : 0;

        const draftSS = getDraft(ss.id);

        const assetRows = buildAssetRows(
          ssAssets,
          ssIdealValue,
          totalCurrentValue,
          getDraft,
          strategy.id,
          ss.id
        );

        return {
          kind: 'substrategy',
          id: ss.id,
          subStrategyId: ss.id,
          strategyId: strategy.id,
          name: ss.name,
          idealBookPct: ssIdealPct,
          idealPortfolioPct: ssIdealPortfolioPct,
          idealValue: ssIdealValue,
          currentPct: ssCurrentPct,
          currentValue: ssCurrentValue,
          balanceValue: fmt(ssIdealValue - ssCurrentValue),
          draftNote: draftSS?.note ?? '',
          draftValue: draftSS?.value,
          assets: assetRows,
        };
      });

      // Also assets directly in strategy (no substrategy)
      const directAssetRows = buildAssetRows(
        stratAssets,
        stratIdealValue,
        totalCurrentValue,
        getDraft,
        strategy.id
      );

      children = [...subRows, ...directAssetRows];
    } else {
      // No substrategies - direct assets
      children = buildAssetRows(
        stratAssets,
        stratIdealValue,
        totalCurrentValue,
        getDraft,
        strategy.id
      );
    }

    // Compute strategy current value
    const stratCurrentValue = clientAssets
      .filter(a => a.strategyId === strategy.id)
      .reduce((sum, a) => sum + getAssetValue(a), 0);
    const stratCurrentPct = totalCurrentValue > 0 ? fmt((stratCurrentValue / totalCurrentValue) * 100) : 0;

    const draftStr = getDraft(strategy.id);

    return {
      kind: 'strategy',
      id: strategy.id,
      strategyId: strategy.id,
      name: strategy.name,
      color: strategy.color,
      targetType: strategy.targetType,
      idealPortfolioPct: stratIdealPct,
      idealValue: stratIdealValue,
      currentPct: stratCurrentPct,
      currentValue: stratCurrentValue,
      balanceValue: fmt(stratIdealValue - stratCurrentValue),
      draftNote: draftStr?.note ?? '',
      draftValue: draftStr?.value,
      children,
    };
  });

  // Unclassified assets
  const unclassifiedAssets = clientAssets.filter(a => !a.strategyId);
  const unclassifiedValue = unclassifiedAssets.reduce((sum, a) => sum + getAssetValue(a), 0);

  const unclassifiedRows: PortfolioAssetRow[] = unclassifiedAssets.map(asset => {
    const currentValue = getAssetValue(asset);
    const pct = totalCurrentValue > 0 ? fmt((currentValue / totalCurrentValue) * 100) : 0;
    const draftA = getDraft(asset.id);
    return {
      kind: 'asset',
      id: asset.id,
      assetId: asset.id,
      name: asset.name,
      idealBookPct: 0,
      idealPortfolioPct: 0,
      idealValue: 0,
      currentPct: pct,
      currentValue,
      balanceValue: fmt(0 - currentValue),
      draftNote: draftA?.note ?? '',
      draftValue: draftA?.value,
    };
  });

  const totalIdealValue = strategyRows.reduce((sum, s) => sum + s.idealValue, 0);

  return {
    totalCurrentValue,
    totalIdealValue,
    strategies: strategyRows,
    unclassified: {
      kind: 'unclassified',
      assets: unclassifiedRows,
      currentValue: unclassifiedValue,
      currentPct: totalCurrentValue > 0 ? fmt((unclassifiedValue / totalCurrentValue) * 100) : 0,
    },
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function parseCurrency(str: string): number {
  const cleaned = str.replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}
