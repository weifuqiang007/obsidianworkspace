const {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFolder,
} = require('obsidian');

const PLUGIN_ID = 'project-graph-manager';
const GROUP_TITLE = '项目关系图谱';
const DEFAULT_SETTINGS = {
  autoSync: true,
  excludedFolders: ['99-系统', 'Excalidraw', 'OtherFilesOrPics', 'webclip'],
};

function graphOptions(folderName) {
  const escapedName = folderName.replace(/"/g, '\\"');
  return {
    'collapse-filter': false,
    search: `path:"${escapedName}"`,
    showTags: false,
    showAttachments: false,
    hideUnresolved: true,
    showOrphans: true,
    'collapse-color-groups': true,
    colorGroups: [],
    'collapse-display': true,
    showArrow: false,
    textFadeMultiplier: -1,
    nodeSizeMultiplier: 1,
    lineSizeMultiplier: 1,
    'collapse-forces': true,
    centerStrength: 0.5,
    repelStrength: 10,
    linkStrength: 1,
    linkDistance: 100,
    scale: 0.45,
    close: true,
  };
}

class ProjectGraphManagerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('自动同步项目图谱')
      .setDesc('Obsidian 启动，以及顶层项目文件夹新增、删除或重命名时自动刷新。')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSync)
          .onChange(async (value) => {
            this.plugin.settings.autoSync = value;
            await this.plugin.saveSettings();
            if (value) await this.plugin.syncProjectGraphs(true);
          }),
      );

    new Setting(containerEl)
      .setName('忽略的顶层文件夹')
      .setDesc('每行一个目录名。这些目录不会被当作项目。以点开头的隐藏目录始终忽略。')
      .addTextArea((text) => {
        text
          .setPlaceholder('99-系统\nExcalidraw\nOtherFilesOrPics\nwebclip')
          .setValue(this.plugin.settings.excludedFolders.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split(/\r?\n/)
              .map((name) => name.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 8;
        text.inputEl.cols = 32;
      });

    new Setting(containerEl)
      .setName('立即刷新')
      .setDesc('重新扫描顶层项目文件夹，并更新“项目关系图谱”书签组。')
      .addButton((button) =>
        button
          .setButtonText('刷新项目图谱')
          .setCta()
          .onClick(() => this.plugin.syncProjectGraphs(true)),
      );
  }
}

module.exports = class ProjectGraphManagerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addRibbonIcon('refresh-cw', '刷新项目关系图谱', () => {
      this.syncProjectGraphs(true);
    });

    this.addCommand({
      id: 'refresh-project-graphs',
      name: '刷新项目关系图谱',
      callback: () => this.syncProjectGraphs(true),
    });

    this.addSettingTab(new ProjectGraphManagerSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.autoSync) this.scheduleSync();

      this.registerEvent(
        this.app.vault.on('create', (file) => {
          if (this.settings.autoSync && this.isTopLevelFolder(file)) this.scheduleSync();
        }),
      );

      this.registerEvent(
        this.app.vault.on('delete', (file) => {
          if (this.settings.autoSync && this.isTopLevelFolder(file)) this.scheduleSync();
        }),
      );

      this.registerEvent(
        this.app.vault.on('rename', (file, oldPath) => {
          if (
            this.settings.autoSync &&
            (this.isTopLevelFolder(file) || this.isTopLevelPath(oldPath))
          ) {
            this.scheduleSync();
          }
        }),
      );
    });
  }

  onunload() {
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
  }

  async loadSettings() {
    const saved = (await this.loadData()) || {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      excludedFolders: Array.isArray(saved.excludedFolders)
        ? saved.excludedFolders
        : [...DEFAULT_SETTINGS.excludedFolders],
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  isTopLevelPath(path) {
    return typeof path === 'string' && path.length > 0 && !path.includes('/');
  }

  isTopLevelFolder(file) {
    return file instanceof TFolder && this.isTopLevelPath(file.path);
  }

  scheduleSync() {
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      this.syncProjectGraphs(false);
    }, 600);
  }

  getProjectFolderNames() {
    const excluded = new Set(this.settings.excludedFolders);
    return this.app.vault
      .getRoot()
      .children.filter(
        (item) =>
          item instanceof TFolder &&
          !item.name.startsWith('.') &&
          !excluded.has(item.name),
      )
      .map((folder) => folder.name)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  async syncProjectGraphs(showNotice) {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      const configDir = this.app.vault.configDir || '.obsidian';
      const bookmarksPath = `${configDir}/bookmarks.json`;
      const adapter = this.app.vault.adapter;
      let bookmarks = { items: [] };

      if (await adapter.exists(bookmarksPath)) {
        try {
          bookmarks = JSON.parse(await adapter.read(bookmarksPath));
        } catch (error) {
          console.error(`[${PLUGIN_ID}] 无法解析 bookmarks.json`, error);
          new Notice('项目图谱刷新失败：书签配置不是有效的 JSON。');
          return;
        }
      }

      if (!Array.isArray(bookmarks.items)) bookmarks.items = [];

      const oldGroup = bookmarks.items.find(
        (item) => item.type === 'group' && item.title === GROUP_TITLE,
      );
      const otherItems = bookmarks.items.filter(
        (item) => !(item.type === 'group' && item.title === GROUP_TITLE),
      );
      const oldCreatedTimes = new Map();

      for (const item of oldGroup?.items || []) {
        if (item.type === 'graph' && item.title) {
          oldCreatedTimes.set(item.title, item.ctime);
        }
      }

      let createdTime = Date.now();
      const projectFolders = this.getProjectFolderNames();
      const graphItems = projectFolders.map((folderName) => {
        const title = `${folderName} · 项目图谱`;
        return {
          type: 'graph',
          ctime: oldCreatedTimes.get(title) || createdTime++,
          title,
          options: graphOptions(folderName),
        };
      });

      bookmarks.items = [
        {
          type: 'group',
          ctime: oldGroup?.ctime || createdTime,
          items: graphItems,
          title: GROUP_TITLE,
        },
        ...otherItems,
      ];

      const nextJson = `${JSON.stringify(bookmarks, null, 2)}\n`;
      const currentJson = (await adapter.exists(bookmarksPath))
        ? await adapter.read(bookmarksPath)
        : '';

      if (currentJson !== nextJson) {
        await adapter.write(bookmarksPath, nextJson);
      }

      if (showNotice) {
        new Notice(`项目关系图谱已刷新：${projectFolders.length} 个项目`);
      }
    } catch (error) {
      console.error(`[${PLUGIN_ID}] 刷新失败`, error);
      new Notice('项目图谱刷新失败，请查看开发者控制台。');
    } finally {
      this.syncInProgress = false;
    }
  }
};

