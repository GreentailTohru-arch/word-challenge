# Word Challenge

An offline-first vocabulary trainer for Obsidian. Study English, Japanese, Chinese, or other languages from your own Markdown tables.

## Features

- Recall a word before revealing its reading and meaning.
- Red **Forgot**, yellow **Unsure**, and green **Know** review buttons with short synthesized feedback sounds.
- Daily new-word goals, additional learning after the goal, due reviews, streaks, and saved sessions.
- Filter the learning list by status. Click a word's status badge to change it.
- Responsive layouts for phones, tablets, split view, and desktop.
- Pre-study vocabulary previews with multi-select mastered-word skipping.
- End-of-session summaries with a result chart, daily goal progress, and another-group action.

The current interface is in Simplified Chinese. The vocabulary content can be in any language.

## Add your vocabulary

Create a folder named `Word Challenge/词库` in your vault, then add Markdown notes containing tables. You can choose any other folder in plugin settings. Each note becomes a study unit.

Two-column tables are enough:

```markdown
| Word | Meaning |
| --- | --- |
| apple | 苹果 |
| bonjour | 你好 |
```

Optional reading and part-of-speech columns:

```markdown
| 单词 | 读音 | 词性 | 释义 |
| --- | --- | --- | --- |
| challenge | /ˈtʃælɪndʒ/ | noun | 挑战 |
| 猫 | ねこ | 名词 | cat |
```

Accepted headers include `Word` / `Term` / `单词` / `词语` / `词条` / `日文`, `Meaning` / `Definition` / `Translation` / `释义` / `意思` / `翻译`, `Reading` / `Pronunciation` / `读音` / `假名` / `音标`, and `POS` / `Part of speech` / `词性`. Existing MOJi-style four-column tables with linked entry numbers are also supported. No dictionary or book content is bundled.

Word IDs are based on note paths, headings, terms, and readings. Keep these stable to retain progress. Editing a meaning does not change the ID. Repeated rows are tracked separately.

## Study and review

Open the command palette and run **Word Challenge: 打开背单词**, or use the ribbon icon.

1. Choose new words or due reviews to preview the upcoming vocabulary list. Return without starting, or select 开始新学 / 开始复习 to begin.
2. In the preview, tap 已掌握 at the top right to select familiar words (or select all), then confirm to mark them mastered and skip them. These edits do not count as study answers or toward the daily goal.
3. Recall the reading and meaning; tap to reveal.
4. Select 忘记 (Forgot), 模糊 (Unsure), or 认识 (Know).
5. Finish the queue to see a result chart, daily goal progress, and reviewed words. 再来一组 previews the next group. Each word is counted once using its last answer, even when repeated during a retry.

Desktop shortcuts: Space reveals the answer; 1/2/3 grade it. Finish today's goal to unlock another batch of new words. Unfinished new-word sessions resume through the New words / Continue new words button; review sessions resume through the Review button. There is no separate resume button or End session action.

| Rating | Schedule |
| --- | --- |
| Forgot | Due in 10 minutes; appended once to the current session |
| Unsure | Due in 1 day |
| Know | First 1 day, then approximately ×2.4; maximum 180 days |

The study screen has a three-dot menu: **掌握 (Mastered)** directly marks the current word mastered and sets a minimum 30-day interval; **上一题 (Previous)** undoes the last answer and its retry insertion before showing the word again. Older sessions without answer history allow revisiting without increasing review counts.

The latest rating wins, including retry ratings. A word counts as mastered when its interval is at least 21 days and its latest rating is Know. This is a simple interval scheduler, not FSRS or SM-2.

Click a status badge in the learning list to edit it. Manual edits reset the interval to 10 minutes for Forgot, or 1 day for Unsure/Know. They do not increase study counts, review counts, or streaks.

## Privacy and sync

The plugin reads only the configured folder inside your vault. Study progress and settings are stored in `.obsidian/plugins/qian-ci-zhan/data.json`. The technical plugin ID is retained for compatibility with the original local version.

No account, telemetry, paid service, bundled wordbook, or plugin-managed network request is required. Entry links open an external dictionary only when you click them. There is no listening mode or speech playback. Feedback sounds are synthesized locally with Web Audio.

Remotely Save can sync progress if configuration-folder syncing is enabled and the file is not excluded. Sync the source device, then the destination device, then reload this plugin on the destination. Live merging is not supported: avoid studying on two devices before syncing. Back up `data.json` before replacing or migrating a plugin installation.

## Manual installation

Copy `main.js`, `manifest.json`, and `styles.css` from the release into `.obsidian/plugins/qian-ci-zhan/` in your vault and enable **Word Challenge** in Community plugins.

Version `0.1.0` is the initial public release. Community-directory submission and approval are separate from publishing the GitHub release.

## Development

Runtime code is plain JavaScript with no build step. `main.js` includes the runtime helpers from `core.js`; when updating those helpers, keep the embedded copy in sync. Node.js is used only for development tests, never by the plugin on mobile.

Run `node --test tests/*.test.cjs`. The public repository includes synthetic vocabulary fixtures only.

## License

MIT. Vocabulary notes remain subject to their authors' licenses.
