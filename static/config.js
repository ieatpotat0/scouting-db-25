
export const CONFIG = {
    // ==================== UI DIMENSIONS ====================
    SIDEBAR_WIDTH: 320,
    FILTER_SIDEBAR_WIDTH: 280,
    BOTTOM_GRAPH_HEIGHT: 240,
    GRAPH_MIN_WIDTH: 400,
    GRAPH_MIN_HEIGHT: 300,
    GRAPH_DEFAULT_WIDTH: 900,
    GRAPH_DEFAULT_HEIGHT: 300,
    GRID_SIZE: 50,
    TASKBAR_HEIGHT: 40,
    
    // ==================== COLORS ====================
    PRIMARY_COLOR: '#5ca8ff',
    SECONDARY_COLOR: '#243447',
    BACKGROUND_COLOR: '#1a2332',
    BORDER_COLOR: '#3a4a5e',
    ERROR_COLOR: '#d32f2f',
    SUCCESS_COLOR: '#2e7d32',
    WARNING_COLOR: '#ffa726',
    
    // ==================== CHART COLORS ====================
    CHART_COLORS: [
        '#5ca8ff',  // Blue
        '#ff5252',  // Red
        '#4caf50',  // Green
        '#ffa726',  // Orange
        '#ab47bc'   // Purple
    ],
    
    // ==================== TIMING & DEBOUNCE ====================
    DEBOUNCE_DELAY: 100,
    ANIMATION_DURATION: 500,
    SIDEBAR_INTERACTION_THRESHOLD: 500,
    REQUEST_TIMEOUT: 10000,
    
    // ==================== CACHING ====================
    TEAM_DATA_CACHE_TTL: 5 * 60 * 1000,
    RANKINGS_SAVE_INTERVAL: 30000,
    
    // ==================== PAN & ZOOM ====================
    MIN_SCALE: 0.3,
    MAX_SCALE: 3,
    ZOOM_SENSITIVITY: 0.1,
    
    // ==================== CATEGORY MAPPINGS ====================
    CATEGORY_DISPLAY_NAMES: {
        'auto_coral': 'Auto Coral',
        'autoncoral1': 'Auto L1',
        'autoncoral2': 'Auto L2',
        'autoncoral3': 'Auto L3',
        'autoncoral4': 'Auto L4',
        'tele_coral': 'Tele Coral',
        'telecoral1': 'Tele L1',
        'telecoral2': 'Tele L2',
        'telecoral3': 'Tele L3',
        'telecoral4': 'Tele L4',
        'total_coral': 'Total Coral',
        'net': 'Net',
        'processor': 'Processor',
        'climb': 'Climb'
    },
    
    // ==================== VALIDATION ====================
    MAX_FILE_SIZE: 5 * 1024 * 1024,
    ALLOWED_FILE_TYPES: ['text/plain'],
    MAX_TEAM_NAME_LENGTH: 50,
    
    // ==================== FEATURE FLAGS ====================
    ENABLE_KEYBOARD_SHORTCUTS: true,
    ENABLE_AUTO_SAVE: true,
    ENABLE_PERFORMANCE_MONITORING: false,
    
    // Utility function to get category display name
    getCategoryDisplayName(category) {
        return this.CATEGORY_DISPLAY_NAMES[category] || category.replace(/_/g, ' ').toUpperCase();
    },
    
    // Utility function to get chart color by index
    getChartColor(index) {
        return this.CHART_COLORS[index % this.CHART_COLORS.length];
    }
};

export default CONFIG;