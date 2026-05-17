import { App, PluginSettingTab, Setting } from 'obsidian';
import type ShoppingListPlugin from './main';

export interface ShoppingListSettings {
    checkedItemsPlacement: 'top' | 'end';
    showToggleButtons: boolean;
    showHideCompletedButtons: boolean;
}

export const DEFAULT_SETTINGS: ShoppingListSettings = {
    checkedItemsPlacement: 'top',
    showToggleButtons: true,
    showHideCompletedButtons: true,
};

export class ShoppingListSettingTab extends PluginSettingTab {
    plugin: ShoppingListPlugin;

    constructor(app: App, plugin: ShoppingListPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Checked items placement')
            .setDesc('Where to place newly checked items relative to already checked items.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('top', 'Top of checked items')
                    .addOption('end', 'Bottom of checked items')
                    .setValue(this.plugin.settings.checkedItemsPlacement)
                    .onChange(async (value: 'top' | 'end') => {
                        this.plugin.settings.checkedItemsPlacement = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Show hide/show buttons')
            .setDesc('Add a button to categories to hide or show the entire section.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showToggleButtons).onChange(async (value) => {
                    this.plugin.settings.showToggleButtons = value;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Show hide completed buttons')
            .setDesc('Add a button to categories to hide or show completed items.')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showHideCompletedButtons)
                    .onChange(async (value) => {
                        this.plugin.settings.showHideCompletedButtons = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
