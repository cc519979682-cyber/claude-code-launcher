# Claude Code Launcher

面向中文用户的 Windows 版 Claude Code 图形启动器。选择服务商与模型、项目文件夹和历史会话后，即可在内嵌终端启动 Claude Code；API Key 从系统环境变量读取。

## 功能

- 图形化选择 Mimo、DeepSeek 或自定义 Anthropic 兼容服务商
- 按项目文件夹启动 Claude Code
- 支持新建对话、继续上次对话、选择历史会话
- 内嵌终端，不需要手动打开命令行输入 `claude`
- API Key 通过系统环境变量读取，不写入项目配置文件
- 按 100 列终端宽度动态计算窗口最小宽度

## 环境要求

- Windows
- Node.js 18 或更高版本
- 已安装 Claude Code
- 已安装 Git Bash，默认路径为 `D:\Git\bin\bash.exe`

默认 Claude Code 路径：

```text
D:\ClaudeCode\claude.cmd
```

## 安装

```powershell
npm install
npm start
```

## API Key 设置

启动器默认读取这些系统环境变量：

```text
MIMO_API_KEY
DEEPSEEK_API_KEY
```

示例：

```powershell
setx MIMO_API_KEY "你的 Mimo API Key"
setx DEEPSEEK_API_KEY "你的 DeepSeek API Key"
```

设置后需要重新打开启动器。

## 配置文件

服务商配置：

```text
config/providers.json
```

个人偏好配置：

```text
config/settings.json
```

`settings.json` 会保存你的本机项目路径，已经被 `.gitignore` 忽略，不建议上传。

示例配置：

```text
config/settings.example.json
```

## 自定义服务商

在启动器里打开“服务商管理”，填写：

- 服务商名称
- Anthropic 兼容接口地址
- 认证方式：`ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN`
- API Key 对应的系统环境变量名
- 模型列表
- 默认模型

真实 API Key 建议只放在系统环境变量里。

## 开发命令

```powershell
npm start
npm run smoke
npm audit --omit=dev
```

## License

MIT
