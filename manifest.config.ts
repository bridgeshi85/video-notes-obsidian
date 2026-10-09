import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Video Notes for Obsidian',
  description: '提取 Udemy 课程字幕，用你自己的 LLM 生成中文结构化笔记，保存到 Obsidian。',
  version: pkg.version,
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Video Notes',
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['*://*.udemy.com/course/*/learn/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'activeTab', 'downloads'],
  host_permissions: [
    '*://*.udemy.com/*',
    'http://localhost:11434/*',
    'http://127.0.0.1:11434/*',
    'https://127.0.0.1:27124/*',
    'http://127.0.0.1:27123/*',
    'https://api.deepseek.com/*',
    'https://dashscope.aliyuncs.com/*',
    'https://open.bigmodel.cn/*',
  ],
  // 用户自定义 LLM 端点：在 options 页保存时通过 chrome.permissions.request 动态申请
  optional_host_permissions: ['https://*/*', 'http://*/*'],
});
