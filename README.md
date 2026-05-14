# Construct Viewer - WebGPU

Construct Viewer is a locally installable WebGPU digital-rain experience. It renders falling glyph streams on a full-screen canvas, adds procedural audio, and includes a seasonal Christmas rainfall mode because sometimes the construct needs sleigh bells.

Live view: https://project-guh9u.vercel.app/

## Features

- WebGPU-powered falling glyph renderer
- Horizontally mirrored glyphs on a small random percentage of packets
- Procedural digital-rain audio with modem-like texture
- Throbbing bass layer
- Sound mute button and volume slider up to 400%
- Christmas rainfall toggle with holiday glyphs, colors, and jingle-bell audio
- Progressive Web App manifest and service worker for local installation
- Dependency-free local Node server

## Requirements

- A browser with WebGPU support, such as current Chrome or Edge
- Node.js for the convenience local server

WebGPU and service workers work best from `localhost` or HTTPS. Opening `cv.html` directly from the filesystem may not enable every feature.

## Run Locally

On Windows:

```powershell
.\run-local.bat
```

On Git Bash, WSL, macOS, or Linux:

```sh
./run-local.sh
```

The default URL is:

```text
http://127.0.0.1:8181/
```

You can choose a different port:

```powershell
.\run-local.bat 8080
```

```sh
./run-local.sh 8080
```

You can also call the server directly:

```sh
node serve-local.js 8181
```

## Install As A Local Web App

1. Start the local server.
2. Open `http://127.0.0.1:8181/` in Chrome or Edge.
3. Use the browser install button in the address bar or app menu.

If updates do not appear immediately, reload once or twice. The service worker keeps the app available offline and may briefly serve cached files.

## Controls

- Speaker button: toggles sound on or off.
- Volume slider: adjusts sound level from 0% to 400%.
- Tree button: toggles Christmas rainfall mode.

Browsers require a user gesture before audio can start, so click, tap, press a key, or interact with a sound control to unlock audio.

## Project Structure

```text
cv.html           Main page
css/cv.css        Page and control styling
js/cv.js          WebGPU renderer, animation logic, and procedural audio
manifest.json     PWA metadata
sw.js             Service worker cache
serve-local.js    Dependency-free local HTTP server
run-local.bat     Windows launch script
run-local.sh      Shell launch script
img/              Icons and favicon
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
