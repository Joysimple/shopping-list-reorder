# Automatic Shopping List Reorder for Obsidian

An Obsidian plugin that automatically manages your shopping lists by reordering items as you check them off. It keeps your active items at the top and moves completed items to the bottom, ensuring your shopping experience is fluid and focused.

## Features

- **Automatic Reordering**: When you check a checkbox, the item moves to the bottom of its section. Unchecking an item moves it back up to the active list.
- **Section Awareness**: Respects Markdown headers (`#`). Reordering only happens within the current section, allowing you to maintain categories (e.g., "Produce", "Dairy") in a single file.
- **Smart Debouncing**: Reorders occur after a 1-second delay of inactivity, preventing items from "jumping" while you are still making quick changes.
- **Cursor Awareness**: If you are editing a line that is about to be moved, the plugin will defer reordering until you move your cursor or finish editing, ensuring your typing flow is never interrupted.

## Getting Started

The plugin only activates on files that are explicitly marked as shopping lists. You can do this in two ways:

1.  **Frontmatter**: Add `shopping-list: true` to the YAML frontmatter of your note.
2.  **Tags**: Include the tag `#shopping-list` anywhere in your note.

## Settings

- **Checked items placement**: Choose where newly checked items should go relative to existing checked items:
    - **Top of checked items**: (Default) Newer completions appear at the top of the "checked" block.
    - **Bottom of checked items**: Newer completions appear at the very end of the section.

## Installation

### From GitHub

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Joysimple/shopping-list-automatic-reorder/releases).
2. Create a folder named `shopping-list-automatic-reorder` in your vault's `.obsidian/plugins/` directory.
3. Copy the downloaded files into that folder.
4. Reload Obsidian and enable the plugin in the settings.

## Development

If you want to contribute or build the plugin yourself:

1. Clone this repo.
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build` (or `npm run dev` for watch mode)
4. Use the provided `release.sh` script to bump versions and create tags: `./release.sh 0.0.6`

---

_Created with ❤️ for a better shopping experience._
