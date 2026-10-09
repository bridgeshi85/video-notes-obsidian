import type { BackgroundRequest, Broadcast } from '../shared/messages';
import { buildNote, buildNotePaths } from '../shared/note';
import { addHistory, getJob, getSecrets, getSettings, setJob } from '../shared/storage';
import type { Job, Transcript } from '../shared/types';
import { chat, GenerateError, generateNoteBody } from './llm';
import { downloadNote, noteExists, saveToObsidian, testObsidian } from './obsidian';

let running = false;

// Service worker 被回收后重启：内存中的任务已丢失，把残留的进行中任务标记为中断
void getJob().then((job) => {
  if (job && (job.stage === 'map' || job.stage === 'reduce') && !running) {
    void updateJob({ ...job, stage: 'error', error: '生成被中断（后台进程被浏览器回收），请重试。' });
  }
});

async function updateJob(job: Job): Promise<void> {
  await setJob(job);
  const msg: Broadcast = { type: 'JOB_UPDATE', job };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* popup 未打开时没有接收方 */
  });
}

/** 长时间 LLM 调用期间定期调用扩展 API，防止 service worker 空闲回收 */
function keepAlive(): () => void {
  const timer = setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000);
  return () => clearInterval(timer);
}

async function runJob(job: Job, transcript: Transcript): Promise<void> {
  running = true;
  const stop = keepAlive();
  try {
    const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);
    const body = await generateNoteBody(
      { meta: transcript.meta, text: transcript.text, llm: settings.llm, prompts: settings.prompts, apiKey: secrets.llmApiKey },
      (p) => void updateJob({ ...job, stage: p.stage, done: p.done, total: p.total }),
    );
    const paths = buildNotePaths(transcript.meta, settings.obsidian.baseFolder);
    const note = buildNote(transcript.meta, body, paths);
    const latest = (await getJob()) ?? job;
    await updateJob({ ...latest, stage: 'done', note, done: latest.total, finishedAt: Date.now() });
    await addHistory({ course: job.meta.course, lecture: job.meta.lecture, url: job.meta.url, time: Date.now(), status: 'generated' });
  } catch (e) {
    const latest = (await getJob()) ?? job;
    await updateJob({
      ...latest,
      stage: 'error',
      error: (e as Error).message,
      partial: e instanceof GenerateError ? e.partial : undefined,
      finishedAt: Date.now(),
    });
    await addHistory({ course: job.meta.course, lecture: job.meta.lecture, url: job.meta.url, time: Date.now(), status: 'error' });
  } finally {
    stop();
    running = false;
  }
}

async function handle(msg: BackgroundRequest): Promise<unknown> {
  switch (msg.type) {
    case 'GENERATE': {
      if (running) return { ok: false, error: '已有笔记正在生成中，请稍候。' };
      const job: Job = {
        id: crypto.randomUUID(),
        meta: msg.transcript.meta,
        stage: 'reduce',
        done: 0,
        total: 1,
        startedAt: Date.now(),
      };
      await updateJob(job);
      void runJob(job, msg.transcript);
      return { ok: true, job };
    }

    case 'GET_JOB':
      return { ok: true, job: await getJob() };

    case 'CLEAR_JOB':
      if (running) return { ok: false, error: '任务进行中，无法清除。' };
      await setJob(undefined);
      return { ok: true };

    case 'CHECK_EXISTS': {
      const job = await getJob();
      if (!job?.note) return { ok: false, error: '没有可保存的笔记。' };
      const [{ obsidian }, secrets] = await Promise.all([getSettings(), getSecrets()]);
      return { ok: true, ...(await noteExists(obsidian, secrets.obsidianApiKey, job.meta)) };
    }

    case 'SAVE': {
      const job = await getJob();
      const note = msg.note ?? job?.note;
      if (!job || !note) return { ok: false, error: '没有可保存的笔记。' };
      const [{ obsidian }, secrets] = await Promise.all([getSettings(), getSecrets()]);
      const path =
        msg.mode === 'rest'
          ? await saveToObsidian(obsidian, secrets.obsidianApiKey, job.meta, note)
          : await downloadNote(job.meta, note);
      await updateJob({ ...job, note });
      await addHistory({ course: job.meta.course, lecture: job.meta.lecture, url: job.meta.url, time: Date.now(), status: 'saved', path });
      return { ok: true, path };
    }

    case 'TEST_LLM': {
      const [{ llm }, secrets] = await Promise.all([getSettings(), getSecrets()]);
      const reply = await chat(llm, secrets.llmApiKey, '请只回复两个字：成功', 16);
      return { ok: true, message: `连接成功，模型回复：${reply.trim().slice(0, 50)}` };
    }

    case 'TEST_OBSIDIAN': {
      const [{ obsidian }, secrets] = await Promise.all([getSettings(), getSecrets()]);
      return { ok: true, message: await testObsidian(obsidian, secrets.obsidianApiKey) };
    }
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundRequest, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((e: unknown) => sendResponse({ ok: false, error: (e as Error).message }));
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
});
