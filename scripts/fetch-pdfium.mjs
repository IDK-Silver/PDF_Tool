#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { spawn } from 'node:child_process';

function log(...args) {
  console.log('[pdfium:fetch]', ...args);
}

function fatal(msg, code = 1) {
  console.error('[pdfium:fetch] ERROR:', msg);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { version: null, dest: 'src-tauri/resources/pdfium', targets: 'auto' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--version' && argv[i + 1]) { args.version = argv[++i]; continue; }
    if (a === '--dest' && argv[i + 1]) { args.dest = argv[++i]; continue; }
    if (a === '--targets' && argv[i + 1]) { args.targets = argv[++i]; continue; }
    if (a === '-h' || a === '--help') { args.help = true; }
  }
  return args;
}

function usage() {
  return `Usage: node scripts/fetch-pdfium.mjs --version <chromium/NNNN|NNNN> [--dest <dir>] [--targets auto|list]

Examples:
  node scripts/fetch-pdfium.mjs --version chromium/7442 --targets auto
  node scripts/fetch-pdfium.mjs --version 7442 --dest src-tauri/resources/pdfium \
    --targets aarch64-apple-darwin,x86_64-apple-darwin,x86_64-unknown-linux-gnu,x86_64-pc-windows-msvc
Env:
  PDFIUM_VERSION   If set, used as default when --version is omitted.
Special versions:
  latest           Resolve the latest release tag via GitHub API.
`;
}

function normalizeVersion(ver) {
  if (!ver) return null;
  if (ver.startsWith('chromium/')) return ver;
  // Accept raw number like 7442 or strings like 135.0.1 but default to chromium scheme
  return `chromium/${ver}`;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const headers = { 'User-Agent': 'pdfium-fetch-script', 'Accept': 'application/vnd.github+json' };
    const req = https.get({ ...opts, headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGetJson(res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${url}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function detectLocalTriple() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'darwin' && a === 'arm64') return 'aarch64-apple-darwin';
  if (p === 'darwin' && a === 'x64') return 'x86_64-apple-darwin';
  if (p === 'linux' && a === 'x64') return 'x86_64-unknown-linux-gnu';
  if (p === 'linux' && a === 'arm64') return 'aarch64-unknown-linux-gnu';
  if (p === 'win32' && a === 'x64') return 'x86_64-pc-windows-msvc';
  if (p === 'win32' && a === 'arm64') return 'aarch64-pc-windows-msvc';
  return null;
}

function parseTargets(input) {
  if (!input || input === 'auto') {
    const t = detectLocalTriple();
    if (!t) fatal(`Unsupported local platform ${process.platform}/${process.arch}; please pass --targets explicitly`);
    return [t];
  }
  return input.split(',').map(s => s.trim()).filter(Boolean);
}

function mapTripleToAsset(triple) {
  // Map triples to pdfium-binaries asset name and expected library file path inside the archive
  switch (triple) {
    case 'aarch64-apple-darwin':
      return { asset: 'pdfium-mac-arm64.tgz', libInArchive: 'lib/libpdfium.dylib', outLib: 'libpdfium.dylib' };
    case 'x86_64-apple-darwin':
      return { asset: 'pdfium-mac-x64.tgz', libInArchive: 'lib/libpdfium.dylib', outLib: 'libpdfium.dylib' };
    case 'x86_64-unknown-linux-gnu':
      return { asset: 'pdfium-linux-x64.tgz', libInArchive: 'lib/libpdfium.so', outLib: 'libpdfium.so' };
    case 'aarch64-unknown-linux-gnu':
      return { asset: 'pdfium-linux-arm64.tgz', libInArchive: 'lib/libpdfium.so', outLib: 'libpdfium.so' };
    case 'x86_64-unknown-linux-musl':
      return { asset: 'pdfium-linux-musl-x64.tgz', libInArchive: 'lib/libpdfium.so', outLib: 'libpdfium.so' };
    case 'x86_64-pc-windows-msvc':
      return { asset: 'pdfium-win-x64.tgz', libInArchive: 'bin/pdfium.dll', outLib: 'pdfium.dll', maybe: ['bin/icudtl.dat'] };
    case 'aarch64-pc-windows-msvc':
      return { asset: 'pdfium-win-arm64.tgz', libInArchive: 'bin/pdfium.dll', outLib: 'pdfium.dll', maybe: ['bin/icudtl.dat'] };
    default:
      return null;
  }
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function downloadTo(url, destFile) {
  log('downloading', url);
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destFile);
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // redirect
        file.close();
        fs.unlinkSync(destFile);
        return downloadTo(res.headers.location, destFile).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', (err) => {
      try { file.close(); fs.unlinkSync(destFile); } catch {}
      reject(err);
    });
  });
}

