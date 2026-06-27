import type { Asset, AssetMovement, CdiRate, IrBracket, Strategy, SubStrategy } from '../types';

export interface CashFlow {
  date: string;
  amount: number;
}

export interface PerformanceRow {
  id: string;
  kind: 'portfolio' | 'strategy' | 'substrategy' | 'asset';
  name: string;
  portfolioPct: number;
  currentValue: number;
  investedCapital: number;
  financialReturn: number;
  incomeReceived: number;
  totalReturn: number;
  annualIrr?: number;
  cdiAnnual?: number;
  cdiRelative?: number;
  isValid: boolean;
  children?: PerformanceRow[];
}

export function formatPctDecimal(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(2)}%`;
}

export function getAssetValue(asset: Asset): number {
  return asset.valorPosicao ?? asset.currentValue ?? 0;
}

interface SyntheticFlowRow {
  assetId: string;
  dataInicial: string;
  dataAtual: string;
  valorAplicado: number;
  fluxo: number;
  fluxoCdi: number;
  valorAtualCdi: number;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function normalizeDate(date: string): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function validateAssetForPerformance(asset: Asset, movements: AssetMovement[]): { valid: boolean; reasons: string[]; historyQuantity?: number } {
  const reasons: string[] = [];
  const buySell = movements.filter(m => m.tipoMovimentacao === 'compra' || m.tipoMovimentacao === 'venda');
  const historyQuantity = buySell.reduce((sum, movement) => {
    const qty = Math.abs(movement.quantidade ?? 0);
    return sum + (movement.tipoMovimentacao === 'compra' ? qty : -qty);
  }, 0);

  if (movements.length === 0) reasons.push('Sem movimentacoes');
  if (asset.quantidade !== undefined && Math.abs(asset.quantidade - historyQuantity) > 0.000001) {
    reasons.push('Quantidade divergente do historico');
  }
  if (asset.quantidade !== undefined && asset.precoUnitario !== undefined) {
    const expected = Math.round(asset.quantidade * asset.precoUnitario * 100) / 100;
    if (Math.abs(expected - getAssetValue(asset)) > 0.01) reasons.push('Valor atual divergente de quantidade x preco');
  }
  if (!Number.isFinite(getAssetValue(asset))) reasons.push('Valor atual invalido');
  if (movements.some(m => !m.data || !Number.isFinite(m.valorTotal))) reasons.push('Movimentacao estruturalmente invalida');

  return { valid: reasons.length === 0, reasons, historyQuantity };
}

function movementToFlow(movement: AssetMovement): CashFlow | null {
  const amount = movement.valorTotal || 0;
  switch (movement.tipoMovimentacao) {
    case 'compra':
    case 'aporte':
      return { date: normalizeDate(movement.data), amount: -Math.abs(amount) };
    case 'venda':
    case 'retirada':
    case 'rendimento':
    case 'dividendo':
    case 'juros':
    case 'amortizacao':
      return { date: normalizeDate(movement.data), amount: Math.abs(amount) };
    case 'ajuste':
    case 'outro':
      return { date: normalizeDate(movement.data), amount };
    default:
      return null;
  }
}

function movementToSignedAppliedValue(movement: AssetMovement): number {
  const base = Math.abs(movement.valorTotal || 0);
  switch (movement.tipoMovimentacao) {
    case 'compra':
    case 'aporte':
      return base;
    case 'venda':
    case 'retirada':
      return -base;
    default:
      return base;
  }
}

/**
 * Busca binária para encontrar o índice acumulado do CDI na data exata ou anterior mais próxima.
 * Reduz a complexidade de O(N log N) para O(log N).
 */
function getCdiIndexOnOrBefore(cdiRates: CdiRate[], date: string): number | undefined {
  if (cdiRates.length === 0) return undefined;
  
  let low = 0;
  let high = cdiRates.length - 1;
  let resultIndex = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (cdiRates[mid].data <= date) {
      resultIndex = mid;
      low = mid + 1; // Tenta encontrar uma data mais próxima ainda
    } else {
      high = mid - 1;
    }
  }

  return resultIndex >= 0 ? cdiRates[resultIndex].indiceAcumulado : undefined;
}

/**
 * Busca binária para encontrar o índice acumulado do CDI estritamente anterior à data.
 */
function getCdiIndexBefore(cdiRates: CdiRate[], date: string): number | undefined {
  if (cdiRates.length === 0) return undefined;
  
  let low = 0;
  let high = cdiRates.length - 1;
  let resultIndex = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (cdiRates[mid].data < date) {
      resultIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return resultIndex >= 0 ? cdiRates[resultIndex].indiceAcumulado : undefined;
}

function groupFlowsByDate(rows: Array<{ date: string; amount: number }>): CashFlow[] {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    grouped.set(row.date, (grouped.get(row.date) ?? 0) + row.amount);
  }
  return Array.from(grouped.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function xnpv(rate: number, flows: CashFlow[]): number {
  if (flows.length === 0) return 0;
  const first = flows[0].date;
  return flows.reduce((sum, flow) => sum + flow.amount / Math.pow(1 + rate, daysBetween(first, flow.date) / 365), 0);
}

export function xirr(flows: CashFlow[]): number | undefined {
  if (!flows.some(f => f.amount > 0) || !flows.some(f => f.amount < 0)) return undefined;
  let low = -0.9999;
  let high = 10;
  let mid = 0.1;
  for (let i = 0; i < 100; i++) {
    mid = (low + high) / 2;
    const value = xnpv(mid, flows);
    if (Math.abs(value) < 0.00001) return mid;
    if (value > 0) low = mid;
    else high = mid;
  }
  return Number.isFinite(mid) ? mid : undefined;
}

function sumMovements(movements: AssetMovement[], types: string[]): number {
  return movements
    .filter(m => types.includes(m.tipoMovimentacao))
    .reduce((sum, m) => sum + Math.abs(m.valorTotal || 0), 0);
}

function getIrRate(days: number, brackets: IrBracket[]): number {
  const bracket = brackets.find(b => days >= b.diasDe && (b.diasAte === undefined || days <= b.diasAte));
  return (bracket?.aliquota ?? 0) / 100;
}

// ============================================================================
// SUBSTITUA A FUNÇÃO buildSyntheticRows POR ESTA (COM CACHE DE BUSCAS):
// ============================================================================

function buildSyntheticRows(
  assets: Asset[],
  movements: AssetMovement[],
  cdiRates: CdiRate[],
  irBrackets: IrBracket[],
  asOfDate: string
): SyntheticFlowRow[] {
  const rows: SyntheticFlowRow[] = [];

  for (const asset of assets) {
    const assetMovements = movements
      .filter(m => m.assetId === asset.id)
      .sort((a, b) => a.data.localeCompare(b.data));

    for (const movement of assetMovements) {
      const fluxo = movementToFlow(movement)?.amount ?? 0;
      const valorAplicado = movementToSignedAppliedValue(movement);
      const fluxoCdi = fluxo < 0 ? fluxo : 0;

      let valorAtualCdi = 0;
      if (fluxoCdi < 0 && cdiRates.length > 0) {
        const principal = Math.abs(valorAplicado);
        const idxEnd = getCdiIndexOnOrBefore(cdiRates, asOfDate);
        const idxStartPrev = getCdiIndexBefore(cdiRates, movement.data);
        if (idxEnd && idxStartPrev && idxStartPrev > 0) {
          const cdiBruto = principal * (idxEnd / idxStartPrev);
          const lucroCdi = cdiBruto - principal;
          const days = daysBetween(movement.data, asOfDate);
          const irRate = getIrRate(days, irBrackets);
          const cdiLiquido = cdiBruto - lucroCdi * irRate;
          // Fica alinhado com a planilha de referencia (comparacao pre-tax predominante).
          valorAtualCdi = asset.isentoIR ? cdiLiquido : cdiBruto;
        }
      }

      rows.push({
        assetId: asset.id,
        dataInicial: normalizeDate(movement.data),
        dataAtual: asOfDate,
        valorAplicado,
        fluxo,
        fluxoCdi,
        valorAtualCdi,
      });
    }

    rows.push({
      assetId: asset.id,
      dataInicial: asOfDate,
      dataAtual: asOfDate,
      valorAplicado: getAssetValue(asset),
      fluxo: getAssetValue(asset),
      fluxoCdi: 0,
      valorAtualCdi: 0,
    });
  }

  return rows;
}

function cdiEquivalentXirrForAssets(
  assets: Asset[],
  movements: AssetMovement[],
  cdiRates: CdiRate[],
  irBrackets: IrBracket[],
  asOfDate: string
): number | undefined {
  if (cdiRates.length === 0) return undefined;

  const rows = buildSyntheticRows(assets, movements, cdiRates, irBrackets, asOfDate);
  const cdiFlowRows: Array<{ date: string; amount: number }> = [];

  for (const row of rows) {
    if (row.fluxoCdi !== 0) cdiFlowRows.push({ date: row.dataInicial, amount: row.fluxoCdi });
    if (row.valorAtualCdi !== 0) cdiFlowRows.push({ date: row.dataAtual, amount: row.valorAtualCdi });
  }

  const cdiFlows = groupFlowsByDate(cdiFlowRows);
  return xirr(cdiFlows);
}

function groupIrrForAssets(
  assets: Asset[],
  movements: AssetMovement[],
  cdiRates: CdiRate[],
  irBrackets: IrBracket[],
  asOfDate: string
): number | undefined {
  const rows = buildSyntheticRows(assets, movements, cdiRates, irBrackets, asOfDate);
  const irrFlows = groupFlowsByDate(rows.map(row => ({ date: row.dataInicial, amount: row.fluxo })));

  return xirr(irrFlows);
}

function computeRowFromAssets(id: string, kind: PerformanceRow['kind'], name: string, assets: Asset[], movements: AssetMovement[], totalPortfolio: number, cdiRates: CdiRate[], irBrackets: IrBracket[], asOfDate: string): PerformanceRow {
  const assetIds = new Set(assets.map(a => a.id));
  const groupMovements = movements.filter(m => assetIds.has(m.assetId));
  const currentValue = assets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const investedCapital = sumMovements(groupMovements, ['compra', 'aporte']) - sumMovements(groupMovements, ['venda', 'retirada', 'amortizacao']);
  const incomeReceived = sumMovements(groupMovements, ['rendimento', 'dividendo', 'juros']);
  const financialReturn = currentValue - investedCapital;
  const totalReturn = financialReturn + incomeReceived;
  const annualIrr = groupIrrForAssets(assets, movements, cdiRates, irBrackets, asOfDate);
  const cdiAnnual = cdiEquivalentXirrForAssets(assets, movements, cdiRates, irBrackets, asOfDate);
  const validations = assets.map(asset => validateAssetForPerformance(asset, movements.filter(m => m.assetId === asset.id)));
  return {
    id,
    kind,
    name,
    portfolioPct: totalPortfolio > 0 ? currentValue / totalPortfolio : 0,
    currentValue,
    investedCapital,
    financialReturn,
    incomeReceived,
    totalReturn,
    annualIrr,
    cdiAnnual,
    cdiRelative: annualIrr !== undefined && cdiAnnual !== undefined && cdiAnnual !== 0 ? annualIrr / cdiAnnual : undefined,
    isValid: validations.every(v => v.valid),
  };
}

export function computePerformanceData(params: {
  clientId: string;
  assets: Asset[];
  movements: AssetMovement[];
  strategies: Strategy[];
  subStrategies: SubStrategy[];
  cdiRates: CdiRate[];
  irBrackets: IrBracket[];
  asOfDate?: string;
}) {
  const asOfDate = params.asOfDate ?? new Date().toISOString().slice(0, 10);
  const clientAssets = params.assets.filter(a => a.clientId === params.clientId);
  const movements = params.movements.filter(m => m.clientId === params.clientId);
  const totalPortfolio = clientAssets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const portfolio = computeRowFromAssets('portfolio', 'portfolio', 'Carteira consolidada', clientAssets, movements, totalPortfolio, params.cdiRates, params.irBrackets, asOfDate);

  const strategyRows = params.strategies
    .filter(s => s.clientId === params.clientId)
    .sort((a, b) => a.order - b.order)
    .map(strategy => {
      const strategyAssets = clientAssets.filter(a => a.strategyId === strategy.id);
      const row = computeRowFromAssets(strategy.id, 'strategy', strategy.name, strategyAssets, movements, totalPortfolio, params.cdiRates, params.irBrackets, asOfDate);
      row.children = params.subStrategies
        .filter(ss => ss.strategyId === strategy.id)
        .sort((a, b) => a.order - b.order)
        .map(sub => {
          const subAssets = clientAssets.filter(a => a.subStrategyId === sub.id);
          const subRow = computeRowFromAssets(sub.id, 'substrategy', sub.name, subAssets, movements, totalPortfolio, params.cdiRates, params.irBrackets, asOfDate);
          subRow.children = subAssets.map(asset => computeRowFromAssets(asset.id, 'asset', asset.nomeExibicao || asset.name, [asset], movements, totalPortfolio, params.cdiRates, params.irBrackets, asOfDate));
          return subRow;
        });
      const directAssets = strategyAssets.filter(a => !a.subStrategyId).map(asset => computeRowFromAssets(asset.id, 'asset', asset.nomeExibicao || asset.name, [asset], movements, totalPortfolio, params.cdiRates, params.irBrackets, asOfDate));
      row.children = [...(row.children ?? []), ...directAssets];
      return row;
    });

  const unclassifiedAssets = clientAssets.filter(a => !a.strategyId);
  const unclassified = unclassifiedAssets.length > 0
    ? computeRowFromAssets('unclassified', 'strategy', 'Sem classificacao', unclassifiedAssets, movements, totalPortfolio, params.cdiRates, params.irBrackets, asOfDate)
    : undefined;
  if (unclassified) {
    unclassified.children = unclassifiedAssets.map(asset => computeRowFromAssets(asset.id, 'asset', asset.nomeExibicao || asset.name, [asset], movements, totalPortfolio, params.cdiRates, params.irBrackets, asOfDate));
  }

  return { portfolio, strategies: unclassified ? [...strategyRows, unclassified] : strategyRows };
}
