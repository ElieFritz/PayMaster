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
    const path = puppeteer.executablePath();
    return path ? path.trim() : null;
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
  }

  if (bundledPath && bundledPath !== configuredPath) {
    attempts.push({
      label: `bundled executable (${bundledPath})`,
      options: {
        ...baseOptions,
        executablePath: bundledPath,
      },
    });
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
      `Attempts: ${errors.join(' | ')}`,
    ].join(' '),
  );
}
