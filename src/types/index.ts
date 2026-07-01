// ============================================================================
// DEFINIÇÕES E CONTRATOS DO SISTEMA (Meros Wealth Management)
// ============================================================================

/** Contrato de Cliente (Representa a carteira do investidor) */
export interface Client {
  id: string;
  name: string;
  account: string;
  institution: string;
  cpf: string;
  // VÍNCULOS MULTI-TENANT (SaaS B2B)
  escritorioId?: string;       // ID curto do escritório ao qual o cliente pertence (ex: "miura", "cx3")
  assessorId?: string;         // ID do assessor específico responsável pelo atendimento
  clienteFinalUserId?: string; // ID do usuário final (auto-service) para permissão de leitura mobile/web
  createdAt: string;
}

/** Níveis de Acesso (Papéis) suportados pela Cascata de Gerenciamento */
export type UserRole = 'master_geral' | 'escritorio_master' | 'assessor' | 'cliente_final';

/** Contrato de Escritório Parceiro (Cliente B2B da Meros Capital) */
export interface EscritorioParceiro {
  id: string;      // Identificador único curto sem espaços (ex: "miura", "cx3")
  name: string;    // Nome oficial completo (ex: "Miura Investimentos")
  ativo: boolean;  // Controle de adimplência: true = liberado, false = suspenso (bloqueia todos os assessores)
  createdAt: string;
}

/** Contrato de Usuário do Sistema (Logins de Acesso) */
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  escritorioId?: string; // Usado para escritorio_master e assessor
  allowedClientIds?: string[]; // Usado para cliente_final (sua conta e/ou do filho)
  ativo?: boolean; // true = liberado, false = suspenso por inadimplência
  isCoMaster?: boolean; // true = Assessor com privilégio master (Co-Gestor) do escritório
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

/** Indexadores suportados pelo motor matemático de Renda Fixa */
export type AssetIndexer =
  | 'cdi_mais_spread'    // CDI + spread ao ano, ex: CDI + 2% a.a.
  | 'cdi_percentual'     // percentual do CDI, ex: 120% do CDI
  | 'igpm_mais_spread'   // IGP-M + spread ao ano, ex: IGP-M + 4% a.a.
  | 'igpm_percentual'    // percentual do IGP-M, ex: 100% IGP-M
  | 'ipca_mais_spread'   // IPCA + spread ao ano, ex: IPCA + 5% a.a.
  | 'prefixado'          // taxa prefixada ao ano, ex: 14.5% a.a.
  | 'ptxv'               // Prefixado com Taxa Variável
  | 'selic'              // percentual da Selic (legado)
  | 'selic_mais_spread'  // Selic + spread ao ano, ex: Selic + 1% a.a.
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
  | 'outro';

export interface AssetMovement {
  id: string;
  clientId: string;
  assetId: string;
  data: string;
  tipoMovimentacao: MovementType;
  quantidade?: number;
  valorUnitario?: number;
  valorTotal?: number;
  observacao?: string;
  origem: AssetUpdateSource;
  createdAt: string;
}

export interface Asset {
  id: string;
  clientId: string;
  name: string;
  nomeExibicao: string;
  tipo: AssetType;
  tickerCodigo?: string;
  cnpj?: string;
  isin?: string;
  identificadorExterno?: string;
  quantidade?: number;
  precoUnitario?: number;
  valorPosicao?: number;
  isentoIR: boolean;
  moeda: string;
  dataUltimaAtualizacao: string;
  origemAtualizacao: AssetUpdateSource;
  performanceValida?: boolean;
  modoMetaAtivo?: AssetTargetMode;
  valorMetaAtivo?: number;
  currentValue?: number;
  idealTargetMode?: AssetTargetMode;
  idealTargetValue?: number;
  strategyId?: string;
  subStrategyId?: string;
  tipoIndexador?: AssetIndexer;
  taxaContratada?: number;
  spreadContratado?: number;
  dataVencimento?: string;
  dataEmissao?: string;
  pagaCupom?: boolean;
  periodicidadeCupom?: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  pagaAmortizacao?: boolean;
  garantiaFGC?: boolean;
  order: number;
  referenciaRVId?: string;
  referenciaFundoId?: string;
  referenciaRFId?: string;
  createdAt: string;
}

export interface Strategy {
  id: string;
  clientId: string;
  name: string;
  targetType: StrategyTargetType;
  idealValue: number;
  order: number;
}

export interface SubStrategy {
  id: string;
  strategyId: string;
  name: string;
  idealBookPct: number;
  order: number;
}

export interface DraftNote {
  id: string;
  clientId: string;
  note: string;
  value?: number;
}

export interface CdiRate {
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

export interface RendaVariavelPrice {
  id: string;
  tickerCodigo: string;
  classe: string;
  precoUnitario: number;
  atualizadoEm?: string;
}

export interface FundoReferencia {
  id: string;
  cnpj: string;
  cnpjNumerico: string;
  nomeCompleto: string;
  nomeAbreviado?: string;
  gestora?: string;
  classeAnbima?: string;
  subclasseAnbima?: string;
  cotaAtual?: number;
  dataCota?: string;
  patrimonioLiquido?: number;
  liquidezDPlus?: string;
  ativo: boolean;
  createdAt: string;
  atualizadoEm?: string;
}

export interface RendaFixaReferencia {
  id: string;
  codigo: string;
  codigoCompleto?: string;
  isin?: string;
  emissor: string;
  cnpjEmissor?: string;
  classe: string;
  tipoIndexador: AssetIndexer;
  taxaContratada?: number;
  spreadContratado?: number;
  vencimento: string;
  dataEmissao?: string;
  pagaCupom: boolean;
  periodicidadeCupom?: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  pagaAmortizacao?: boolean;
  rating?: string;
  garantiaFGC?: boolean;
  valorMinimoInvestimento?: number;
  createdAt: string;
  atualizadoEm?: string;
}

export interface StoreDataReferenceFields {
  fundosReferencia: FundoReferencia[];
  rendasFixasReferencia: RendaFixaReferencia[];
}

export interface PortfolioRow {
  type: 'strategy' | 'substrategy' | 'asset' | 'unclassified';
  id: string;
  label: string;
  strategyId?: string;
  subStrategyId?: string;
  idealBookPct: number;
  idealPortfolioPct: number;
  idealValue: number;
  currentPct: number;
  currentValue: number;
  balanceValue: number;
  asset?: Asset;
  children?: PortfolioRow[];
}

export interface GeneralClientRow {
  id: string;
  name: string;
  account: string;
  institution: string;
  totalValue: number;
  strategiesCount: number;
  assetsCount: number;
  isBalanced: boolean;
}