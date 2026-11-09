import { cleanTranscript, countChars } from '../shared/clean';
import { getPreset } from '../shared/config';
import { renderMarkdown } from '../shared/markdown';
import type { BackgroundRequest, Broadcast, ContentRequest, ExtractResponse } from '../shared/messages';
import { buildNotePaths, buildTranscriptNote } from '../shared/note';
import {
  addHistory,
  clearChatSession,
  getChatSession,
  getSecrets,
  getSettings,
  saveChatSession,
} from '../shared/storage';
import type { ChatTurn, Job, LectureMeta, SyncSettings, Transcript } from '../shared/types';
import { isSupportedUrl, UNSUPPORTED_PAGE_HINT } from '../shared/url';
import { parseSubtitleLines } from '../shared/vtt';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: SyncSettings;
let transcript: Transcript | undefined;
let turns: ChatTurn[] = [];
let currentUrlKey = 'default';
let activeTabId: number | undefined;
let asking = false;
let lastAppendedJobId: string | undefined;

function message(text: string, kind: 'error' | 'ok' | 'warn' = 'error') {
  const el = $('message');
  el.textContent = text;
  el.className = `msg ${kind}`;
}

function clearMessage() {
  $('message').className = 'msg hidden';
}

async function send<T = Record<string, unknown>>(
  msg: BackgroundRequest,
): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    const res = await chrome.runtime.sendMessage(msg);
    if (!res || typeof res !== 'object' || !('ok' in res)) {
      return { ok: false, error: '后台服务未响应，请在扩展管理页重新加载插件后重试。' };
    }
    return res as ({ ok: true } & T) | { ok: false; error: string };
  } catch (e) {
    return { ok: false, error: (e as Error).message || '与后台通信失败。' };
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && isSupportedUrl(tab.url)) return tab;
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  return allTabs.find((t) => isSupportedUrl(t.url)) ?? tab;
}


async function persistSession() {
  await saveChatSession(currentUrlKey, { transcript, turns });
}

function updateControls() {
  const hasTranscript = !!transcript;
  $<HTMLButtonElement>('btn-copy-transcript').disabled = !hasTranscript;
  $<HTMLButtonElement>('btn-download-transcript').disabled = !hasTranscript;
  $<HTMLButtonElement>('btn-save-transcript').disabled = !hasTranscript;
  $<HTMLButtonElement>('btn-summarize').disabled = !hasTranscript || asking;
  $<HTMLTextAreaElement>('chat-input').disabled = !hasTranscript || asking;
  $<HTMLButtonElement>('btn-send').disabled = !hasTranscript || asking;

  if (transcript) {
    const src = transcript.source === 'dom' ? '页面字幕' : '字幕文件';
    const title = [transcript.meta.course, transcript.meta.lecture].filter(Boolean).join(' — ');
    $('lecture-bar').textContent = `${title || '当前课程'} (${src} · ${transcript.charCount.toLocaleString()} 字)`;
    $('lecture-bar').title = $('lecture-bar').textContent ?? '';
  } else {
    $('lecture-bar').textContent = '尚未加载字幕';
    $('lecture-bar').title = '';
  }
}

async function downloadMarkdownFile(filename: string, content: string): Promise<string> {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, conflictAction: 'overwrite', saveAs: false });
    return `下载目录/${filename}`;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

async function saveNoteContent(note: string, mode: 'rest' | 'download') {
  clearMessage();
  try {
    if (mode === 'download') {
      const meta = transcript?.meta ?? {
        course: 'Udemy',
        courseSlug: '',
        lecture: 'Note',
        index: '',
        instructor: '',
        url: '',
        duration: '',
      };
      const paths = buildNotePaths(meta, 'VideoNotes/Udemy');
      const path = await downloadMarkdownFile(paths.notePath, note);
      await addHistory({
        course: meta.course,
        lecture: meta.lecture,
        url: meta.url,
        time: Date.now(),
        status: 'saved',
        path,
      });
      message(`✅ 已下载：${path}`, 'ok');
      return;
    }
    const res = await send<{ path: string }>({ type: 'SAVE', mode: 'rest', note });
    if (res.ok) message(`✅ 已保存到 Obsidian：${res.path}`, 'ok');
    else message(res.error);
  } catch (e) {
    message((e as Error).message || '保存失败');
  }
}

