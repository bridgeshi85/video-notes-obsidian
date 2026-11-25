# Plan: YouTube 字幕提取 + 总结/对话

## Goal
Add YouTube watch pages as a second platform. Reuse the existing pipeline unchanged: summary generation (`GENERATE`), side-panel Q&A (`CHAT`), transcript download and saving to Obsidian.

## Decisions
- **How transcripts are extracted**: from the DOM transcript panel only. The content script opens the "显示文字稿 / Show transcript" panel, collects the text, then closes the panel again. Do not use the timedtext API: it now often requires a PO Token.
- **Where notes go in Obsidian**: one flat folder, `<baseFolder 的父级>/YouTube` (see step 5). No MOC; nothing is created or appended.
- **Metadata**: extend `LectureMeta` with `platform: 'udemy' | 'youtube'`; do not create a parallel type. Map the YouTube fields as follows:
  - `course` = channel name
  - `courseSlug` = channel handle, or `''`
  - `lecture` = video title
  - `index` = `''`
  - `instructor` = channel name
  - `duration` = taken from `video.duration`
- Out of scope: picking the subtitle language or translation (whatever language the panel shows is used), Shorts, live streams, and a configurable YouTube folder (could be added later).

## Tasks
1. **types.ts**: add `platform` to `LectureMeta`. Older stored jobs and history entries have no `platform` field; treat a missing value as `'udemy'`.
2. **manifest.config.ts**:
   - Add `*://www.youtube.com/*` to the content-script matches and to host_permissions.
   - Match `/*`, not `/watch*`. YouTube is a SPA, so the script has to be present before the user navigates to a watch page.
3. **Content script split**:
   - Move the Udemy logic into `src/content/udemy.ts` and add `src/content/youtube.ts`.
   - `src/content/index.ts` picks one of them by `location.hostname` and handles `EXTRACT`/`GET_META` the same way it does now.
   - Each platform module exports `{ isSupportedPage, extract, readMeta }`.
4. **youtube.ts + YouTube selectors** (in `selectors.ts` or a new `youtube-selectors.ts`, with fallback candidates):
   - `isSupportedPage`: the path is `/watch` and `v` is present.
   - Open the panel. First try `ytd-video-description-transcript-section-renderer button`. If that is missing, expand the description (`#expand`) and try again. Wait for `ytd-transcript-segment-renderer`, using `waitFor` with a timeout of about 8s.
   - Read the cues from `ytd-transcript-segment-renderer .segment-text`. YouTube renders every segment, so no virtual scrolling is needed. Remove duplicates, then run the text through `cleanTranscript`.
   - Close the panel afterwards if the script opened it, using the panel's close button in `ytd-engagement-panel-section-list-renderer[target-id*=transcript]`.
   - If no transcript button exists, return the error 「该视频没有字幕/文字稿」. The user can still use the existing manual `.vtt`/`.srt` upload.
   - Metadata selectors:
     - title: `h1.ytd-watch-metadata yt-formatted-string`
     - channel: `ytd-channel-name#channel-name a`
     - handle: taken from that link's href (`/@xxx`)
   - SPA staleness: compare `v` in the URL with the video ID the panel was loaded for. On `yt-navigate-finish`, reset any cached state.
5. **note.ts**:
   - `buildNotePaths`: when `platform==='youtube'`, the folder is `dirname(baseFolder)/YouTube`; the default setting gives `素材库/VideoNotes/YouTube`. If `baseFolder` has no parent, use `YouTube`. The note name is the sanitized title plus `-<videoId 前 6 位>`, so two videos with the same title don't collide.
   - `buildNote`/`buildTranscriptNote`:
     - Tags are `youtube` plus the channel tag, and the frontmatter uses `channel:` instead of `course:`.
     - Drop the "🔗 上下文 MOC" link line. The heading is `# <title>`.
   - Expose a flag `paths.moc` (`null` for YouTube).
6. **background/obsidian.ts `saveToObsidian`**: skip creating or appending the MOC when `paths.moc` is null. `downloadNote` needs no change.
7. **Prompts (config.ts)**: the current templates say “课程/讲师”. Either make the wording generic (视频/作者), or pass `{{platform}}` and keep the wording neutral. Check `renderTemplate` vars for `course`/`lecture` and keep their names.
8. **Popup / sidepanel**:
   - Wherever the UI checks for a Udemy URL, replace that check with a `isSupportedUrl(url)` helper in shared code that covers both hosts.
   - Update the "不在 Udemy 页面" error text.
   - Chat session keys already use `url`. For YouTube, normalize the key to `watch?v=<id>` so that timestamp and playlist params don't split one video into several sessions.
9. **Docs**: add a YouTube section to README.md (how to use it, the no-subtitles case, where notes are stored).

## Risks
- YouTube changes its DOM often. Keep all selectors in one place with fallbacks, and turn a failed selector into a clear error message.
- The UI language changes the button text, so never match on text; use element/tag names only.
- Long videos can produce more than 100k characters. The existing map-reduce handles summaries, but `chatWithTranscript` truncates the transcript to `chunkTokens*2`. Mention this in the README; changing it is out of scope.

## Validation
- Unit tests (vitest + jsdom):
  - `buildNotePaths`/`buildNote` for YouTube: folder, filename suffix, no MOC link, tags.
  - `isSupportedUrl`.
  - A jsdom fixture for `youtube.ts` extraction with mock `ytd-transcript-segment-renderer` nodes.
  - The Udemy tests still pass.
- `npm run typecheck && npm test && npm run build`.
- Manual testing with the extension loaded unpacked:
  1. A video with subtitles: summary, chat, save to Obsidian. Confirm the note is in `VideoNotes/YouTube` and no MOC file was created.
  2. A video with no subtitles: the clear error appears.
  3. In-SPA navigation to another video: the new transcript loads, not the previous one.
  4. A Udemy regression check.
