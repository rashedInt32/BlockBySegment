# BlockBySegment

A Chrome extension that helps you control website access by dividing your day into time segments with beautiful iOS-inspired liquid glass design.

## Features

- **Segment-Based Blocking**: Divide your 24-hour day into equal segments (2, 4, 6, 8, or 12)
- **Time Control**: Set unblock time limits per segment based on segment duration
- **iOS Liquid Glass Design**: Beautiful glassmorphism UI with smooth animations
- **Simple Interface**: Easy-to-use popup with URL input, segment selector, and time slider
- **Persistent Storage**: Your block rules are saved and enforced automatically

## How It Works

1. **Choose Segments**: Select how many segments to divide your day into:
   - 2 segments = 12 hours each
   - 4 segments = 6 hours each  
   - 6 segments = 4 hours each
   - 8 segments = 3 hours each
   - 12 segments = 2 hours each

2. **Set Unblock Time**: Use the slider to choose how many hours the site can be accessed per segment
   - Maximum unblock time cannot exceed segment duration
   - Example: With 4 segments (6h each), max unblock time is 6 hours

3. **Add Sites**: Paste website URLs and save block rules
4. **Automatic Enforcement**: The extension tracks usage and blocks sites when time limits are reached

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `BlockBySegment` directory

## Usage

1. Click the BlockBySegment extension icon in your Chrome toolbar
2. Enter a website URL (e.g., `facebook.com` or `https://twitter.com`)
3. Select your preferred number of segments
4. Use the slider to set unblock hours per segment
5. Click "Set Block Rule" to save

The extension will:
- Track your usage time for each blocked site
- Reset usage counters at the start of each segment
- Display a block page when you exceed your time limit
- Automatically unblock sites in the next segment

## Technical Details

- **Manifest V3**: Built with the latest Chrome extension architecture
- **Service Worker**: Background processing for blocking logic
- **Declarative Net Request**: Modern, performant blocking mechanism
- **Chrome Storage API**: Persistent data storage
- **Modern JavaScript**: ES6+ features for clean, maintainable code

## Files Structure

```
BlockBySegment/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup UI
├── popup.css             # iOS liquid glass styles
├── popup.js              # Popup logic and interactions
├── background.js         # Service worker for blocking
├── blocked.html          # Block notification page
└── icons/                # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Permissions

- `storage`: Save block rules and usage data
- `declarativeNetRequest`: Block websites efficiently
- `alarms`: Check segment resets periodically
- `host_permissions`: Access to all URLs for blocking

## Browser Compatibility

- Chrome 88+
- Microsoft Edge 88+
- Other Chromium-based browsers with Manifest V3 support

## Privacy

All data is stored locally on your device. No information is sent to external servers.

## License

MIT License - Feel free to modify and use this extension!
