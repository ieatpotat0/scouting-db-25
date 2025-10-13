// ==================== GLOBAL STATE ====================
let mainChart = null;
let selectedTeams = [];
let allTeams = [];
let windows = {};
let bottomGraphHeight = 240;
let activeGraphWindows = new Map();
let graphCounter = 0;
let sidebarInteractionTime = 0;

// Pan and Zoom state
let panZoom = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isPanning: false,
    startX: 0,
    startY: 0,
    minScale: 0.3,
    maxScale: 3
};

// Workspace state
let workspaceLocked = false;
let savedGraphPositions = new Map();
let contextMenuTarget = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async function() {
    setupNavigation();
    await loadTeams();
    initDisplayView();
    initRankings();
    restoreState();
    setupClickOutsideHandler();
    setupPanZoom();
    setupWorkspaceControls();
    setupContextMenu();
    createCenterMarker();
});

// ==================== CREATE CENTER MARKER ====================
function createCenterMarker() {
    const canvas = document.getElementById('graph-workspace-canvas');
    const marker = document.createElement('div');
    marker.className = 'center-marker';
    canvas.appendChild(marker);
}

// ==================== CONTEXT MENU ====================
function setupContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    
    document.addEventListener('click', () => {
        contextMenu.classList.remove('show');
    });
    
    contextMenu.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (action === 'close' && contextMenuTarget) {
            const category = Array.from(activeGraphWindows.entries())
                .find(([k, v]) => v === contextMenuTarget)?.[0];
            
            if (category) {
                contextMenuTarget.remove();
                activeGraphWindows.delete(category);
                savedGraphPositions.delete(contextMenuTarget.id);
                removeGraphFromTaskbar(category);
                document.querySelector(`[data-category="${category}"]`)?.classList.remove('active');
            }
        }
        contextMenu.classList.remove('show');
    });
}

function showContextMenu(e, target) {
    e.preventDefault();
    const contextMenu = document.getElementById('context-menu');
    contextMenuTarget = target;
    
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.classList.add('show');
}

// ==================== WORKSPACE CONTROLS ====================
function setupWorkspaceControls() {
    document.getElementById('home-view-btn').addEventListener('click', resetView);
    document.getElementById('auto-layout-btn').addEventListener('click', autoLayout);
    document.getElementById('refresh-graphs-btn').addEventListener('click', refreshAllGraphs);
}

function refreshAllGraphs() {
    const btn = document.getElementById('refresh-graphs-btn');
    btn.classList.add('spinning');
    
    // Refresh main chart
    if (mainChart) {
        mainChart.destroy();
        updateMainChart();
    }
    
    // Refresh all floating graphs
    activeGraphWindows.forEach((win, category) => {
        const canvas = win.querySelector('canvas');
        const chart = Chart.getChart(canvas);
        if (chart) {
            chart.destroy();
        }
        renderCategoryChart(canvas.id, category);
    });
    
    setTimeout(() => {
        btn.classList.remove('spinning');
        updateStackIndicatorsAll();
    }, 500);
}

function autoLayout() {
    if (activeGraphWindows.size === 0) return;
    
    const wins = Array.from(activeGraphWindows.values());
    const count = wins.length;
    
    // Collect actual sizes
    const winSizes = wins.map(win => ({
        width: parseFloat(win.style.width) || 900,
        height: parseFloat(win.style.height) || 300
    }));
    
    const gap = 20;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    // Calculate total dimensions using actual sizes
    let maxRowWidth = 0;
    let totalHeight = 0;
    
    for (let row = 0; row < rows; row++) {
        let rowWidth = 0;
        let rowHeight = 0;
        for (let col = 0; col < cols; col++) {
            const idx = row * cols + col;
            if (idx < count) {
                rowWidth += winSizes[idx].width + (col > 0 ? gap : 0);
                rowHeight = Math.max(rowHeight, winSizes[idx].height);
            }
        }
        maxRowWidth = Math.max(maxRowWidth, rowWidth);
        totalHeight += rowHeight + (row > 0 ? gap : 0);
    }

    const startX = -maxRowWidth / 2;
    const startY = -totalHeight / 2;

    let currentY = startY;
    
    for (let row = 0; row < rows; row++) {
        let rowHeight = 0;
        let currentX = startX;
        
        for (let col = 0; col < cols; col++) {
            const idx = row * cols + col;
            if (idx < count) {
                const win = wins[idx];
                const w = winSizes[idx].width;
                const h = winSizes[idx].height;
                
                win.dataset.x = currentX;
                win.dataset.y = currentY;
                win.style.transform = `translate(${currentX}px, ${currentY}px)`;
                
                savedGraphPositions.set(win.id, { x: currentX, y: currentY, width: w, height: h });
                
                currentX += w + gap;
                rowHeight = Math.max(rowHeight, h);
                
                // Force chart resize and redraw at high quality
                const chart = Chart.getChart(win.querySelector('canvas'));
                if (chart) {
                    chart.resize();
                    chart.update('none');
                }
            }
        }
        currentY += rowHeight + gap;
    }

    setTimeout(() => {
        resetView();
        updateStackIndicatorsAll();
    }, 100);
}

function updateGraphStackIndicators(win) {
    const canvas = win.querySelector('canvas');
    if (canvas) {
        const chart = Chart.getChart(canvas);
        if (chart) {
            win.querySelectorAll('.stack-indicator').forEach(el => el.remove());
            addStackIndicators(win, chart, canvas.id);
        }
    }
}

// ==================== PAN AND ZOOM ====================
function setupPanZoom() {
    const workspace = document.getElementById('graph-workspace');
    
    workspace.addEventListener('mousedown', (e) => {
        if (e.button === 1 && !workspaceLocked) {
            e.preventDefault();
            panZoom.isPanning = true;
            panZoom.startX = e.clientX - panZoom.offsetX;
            panZoom.startY = e.clientY - panZoom.offsetY;
            workspace.classList.add('panning');
        }
    });
    
    workspace.addEventListener('mousemove', (e) => {
        if (panZoom.isPanning) {
            panZoom.offsetX = e.clientX - panZoom.startX;
            panZoom.offsetY = e.clientY - panZoom.startY;
            updateTransform(false);
        }
    });
    
    workspace.addEventListener('mouseup', (e) => {
        if (e.button === 1) {
            panZoom.isPanning = false;
            workspace.classList.remove('panning');
        }
    });
    
    workspace.addEventListener('mouseleave', () => {
        if (panZoom.isPanning) {
            panZoom.isPanning = false;
            workspace.classList.remove('panning');
        }
    });
    
    workspace.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const rect = workspace.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(panZoom.minScale, Math.min(panZoom.maxScale, panZoom.scale * delta));
        
        if (newScale !== panZoom.scale) {
            const scaleChange = newScale / panZoom.scale;
            panZoom.offsetX = mouseX - (mouseX - panZoom.offsetX) * scaleChange;
            panZoom.offsetY = mouseY - (mouseY - panZoom.offsetY) * scaleChange;
            panZoom.scale = newScale;
            
            updateTransform(false);
            updateStackIndicatorsAll();
        }
    }, { passive: false });
    
    workspace.addEventListener('contextmenu', (e) => {
        if (e.button === 1) e.preventDefault();
    });
}

function updateTransform(animate = false) {
    const canvas = document.getElementById('graph-workspace-canvas');
    
    if (animate) {
        canvas.classList.add('animating');
    } else {
        canvas.classList.remove('animating');
    }
    
    canvas.style.transform = `translate(${panZoom.offsetX}px, ${panZoom.offsetY}px) scale(${panZoom.scale})`;
    
    if (animate) {
        setTimeout(() => {
            canvas.classList.remove('animating');
            updateStackIndicatorsAll();
        }, 500);
    }
    
    const workspace = document.getElementById('graph-workspace');
    workspace.style.backgroundPosition = `${panZoom.offsetX}px ${panZoom.offsetY}px`;
    workspace.style.backgroundSize = `${50 * panZoom.scale}px ${50 * panZoom.scale}px`;
}

