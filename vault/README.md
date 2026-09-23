# Open this folder in Obsidian

This `vault` folder is the vault. Open the folder, not a single note.

On Joseph's computer the project is:

`C:\Users\hosef japosef\Documents\tmp-310a2048b18e7d16`

The vault inside it is:

`C:\Users\hosef japosef\Documents\tmp-310a2048b18e7d16\vault`

## Try it

1. If this `vault` folder is not on the computer yet, update the project copy first.
2. Open Obsidian.
3. Choose **Open folder as vault**. (If a vault is already open: vault switcher at the bottom left, then **Open folder as vault**.)
4. Select the `vault` folder above.
5. You should see these notes: About, Goals, Swim, School, Preferences, and this README.

The first open creates a hidden `.obsidian` folder next to these notes. That folder is Obsidian's own settings. It stays on your computer and is not part of the notes.

Edit any note and save. That is the whole check.

## What is real in here

About, School, and Goals repeat the few facts from the old `data/notes` files (9th grade, soccer after school, library book due Friday, science fair on light and plant growth). Swim has no facts yet because none were stored. Preferences only records how this vault is meant to be used.

`data/notes` is still in the project. Chat answers do not read it. This `vault` folder is the one to open in Obsidian, and the one Brain reads.

## How Brain answers

Brain answers from this folder. The code is `src/lib/vault-read.ts` and `src/lib/grounded-answer.ts`.

1. If `OBSIDIAN_VAULT_PATH` is set, that folder is the vault. If it is unset, Brain uses the `vault` folder in the project. On Joseph's PC the full path is `C:\Users\hosef japosef\Documents\tmp-310a2048b18e7d16\vault`.
2. It reads `.md` files, including subfolders, up to 5 levels deep and up to 250 files. It skips hidden folders (names that start with `.`) and `node_modules`. A file bigger than 300 KB is skipped.
3. A matching note contains a real word from the question. The reply quotes those lines and names the notes, for example `Notes used: School, Goals.`
4. If no note says it, the reply says it does not have that, and it lists the notes it checked. It does not fill the gap.
5. With no model key, that local reading is the whole answer. With an xAI key, Grok may word the same notes. Wording that adds facts is dropped.
6. “Remember that…” can add a line in this vault. Preferences and decisions go on `Preferences.md`. The reply does not read the note back. Ask “what changed” for the file and a short summary. See `WRITEBACK.md` in the project.
7. If this folder is missing, the reply says **Brain wiring** and does not answer from anywhere else.
