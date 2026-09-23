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

`data/notes` is still in the project. The current demo search still reads that folder. This `vault` folder is the one to open in Obsidian, and the one Brain should use next.

## How Brain searches (for JOS-10)

Brain does not read this folder automatically today. The search code is `src/lib/memory.ts`. It works like this:

1. It always searches markdown files directly inside `data/notes` and `data/user-notes` (not subfolders).
2. It also searches an Obsidian folder only when `OBSIDIAN_VAULT_PATH` is set.
3. That path should be this folder. From the project root, the value is `vault`. On Joseph's PC the full path is `C:\Users\hosef japosef\Documents\tmp-310a2048b18e7d16\vault`.
4. Inside that folder it reads `.md` files, including subfolders, up to 5 levels deep and up to 250 files. It skips hidden folders (names that start with `.`) and `node_modules`. A file bigger than 300 KB is skipped.
5. A hit is a note whose title or body contains a word from the question (words of one letter are ignored). The note title is the first `#` heading.
6. Chat does not write into this vault. A saved note still goes to `data/user-notes`.

JOS-10 is the later change that should make answers come from this vault. This file only records the path. It does not change Brain.
