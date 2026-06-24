import * as XLSX from 'xlsx';
import type { Asset, AssetType } from '../types';

export type MatchMethod = 'id' | 'cnpj' | 'ticker' | 'name' | 'fuzzy' | 'none';

export interface ParsedPosition {
  id: string;
  sourceSheet: string;
  section: string;
  name: string;
  value: number;
  cnpj?: string;
  ticker?: string;
  codigo?: string;
  externalId?: string;
  suggestedType: AssetType;
}

export interface MatchCandidate {
  assetId?: string;
  method: MatchMethod;
  confidence: number;
  status: 'auto' | 'review' | 'new';
}

export interface BtgParseResult {
  dataReferenciaImportacao?: string;
  positions: ParsedPosition[];
  warnings: string[];
}

export interface PreviewRow {
  id: string;
  importName: string;
  importValue: number;
  importSection: string;
  suggestedType: AssetType;
  matchedAssetId?: string;
  matchMethod: MatchMethod;
  matchConfidence: number;
  status: 'auto' | 'review' | 'new';
  action: 'atualizar' | 'criar' | 'ignorar';
  cnpj?: string;
  ticker?: string;
  codigo?: string;
  externalId?: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBrNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text) return Number.NaN;
  const cleaned = text.replace(/[^\d,.-]/g, '');
  if (!cleaned) return Number.NaN;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // Decimal separator is whichever appears last.
    if (lastComma > lastDot) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    return Number(cleaned.replace(/,/g, ''));
  }

  if (lastComma >= 0) return Number(cleaned.replace(',', '.'));
  return Number(cleaned);
}

function excelDateToIso(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return undefined;
    return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const txt = String(value ?? '').trim();
  const br = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const y = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${y}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  const iso = txt.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  return undefined;
}

function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const dp: number[][] = Array.from({ length: x.length + 1 }, () => Array(y.length + 1).fill(0));
  for (let i = 0; i <= x.length; i++) dp[i][0] = i;
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  const dist = dp[x.length][y.length];
  return 1 - dist / Math.max(x.length, y.length);
}

function sectionToType(section: string): AssetType {
  const s = normalize(section);
  if (s.includes('fundo') && s.includes('imobili')) return 'fii';
  if (s.includes('portfolio de fundos')) return 'fundo';
  if (s.includes('acoes')) return 'acao';
  if (s.includes('etf')) return 'etf';
  if (s.includes('bdr')) return 'bdr';
  if (s.includes('cdb')) return 'cdb';
  if (s.includes('cri')) return 'cri';
  if (s.includes('cra')) return 'cra';
  if (s.includes('coe')) return 'coe';
  if (s.includes('cripto')) return 'cripto';
  if (s.includes('conta')) return 'conta_corrente';
  if (s.includes('transito')) return 'valores_em_transito';
  return 'outro';
}

function findDateReferenceFromAoa(aoa: unknown[][]): string | undefined {
  for (const row of aoa) {
    for (const cell of row) {
      const txt = String(cell ?? '');
      const m = txt.match(/Per[ií]odo\s+de\s+(\d{2}\/\d{2}\/\d{2,4})\s+a\s+(\d{2}\/\d{2}\/\d{2,4})/i);
      if (m) return excelDateToIso(m[2]);
    }
  }
  return undefined;
}

function findSectionIndexes(aoa: unknown[][]): Array<{ index: number; title: string }> {
  const sections: Array<{ index: number; title: string }> = [];
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i].map(cell => String(cell ?? '').trim());
    const text = row.join(' ').trim();
    if (normalize(text).includes('posicao >')) {
      sections.push({ index: i, title: text });
    }
  }
  return sections;
}