function updateStackIndicatorsAll() {
    activeGraphWindows.forEach((win) => {
        updateGraphStackIndicators(win);
    });
    if (mainChart) {
        document.querySelectorAll('[data-chart="mainChart"]').forEach(el => el.remove());
        addStackedPointIndicators(mainChart, 'mainChart');
    }
}

function resetView() {
    if (activeGraphWindows.size === 0) {
        panZoom.scale = 1;
        panZoom.offsetX = 0;
        panZoom.offsetY = 0;
        updateTransform(true);
        return;
    }
    
    const workspace = document.getElementById('graph-workspace');
    const workspaceRect = workspace.getBoundingClientRect();
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    activeGraphWindows.forEach(win => {
        const x = parseFloat(win.dataset.x) || 0;
        const y = parseFloat(win.dataset.y) || 0;
        const width = parseFloat(win.style.width) || 900;
        const height = parseFloat(win.style.height) || 300;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
    });
    
    const graphsWidth = maxX - minX;
    const graphsHeight = maxY - minY;
    
    const padding = 50;
    const scaleX = (workspaceRect.width - padding * 2) / graphsWidth;
    const scaleY = (workspaceRect.height - padding * 2) / graphsHeight;
    const newScale = Math.min(scaleX, scaleY, 1);
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    panZoom.scale = newScale;
    panZoom.offsetX = workspaceRect.width / 2 - centerX * newScale;
    panZoom.offsetY = workspaceRect.height / 2 - centerY * newScale;
    
    updateTransform(true);
}

// ==================== CLICK OUTSIDE HANDLER ====================
function setupClickOutsideHandler() {
    document.addEventListener('click', function(e) {
        if (Date.now() - sidebarInteractionTime < 500) return;
        
        const rankingsSidebar = document.getElementById('rankings-sidebar');
        const teamsSidebar = document.getElementById('teams-sidebar');
        const graphsSidebar = document.getElementById('graphs-sidebar');
        
        const rankingsToggle = document.getElementById('rankings-toggle');
        const teamsToggle = document.getElementById('teams-toggle');
        const graphsToggle = document.getElementById('graphs-toggle');
        
        const isOutsideRankings = !rankingsSidebar.contains(e.target) && !rankingsToggle.contains(e.target);
        const isOutsideTeams = !teamsSidebar.contains(e.target) && !teamsToggle.contains(e.target);
        const isOutsideGraphs = !graphsSidebar.contains(e.target) && !graphsToggle.contains(e.target);
        
        if (isOutsideRankings && rankingsSidebar.classList.contains('open')) {
            rankingsSidebar.classList.remove('open');
            rankingsToggle.style.display = 'block';
        }
        
        if (isOutsideTeams && teamsSidebar.classList.contains('open')) {
            teamsSidebar.classList.remove('open');
            teamsToggle.style.display = 'block';
        }
        
        if (isOutsideGraphs && graphsSidebar.classList.contains('open')) {
            graphsSidebar.classList.remove('open');
            graphsToggle.style.display = 'block';
        }
    });
    
    document.querySelectorAll('.rankings-sidebar, .filter-sidebar').forEach(sidebar => {
        sidebar.addEventListener('mousedown', () => {
            sidebarInteractionTime = Date.now();
        });
        sidebar.addEventListener('click', () => {
            sidebarInteractionTime = Date.now();
        });
    });
}

// ==================== NAVIGATION ====================
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            if (!view) return;
            if (windows[view]) showWindow(view);
            else createWindow(view);
        });
    });

    document.getElementById('minimize-all').addEventListener('click', () => {
        Object.keys(windows).forEach(key => minimizeWindow(key));
        activeGraphWindows.forEach((win, category) => {
            savedGraphPositions.set(win.id, {
                x: parseFloat(win.dataset.x) || 0,
                y: parseFloat(win.dataset.y) || 0,
                width: parseFloat(win.style.width),
                height: parseFloat(win.style.height)
            });
            win.style.display = 'none';
            updateGraphTaskbar(category, false);
        });
    });
    
    document.getElementById('show-all').addEventListener('click', () => {
        Object.keys(windows).forEach(key => {
            if (key !== 'team-stats') showWindow(key);
        });
        
        activeGraphWindows.forEach((win, category) => {
            const saved = savedGraphPositions.get(win.id);
            if (saved) {
                win.dataset.x = saved.x;
                win.dataset.y = saved.y;
                win.style.width = `${saved.width}px`;
                win.style.height = `${saved.height}px`;
                win.style.transform = `translate(${saved.x}px, ${saved.y}px)`;
            }
            win.style.display = 'flex';
            updateGraphTaskbar(category, true);
            updateGraphStackIndicators(win);
        });
        
        if (activeGraphWindows.size > 0) setTimeout(resetView, 100);
    });
}

// ==================== WINDOW MANAGEMENT ====================
function createWindow(viewName) {
    const container = document.getElementById('window-container');
    const template = document.getElementById(`${viewName}-template`);
    if (!template) return;
    
    const win = document.createElement('div');
    win.className = 'app-window focused';
    win.id = `window-${viewName}`;
    win.style.width = '800px'; win.style.height = '600px';
    win.style.left = '100px'; win.style.top = '50px';
    
    const titles = { upload: 'Upload Data', rawdata: 'Raw Data', 'team-stats': 'Team Stats' };
    
    win.innerHTML = `
        <div class="window-header">
            <div class="window-title">${titles[viewName]}</div>
            <div class="window-controls">
                <button class="window-btn minimize">−</button>
                <button class="window-btn maximize">□</button>
                <button class="window-btn close">×</button>
            </div>
        </div>
    `;
    
    const content = template.content.cloneNode(true);
    win.appendChild(content);
    
    container.appendChild(win);
    windows[viewName] = win;
    
    setupWindowControls(win, viewName);
    makeWindowInteractive(win);
    addToTaskbar(viewName, titles[viewName]);
    focusWindow(win);

    setTimeout(() => initializeWindowContent(viewName), 0);

    if (viewName === 'team-stats') {
        toggleMaximize(win, viewName, true);
        document.querySelector('.workspace-controls').classList.add('hidden');
    }
}

function setupWindowControls(win, viewName) {
    const minimize = win.querySelector('.window-btn.minimize');
    const maximize = win.querySelector('.window-btn.maximize');
    const close = win.querySelector('.window-btn.close');
    
    minimize.addEventListener('click', e => { e.stopPropagation(); minimizeWindow(viewName); });
    maximize.addEventListener('click', e => { e.stopPropagation(); toggleMaximize(win, viewName); });
    close.addEventListener('click', e => { e.stopPropagation(); closeWindow(viewName); });
    win.addEventListener('mousedown', () => focusWindow(win));
}

function makeWindowInteractive(win) {
    interact(win)
        .draggable({
            allowFrom: '.window-header',
            listeners: {
                start(e) {
                    e.target.classList.add('dragging');
                },
                move(e) {
                    if (e.target.classList.contains('maximized')) return;
                    let x = (parseFloat(e.target.dataset.x) || 0) + e.dx;
                    let y = (parseFloat(e.target.dataset.y) || 0) + e.dy;
                    
                    e.target.style.transform = `translate(${x}px, ${y}px)`;
                    e.target.dataset.x = x;
                    e.target.dataset.y = y;
                },
                end(e) {
                    e.target.classList.remove('dragging');
                }
            }
        })
        .resizable({
            edges: { bottom: true, right: true, left: true },
            listeners: {
                move(e) {
                    if (e.target.classList.contains('maximized')) return;
                    let x = parseFloat(e.target.dataset.x) || 0;
                    
                    x += e.deltaRect.left;
                    
                    e.target.style.width = `${e.rect.width}px`;
                    e.target.style.height = `${e.rect.height}px`;
                    e.target.style.transform = `translate(${x}px, ${e.target.dataset.y || 0}px)`;
                    e.target.dataset.x = x;
                }
            }
        });
}

