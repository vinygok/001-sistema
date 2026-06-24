import type { Asset, CdiRate } from '../types';

/**
 * Formata um objeto Date para 'YYYY-MM-DD'.
 */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converte data do BCB ('dd/MM/yyyy') para 'YYYY-MM-DD'.
 */
function bcbDateToISO(date: string): string {
  const [day, month, year] = date.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Retorna o ano e mês anteriores a uma data, deslocados por `months` meses.
 * Usado para aplicar defasagem M-2 no IPCA.
 */
function shiftYearMonth(year: number, month: number, months: number): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) - months;
  return {
    year: Math.floor(totalMonths / 12),
    month: (totalMonths % 12) + 1,
  };
}

/**
 * Verifica se uma data é dia útil no mercado financeiro brasileiro.
 * @param date Data a verificar.
 * @param holidays Lista de feriados ANBIMA no formato 'YYYY-MM-DD'.
 * @returns true se for dia útil, false caso contrário.
 */
export function isWorkingDay(date: Date, holidays: string[]): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const isoDate = toISODate(date);
  return !holidays.includes(isoDate);
}

/**
 * Retorna todos os dias úteis entre duas datas (inclusive).
 * @param start Data inicial.
 * @param end Data final.
 * @param holidays Lista de feriados ANBIMA no formato 'YYYY-MM-DD'.
 * @returns Array de objetos Date representando dias úteis.
 */
