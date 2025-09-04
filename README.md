## Chrome Extension

Allows users to record and replay user flows. Records navigation, clicks and keystrokes and displays them in a vertical timeline in the side panel. User can then download the recorded trace as a JSON file, and replay the recorded trace.

## Features

- Side Panel Interface: Opens as a persistent side panel that stays open during recording
- Trace: Clicks, typing, key presses, and page navigation
- Timeline: Vertical color-coded timeline showing recorded actions as they happen
- Record: Start & stop recording the user's interactions on the current tab
- Download: Export the recorded trace as a JSON file
- Replay: Select a recorded trace JSON and replay the selected trace step-by-step
- ChatGPT Support: Specific functionality to handle requests on https://chatgpt.com

## Usage

1. Navigate to any webpage you want to record
2. Click the Recorder extension icon to open the side panel
3. Click "Record" to start capturing interactions
4. Do the actions you want to record (click, type, navigate)
6. Click "Stop" when finished
7. Click "Download Trace" to save the JSON file
8. Click "Choose File" to select a trace
9. Click "Play Trace" to load the trace
10. Click "Step" to step through the events of the trace

## File Structure

- `manifest.json` - Extension configuration
- `index.html` - Side panel interface including the timeline
- `record.js` - Main recording logic and timeline management
- `content.js` - Injected script for capturing events
- `background.js` - Background service worker for message handling and side panel control
- `recorder-ext.png` - Custom drawn logo for the Chrome extension
- `trace-2025-09-04T01-54-50` - Sample recorded action trace on https://chatgpt.com with a multiround conversation that uses the Web Search mode for two queries

## Visual Documentation
Home page:

<img width="370" height="771" alt="Screenshot 2025-09-03 at 9 10 03 PM" src="https://github.com/user-attachments/assets/342847d9-cdc6-48cc-b903-fef981eec8cc" />

Recording user flow:

<img width="373" height="770" alt="Screenshot 2025-09-03 at 9 20 12 PM" src="https://github.com/user-attachments/assets/8f926b95-8ef6-4265-b9f4-d4ace017418f" />

Replaying trace:

<img width="1077" height="763" alt="Screenshot 2025-09-03 at 9 14 37 PM" src="https://github.com/user-attachments/assets/20aa0a4d-11da-473b-b2f7-79fdaef103f5" />

Replaying query using ChatGPT Web Search mode:

<img width="1075" height="765" alt="Screenshot 2025-09-03 at 9 16 06 PM" src="https://github.com/user-attachments/assets/476613e1-4048-42b3-a617-234b4f21a81d" />
