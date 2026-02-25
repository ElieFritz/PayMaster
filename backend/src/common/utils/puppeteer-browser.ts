import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Browser, LaunchOptions } from 'puppeteer';

const PDF_BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];
const DEFAULT_PUPPETEER_CACHE_DIR = path.join(process.cwd(), '.cache', 'puppeteer');
const RUNTIME_INSTALL_COMMAND = 'npx puppeteer browsers install chrome';

ensurePuppeteerCacheDir();
const puppeteer: typeof import('puppeteer') = require('puppeteer');
let runtimeInstallPromise: Promise<RuntimeInstallResult> | null = null;

function resolveConfiguredExecutablePath(): string | null {
  const value = process.env.PUPPETEER_EXECUTABLE_PATH;

  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveBundledExecutablePath(): string | null {
  try {
    const executablePath = puppeteer.executablePath();
    const normalizedPath = executablePath ? executablePath.trim() : '';
    if (!normalizedPath) {
      return null;
    }

    return isFile(normalizedPath) ? normalizedPath : null;
  } catch {
    return null;
  }
}

type LaunchAttempt = {
  label: string;
  options: LaunchOptions;
};

type LaunchResult = {
  browser: Browser | null;
  errors: string[];
};

type RuntimeInstallResult = {
  ok: boolean;
  detail: string;
};

function buildLaunchAttempts(): LaunchAttempt[] {
  const baseOptions: LaunchOptions = {
    headless: true,
    args: PDF_BROWSER_ARGS,
  };

  const attempts: LaunchAttempt[] = [];
  const addedExecutablePaths = new Set<string>();
  const configuredPath = resolveConfiguredExecutablePath();
  const bundledPath = resolveBundledExecutablePath();

  if (configuredPath) {
    attempts.push({
      label: `configured executable (${configuredPath})`,
      options: {
        ...baseOptions,
        executablePath: configuredPath,
      },
    });
    addedExecutablePaths.add(configuredPath);
  }

  if (bundledPath && bundledPath !== configuredPath) {
    attempts.push({
      label: `bundled executable (${bundledPath})`,
      options: {
        ...baseOptions,
        executablePath: bundledPath,
      },
    });
    addedExecutablePaths.add(bundledPath);
  }

  for (const discoveredPath of discoverExecutablePaths()) {
    if (addedExecutablePaths.has(discoveredPath)) {
      continue;
    }

    attempts.push({
      label: `discovered executable (${discoveredPath})`,
      options: {
        ...baseOptions,
        executablePath: discoveredPath,
      },
    });
    addedExecutablePaths.add(discoveredPath);
  }

  attempts.push({
    label: 'default launch',
    options: baseOptions,
  });

  return attempts;
}

export async function launchPdfBrowser(): Promise<Browser> {
  const initialResult = await attemptBrowserLaunches(buildLaunchAttempts());
  if (initialResult.browser) {
    return initialResult.browser;
  }

  const errors = [...initialResult.errors];

  if (shouldInstallChromeAtRuntime(errors)) {
    const installResult = await ensureChromeInstalledAtRuntime();
    errors.push(`runtime install: ${installResult.detail}`);

    if (installResult.ok) {
      const retryResult = await attemptBrowserLaunches(buildLaunchAttempts());
      if (retryResult.browser) {
        return retryResult.browser;
      }
      errors.push(...retryResult.errors);
    }
  }

  throw new Error(
    [
      'Unable to launch Chrome for PDF generation.',
      'Configure Render build command with: npm ci && npm run install:browser && npm run build.',
      'If needed, set PUPPETEER_EXECUTABLE_PATH to the installed Chrome binary.',
      'You can also set PUPPETEER_CACHE_DIR to persist puppeteer browsers between build/runtime.',
      `Attempts: ${errors.join(' | ')}`,
    ].join(' '),
  );
}

async function attemptBrowserLaunches(attempts: LaunchAttempt[]): Promise<LaunchResult> {
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const browser = await puppeteer.launch(attempt.options);
      return { browser, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.label}: ${message}`);
    }
  }

  return { browser: null, errors };
}

function shouldInstallChromeAtRuntime(errors: string[]): boolean {
  const joined = errors.join(' ').toLowerCase();
  return (
    joined.includes('could not find chrome') ||
    joined.includes('browser was not found') ||
    joined.includes('unable to find browser')
  );
}

async function ensureChromeInstalledAtRuntime(): Promise<RuntimeInstallResult> {
  if (!runtimeInstallPromise) {
    runtimeInstallPromise = Promise.resolve().then(() => installChromeAtRuntime());
  }

  const result = await runtimeInstallPromise;
  if (!result.ok) {
    runtimeInstallPromise = null;
  }

  return result;
}

function installChromeAtRuntime(): RuntimeInstallResult {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || DEFAULT_PUPPETEER_CACHE_DIR;

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `failed to create cache dir (${cacheDir}): ${message}` };
  }

  const result = childProcess.spawnSync(RUNTIME_INSTALL_COMMAND, {
    shell: true,
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDir,
    },
    encoding: 'utf8',
  });

  if (result.error) {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    return { ok: false, detail: `install command error: ${message}` };
  }

  if (result.status === 0) {
    return { ok: true, detail: `chrome installed in ${cacheDir}` };
  }

  const output = truncateText(
    [result.stderr, result.stdout]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find((value) => value.length > 0) || `exit code ${String(result.status)}`,
    360,
  );

  return { ok: false, detail: output };
}

function discoverExecutablePaths(): string[] {
  const discovered: string[] = [];
  const seen = new Set<string>();

  for (const systemPath of resolveSystemChromePaths()) {
    addIfExecutable(systemPath, discovered, seen);
  }

  for (const cacheDir of resolveBrowserCacheDirectories()) {
    for (const browserFamily of ['chrome', 'chrome-headless-shell']) {
      const familyRoot = path.join(cacheDir, browserFamily);
      if (!isDirectory(familyRoot)) {
        continue;
      }

      const buildFolders = safeReadDirectory(familyRoot);
      for (const buildFolder of buildFolders) {
        const buildRoot = path.join(familyRoot, buildFolder);
        for (const relativePath of resolveCandidateRelativeExecutablePaths(browserFamily)) {
          const candidate = path.join(buildRoot, ...relativePath);
          addIfExecutable(candidate, discovered, seen);
        }
      }
    }
  }

  return discovered;
}

function resolveSystemChromePaths(): string[] {
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/chrome',
  ];
}

function resolveBrowserCacheDirectories(): string[] {
  const candidates = [
    process.env.PUPPETEER_CACHE_DIR,
    path.join(process.cwd(), '.cache', 'puppeteer'),
    path.resolve(__dirname, '../../../.cache/puppeteer'),
    path.join(os.homedir(), '.cache', 'puppeteer'),
    '/opt/render/.cache/puppeteer',
    '/opt/render/project/src/.cache/puppeteer',
    '/opt/render/project/src/backend/.cache/puppeteer',
    '/opt/render/project/.cache/puppeteer',
  ];

  const unique = new Set<string>();
  const directories: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = normalizeCacheDirectory(candidate);
    if (!normalized || unique.has(normalized)) {
      continue;
    }

    unique.add(normalized);
    directories.push(normalized);
  }

  return directories;
}

function ensurePuppeteerCacheDir(): void {
  const existing = process.env.PUPPETEER_CACHE_DIR;
  const normalized =
    existing && existing.trim().length > 0
      ? normalizeCacheDirectory(existing)
      : DEFAULT_PUPPETEER_CACHE_DIR;

  if (!normalized) {
    return;
  }

  process.env.PUPPETEER_CACHE_DIR = normalized;
  try {
    fs.mkdirSync(normalized, { recursive: true });
  } catch {
    // Ignore filesystem failures here; launch attempts will provide actionable errors.
  }
}

function normalizeCacheDirectory(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

function resolveCandidateRelativeExecutablePaths(browserFamily: string): string[][] {
  if (browserFamily === 'chrome-headless-shell') {
    return [
      ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
      ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
      ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
      ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
      ['chrome-headless-shell-win32', 'chrome-headless-shell.exe'],
    ];
  }

  return [
    ['chrome-linux64', 'chrome'],
    ['chrome-linux', 'chrome'],
    ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ['chrome-win64', 'chrome.exe'],
    ['chrome-win32', 'chrome.exe'],
    ['chrome.exe'],
    ['chrome'],
  ];
}

function safeReadDirectory(targetPath: string): string[] {
  try {
    return fs
      .readdirSync(targetPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function addIfExecutable(candidatePath: string, target: string[], seen: Set<string>): void {
  const normalized = path.normalize(candidatePath);
  if (seen.has(normalized)) {
    return;
  }

  if (!isFile(normalized)) {
    return;
  }

  seen.add(normalized);
  target.push(normalized);
}

function isDirectory(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 3)}...`;
}
