# 当前 V7 使用的标准人物

网页当前加载两个完整的 VRoid beta 标准人物，保留原始网格、蒙皮权重、54 个标准人体映射关节，以及每指三节骨骼。没有继续使用 V4 的自制手部或胶囊骨架。

| 角色 | 来源模型 | 完整变形骨骼 | 适配 |
| --- | --- | --- | --- |
| 侦探 | Sakurada Fumiriya | 107 | 黑发、眼镜、蓝色服装、红领结，少年侦探比例 |
| 第一人称访客 | Sendagaya Shibu | 129 | 保留完整人物源；运行时显示其原始手臂与手，手臂长度按镜头适配 1.3 倍，手掌尺寸保持原样 |

两个模型是旧版 beta 示例。下载文件的 VRM 内嵌许可为 `CC0`，允许 Everyone / Commercial；原始许可元数据与 SHA256 见 `assets-v5/Sakurada_Fumiriya.json`、`assets-v5/Sendagaya_Shibu.json`。这不代表 VRoid 的所有现行示例都属于 CC0。

- 官方许可说明：[VRoid example models](https://vroid.pixiv.help/hc/en-us/articles/4402614652569)。官方 API 回执保存在 `assets-v5/official-model-license.json`。
- 原模型镜像：[Sakurada Fumiriya](https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Sakurada_Fumiriya.vrm)、[Sendagaya Shibu](https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Sendagaya_Shibu.vrm)。
- 动作：[Quaternius Universal Animation Library Standard](https://quaternius.itch.io/universal-animation-library)，CC0。许可原件见 `assets-v5/Quaternius-License.txt`。Sitting Idle / Sitting Talking / Driving / PickUp Table / Interact / Idle 六段动作重定向到两个原骨架，作为姿态层；纸张和工具接触由原生手臂骨骼 IK 校准，手指夹持另作适配。没有宣称整段交接是外部动作捕捉。
- 房间为工程原创，沿用 `bureau-room-v3.glb`。three.js 0.180.0 为 MIT。
- 可编辑源为 `assets-source-v5.blend`。`Standard Humanoids V5` 保存两个适配后的完整人物，`Standard Motion Library V5` 保存动作源。
- 准备、手臂适配、重定向脚本依次为 `prepare_standard_v5.py`、`fit_viewmodel_v5.py`、`retarget_standard_v5.py`。原始下载在忽略的 `.tools/standard-rigs/`，导出的 GLB 自含贴图，不需外部 CDN 或运行时下载。
- 当前运行资源与哈希见 `asset-manifest.json`。V4 及以下仅为历史记录。

---

# 历史 V4 资产

V4 的少年侦探为本工程原创建模，参考日式少年侦探的可爱比例、深色分束发型、眼镜、蓝色西装和红色领结；未下载或提取动画角色模型、纹理或动作。

- 房间：本工程 Blender 脚本原创，沿用 `bureau-room-v3.glb`。
- 头部、五官、分束头发、服装：`scripts/build_anime_v4.py` 经 Blender MCP 创建，输出 `anime-detective-v4.glb`。
- 手：同脚本将掌部与五指融合为一层连续表面，6905 顶点、13806 三角形。运行时为每只手绑定 16 个关节；双层手指的旧几何不再加载。
- 袖子：`public/skin-hand.js` 创建连续蒙皮曲面；电脑、扫描仪与进度设备由 `public/equipment.js` 构造。
- `character-rig-v4.glb` 从实际运行时模型导出供 Blender 编辑，包含双手和双袖的蒙皮；网页不会重复加载这个编辑用导出。
- 渲染库：three.js 0.180.0，MIT；见依赖包 LICENSE。
- V4 无付费生成调用、外部角色模型或外部贴图依赖。具体文件哈希和预算见 `asset-manifest.json`。

以下为历史 V3 资产记录，保留供来源追溯，不代表当前网页在使用这些人物资产。

---

# Character and environment provenance

The office architecture and furniture were authored procedurally for this project. Version 3 replaces the earlier primitive characters with continuous anatomical meshes from the MakeHuman Community, fitted and rigged through MPFB in Blender.

MakeHuman lists the following system assets as CC0 in its [official system asset inventory](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html): base mesh and morph targets, game-engine rig weights, young Asian male skin, high-poly eyes with brown material, eyebrow002, short04 hair, shoes01 and fedora01. The official [MPFB core asset licensing FAQ](https://static.makehumancommunity.org/mpfb/faq/build_other_chargen.html) describes the CC0 core assets.

The clothing is `toigo_male_suit_tie_and_jacket` by Margaret Toigo, listed as CC0 in the [official Suits 01 inventory](https://static.makehumancommunity.org/assets/assetpacks/suits01.html). This project replaces the patterned tie material with plain burgundy silk and uses a dark felt material on the fedora. The meshes retain their anatomical skin weights and UV coordinates.

Official source downloads, retrieved 2026-10-24:

- MPFB tooling: https://github.com/makehumancommunity/mpfb2
- System assets: https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
- Formal suits: https://files.makehumancommunity.org/asset_packs/suits01/suits01_cc0.zip

MPFB is modelling tooling under its own open-source license; its source remains in the ignored `.tools/` directory and is not bundled into the website or Docker image. The exported human meshes, textures and derived clothing are CC0 assets. No paid mesh generator was used.

The two GLBs each contain a complete continuous human mesh and a 53-joint deform skeleton. Runtime renders a weighted arm view for the player to avoid drawing the camera inside its own head or hair. This view is extracted from the same continuous skinned model; it is not a set of capsule fingers. Both complete characters remain editable in the packed Blender sources.

Runtime files are self-contained GLBs. Blender source textures are packed into `assets-source-v3.blend` and `actors-source-v3.blend`. Hashes, texture counts and mesh counts are in `asset-manifest.json`.

## V7 一体调查仪器

`public/assets/instrument-v7.glb` 由本工程 `scripts/build_instrument_v7.py` 在 Blender 4.5.9 中建模与导出，可编辑源为 `instrument-source-v7.blend`。外壳、扫描床、出纸槽、导轨、散热片和紧固件为本工程自建几何，未使用付费生成服务或第三方仪器模型。屏幕内容在网页中由实际调查事件绘制。

## V8 人体交互修正

两位人物仍使用同一组 VRoid CC0 原生模型。运行时增加每侧四个只用于蒙皮的前臂扭转关节，保留原生肩、肘、腕和五指接触骨骼；源 GLB 未被替换。指关节由受限铰链与拇指对掌参数驱动。

一体仪器后移 0.40 个场景单位，仍由本工程自建：`scripts/build_instrument_v8.py`、`instrument-source-v8.blend`、`public/assets/instrument-v8.glb`。脚本以 V7 尺寸表为基准整体移动，运行时共享尺寸已同步验证。未使用外部付费生成服务。
