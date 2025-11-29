# Video Recorder App - Project Information

## Project Overview
A React Native Android application that records video with live camera preview using CameraX technology.

---

## Camera Module Used

### Library: `react-native-vision-camera`
- **Backend (Android)**: CameraX (Google's modern camera API)
- **Backend (iOS)**: AVFoundation
- **Version**: Latest (installed via npm)
- **Repository**: https://github.com/mrousavy/react-native-vision-camera

### Why This Library?
- ✅ Most modern and actively maintained camera library for React Native
- ✅ Uses CameraX under the hood (as requested)
- ✅ Better performance than older libraries (react-native-camera)
- ✅ Supports both photo and video recording
- ✅ Frame processing capabilities
- ✅ Active community support

---

## Technical Specifications

### Platform Requirements
- **Minimum SDK**: Android 26 (Android 8.0)
- **Target SDK**: Android 36
- **React Native Version**: Latest
- **Node.js**: Required for development

### Permissions Required
The app requests the following permissions at runtime:
- `CAMERA` - Access device camera
- `RECORD_AUDIO` - Record audio with video
- `WRITE_EXTERNAL_STORAGE` - Save recorded videos
- `READ_EXTERNAL_STORAGE` - Read saved videos

---

## Features

### ✅ Implemented Features
1. **Live Camera Preview** - Real-time camera feed
2. **Video Recording** - Start/stop recording with buttons
3. **Recording Indicator** - Visual feedback during recording
4. **Permission Management** - Automatic permission requests
5. **Error Handling** - User-friendly error messages
6. **Dark Mode Support** - Adapts to system theme

### Camera Settings
- **Default Camera**: Back camera
- **Video Format**: MP4 (default CameraX format)
- **Audio**: Enabled
- **Preview**: Live feed with real-time rendering

---

## Video Storage Location

### On Physical Device
Videos are saved to the app's cache directory:
```
/data/user/0/com.basicapp/cache/mrousavy{random-number}.mp4
```

### On Emulator
Same path as physical device. Access methods:

**Method 1: Android Studio Device File Explorer**
1. Open Android Studio
2. View → Tool Windows → Device File Explorer
3. Navigate to: `/data/data/com.basicapp/cache/`
4. Right-click video file → Save As

**Method 2: ADB Command**
```bash
# List files
adb shell ls /data/data/com.basicapp/cache/

# Download video to computer
adb pull /data/data/com.basicapp/cache/mrousavy12345.mp4 D:\Videos\
```

**Method 3: Check Alert**
- Stop recording to see alert with full file path
- Use ADB to pull the file using that path

---

## How to Run the App

### Prerequisites
1. Node.js installed
2. Android Studio with Android SDK
3. Android emulator or physical device

### Installation & Build
```bash
# Navigate to project directory
cd d:\Android_project\AlokApp

# Install dependencies (if needed)
npm install

# Start Metro bundler
npx react-native start

# Build and run on Android (in new terminal)
npx react-native run-android
```

### For Emulator Camera Testing
1. Open Android Studio → Tools → Device Manager
2. Edit your emulator (pencil icon)
3. Show Advanced Settings
4. Set **Back camera** to "Emulated" or "Webcam0"
5. Set **Front camera** to "Emulated" or "Webcam0"
6. Restart emulator

---

## How to Use the App

1. **Launch App** - Grant camera and microphone permissions when prompted
2. **View Preview** - Live camera feed appears automatically
3. **Start Recording** - Tap green "Start Recording" button
4. **Recording Active** - Red indicator appears in top-left
5. **Stop Recording** - Tap red "Stop Recording" button
6. **Video Saved** - Alert shows file path where video is saved

---

## Project Structure

```
AlokApp/
├── android/                    # Android native code
│   ├── app/
│   │   └── src/main/
│   │       └── AndroidManifest.xml  # Permissions configured here
│   └── build.gradle           # SDK versions (minSdk: 26)
├── App.tsx                    # Main application code
├── package.json               # Dependencies
└── PROJECT_INFO.md           # This file
```

---

## Key Dependencies

```json
{
  "react-native-vision-camera": "latest",
  "react-native-safe-area-context": "latest"
}
```

---

## Troubleshooting

### "No camera device found"
- **Emulator**: Configure virtual camera in AVD Manager
- **Physical Device**: Ensure camera permissions are granted

### "Permission denied"
- Go to device Settings → Apps → BasicApp → Permissions
- Enable Camera, Microphone, and Storage permissions

### Video not saving
- Check storage permissions
- Verify app has write access to cache directory
- Check alert message for error details

### Build errors
- Clean build: `cd android && ./gradlew clean`
- Rebuild: `npx react-native run-android`

---

## Development Notes

### Configuration Changes Made
1. Updated `minSdkVersion` from 24 to 26 (required by vision-camera)
2. Added camera, microphone, and storage permissions to AndroidManifest.xml
3. Replaced deprecated SafeAreaView with react-native-safe-area-context
4. Configured CameraX through react-native-vision-camera

### UI Design
- **Background**: Off-white (#f5f5f5) with white border
- **Preview Area**: Dark background with rounded corners
- **Buttons**: Green (Start) and Red (Stop) with disabled states
- **Recording Indicator**: Red badge with white text overlay

---

## Future Enhancements (Potential)
- [ ] Front/back camera toggle
- [ ] Video quality settings
- [ ] Flash control
- [ ] Zoom functionality
- [ ] Gallery to view recorded videos
- [ ] Share recorded videos
- [ ] Custom save location

---

## Contact & Support
- **Project Location**: `d:\Android_project\AlokApp`
- **Package Name**: `com.basicapp`
- **App Name**: BasicApp

---

**Last Updated**: November 29, 2025
**Status**: ✅ Fully functional with CameraX integration
