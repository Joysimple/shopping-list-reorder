import { Plugin, TFile, getAllTags, MarkdownView } from 'obsidian';
import { ShoppingListSettings, DEFAULT_SETTINGS, ShoppingListSettingTab } from './settings';

interface SectionState {
	header: string | null;
	items: ListItemState[];
	otherLines: string[];
}

interface ListItemState {
	text: string;
	checked: boolean;
	originalLine: string;
}

export default class ShoppingListPlugin extends Plugin {
	settings: ShoppingListSettings;
	fileStates: Map<string, SectionState[]> = new Map();
	isModifying: boolean = false;
	debounceTimers: Map<string, number> = new Map();

	async onload() {
		console.debug('Loading Shopping List Reorder plugin');

		await this.loadSettings();

		this.addSettingTab(new ShoppingListSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && !this.isModifying) {
					this.scheduleReorder(file);
				}
			})
		);

		// Initial state capture for open files
		this.app.workspace.onLayoutReady(() => {
			this.initializeStates().catch(e => console.error(e));
		});

		// Also handle file open to capture initial state if not already captured
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file instanceof TFile) {
					this.initializeFileState(file).catch(e => console.error(e));
				}
			})
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as ShoppingListSettings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async initializeStates() {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			await this.initializeFileState(file);
		}
	}

	async initializeFileState(file: TFile) {
		if (await this.isShoppingList(file)) {
			const content = await this.app.vault.read(file);
			this.fileStates.set(file.path, this.parseSections(content));
		}
	}

	async isShoppingList(file: TFile): Promise<boolean> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return false;
		
		const frontmatterValue: unknown = cache.frontmatter?.['shopping-list'];
		if (frontmatterValue === true || frontmatterValue === 'true') {
			return true;
		}

		const tags = getAllTags(cache);
		if (tags && (tags.includes('#shopping-list') || tags.includes('shopping-list'))) {
			return true;
		}

		return false;
	}

	scheduleReorder(file: TFile) {
		const timer = this.debounceTimers.get(file.path);
		if (timer) {
			window.clearTimeout(timer);
		}

		const newTimer = window.setTimeout(() => {
			this.handleFileModify(file).catch(e => console.error(e));
		}, 1000);
		
		this.debounceTimers.set(file.path, newTimer);
	}

	isOnlyCheckboxToggle(current: SectionState[], previous: SectionState[]): boolean {
		if (current.length !== previous.length) return false;
		for (let i = 0; i < current.length; i++) {
			const curr = current[i];
			const prev = previous[i];
			if (curr.header !== prev.header) return false;
			if (curr.otherLines.length !== prev.otherLines.length) return false;
			for (let j = 0; j < curr.otherLines.length; j++) {
				if (curr.otherLines[j] !== prev.otherLines[j]) return false;
			}
			if (curr.items.length !== prev.items.length) return false;
			for (let j = 0; j < curr.items.length; j++) {
				if (curr.items[j].text !== prev.items[j].text) return false;
			}
		}
		return true;
	}

	async handleFileModify(file: TFile) {
		if (!(await this.isShoppingList(file))) {
			return;
		}

		const content = await this.app.vault.read(file);
		const currentSections = this.parseSections(content);
		const previousSections = this.fileStates.get(file.path);

		if (!previousSections) {
			console.debug('No previous state for', file.path, '- capturing current state');
			this.fileStates.set(file.path, currentSections);
			return;
		}

		const reorderedContent = this.reorderSections(currentSections, previousSections);

		if (reorderedContent !== content) {
			const isOnlyToggle = this.isOnlyCheckboxToggle(currentSections, previousSections);

			// Cursor Awareness: Check if we are currently editing this file
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.file?.path === file.path && !isOnlyToggle) {
				const editor = activeView.editor;
				const cursor = editor.getCursor();
				
				// If the cursor is on a line that would be moved/shifted during a text edit, defer reordering
				const lines = content.split('\n');
				const newLines = reorderedContent.split('\n');
				
				if (cursor.line < lines.length && lines[cursor.line] !== newLines[cursor.line]) {
					console.debug('Cursor is on a shifting line during text edit, deferring reorder');
					this.scheduleReorder(file);
					return;
				}
			}

			console.debug('Reordering shopping list for', file.path);
			this.isModifying = true;
			try {
				await this.app.vault.modify(file, reorderedContent);
				// Update state after modification
				this.fileStates.set(file.path, this.parseSections(reorderedContent));
			} catch (e) {
				console.error('Failed to modify file:', e);
			} finally {
				this.isModifying = false;
			}
		} else {
			this.fileStates.set(file.path, currentSections);
		}
	}

	parseSections(content: string): SectionState[] {
		const lines = content.split('\n');
		const sections: SectionState[] = [];
		let currentSection: SectionState = { header: null, items: [], otherLines: [] };

		for (const line of lines) {
			if (line.startsWith('#')) {
				if (currentSection.header !== null || currentSection.items.length > 0 || currentSection.otherLines.length > 0) {
					sections.push(currentSection);
				}
				currentSection = { header: line, items: [], otherLines: [] };
			} else {
				const checkboxMatch = line.match(/^(\s*(?:-|\d+\.)\s*\[([ xX])\]\s*)(.*)/);
				if (checkboxMatch) {
					currentSection.items.push({
						text: checkboxMatch[3],
						checked: checkboxMatch[2].toLowerCase() === 'x',
						originalLine: line
					});
				} else {
					currentSection.otherLines.push(line);
				}
			}
		}
		sections.push(currentSection);
		return sections;
	}

	reorderSections(current: SectionState[], previous: SectionState[]): string {
		const resultLines: string[] = [];

		for (let i = 0; i < current.length; i++) {
			const currSec = current[i];
			const prevSec = previous.find(p => p.header === currSec.header);

			if (currSec.header) {
				resultLines.push(currSec.header);
			}

			if (!prevSec) {
				const unchecked = currSec.items.filter(item => !item.checked);
				const checked = currSec.items.filter(item => item.checked);
				resultLines.push(...currSec.otherLines);
				resultLines.push(...unchecked.map(item => item.originalLine));
				resultLines.push(...checked.map(item => item.originalLine));
				continue;
			}

			const newlyChecked: ListItemState[] = [];
			const newlyUnchecked: ListItemState[] = [];
			const stillChecked: ListItemState[] = [];
			const stillUnchecked: ListItemState[] = [];

			const prevItemsMap = new Map<string, boolean>();
			prevSec.items.forEach(item => prevItemsMap.set(item.text, item.checked));

			currSec.items.forEach(item => {
				const prevChecked = prevItemsMap.get(item.text);
				if (prevChecked === undefined) {
					if (item.checked) stillChecked.push(item);
					else stillUnchecked.push(item);
				} else if (!prevChecked && item.checked) {
					newlyChecked.push(item);
				} else if (prevChecked && !item.checked) {
					newlyUnchecked.push(item);
				} else if (item.checked) {
					stillChecked.push(item);
				} else {
					stillUnchecked.push(item);
				}
			});

			const finalItems = [
				...stillUnchecked,
				...newlyUnchecked,
				...(this.settings.checkedItemsPlacement === 'top' ? [...newlyChecked, ...stillChecked] : [...stillChecked, ...newlyChecked])
			];

			resultLines.push(...currSec.otherLines);
			resultLines.push(...finalItems.map(item => item.originalLine));
		}

		return resultLines.join('\n');
	}

	onunload() {
		this.debounceTimers.forEach(timer => window.clearTimeout(timer));
		console.debug('Unloading Shopping List Reorder plugin');
	}
}
