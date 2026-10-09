import type { Job, Transcript } from './types';

/** popup → content script */
export type ContentRequest = { type: 'EXTRACT' } | { type: 'GET_META' };

export type ExtractResponse =
  | { ok: true; transcript: Transcript }
  | { ok: false; error: string };

/** popup → background */
export type BackgroundRequest =
  | { type: 'GENERATE'; transcript: Transcript }
  | { type: 'GET_JOB' }
  | { type: 'CLEAR_JOB' }
  | { type: 'CHECK_EXISTS' }
  | { type: 'SAVE'; mode: 'rest' | 'download'; note?: string }
  | { type: 'TEST_LLM' }
  | { type: 'TEST_OBSIDIAN' };

export type SaveResponse =
  | { ok: true; path: string }
  | { ok: false; error: string };

export type BackgroundResponse<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** background → popup 广播 */
export type Broadcast = { type: 'JOB_UPDATE'; job: Job };
