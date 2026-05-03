import { App, PluginSettingTab, Setting } from 'obsidian';
import type ShoppingListPlugin from './main';

export interface ShoppingListSettings {
	checkedItemsPlacement: 'top' | 'end';
}

export const DEFAULT_SETTINGS: ShoppingListSettings = {
	checkedItemsPlacement: 'top',
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
			.addDropdown(dropdown => dropdown
				.addOption('top', 'Top of checked items')
				.addOption('end', 'Bottom of checked items')
				.setValue(this.plugin.settings.checkedItemsPlacement)
				.onChange(async (value: 'top' | 'end') => {
					this.plugin.settings.checkedItemsPlacement = value;
					await this.plugin.saveSettings();
				}));
	}
}
