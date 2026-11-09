import { DEFAULT_SETTINGS } from './config';
import type { ChatTurn, HistoryEntry, Job, Secrets, SyncSettings, Transcript } from './types';
import { normalizeVideoUrl } from './url';

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

export interface ChatSession {
  transcript?: Transcript;
  turns: ChatTurn[];
}

function sessionKey(url: string): string {
  const cleanUrl = url ? normalizeVideoUrl(url) : 'default';
  return `chat_session:${cleanUrl}`;
}

export async function getChatSession(url: string): Promise<ChatSession> {
  const key = sessionKey(url);
  const data = (await chrome.storage.session.get([key, 'chat_session:latest'])) as Record<
    string,
    ChatSession | undefined
  >;
  return data[key] ?? data['chat_session:latest'] ?? { turns: [] };
}

export async function saveChatSession(url: string, session: ChatSession): Promise<void> {
  const key = sessionKey(url);
  await chrome.storage.session.set({ [key]: session, 'chat_session:latest': session });
}

export async function clearChatSession(url: string): Promise<void> {
  const key = sessionKey(url);
  await chrome.storage.session.remove([key, 'chat_session:latest']);
}
