import { DEFAULT_SETTINGS } from './config';
import type { HistoryEntry, Job, Secrets, SyncSettings } from './types';

const HISTORY_LIMIT = 100;

export async function getSettings(): Promise<SyncSettings> {
  const stored = (await chrome.storage.sync.get(['llm', 'obsidian', 'prompts'])) as Partial<SyncSettings>;
  return {
    llm: { ...DEFAULT_SETTINGS.llm, ...stored.llm },
    obsidian: { ...DEFAULT_SETTINGS.obsidian, ...stored.obsidian },
    prompts: { ...DEFAULT_SETTINGS.prompts, ...stored.prompts },
  };
}

export async function saveSettings(settings: SyncSettings): Promise<void> {
  await chrome.storage.sync.set(settings);
}

export async function getSecrets(): Promise<Secrets> {
  const s = (await chrome.storage.local.get(['llmApiKey', 'obsidianApiKey'])) as Partial<Secrets>;
  return { llmApiKey: s.llmApiKey ?? '', obsidianApiKey: s.obsidianApiKey ?? '' };
}

export async function saveSecrets(secrets: Secrets): Promise<void> {
  await chrome.storage.local.set(secrets);
}

export async function getJob(): Promise<Job | undefined> {
  const { job } = (await chrome.storage.local.get('job')) as { job?: Job };
  return job;
}

export async function setJob(job: Job | undefined): Promise<void> {
  if (job) await chrome.storage.local.set({ job });
  else await chrome.storage.local.remove('job');
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const { history = [] } = (await chrome.storage.local.get('history')) as { history?: HistoryEntry[] };
  history.unshift(entry);
  await chrome.storage.local.set({ history: history.slice(0, HISTORY_LIMIT) });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const { history = [] } = (await chrome.storage.local.get('history')) as { history?: HistoryEntry[] };
  return history;
}
