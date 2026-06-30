export interface Client {
  id: string;
  name: string;
  account: string;
  institution: string;
  cpf: string;
  escritorioId?: string; // Ex: "miura", "cx3"
  assessorId?: string;   // ID do assessor que atende
  createdAt: string;
}

export type UserRole = 'master_geral' | 'escritorio_master' | 'assessor' | 'cliente_final';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  escritorioId?: string; // Usado para escritorio_master e assessor
  allowedClientIds?: string[]; // Usado para cliente_final (sua conta e/ou do filho)
  createdAt: string;
}

export type StrategyTargetType = 'monetary' | 'percentage';

export type AssetType =
  | 'acao'
  | 'fii'
  | 'etf'
  | 'bdr'
  | 'fundo'
  | 'cdb'
  | 'cri'
  | 'cra'
  | 'debenture'
  | 'coe'
  | 'cripto'
  | 'conta_corrente'
  | 'valores_em_transito'
  | 'outro';

export type AssetUpdateSource = 'manual' | 'importacao_excel' | 'extrato_btg' | 'api' | 'outro';

export type AssetTargetMode = 'score' | 'percentage';

/**
 * Indexador/tipo de remuneração para ativos de Renda Fixa.
 */
export type AssetIndexer =
  | 'cdi_mais_spread'    // CDI + spread ao ano, ex: CDI + 2% a.a.
  | 'cdi_percentual'     // percentual do CDI, ex: 120% do CDI
  | 'igpm_mais_spread'   // IGPM + spread ao ano, ex: IGPM + 4% a.a.
  | 'igpm_percentual'    // percentual do IGPM, ex: 100% IGPM
  | 'ipca_mais_spread'   // IPCA + spread ao ano, ex: IPCA + 5% a.a.
  | 'prefixado'          // taxa prefixada ao ano, ex: 14.5% a.a.
  | 'ptxv'               // Prefixado com Taxa Variável
  | 'selic'              // percentual da Selic (legado)
  | 'selic_mais_spread'  // Selic + spread ao ano
  | 'selic_percentual'   // percentual da Selic, ex: 100% Selic
  | 'tr';                // atrelado à TR (ex: caderneta)

export type MovementType =
  | 'compra'
  | 'venda'
  | 'rendimento'
  | 'dividendo'
  | 'juros'
  | 'amortizacao'
  | 'aporte'
  | 'retirada'
  | 'ajuste'
  | 'outro';

export interface SubStrategy {
  id: string;
  strategyId: string;
  name: string;
  percentage: number; // % of parent strategy (0-100)
  order: number;
}

export interface Strategy {
  id: string;
  clientId: string;
  name: string;
  targetType: StrategyTargetType;
  targetValue: number; // monetary value OR portfolio percentage (0-100)
  order: number;
  color?: string;
}

export interface Asset {
  id: string;
  clientId: string;
  name: string;
  nomeExibicao: string;
  tipo: string;
  tickerCodigo?: string;
  cnpj?: string;
  isin?: string;
  identificadorExterno?: string;
  quantidade?: number;
  precoUnitario?: number;
  valorPosicao: number;
  isentoIR: boolean;
  moeda: string;
  dataUltimaAtualizacao: string;
  origemAtualizacao: AssetUpdateSource;
  performanceValida?: boolean;
  modoMetaAtivo?: AssetTargetMode;
  valorMetaAtivo?: number;
  // Backward compatibility
  currentValue?: number;
  idealTargetMode?: AssetTargetMode;
  idealTargetValue?: number;
  strategyId?: string;
  subStrategyId?: string;

  // === Renda Fixa ===
  /** Indexador/tipo de remuneração do ativo de renda fixa. */
  tipoIndexador?: AssetIndexer;

  /**
   * Taxa/percentual contratado, conforme o indexador:
   * - prefixado: taxa ao ano (ex: 14.5 = 14,5% a.a.)
   * - cdi_percentual: percentual do CDI (ex: 120 = 120% CDI)
   * - selic: percentual da Selic (ex: 100 = 100% Selic)
   */
  taxaContratada?: number;

  /**
   * Spread contratado ao ano, conforme o indexador:
   * - cdi_mais_spread: ex: 2.0 = CDI + 2% a.a.
   * - ipca_mais_spread: ex: 5.0 = IPCA + 5% a.a.
   * - igpm_mais_spread: ex: 4.0 = IGPM + 4% a.a.
   */
  spreadContratado?: number;

  /** Data de vencimento do ativo (formato ISO: YYYY-MM-DD). */
  dataVencimento?: string;

  /** Data da aplicação/emissão (formato ISO: YYYY-MM-DD). */
  dataEmissao?: string;

  /** Valor nominal aplicado/face inicial em R$. */
  valorNominal?: number;

