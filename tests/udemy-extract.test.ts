// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { extract } from '../src/content/udemy';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('uses Udemy transcript toggle and cues without touching YouTube controls', async () => {
  window.history.replaceState(null, '', '/course/docker/learn/lecture/123');
  document.body.innerHTML = `
    <h1 data-purpose="course-header-title">Docker Course</h1>
    <div data-purpose="curriculum-item-viewer-title">12. Containers</div>
    <button data-purpose="transcript-toggle"></button>
    <ytd-video-description-transcript-section-renderer><button></button></ytd-video-description-transcript-section-renderer>`;
  const youtubeClick = vi.fn();
  document.querySelector('ytd-video-description-transcript-section-renderer button')!.addEventListener('click', youtubeClick);
  const toggle = document.querySelector<HTMLButtonElement>('[data-purpose="transcript-toggle"]')!;
  const toggleClick = vi.fn(() => {
    const existing = document.querySelector('[data-purpose="transcript-panel"]');
    if (existing) { existing.remove(); return; }
    const panel = document.createElement('div');
    panel.dataset.purpose = 'transcript-panel';
    panel.innerHTML = `
      <div data-purpose="transcript-cue"><span data-purpose="cue-text">Docker uses containers.</span></div>
      <div data-purpose="transcript-cue-active"><span data-purpose="cue-text">Images are reusable.</span></div>`;
    document.body.appendChild(panel);
  });
  toggle.addEventListener('click', toggleClick);
  const result = await extract();
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.transcript.meta).toMatchObject({ platform: 'udemy', course: 'Docker Course', lecture: 'Containers', index: '012' });
  expect(result.transcript.text).toContain('Docker uses containers.');
  expect(result.transcript.text).toContain('Images are reusable.');
  expect(toggleClick).toHaveBeenCalledTimes(2);
  expect(youtubeClick).not.toHaveBeenCalled();
  expect(document.querySelector('[data-purpose="transcript-panel"]')).toBeNull();
});
