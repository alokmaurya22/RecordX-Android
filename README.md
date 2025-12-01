# RecordX

A React Native video recording application for Android with advanced circular buffer recording capabilities.

## Description

RecordX is a mobile video recording application that implements a circular buffer system, allowing users to capture pre-event footage along with post-event recording. The app continuously buffers video in the background and saves both pre-buffer and post-buffer segments when triggered, creating a seamless merged video output.

## Features

- Standard video recording with camera preview
- Circular buffer mode with configurable pre-buffer and post-buffer durations
- Automatic video segment merging using native MediaMuxer
- Gallery integration for saved videos
- Real-time recording timer
- Telemetry logging for performance monitoring
- Dark mode UI with modern design

## Technology Stack

### Language
- TypeScript
- JavaScript

### Framework
- React Native 0.82.1
- React 19.1.1

### Core Libraries

**Camera and Media:**
- react-native-vision-camera (^4.7.3) - Camera functionality
- react-native-video (^6.18.0) - Video playback
- @react-native-camera-roll/camera-roll (^7.10.2) - Gallery integration

**File System:**
- react-native-fs (^2.20.0) - File system operations

**UI Components:**
- react-native-safe-area-context (^5.6.2) - Safe area handling
- @react-native-picker/picker (^2.11.4) - Dropdown picker component

**Development Tools:**
- TypeScript (^5.8.3)
- ESLint (^8.19.0)
- Prettier (2.8.8)
- Jest (^29.6.3)
- Babel (^7.25.2)

## Prerequisites

- Node.js >= 20
- Android Studio
- Android SDK
- JDK 11 or higher
- React Native CLI
- Physical Android device or emulator

## Installation

1. Clone the repository:
```bash
git clone https://github.com/alokmaurya22/RecordX-Android.git
cd RecordX-Android
```

2. Install dependencies:
```bash
npm install
```

3. Install Android dependencies:
```bash
cd android
./gradlew clean
cd ..
```

## Running the Application

### Start Metro Bundler

```bash
npx react-native start
```

### Run on Android

In a new terminal window:

```bash
npx react-native run-android
```

Or use npm scripts:

```bash
npm run android
```

## Permissions

The app requires the following permissions:
- Camera access
- Microphone access
- External storage read/write (for saving videos)

Permissions are requested automatically on first launch.

## Project Structure

```
RecordX-Android/
├── android/              # Native Android code
├── ios/                  # Native iOS code (future scope)
├── components/           # React components
├── utils/                # Utility functions and helpers
├── types/                # TypeScript type definitions
├── assets/               # Images and static assets
├── App.tsx               # Main application component
└── index.js              # Application entry point
```

## Build Configuration

### Debug Build

```bash
npx react-native run-android
```

### Release Build

```bash
cd android
./gradlew assembleRelease
```

The APK will be generated at:
`android/app/build/outputs/apk/release/app-release.apk`

## Usage

1. Launch the app
2. Grant camera and microphone permissions
3. Choose between standard recording or circular buffer mode
4. In circular buffer mode, configure pre-buffer and post-buffer durations
5. Press the capture button to record
6. Videos are automatically saved to the device gallery

## Development

### Linting

```bash
npm run lint
```

### Testing

```bash
npm test
```

## Troubleshooting

### Metro Bundler Issues

```bash
npx react-native start --reset-cache
```

### Build Errors

```bash
cd android
./gradlew clean
cd ..
npx react-native run-android
```

### Permission Errors

Ensure all required permissions are granted in device settings.

## License

Private

## Author

Alok Maurya

## Repository

https://github.com/alokmaurya22/RecordX-Android