function minimizeWindow(viewName) {
    const win = windows[viewName];
    if (!win) return;
    win.classList.add('minimized');
    updateTaskbar(viewName, false);
    
    if (viewName === 'team-stats' && win.classList.contains('maximized')) {
        document.querySelector('.workspace-controls').classList.remove('hidden');
    }
}

function showWindow(viewName) {
    const win = windows[viewName];
    win.classList.remove('minimized');
    focusWindow(win);
    updateTaskbar(viewName, true);
    
    if (viewName === 'team-stats' && win.classList.contains('maximized')) {
        document.querySelector('.workspace-controls').classList.add('hidden');
    }
}

function toggleMaximize(win, viewName, forceMax = false) {
    const isMaximized = win.classList.contains('maximized');
    
    if (!isMaximized || forceMax) {
        win.classList.add('maximized');
        win.dataset.oldWidth = win.style.width;
        win.dataset.oldHeight = win.style.height;
        win.dataset.oldTransform = win.style.transform;

        win.style.width = '100%';
        win.style.height = '100%';
        win.style.top = '0';
        win.style.left = '0';
        win.style.transform = 'none';

        if (viewName === 'team-stats') {
            document.querySelector('.workspace-controls').classList.add('hidden');
        }
    } else {
        win.classList.remove('maximized');
        win.style.width = win.dataset.oldWidth || '800px';
        win.style.height = win.dataset.oldHeight || '600px';
        win.style.transform = win.dataset.oldTransform || 'translate(100px, 50px)';
        
        if (viewName === 'team-stats') {
            document.querySelector('.workspace-controls').classList.remove('hidden');
        }
    }
}

function closeWindow(viewName) {
    const win = windows[viewName];
    if (!win) return;
    
    if (viewName === 'team-stats' && win.classList.contains('maximized')) {
        document.querySelector('.workspace-controls').classList.remove('hidden');
    }
    win.remove();
    delete windows[viewName];
    removeFromTaskbar(viewName);
}

function focusWindow(win) {
    document.querySelectorAll('.app-window').forEach(w => {
        w.classList.remove('focused');
        w.style.zIndex = 600;
    });
    win.classList.add('focused');
    win.style.zIndex = 700;
}

function addToTaskbar(viewName, title) {
    const taskbar = document.getElementById('taskbar-items');
    const item = document.createElement('div');
    item.className = 'taskbar-item active';
    item.id = `taskbar-${viewName}`;
    item.textContent = title;
    item.addEventListener('click', () => {
        if (windows[viewName].classList.contains('minimized')) {
            showWindow(viewName);
        } else {
            minimizeWindow(viewName);
        }
    });
    taskbar.appendChild(item);
}

function removeFromTaskbar(viewName) {
    const item = document.getElementById(`taskbar-${viewName}`);
    if (item) item.remove();
}

function updateTaskbar(viewName, active) {
    const item = document.getElementById(`taskbar-${viewName}`);
    if (item) item.classList.toggle('active', active);
}

function initializeWindowContent(viewName) {
    switch(viewName) {
        case 'upload': initUploadContent(); break;
        case 'rawdata': initRawDataContent(); break;
        case 'team-stats': initTeamStatsContent(); break;
    }
}

// ==================== LOAD TEAMS ====================
async function loadTeams() {
    const res = await fetch('/teams');
    allTeams = await res.json();
}

// ==================== TEAM SELECTORS (NEW) ====================
function addTeamSelector(initialTeam = '') {
    const container = document.getElementById('team-selectors');
    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'team-selector-group';
    
    const select = document.createElement('select');
    select.className = 'team-select';
    select.innerHTML = '<option value="">Select team...</option>' + 
                       allTeams.map(t => `<option value="${t}" ${t == initialTeam ? 'selected' : ''}>Team ${t}</option>`).join('');
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-team-btn';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove team';
    
    selectorDiv.appendChild(select);
    selectorDiv.appendChild(removeBtn);
    container.appendChild(selectorDiv);
    
    select.addEventListener('change', () => {
        updateSelectedTeams();
    });
    
    removeBtn.addEventListener('click', () => {
        selectorDiv.remove();
        updateSelectedTeams();
    });
    
    if (initialTeam) {
        updateSelectedTeams();
    }
}

function updateSelectedTeams() {
    const selects = document.querySelectorAll('.team-select');
    selectedTeams = Array.from(selects)
        .map(s => parseInt(s.value))
        .filter(v => !isNaN(v));
    
    updateMainChart();
    updateFloatingGraphs();
    saveState();
}

// ==================== DISPLAY VIEW & UI ====================
function initDisplayView() {
    setupSidebar('rankings');
    setupSidebar('teams');
    setupSidebar('graphs');
    
    // Add initial team selector
    addTeamSelector();
    
    document.getElementById('add-team-btn').addEventListener('click', () => {
        if (document.querySelectorAll('.team-select').length < 5) {
            addTeamSelector();
        }
    });

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            if (selectedTeams.length === 0) { 
                alert('Select a team first'); 
                return; 
            }
            
            // If graph already exists, focus on it with animation
            if (activeGraphWindows.has(category)) {
                const win = activeGraphWindows.get(category);
                win.style.display = 'flex';
                focusGraph(category);
                focusGraphWindow(win);
                updateGraphTaskbar(category, true);
            } else {
                createFloatingGraph(category);
            }
        });
    });
    
    setupBottomGraphResize();
    updateMainChart();
}

function setupSidebar(name) {
    const sidebar = document.getElementById(`${name}-sidebar`);
    const toggle = document.getElementById(`${name}-toggle`);
    const closeBtn = sidebar.querySelector('.sidebar-close');

    if (!sidebar || !toggle || !closeBtn) return;

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.remove('open');
        toggle.style.display = 'block';
        sidebarInteractionTime = Date.now();
    });
    
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.add('open');
        toggle.style.display = 'none';
        sidebarInteractionTime = Date.now();
    });

    const resizeHandle = sidebar.querySelector(name === 'rankings' ? '.rankings-resize-handle' : '.filter-resize-handle');
    if (resizeHandle) {
        let isResizing = false;
        resizeHandle.addEventListener('mousedown', e => {
            isResizing = true;
            document.body.classList.add('resizing-ew');
            e.preventDefault();
            e.stopPropagation();
            sidebarInteractionTime = Date.now();
        });

        document.addEventListener('mousemove', e => {
            if (!isResizing) return;
            const newWidth = name === 'rankings' ? e.clientX : window.innerWidth - e.clientX;
            if (newWidth >= 250 && newWidth <= 600) {
                sidebar.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) isResizing = false;
            document.body.classList.remove('resizing-ew');
        });
    }
}

function updateFloatingGraphs() {
    activeGraphWindows.forEach((win, category) => {
        const chart = Chart.getChart(win.querySelector('canvas'));
        if (chart) chart.destroy();
        renderCategoryChart(win.querySelector('canvas').id, category);
    });
}

