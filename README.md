# Discord AI Community — Open Source Community Management Bot

> An all-in-one open-source Discord engine integrating conversational LLM intelligence, automated ticket workflows, honeypot security, dynamic voice channels, and multimedia streaming.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2.svg)](https://discord.js.org/)

---

## 📌 Overview

**Discord AI Community** provides server administrators and developer communities with a modern, self-hosted management bot. By pairing Discord's v14 API with LLM support (Anthropic Claude, Google Gemini, and Groq), it automates technical support tickets, handles active spam defense, dynamically organizes voice channels, and delivers high-fidelity audio playback.

---

## ✨ Core Features

| Feature | Description |
| :--- | :--- |
| **🧠 Multi-Model AI Engine** | Multi-provider fallback (Claude / Gemini / Groq pool) with conversation memory, rate limiting, and prompt guardrails. |
| **🎫 Intelligent Ticket System** | Interactive modal tickets, thread separation, AI first-line resolution, staff escalation buttons, and clean HTML transcripts. |
| **🛡️ Honeypot & Moderation** | Anti-bot honeypot channels, automated quarantine (`/aislar`), administrative bans, and bulk message cleanup (`/limpiar`). |
| **🔊 Dynamic Voice Rooms** | Join-to-create temporary voice channels with an interactive in-channel control panel (lock, unlock, rename, kick, limits). |
| **🎵 Audio & Media Player** | Stream music from YouTube and Spotify with full queue management, interactive controls, and volume balancing. |

---

## 🛠️ Tech Stack & Integrations

- **Engine:** Node.js (ES Modules)
- **Framework:** [discord.js v14](https://discord.js.org/)
- **Voice System:** `@discordjs/voice`, `play-dl`, `@distube/ytdl-core`, `ffmpeg-static`
- **AI Providers:**
  - **Anthropic Claude API** (Claude Sonnet 5.5 for high-precision support)
  - **Google Gemini API** (`@google/genai`)
  - **Groq Cloud SDK** (`groq-sdk` with multi-key load balancing and automatic failover)

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js 20.x or higher
- A Discord Bot Application created via the [Discord Developer Portal](https://discord.com/developers/applications)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/discord-ai-community.git
cd discord-ai-community

# Install dependencies
npm install
```

### 3. Environment Setup
Create your local environment file:
```bash
cp .env.example .env
```
Open `.env` and fill in your Discord credentials and API keys:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 4. Running the Bot
```bash
# Production start
npm start
```

---

## 📂 Project Architecture

```plaintext
├── assets/                  # Badges, banners, and default graphics
├── src/
│   ├── index.js             # Client initialization and gateway listeners
│   ├── config.js            # Centralized environment validator
│   ├── commands/            # Slash command definitions
│   │   ├── aislar.js        # Quarantine / isolate user
│   │   ├── banear.js        # Ban command with audit logging
│   │   ├── panel-tickets.js # Deploy ticket creation panel
│   │   ├── play.js          # Audio streaming command
│   │   └── ...              # Moderation and utility commands
│   ├── handlers/            # Core business modules
│   │   ├── ai.js            # LLM query runner and multi-provider failover
│   │   ├── honeypot.js      # Automatic trap listener
│   │   ├── music.js         # Audio player & queue controller
│   │   ├── tickets.js       # Modal and thread lifecycle management
│   │   └── voice.js         # Dynamic channel creation and controller UI
│   ├── utils/               # Transcript generator, embeds, memory manager
│   └── data/
│       └── server_faq.json  # Configurable community FAQ dataset
├── .env.example             # Clean environment configuration template
├── LICENSE                  # Open source license (MIT)
└── package.json
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
