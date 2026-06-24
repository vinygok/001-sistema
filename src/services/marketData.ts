import type { Asset } from '../types';

const RV_ASSET_TYPES: Array<Asset['tipo']> = ['acao', 'fii', 'etf', 'bdr', 'cripto'];

interface BrapiQuoteResult {
  results?: Array<{
    symbol?: string;
    regularMarketPrice?: number;
  }>;
}

/**
 * Busca a cotação de um único ticker na API do brapi.dev.
 * @param ticker Código do ativo (ex: 'PETR4').
 * @param token Token de autenticação da brapi.dev.
 * @returns Preço de mercado regular do ativo.
 */
export async function fetchQuote(ticker: string, token: string): Promise<number> {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erro ao buscar cotação de ${ticker}: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as BrapiQuoteResult;
  const result = data.results?.[0];

  if (result?.regularMarketPrice === undefined || result.regularMarketPrice === null) {
    throw new Error(`Cotação não encontrada para ${ticker}`);
  }

  return result.regularMarketPrice;
}

/**
 * Busca cotações de múltiplos tickers em paralelo.
 * @param tickers Array de códigos de ativos.
 * @param token Token de autenticação da brapi.dev.
 * @returns Map com ticker como chave e preço como valor.
 */
export async function fetchMultipleQuotes(
  tickers: string[],
  token: string
): Promise<Map<string, number>> {
  const quotes = new Map<string, number>();

  const results = await Promise.all(
    tickers.map(async ticker => {
      try {
        const price = await fetchQuote(ticker, token);
        return { ticker, price, success: true as const };
      } catch (error) {
        console.error(`Falha ao buscar cotação de ${ticker}:`, error);
        return { ticker, error, success: false as const };
      }
    })
  );

  for (const result of results) {
    if (result.success) {
      quotes.set(result.ticker, result.price);
    }
  }

  return quotes;
}

/**
 * Atualiza os preços de ativos de renda variável com cotações da brapi.dev.
 * @param assets Array de ativos a serem avaliados.
 * @param token Token de autenticação da brapi.dev.
 * @returns Novo array de ativos com preços atualizados quando aplicável.
 */
export async function updateAssetPrices(assets: Asset[], token: string): Promise<Asset[]> {
  const eligibleAssets = assets.filter(
    asset => RV_ASSET_TYPES.includes(asset.tipo) && asset.tickerCodigo && asset.tickerCodigo.trim() !== ''
  );

  const tickers = eligibleAssets.map(asset => asset.tickerCodigo!);
  const quotes = await fetchMultipleQuotes(tickers, token);

  return assets.map(asset => {
    if (!RV_ASSET_TYPES.includes(asset.tipo) || !asset.tickerCodigo) {
      return asset;
    }

    const price = quotes.get(asset.tickerCodigo);
    if (price === undefined) {
      return asset;
    }

    const quantidade = asset.quantidade ?? 0;
    const valorPosicao = quantidade * price;

    return {
      ...asset,
      precoUnitario: price,
      valorPosicao,
      dataUltimaAtualizacao: new Date().toISOString(),
      origemAtualizacao: 'api',
    };
  });
}
