# 坦克大战 Tank Battle

经典「坦克大战」（Battle City）网页复刻版，纯原生 **HTML5 + Canvas + JavaScript** 实现，零依赖、单页运行。

## 在线试玩

直接打开 [GitHub Pages](https://<你的用户名>.github.io/tank-battle/) 或双击 `index.html` 即可游玩。

## 玩法

- 操控你的坦克，**保护基地**（黄色旗帜）不被敌人摧毁。
- 消灭所有敌方坦克即可通关，进入下一关（难度递增）。
- 基地一旦被毁，或生命耗尽，游戏结束。

## 操作

| 按键 | 功能 |
| ---- | ---- |
| 方向键 / WASD | 移动 |
| 空格 / J | 射击 |
| P | 暂停 / 继续 |
| M | 静音 |
| Enter | 开始 / 重新开始 / 下一关 |

## 特性

- 🧱 可摧毁的砖墙、不可摧毁的钢墙、阻挡坦克的水面、隐藏坦克的草丛
- 🎯 四种敌人：普通、快速、火力、装甲（3 点生命）
- ⭐ 五种道具：武器升级、护盾、加命、炸弹、冰冻
- 🔫 三级武器系统（最高级可击穿钢墙）
- 🔊 Web Audio 合成音效
- 💾 最高分本地存档
- 🎮 无限关卡，难度随关卡提升

## 本地运行

无需构建，直接用浏览器打开 `index.html`：

```bash
# 或启动一个本地静态服务器
python -m http.server 8000
# 然后访问 http://localhost:8000
```

## 部署到 GitHub Pages

仓库已包含 `index.html`，在仓库 **Settings → Pages** 中选择分支（`main`）与目录（`/ (root)`），保存后即可通过 `https://<用户名>.github.io/tank-battle/` 访问。

## 文件结构

```
tank-battle/
├── index.html    # 页面入口
├── style.css     # 样式
├── game.js       # 全部游戏逻辑
└── README.md
```
