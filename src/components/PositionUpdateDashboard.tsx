import { useMemo, useState, type ChangeEvent } from 'react';
import { FileUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { buildPreviewRows, parseBtgWorkbook, type PreviewRow } from '../services/btgPositionImport';
import { formatCurrency } from '../utils/portfolio';

interface ImportSummary {
  updated: number;
  created: number;
  ignored: number;
  dataReferencia?: string;
}

export default function PositionUpdateDashboard() {
  const store = useStore();
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dataReferencia, setDataReferencia] = useState<string | undefined>();
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const clientId = store.selectedClientId;
  const client = store.selectedClient;

  const clientAssets = useMemo(
    () => store.assets.filter(asset => asset.clientId === clientId).sort((a, b) => a.name.localeCompare(b.name)),
    [store.assets, clientId, refreshKey]
  );

  if (!clientId || !client) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
        <FileUp size={48} className="mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium">Selecione um cliente</p>
        <p className="text-sm mt-1">Escolha um cliente para atualizar a posicao por extrato BTG.</p>
      </div>
    );
  }

  const onFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseBtgWorkbook(await file.arrayBuffer());
      setDataReferencia(parsed.dataReferenciaImportacao);
      setWarnings(parsed.warnings);
      setPreviewRows(buildPreviewRows(parsed.positions, clientAssets));
      setSummary(null);
    } finally {
      event.target.value = '';
    }
  };

  const updatePreviewRow = (id: string, patch: Partial<PreviewRow>) => {
    setPreviewRows(prev => prev.map(row => (row.id === id ? { ...row, ...patch } : row)));
  };

  const confirmImport = () => {
    let updated = 0;
    let created = 0;
    let ignored = 0;

    previewRows.forEach(row => {
      if (row.action === 'ignorar') {
        ignored += 1;
        return;
      }

      const now = new Date().toISOString();
      const referenceIso = dataReferencia ? `${dataReferencia}T00:00:00.000Z` : now;

      if (row.action === 'atualizar' && row.matchedAssetId) {
        store.updateAsset(row.matchedAssetId, {
          valorPosicao: row.importValue,
          currentValue: row.importValue,
          dataUltimaAtualizacao: referenceIso,
          origemAtualizacao: 'extrato_btg',
        });
        updated += 1;
        return;
      }

      if (row.action === 'criar') {
        // Buscar referências no Banco de Dados
        let referenciaRVId: string | undefined;
        let referenciaFundoId: string | undefined;
        let referenciaRFId: string | undefined;
        const codigoRF = row.codigo || row.ticker;

        if (row.ticker) {
          const rvMatch = store.rvPrices.find(r => r.tickerCodigo.toUpperCase() === row.ticker!.toUpperCase());
          if (rvMatch) referenciaRVId = rvMatch.id;
        }
        if (row.cnpj) {
          const fundoMatch = store.fundosReferencia.find(f => f.cnpjNumerico === row.cnpj!.replace(/\D/g, ''));
          if (fundoMatch) referenciaFundoId = fundoMatch.id;
        }
        if (codigoRF && (row.suggestedType === 'cdb' || row.suggestedType === 'cri' || row.suggestedType === 'cra' || row.suggestedType === 'debenture' || row.suggestedType === 'coe')) {
          const rfMatch = store.rendasFixasReferencia.find(r => r.codigo.toUpperCase() === codigoRF.toUpperCase());
          if (rfMatch) referenciaRFId = rfMatch.id;
        }

        store.addAsset(clientId, {
          name: row.importName,
          nomeExibicao: row.importName,
          tipo: row.suggestedType,
          tickerCodigo: row.ticker,
          cnpj: row.cnpj,
          isin: undefined,
          identificadorExterno: row.codigo || row.externalId,
          referenciaRVId,
          referenciaFundoId,
          referenciaRFId,
          valorPosicao: row.importValue,
          currentValue: row.importValue,
          moeda: 'BRL',
          isentoIR: false,
          origemAtualizacao: 'extrato_btg',
          dataUltimaAtualizacao: referenceIso,
          modoMetaAtivo: 'score',
          valorMetaAtivo: 1,
        });
        created += 1;
      }
    });

    setSummary({ updated, created, ignored, dataReferencia });
    setRefreshKey(prev => prev + 1);
  };

  const statusBadge = (status: PreviewRow['status']) => {
    if (status === 'auto') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Casado automaticamente</span>;
    if (status === 'review') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Requer revisao</span>;
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Novo ativo</span>;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Atualizacao de Posicao por Extrato BTG</h2>
            <p className="text-sm text-gray-500">Cliente: {client.name} · processamento em memoria com confirmacao manual.</p>
          </div>
          <label className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium cursor-pointer hover:bg-blue-700">
            Upload Excel BTG
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileUpload} />
          </label>
        </div>

        {dataReferencia && (
          <p className="mt-2 text-xs text-gray-600">
            Data de referencia detectada: <strong>{new Date(dataReferencia).toLocaleDateString('pt-BR')}</strong>
          </p>
        )}

        {warnings.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
              <AlertTriangle size={13} /> Avisos de leitura
            </p>
            <ul className="mt-1 text-xs text-amber-700 list-disc pl-4">
              {warnings.slice(0, 6).map(w => <li key={w}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>

      {previewRows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-xs font-bold text-gray-700 text-left border-b border-gray-200">Nome no extrato</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-700 text-right border-b border-gray-200">Valor encontrado</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-700 text-left border-b border-gray-200">Ativo no sistema</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-700 text-left border-b border-gray-200">Metodo</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-700 text-left border-b border-gray-200">Status</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-700 text-left border-b border-gray-200">Acao</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map(row => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-700">
                      <div className="font-medium">{row.importName}</div>
                      <div className="text-[11px] text-gray-400">{row.importSection}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-right font-semibold text-gray-800">{formatCurrency(row.importValue)}</td>
                    <td className="px-3 py-2 text-xs">
                      <select
                        value={row.matchedAssetId ?? ''}
                        onChange={e => updatePreviewRow(row.id, { matchedAssetId: e.target.value || undefined })}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                      >
                        <option value="">-- sem correspondencia --</option>
                        {clientAssets.map(asset => (
                          <option key={asset.id} value={asset.id}>{asset.nomeExibicao || asset.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{row.matchMethod} ({Math.round(row.matchConfidence * 100)}%)</td>
                    <td className="px-3 py-2 text-xs">{statusBadge(row.status)}</td>
                    <td className="px-3 py-2 text-xs">
                      <select
                        value={row.action}
                        onChange={e => updatePreviewRow(row.id, { action: e.target.value as PreviewRow['action'] })}
                        className="border border-gray-200 rounded px-2 py-1 text-xs"
                      >
                        <option value="atualizar">Atualizar</option>
                        <option value="criar">Criar</option>
                        <option value="ignorar">Ignorar</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">Nada sera gravado ate clicar em confirmar.</p>
            <button onClick={confirmImport} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              Confirmar Importacao
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
          <p className="font-semibold flex items-center gap-2"><CheckCircle2 size={16} /> Importacao concluida</p>
          <p className="mt-1">Atualizados: {summary.updated} · Criados: {summary.created} · Ignorados: {summary.ignored}</p>
          {summary.dataReferencia && <p className="text-xs mt-1">Data de referencia aplicada: {new Date(summary.dataReferencia).toLocaleDateString('pt-BR')}</p>}
        </div>
      )}
    </div>
  );
}
