# mewsick
### Break free from music subscriptions — sync what you already own and download only what you’re missing.

An open-source **React Native (Expo)** Android utility that helps you leave music subscription lock-in behind.  
`mewsick` authenticates with **YouTube Music**, scans local audio files on your Android device, diffs your local library against an online playlist, and downloads missing tracks directly.

## 🚀 Features

- 🎵 **Local library scanning** on Android storage to index existing audio files.
- 🔍 **Smart diffing** between your local library and a selected online playlist.
- ⬇️ **Background downloads** for only the tracks you don’t already have.
- 🎧 **Native pass-through audio downloads** (`.m4a`, `.webm`, etc.) to preserve source quality and reduce storage overhead.
- 🛡️ **No third-party scraping-site dependency** (e.g., no Y2Mate-style flow); uses a native backend/extraction engine.
- 🌌 **Dark, glassmorphic UI** focused on clarity and modern Android aesthetics.

## 🛠 Tech Stack

- **React Native** (mobile app foundation)
- **Expo** + **Expo Router** (navigation and app runtime)
- **NativeWind / Tailwind CSS** (styling system)
- **Expo FileSystem** (local file discovery and storage operations)
- **YouTube Data API** (playlist and metadata integration)

## 🧠 How It Works

### 1) Diff Engine
The app builds a local index of audio files (name/artist heuristics + metadata where available), then compares that index against tracks in a target online playlist.  
Only items not found in the local index are marked as **missing**, preventing duplicate downloads and saving bandwidth.

### 2) Native Pass-through
Instead of forcing 320kbps MP3 transcoding, `mewsick` fetches native stream/container formats directly (such as `.m4a` or `.webm`) when available.  
This pass-through approach:

- Preserves source fidelity
- Avoids unnecessary transcoding artifacts
- Reduces processing time
- Often uses less storage than forced re-encoding workflows

## 📦 Installation & Local Development

```bash
# 1) Install dependencies
npm install

# 2) Start Expo development server
npx expo start

# 3) Run on Android
npx expo run:android
```

If you prefer Expo Go for quick UI iteration:

```bash
npx expo start --tunnel
```

## 🗺 Roadmap / Phased Development

- **Phase 1: UI Shell**
  - Dark glassmorphic design system
  - Core screens, routing, and UX skeleton

- **Phase 2: Auth & YouTube API**
  - User authentication flow
  - Playlist retrieval and track metadata ingestion

- **Phase 3: Local File Diffing**
  - Android storage scan
  - Local-vs-online library comparison engine

- **Phase 4: Download Engine**
  - Native pass-through downloads
  - Background queueing, progress tracking, and retry logic

## ⚠️ Disclaimer

`mewsick` is intended for lawful, personal use only.

- Download only content you own, have rights to, or are permitted to store offline.
- Respect copyright laws and local regulations in your region.
- Use the YouTube API and related services in compliance with their Terms of Service and policies.
