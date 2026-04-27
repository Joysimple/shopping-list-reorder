import { Plugin, TFile, getAllTags } from 'obsidian';

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
	fileStates: Map<string, SectionState[]> = new Map();
	isModifying: boolean = false;

	async onload() {
		console.debug('Loading Shopping List Reorder plugin');

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && !this.isModifying) {
					this.handleFileModify(file).catch(e => console.error(e));
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
				...stillChecked,
				...newlyChecked
			];

			resultLines.push(...currSec.otherLines);
			resultLines.push(...finalItems.map(item => item.originalLine));
		}

		return resultLines.join('\n');
	}

	onunload() {
		console.debug('Unloading Shopping List Reorder plugin');
	}
}