// ==================== BOTTOM GRAPH ====================
async function updateMainChart() {
    const legendContainer = document.getElementById('bottom-graph-legend');
    if (selectedTeams.length === 0) {
        if (mainChart) mainChart.destroy();
        legendContainer.innerHTML = '';
        return;
    }

    const dataPromises = selectedTeams.map(team => fetch(`/api/team_performance/${team}`).then(r => r.json()));
    const teamsData = await Promise.all(dataPromises);
    const colors = ['#5ca8ff', '#ff5252', '#4caf50', '#ffa726', '#ab47bc'];
    
    const datasets = teamsData.map((data, i) => ({
        label: `Team ${selectedTeams[i]}`,
        data: data.map(d => ({ x: d.match, y: d.score, notes: d.notes, team: selectedTeams[i], scouter: d.scouter })),
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length],
        pointRadius: 6, pointHoverRadius: 8, tension: 0.2
    }));

    legendContainer.innerHTML = datasets.map((ds, i) => 
        `<button class="btn-sm team-legend-btn" data-team="${selectedTeams[i]}" style="background-color: ${ds.borderColor}">
            ${ds.label.split(' ')[0]} ${selectedTeams[i]}
        </button>`
    ).join('');
    
    legendContainer.querySelectorAll('.team-legend-btn').forEach(btn => {
        btn.addEventListener('click', () => openTeamStats(btn.dataset.team));
    });

    const ctx = document.getElementById('mainChart');
    if (mainChart) mainChart.destroy();

    const allX = datasets.flatMap(ds => ds.data.map(d => d.x));
    const allY = datasets.flatMap(ds => ds.data.map(d => d.y));
    const maxX = Math.max(...allX, 1);
    const maxY = Math.max(...allY, 10);

    mainChart = new Chart(ctx, {
        type: 'line', data: { datasets },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            devicePixelRatio: window.devicePixelRatio || 2,
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const el = elements[0];
                    const point = mainChart.data.datasets[el.datasetIndex].data[el.index];
                    const stacked = getStackedPoints(mainChart, point.x, point.y);
                    if (stacked.length > 1) {
                        showStackedPopup(e.native.pageX, e.native.pageY, stacked);
                    } else {
                        showPopup(e.native.pageX, e.native.pageY, point);
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#243447', titleColor: '#5ca8ff', bodyColor: '#ffffff', borderColor: '#5ca8ff',
                    borderWidth: 2, titleFont: { size: 11 }, bodyFont: { size: 10 }, padding: 8, displayColors: false,
                    callbacks: {
                        title: c => `Match ${c[0].parsed.x}`,
                        label: c => [`Team ${c.raw.team}`, `Scouter: ${c.raw.scouter}`]
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear', title: { display: true, text: 'Match Number', color: '#ffffff', font: { size: 12 } },
                    ticks: { color: '#ffffff', stepSize: 1, callback: v => Math.round(v), font: { size: 11 } },
                    grid: { color: '#3a4a5e' }, min: 0, max: Math.ceil(maxX * 1.1), offset: false
                },
                y: {
                    title: { display: true, text: "Total Points", color: '#ffffff', font: { size: 12 } },
                    ticks: { color: '#ffffff', stepSize: Math.max(1, Math.ceil(maxY / 10)), callback: v => Math.round(v), font: { size: 11 } },
                    grid: { color: '#3a4a5e' }, min: 0, max: Math.ceil(maxY * 1.1), offset: false, beginAtZero: true
                }
            },
            layout: { padding: { top: 15, right: 15, bottom: 15, left: 15 } }
        }
    });
    
    addStackedPointIndicators(mainChart, 'mainChart');
}

function getStackedPoints(chart, x, y) {
    const stacked = [];
    chart.data.datasets.forEach(ds => {
        ds.data.forEach(p => {
            if (p.x === x && p.y === y) stacked.push(p);
        });
    });
    return stacked;
}

function setupBottomGraphResize() {
    const handle = document.querySelector('.graph-resize-handle');
    const bottomGraph = document.getElementById('bottom-graph');
    
    let isResizing = false;
    handle.addEventListener('mousedown', e => {
        isResizing = true;
        document.body.classList.add('resizing-ns');
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const newHeight = window.innerHeight - e.clientY - 40;
        if (newHeight >= 150 && newHeight <= 600) {
            bottomGraphHeight = newHeight;
            bottomGraph.style.height = `${newHeight}px`;
            
            if (mainChart) {
                mainChart.resize();
                requestAnimationFrame(() => updateStackIndicatorsAll());
            }
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.classList.remove('resizing-ns');
        }
    });
}

// ==================== FLOATING GRAPHS & FOCUS ANIMATION ====================
async function createFloatingGraph(category) {
    const windowId = `graph-${graphCounter++}`;
    const canvas = document.getElementById('graph-workspace-canvas');
    
    const win = document.createElement('div');
    win.className = 'graph-window focused';
    win.id = windowId;
    
    const offset = activeGraphWindows.size * 30;
    const x = 50 + offset;
    const y = 50 + offset;
    
    win.style.left = '0';
    win.style.top = '0';
    win.dataset.x = x;
    win.dataset.y = y;
    win.style.width = '900px';  // Changed from 400px to 900px (3:1 ratio)
    win.style.height = '300px';
    win.style.transform = `translate(${x}px, ${y}px)`;
    
    savedGraphPositions.set(windowId, { x, y, width: 900, height: 300 });
    
    const title = category.replace(/_/g, ' ').toUpperCase();
    
    win.innerHTML = `
        <div class="graph-header">
            <span>${title}</span>
        </div>
        <div class="graph-content">
            <canvas id="canvas-${windowId}"></canvas>
        </div>
    `;
    
    canvas.appendChild(win);
    activeGraphWindows.set(category, win);
    addGraphToTaskbar(category, title, win);
    focusGraphWindow(win);

    win.addEventListener('contextmenu', (e) => showContextMenu(e, win));
    win.addEventListener('mousedown', (e) => {
        if (e.button === 0) focusGraphWindow(win);
    });

    if (workspaceLocked) win.classList.add('locked');

        interact(win).resizable({
        edges: { bottom: true, right: true },
        listeners: {
            start(e) {
                e.target.dataset.resizeStartX = parseFloat(e.target.dataset.x) || 0;
                e.target.dataset.resizeStartY = parseFloat(e.target.dataset.y) || 0;
            },
            move(e) {
                if (workspaceLocked) return;
                
                const x = parseFloat(e.target.dataset.resizeStartX);
                const y = parseFloat(e.target.dataset.resizeStartY);
                
                e.target.style.width = `${e.rect.width}px`;
                e.target.style.height = `${e.rect.height}px`;
                e.target.dataset.x = x;
                e.target.dataset.y = y;
                e.target.style.transform = `translate(${x}px, ${y}px)`;

                savedGraphPositions.set(e.target.id, { x, y, width: e.rect.width, height: e.rect.height });

                const chart = Chart.getChart(e.target.querySelector('canvas'));
                if (chart) {
                    chart.resize();
                    chart.update('none');
                }
            },
            end(e) {
                setTimeout(() => updateGraphStackIndicators(e.target), 50);
            }
        }
    }).draggable({
        listeners: {
            start(e) {
                e.target.classList.add('dragging');
            },
            move: (e) => {
                if (workspaceLocked) return;
                
                let x = (parseFloat(e.target.dataset.x) || 0) + e.dx / panZoom.scale;
                let y = (parseFloat(e.target.dataset.y) || 0) + e.dy / panZoom.scale;
                
                e.target.style.transform = `translate(${x}px, ${y}px)`;
                e.target.dataset.x = x;
                e.target.dataset.y = y;
                
                savedGraphPositions.set(e.target.id, { x, y, width: parseFloat(e.target.style.width), height: parseFloat(e.target.style.height) });
            },
            end(e) {
                e.target.classList.remove('dragging');
            }
        }
    });

    await renderCategoryChart(`canvas-${windowId}`, category);
}

