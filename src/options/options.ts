import { DEFAULT_PROMPTS, PROVIDER_PRESETS, getPreset } from '../shared/config';
import type { BackgroundRequest } from '../shared/messages';
import { getHistory, getSecrets, getSettings, saveSecrets, saveSettings } from '../shared/storage';
import type { ObsidianMode, ProviderId, SyncSettings } from '../shared/types';

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;

/** manifest 中已声明的 host_permissions，其余端点需动态申请 */
const DECLARED_ORIGINS = new Set(
  ((chrome.runtime.getManifest() as chrome.runtime.ManifestV3).host_permissions ?? []).map((p: string) => p.replace(/\/\*$/, '')),
);

function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function status(id: string, text: string, ok: boolean) {
  const el = $(id);
  el.textContent = text;
  el.style.color = ok ? 'var(--ok)' : 'var(--danger)';
}

function currentMode(): ObsidianMode {
  return (document.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value as ObsidianMode) ?? 'rest';
}

function updateModeUi() {
  const mode = currentMode();
  $('rest-fields').classList.toggle('hidden', mode !== 'rest');
  $('download-hint').classList.toggle('hidden', mode !== 'download');
}

function updateProviderHint(id: ProviderId) {
  const hint = getPreset(id).hint;
  const el = $('provider-hint');
  el.textContent = hint ?? '';
  el.classList.toggle('hidden', !hint);
}

function readForm(): SyncSettings {
  return {
    llm: {
      provider: $<HTMLSelectElement>('provider').value as ProviderId,
      baseUrl: $('baseUrl').value.trim(),
      modelName: $('modelName').value.trim(),
      temperature: Number($('temperature').value) || 0,
      maxTokens: Number($('maxTokens').value) || 4096,
      chunkTokens: Number($('chunkTokens').value) || 6000,
    },
    obsidian: {
      mode: currentMode(),
      restUrl: $('restUrl').value.trim(),
      baseFolder: $('baseFolder').value.trim(),
    },
    prompts: {
      map: $<HTMLTextAreaElement>('mapPrompt').value,
      reduce: $<HTMLTextAreaElement>('reducePrompt').value,
    },
  };
}

/** 为未在 manifest 声明的端点申请权限（必须在用户点击的同步调用链中发起） */
function requestHostPermissions(urls: string[]): Promise<boolean> {
  const origins = urls
    .map(originPattern)
    .filter((o): o is string => !!o && !DECLARED_ORIGINS.has(o))
    .map((o) => `${o}/*`);
  if (!origins.length) return Promise.resolve(true);
  return chrome.permissions.request({ origins });
}

async function save(): Promise<boolean> {
  const form = readForm();
  const granted = await requestHostPermissions([form.llm.baseUrl, form.obsidian.restUrl]);
  await saveSettings(form);
  await saveSecrets({ llmApiKey: $('llmApiKey').value.trim(), obsidianApiKey: $('obsidianApiKey').value.trim() });
  if (!granted) {
    status('save-result', '已保存，但未授予端点访问权限，请求将会失败。', false);
    return false;
  }
  status('save-result', '✅ 已保存', true);
  return true;
}

async function test(type: 'TEST_LLM' | 'TEST_OBSIDIAN', resultId: string) {
  status(resultId, '测试中…', true);
  await save();
  const res = (await chrome.runtime.sendMessage({ type } satisfies BackgroundRequest)) as
    | { ok: true; message: string }
    | { ok: false; error: string };
  if (res.ok) status(resultId, res.message, true);
  else status(resultId, res.error, false);
}

async function renderHistory() {
  const list = $<HTMLUListElement>('history');
  const history = await getHistory();
  list.replaceChildren();
  if (!history.length) {
    list.innerHTML = '<li class="muted">暂无记录</li>';
    return;
  }
  const labels = { generated: '已生成', saved: '已保存', error: '失败' };
  for (const h of history.slice(0, 20)) {
    const li = document.createElement('li');
    const time = new Date(h.time).toLocaleString();
    li.textContent = `${time} · ${labels[h.status]} · ${h.course} — ${h.lecture}${h.path ? ` → ${h.path}` : ''}`;
    list.append(li);
  }
}

async function init() {
  const select = $<HTMLSelectElement>('provider');
  for (const p of PROVIDER_PRESETS) select.add(new Option(p.label, p.id));

  const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);
  select.value = settings.llm.provider;
  $('baseUrl').value = settings.llm.baseUrl;
  $('modelName').value = settings.llm.modelName;
  $('temperature').value = String(settings.llm.temperature);
  $('maxTokens').value = String(settings.llm.maxTokens);
  $('chunkTokens').value = String(settings.llm.chunkTokens);
  $('llmApiKey').value = secrets.llmApiKey;
  $('restUrl').value = settings.obsidian.restUrl;
  $('obsidianApiKey').value = secrets.obsidianApiKey;
  $('baseFolder').value = settings.obsidian.baseFolder;
  $<HTMLTextAreaElement>('mapPrompt').value = settings.prompts.map;
  $<HTMLTextAreaElement>('reducePrompt').value = settings.prompts.reduce;
  const modeInput = document.querySelector<HTMLInputElement>(`input[name="mode"][value="${settings.obsidian.mode}"]`);
  if (modeInput) modeInput.checked = true;
  updateModeUi();
  updateProviderHint(settings.llm.provider);

  select.addEventListener('change', () => {
    const preset = getPreset(select.value as ProviderId);
    if (preset.id !== 'custom') {
      $('baseUrl').value = preset.baseUrl;
      $('modelName').value = preset.modelName;
    }
    updateProviderHint(preset.id);
  });
  document.querySelectorAll('input[name="mode"]').forEach((el) => el.addEventListener('change', updateModeUi));
  $('reset-prompts').addEventListener('click', () => {
    $<HTMLTextAreaElement>('mapPrompt').value = DEFAULT_PROMPTS.map;
    $<HTMLTextAreaElement>('reducePrompt').value = DEFAULT_PROMPTS.reduce;
  });
  $('save').addEventListener('click', () => void save());
  $('test-llm').addEventListener('click', () => void test('TEST_LLM', 'test-llm-result'));
  $('test-obsidian').addEventListener('click', () => void test('TEST_OBSIDIAN', 'test-obsidian-result'));

  await renderHistory();
}

void init();
