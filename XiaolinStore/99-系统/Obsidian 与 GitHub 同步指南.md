# Obsidian 与 GitHub 同步指南

当前仓库已经连接到：`https://github.com/weifuqiang007/obsidianworkspace.git`，分支为 `main`。

## 推荐的同步范围

应同步：

- Markdown、Canvas、Base 文件。
- 笔记中实际引用的图片和附件。
- 需要在多设备保持一致的 Obsidian 设置与插件清单。
- `CLAUDE.md` 和知识库模板。

不应同步：

- `.obsidian/workspace*.json`：窗口、标签页和当前打开文件，跨设备极易冲突。
- `.claudian/sessions/`：AI 会话运行状态。
- 密钥、令牌、Cookie 和本机临时文件。

根目录 `.gitignore` 已为以后新增的临时文件设置忽略规则。注意：已经被 Git 跟踪的 workspace 和 session 文件不会仅因新增 `.gitignore` 自动停止跟踪。

## 首次清理 Git 跟踪项

先确认这些文件没有需要共享的内容，再在仓库根目录执行：

```powershell
git rm --cached -- .obsidian/workspace.json .obsidian/workspace-mobile.json
git rm -r --cached -- .claudian/sessions
git add .gitignore CLAUDE.md RAG学习 99-系统
git status
```

确认 `git status` 只包含预期变化后再提交。`git rm --cached` 只停止 Git 跟踪，不会删除本机文件。

## 日常同步

推荐顺序是先拉取、再提交、最后推送：

```powershell
git pull --rebase --autostash origin main
git add -- '*.md' '*.canvas' '*.base' '*.png' '*.jpg' '*.jpeg' '*.gif' '*.webp' '*.svg' '*.pdf'
git commit -m "同步 Obsidian 笔记"
git push origin main
```

也可以在仓库根目录运行：

```powershell
& '.\99-系统\脚本\同步知识库.ps1'
```

脚本只收集笔记、附件、本知识库的规则和脚本，不会把插件会话状态加入提交。

## 多设备约定

1. 开始编辑前先拉取，结束编辑后尽快推送。
2. 同一篇笔记尽量不要在两台离线设备上同时修改。
3. 推送失败时不要强制推送；先解决冲突并保留双方有效内容。
4. 新设备克隆仓库后，在 Obsidian 中选择“打开本地仓库”并指向克隆目录。