function focusGraph(category) {
    const win = activeGraphWindows.get(category);
    if (!win) return;
    
    const x = parseFloat(win.dataset.x) || 0;
    const y = parseFloat(win.dataset.y) || 0;
    const w = parseFloat(win.style.width) || 900;
    const h = parseFloat(win.style.height) || 300;

    const workspace = document.getElementById('graph-workspace');
    const rect = workspace.getBoundingClientRect();

    const scaleX = (rect.width * 0.7) / w;
    const scaleY = (rect.height * 0.7) / h;
    const targetScale = Math.min(scaleX, scaleY, panZoom.maxScale);

    const cx = x + w / 2;
    const cy = y + h / 2;

    panZoom.scale = targetScale;
    panZoom.offsetX = rect.width / 2 - cx * targetScale;
    panZoom.offsetY = rect.height / 2 - cy * targetScale;

    updateTransform(true);
}

function addStackIndicators(win, chart, canvasId) {
    const canvas = win.querySelector(`#${canvasId}`);
    if (!canvas) return;
    
    win.querySelectorAll('.stack-indicator').forEach(el => el.remove());
    
    const datasets = chart.data.datasets;
    const pointMap = new Map();
    
    datasets.forEach((dataset, datasetIndex) => {
        dataset.data.forEach((point, pointIndex) => {
            const key = `${point.x},${point.y}`;
            if (!pointMap.has(key)) pointMap.set(key, []);
            pointMap.get(key).push({ datasetIndex, pointIndex, point });
        });
    });
    
    pointMap.forEach((points, key) => {
        if (points.length > 1) {
            const meta = chart.getDatasetMeta(points[0].datasetIndex);
            const element = meta.data[points[0].pointIndex];
            
            if (element) {
                const indicator = document.createElement('div');
                indicator.className = 'stack-indicator';
                indicator.textContent = points.length;
                indicator.dataset.chart = canvasId;
                
                const graphContent = win.querySelector('.graph-content');
                indicator.style.left = `${element.x - 9}px`;
                indicator.style.top = `${element.y - 9}px`;
                
                indicator.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const allPoints = points.map(p => p.point);
                    showStackedPopup(e.pageX, e.pageY, allPoints);
                });
                
                graphContent.appendChild(indicator);
            }
        }
    });
}

function addStackedPointIndicators(chart, chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    
    const container = canvas.parentElement;
    container.querySelectorAll(`[data-chart="${chartId}"]`).forEach(el => el.remove());
    
    const datasets = chart.data.datasets;
    const pointMap = new Map();
    
    datasets.forEach((dataset, datasetIndex) => {
        dataset.data.forEach((point, pointIndex) => {
            const key = `${point.x},${point.y}`;
            if (!pointMap.has(key)) pointMap.set(key, []);
            pointMap.get(key).push({ datasetIndex, pointIndex, point });
        });
    });
    
    pointMap.forEach((points, key) => {
        if (points.length > 1) {
            const meta = chart.getDatasetMeta(points[0].datasetIndex);
            const element = meta.data[points[0].pointIndex];
            
            if (element) {
                const indicator = document.createElement('div');
                indicator.className = 'stack-indicator';
                indicator.textContent = points.length;
                indicator.dataset.chart = chartId;
                
                const rect = canvas.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                
                indicator.style.left = `${rect.left - containerRect.left + element.x - 9}px`;
                indicator.style.top = `${rect.top - containerRect.top + element.y - 9}px`;
                indicator.style.position = 'absolute';
                
                indicator.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const allPoints = points.map(p => p.point);
                    showStackedPopup(e.pageX, e.pageY, allPoints);
                });
                
                container.appendChild(indicator);
            }
        }
    });
}

function focusGraphWindow(win) {
    document.querySelectorAll('.graph-window').forEach(w => {
        w.classList.remove('focused');
        w.style.zIndex = 100;
    });
    win.classList.add('focused');
    win.style.zIndex = 200;
    
    const category = Array.from(activeGraphWindows.entries()).find(([k, v]) => v === win)?.[0];
    if (category) {
        document.querySelectorAll('.graph-taskbar-item').forEach(item => item.classList.remove('active'));
        document.getElementById(`graph-taskbar-${category}`)?.classList.add('active');
    }
}

function addGraphToTaskbar(category, title, win) {
    const taskbar = document.getElementById('taskbar-items');
    const item = document.createElement('div');
    item.className = 'taskbar-item graph-taskbar-item active';
    item.id = `graph-taskbar-${category}`;
    item.textContent = title;
    item.addEventListener('click', () => {
        if (win.style.display === 'none') {
            win.style.display = 'flex';
            updateGraphTaskbar(category, true);
            const saved = savedGraphPositions.get(win.id);
            if (saved) {
                win.dataset.x = saved.x; win.dataset.y = saved.y;
                win.style.width = `${saved.width}px`; win.style.height = `${saved.height}px`;
                win.style.transform = `translate(${saved.x}px, ${saved.y}px)`;
            }
            updateGraphStackIndicators(win);
        }
        focusGraph(category);
        focusGraphWindow(win);
    });
    taskbar.appendChild(item);
}

function removeGraphFromTaskbar(category) {
    document.getElementById(`graph-taskbar-${category}`)?.remove();
}

function updateGraphTaskbar(category, active) {
    const item = document.getElementById(`graph-taskbar-${category}`);
    if (item) item.classList.toggle('active', active);
}

async function renderCategoryChart(canvasId, category) {
    if (category === 'climb') {
        await renderClimbHistogram(canvasId);
        return;
    }
    
    const dataPromises = selectedTeams.map(team => 
        fetch(`/api/category_performance/${team}/${category}`).then(r => r.json())
    );
    const teamsData = await Promise.all(dataPromises);
    const colors = ['#5ca8ff', '#ff5252', '#4caf50', '#ffa726', '#ab47bc'];
    
    const datasets = teamsData.map((data, i) => ({
        label: `Team ${selectedTeams[i]}`,
        data: data.map(d => ({ 
            x: d.match, y: d.value,
            notes: d.notes, scouter: d.scouter, team: selectedTeams[i]
        })),
        borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length],
        pointRadius: 5, pointHoverRadius: 7, tension: 0.2
    }));

    const allX = datasets.flatMap(ds => ds.data.map(d => d.x));
    const allY = datasets.flatMap(ds => ds.data.map(d => d.y));
    const maxX = Math.max(...allX, 1);
    const maxY = Math.max(...allY, 5);

    const chart = new Chart(document.getElementById(canvasId), {
        type: 'line', data: { datasets },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            devicePixelRatio: window.devicePixelRatio || 2,
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const el = elements[0];
                    const point = chart.data.datasets[el.datasetIndex].data[el.index];
                    const stacked = getStackedPointsFromChart(chart, point.x, point.y);
                    if (stacked.length > 1) showStackedPopup(e.native.pageX, e.native.pageY, stacked);
                    else showPopup(e.native.pageX, e.native.pageY, point);
                }
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#243447', titleColor: '#5ca8ff', bodyColor: '#ffffff', borderColor: '#5ca8ff',
                    borderWidth: 2, titleFont: { size: 10 }, bodyFont: { size: 9 }, padding: 6, displayColors: false,
                    callbacks: {
                        title: c => `Match ${c[0].parsed.x}`,
                        label: c => [`Team ${c.raw.team}`, `Scouter: ${c.raw.scouter}`]
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear', title: { display: true, text: 'Match', color: '#ffffff', font: { size: 11 } },
                    ticks: { color: '#ffffff', stepSize: 1, callback: v => Math.round(v), font: { size: 10 } },
                    grid: { color: '#3a4a5e' }, min: 0, max: Math.ceil(maxX * 1.1), offset: false
                },
                y: {
                    title: { display: true, text: 'Value', color: '#ffffff', font: { size: 11 } },
                    ticks: { color: '#ffffff', stepSize: 1, callback: v => Math.round(v), font: { size: 10 } },
                    grid: { color: '#3a4a5e' }, min: 0, max: Math.ceil(maxY * 1.1), offset: false, beginAtZero: true
                }
            },
            layout: { padding: { top: 10, right: 10, bottom: 10, left: 10 } }
        }
    });
    
    const win = document.getElementById(canvasId).closest('.graph-window');
    if (win) addStackIndicators(win, chart, canvasId);
}

