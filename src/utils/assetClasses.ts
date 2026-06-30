/**
 * Lista unica de classes de ativos.
 *
 * Reune, sem duplicar, os valores das 3 colunas de "classe" que existem
 * no Banco de Dados (referencia): RendaVariavelPrice.classe,
 * FundoReferencia.classeAnbima e RendaFixaReferencia.classe.
 *
 * Equivale a uma formula "UNICO()" do Excel aplicada as 3 colunas juntas.
 * Essa lista e a fonte da verdade para o campo "Tipo" do formulario de
 * Novo Ativo: um valor so e aceito ali (manualmente, via planilha de
 * importacao, ou via extrato BTG) se ele existir em uma dessas 3 colunas
 * do Banco de Dados no momento da operacao.
 */

import type { RendaVariavelPrice, FundoReferencia, RendaFixaReferencia, AssetIndexer } from '../types';

/**
 * Normaliza um texto de classe para comparacao "sem acento/caixa".
 * Usada internamente para montar o Set sem duplicar "CDB" e "cdb", por exemplo.
 */
function normalizeClasse(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Monta a lista unica de classes a partir dos 3 bancos de dados de referencia.
 *
 * @param rvPrices Tabela de referencia de Renda Variavel.
 * @param fundosReferencia Tabela de referencia de Fundos de Investimento.
 * @param rendasFixasReferencia Tabela de referencia de Renda Fixa.
 * @returns Lista de classes unicas, na grafia original (primeira ocorrencia),
 *          ordenada alfabeticamente.
 */
export function buildUniqueAssetClasses(
  rvPrices: RendaVariavelPrice[],
  fundosReferencia: FundoReferencia[],
  rendasFixasReferencia: RendaFixaReferencia[],
): string[] {
  // Map de chave normalizada -> grafia original (primeira que aparecer "ganha").
  const seen = new Map<string, string>();

  const register = (raw: string | undefined) => {
    const value = (raw ?? '').trim();
    if (!value) return;
    const key = normalizeClasse(value);
    if (!seen.has(key)) seen.set(key, value);
  };

  rvPrices.forEach(r => register(r.classe));
  fundosReferencia.forEach(f => register(f.classeAnbima));
  rendasFixasReferencia.forEach(r => register(r.classe));

  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Verifica se um valor de "Tipo" digitado (planilha, extrato BTG, etc.)
 * corresponde a alguma classe existente no Banco de Dados.
 *
 * Usada pelas rotinas de importacao para decidir se um valor de
 * preenchimento livre deve ser aceito ou ignorado (substituido por
 * undefined/'outro'), evitando que a planilha "force" um Tipo que nao
 * existe de fato no catalogo de ativos.
 *
 * @param value Texto a validar (ex: vindo de uma celula de planilha).
 * @param uniqueClasses Lista unica de classes, ja calculada via buildUniqueAssetClasses.
 * @returns A grafia oficial da classe (do Banco de Dados) se houver match, ou undefined.
 */
export function matchAssetClass(value: string, uniqueClasses: string[]): string | undefined {
  const key = normalizeClasse(value);
  if (!key) return undefined;
  return uniqueClasses.find(c => normalizeClasse(c) === key);
}
/**
 * Resultado de uma busca de ativo no Banco de Dados (catalogo) a partir
 * de um texto (geralmente a coluna "Nome" de uma planilha importada ou
 * o nome reconhecido em um extrato BTG).
 *
 * Espelha o que selectSuggestion() faz no formulario manual de Novo Ativo
 * (em AssetManager.tsx), mas para uso em lote — importacao de planilha
 * ou de extrato BTG (ver handleImportFile e PositionUpdateDashboard).
 */
export interface CatalogMatch {
  source: 'rv' | 'fundo' | 'rf';
  referenciaId: string;
  tipo: string;
  tickerCodigo?: string;
  cnpj?: string;
  codigoRF?: string;
  vencimentoRF?: string;
  tipoIndexadorRF?: AssetIndexer;
  taxaContratadaRF?: number;
  spreadContratadoRF?: number;
}



/**
 * Busca um ativo no Banco de Dados de referencia (RV, Fundos ou RF) a
 * partir do nome digitado e, secundariamente, do ticker/CNPJ informados.
 *
 * Regras de busca (cada bloco tem sua propria regra, definida com o
 * usuario para refletir como cada mercado realmente identifica um ativo):
 *  - Renda Variavel: nome OU ticker batem com a coluna Ticker/Codigo.
 *  - Fundos: nome bate com Nome do Fundo, OU cnpj bate com a coluna CNPJ.
 *  - Renda Fixa: SOMENTE o nome bate com a coluna Codigo Completo
 *    (codigo isolado nao e usado como chave de busca aqui).
 *
 * Quando ha match, TODOS os campos automaticos devem vir do item
 * encontrado no catalogo — nunca do texto que a fonte de importacao
 * (planilha ou extrato BTG) trouxer nessas colunas.
 */
export function findCatalogMatch(
  name: string,
  hintTickerCodigo: string,
  hintCnpj: string,
  rvPrices: RendaVariavelPrice[],
  fundosReferencia: FundoReferencia[],
  rendasFixasReferencia: RendaFixaReferencia[],
): CatalogMatch | undefined {
  const nameKey = normalizeClasse(name);
  const tickerKey = normalizeClasse(hintTickerCodigo);
  const cnpjDigits = hintCnpj.replace(/\D/g, '');

  const rv = rvPrices.find(r =>
    normalizeClasse(r.tickerCodigo) === nameKey || (tickerKey && normalizeClasse(r.tickerCodigo) === tickerKey)
  );
  if (rv) {
    return { source: 'rv', referenciaId: rv.id, tipo: rv.classe, tickerCodigo: rv.tickerCodigo };
  }

  const fundo = fundosReferencia.find(f =>
    normalizeClasse(f.nomeCompleto) === nameKey || (cnpjDigits && f.cnpjNumerico === cnpjDigits)
  );
  if (fundo) {
    return { source: 'fundo', referenciaId: fundo.id, tipo: fundo.classeAnbima ?? '', cnpj: fundo.cnpj };
  }

    const rf = rendasFixasReferencia.find(r => r.codigoCompleto && normalizeClasse(r.codigoCompleto) === nameKey);
  if (rf) {
    return {
      source: 'rf',
      referenciaId: rf.id,
      tipo: rf.classe,
      codigoRF: rf.codigo,
      vencimentoRF: rf.vencimento,
      tipoIndexadorRF: rf.tipoIndexador,
      taxaContratadaRF: rf.taxaContratada,
      spreadContratadoRF: rf.spreadContratado,
    };
  }

  return undefined;
}