function renderTurns() {
  const list = $('chat-list');
  list.innerHTML = '';

  if (turns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state muted';
    empty.textContent = transcript
      ? '字幕已就绪！点击下方「✨ 总结笔记」或在输入框中自由提问。'
      : '请先点击上方「📥 提取字幕」或上传字幕文件，即可总结笔记或自由提问。';
    list.appendChild(empty);
    return;
  }

  for (const turn of turns) {
    const item = document.createElement('div');
    item.className = `bubble ${turn.role}`;

    const content = document.createElement('div');
    content.className = 'bubble-content';
    if (turn.role === 'assistant') {
      content.classList.add('markdown-body');
      content.innerHTML = renderMarkdown(turn.content);
      for (const link of content.querySelectorAll('a[href]')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    } else {
      content.textContent = turn.content;
    }
    item.appendChild(content);

    if (turn.role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'bubble-actions';

      if (turn.isNote) {
        if (settings?.obsidian.mode === 'rest') {
          const btnObsidian = document.createElement('button');
          btnObsidian.className = 'btn-sm primary';
          btnObsidian.textContent = '💾 保存到 Obsidian';
          btnObsidian.addEventListener('click', () => void saveNoteContent(turn.content, 'rest'));
          actions.appendChild(btnObsidian);
        }

        const btnDownload = document.createElement('button');
        btnDownload.className = 'btn-sm';
        btnDownload.textContent = '⬇️ 下载 .md';
        btnDownload.addEventListener('click', () => void saveNoteContent(turn.content, 'download'));
        actions.appendChild(btnDownload);
      }

      const btnCopy = document.createElement('button');
      btnCopy.className = 'btn-sm';
      btnCopy.textContent = '复制';
      btnCopy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(turn.content);
        message('已复制到剪贴板', 'ok');
      });
      actions.appendChild(btnCopy);

      item.appendChild(actions);
    }

    list.appendChild(item);
  }

  list.scrollTop = list.scrollHeight;
}

// ---------- 提取与上传字幕 ----------

async function extractFromPage() {
  clearMessage();
  const tab = await getActiveTab();
  activeTabId = tab?.id;
  if (!tab?.id || !isSupportedUrl(tab.url)) {
    message(`${UNSUPPORTED_PAGE_HINT}「提取字幕」，或点击「上传 .vtt/.srt」。`, 'warn');
    return;
  }

  $('lecture-bar').textContent = '正在读取字幕（Transcript 较长时需要滚动加载）…';
  let res: ExtractResponse;
  try {
    res = await chrome.tabs.sendMessage<ContentRequest, ExtractResponse>(tab.id, { type: 'EXTRACT' });
  } catch {
    message('无法连接页面脚本，请刷新页面后重试。');
    updateControls();
    return;
  }
  if (!res?.ok) {
    message(res?.error ?? '提取失败。');
    updateControls();
    return;
  }

  currentUrlKey = res.transcript.meta.url || tab.url || 'default';
  const existing = await getChatSession(currentUrlKey);
  transcript = res.transcript;
  turns = existing.turns;
  await persistSession();
  updateControls();
  renderTurns();
}

async function metaFromTab(fallbackTitle: string): Promise<LectureMeta> {
  const fallback: LectureMeta = {
    course: 'Udemy',
    courseSlug: '',
    lecture: fallbackTitle,
    index: '',
    instructor: '',
    url: '',
    duration: '',
  };
  const tab = await getActiveTab();
  activeTabId = tab?.id;
  if (!activeTabId) return fallback;
  try {
    const res = await chrome.tabs.sendMessage<ContentRequest, { ok: boolean; meta?: LectureMeta }>(activeTabId, {
      type: 'GET_META',
    });
    return res?.ok && res.meta ? res.meta : fallback;
  } catch {
    return fallback;
  }
}

async function handleSubtitleFile(file: File) {
  clearMessage();
  if (!/\.(vtt|srt)$/i.test(file.name)) {
    message('只支持 .vtt 或 .srt 字幕文件。');
    return;
  }
  const text = cleanTranscript(parseSubtitleLines(await file.text()));
  if (!text) {
    message('字幕文件解析后为空。');
    return;
  }
  const meta = await metaFromTab(file.name.replace(/\.(vtt|srt)$/i, ''));
  currentUrlKey = meta.url || file.name;
  const existing = await getChatSession(currentUrlKey);
  transcript = { meta, text, charCount: countChars(text), source: 'vtt' };
  turns = existing.turns;
  await persistSession();
  updateControls();
  renderTurns();
}

async function copyTranscript() {
  if (!transcript) return;
  clearMessage();
  try {
    await navigator.clipboard.writeText(transcript.text);
    message('字幕已复制到剪贴板', 'ok');
  } catch {
    message('复制失败，请确认浏览器允许访问剪贴板后重试。');
  }
}

async function saveTranscript(mode: 'rest' | 'download') {
  if (!transcript) return;
  clearMessage();
  try {
    if (mode === 'download') {
      const suffix = '-transcript';
      const paths = buildNotePaths(transcript.meta, 'VideoNotes/Udemy', suffix);
      const note = buildTranscriptNote(transcript.meta, transcript.text, paths);
      const path = await downloadMarkdownFile(paths.notePath, note);
      await addHistory({
        course: transcript.meta.course,
        lecture: `${transcript.meta.lecture} (字幕)`,
        url: transcript.meta.url,
        time: Date.now(),
        status: 'saved',
        path,
      });
      message(`✅ 字幕已下载：${path}`, 'ok');
      return;
    }
    const res = await send<{ path: string }>({ type: 'SAVE_TRANSCRIPT', transcript, mode });
    if (res.ok) message(`✅ 字幕已保存：${res.path}`, 'ok');
    else message(res.error);
  } catch (e) {
    message((e as Error).message || '保存失败');
  }
}

