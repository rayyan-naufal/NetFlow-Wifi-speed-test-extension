# Netflow Extension

A lightweight Chrome extension (Manifest V3) for testing internet speed—ping, jitter, download, and upload—directly from the browser toolbar using Cloudflare's edge network (`speed.cloudflare.com`).

## Features

- **Latency & Jitter**: Measures median RTT and jitter while subtracting Cloudflare's server-side processing time.
- **Download & Upload**: Multi-stream throughput test (4 download streams, 3 upload streams) with a 2-second TCP warmup excluded from the final average.
- **Connection Info**: Displays detected ISP, public IP address, and the connected Cloudflare edge server location.
- **Themes & Settings**: Supports dark/light themes and optional auto-start when opening the popup, saved via `chrome.storage.local`.
- **Zero Dependencies**: Built with plain HTML, CSS, and vanilla JavaScript.

## Installation (Load Unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome (or any Chromium-based browser).
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the project folder.

## Project Structure

```text
.
├── manifest.json
├── popup.html
├── css/
│   └── style.css
├── js/
│   ├── gauge.js
│   ├── popup.js
│   └── speedtest-engine.js
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── tools/
    └── make-icons.ps1
```

## Permissions

- `storage`: Saves theme preference and auto-start setting locally.
- `https://speed.cloudflare.com/*`: Runs ping, download, and upload requests against Cloudflare's speed test endpoints.
