import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import type { AppSettings } from '@cue/types';

/**
 * Tiny JSON-file settings store in the OS user-data dir. Holds the user-editable
 * dashboard settings (whisper model, language). No external dependency — a
 * corrupt/missing file simply falls back to defaults.
 */

const DEFAULTS: AppSettings = {
  whisperModel: process.env['WHISPER_MODEL'] ?? 'base.en',
  language: process.env['CUE_LANGUAGE'] ?? 'en',
};

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<AppSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = { ...loadSettings(), ...patch };
  try {
    const path = settingsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(merged, null, 2), 'utf8');
  } catch (err) {
    console.error('[cue] failed to persist settings:', err);
  }
  return merged;
}
