import { cleanTranscript, countChars } from '../shared/clean';
import { getPreset } from '../shared/config';
import type { BackgroundRequest, Broadcast, ContentRequest, ExtractResponse } from '../shared/messages';
import { getSecrets, getSettings } from '../shared/storage';
import type { Job, LectureMeta, SyncSettings, Transcript } from '../shared/types';
import { parseSubtitleLines } from '../shared/vtt';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const VIEWS = ['view-loading', 'view-preview', 'view-drop', 'view-progress', 'view-result', 'view-error'] as const;
type View = (typeof VIEWS)[number];

let settings: SyncSettings;
let transcript: Transcript | undefined;
let activeTabId: number | undefined;

function show(...views: View[]) {
  for (const v of VIEWS) $(v).classList.toggle('hidden', !views.includes(v));
}

function message(text: string, kind: 'error' | 'ok' | 'warn' = 'error') {
  const el = $('message');
  el.textContent = text;
  el.className = `msg ${kind}`;
}

function clearMessage() {
  $('message').className = 'msg hidden';
}

async function send<T = Record<string, unknown>>(msg: BackgroundRequest): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  return chrome.runtime.sendMessage(msg);
}

// ---------- 字幕获取 ----------

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isUdemyLearnUrl(url?: string): boolean {
  return !!url && /^https?:\/\/[^/]*udemy\.com\/course\/[^/]+\/learn\//.test(url);
}

async function extractFromPage() {
  clearMessage();
  const tab = await getActiveTab();
  activeTabId = tab?.id;
  if (!tab?.id || !isUdemyLearnUrl(tab.url)) {
    message('请在 Udemy 课程播放页使用本插件，或拖入 .vtt 字幕文件。', 'warn');
    show('view-drop');
    return;
  }

  show('view-loading', 'view-drop');
  $('loading-text').textContent = '正在读取字幕（Transcript 较长时需要滚动加载，请稍候）…';
  let res: ExtractResponse;
  try {
    res = await chrome.tabs.sendMessage<ContentRequest, ExtractResponse>(tab.id, { type: 'EXTRACT' });
  } catch {
    message('无法连接页面脚本，请刷新 Udemy 页面后重试。');
    show('view-drop');
    return;
  }
  if (!res?.ok) {
    message(res?.error ?? '提取失败。');
    show('view-drop');
    return;
  }
  showPreview(res.transcript);
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
  showPreview({ meta, text, charCount: countChars(text), source: 'vtt' });
}

// ---------- 预览 ----------

function showPreview(t: Transcript) {
  transcript = t;
  $<HTMLInputElement>('meta-course').value = t.meta.course;
  $<HTMLInputElement>('meta-index').value = t.meta.index;
  $<HTMLInputElement>('meta-lecture').value = t.meta.lecture;
  const src = t.source === 'dom' ? 'Transcript 面板' : '字幕文件';
  $('preview-stats').textContent = `来源：${src} · 共 ${t.charCount.toLocaleString()} 字${t.meta.duration ? ` · 时长 ${t.meta.duration}` : ''}`;
  $('preview-text').textContent = t.text.slice(0, 200) + (t.text.length > 200 ? '…' : '');
  show('view-preview', 'view-drop');
}

async function generate() {
  if (!transcript) return;
  clearMessage();
  const meta: LectureMeta = {
    ...transcript.meta,
    course: $<HTMLInputElement>('meta-course').value.trim() || transcript.meta.course,
    index: $<HTMLInputElement>('meta-index').value.trim(),
    lecture: $<HTMLInputElement>('meta-lecture').value.trim() || transcript.meta.lecture,
  };
  transcript = { ...transcript, meta };
  const res = await send<{ job: Job }>({ type: 'GENERATE', transcript });
  if (!res.ok) {
    message(res.error);
    return;
  }
  renderJob(res.job);
}

// ---------- 任务状态 ----------

