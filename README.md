# VoiceFlow 🎙️⌨️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

A high-performance, minimalist voice-to-text desktop application built with **Tauri**, **Rust**, and **React**. VoiceFlow captures your voice and automatically types it into any application you're currently using—with professional accuracy.

## ✨ Features

- **Hold-to-Talk Model**: Press and hold your hotkey to dictate, release to type.
- **Auto-Type**: Seamlessly inserts text at your cursor position in *any* window.
- **Minimalist Widget**: A sleek, non-obstructive pill at the bottom of your screen with waveform animations.
- **Deepgram AI**: Powered by Deepgram Nova-2 for ultra-fast, contextual transcription.
- **History Management**: Keep track of your past dictations and re-type them anytime.
- **Customizable**: Choose your own hotkey and appearance (Light, Dark, or System mode).
- **Privacy-First (BYOK)**: Bring Your Own Key. Your audio and data stay between you and Deepgram.

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (Package manager)
- [Rust](https://www.rust-lang.org/) (Tauri backend)
- [Deepgram API Key](https://console.deepgram.com/) (Get a free key with credit)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/voice-flow.git
   cd voice-flow
   ```
2. Install dependencies:
   ```bash
   bun install
   ```
3. Run the application in development mode:
   ```bash
   bun run tauri dev
   ```

## 🛠️ Usage
1. **Initial Setup**: On first launch, the app will guide you to set your **Global Hotkey** (e.g., `Ctrl+Shift+Space`).
2. **Configuration**: Click the **Gear (⚙️)** icon in the main window to add your Deepgram API Key.
3. **Dictate**: 
   - Ensure the widget is visible.
   - **Hold** your hotkey.
   - **Speak** clearly.
   - **Release** the key.
   - Watch the text appear instantly at your cursor!

## 🏗️ Technical Architecture
- **Frontend**: React 19, TypeScript, TailwindCSS (Vite).
- **Backend**: Rust (Tauri 2.0).
- **Automation**: [Enigo](https://github.com/enigo-rs/enigo) for cross-platform keyboard simulation.
- **AI**: Deepgram REST API for file-based transcription.

## 🤝 Contributing
Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**. Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License
Distributed under the **MIT License**. See `LICENSE` for more information.

---
*Created with ❤️ for faster workflows.*
