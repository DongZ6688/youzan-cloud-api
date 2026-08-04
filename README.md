# 有赞云开放接口 Skill

这是一个面向 Codex 的有赞云开放接口技能包，用于安全地查询接口、调用接口、处理分页与重试，并在应用能力允许时自动刷新 Access Token。

仓库内不包含真实 Token、Client Secret、店铺信息或历史业务数据。所有凭据都从环境变量或仓库外部的私有配置文件读取，日志和错误信息会主动隐藏敏感值。

## 主要能力

- 打包有赞云公开服务端文档中的完整接口目录：当前共 656 个接口、56 个业务领域。
- 支持按中文关键词、接口名或业务领域搜索接口。
- 通过统一命令调用任意有赞云接口，并显式指定 API 名称、版本和参数。
- 支持分页、限流、超时和临时错误重试的通用处理建议。
- 识别 Token 失效响应；应用支持刷新时，只自动刷新一次并重试原请求。
- 提供订单、商品、促销、分销员、佣金和数据同步等历史实践总结。
- 内置密钥扫描、自测和敏感信息脱敏，降低误传 Token 的风险。

> 接口目录表示公开文档中可发现的接口，不代表当前应用已经获得全部权限。正式调用前仍需在有赞控制台确认接口版本、权限包、店铺类型、计费和请求参数。

## Token 安全原则

1. 不要把 Access Token、Refresh Token、Client Secret 粘贴到对话、代码、日志或 GitHub。
2. 短期使用时，优先通过环境变量提供凭据。
3. 定时任务需要持久化 Token 时，把配置文件放在仓库外部，并将文件权限设置为 `0600`。
4. 本仓库只提供 `assets/credentials.example.json` 占位模板，真实配置已被 `.gitignore` 排除。
5. 上传或提交前运行密钥扫描；发现疑似凭据时立即停止。

## 快速开始

### 1. 在仓库外部配置凭据

临时使用可以设置环境变量：

```bash
export YOUZAN_ACCESS_TOKEN='<本地值>'
export YOUZAN_REFRESH_TOKEN='<本地值>'
export YOUZAN_CLIENT_ID='<本地值>'
export YOUZAN_CLIENT_SECRET='<本地值>'
```

定时任务建议使用外部 Token 文件：

```bash
mkdir -p ~/.config/youzan-cloud-api
cp assets/credentials.example.json ~/.config/youzan-cloud-api/credentials.json
chmod 600 ~/.config/youzan-cloud-api/credentials.json
export YOUZAN_TOKEN_STORE="$HOME/.config/youzan-cloud-api/credentials.json"
```

请只在本机填写 `credentials.json`，不要把它复制回仓库。

### 2. 检查配置状态

```bash
node scripts/youzan-api.mjs status
```

该命令只显示各项凭据是否已配置，不会输出真实值。

### 3. 搜索接口

```bash
node scripts/catalog.mjs search '订单'
node scripts/catalog.mjs search '限时折扣'
```

联网时可重新抓取公开文档目录：

```bash
node scripts/catalog.mjs update
```

### 4. 调用接口

```bash
node scripts/youzan-api.mjs call \
  --api youzan.trades.sold.get \
  --version 4.0.4 \
  --params '{"page_no":1,"page_size":20}'
```

参数较多时可以从文件读取：

```bash
node scripts/youzan-api.mjs call \
  --api youzan.trade.get \
  --version 4.0.2 \
  --params @request.json \
  --out response.private.json
```

使用 `--dry-run` 可以只校验地址和参数形状，不发送真实请求。

## 自动刷新 Token 的工作方式

- 普通调用遇到可识别的 Token 失效响应时，客户端会先判断是否具备刷新条件。
- 条件满足时只刷新一次，并使用新 Token 重试原请求，避免无限刷新循环。
- 新 Token 只写回仓库外部的私有 Token 文件；日志不会打印 Token 值。
- 如果应用类型或权限不支持刷新，脚本会明确停止并提示手动轮换，不会尝试未知 OAuth 地址。
- 遇到 `4005` 等应用能力错误或持续参数错误时，应通过有赞控制台或调试工具重新获取 Token。

详细说明见 [`references/authentication.md`](references/authentication.md)。

## 文件说明

- `SKILL.md`：Codex 技能入口、执行流程与安全约束。
- `scripts/youzan-api.mjs`：统一接口调用、重试、脱敏和 Token 刷新。
- `scripts/catalog.mjs`：接口目录更新与搜索。
- `scripts/scan-secrets.mjs`：提交前密钥扫描。
- `scripts/self-test.mjs`：离线自测。
- `references/api-catalog.json`：机器可读的完整接口目录。
- `references/api-catalog.md`：便于人工浏览的接口目录。
- `references/history-lessons.md`：已脱敏的历史实践与踩坑总结。
- `references/workflows.md`：常用业务聚合和同步流程。

## 发布前检查

```bash
node scripts/self-test.mjs
node scripts/scan-secrets.mjs
```

只有自测通过且密钥扫描无发现时，才应提交或上传。

## 开源许可证

本项目采用 [MIT License](LICENSE)。你可以使用、复制、修改、合并、发布和分发本项目，但需要保留原始版权和许可证声明。
