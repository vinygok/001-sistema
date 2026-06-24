import fs from "fs";
import path from "path";

const OUTPUT_FILE = "snapshot-codigo.txt";
const ROOT = process.cwd();

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".vite",
  ".idea",
  ".vscode"
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".rar", ".7z",
  ".mp3", ".mp4", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".xlsx", ".xls", ".doc", ".docx", ".ppt", ".pptx"
]);

function isBinaryByExtension(filePath) {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isLikelyText(buffer) {
  const len = Math.min(buffer.length, 4096);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return false;
  }
  return true;
}

function walk(dir, all = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(fullPath, all);
      continue;
    }

    all.push(relPath);
  }

  return all;
}

function main() {
  const files = walk(ROOT)
    .filter(f => !isBinaryByExtension(f))
    .sort((a, b) => a.localeCompare(b));

  let out = "";
  out += "# SNAPSHOT CODIGO\n";
  out += `# Gerado em: ${new Date().toISOString()}\n`;
  out += `# Total de arquivos: ${files.length}\n\n`;

  for (const file of files) {
    let content = "";
    try {
      const buffer = fs.readFileSync(path.join(ROOT, file));
      if (!isLikelyText(buffer)) continue;
      content = buffer.toString("utf8");
    } catch {
      continue;
    }

    out += `===== BEGIN FILE: ${file} =====\n`;
    out += content;
    if (!content.endsWith("\n")) out += "\n";
    out += `===== END FILE: ${file} =====\n\n`;
  }

  fs.writeFileSync(path.join(ROOT, OUTPUT_FILE), out, "utf8");
  console.log(`Arquivo gerado: ${OUTPUT_FILE}`);
}

main();
