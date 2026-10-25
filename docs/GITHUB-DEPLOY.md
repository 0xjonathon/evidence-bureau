# 从 GitHub 运行与部署

仓库包含网页、服务端、测试、运行用 GLB 模型和模型构建脚本。大型历史 Blender 工程保留在本地，当前仪器源文件 `instrument-source-v9.blend` 随仓库提供；人物与动画授权见 `ASSET-CREDITS.md`。

本地运行：

```sh
npm ci
npm run build
cp .env.example .env
npm run dev
```

在本地 `.env` 中填写搜索和模型配置。密钥与 `.env` 不应提交到 GitHub。

EdgeOne Makers 导入本仓库时，构建命令填写：

```sh
npm ci && npm run build && npm run build:edgeone
```

输出目录填写 `dist-eo`。该目录同时包含静态资源和 `cloud-functions` 后端，不能只发布 `public` 目录。

生产环境设置 `YUANBAO_SEARCH_API_KEY`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`；截图识别还需 `LLM_VISION_MODEL`。搜索密钥在云函数内部兼容映射到现有提供方接口。本地原有 `TENCENTCLOUD_WSA_APIKEY` 配置继续兼容。环境变量变更后需要重新部署。

当前人物动作优化仍在迭代，请在公开演示前回看完整交互；历史验收文档对应各自版本，不代表后续改动已通过相同检查。
