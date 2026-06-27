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
  if (date.includes('-')) return date; // Se já estiver ISO, retorna direto
  const parts = date.split('/');
  if (parts.length !== 3) return date;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
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
 * @param holidays Lista ou Set de feriados ANBIMA no formato 'YYYY-MM-DD'.
 * @returns true se for dia útil, false caso contrário.
 */
export function isWorkingDay(date: Date, holidays: string[] | Set<string>): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const isoDate = toISODate(date);
  if (holidays instanceof Set) {
    return !holidays.has(isoDate);
  }
  return !holidays.includes(isoDate);
}

/**
 * Retorna todos os dias úteis entre duas datas (inclusive).
 * Utiliza Set para busca O(1) de feriados.
 * @param start Data inicial.
 * @param end Data final.
 * @param holidays Lista ou Set de feriados ANBIMA no formato 'YYYY-MM-DD'.
 * @returns Array de objetos Date representando dias úteis.
 */
export function getWorkingDaysBetween(start: Date, end: Date, holidays: string[] | Set<string>): Date[] {
  const workingDays: Date[] = [];
  const current = new Date(start);
  const last = new Date(end);

  // Normaliza horas para evitar problemas de comparação
  current.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);

  // Otimização: garante que holidays seja um Set para lookup instantâneo
  const holidaySet = holidays instanceof Set ? holidays : new Set(holidays);

  while (current <= last) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const isoDate = toISODate(current);
      if (!holidaySet.has(isoDate)) {
        workingDays.push(new Date(current));
      }
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
 */
export function calcularPrefixado(
  valorAplicado: number,
  taxaAnualPct: number,
  dataInicio: Date,
  dataFim: Date,
  holidays: string[] | Set<string>
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
 */
export function calcularCdiPercentual(
  valorAplicado: number,
  percentualCdi: number,
  dataInicio: Date,
  dataFim: Date,
  taxasCdi: CdiRate[] | Map<string, number>,
  holidays: string[] | Set<string>
): number {
  const workingDays = getWorkingDaysBetween(dataInicio, dataFim, holidays);
  const cdiMap = taxasCdi instanceof Map 
    ? taxasCdi 
    : new Map(taxasCdi.map(t => [bcbDateToISO(t.data), t.taxaDiaria]));
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
 */
export function calcularCdiMaisSpread(
  valorAplicado: number,
  spreadAnualPct: number,
  dataInicio: Date,
  dataFim: Date,
  taxasCdi: CdiRate[] | Map<string, number>,
  holidays: string[] | Set<string>
): number {
  const spreadDiario = calcularTaxaDiariaAnualizada(spreadAnualPct);
  const workingDays = getWorkingDaysBetween(dataInicio, dataFim, holidays);
  const cdiMap = taxasCdi instanceof Map 
    ? taxasCdi 
    : new Map(taxasCdi.map(t => [bcbDateToISO(t.data), t.taxaDiaria]));

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
 */
export function calcularIpcaMaisSpread(
  valorAplicado: number,
  spreadAnualPct: number,
  dataInicio: Date,
  dataFim: Date,
  ipcaMensal: Array<{ data: string; valor: number }> | Map<string, number>,
  holidays: string[] | Set<string>
): number {
  const spreadDiario = calcularTaxaDiariaAnualizada(spreadAnualPct);
  const ipcaMap = ipcaMensal instanceof Map 
    ? ipcaMensal 
    : new Map(ipcaMensal.map(item => [item.data, item.valor]));

  const holidaySet = holidays instanceof Set ? holidays : new Set(holidays);
  const workingDays = getWorkingDaysBetween(dataInicio, dataFim, holidaySet);

  // Cache para evitar recalcular dias úteis do mês repetidamente
  const workingDaysInMonthCache = new Map<string, number>();

  let valorAtual = valorAplicado;
  for (const day of workingDays) {
    const year = day.getFullYear();
    const month = day.getMonth() + 1;

    // IPCA com defasagem M-2
    const target = shiftYearMonth(year, month, 2);
    const targetKey = `${String(target.month).padStart(2, '0')}/${target.year}`;
    const ipcaMensalValor = ipcaMap.get(targetKey) ?? 0;

    // Utiliza cache para a contagem de dias úteis do mês
    const monthKey = `${year}-${month}`;
    let workingDaysInMonth = workingDaysInMonthCache.get(monthKey);
    if (workingDaysInMonth === undefined) {
      const firstDayOfMonth = new Date(year, month - 1, 1);
      const lastDayOfMonth = new Date(year, month, 0);
      workingDaysInMonth = getWorkingDaysBetween(firstDayOfMonth, lastDayOfMonth, holidaySet).length;
      workingDaysInMonthCache.set(monthKey, workingDaysInMonth);
    }

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
 */
export function calcularValorAtualAsset(
  asset: Asset,
  taxasCdi: CdiRate[] | Map<string, number>,
  ipcaMensal: Array<{ data: string; valor: number }> | Map<string, number>,
  holidays: string[] | Set<string>
): number | null {
  const tiposRendaFixa: Array<Asset['tipo']> = ['cdb', 'cri', 'cra', 'debenture', 'coe'];
  if (!tiposRendaFixa.includes(asset.tipo)) return null;
  if (!asset.tipoIndexador || !asset.dataEmissao || asset.valorNominal === undefined) return null;

  const valorAplicado = asset.valorNominal;
  const dataInicio = new Date(asset.dataEmissao);
  const dataFim = new Date();
  
  const holidaySet = holidays instanceof Set ? holidays : new Set(holidays);

  switch (asset.tipoIndexador) {
    case 'prefixado':
      if (asset.taxaContratada === undefined) return null;
      return calcularPrefixado(valorAplicado, asset.taxaContratada, dataInicio, dataFim, holidaySet);

    case 'cdi_percentual':
      if (asset.taxaContratada === undefined) return null;
      return calcularCdiPercentual(
        valorAplicado,
        asset.taxaContratada,
        dataInicio,
        dataFim,
        taxasCdi,
        holidaySet
      );

    case 'cdi_mais_spread':
      if (asset.spreadContratado === undefined) return null;
      return calcularCdiMaisSpread(
        valorAplicado,
        asset.spreadContratado,
        dataInicio,
        dataFim,
        taxasCdi,
        holidaySet
      );

    case 'ipca_mais_spread':
      if (asset.spreadContratado === undefined) return null;
      return calcularIpcaMaisSpread(
        valorAplicado,
        asset.spreadContratado,
        dataInicio,
        dataFim,
        ipcaMensal,
        holidaySet
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
        holidaySet
      );

    case 'igpm_mais_spread':
      return null;

    case 'tr':
      return null;

    default:
      return null;
  }
}