import fs from 'fs';
import os from 'os';
import path from 'path';
import { Browser, LaunchOptions } from 'puppeteer';
import puppeteer from 'puppeteer';

const PDF_BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];

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
    return executablePath ? executablePath.trim() : null;
  } catch {
    return null;
  }
}

type LaunchAttempt = {
  label: string;
  options: LaunchOptions;
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
  const attempts = buildLaunchAttempts();
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      return await puppeteer.launch(attempt.options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.label}: ${message}`);
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
    path.join(os.homedir(), '.cache', 'puppeteer'),
    '/opt/render/.cache/puppeteer',
    '/opt/render/project/.cache/puppeteer',
  ];

  const unique = new Set<string>();
  const directories: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = candidate.trim();
    if (!normalized || unique.has(normalized)) {
      continue;
    }

    unique.add(normalized);
    directories.push(normalized);
  }

  return directories;
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
