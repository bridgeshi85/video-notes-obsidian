/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('builds a directly injectable content script without extension module imports', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = mkdtempSync(join(tmpdir(), 'video-notes-build-'));
  try {
    execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', output], {
      cwd: root,
      stdio: 'pipe',
    });
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
    expect(manifest.content_scripts).toHaveLength(1);
    const content = manifest.content_scripts[0];
    expect(content.matches).toContain('*://www.youtube.com/*');
    expect(content.matches).toContain('*://*.udemy.com/course/*/learn/*');
    expect(content.js).toEqual(['src/content/index.js']);
    const script = readFileSync(join(output, content.js[0]), 'utf8');
    expect(script).not.toMatch(/\bimport\s*\(/);
    expect(script).not.toContain('chrome.runtime.getURL');
    expect(script).toContain('transcript-toggle');
    expect(script).toContain('ytd-transcript-segment-renderer');
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}, 30_000);