function findHeaderRowAndCols(block: unknown[][]) {
  let headerIndex = -1;
  let valueCol = -1;
  const cols: Record<string, number> = {};

  for (let i = 0; i < block.length; i++) {
    const row = block[i].map(cell => normalize(String(cell ?? '').trim()));
    const hasValue = row.some(c => c.includes('saldo bruto') || c.includes('valor bruto') || c.includes('valor financeiro') || c === 'valor r$');
    if (!hasValue) continue;

    headerIndex = i;
    row.forEach((cell, idx) => {
      if (cell.includes('saldo bruto') || cell.includes('valor bruto') || cell.includes('valor financeiro') || cell === 'valor r$') valueCol = idx;
      if (cell.includes('emissor')) cols.emissor = idx;
      if (cell === 'ativo' || cell.includes('fundo')) cols.ativo = idx;
      if (cell.includes('fundo')) cols.fundo = idx;
      if (cell.includes('codigo')) cols.codigo = idx;
      if (cell.includes('descricao')) cols.descricao = idx;
      if (cell.includes('taxa media ponderada') || cell === 'taxa') cols.taxa = idx;
      if (cell.includes('vencimento')) cols.vencimento = idx;
      if (cell.includes('cnpj')) cols.cnpj = idx;
    });
    break;
  }

  return { headerIndex, valueCol, cols };
}

function isEndOfListRow(values: unknown[]): boolean {
  const joined = normalize(values.map(c => String(c ?? '').trim()).join(' '));
  if (!joined) return false;
  return joined.startsWith('total');
}

function isBlankRow(values: unknown[]): boolean {
  return values.every(c => String(c ?? '').trim() === '');
}