export function getWorkingDaysBetween(start: Date, end: Date, holidays: string[]): Date[] {
  const workingDays: Date[] = [];
  const current = new Date(start);
  const last = new Date(end);

  // Normaliza horas para evitar problemas de comparação
  current.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);

  while (current <= last) {
    if (isWorkingDay(current, holidays)) {
      workingDays.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return workingDays;
}

/**
 * Converte uma taxa anual (percentual) para taxa diária proporcional a 252 dias úteis.
 * Fórmula: (1 + taxaAnual/100) ^ (1/252) - 1
 * @param taxaAnual Taxa anual em percentual (ex: 14 para 14% a.a.).
 * @returns Taxa diária decimal.
 */
export function calcularTaxaDiariaAnualizada(taxaAnual: number): number {
  return Math.pow(1 + taxaAnual / 100, 1 / 252) - 1;
}

/**
 * Calcula o valor atual de um investimento prefixado.
 * Aplica juros compostos em cada dia útil entre dataInicio e dataFim.
 * @param valorAplicado Valor inicial aplicado.
 * @param taxaAnualPct Taxa prefixada anual em percentual (ex: 14 para 14% a.a.).
 * @param dataInicio Data de início do investimento.
 * @param dataFim Data de cálculo/fim.
 * @param holidays Lista de feriados ANBIMA.
 * @returns Valor atualizado.
 */
export function calcularPrefixado(
  valorAplicado: number,
  taxaAnualPct: number,
  dataInicio: Date,
  dataFim: Date,
  holidays: string[]
): number {
  const taxaDiaria = calcularTaxaDiariaAnualizada(taxaAnualPct);
  const workingDays = getWorkingDaysBetween(dataInicio, dataFim, holidays);

  let valorAtual = valorAplicado;
  for (let i = 0; i < workingDays.length; i++) {
    valorAtual = valorAtual * (1 + taxaDiaria);
  }

  return valorAtual;
}

/**
 * Calcula o valor atual de um investimento atrelado a percentual do CDI.
 * Fórmula por dia útil: taxa_dia = taxaCdi.taxaDiaria * (percentualCdi / 100)
 * @param valorAplicado Valor inicial aplicado.
 * @param percentualCdi Percentual do CDI (ex: 120 para 120% do CDI).
  * @param dataInicio Data de início do investimento.
 * @param dataFim Data de cálculo/fim.
 * @param taxasCdi Array de taxas CDI diárias.
 * @param holidays Lista de feriados ANBIMA.
 * @returns Valor atualizado.
 */
export function calcularCdiPercentual(
  valorAplicado: number,
  percentualCdi: number,
  dataInicio: Date,
  dataFim: Date,
  taxasCdi: CdiRate[],
  holidays: string[]
): number {
  const workingDays = getWorkingDaysBetween(dataInicio, dataFim, holidays);
  const cdiMap = new Map(taxasCdi.map(t => [bcbDateToISO(t.data), t.taxaDiaria]));
  const multiplicador = percentualCdi / 100;

  let valorAtual = valorAplicado;
  for (const day of workingDays) {
    const iso = toISODate(day);
    const taxaCdi = cdiMap.get(iso) ?? 0;
    const taxaDia = taxaCdi * multiplicador;
    valorAtual = valorAtual * (1 + taxaDia);
  }

  return valorAtual;
}

/**
 * Calcula o valor atual de um investimento CDI + spread anual.
 * Fórmula por dia útil: taxa_dia = (1 + taxaCdi.taxaDiaria) * (1 + spread_diario) - 1
 * @param valorAplicado Valor inicial aplicado.
 * @param spreadAnualPct Spread anual em percentual (ex: 2.0 para CDI + 2% a.a.).
 * @param dataInicio Data de início do investimento.
 * @param dataFim Data de cálculo/fim.
 * @param taxasCdi Array de taxas CDI diárias.
 * @param holidays Lista de feriados ANBIMA.
 * @returns Valor atualizado.
 */
export function calcularCdiMaisSpread(
  valorAplicado: number,
  spreadAnualPct: number,
  dataInicio: Date,
  dataFim: Date,
  taxasCdi: CdiRate[],
  holidays: string[]
): number {
  const spreadDiario = calcularTaxaDiariaAnualizada(spreadAnualPct);
  const workingDays = getWorkingDaysBetween(dataInicio, dataFim, holidays);
  const cdiMap = new Map(taxasCdi.map(t => [bcbDateToISO(t.data), t.taxaDiaria]));

  let valorAtual = valorAplicado;
  for (const day of workingDays) {
    const iso = toISODate(day);
    const taxaCdi = cdiMap.get(iso) ?? 0;
    const taxaDia = (1 + taxaCdi) * (1 + spreadDiario) - 1;
    valorAtual = valorAtual * (1 + taxaDia);
  }

  return valorAtual;
}

/**
 * Calcula o valor atual de um investimento IPCA + spread anual.
 * Usa defasagem de 2 meses (M-2) para o IPCA.
 * Fórmula por dia útil: taxa_dia = (1 + ipca_diario) * (1 + spread_diario) - 1
 * @param valorAplicado Valor inicial aplicado.
 * @param spreadAnualPct Spread anual em percentual (ex: 5.0 para IPCA + 5% a.a.).
 * @param dataInicio Data de início do investimento.
 * @param dataFim Data de cálculo/fim.
 * @param ipcaMensal Array de índices IPCA mensais {data: 'MM/YYYY', valor: percentual}.
 * @param holidays Lista de feriados ANBIMA.
 * @returns Valor atualizado.
 */
export function calcularIpcaMaisSpread(
  valorAplicado: number,
  spreadAnualPct: number,
  dataInicio: Date,
  dataFim: Date,
  ipcaMensal: Array<{ data: string; valor: number }>,
  holidays: string[]
): number {
  const spreadDiario = calcularTaxaDiariaAnualizada(spreadAnualPct);
  const ipcaMap = new Map(ipcaMensal.map(item => [item.data, item.valor]));

  // Pré-calcula dias úteis de cada mês para converter IPCA mensal em diário
  const workingDays = getWorkingDaysBetween(dataInicio, dataFim, holidays);

  let valorAtual = valorAplicado;
  for (const day of workingDays) {
    const year = day.getFullYear();
    const month = day.getMonth() + 1;

    // IPCA com defasagem M-2
    const target = shiftYearMonth(year, month, 2);
    const targetKey = `${String(target.month).padStart(2, '0')}/${target.year}`;
    const ipcaMensalValor = ipcaMap.get(targetKey) ?? 0;

    // Conta dias úteis do mês atual para converter IPCA mensal em diário
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const workingDaysInMonth = getWorkingDaysBetween(firstDayOfMonth, lastDayOfMonth, holidays).length;

    const ipcaDiario = workingDaysInMonth > 0
      ? Math.pow(1 + ipcaMensalValor / 100, 1 / workingDaysInMonth) - 1
      : 0;

    const taxaDia = (1 + ipcaDiario) * (1 + spreadDiario) - 1;
    valorAtual = valorAtual * (1 + taxaDia);
  }

  return valorAtual;
}

/**
 * Orquestrador de cálculo de valor atual para ativos de Renda Fixa.
 * @param asset Ativo a ser avaliado.
 * @param taxasCdi Array de taxas CDI diárias.
 * @param ipcaMensal Array de índices IPCA mensais.
 * @param holidays Lista de feriados ANBIMA.
 * @returns Valor atual calculado ou null se não for aplicável.
 */
export function calcularValorAtualAsset(
  asset: Asset,
  taxasCdi: CdiRate[],
  ipcaMensal: Array<{ data: string; valor: number }>,
  holidays: string[]
): number | null {
  const tiposRendaFixa: Array<Asset['tipo']> = ['cdb', 'cri', 'cra', 'debenture', 'coe'];
  if (!tiposRendaFixa.includes(asset.tipo)) return null;
  if (!asset.tipoIndexador || !asset.dataEmissao || asset.valorNominal === undefined) return null;

  const valorAplicado = asset.valorNominal;
  const dataInicio = new Date(asset.dataEmissao);
  const dataFim = new Date();

  switch (asset.tipoIndexador) {
    case 'prefixado':
      if (asset.taxaContratada === undefined) return null;
      return calcularPrefixado(valorAplicado, asset.taxaContratada, dataInicio, dataFim, holidays);

    case 'cdi_percentual':
      if (asset.taxaContratada === undefined) return null;
      return calcularCdiPercentual(
        valorAplicado,
        asset.taxaContratada,
        dataInicio,
        dataFim,
        taxasCdi,
        holidays
      );

    case 'cdi_mais_spread':
      if (asset.spreadContratado === undefined) return null;
      return calcularCdiMaisSpread(
        valorAplicado,
        asset.spreadContratado,
        dataInicio,
        dataFim,
        taxasCdi,
        holidays
      );

    case 'ipca_mais_spread':
      if (asset.spreadContratado === undefined) return null;
      return calcularIpcaMaisSpread(
        valorAplicado,
        asset.spreadContratado,
        dataInicio,
        dataFim,
        ipcaMensal,
        holidays
      );

    case 'selic':
      if (asset.taxaContratada === undefined) return null;
      // Selic 100% equivale a CDI 100% na prática
      return calcularCdiPercentual(
        valorAplicado,
        asset.taxaContratada,
        dataInicio,
        dataFim,
        taxasCdi,
        holidays
      );

    case 'igpm_mais_spread':
      // IGPM seguiria a mesma lógica do IPCA com defasagem M-2.
      // Como a assinatura atual recebe apenas IPCA, retornamos null.
      return null;

    case 'tr':
      // TR exige série histórica específica, não implementado nesta versão.
      return null;

    default:
      return null;
  }
}
