# Bitcraft Settlement Planner v1.3.1

A hex-based grid planning tool for designing settlements in the game Bitcraft.

## Features

- **Hex Grid System**: 100x100 hex grid for detailed settlement planning
- **Color Palette**: 12 preset colors plus custom color picker and eraser
- **Large Hex Mode**: Paint in 7-hex clusters (center + 6 neighbors)
- **Building Stamps**: 39 hand-verified building templates with rotation
- **Large Tile System**: Visualize terraforming boundaries (7x14 modular grid)
- **Save/Load**: Export and import plans as JSON
- **Interactive Controls**: Pan, zoom, drag-to-paint, text labels

## Installation

1. Extract the ZIP file to any folder
2. Open `index.html` in your web browser
3. That's it! Everything runs locally in your browser

## Controls

### Navigation
- **Left Click**: Paint/Place hex or stamp
- **Left Drag**: Paint multiple hexes
- **Double Click**: Add text label to hex
- **Middle Drag**: Pan the view
- **Mouse Wheel**: Zoom in/out
- **Q Key**: Rotate stamp counter-clockwise
- **E/R Key**: Rotate stamp clockwise

### Modes
- **Paint Mode**: Standard single-hex painting
- **Large Hex Mode**: Paint in 7-hex clusters
- **Building Stamps**: Place pre-configured building templates
- **Show Boundaries**: Display large tile boundaries
- **Large Tile Centers**: Show center markers for large tiles

## File Structure

```
bitcraft-planner/
* index.html              # Main HTML file with UI
* README.txt              # This file
* js/
    * config.js           # Constants and building data
    * hex-math.js         # Hex coordinate system
    * tile-system.js      # Large tile logic
    * stamps.js           # Building stamp system
    * state.js            # Application state
    * rendering.js        # SVG rendering
    * painting.js         # Paint operations
    * ui.js               # UI event handlers
    * file-ops.js         # Save/load/reset
    * main.js             # Initialization
```

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Tips

1. **Save Often**: Use "Save Plan" to export your work as JSON
2. **Large Tiles**: Enable boundaries to see how large hexes align
3. **Stamps**: Buildings snap to even rows for consistent placement
4. **Custom Colors**: Click the rainbow swatch to pick any color
5. **Border Pattern**: Use for marking territorial boundaries

## Development

The code is organized into modules for easy maintenance:
- All building data is in `config.js`
- Hex math functions are isolated in `hex-math.js`
- Each system has its own dedicated file
- Main initialization orchestrates everything

To modify or extend:
1. Edit the appropriate JavaScript file
2. Refresh the browser to see changes
3. No build process required!

## Credits

Created for the Bitcraft community.
Building data hand-verified from game sources.

## Version History

**v1.3.1**
- Refactored into modular JavaScript structure
- Improved code organization and maintainability
- All existing features preserved

**v1.3.0**
- 39 verified building stamps
- Large tile grid system
- File size optimizations

## License

Free to use and modify for Bitcraft settlement planning.
