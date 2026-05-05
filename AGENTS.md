# Repository Guidelines

**【最高优先级指令】**
`AGENTS.md` 只定义元规则与信息入口，不承载具体项目知识、参数细节或长篇规范。所有可变的项目内容统一从 `.agent/`、源码、`requirements.txt`、`README.md`、`README_en.md` 与 `static/` 获取，确保本文件始终精简、可稳定注入上下文。

---

## 阶段一：握手与加载 (Pre-task)

在处理任何开发、排障、重构或分析任务前，优先按以下顺序获取上下文：

1. `cat .agent/TODO.md`
   了解当前进度、待办项、已知问题和最近同步状态。
2. `cat .agent/DEVELOPMENT.md`
   加载编码规范、验证方式、命名约定、Docker/本地执行约束和记忆同步规则。
3. 按需读取 `.agent/KNOWLEDGE.md`
   当任务涉及 Groot2 协议、ZeroMQ 桥接、网页结构、API、示例模式或 Docker 网络边界时使用。
4. 按需读取 `.agent/TROUBLESHOOTING.md`
   当任务涉及页面打不开、端口不通、`pyzmq`、Docker 内外 `127.0.0.1`、真实行为树连接失败或浏览器轮询异常时使用。
5. 以项目事实校验文档
   后端实现看 `server.py`，前端实现看 `static/`，依赖看 `requirements.txt`，公开说明看 `README.md` 与 `README_en.md`。

## 阶段二：执行约束 (Execution)

- 不要把具体项目知识回填到 `AGENTS.md`；稳定知识写入 `.agent/KNOWLEDGE.md`，开发流程写入 `.agent/DEVELOPMENT.md`，排错经验写入 `.agent/TROUBLESHOOTING.md`。
- 不凭记忆猜测端口、命令、API、文件路径或 UI 行为，必须回到源码、依赖文件和 README 核实。
- 当 `.agent/` 文档与实现不一致时，以当前源码和公开 README 为准，再决定是否同步 `.agent/`。
- 读取遵循“最小充分”原则：先加载必要入口，再按任务扩展，避免无关上下文污染。
- 涉及 Docker、本地服务、端口映射或容器内行为树时，必须明确区分宿主机浏览器、Python 桥接服务、BehaviorTree.CPP 进程分别位于哪个网络命名空间。

## 阶段三：收尾与状态同步 (Post-task)

完成任务后，检查是否需要同步 `.agent/`：

1. 每次修改 `groot2_web` 内任意文件，必须追加 `.agent/MEMORY.md`。
2. 进度、待办或当前状态变化，更新 `.agent/TODO.md`。
3. 形成新的稳定架构知识，更新 `.agent/KNOWLEDGE.md`。
4. 沉淀新的报错特征或解决办法，更新 `.agent/TROUBLESHOOTING.md`。
5. 修改开发流程、验证命令或发布约束，更新 `.agent/DEVELOPMENT.md`。

除以上入口与路由说明外，不要继续扩写本文件。
