# Assistant

Private on-device Android voice assistant. Speech, reasoning, notes, calendar, and reminders stay on the phone. WhatsApp, Signal, and X open a draft after you confirm — tap Send or say "send".

## Why this stack

- **Expo + React Native (dev client)** — JavaScript UI with real native modules. Expo Go cannot load llama.cpp / whisper.cpp.
- **llama.rn** — llama.cpp on the phone. A 1.5B GGUF is the "brain".
- **whisper.rn** — on-device speech-to-text, including the custom wake word.
- **expo-sqlite / expo-calendar / expo-notifications** — notes, events, reminder alarms.
- **Android AccessibilityService** — taps Send in the official apps after you confirm, because those apps have no personal send API.

## Run on a phone

You need Node 20+, Android Studio SDK, and a device or emulator (arm64 is best for llama.rn).

```bash
npm install
npx expo prebuild --platform android
npx expo run:android
```

The first time, open **Settings** and download Whisper tiny.en plus Qwen2.5 1.5B — or import GGUF files you already have. Typed commands on the home screen work even before a model is downloaded.

Always-on listening shows a persistent notification (Android 14 will mute the mic without it). Optional auto-tap Send lives in Android Accessibility settings.

## Download

Sideload the Android APK from the landing page: [gabo-tech.github.io/pesonalassistant](https://gabo-tech.github.io/pesonalassistant). Speech and the language model stay on the phone.

Release APK from a local tree:

```bash
npm run apk
```

## Voice loop

`wake word → listen → transcribe → JSON tool call → confirm gate → (tap or spoken send) → share intent + optional Accessibility tap`

Confirmation is phrase-matched, not decided by the model. The LLM cannot send.
