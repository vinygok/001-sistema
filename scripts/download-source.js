import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const REPO = 'vinygok/001-sistema';
const REF = 'main';
const BASE = `https://raw.githubusercontent.com/${REPO}/${REF}`;

const files = [
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'src/main.tsx',
  'src/App.tsx',
  'src/index.css',
  'src/components/AssetManager.tsx',
  'src/components/ClientManager.tsx',
  'src/components/DatabaseDashboard.tsx',
  'src/components/GeneralOverview.tsx',
  'src/components/Modal.tsx',
  'src/components/PerformanceDashboard.tsx',
  'src/components/PortfolioDashboard.tsx',
  'src/components/PositionUpdateDashboard.tsx',
  'src/components/StrategyManager.tsx',
  'src/services/btgPositionImport.ts',
  'src/services/performance.ts',
  'src/store/useStore.ts',
  'src/types/index.ts',
  'src/utils/cn.ts',
  'src/utils/portfolio.ts',
];

async function downloadFile(path) {
  if (existsSync(path)) {
    console.log(`Skipping ${path} (already exists locally)`);
    return;
  }
  const url = `${BASE}/${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  writeFileSync(path, text, 'utf8');
  console.log(`Downloaded ${path} (${text.length} bytes)`);
}

async function main() {
  for (const path of files) {
    mkdirSync(dirname(path), { recursive: true });
    await downloadFile(path);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