function renderJob(job: Job) {
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
    show('view-progress');
  } else if (job.stage === 'done' && job.note) {
    $('result-title').textContent = `${job.meta.course} — ${job.meta.lecture}`;
    const textarea = $<HTMLTextAreaElement>('note');
    if (textarea.value !== job.note && document.activeElement !== textarea) textarea.value = job.note;
    $('overwrite-confirm').classList.add('hidden');
    show('view-result');
  } else if (job.stage === 'error') {
    message(job.error ?? '生成失败。');
    const hasPartial = !!job.partial;
    $('partial-wrap').classList.toggle('hidden', !hasPartial);
    $('btn-copy-partial').classList.toggle('hidden', !hasPartial);
    $<HTMLTextAreaElement>('partial').value = job.partial ?? '';
    show('view-error');
  }
}

async function clearJobAndRestart() {
  const res = await send({ type: 'CLEAR_JOB' });
  if (!res.ok) {
    message(res.error);
    return;
  }
  transcript = undefined;
  await extractFromPage();
}

// ---------- 保存 ----------

async function save(mode: 'rest' | 'download', skipExistCheck = false) {
  clearMessage();
  const note = $<HTMLTextAreaElement>('note').value;
  if (mode === 'rest' && !skipExistCheck) {
    const check = await send<{ exists: boolean; path: string }>({ type: 'CHECK_EXISTS' });
    if (!check.ok) {
      message(check.error);
      return;
    }
    if (check.exists) {
      $('overwrite-path').textContent = check.path;
      $('overwrite-confirm').classList.remove('hidden');
      return;
    }
  }
  $('overwrite-confirm').classList.add('hidden');
  const res = await send<{ path: string }>({ type: 'SAVE', mode, note });
  if (res.ok) message(`✅ 已保存：${res.path}`, 'ok');
  else message(res.error);
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  message('已复制到剪贴板', 'ok');
}

// ---------- 初始化 ----------

function bindEvents() {
  const openOptions = (e: Event) => {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
  };
  $('open-options').addEventListener('click', openOptions);
  $('config-link').addEventListener('click', openOptions);

  $('btn-generate').addEventListener('click', () => void generate());
  $('btn-reextract').addEventListener('click', () => void extractFromPage());
  $('btn-save').addEventListener('click', () => void save(settings.obsidian.mode));
  $('btn-download').addEventListener('click', () => void save('download'));
  $('btn-overwrite').addEventListener('click', () => void save('rest', true));
  $('btn-overwrite-cancel').addEventListener('click', () => $('overwrite-confirm').classList.add('hidden'));
  $('btn-copy').addEventListener('click', () => void copy($<HTMLTextAreaElement>('note').value));
  $('btn-copy-partial').addEventListener('click', () => void copy($<HTMLTextAreaElement>('partial').value));
  $('btn-new').addEventListener('click', () => void clearJobAndRestart());
  $('btn-new-2').addEventListener('click', () => void clearJobAndRestart());
  $('btn-retry').addEventListener('click', async () => {
    if (transcript) {
      await send({ type: 'CLEAR_JOB' });
      showPreview(transcript);
    } else {
      await clearJobAndRestart();
    }
  });

  const dropzone = $('dropzone');
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('over');
    const file = e.dataTransfer?.files[0];
    if (file) void handleSubtitleFile(file);
  });
  $<HTMLInputElement>('file-input').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void handleSubtitleFile(file);
  });

  chrome.runtime.onMessage.addListener((msg: Broadcast) => {
    if (msg.type === 'JOB_UPDATE') renderJob(msg.job);
  });
}

async function init() {
  bindEvents();
  const [s, secrets] = await Promise.all([getSettings(), getSecrets()]);
  settings = s;
  $('btn-save').textContent = settings.obsidian.mode === 'rest' ? '💾 保存到 Obsidian' : '💾 保存（下载）';
  $('btn-download').classList.toggle('hidden', settings.obsidian.mode === 'download');
  if (getPreset(settings.llm.provider).needsKey && !secrets.llmApiKey) {
    $('config-warning').classList.remove('hidden');
  }

  const tab = await getActiveTab();
  activeTabId = tab?.id;

  const res = await send<{ job?: Job }>({ type: 'GET_JOB' });
  if (res.ok && res.job) {
    renderJob(res.job);
    return;
  }
  await extractFromPage();
}

void init();
