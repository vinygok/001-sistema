import type { Asset } from '../types';

interface AnbimaTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface AnbimaFundoItem {
  codigo?: string;
  cnpj?: string;
  nome?: string;
}

interface AnbimaFundosResponse {
  fundos?: AnbimaFundoItem[];
}

interface AnbimaCotaItem {
  data?: string;
  cota?: number;
  valorCota?: number;
  dataReferencia?: string;
}

interface AnbimaSerieHistoricaResponse {
  serie?: AnbimaCotaItem[];
  registros?: AnbimaCotaItem[];
}

/**
 * Remove formatação do CNPJ, deixando apenas os números.
 */
function sanitizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

/**
 * Obtém o token de acesso OAuth2 da API ANBIMA.
 */
export async function getAnbimaToken(clientId: string, clientSecret: string): Promise<string> {
  const url = 'https://api.anbima.com.br/oauth/access-token';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Erro ao autenticar na ANBIMA: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as AnbimaTokenResponse;

  if (!data.access_token) {
    throw new Error('Token de acesso não retornado pela ANBIMA');
  }

  return data.access_token;
}

export interface AnbimaFundoDetalhe {
  codigo?: string;
  cnpj?: string;
  nome?: string;
  nomeAbreviado?: string;
  gestor?: string;
  administrador?: string;
  classe?: string;
  subclasse?: string;
}

/**
 * Busca o código ANBIMA de um fundo pelo CNPJ.
 * Retorna null se não encontrado.
 */
export async function searchFundoByCnpj(cnpj: string, token: string): Promise<string | null> {
  const cnpjLimpo = sanitizeCnpj(cnpj);
  const url = `https://api.anbima.com.br/feed/fundos/v2/fundos?cnpj=${encodeURIComponent(cnpjLimpo)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar fundo pelo CNPJ ${cnpj}: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as AnbimaFundosResponse | AnbimaFundoItem[];

  const fundos = Array.isArray(data) ? data : data.fundos ?? [];
  const fundo = fundos.find(f => f.codigo);

  return fundo?.codigo ?? null;
}

/**
 * Busca os detalhes de um fundo pelo CNPJ na API ANBIMA.
 * Retorna os dados básicos (nome, gestor, classe etc.) ou null.
 */
export async function fetchFundoDetailsByCnpj(cnpj: string, token: string): Promise<AnbimaFundoDetalhe | null> {
  const cnpjLimpo = sanitizeCnpj(cnpj);
  const url = `https://api.anbima.com.br/feed/fundos/v2/fundos?cnpj=${encodeURIComponent(cnpjLimpo)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar detalhes do fundo pelo CNPJ ${cnpj}: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as AnbimaFundosResponse | AnbimaFundoDetalhe[];

  const fundos = Array.isArray(data) ? data : data.fundos ?? [];
  const fundo = fundos.find(f => f.cnpj || f.codigo);
  if (!fundo) return null;

  return {
    codigo: fundo.codigo,
    cnpj: fundo.cnpj,
    nome: fundo.nome,
    nomeAbreviado: (fundo as AnbimaFundoDetalhe).nomeAbreviado,
    gestor: (fundo as AnbimaFundoDetalhe).gestor,
    administrador: (fundo as AnbimaFundoDetalhe).administrador,
    classe: (fundo as AnbimaFundoDetalhe).classe,
    subclasse: (fundo as AnbimaFundoDetalhe).subclasse,
  };
}

/**
 * Busca a cota mais recente de um fundo pelo código ANBIMA.
 */
export async function fetchCotaFundo(
  codigoAnbima: string,
  token: string
): Promise<{ data: string; cota: number } | null> {
  const url = `https://api.anbima.com.br/feed/fundos/v2/fundos/${encodeURIComponent(
    codigoAnbima
  )}/serie-historica`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`Erro ao buscar cota do fundo ${codigoAnbima}: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = (await response.json()) as AnbimaSerieHistoricaResponse | AnbimaCotaItem[];
  const serie = Array.isArray(data) ? data : data.serie ?? data.registros ?? [];

  if (!serie.length) {
    return null;
  }

  const latest = serie[serie.length - 1];
  const dataCota = latest.data ?? latest.dataReferencia ?? '';
  const valorCota = latest.cota ?? latest.valorCota;

  if (dataCota === '' || valorCota === undefined || valorCota === null) {
    return null;
  }

  return { data: dataCota, cota: valorCota };
}

/**
 * Atualiza as posições de fundos de investimento via ANBIMA Feed API v2.
 */
export async function updateFundPositions(
  assets: Asset[],
  clientId: string,
  clientSecret: string
): Promise<Asset[]> {
  const token = await getAnbimaToken(clientId, clientSecret);

  const fundos = assets.filter(
    asset => asset.tipo === 'fundo' && asset.cnpj && asset.cnpj.trim() !== ''
  );

  const cotacoes = new Map<string, number>();

  await Promise.all(
    fundos.map(async asset => {
      try {
        if (!asset.cnpj) return;
        const codigo = await searchFundoByCnpj(asset.cnpj, token);
        if (!codigo) {
          console.warn(`Código ANBIMA não encontrado para o fundo ${asset.name} (${asset.cnpj})`);
          return;
        }
        const cota = await fetchCotaFundo(codigo, token);
        if (cota && asset.cnpj) {
          cotacoes.set(asset.cnpj, cota.cota);
        }
      } catch (error) {
        console.error(`Falha ao atualizar fundo ${asset.name}:`, error);
      }
    })
  );

  return assets.map(asset => {
    if (asset.tipo !== 'fundo' || !asset.cnpj) {
      return asset;
    }

    const cota = cotacoes.get(asset.cnpj);
    if (cota === undefined) {
      return asset;
    }

    const quantidade = asset.quantidade ?? 0;
    const valorPosicao = quantidade * cota;

    return {
      ...asset,
      precoUnitario: cota,
      valorPosicao,
      dataUltimaAtualizacao: new Date().toISOString(),
      origemAtualizacao: 'api',
    };
  });
}