function getStackedPointsFromChart(chart, x, y) {
    const stacked = [];
    chart.data.datasets.forEach(ds => {
        ds.data.forEach(p => {
            if (p.x === x && p.y === y) stacked.push(p);
        });
    });
    return stacked;
}

async function renderClimbHistogram(canvasId) {
    const dataPromises = selectedTeams.map(team => 
        fetch(`/api/category_performance/${team}/climb`).then(r => r.json())
    );
    const teamsData = await Promise.all(dataPromises);
    const colors = ['#5ca8ff', '#ff5252', '#4caf50', '#ffa726', '#ab47bc'];
    
    const datasets = teamsData.map((data, i) => ({
        label: `Team ${selectedTeams[i]}`,
        data: [data.Parked || 0, data.Shallow || 0, data.Deep || 0, data.None || 0],
        backgroundColor: colors[i % colors.length]
    }));

    new Chart(document.getElementById(canvasId), {
        type: 'bar', data: { labels: ['Parked', 'Shallow', 'Deep', 'None'], datasets },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            devicePixelRatio: window.devicePixelRatio || 2,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#243447', titleColor: '#5ca8ff', bodyColor: '#ffffff', borderColor: '#5ca8ff',
                    borderWidth: 2,
                    callbacks: { label: c => `Team ${selectedTeams[c.datasetIndex]}: ${c.parsed.y} matches` }
                }
            },
            scales: {
                x: { ticks: { color: '#ffffff', font: { size: 10 } }, grid: { color: '#3a4a5e' } },
                y: {
                    title: { display: true, text: 'Count', color: '#ffffff', font: { size: 11 } },
                    ticks: { color: '#ffffff', stepSize: 1, callback: v => Math.round(v), font: { size: 10 } },
                    grid: { color: '#3a4a5e' }, min: 0, beginAtZero: true
                }
            },
            layout: { padding: { top: 10, right: 10, bottom: 10, left: 10 } }
        }
    });
}

function showPopup(x, y, data) {
    document.querySelector('.point-popup')?.remove();
    document.querySelector('.stacked-popup')?.remove();

    const popup = document.createElement('div');
    popup.className = 'point-popup';
    popup.style.left = `${Math.min(x + 10, window.innerWidth - 400)}px`;
    popup.style.top = `${Math.min(y - 50, window.innerHeight - 300)}px`;
    
    popup.innerHTML = `
        <span class="close-popup">×</span>
        <h4>Match #${data.x}</h4>
        <p><strong>Team:</strong> ${data.team}</p>
        <p><strong>Scouter:</strong> ${data.scouter}</p>
        <p><strong>Value:</strong> ${data.y}</p>
        <p><strong>Notes:</strong> ${data.notes}</p>
    `;
    
    document.body.appendChild(popup);

    popup.querySelector('.close-popup').onclick = () => popup.remove();
    
    setTimeout(() => {
        document.addEventListener('click', function close(e) {
            if (!popup.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', close);
            }
        });
    }, 100);
}

function showStackedPopup(x, y, points) {
    document.querySelector('.point-popup')?.remove();
    document.querySelector('.stacked-popup')?.remove();

    const popup = document.createElement('div');
    popup.className = 'stacked-popup';
    popup.style.left = `${Math.min(x + 10, window.innerWidth - 500)}px`;
    popup.style.top = `${Math.min(y - 50, window.innerHeight - 400)}px`;
    
    popup.innerHTML = `
        <span class="close-popup">×</span>
        <h4>Match #${points[0].x} - ${points.length} Teams</h4>
        ${points.map(p => `
            <div class="stacked-point-item">
                <p><strong>Team:</strong> ${p.team}</p>
                <p><strong>Scouter:</strong> ${p.scouter}</p>
                <p><strong>Value:</strong> ${p.y}</p>
                <p><strong>Notes:</strong> ${p.notes}</p>
            </div>
        `).join('')}
    `;
    
    document.body.appendChild(popup);

    popup.querySelector('.close-popup').onclick = () => popup.remove();
    
    setTimeout(() => {
        document.addEventListener('click', function close(e) {
            if (!popup.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', close);
            }
        });
    }, 100);
}

// ==================== RANKINGS ====================
let listCounter = 0;

function initRankings() {
    const addListBtn = document.getElementById('add-list-btn');
    const exportBtn = document.getElementById('export-rankings-btn');
    
    addListBtn.addEventListener('click', () => {
        addRankingList('New Pick List');
        saveRankingsState();
    });
    
    exportBtn.addEventListener('click', exportRankings);
    
    loadTeamPool();
    
    const savedRankings = localStorage.getItem('rankings');
    if (savedRankings) {
        const rankings = JSON.parse(savedRankings);
        rankings.forEach(r => addRankingList(r.title, r.teams));
    } else {
        addRankingList('Overall Pick List');
    }
}

function loadTeamPool() {
    const pool = document.getElementById('rankings-team-pool');
    pool.innerHTML = '';
    
    allTeams.forEach(team => {
        const item = document.createElement('div');
        item.className = 'team-item';
        item.textContent = `${team}`;
        item.dataset.team = team;
        pool.appendChild(item);
    });
    
    new Sortable(pool, {
        group: {
            name: 'shared',
            pull: 'clone',
            put: false
        },
        animation: 200,
        sort: false
    });
}

function addRankingList(title = 'New Pick List', teams = []) {
    const container = document.getElementById('rankings-lists');
    const listId = `list-${listCounter++}`;
    
    const div = document.createElement('div');
    div.className = 'ranking-list';
    div.innerHTML = `
        <input type="text" value="${title}" class="list-title">
        <button class="delete-list-btn">×</button>
        <ul class="team-list" id="${listId}"></ul>
    `;
    
    container.appendChild(div);
    
    const teamList = div.querySelector('.team-list');
    teams.forEach(team => addTeamToList(teamList, team));
    
    new Sortable(teamList, {
        group: 'shared',
        animation: 200,
        handle: '.team-item',
        draggable: '.team-item',
        onAdd(evt) {
            const item = evt.item;
            const teamNum = item.dataset.team;
            item.innerHTML = `<span>${teamNum}</span><button class="team-item-remove">×</button>`;
            item.querySelector('.team-item-remove').onclick = () => {
                item.remove();
                checkDuplicates();
                saveRankingsState();
            };
            checkDuplicates();
            saveRankingsState();
        },
        onUpdate() {
            saveRankingsState();
        },
        onEnd() {
            checkDuplicates();
            saveRankingsState();
        }
    });
    
    div.querySelector('.list-title').addEventListener('input', saveRankingsState);
    div.querySelector('.delete-list-btn').onclick = () => {
        showConfirmation('Are you sure you want to delete this pick list?', () => { 
            div.remove(); 
            saveRankingsState(); 
        });
    };
}

function addTeamToList(teamList, teamNum) {
    const item = document.createElement('li');
    item.className = 'team-item';
    item.dataset.team = teamNum;
    item.innerHTML = `<span>${teamNum}</span><button class="team-item-remove">×</button>`;
    teamList.appendChild(item);
    
    item.querySelector('.team-item-remove').onclick = () => {
        item.remove();
        checkDuplicates();
        saveRankingsState();
    };
}

