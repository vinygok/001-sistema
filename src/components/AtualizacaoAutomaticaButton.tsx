import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Settings, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { updateAssetPrices } from '../services/marketData';
import { updateFundPositions } from '../services/fundos';
import { fetchCdiDiario, fetchIpcaMensal } from '../services/bcbIndicadores';
import { calcularValorAtualAsset } from '../utils/rendaFixa';
import Modal from './Modal';
import type { Asset } from '../types';

interface GestorConfig {
  brapiToken: string;
  anbimaClientId: string;
  anbimaClientSecret: string;
  atualizarRV: boolean;
  atualizarFundos: boolean;
  calcularRF: boolean;
  buscarBcb: boolean;
}

interface ResultadoAtualizacao {
  sucesso: boolean;
  parcial: boolean;
  dataHora: string;
  rvAtualizados: number;
  rvFalhas: number;
  fundosAtualizados: number;
  fundosFalhas: number;
  cdiImportados: number;
  rfCalculados: number;
  rfFalhas: number;
  erros: number;
}

const CONFIG_KEY = 'gestorConfig';
const LAST_UPDATE_KEY = 'ultimaAtualizacao';

const defaultConfig: GestorConfig = {
  brapiToken: '',
  anbimaClientId: '',
  anbimaClientSecret: '',
  atualizarRV: true,
  atualizarFundos: true,
  calcularRF: true,
  buscarBcb: true,
};

function formatDateBCB(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}