function formatMaybeDate(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const iso = excelDateToIso(value);
  if (iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return String(value).trim();
}

function sectionSuffix(title: string): string {
  const m = title.match(/Posi[cç][aã]o\s*>\s*(.*)$/i);
  return (m?.[1] || title).trim();
}

export function parseBtgWorkbook(fileBuffer: ArrayBuffer): BtgParseResult {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const warnings: string[] = [];
  const positions: ParsedPosition[] = [];
  let dataReferenciaImportacao: string | undefined;

  workbook.SheetNames.forEach(sheetName => {
    const ws = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
    const sheetNorm = normalize(sheetName);

    if (!dataReferenciaImportacao && (sheetNorm.includes('capa') || sheetNorm.includes('resumo'))) {
      dataReferenciaImportacao = findDateReferenceFromAoa(aoa);
    }

    if (!dataReferenciaImportacao) {
      dataReferenciaImportacao = findDateReferenceFromAoa(aoa);
    }

    // Conta Corrente: linha com Data + Valor financeiro R$ e usar o saldo mais recente.
    if (sheetNorm.includes('conta corrente')) {
      let dataCol = -1;
      let valueCol = -1;
      let bestDate = '';
      let bestValue = Number.NaN;
      for (const rowRaw of aoa) {
        const row = rowRaw.map(cell => String(cell ?? '').trim());
        const rowNorm = row.map(normalize);
        if (rowNorm.includes('data') && rowNorm.some(c => c.includes('valor financeiro'))) {
          dataCol = rowNorm.findIndex(c => c === 'data');
          valueCol = rowNorm.findIndex(c => c.includes('valor financeiro'));
          continue;
        }
        if (dataCol >= 0 && valueCol >= 0) {
          const d = excelDateToIso(rowRaw[dataCol]);
          const rawValue = rowRaw[valueCol];
          // BTG representa saldo zerado da Conta Corrente como "-" (traço isolado)
          const v = String(rawValue ?? '').trim() === '-' ? 0 : parseBrNumber(rawValue);
          if (d && Number.isFinite(v) && d >= bestDate) {
            bestDate = d;
            bestValue = v;
          }
        }
      }
      if (bestDate && Number.isFinite(bestValue)) {
        positions.push({
          id: `${sheetName}-conta-investimentos`,
          sourceSheet: sheetName,
          section: 'Conta Corrente',
          name: 'Conta Investimentos',
          value: bestValue,
          suggestedType: 'conta_corrente',
        });
      }
      return;
    }

    // Valores em Transito: linha Total + Valor R$.
    if (sheetNorm.includes('valores em transito')) {
      let valueCol = -1;
      for (const rowRaw of aoa) {
        const row = rowRaw.map(cell => String(cell ?? '').trim());
        const rowNorm = row.map(normalize);
        if (rowNorm.includes('valor r$')) {
          valueCol = rowNorm.findIndex(c => c === 'valor r$');
          continue;
        }
        if (valueCol >= 0 && rowNorm.some(c => c === 'total')) {
          const v = parseBrNumber(rowRaw[valueCol]);
          if (Number.isFinite(v)) {
            positions.push({
              id: `${sheetName}-valores-transito`,
              sourceSheet: sheetName,
              section: 'Valores em Transito',
              name: 'Valores em Transito',
              value: v,
              suggestedType: 'valores_em_transito',
            });
            break;
          }
        }
      }
      return;
    }

    const sections = findSectionIndexes(aoa);
    for (let s = 0; s < sections.length; s++) {
      const start = sections[s].index;
      const end = s + 1 < sections.length ? sections[s + 1].index : aoa.length;
      const sectionTitle = sections[s].title;
      const sectionNorm = normalize(sectionTitle);
      const block = aoa.slice(start, end);
      const { headerIndex, valueCol, cols } = findHeaderRowAndCols(block);
      if (headerIndex < 0 || valueCol < 0) continue;

      const suffix = sectionSuffix(sectionTitle);

      if (sheetNorm.includes('fundos') && sectionNorm.includes('portfolio de fundos')) {
        for (let i = headerIndex + 1; i < block.length; i++) {
          const rowRaw = block[i];
          const row = rowRaw.map(cell => String(cell ?? '').trim());
          if (isEndOfListRow(rowRaw)) break;
          const nameCell = row.find(cell => /classe\s*cnpj:/i.test(cell));
          if (!nameCell) continue;
          const m = nameCell.match(/^(.*?)\s*-\s*Classe\s*CNPJ:\s*([\d./-]+)/i);
          if (!m) continue;
          const fundName = m[1].trim();
          const cnpj = m[2].replace(/\*+$/, '').trim();

          const valueRow = block[i + 1] ?? [];
          const value = parseBrNumber(valueRow[valueCol]);
          if (!Number.isFinite(value) || value === 0) continue;

          positions.push({
            id: `${sheetName}-${start}-${i}-${normalize(fundName)}`,
            sourceSheet: sheetName,
            section: sectionTitle,
            name: fundName,
            value,
            cnpj,
            suggestedType: 'fundo',
          });
        }
        continue;
      }

      const isPrevidenciaExterna = sheetNorm.includes('previdencia externa');
      let foundFirstAsset = false;

      for (let i = headerIndex + 1; i < block.length; i++) {
        const rowRaw = block[i];
        const row = rowRaw.map(cell => String(cell ?? '').trim());

        // Lista termina na linha de totais.
        if (isEndOfListRow(rowRaw)) break;

        // Previdencia Externa nao tem linha de total: termina em linha em branco.
        if (isPrevidenciaExterna && foundFirstAsset && isBlankRow(rowRaw)) break;

        const value = parseBrNumber(rowRaw[valueCol]);
        if (!Number.isFinite(value) || value === 0) continue;

        let name = '';
        let ticker = '';
        let codigo = '';
        let cnpj = cols.cnpj !== undefined ? String(row[cols.cnpj] ?? '').trim() : '';

        if (sheetNorm.includes('renda fixa')) {
          const emissor = cols.emissor !== undefined ? row[cols.emissor] : '';
          const ativo = cols.ativo !== undefined ? row[cols.ativo] : '';
          const taxa = cols.taxa !== undefined ? row[cols.taxa] : '';
          const venc = cols.vencimento !== undefined ? formatMaybeDate(rowRaw[cols.vencimento]) : '';
          name = [suffix, emissor, ativo, taxa, venc].filter(Boolean).join(' ').trim();
          ticker = String(ativo ?? '').trim();
          codigo = String(ativo ?? '').trim();
        } else if (sheetNorm.includes('coe')) {
          const descricao = cols.descricao !== undefined ? row[cols.descricao] : (cols.ativo !== undefined ? row[cols.ativo] : '');
          name = `COE ${descricao}`.trim();
        } else if (sheetNorm.includes('renda variavel')) {
          const codigo = cols.codigo !== undefined ? row[cols.codigo] : '';
          if (!codigo) continue;
          name = codigo;
          ticker = codigo;
        } else if (sheetNorm.includes('criptoativos')) {
          const ativo = cols.ativo !== undefined ? row[cols.ativo] : '';
          if (!ativo || normalize(ativo) === 'total') continue;
          name = ativo;
        } else if (sheetNorm.includes('previdencia')) {
          const fundo = cols.fundo !== undefined ? row[cols.fundo] : (cols.ativo !== undefined ? row[cols.ativo] : '');
          if (!fundo) continue;
          name = `${suffix} ${fundo}`.trim();
        } else {
          const codigo = cols.codigo !== undefined ? row[cols.codigo] : '';
          const ativo = cols.ativo !== undefined ? row[cols.ativo] : '';
          const descricao = cols.descricao !== undefined ? row[cols.descricao] : '';
          const emissor = cols.emissor !== undefined ? row[cols.emissor] : '';
          name = codigo || ativo || descricao || emissor;
          ticker = codigo || '';
        }

        if (!name || normalize(name) === 'total') continue;

        foundFirstAsset = true;

        positions.push({
          id: `${sheetName}-${start}-${i}-${normalize(name)}`,
          sourceSheet: sheetName,
          section: sectionTitle,
          name,
          value,
          cnpj: cnpj || undefined,
          ticker: ticker || undefined,
          codigo: codigo || undefined,
          suggestedType: sectionToType(sectionTitle),
        });
      }
    }
  });

  const dedup = new Map<string, ParsedPosition>();
  for (const p of positions) {
    const key = `${normalize(p.name)}|${p.section}|${p.cnpj ?? ''}|${p.ticker ?? ''}`;
    const existing = dedup.get(key);
    if (existing) {
      existing.value += p.value;
    } else {
      dedup.set(key, { ...p });
    }
  }

  return {
    dataReferenciaImportacao,
    positions: Array.from(dedup.values()),
    warnings,
  };
}

export function matchPositionToAssets(position: ParsedPosition, assets: Asset[], fuzzyThreshold = 0.82): MatchCandidate {
  if (position.externalId) {
    const byId = assets.find(a => normalize(a.identificadorExterno ?? '') === normalize(position.externalId ?? ''));
    if (byId) return { assetId: byId.id, method: 'id', confidence: 1, status: 'auto' };
  }
  if (position.cnpj) {
    const byCnpj = assets.find(a => normalize(a.cnpj ?? '') === normalize(position.cnpj ?? ''));
    if (byCnpj) return { assetId: byCnpj.id, method: 'cnpj', confidence: 1, status: 'auto' };
  }
  if (position.ticker) {
    const byTicker = assets.find(a => normalize(a.tickerCodigo ?? '') === normalize(position.ticker ?? ''));
    if (byTicker) return { assetId: byTicker.id, method: 'ticker', confidence: 1, status: 'auto' };
  }

  const byName = assets.find(a => normalize(a.name) === normalize(position.name) || normalize(a.nomeExibicao ?? '') === normalize(position.name));
  if (byName) return { assetId: byName.id, method: 'name', confidence: 1, status: 'auto' };

  let best: { id: string; score: number } | null = null;
  for (const asset of assets) {
    const score = Math.max(
      similarity(position.name, asset.name),
      similarity(position.name, asset.nomeExibicao ?? '')
    );
    if (!best || score > best.score) best = { id: asset.id, score };
  }

  if (best && best.score >= fuzzyThreshold) {
    return {
      assetId: best.id,
      method: 'fuzzy',
      confidence: best.score,
      status: best.score >= 0.92 ? 'auto' : 'review',
    };
  }

  return { method: 'none', confidence: 0, status: 'new' };
}

export function buildPreviewRows(positions: ParsedPosition[], assets: Asset[]): PreviewRow[] {
  return positions.map(position => {
    const match = matchPositionToAssets(position, assets);
    return {
      id: position.id,
      importName: position.name,
      importValue: Math.round(position.value * 100) / 100,
      importSection: position.section,
      suggestedType: position.suggestedType,
      matchedAssetId: match.assetId,
      matchMethod: match.method,
      matchConfidence: match.confidence,
      status: match.status,
      action: match.assetId ? 'atualizar' : 'criar',
      cnpj: position.cnpj,
      ticker: position.ticker,
      externalId: position.externalId,
    };
  });
}
