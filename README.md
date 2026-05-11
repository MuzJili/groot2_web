# Groot2 Web

本项目是一个本地网页版 Groot2 查看器，用来连接 BehaviorTree.CPP 的
`BT::Groot2Publisher`，获取行为树 XML，并在浏览器里显示节点运行状态。

英文版文档见：[README_en.md](README_en.md)。

BehaviorTree.CPP 的 Groot2 通信使用 ZeroMQ 协议，浏览器不能直接连接。
所以本项目提供一个很小的 Python 本地服务作为桥接层：

```text
浏览器
  -> HTTP
groot2_web/server.py
  -> ZeroMQ Groot2 协议
BT::Groot2Publisher
  -> 正在运行的行为树
```

网页可以显示：

- 行为树结构
- 节点状态：`IDLE`、`RUNNING`、`SUCCESS`、`FAILURE`、`SKIPPED`
- 节点详情
- 黑板值
- 状态变化记录
- 原始 XML
- 节点搜索、聚焦和子树折叠

当前只做查看，不做控制。也就是说，它可以读取黑板，但不会修改黑板、不会插入断点、不会控制行为树执行。

## 目录结构

```text
groot2_web/
  README.md
  README_en.md
  requirements.txt
  server.py
  static/
    index.html
    styles.css
    app.js
```

## 前置条件

### 1. 行为树端

你的 C++ 程序需要创建 `BT::Groot2Publisher`：

```cpp
auto publisher = std::make_shared<BT::Groot2Publisher>(tree, 1667);
```

这里的 `1667` 就是网页要连接的端口。

注意：`Groot2Publisher` 通常只有在行为树已经创建并开始运行后才会监听端口。
如果 behavior server 只启动了，但还没有执行具体 tree，网页可能连不上。

### 2. Python 端

需要 Python 3、`pyzmq` 和 `msgpack`。

安装依赖：

```bash
python3 -m pip install -r groot2_web/requirements.txt
```

如果你在 Ubuntu 上，也可以使用：

```bash
sudo apt-get update
sudo apt-get install -y python3-zmq python3-msgpack
```

## 本地启动

在仓库根目录执行：

```bash
cd /path/to/your/project
python3 -B groot2_web/server.py --bind 127.0.0.1 --port 8765
```

然后打开浏览器：

```text
http://127.0.0.1:8765
```

如果你换了目录，只要保证命令中的 `groot2_web/server.py` 路径正确即可。

## 如何使用

1. 启动你的 BehaviorTree.CPP 程序。
2. 确认程序已经创建并运行行为树。
3. 启动 `groot2_web/server.py`。
4. 浏览器打开 `http://127.0.0.1:8765`。
5. 输入 Groot2Publisher 所在的 IP 和端口。
6. 点击 `连接`。

如果网页服务和行为树程序在同一台机器上，通常填写：

```text
IP: 127.0.0.1
端口: 1667
```

如果行为树程序运行在另一台机器上，就填写那台机器的 IP 和 Groot2 端口。

连接成功后，网页会自动读取当前 XML 中所有 `BehaviorTree` 对应的黑板，并在右侧
`黑板` 面板中显示。`刷新` 按钮可以手动重新读取一次，轮询间隔也会影响黑板自动刷新频率。

注意：Groot2 只能导出 BehaviorTree.CPP 已经能转换为 JSON 的黑板值。基础类型通常可以直接显示；
自定义类型或 ROS message 需要在行为树进程中注册 `BT::JsonExporter` 转换器，否则这些值可能不会出现在黑板面板里。

## 设置

点击顶部的 `设置` 按钮，可以调整网页运行参数：

- `运行事件长度`：右侧运行事件最多保留多少条。
- `请求超时`：每次向 Groot2Publisher 请求数据的超时时间，单位是毫秒。
- `自动刷新黑板`：开启后黑板会跟随状态轮询自动刷新；关闭后只在手动点击 `刷新` 时读取黑板。

设置会保存在当前浏览器里，刷新页面后仍然生效。

## 示例模式

点击网页上的 `示例` 按钮，可以不连接真实行为树，直接查看内置 demo tree。

示例模式用于：

- 检查网页能不能正常打开
- 检查树结构绘制是否正常
- 检查状态高亮和事件记录是否正常
- 给新用户一个不用配置 BehaviorTree.CPP 就能体验的入口

示例数据写在 [server.py](server.py) 中：

```python
DEMO_XML = ...
DEMO_STATUSES = ...
DEMO_BLACKBOARDS = ...
```

点击 `关闭示例` 可以停止示例轮询并清空页面。

## 关闭

如果服务运行在终端前台，按：

```text
Ctrl-C
```

如果服务在后台运行，可以按端口查找进程并关闭：

```bash
lsof -ti tcp:8765
kill <PID>
```

网页里的 `断开` 按钮只会停止当前页面轮询并清空视图，不会关闭 Python 服务。

## API

这些接口主要给网页使用，也可以手动调试。

### 健康检查

```text
GET /api/health
```

### 获取行为树 XML

```text
GET /api/fulltree?host=127.0.0.1&port=1667
```

### 获取节点状态

```text
GET /api/status?host=127.0.0.1&port=1667
```

### 获取黑板值

```text
GET /api/blackboard?host=127.0.0.1&port=1667&blackboards=MainTree;SubTreeName
```

`blackboards` 是要读取的黑板名列表，多个名字用分号分隔。网页会从行为树 XML 中自动推导这些名字。

### 示例接口

```text
GET /api/fulltree?demo=1
GET /api/status?demo=1
GET /api/blackboard?demo=1
```

## 常见问题

### 页面能打开，但连接真实端口失败

先确认行为树真的已经开始运行。`Groot2Publisher` 需要在 tree 创建后才会监听端口。

也可以用下面的方式检查端口是否可达：

```bash
nc -vz 127.0.0.1 1667
```

### 提示缺少 `zmq` 或 `msgpack`

如果看到：

```text
ModuleNotFoundError: No module named 'zmq'
```

或：

```text
ModuleNotFoundError: No module named 'msgpack'
```

说明缺少 Python 依赖。安装：

```bash
python3 -m pip install -r groot2_web/requirements.txt
```

### 黑板面板为空

先确认行为树已经运行，并且网页连接到了正确的 Groot2 端口。

如果树和节点状态都正常，但黑板为空，通常说明当前黑板值没有可用的 JSON 导出方式。
BehaviorTree.CPP 的 Groot2 黑板接口依赖 `BT::JsonExporter`，复杂类型需要在 C++ 进程中注册转换器。

### 8765 端口被占用

换一个端口启动：

```bash
python3 -B groot2_web/server.py --bind 127.0.0.1 --port 8766
```

然后浏览器打开：

```text
http://127.0.0.1:8766
```

## 安全说明

这是本地调试工具，没有登录、鉴权和 HTTPS。

建议默认使用：

```bash
--bind 127.0.0.1
```

不要把它直接暴露到公网。
