# Kano PDF Tool

<p align="center">English | <a href="docs/readme/zh-TW.md">繁體中文</a></p>

<p align="center">
  <a href="https://kano-pdf-tool.yuufeng.com">Website</a>
</p>

A powerful cross-platform PDF editing and reading tool.

| Light Theme | Dark Theme |
|:-----------:|:----------:|
| ![Light Theme](https://github-static-object.yuufeng.com/PDF-Tool/en/app-cover-light.jpg) | ![Dark Theme](https://github-static-object.yuufeng.com/PDF-Tool/en/app-cover-dark.jpg) |

## Features

| PDF Editing | PDF Reading | Image Processing |
|:-----------:|:-----------:|:----------------:|
| Delete / Add Pages | High-Quality Rendering | Multi-Format Support |
| Export Single Page as PDF / Image | Text Selection & Search | Image Compression |
| PDF Compression | Dark Mode | Image Viewer |
| Annotations (Highlight, Shapes, Text, Signature) | | |

## Support This Project

If you find this project helpful, consider supporting it ☕

### Buy Me a Coffee

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me A Coffee" width="150">](https://www.buymeacoffee.com/yuuf.25)

Or scan the QR Code:

<img src="docs/website/asset/image/buymeacoffee-qr-code.png" alt="Buy me a coffee QR Code" width="200" />

## Installation

### Download

| Platform | Version | Link |
|----------|---------|------|
| macOS | Universal Binary<br/>(Intel & Apple Silicon) | [Download](https://github.com/IDK-Silver/PDF_Tool/releases/download/v3.14.0/Kano.PDF.Tool_3.14.0_universal.dmg) |
| Windows | x64 | [Download](https://github.com/IDK-Silver/PDF_Tool/releases/download/v3.14.0/Kano.PDF.Tool_3.14.0_x64-setup.exe) |
| Linux | x64 (AppImage) | [Download](https://github.com/IDK-Silver/PDF_Tool/releases/download/v3.14.0/Kano.PDF.Tool_3.14.0_amd64.AppImage) |


> **Linux Note**: WebGPU is unsupported on Linux as of June 4 2026. Please use version prior to v3.14.0 as a temporary workaround. [See](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)

> **macOS Note**: The Universal Binary includes both Intel (x86_64) and Apple Silicon (ARM64) architectures. The app is signed and notarized by Apple.

> **Auto Update**: The app includes built-in auto-update functionality.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=IDK-Silver/PDF_Tool&type=Date)](https://star-history.com/#IDK-Silver/PDF_Tool&Date)

## Contributing

Issues and Pull Requests are welcome!

## Development

### Requirements
- Node.js 18+
- Rust 1.70+
- Platform-specific Tauri dependencies

### Setup

1. Clone the repository
    ```bash
    git clone https://github.com/IDK-Silver/PDF_Tool.git
    cd PDF_Tool
    ```

2. Install dependencies
    ```bash
    npm install
    ```

3. Fetch PDFium library
    ```bash
    npm run pdfium:fetch
    ```

4. Start development server
    ```bash
    npm run tauri dev
    ```

5. Build the application
    ```bash
    npm run tauri build
    ```

## License

This project is licensed under the MIT License.
