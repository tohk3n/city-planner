// =============================================================================
// CONFIGURATION & CONSTANTS
// =============================================================================

export const CONFIG = {
  HEX_GRID_SIZE: { cols: 100, rows: 100 },
  HEX_SIZE: 20,

  // Default hex color
  DEFAULT_HEX_COLOR: '#2a2838',

  // Terrain configuration
  TERRAIN_HEIGHT_SCALE: 8, // Multiplier for depth -> 3D height
  TERRAIN_SEA_LEVEL: 25,
  TERRAIN_MIN_DEPTH: 0,
  TERRAIN_MAX_DEPTH: 100,

  // Building configuration
  BUILDING_BASE_HEIGHT: 30, // Base height for buildings in 3D

  // Camera configuration
  CAMERA_DISTANCE: 1200,
  CAMERA_HEIGHT: 800,
  CAMERA_ANGLE: Math.PI / 4,
  CAMERA_FOV: 50,

  // Performance
  GEOMETRY_CACHE_ENABLED: true,
  FRUSTUM_CULLING_ENABLED: true,

  PRESET_COLORS: [
    'red', 'orange', 'yellow', 'lime', 'cyan', 'blue', 'magenta', 'purple',
    'white', '#888', 'brown', 'pink', 'custom-color', 'border-pattern', 'eraser'
  ]
};

