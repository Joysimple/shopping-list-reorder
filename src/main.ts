import { Plugin, TFile, getAllTags, MarkdownView, MarkdownPostProcessorContext } from 'obsidian';
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
        console.debug('Loading Automatic Shopping List Reorder plugin');

        await this.loadSettings();

        this.addSettingTab(new ShoppingListSettingTab(this.app, this));

        this.registerMarkdownPostProcessor((element, context) => {
            void this.addCategoryButtons(element, context);
        });

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && !this.isModifying) {
                    this.scheduleReorder(file);
                }
            }),
        );

        // Initial state capture for open files
        this.app.workspace.onLayoutReady(() => {
            this.initializeStates().catch((e) => console.error(e));
        });

        // Also handle file open to capture initial state if not already captured
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file instanceof TFile) {
                    this.initializeFileState(file).catch((e) => console.error(e));
                }
            }),
        );
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        ) as ShoppingListSettings;
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

    async addCategoryButtons(element: HTMLElement, context: MarkdownPostProcessorContext) {
        const file = this.app.vault.getAbstractFileByPath(context.sourcePath);
        if (!(file instanceof TFile) || !(await this.isShoppingList(file))) {
            return;
        }

        const headers = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headers.forEach((header: HTMLElement) => {
            if (header.querySelector('.sl-button-container')) return;

            header.classList.add('sl-clickable-header');
            const container = header.createSpan({ cls: 'sl-button-container' });
            let completedBtn: HTMLElement | null = null;

            // 1. Create Hide/Show (Collapse) button first (left side)
            if (this.settings.showToggleButtons) {
                const collapseBtn = container.createEl('button', {
                    text: 'Hide',
                    cls: 'sl-button sl-collapse-button',
                });

                const updateCollapseBtnText = () => {
                    const isCollapsed =
                        header.classList.contains('is-collapsed') ||
                        header.parentElement?.classList.contains('is-collapsed') ||
                        header
                            .closest('.markdown-preview-section')
                            ?.classList.contains('is-collapsed');
                    collapseBtn.setText(isCollapsed ? 'Show' : 'Hide');

                    // Hide "Hide Completed" button when section is collapsed
                    if (completedBtn) {
                        if (isCollapsed) {
                            completedBtn.classList.add('sl-hidden');
                        } else {
                            completedBtn.classList.remove('sl-hidden');
                        }
                    }
                };

                const performCollapse = (e: MouseEvent) => {
                    // If the click is on our buttons (other than collapseBtn), let them handle it
                    if (
                        e.target instanceof HTMLElement &&
                        e.target.closest('.sl-button') &&
                        e.target.closest('.sl-button') !== collapseBtn
                    ) {
                        return;
                    }

                    // IMPORTANT: If the click was already on the native indicator,
                    // DON'T click it again! Obsidian is already handling this click.
                    if (
                        e.target instanceof HTMLElement &&
                        e.target.closest('.collapse-indicator')
                    ) {
                        console.debug('Shopping List: Click already on indicator, ignoring');
                        return;
                    }

                    console.debug('Shopping List: performCollapse triggered', {
                        target: e.target,
                        currentTarget: e.currentTarget,
                    });

                    e.preventDefault();
                    e.stopPropagation();

                    const indicator =
                        header.querySelector('.collapse-indicator') ||
                        header.parentElement?.querySelector('.collapse-indicator') ||
                        header
                            .closest('.markdown-preview-section')
                            ?.querySelector('.collapse-indicator');

                    if (indicator instanceof HTMLElement) {
                        console.debug('Shopping List: Found indicator, clicking it');
                        // Use a more robust click simulation
                        indicator.dispatchEvent(
                            new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window,
                            }),
                        );
                        // The MutationObserver will handle the UI update
                    } else {
                        console.debug('Shopping List: No indicator found, manual toggle');
                        const isCollapsed = header.classList.toggle('sl-collapsed-header');
                        this.toggleSectionVisibility(header, isCollapsed);
                        updateCollapseBtnText();
                    }
                };

                // Sync with native folding via MutationObserver
                const observer = new MutationObserver(() => {
                    updateCollapseBtnText();
                });

                // Watch for class changes on the header, its parent, or the section
                observer.observe(header, { attributes: true, attributeFilter: ['class'] });
                if (header.parentElement) {
                    observer.observe(header.parentElement, {
                        attributes: true,
                        attributeFilter: ['class'],
                    });
                }
                const section = header.closest('.markdown-preview-section');
                if (section) {
                    observer.observe(section, { attributes: true, attributeFilter: ['class'] });
                }

                collapseBtn.addEventListener('click', performCollapse);
                header.addEventListener('click', (e) => {
                    // Ignore clicks on buttons or the native indicator
                    if (
                        e.target instanceof HTMLElement &&
                        (e.target.closest('.sl-button') || e.target.closest('.collapse-indicator'))
                    ) {
                        return;
                    }
                    performCollapse(e);
                });

                setTimeout(updateCollapseBtnText, 100);
            }

            // 2. Create Hide Completed button second (right side)
            if (this.settings.showHideCompletedButtons) {
                completedBtn = container.createEl('button', {
                    text: 'Hide completed',
                    cls: 'sl-button sl-completed-button',
                });
                completedBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isHidden = header.classList.toggle('sl-hide-completed-header');
                    completedBtn!.setText(isHidden ? 'Show completed' : 'Hide completed');
                    this.toggleCompletedVisibility(header, isHidden);
                });
            }

            header.appendChild(container);
        });
    }

    private getSectionContent(header: HTMLElement): HTMLElement[] {
        const content: HTMLElement[] = [];
        const headerLevel = parseInt(header.tagName.substring(1));
        if (isNaN(headerLevel)) return [];

        let currentBlock = header;
        // Go up to the top-level block container
        while (
            currentBlock.parentElement &&
            !currentBlock.parentElement.classList.contains('markdown-preview-sizer') &&
            !currentBlock.parentElement.classList.contains('markdown-rendered') &&
            !currentBlock.parentElement.classList.contains('markdown-preview-section')
        ) {
            currentBlock = currentBlock.parentElement;
        }

        console.debug(
            `Shopping List: Found section root at ${currentBlock.tagName}.${currentBlock.className}`,
        );

        let nextBlock = currentBlock.nextElementSibling as HTMLElement;
        while (nextBlock) {
            // Check if this block is another header or contains one
            const nextHeader = nextBlock.tagName.match(/^H[1-6]$/)
                ? nextBlock
                : nextBlock.querySelector('h1, h2, h3, h4, h5, h6');
            if (nextHeader instanceof HTMLElement) {
                const nextLevel = parseInt(nextHeader.tagName.substring(1));
                if (!isNaN(nextLevel) && nextLevel <= headerLevel) {
                    console.debug(
                        `Shopping List: Stopping at next header ${nextHeader.tagName} (Level ${nextLevel} <= ${headerLevel})`,
                    );
                    break;
                }
            }

            console.debug(
                `Shopping List: Adding block to toggle: ${nextBlock.tagName}.${nextBlock.className.replace(/\s/g, '.')}`,
            );
            content.push(nextBlock);
            nextBlock = nextBlock.nextElementSibling as HTMLElement;
        }
        return content;
    }

    toggleSectionVisibility(header: HTMLElement, isCollapsed: boolean) {
        const content = this.getSectionContent(header);
        console.debug(
            `Shopping List: Manual toggle visibility for ${content.length} blocks to ${isCollapsed ? 'hidden' : 'visible'}`,
        );
        content.forEach((el) => {
            if (isCollapsed) el.classList.add('sl-collapsed-content');
            else el.classList.remove('sl-collapsed-content');
        });
    }

    toggleCompletedVisibility(header: HTMLElement, isHidden: boolean) {
        const content = this.getSectionContent(header);
        console.debug(
            `Shopping List: Toggling completed items for ${content.length} blocks to ${isHidden ? 'hidden' : 'visible'}`,
        );
        content.forEach((el) => {
            if (isHidden) el.classList.add('sl-hide-completed-scope');
            else el.classList.remove('sl-hide-completed-scope');
        });
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
            this.handleFileModify(file).catch((e) => console.error(e));
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
                    console.debug(
                        'Cursor is on a shifting line during text edit, deferring reorder',
                    );
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
                if (
                    currentSection.header !== null ||
                    currentSection.items.length > 0 ||
                    currentSection.otherLines.length > 0
                ) {
                    sections.push(currentSection);
                }
                currentSection = { header: line, items: [], otherLines: [] };
            } else {
                const checkboxMatch = line.match(/^(\s*(?:-|\d+\.)\s*\[([ xX])\]\s*)(.*)/);
                if (checkboxMatch) {
                    currentSection.items.push({
                        text: checkboxMatch[3],
                        checked: checkboxMatch[2].toLowerCase() === 'x',
                        originalLine: line,
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
            const prevSec = previous.find((p) => p.header === currSec.header);

            if (currSec.header) {
                resultLines.push(currSec.header);
            }

            if (!prevSec) {
                const unchecked = currSec.items.filter((item) => !item.checked);
                const checked = currSec.items.filter((item) => item.checked);
                resultLines.push(...currSec.otherLines);
                resultLines.push(...unchecked.map((item) => item.originalLine));
                resultLines.push(...checked.map((item) => item.originalLine));
                continue;
            }

            const newlyChecked: ListItemState[] = [];
            const newlyUnchecked: ListItemState[] = [];
            const stillChecked: ListItemState[] = [];
            const stillUnchecked: ListItemState[] = [];

            const prevItemsMap = new Map<string, boolean>();
            prevSec.items.forEach((item) => prevItemsMap.set(item.text, item.checked));

            currSec.items.forEach((item) => {
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
                ...(this.settings.checkedItemsPlacement === 'top'
                    ? [...newlyChecked, ...stillChecked]
                    : [...stillChecked, ...newlyChecked]),
            ];

            resultLines.push(...currSec.otherLines);
            resultLines.push(...finalItems.map((item) => item.originalLine));
        }

        return resultLines.join('\n');
    }

    onunload() {
        this.debounceTimers.forEach((timer) => window.clearTimeout(timer));
        console.debug('Unloading Shopping List Reorder plugin');
    }
}