// ---------- 总结笔记（复用 GENERATE 任务流） ----------

async function summarize() {
  if (!transcript) return;
  clearMessage();
  turns.push({ role: 'user', content: '✨ 请帮我总结本节课程笔记' });
  await persistSession();
  renderTurns();

  const res = await send<{ job: Job }>({ type: 'GENERATE', transcript });
  if (!res.ok) {
    message(res.error);
    return;
  }
  renderJob(res.job);
}

function renderJob(job: Job) {
  const wrap = $('job-progress');
  if (job.stage === 'map' || job.stage === 'reduce') {
    const label =
      job.stage === 'map'
        ? `正在提取分段要点（${job.done + 1}/${job.total - 1}）…`
        : job.total > 1
          ? '正在汇总生成笔记…'
          : '正在生成笔记…';
    $('progress-text').textContent = label;
    const bar = $<HTMLProgressElement>('progress-bar');
    bar.max = job.total;
    bar.value = job.done;
    wrap.classList.remove('hidden');
  } else if (job.stage === 'done' && job.note) {
    wrap.classList.add('hidden');
    if (lastAppendedJobId !== job.id && !turns.some((t) => t.isNote && t.content === job.note)) {
      lastAppendedJobId = job.id;
      turns.push({ role: 'assistant', content: job.note, isNote: true });
      void persistSession();
      renderTurns();
    }
  } else if (job.stage === 'error') {
    wrap.classList.add('hidden');
    message(job.error ?? '生成笔记失败。');
  }
}

// ---------- 多轮自由提问 ----------

async function askQuestion() {
  if (!transcript || asking) return;
  const input = $<HTMLTextAreaElement>('chat-input');
  const question = input.value.trim();
  if (!question) return;

  clearMessage();
  input.value = '';
  const historyBefore = [...turns];
  turns.push({ role: 'user', content: question });
  turns.push({ role: 'assistant', content: '思考中…' });
  asking = true;
  updateControls();
  renderTurns();

  const res = await send<{ reply: string }>({
    type: 'CHAT',
    transcript,
    history: historyBefore,
    question,
  });

  turns.pop(); // 移除占位
  if (res.ok) {
    turns.push({ role: 'assistant', content: res.reply });
  } else {
    message(res.error);
  }
  asking = false;
  await persistSession();
  updateControls();
  renderTurns();
}

async function clearChat() {
  turns = [];
  await clearChatSession(currentUrlKey);
  if (transcript) await persistSession();
  clearMessage();
  renderTurns();
}

// ---------- 初始化 ----------

function bindEvents() {
  const openOptions = (e: Event) => {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
  };
  $('open-options').addEventListener('click', openOptions);
  $('config-link').addEventListener('click', openOptions);

  $('btn-extract').addEventListener('click', () => void extractFromPage());
  $<HTMLInputElement>('file-input').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void handleSubtitleFile(file);
  });
  $('btn-copy-transcript').addEventListener('click', () => void copyTranscript());
  $('btn-download-transcript').addEventListener('click', () => void saveTranscript('download'));
  $('btn-save-transcript').addEventListener('click', () => void saveTranscript('rest'));
  $('btn-summarize').addEventListener('click', () => void summarize());
  $('btn-clear').addEventListener('click', () => void clearChat());
  $('btn-send').addEventListener('click', () => void askQuestion());

  $<HTMLTextAreaElement>('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void askQuestion();
    }
  });

  chrome.runtime.onMessage.addListener((msg: Broadcast) => {
    if (msg.type === 'JOB_UPDATE') renderJob(msg.job);
  });
}

async function init() {
  bindEvents();
  const [s, secrets] = await Promise.all([getSettings(), getSecrets()]);
  settings = s;
  $('btn-save-transcript').classList.toggle('hidden', settings.obsidian.mode !== 'rest');
  if (getPreset(settings.llm.provider).needsKey && !secrets.llmApiKey) {
    $('config-warning').classList.remove('hidden');
  }

  const tab = await getActiveTab();
  activeTabId = tab?.id;
  if (tab?.url) currentUrlKey = tab.url;

  const session = await getChatSession(currentUrlKey);
  transcript = session.transcript;
  turns = session.turns;

  const jobRes = await send<{ job?: Job }>({ type: 'GET_JOB' });
  if (jobRes.ok && jobRes.job && (jobRes.job.stage === 'map' || jobRes.job.stage === 'reduce')) {
    renderJob(jobRes.job);
  }

  updateControls();
  renderTurns();

  if (!transcript && tab?.id && isSupportedUrl(tab.url)) {
    await extractFromPage();
  }
}

void init();