export const BUILDING_STAMPS = {
  "crafting": [
    {
      "id": "orange_0",
      "name": "Tanning Tub",
      "size": 7,
      "color": "orange",
      "coords": [[1,1],[1,0],[2,0],[0,1],[2,1],[1,2],[2,2]]
    },
    {
      "id": "orange_1",
      "name": "Hunting Station",
      "size": 7,
      "color": "orange",
      "coords": [[1,0],[2,0],[0,1],[1,1],[2,1],[1,2],[2,2]]
    },
    {
      "id": "orange_2",
      "name": "Leatherworking",
      "size": 8,
      "color": "orange",
      "coords": [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1],[3,2],[2,3]]
    },
    {
      "id": "green_3",
      "name": "Carpentry",
      "size": 3,
      "color": "green",
      "coords": [[0,1],[1,0],[2,0]]
    },
    {
      "id": "green_4",
      "name": "Forestry",
      "size": 10,
      "color": "green",
      "coords": [[0,2],[1,2],[2,2],[3,2],[0,1],[1,1],[2,1],[1,0],[2,0],[3,0]]
    },
    {
      "id": "cyan_5",
      "name": "Fishing Station",
      "size": 8,
      "color": "cyan",
      "coords": [[0,1],[1,0],[2,0],[3,0],[2,1],[3,2],[2,3],[2,4]]
    },
    {
      "id": "brown_6",
      "name": "Farming Plot x1",
      "size": 1,
      "color": "brown",
      "coords": [[0,0]]
    },
    {
      "id": "brown_7",
      "name": "Farming Plots x3",
      "size": 3,
      "color": "brown",
      "coords": [[0,0],[0,1],[1,2]]
    },
    {
      "id": "brown_8",
      "name": "Farming Plots x5",
      "size": 5,
      "color": "brown",
      "coords": [[0,0],[0,1],[1,2],[1,3],[2,4]]
    },
    {
      "id": "brown_9",
      "name": "Farming Plots x7",
      "size": 7,
      "color": "brown",
      "coords": [[1,0],[2,0],[0,1],[1,1],[2,1],[1,2],[2,2]]
    },
    {
      "id": "yellow_10",
      "name": "Cooking Station",
      "size": 8,
      "color": "yellow",
      "coords": [[0,0],[1,0],[2,0],[1,1],[2,1],[0,2],[1,2],[2,2]]
    },
    {
      "id": "yellow_11",
      "name": "Oven",
      "size": 8,
      "color": "yellow",
      "coords": [[0,2],[1,2],[2,2],[0,1],[1,1],[2,1],[1,0],[2,0]]
    },
    {
      "id": "lime_12",
      "name": "Foraging",
      "size": 7,
      "color": "lime",
      "coords": [[1,0],[2,0],[0,1],[1,1],[2,1],[1,2],[2,2]]
    },
    {
      "id": "blue_13",
      "name": "Tailoring",
      "size": 5,
      "color": "blue",
      "coords": [[0,0],[1,0],[2,0],[2,1],[3,2]]
    },
    {
      "id": "blue_14",
      "name": "Loom",
      "size": 4,
      "color": "blue",
      "coords": [[0,1],[1,0],[1,1],[2,0]]
    },
    {
      "id": "yellow_15",
      "name": "Farming Station",
      "size": 9,
      "color": "yellow",
      "coords": [[0,1],[1,2],[2,2],[3,2],[1,1],[2,1],[3,1],[2,0],[3,0]]
    },
    {
      "id": "purple_16",
      "name": "Masonry Station",
      "size": 12,
      "color": "purple",
      "coords": [[0,3],[1,3],[2,3],[0,2],[1,2],[2,2],[3,2],[0,1],[1,1],[2,1],[1,0],[2,0]]
    },
    {
      "id": "purple_17",
      "name": "Kiln",
      "size": 8,
      "color": "purple",
      "coords": [[0,2],[1,2],[2,2],[0,1],[1,1],[2,1],[1,0],[2,0]]
    },
    {
      "id": "gray_18",
      "name": "Mining Station",
      "size": 5,
      "color": "gray",
      "coords": [[0,1],[1,1],[0,0],[1,0],[2,0]]
    },
    {
      "id": "red_19",
      "name": "Smithing Station",
      "size": 5,
      "color": "red",
      "coords": [[0,0],[1,0],[2,0],[2,1],[2,2]]
    },
    {
      "id": "red_20",
      "name": "Smelter",
      "size": 8,
      "color": "red",
      "coords": [[0,2],[1,2],[2,2],[0,1],[1,1],[2,1],[1,0],[2,0]]
    },
    {
      "id": "purple_21",
      "name": "Scholar Station",
      "size": 3,
      "color": "purple",
      "coords": [[0,0],[1,0],[2,0]]
    }
  ],
  "housing": [
    {
      "id": "cyan_22",
      "name": "T1 Tent",
      "size": 8,
      "color": "cyan",
      "coords": [[0,2],[2,2],[1,2],[0,1],[1,1],[2,1],[1,0],[2,0]]
    },
    {
      "id": "cyan_23",
      "name": "T2-T5 Housing",
      "size": 19,
      "color": "cyan",
      "coords": [[0,2],[0,3],[1,4],[0,1],[1,0],[3,0],[2,0],[1,1],[2,1],[3,1],[1,2],[2,2],[3,2],[4,2],[3,3],[2,3],[1,3],[2,4],[3,4]]
    },
    {
      "id": "cyan_24",
      "name": "T3 and T5 Big House",
      "size": 70,
      "color": "cyan",
      "coords": [[2,0],[1,1],[1,2],[0,4],[0,3],[0,5],[1,6],[1,7],[2,8],[3,0],[4,0],[5,0],[6,0],[7,0],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[2,2],[3,2],[5,2],[4,2],[6,2],[7,2],[8,2],[1,3],[2,3],[3,3],[4,3],[5,3],[7,3],[6,3],[8,3],[1,4],[2,4],[3,4],[4,4],[5,4],[7,4],[6,4],[8,4],[9,4],[1,5],[2,5],[3,5],[4,5],[7,5],[5,5],[6,5],[8,5],[2,6],[4,6],[3,6],[5,6],[6,6],[7,6],[8,6],[2,7],[3,7],[5,7],[6,7],[7,7],[4,7],[3,8],[4,8],[5,8],[6,8],[7,8]]
    }
  ],
  "storage": [
    {
      "id": "white_25",
      "name": "T1 T2 Stockpile",
      "size": 11,
      "color": "white",
      "coords": [[0,3],[1,3],[2,3],[1,2],[2,2],[3,2],[0,1],[1,1],[2,1],[3,1],[2,0]]
    },
    {
      "id": "green_26",
      "name": "T3 T4 Stockpile",
      "size": 19,
      "color": "green",
      "coords": [[1,4],[0,3],[0,2],[0,1],[1,0],[2,0],[3,0],[1,1],[2,1],[3,1],[2,2],[1,2],[3,2],[4,2],[1,3],[3,3],[2,3],[2,4],[3,4]]
    },
    {
      "id": "purple_27",
      "name": "T5 T6 T7 Stockpile",
      "size": 15,
      "color": "purple",
      "coords": [[0,3],[1,3],[2,3],[3,3],[2,4],[1,2],[2,2],[3,2],[4,2],[0,1],[1,1],[2,1],[3,1],[2,0],[3,0]]
    }
  ],
  "travelers": [
    {
      "id": "brown_28",
      "name": "Alesi's Grotto",
      "size": 18,
      "color": "brown",
      "coords": [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2],[4,2],[0,3],[1,3],[2,3],[3,3],[2,4],[3,4]]
    },
    {
      "id": "brown_29",
      "name": "NPC Footprint",
      "size": 7,
      "color": "brown",
      "coords": [[1,0],[2,0],[0,1],[1,1],[2,1],[1,2],[2,2]]
    }
  ],
  "empire": [
    {
      "id": "yellow_30",
      "name": "Foundry",
      "size": 19,
      "color": "yellow",
      "coords": [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2],[4,2],[0,3],[1,3],[2,3],[3,3],[1,4],[2,4],[3,4]]
    },
    {
      "id": "yellow_31",
      "name": "Bank",
      "size": 19,
      "color": "yellow",
      "coords": [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2],[4,2],[2,3],[0,3],[1,3],[3,3],[1,4],[2,4],[3,4]]
    },
    {
      "id": "yellow_32",
      "name": "Waypoint",
      "size": 19,
      "color": "yellow",
      "coords": [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[4,2],[3,2],[2,2],[0,3],[1,3],[2,3],[3,3],[1,4],[2,4],[3,4]]
    },
    {
      "id": "yellow_33",
      "name": "Hexite Reserve",
      "size": 9,
      "color": "yellow",
      "coords": [[0,0],[1,0],[0,1],[1,2],[1,1],[2,0],[2,2],[2,1],[3,2]]
    }
  ],
  "trade": [
    {
      "id": "orange_34",
      "name": "Market",
      "size": 88,
      "color": "orange",
      "coords": [[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[0,3],[1,2],[1,1],[2,0],[0,5],[1,6],[1,7],[2,8],[10,5],[10,6],[9,7],[9,8],[10,3],[10,2],[9,1],[9,0],[3,0],[4,0],[6,0],[5,0],[7,0],[8,0],[2,1],[4,1],[3,1],[5,1],[6,1],[7,1],[8,1],[2,2],[3,2],[4,2],[5,2],[6,2],[8,2],[7,2],[9,2],[1,3],[2,3],[3,3],[5,3],[4,3],[6,3],[7,3],[8,3],[9,3],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[2,6],[4,6],[3,6],[5,6],[6,6],[7,6],[8,6],[9,6],[2,7],[3,7],[5,7],[4,7],[6,7],[8,7],[7,7],[3,8],[4,8],[5,8],[7,8],[6,8],[8,8]]
    },
    {
      "id": "orange_35",
      "name": "T1 T3 Barter Stalls",
      "size": 3,
      "color": "orange",
      "coords": [[0,0],[1,0],[2,0]]
    },
    {
      "id": "orange_36",
      "name": "T5 Barter Stall",
      "size": 14,
      "color": "orange",
      "coords": [[0,2],[0,1],[1,0],[1,2],[1,1],[1,3],[2,2],[2,1],[2,4],[2,3],[3,2],[3,4],[3,3],[4,2]]
    }
  ],
  "structure": [
    {
      "id": "black_37",
      "name": "Wall",
      "size": 1,
      "color": "black",
      "coords": [[0,0]]
    },
    {
      "id": "black_38",
      "name": "Gate",
      "size": 4,
      "color": "black",
      "coords": [[0,0],[1,0],[2,0],[3,0]]
    }
  ]
};