  /** Indica se o ativo paga cupom/juros ou amortização antes do vencimento. */
  pagaCupom?: boolean;

  /** Periodicidade do pagamento de cupom, quando aplicável. */
  periodicidadeCupom?: 'mensal' | 'trimestral' | 'semestral' | 'anual';

  /**
   * Valor calculado automaticamente pelo motor de renda fixa.
   * Preenchido pelo sistema, não pelo usuário.
   */
  valorCalculadoRF?: number;

  /** ISO timestamp do último cálculo automático de renda fixa. */
  dataUltimoCalculoRF?: string;

  // Referencia ao banco de dados (quando criado a partir do banco)
  referenciaRVId?: string;
  referenciaFundoId?: string;
  referenciaRFId?: string;

  order: number;
  createdAt: string;
}

export interface AssetMovement {
  id: string;
  assetId: string;
  clientId: string;
  data: string;
  tipoMovimentacao: MovementType;
  quantidade?: number;
  valorUnitario?: number;
  valorTotal: number;
  observacao?: string;
}

export interface CdiRate {
  id: string;
  data: string;
  taxaDiaria: number;
  taxaDecimal: number;
  indiceAcumulado: number;
}

export interface IrBracket {
  id: string;
  diasDe: number;
  diasAte?: number;
  aliquota: number;
}

export interface AnbimaHoliday {
  id: string;
  data: string;
  diaSemana: string;
  feriado: string;
}

export interface DraftNote {
  id: string; // assetId or strategyId or subStrategyId
  clientId: string;
  note: string;
  value?: number; // optional manual value for draft column
}

/**
 * Preço manual/global de ativo de renda variável.
 * Usado na sub-aba "Renda Variável" do Banco de Dados.
 */
export interface RendaVariavelPrice {
  id: string;
  tickerCodigo: string;
  classe: string;
  precoUnitario: number;
  /** ISO timestamp da ultima atualizacao do preco via API. */
  atualizadoEm?: string;
}

export interface FundoReferencia {
  id: string;

  // Identificacao
  cnpj: string;
  cnpjNumerico: string;
  codigoAnbima?: string;

  // Nomes
  nomeCompleto: string;
  nomeAbreviado?: string;
  gestora?: string;
  administradora?: string;

  // Classificacao ANBIMA
  classeAnbima?: string;
  subclasseAnbima?: string;

  // Cota (atualizada via ANBIMA Feed)
  cotaAtual?: number;
  dataCota?: string;
  patrimonioLiquido?: number;
  /** Prazo de liquidez do fundo (ex: "1" para D+1, "N/A" sem liquidez). */
  liquidezDPlus?: string;

  // Controle
  ativo: boolean;
  createdAt: string;
  atualizadoEm?: string;
}

export interface RendaFixaReferencia {
  id: string;

  // Codigo identificador (campo "Ativo" do extrato BTG)
  codigo: string;
  codigoCompleto?: string;
  isin?: string;

  // Emissor
  emissor: string;
  cnpjEmissor?: string;

  // Classificacao do titulo
  classe: string;

  // Indexador (caracteristica do titulo - NAO a taxa do cliente)
  tipoIndexador: AssetIndexer;
  taxaContratada?: number;
  spreadContratado?: number;

  // Vencimento
  vencimento: string;
  dataEmissao?: string;

  // Estrutura de pagamentos
  pagaCupom: boolean;
  periodicidadeCupom?: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  pagaAmortizacao?: boolean;

  // Informacoes adicionais
  rating?: string;
  garantiaFGC?: boolean;
  valorMinimoInvestimento?: number;

  // Controle
  createdAt: string;
  atualizadoEm?: string;
}

/**
 * Documentacao dos campos necessarios em StoreData (src/store/useStore.ts):
 * - fundosReferencia: FundoReferencia[]
 * - rendasFixasReferencia: RendaFixaReferencia[]
 */
export interface StoreDataReferenceFields {
  fundosReferencia: FundoReferencia[];
  rendasFixasReferencia: RendaFixaReferencia[];
}

// Computed types for display
export interface PortfolioRow {
  type: 'strategy' | 'substrategy' | 'asset' | 'unclassified';
  id: string;
  label: string;
  strategyId?: string;
  subStrategyId?: string;
  // IDEAL
  idealBookPct: number;   // % within strategy/substrategy context
  idealPortfolioPct: number; // % of total portfolio
  idealValue: number;        // monetary ideal value
  // ATUAL
  currentPct: number;    // % of total portfolio
  currentValue: number;  // monetary actual value
  // BALANCEAMENTO
  balancePct: number;
  balanceValue: number;
  // META
  draftNote: string;
  draftValue?: number;
  children?: PortfolioRow[];
  isExpanded?: boolean;
  color?: string;
  targetType?: StrategyTargetType;
}