function checkDuplicates() {
    document.querySelectorAll('.team-item').forEach(item => item.classList.remove('duplicate'));
    document.querySelectorAll('.ranking-list .team-list').forEach(list => {
        const teams = new Map();
        list.querySelectorAll('.team-item').forEach(item => {
            const teamNum = item.dataset.team;
            if (teams.has(teamNum)) {
                item.classList.add('duplicate');
                teams.get(teamNum).classList.add('duplicate');
            } else {
                teams.set(teamNum, item);
            }
        });
    });
}

function saveRankingsState() {
    const rankings = Array.from(document.querySelectorAll('.ranking-list')).map(list => ({
        title: list.querySelector('.list-title').value,
        teams: Array.from(list.querySelectorAll('.team-item')).map(item => item.dataset.team)
    }));
    localStorage.setItem('rankings', JSON.stringify(rankings));
}

function exportRankings() {
    let text = '';
    document.querySelectorAll('.ranking-list').forEach(list => {
        text += `${list.querySelector('.list-title').value}\n`;
        text += '='.repeat(40) + '\n';
        list.querySelectorAll('.team-item').forEach((item, index) => {
            text += `${index + 1}. Team ${item.dataset.team}\n`;
        });
        text += '\n';
    });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'rankings.txt';
    a.click();
    URL.revokeObjectURL(a.href);
}

// ==================== CONFIRMATION MODAL ====================
function showConfirmation(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const messageEl = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');
    
    messageEl.textContent = message;
    modal.style.display = 'flex';
    
    const confirmHandler = () => {
        onConfirm();
        close();
    };
    const cancelHandler = () => close();
    
    function close() {
        modal.style.display = 'none';
        yesBtn.removeEventListener('click', confirmHandler);
        noBtn.removeEventListener('click', cancelHandler);
    }
    
    yesBtn.addEventListener('click', confirmHandler);
    noBtn.addEventListener('click', cancelHandler);
}

// ==================== UPLOAD CONTENT ====================
function initUploadContent() {
    const win = windows['upload'];
    
    // Handle file input
    win.querySelector('#scouting-input').addEventListener('change', e => {
        displayFileList(e.target.files);
    });
    
    // Handle folder input
    win.querySelector('#folder-input').addEventListener('change', e => {
        const txtFiles = Array.from(e.target.files).filter(f => f.name.endsWith('.txt'));
        displayFileList(txtFiles);
    });

    function displayFileList(files) {
        const list = win.querySelector('#file-list');
        list.innerHTML = Array.from(files).map(f => `<div class="file-item">${f.name}</div>`).join('');
    }

    win.querySelector('#scouting-form').addEventListener('submit', async e => {
        e.preventDefault();
        
        // Get files from both inputs
        let files = [];
        const fileInput = win.querySelector('#scouting-input');
        const folderInput = win.querySelector('#folder-input');
        
        if (fileInput.files.length > 0) {
            files = Array.from(fileInput.files);
        } else if (folderInput.files.length > 0) {
            files = Array.from(folderInput.files).filter(f => f.name.endsWith('.txt'));
        }
        
        if (files.length === 0) {
            alert('Please select files or a folder to upload');
            return;
        }
        
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        
        const status = win.querySelector('#scouting-status');
        status.textContent = 'Uploading...';
        status.className = '';
        status.style.display = 'block';
        
        const res = await fetch('/upload-scouting', { method: 'POST', body: formData });
        const data = await res.json();
        
        status.textContent = res.ok ? data.message : data.error;
        status.className = res.ok ? 'success' : 'error';
        
        if (res.ok) {
            e.target.reset();
            win.querySelector('#file-list').innerHTML = '';
            await loadTeams();
            
            // Update all team selectors with new teams
            document.querySelectorAll('.team-select').forEach(select => {
                const current = select.value;
                select.innerHTML = '<option value="">Select team...</option>' + 
                                   allTeams.map(t => `<option value="${t}" ${t == current ? 'selected' : ''}>Team ${t}</option>`).join('');
            });
            
            loadTeamPool();
            updateMainChart();
            updateFloatingGraphs();
        }
    });
}

// ==================== RAW DATA CONTENT ====================
function initRawDataContent() {
    const win = windows['rawdata'];
    win.querySelector('#group-by').addEventListener('change', () => loadRawData(win));
    win.querySelector('#raw-search').addEventListener('input', () => loadRawData(win));
    loadRawData(win);
}

async function loadRawData(win) {
    const res = await fetch('/api/raw_data');
    let data = await res.json();
    
    const table = win.querySelector('#raw-data-table');
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100">No data available</td></tr>';
        return;
    }
    
    const query = (win.querySelector('#raw-search').value || '').toLowerCase().trim();
    const groupBy = win.querySelector('#group-by').value;

    let filteredData = data;
    if (query) {
        filteredData = data.filter(r => {
            if (groupBy !== 'none') {
                return String(r[groupBy] || '').toLowerCase().includes(query);
            }
            return Object.values(r).some(v => String(v || '').toLowerCase().includes(query));
        });
    }

    const columns = Object.keys(data[0]);
    const teamNumIndex = columns.indexOf('teamnum');
    const colMap = {
        autoncoral1: 'AC1', autoncoral2: 'AC2', autoncoral3: 'AC3', autoncoral4: 'AC4',
        telecoral1: 'TC1', telecoral2: 'TC2', telecoral3: 'TC3', telecoral4: 'TC4',
        autonalgaenet: 'AN', autonalgaepro: 'AP', telealgaenet: 'TN', telealgaepro: 'TP',
        scoutername: 'Scouter', matchnum: 'Match', teamnum: 'Team'
    };

    thead.innerHTML = columns.map((col, i) => {
        const label = colMap[col] || col;
        return `<th class="${i === teamNumIndex ? 'sticky-col' : ''}" title="${col}">${label}</th>`;
    }).join('');
    
    if (groupBy === 'none') {
        tbody.innerHTML = filteredData.map(row => 
            `<tr>${columns.map((col, i) => 
                `<td class="${i === teamNumIndex ? 'sticky-col' : ''}">${row[col] ?? ''}</td>`
            ).join('')}</tr>`
        ).join('');
    } else {
        const grouped = filteredData.reduce((acc, row) => {
            const key = row[groupBy] || 'Unknown';
            if (!acc[key]) acc[key] = [];
            acc[key].push(row);
            return acc;
        }, {});
        
        tbody.innerHTML = Object.keys(grouped).sort().map(key => {
            let groupHtml = `<tr class="group-header"><td colspan="${columns.length}">${key}</td></tr>`;
            groupHtml += grouped[key].map(row => 
                `<tr>${columns.map((col, i) => 
                    `<td class="${i === teamNumIndex ? 'sticky-col' : ''}">${row[col] ?? ''}</td>`
                ).join('')}</tr>`
            ).join('');
            return groupHtml;
        }).join('');
    }
}

