# 本地工具箱

基于 Go、Wails 3 和 TypeScript 的 Windows 本地文件工具。当前提供 **PDF 转图片**、**PDF 合并/拆分/压缩**、**证件照制作**、**图片去水印**和**网址二维码**；各工具有独立的界面、处理逻辑和本机文件服务，便于继续扩展。

## PDF 转图片

- 选择 PDF，预览首页。
- 图片宽度可选 900、1400、2000 像素；默认 1400 像素。
- 多页 PDF 默认纵向合成一张长图，也可按页导出多张。
- JPG（默认，质量 82%）或 PNG；导出后可打开输出文件夹。
- PDF.js、字体资源和页面映射表均随应用打包，转换不需要网络或外部 PDF 命令。

为了防止意外生成超大图片，单张图片最多 2000 万像素，最长边不超过 16000 像素；合成长图时会自动降低宽度。若页面太多，无法在可读宽度下合成，会提示改用按页导出。输入 PDF 上限为 100 MB、500 页。

## PDF 合并/拆分/压缩

- 合并：选择多个 PDF，调整顺序并保存为一个新文件。
- 拆分：选择一个 PDF，指定每份页数；输出放在新建的子文件夹中。
- 压缩：优化 PDF 的结构与重复资源，保存为新文件并显示实际节省的体积。已优化的 PDF 可能不会变小。
- 全程在本机处理，源文件不会被修改。PDF 操作使用 pdfcpu，无需安装外部命令。

## 证件照制作

- 导入 20 MB 以内的 JPG、PNG 或 WebP 正面人像；在本机识别人像并替换背景。
- 选择 1 寸（25 × 35 mm，295 × 413 px）或 2 寸（35 × 49 mm，413 × 579 px）。
- 选择蓝底或红底，拖动预览调整位置，通过滑块缩放，保存为带 300 DPI 标记的 JPG。
- 人像模型和运行所需的 WASM 文件随应用打包，处理照片不需要网络。复杂头发、透明物件或与人像颜色接近的背景可能影响抠图边缘，请保存前检查预览。

不同证件和受理机构可能要求其他尺寸、像素、底色或头部占比；提交前请按具体要求核对。

## 图片去水印

- 导入 20 MB 以内的 JPG、PNG 或 WebP 图片，最多 1600 万像素。
- 调整画笔，在水印上涂选；可撤销或清空涂选，并按住按钮查看原图。
- 点击“修复选区”后，可继续处理其他区域，最后保存为 PNG 或 JPG。
- 修复在本机的后台线程完成，不需要账号、密钥或外部服务。它适合小块水印；复杂纹理、大面积遮挡可能留下痕迹。

## 网址二维码

- 输入 HTTP 或 HTTPS 网址；省略协议时自动补全 HTTPS。
- 选择 512、1024 或 2048 像素，生成带标准留白的二维码并保存为 PNG。
- 二维码在本机生成，不会请求输入的网址；分享前建议用手机扫码核对。

## 运行与构建（Windows PowerShell）

要求：Go 1.26+、Node.js/npm、WebView2 Runtime。首次安装 Wails 3 CLI：

```powershell
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0
$env:Path = "$(go env GOPATH)\bin;$env:Path"
```

在项目根目录执行：

```powershell
cd frontend
npm ci
cd ..
wails3 dev
```

生成 Windows 可执行文件：

```powershell
wails3 build
```

默认输出位于 `bin/pdf-desktop.exe`。如果正在运行这个文件，可用 `wails3 build APP_NAME=paperdesk` 生成 `bin/paperdesk.exe`。CLI 若不在 `PATH` 中，请按上面的命令把 Go 的 `bin` 目录加入当前 PowerShell 会话。

## 测试

```powershell
go test ./...
cd frontend
npm test
npm run build
```

`testdata/sample-2pages.pdf` 是一个仅用于验证的两页样例。

## 扩展新工具

- 在 `frontend/src/tools/` 下建立新工具目录，放入界面与处理逻辑。
- 在 `frontend/src/tools.ts` 注册入口，并在 `frontend/src/main.ts` 接入该工具的界面。
- 如果需要本机文件系统或系统对话框，在 `internal/tools/` 增加纯 Go 逻辑，在根目录增加 Wails 服务，并于 `main.go` 注册。
- 保持浏览器处理模块与 Go 文件服务之间的接口明确；不要让一个工具直接修改另一工具的会话状态。

PDF 工具由 `frontend/src/tools/pdf-image/`（渲染、尺寸规划、界面）和 `internal/tools/pdfexport/`、`pdf_service.go`（校验与保存）组成。证件照工具由 `frontend/src/tools/id-photo/`（人像识别、构图、界面）和 `internal/tools/photoexport/`、`photo_service.go`（尺寸校验、DPI 标记与保存）组成。两者共用 `internal/imagefile/` 的原子写入逻辑。PDF 每次导出使用独立任务标识，按页文件不会覆盖已有同名文件。

## 第三方组件

- Wails 3：MIT，许可证见 `licenses/wails.LICENSE`。
- PDF.js：Apache-2.0，许可证见 `licenses/pdfjs-dist.LICENSE`。
- pdfcpu：Apache-2.0，用于 PDF 合并、拆分和优化，许可证见 `licenses/pdfcpu.LICENSE`。
- node-qrcode：MIT，用于本机生成二维码，许可证见 `licenses/node-qrcode.LICENSE`。
- MediaPipe Tasks Vision 及随应用分发的人像分割模型：Apache-2.0，许可证见 `licenses/mediapipe.LICENSE`。