export default function AtualizacaoAutomaticaButton() {
  const store = useStore();
  const clientId = store.selectedClientId;

  const [config, setConfig] = useState<GestorConfig>(defaultConfig);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAtualizacao | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);
  const [ipcaMensal, setIpcaMensal] = useState<Array<{ data: string; valor: number }>>([]);

  // Carrega configurações e última atualização do localStorage
  useEffect(() => {
    try {
      const rawConfig = localStorage.getItem(CONFIG_KEY);
      if (rawConfig) {
        const parsed = JSON.parse(rawConfig) as Partial<GestorConfig>;
        setConfig(prev => ({ ...prev, ...parsed }));
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }

    try {
      const rawLast = localStorage.getItem(LAST_UPDATE_KEY);
      if (rawLast) {
        setUltimaAtualizacao(rawLast);
      }
    } catch (error) {
      console.error('Erro ao carregar última atualização:', error);
    }
  }, []);

  const handleSaveConfig = useCallback(() => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      setShowModal(false);
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
    }
  }, [config]);

  const clientAssets = useMemo<Asset[]>(() => {
    if (!clientId) return [];
    return store.assets.filter((a: Asset) => a.clientId === clientId);
  }, [store.assets, clientId]);

  const handleAtualizar = useCallback(async () => {
    if (!clientId) return;

    setLoading(true);
    setResultado(null);

    const res: ResultadoAtualizacao = {
      sucesso: true,
      parcial: false,
      dataHora: formatDateTime(new Date()),
      rvAtualizados: 0,
      rvFalhas: 0,
      fundosAtualizados: 0,
      fundosFalhas: 0,
      cdiImportados: 0,
      rfCalculados: 0,
      rfFalhas: 0,
      erros: 0,
    };

    const dataFim = new Date();
    const dataInicio = new Date();
    dataInicio.setFullYear(dataInicio.getFullYear() - 2);

    const dataInicialStr = formatDateBCB(dataInicio);
    const dataFinalStr = formatDateBCB(dataFim);

    try {
      // ETAPA 1 — CDI do BCB
      if (config.buscarBcb) {
        try {
          const cdiRates = await fetchCdiDiario(dataInicialStr, dataFinalStr);
          if (cdiRates.length > 0) {
            store.setCdiRates(cdiRates.map(({ data, taxaDiaria, taxaDecimal }) => ({
              data,
              taxaDiaria,
              taxaDecimal,
            })));
            res.cdiImportados = cdiRates.length;
          }
        } catch (error) {
          console.error('Erro ao buscar CDI do BCB:', error);
          res.erros += 1;
        }
      }

      // ETAPA 2 — IPCA do BCB
      let localIpca: Array<{ data: string; valor: number }> = [];
      if (config.buscarBcb) {
        try {
          localIpca = await fetchIpcaMensal(dataInicialStr, dataFinalStr);
          setIpcaMensal(localIpca);
        } catch (error) {
          console.error('Erro ao buscar IPCA do BCB:', error);
          res.erros += 1;
        }
      }

      // ETAPA 3 — Renda Variável via brapi.dev
      if (config.atualizarRV && config.brapiToken) {
        try {
          const tiposRV: Array<Asset['tipo']> = ['acao', 'fii', 'etf', 'bdr', 'cripto'];
          const assetsRV = clientAssets.filter(
            a => tiposRV.includes(a.tipo) && a.tickerCodigo && a.tickerCodigo.trim() !== ''
          );

          if (assetsRV.length > 0) {
            const atualizados = await updateAssetPrices(assetsRV, config.brapiToken);
            const atualizadosMap = new Map(atualizados.map(a => [a.id, a]));

            for (const original of assetsRV) {
              const atualizado = atualizadosMap.get(original.id);
              if (atualizado && atualizado.precoUnitario !== undefined && atualizado.precoUnitario !== original.precoUnitario) {
                store.updateAsset(original.id, {
                  precoUnitario: atualizado.precoUnitario,
                  valorPosicao: atualizado.valorPosicao,
                  dataUltimaAtualizacao: new Date().toISOString(),
                  origemAtualizacao: 'api',
                });
                res.rvAtualizados += 1;
              } else {
                res.rvFalhas += 1;
              }
            }
          }
        } catch (error) {
          console.error('Erro ao atualizar Renda Variável:', error);
          res.erros += 1;
        }
      }

      // ETAPA 4 — Fundos via ANBIMA
      if (config.atualizarFundos && config.anbimaClientId && config.anbimaClientSecret) {
        try {
          const assetsFundos = clientAssets.filter(
            a => a.tipo === 'fundo' && a.cnpj && a.cnpj.trim() !== ''
          );

          if (assetsFundos.length > 0) {
            const atualizados = await updateFundPositions(
              assetsFundos,
              config.anbimaClientId,
              config.anbimaClientSecret
            );
            const atualizadosMap = new Map(atualizados.map(a => [a.id, a]));

            for (const original of assetsFundos) {
              const atualizado = atualizadosMap.get(original.id);
              if (atualizado && atualizado.precoUnitario !== undefined && atualizado.precoUnitario !== original.precoUnitario) {
                store.updateAsset(original.id, {
                  precoUnitario: atualizado.precoUnitario,
                  valorPosicao: atualizado.valorPosicao,
                  dataUltimaAtualizacao: new Date().toISOString(),
                  origemAtualizacao: 'api',
                });
                res.fundosAtualizados += 1;
              } else {
                res.fundosFalhas += 1;
              }
            }
          }
        } catch (error) {
          console.error('Erro ao atualizar Fundos:', error);
          res.erros += 1;
        }
      }

      // ETAPA 5 — Renda Fixa
      if (config.calcularRF) {
        try {
          const tiposRF: Array<Asset['tipo']> = ['cdb', 'cri', 'cra', 'debenture', 'coe'];
          const assetsRF = clientAssets.filter(
            a => tiposRF.includes(a.tipo) && a.tipoIndexador && a.dataEmissao && a.valorNominal !== undefined
          );

          for (const asset of assetsRF) {
            try {
              const valorCalculado = calcularValorAtualAsset(asset, store.cdiRates, localIpca.length > 0 ? localIpca : ipcaMensal, []);
              if (valorCalculado !== null) {
                const quantidade = asset.quantidade ?? 0;
                store.updateAsset(asset.id, {
                  valorPosicao: valorCalculado,
                  valorCalculadoRF: valorCalculado,
                  dataUltimoCalculoRF: new Date().toISOString(),
                  origemAtualizacao: 'api',
                  ...(quantidade > 0 ? { precoUnitario: valorCalculado / quantidade } : {}),
                });
                res.rfCalculados += 1;
              } else {
                res.rfFalhas += 1;
              }
            } catch (error) {
              console.error(`Erro ao calcular RF do ativo ${asset.name}:`, error);
              res.rfFalhas += 1;
            }
          }
        } catch (error) {
          console.error('Erro ao calcular Renda Fixa:', error);
          res.erros += 1;
        }
      }

      res.parcial = res.erros > 0 || res.rvFalhas > 0 || res.fundosFalhas > 0 || res.rfFalhas > 0;
      res.sucesso = res.rvAtualizados > 0 || res.fundosAtualizados > 0 || res.cdiImportados > 0 || res.rfCalculados > 0 || res.erros === 0;

      const lastUpdateText = formatDateTime(new Date());
      localStorage.setItem(LAST_UPDATE_KEY, lastUpdateText);
      setUltimaAtualizacao(lastUpdateText);
      setResultado(res);
    } catch (error) {
      console.error('Erro inesperado na atualização:', error);
      setResultado({
        ...res,
        sucesso: false,
        parcial: true,
        erros: res.erros + 1,
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, clientAssets, config, store, ipcaMensal]);

  const handleInputChange = useCallback((field: keyof GestorConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  }, []);

  const nenhumaEtapaHabilitada = !config.atualizarRV && !config.atualizarFundos && !config.calcularRF && !config.buscarBcb;
  const semCliente = !clientId;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={handleAtualizar}
          disabled={loading || semCliente || nenhumaEtapaHabilitada}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
            loading || semCliente || nenhumaEtapaHabilitada
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {loading ? 'Atualizando...' : '🔄 Atualizar Posições'}
        </button>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
          title="Configurações de atualização"
        >
          <Settings size={16} />
          Config
        </button>
      </div>

      {semCliente && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Selecione um cliente para atualizar as posições.
        </p>
      )}

      {!semCliente && nenhumaEtapaHabilitada && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Nenhuma etapa de atualização está habilitada. Configure pelo ícone ⚙️.
        </p>
      )}

      {ultimaAtualizacao && (
        <p className="text-xs text-gray-500">
          🕐 Última atualização: {ultimaAtualizacao}
        </p>
      )}

      {resultado && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            resultado.parcial
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-green-50 border-green-200 text-green-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {resultado.parcial ? <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" /> : <CheckCircle size={18} className="mt-0.5 flex-shrink-0" />}
            <div className="flex-1">
              <p className="font-semibold">
                {resultado.parcial ? 'Atualização concluída com ressalvas' : 'Atualização concluída!'}
              </p>
              <p className="text-xs opacity-80 mb-2">🕐 {resultado.dataHora}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                {config.buscarBcb && <span>🧮 CDI: {resultado.cdiImportados} registros importados</span>}
                {config.atualizarRV && <span>📈 Renda Variável: {resultado.rvAtualizados} atualizados {resultado.rvFalhas > 0 && `(${resultado.rvFalhas} falhas)`}</span>}
                {config.atualizarFundos && <span>🏢 Fundos: {resultado.fundosAtualizados} atualizados {resultado.fundosFalhas > 0 && `(${resultado.fundosFalhas} falhas)`}</span>}
                {config.calcularRF && <span>💰 Renda Fixa: {resultado.rfCalculados} calculados {resultado.rfFalhas > 0 && `(${resultado.rfFalhas} falhas)`}</span>}
                {resultado.erros > 0 && <span>⚠️ Erros: {resultado.erros} (ver console)</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <Modal
          title="Configurações de Atualização Automática"
          onClose={() => setShowModal(false)}
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">BRAPI Token</label>
              <input
                type="password"
                value={config.brapiToken}
                onChange={e => handleInputChange('brapiToken', e.target.value)}
                placeholder="cole seu token da brapi.dev"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ANBIMA Client ID</label>
              <input
                type="text"
                value={config.anbimaClientId}
                onChange={e => handleInputChange('anbimaClientId', e.target.value)}
                placeholder="client id da ANBIMA"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ANBIMA Client Secret</label>
              <input
                type="password"
                value={config.anbimaClientSecret}
                onChange={e => handleInputChange('anbimaClientSecret', e.target.value)}
                placeholder="client secret da ANBIMA"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.atualizarRV}
                  onChange={e => handleInputChange('atualizarRV', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Atualizar Renda Variável automaticamente
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.atualizarFundos}
                  onChange={e => handleInputChange('atualizarFundos', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Atualizar Fundos automaticamente
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.calcularRF}
                  onChange={e => handleInputChange('calcularRF', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Calcular Renda Fixa automaticamente
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.buscarBcb}
                  onChange={e => handleInputChange('buscarBcb', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Buscar CDI/IPCA do BCB automaticamente
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveConfig}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