// ==================== TEAM STATS CONTENT ====================
async function initTeamStatsContent() {
    const win = windows['team-stats'];
    const teamSelect = win.querySelector('#stats-team-select');
    const showNotesBtn = win.querySelector('#stats-show-notes-btn');
    const statsGrid = win.querySelector('#stats-grid');
    const notesView = win.querySelector('#stats-notes-view');
    
    teamSelect.innerHTML = allTeams.map(t => `<option value="${t}">Team ${t}</option>`).join('');
    
    if (allTeams.length === 0) {
        statsGrid.innerHTML = '<p style="padding: 2rem; text-align: center;">No teams available</p>';
        return;
    }
    
    if (selectedTeams.length > 0) {
        teamSelect.value = selectedTeams[0];
    }
    
    await loadTeamStats(teamSelect.value);
    
    teamSelect.addEventListener('change', async () => {
        await loadTeamStats(teamSelect.value);
        if (notesView.style.display !== 'none') {
            await loadTeamNotes(teamSelect.value);
        }
    });
    
    showNotesBtn.addEventListener('click', async () => {
        if (notesView.style.display === 'none') {
            statsGrid.style.display = 'none';
            notesView.style.display = 'block';
            showNotesBtn.textContent = 'Show Graphs';
            await loadTeamNotes(teamSelect.value);
        } else {
            statsGrid.style.display = 'grid';
            notesView.style.display = 'none';
            showNotesBtn.textContent = 'Show Notes';
        }
    });
}

async function loadTeamStats(teamNum) {
    const win = windows['team-stats'];
    const statsGrid = win.querySelector('#stats-grid');
    
    const categories = [
        { key: 'auto_coral_combined', name: 'Auto Coral', type: 'combined', subCategories: ['autoncoral1', 'autoncoral2', 'autoncoral3', 'autoncoral4'] },
        { key: 'tele_coral_combined', name: 'Tele Coral', type: 'combined', subCategories: ['telecoral1', 'telecoral2', 'telecoral3', 'telecoral4'] },
        { key: 'algae_combined', name: 'Algae (Net & Processor)', type: 'combined', subCategories: ['net', 'processor'] },
        { key: 'climb', name: 'Climb', type: 'climb' }
    ];
    
    statsGrid.innerHTML = '';
    
    for (const cat of categories) {
        const card = document.createElement('div');
        card.className = 'stats-card';
        
        card.innerHTML = `
            <h4>${cat.name}</h4>
            <div class="stats-card-content">
                <canvas id="stats-canvas-${cat.key}"></canvas>
            </div>
        `;
        statsGrid.appendChild(card);
        
        await renderStatsChart(`stats-canvas-${cat.key}`, teamNum, cat);
    }
}

async function renderStatsChart(canvasId, teamNum, category) {
    if (category.type === 'climb') {
        const res = await fetch(`/api/category_performance/${teamNum}/climb`);
        const data = await res.json();
        
        new Chart(document.getElementById(canvasId), {
            type: 'bar',
            data: {
                labels: ['Parked', 'Shallow', 'Deep', 'None'],
                datasets: [{
                    data: [data.Parked || 0, data.Shallow || 0, data.Deep || 0, data.None || 0],
                    backgroundColor: '#5ca8ff'
                }]
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                devicePixelRatio: window.devicePixelRatio || 2,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#ffffff', font: { size: 9 } }, grid: { color: '#3a4a5e' } },
                    y: {
                        ticks: { color: '#ffffff', stepSize: 1, callback: v => Math.round(v), font: { size: 9 } },
                        grid: { color: '#3a4a5e' }, min: 0, beginAtZero: true
                    }
                },
                layout: { padding: { top: 5, right: 5, bottom: 5, left: 5 } }
            }
        });
    } else if (category.type === 'combined') {
        const colors = ['#5ca8ff', '#ff5252', '#4caf50', '#ffa726'];
        const dataPromises = category.subCategories.map(subCat => 
            fetch(`/api/category_performance/${teamNum}/${subCat}`).then(r => r.json())
        );
        const allData = await Promise.all(dataPromises);
        
        const datasets = allData.map((data, i) => ({
            label: category.subCategories[i].replace('autoncoral', 'L').replace('telecoral', 'L').replace('net', 'Net').replace('processor', 'Processor'),
            data: data.map(d => ({ x: d.match, y: d.value, notes: d.notes, scouter: d.scouter, team: teamNum })),
            borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length],
            pointRadius: 3, tension: 0.2
        }));
        
        const allX = datasets.flatMap(ds => ds.data.map(d => d.x));
        const allY = datasets.flatMap(ds => ds.data.map(d => d.y));
        const maxX = Math.max(...allX, 1);
        const maxY = Math.max(...allY, 5);
        
        const chart = new Chart(document.getElementById(canvasId), {
            type: 'line', data: { datasets },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                devicePixelRatio: window.devicePixelRatio || 2,
                onClick: (e, elements, chart) => {
                    if (elements.length > 0) {
                        const el = elements[0];
                        const pointData = chart.data.datasets[el.datasetIndex].data[el.index];
                        showPopup(e.native.pageX, e.native.pageY, pointData);
                    }
                },
                plugins: { 
                    legend: { display: true, position: 'top', labels: { color: '#ffffff', font: { size: 8 }, boxWidth: 12, padding: 4 } }
                },
                scales: {
                    x: {
                        type: 'linear', title: { display: true, text: 'Match', color: '#ffffff', font: { size: 9 } },
                        ticks: { color: '#ffffff', stepSize: 1, callback: v => Math.round(v), font: { size: 8 } },
                        grid: { color: '#3a4a5e' }, min: 0, max: Math.ceil(maxX * 1.1), offset: false
                    },
                    y: {
                        title: { display: true, text: 'Value', color: '#ffffff', font: { size: 9 } },
                        ticks: { color: '#ffffff', stepSize: 1, callback: v => Math.round(v), font: { size: 10 } },
                        grid: { color: '#3a4a5e' }, min: 0, max: Math.ceil(maxY * 1.1), offset: false, beginAtZero: true
                    }
                },
                layout: { padding: { top: 5, right: 5, bottom: 5, left: 5 } }
            }
        });
    }
}

async function loadTeamNotes(teamNum) {
    const win = windows['team-stats'];
    const notesView = win.querySelector('#stats-notes-view');
    
    const res = await fetch(`/api/team_performance/${teamNum}`);
    const data = await res.json();
    
    notesView.innerHTML = data.map(match => `
        <div class="note-card">
            <div class="note-header">
                <strong>Match ${match.match}</strong>
                <span>Scouter: ${match.scouter}</span>
            </div>
            <div class="note-body">
                ${match.notes || 'No notes available'}
            </div>
        </div>
    `).join('');
}

function openTeamStats(teamNum) {
    if (windows['team-stats']) {
        showWindow('team-stats');
        const select = windows['team-stats'].querySelector('#stats-team-select');
        select.value = teamNum;
        select.dispatchEvent(new Event('change'));
    } else {
        createWindow('team-stats');
        setTimeout(() => {
            const select = windows['team-stats'].querySelector('#stats-team-select');
            select.value = teamNum;
            select.dispatchEvent(new Event('change'));
        }, 100);
    }
}

// ==================== STATE MANAGEMENT ====================
function saveState() {
    localStorage.setItem('selectedTeams', JSON.stringify(selectedTeams));
    
    const graphPositions = {};
    savedGraphPositions.forEach((pos, id) => {
        graphPositions[id] = pos;
    });
    localStorage.setItem('graphPositions', JSON.stringify(graphPositions));
}

function restoreState() {
    const savedTeams = localStorage.getItem('selectedTeams');
    if (savedTeams) {
        const teams = JSON.parse(savedTeams);
        
        // Clear default selector
        document.getElementById('team-selectors').innerHTML = '';
        
        // Add one selector for each saved team
        if (teams.length > 0) {
            teams.forEach(team => addTeamSelector(team));
        } else {
            addTeamSelector();
        }
        
        updateMainChart();
    }
    
    const savedPositions = localStorage.getItem('graphPositions');
    if (savedPositions) {
        const positions = JSON.parse(savedPositions);
        Object.entries(positions).forEach(([id, pos]) => {
            savedGraphPositions.set(id, pos);
        });
    }
}

window.addEventListener('beforeunload', saveState);