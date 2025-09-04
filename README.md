## Chrome Extension

Allows users to record and replay user flows. Records navigation, clicks and keystrokes and displays them in a vertical timeline in the side panel. User can then download the recorded trace as a JSON file.

## Features

- Side Panel Interface: Opens as a persistent side panel that stays open during recording
- Trace: Clicks, typing, key presses, and page navigation
- Timeline: Vertical color-coded timeline showing recorded actions as they happen
- Record: Start & stop recording the user's interactions on the current tab
- Download: Export the recorded trace as a JSON file

## Usage

1. Navigate to any webpage you want to record
2. Click the Recorder extension icon to open the side panel
3. Click "Record" to start capturing interactions
4. Do the actions you want to record (click, type, navigate)
6. Click "Stop" when finished
7. Click "Download Trace" to save the JSON file

## File Structure

- `manifest.json` - Extension configuration
- `index.html` - Side panel interface including the timeline
- `record.js` - Main recording logic and timeline management
- `content.js` - Injected script for capturing events
- `background.js` - Background service worker for message handling and side panel control