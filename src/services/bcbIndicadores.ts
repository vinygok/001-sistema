import { v4 as uuidv4 } from 'uuid';
import type { CdiRate } from '../types';

/** Códigos das séries SGS do Banco Central do Brasil. */
export const BCB_CDI_DIARIO = 12;
export const BCB_SELIC_DIARIA = 11;
export const BCB_IPCA_MENSAL = 433;
export const BCB_IGPM_MENSAL = 189;

interface BcbSerieItem {
  data: string;
  valor: string;
}

/**
 * Busca uma série estatística do SGS/BCB em um intervalo de datas.
 * @param codigoSerie Código da série no SGS.
 * @param dataInicial Data inicial no formato dd/MM/yyyy.
 * @param dataFinal Data final no formato dd/MM/yyyy.
 */
export async function fetchSerieBCB(
  codigoSerie: number,
  dataInicial: string,
  dataFinal: string
): Promise<BcbSerieItem[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigoSerie}/dados?formato=json&dataInicial=${encodeURIComponent(
    dataInicial
  )}&dataFinal=${encodeURIComponent(dataFinal)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erro ao buscar série ${codigoSerie} do BCB: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as BcbSerieItem[];
  return data;
}

/**
 * Busca a série diária do CDI e converte para o formato CdiRate do sistema.
 * O índice acumulado começa em 100 e é multiplicado dia a dia por (1 + taxaDiaria).
 */
export async function fetchCdiDiario(dataInicial: string, dataFinal: string): Promise<CdiRate[]> {
  const items = await fetchSerieBCB(BCB_CDI_DIARIO, dataInicial, dataFinal);

  let indiceAcumulado = 100;

  return items.map(item => {
    const taxaDiaria = parseFloat(item.valor.replace(',', '.')) / 100;
    const taxaDecimal = taxaDiaria;
    indiceAcumulado = indiceAcumulado * (1 + taxaDiaria);

    return {
      id: uuidv4(),
      data: item.data,
      taxaDiaria,
      taxaDecimal,
      indiceAcumulado,
    };
  });
}

/**
 * Converte uma data no formato dd/MM/yyyy para MM/YYYY.
 * Se a entrada já estiver em outro formato, retorna o valor original.
 */
function parseToMonthYear(data: string): string {
  const parts = data.split('/');
  if (parts.length === 3) {
    const [, month, year] = parts;
    return `${month}/${year}`;
  }
  return data;
}

/**
 * Busca a série mensal do IPCA no BCB.
 * Retorna os valores como percentuais numéricos (ex: 0.44).
 */
export async function fetchIpcaMensal(
  dataInicial: string,
  dataFinal: string
): Promise<Array<{ data: string; valor: number }>> {
  const items = await fetchSerieBCB(BCB_IPCA_MENSAL, dataInicial, dataFinal);

  return items.map(item => ({
    data: parseToMonthYear(item.data),
    valor: parseFloat(item.valor.replace(',', '.')),
  }));
}

/**
 * Busca os últimos 5 registros do CDI disponíveis no BCB.
 * Retorna o registro mais recente ou null se não houver dados.
 */
export async function fetchUltimoCdiDisponivel(): Promise<CdiRate | null> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BCB_CDI_DIARIO}/dados/ultimos/5?formato=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erro ao buscar último CDI do BCB: ${response.status} ${response.statusText}`);
  }

  const items = (await response.json()) as BcbSerieItem[];
  if (!items.length) return null;

  const latest = items[items.length - 1];
  const taxaDiaria = parseFloat(latest.valor.replace(',', '.')) / 100;

  return {
    id: uuidv4(),
    data: latest.data,
    taxaDiaria,
    taxaDecimal: taxaDiaria,
    indiceAcumulado: 100,
  };
}