async function extractTgz(tgzPath, destDir) {
  await ensureDir(destDir);
  const args = ['-xzf', tgzPath, '-C', destDir];
  await new Promise((resolve, reject) => {
    const p = spawn('tar', args, { stdio: 'inherit' });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`tar exit code ${code}`)));
    p.on('error', reject);
  });
}

async function copyFileIfExists(src, dst) {
  try {
    await ensureDir(path.dirname(dst));
    await fsp.copyFile(src, dst);
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); return; }
  // Resolve version from CLI, env, or latest
  let versionInput = args.version || process.env.PDFIUM_VERSION || null;
  if (!versionInput) fatal('Missing --version (or set PDFIUM_VERSION)');
  if (versionInput === 'latest' || versionInput === 'chromium/latest') {
    const json = await httpGetJson('https://api.github.com/repos/bblanchon/pdfium-binaries/releases/latest');
    if (!json || !json.tag_name) fatal('Failed to resolve latest release tag');
    log('resolved latest tag:', json.tag_name);
    versionInput = json.tag_name;
  }
  const versionTag = normalizeVersion(versionInput);
  const targets = parseTargets(args.targets);
  const destRoot = args.dest;

  for (const triple of targets) {
    const map = mapTripleToAsset(triple);
    if (!map) fatal(`Unsupported target triple: ${triple}`);
    const assetUrl = `https://github.com/bblanchon/pdfium-binaries/releases/download/${versionTag}/${map.asset}`;
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdfium-'));
    const tgzPath = path.join(tmpDir, map.asset);
    try {
      await downloadTo(assetUrl, tgzPath);
    } catch (e) {
      fatal(`Download failed for ${assetUrl}: ${e.message}`);
    }
    const extractDir = path.join(tmpDir, 'extract');
    try {
      await extractTgz(tgzPath, extractDir);
    } catch (e) {
      fatal(`Extract failed for ${tgzPath}: ${e.message}`);
    }

    // Find the lib inside the extracted folder (root may be a single directory)
    // Try direct path first
    async function findFile(rel) {
      const candidates = [];
      // If archive root has a folder, search inside it as well
      const entries = await fsp.readdir(extractDir, { withFileTypes: true });
      for (const ent of entries) {
        const base = path.join(extractDir, ent.name);
        if (ent.isDirectory()) candidates.push(path.join(base, rel));
      }
      candidates.push(path.join(extractDir, rel));
      for (const c of candidates) {
        try { await fsp.access(c, fs.constants.R_OK); return c; } catch {}
      }
      return null;
    }

    const libSrc = await findFile(map.libInArchive);
    if (!libSrc) fatal(`Cannot locate ${map.libInArchive} in archive ${map.asset}`);

    const outDir = path.join(destRoot, triple);
    const outLib = path.join(outDir, map.outLib);
    await ensureDir(outDir);
    await fsp.copyFile(libSrc, outLib);
    log('placed', outLib);

    if (map.maybe) {
      for (const rel of map.maybe) {
        const maybeSrc = await findFile(rel);
        if (maybeSrc) {
          const out = path.join(outDir, path.basename(rel));
          await fsp.copyFile(maybeSrc, out);
          log('placed', out);
        }
      }
    }
    // cleanup tmpDir best-effort
    try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }

  log('done');
}

main().catch((e) => fatal(e.stack || e.message));
