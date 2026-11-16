import * as settingsModule from './settings.js';
import { allPrototypes } from './prototypes.js';

const SETTINGS = settingsModule.VIH_SKEMA_SETTINGS || settingsModule.VIH_SETTINGS || {};
const STORAGE_KEY_CURRENT = 'vih_active_schedule_data';
const STORAGE_KEY_CUSTOM_BLOCKS = 'vih_custom_schedule_blocks';
const STORAGE_KEY_CUSTOM_PROTOS = 'vih_custom_schedule_protos';
const STORAGE_KEY_WISH_PLACEMENTS = 'vih_calendar_wish_placements';
const STORAGE_KEY_CUSTOM_WISHES = 'vih_calendar_custom_wishes';
const STORAGE_KEY_WEEK_OVERRIDES = 'vih_calendar_week_overrides';
const STORAGE_KEY_SIDEBAR_SECTIONS = 'vih_sidebar_sections_state';

const MEAL_TITLES = ['Morgenmad', 'Frokost', 'Aftensmad', 'Aftenforfriskning', 'Formiddagskaffe', 'Eftermiddagskaffe'];
const DEFAULT_TEACHING_TITLES = [
    'Idræt 1', 'Idræt 2', 'Idræt 1/2', 'Kompetencefag', 'Inspirationsfag',
    'DGL', 'Morgensamling', 'Fællessang', 'Connected', 'Højskoleaften'
];
const DAY_LABELS = { man: 'Mandag', tir: 'Tirsdag', ons: 'Onsdag', tor: 'Torsdag', fre: 'Fredag' };
const DAY_SHORT = { man: 'Man', tir: 'Tir', ons: 'Ons', tor: 'Tor', fre: 'Fre' };

// Vite scanner automatisk ./calendars/*.json
const calendarModules = import.meta.glob('./calendars/*.json', { eager: true });
const scannedCalendars = Object.entries(calendarModules)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([path, mod]) => {
        const data = JSON.parse(JSON.stringify(mod.default || mod));
        const fileName = path.split('/').pop().replace(/\.json$/i, '');
        if (!data.id) data.id = fileName;
        if (!data.name) data.name = fileName;
        return data;
    });

// State
let currentSchedule = [];
let currentNotes = "";
let customBlocks = [];
let customPrototypes = [];
let wishPlacementsByCal = {};
let customWishesByCal = {};
let weekOverridesByCal = {};
let sidebarSectionsState = { paletteOpen: true, wishesOpen: true };
let activeProtoId = null;
let currentTitle = "Skemaforslag";
let isModified = false;
let editingEntryId = null;
let editingOverrideContext = null;
let activeTab = 'tab-builder';
let selectedSimWeekIndex = 0;

function startApp() {
    // Sidebar & Accordion DOM
    const sectionPalette = document.getElementById('section-palette');
    const togglePaletteBtn = document.getElementById('toggle-palette-section');
    const paletteBody = document.getElementById('palette-section-body');

    const sectionWishes = document.getElementById('section-wishes');
    const toggleWishesBtn = document.getElementById('toggle-wishes-section');
    const wishesBody = document.getElementById('wishes-section-body');
    const wishesCounterBadge = document.getElementById('wishes-counter-badge');
    const btnNewWish = document.getElementById('btn-new-wish');

    // Øvrige DOM referencer
    const paletteEl = document.getElementById('unified-palette') || document.getElementById('block-palette');
    const timeAxisEl = document.getElementById('time-axis');
    const protoSelect = document.getElementById('prototype-select');
    const btnCopyLink = document.getElementById('btn-copy-link');
    const titleDisplay = document.getElementById('schedule-title-display');
    const notesTextarea = document.getElementById('schedule-notes');
    const statusBadge = document.getElementById('status-badge');
    const statusBadgeText = document.getElementById('status-badge-text');
    const builderStatsBar = document.getElementById('builder-stats-bar');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Rediger brik modal
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const editTitle = document.getElementById('edit-title');
    const editStart = document.getElementById('edit-start');
    const editEnd = document.getElementById('edit-end');
    const editNote = document.getElementById('edit-note');
    const editColor = document.getElementById('edit-color');
    const editUseOverride = document.getElementById('edit-use-override');
    const editIsTeaching = document.getElementById('edit-is-teaching');
    const btnDeleteEntry = document.getElementById('btn-delete-entry');

    // Opret ny brik modal
    const customModal = document.getElementById('custom-block-modal');
    const customTitle = document.getElementById('custom-title');
    const customColor = document.getElementById('custom-color');
    const customDuration = document.getElementById('custom-duration');
    const customIsTeaching = document.getElementById('custom-is-teaching');

    // Wish modal
    const wishModal = document.getElementById('wish-modal');
    const wishForm = document.getElementById('wish-form');
    const wishTitleInput = document.getElementById('wish-title');
    const wishTypeSelect = document.getElementById('wish-type');
    const wishTargetBlockGroup = document.getElementById('wish-target-block-group');
    const wishTargetBlockSelect = document.getElementById('wish-target-block');
    const wishStartInput = document.getElementById('wish-start');
    const wishEndInput = document.getElementById('wish-end');
    const wishPrefWeeksInput = document.getElementById('wish-preferred-weeks');

    // Week override modal
    const overrideModal = document.getElementById('week-override-modal');
    const overrideModalTitle = document.getElementById('override-modal-title');
    const overrideForm = document.getElementById('week-override-form');
    const overrideWeekSelect = document.getElementById('override-week');
    const overrideDaySelect = document.getElementById('override-day');
    const overrideTypeSelect = document.getElementById('override-type');
    const overrideTargetBlockGroup = document.getElementById('override-target-block-group');
    const overrideTargetBlockSelect = document.getElementById('override-target-block');
    const overrideTitleInput = document.getElementById('override-title');
    const overrideStartInput = document.getElementById('override-start');
    const overrideEndInput = document.getElementById('override-end');
    const btnDeleteOverride = document.getElementById('btn-delete-override');

    // Skema-handlinger
    const btnDeleteProto = document.getElementById('btn-delete-proto');
    const btnSaveProto = document.getElementById('btn-save-proto');
    const btnInsertMeals = document.getElementById('btn-insert-meals');
    const btnClearSchedule = document.getElementById('btn-clear-schedule');
    const btnNewBlock = document.getElementById('btn-new-block');
    const btnExportJson = document.getElementById('btn-export-json');
    const btnExportImage = document.getElementById('btn-export-image');
    const scheduleCardActions = document.getElementById('schedule-card-actions');

    // Simulator DOM
    const semesterSelect = document.getElementById('semester-select');
    const simUseBuffer = document.getElementById('sim-use-buffer');
    const simProtoName = document.getElementById('sim-proto-name');
    const simKpiRow = document.getElementById('sim-kpi-row');
    const simWishesContainer = document.getElementById('sim-wishes-container');
    const btnResetWishes = document.getElementById('btn-reset-wishes');
    const btnResetCalendarOverrides = document.getElementById('btn-reset-calendar-overrides');
    const btnExportCalendarJson = document.getElementById('btn-export-calendar-json');
    const semesterStatsContainer = document.getElementById('semester-stats-container');
    const semesterTableContainer = document.getElementById('semester-table-container');
    const simWeekSelect = document.getElementById('sim-week-select');
    const btnPrevWeek = document.getElementById('btn-prev-week');
    const btnNextWeek = document.getElementById('btn-next-week');
    const btnAddWeekOverride = document.getElementById('btn-add-week-override');
    const simWeekDetail = document.getElementById('sim-week-detail');
    const btnExportSimImage = document.getElementById('btn-export-sim-image');

    // --- OPT-IN UNDERVISNINGSHJÆLPER ---
    function isEntryTeaching(entry) {
        if (!entry) return false;
        if (typeof entry.isTeaching === 'boolean') return entry.isTeaching;
        const allBlocks = [
            ...(SETTINGS.defaultBlocks || []),
            ...customBlocks,
            ...(SETTINGS.mealBlocks || [])
        ];
        const blockDef = allBlocks.find(b => b.title === entry.title);
        if (blockDef && typeof blockDef.isTeaching === 'boolean') return blockDef.isTeaching;
        return DEFAULT_TEACHING_TITLES.includes(entry.title);
    }

    function isBlockTitleTeaching(title) {
        return isEntryTeaching({ title });
    }

    // --- SIDEBAR ACCORDION HJÆLPERE ---
    function setSectionOpen(sectionEl, headerEl, bodyEl, isOpen) {
        if (!sectionEl || !bodyEl) return;
        sectionEl.classList.toggle('is-collapsed', !isOpen);
        bodyEl.style.display = isOpen ? 'block' : 'none';
        if (headerEl) headerEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function saveSidebarSectionsState() {
        localStorage.setItem(STORAGE_KEY_SIDEBAR_SECTIONS, JSON.stringify(sidebarSectionsState));
    }

    if (togglePaletteBtn && sectionPalette && paletteBody) {
        const handleTogglePalette = (e) => {
            if (e.target.closest('#btn-new-block')) return;
            sidebarSectionsState.paletteOpen = !sidebarSectionsState.paletteOpen;
            setSectionOpen(sectionPalette, togglePaletteBtn, paletteBody, sidebarSectionsState.paletteOpen);
            saveSidebarSectionsState();
        };
        togglePaletteBtn.addEventListener('click', handleTogglePalette);
        togglePaletteBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTogglePalette(e);
            }
        });
    }

    if (toggleWishesBtn && sectionWishes && wishesBody) {
        const handleToggleWishes = (e) => {
            if (e.target.closest('#btn-reset-wishes') || e.target.closest('#btn-new-wish')) return;
            sidebarSectionsState.wishesOpen = !sidebarSectionsState.wishesOpen;
            setSectionOpen(sectionWishes, toggleWishesBtn, wishesBody, sidebarSectionsState.wishesOpen);
            saveSidebarSectionsState();
        };
        toggleWishesBtn.addEventListener('click', handleToggleWishes);
        toggleWishesBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleWishes(e);
            }
        });
    }

    // --- URL- & KNAP-HJÆLPERE ---
    function updateActionButtonsVisibility() {
        const isCustom = Boolean(activeProtoId && activeProtoId.startsWith('custom_proto_'));
        const isOfficial = Boolean(
            activeProtoId &&
            !isCustom &&
            SETTINGS.prototypes &&
            SETTINGS.prototypes.some(p => p.id === activeProtoId)
        );
        if (btnDeleteProto) btnDeleteProto.style.display = isCustom ? 'inline-block' : 'none';
        if (btnCopyLink) btnCopyLink.style.display = isOfficial ? 'inline-block' : 'none';
    }

    function findPrototypeByQuery(query) {
        if (!query) return null;
        const q = query.trim().toLowerCase();
        return SETTINGS.prototypes.find(p =>
            (p.id && p.id.toLowerCase() === q) ||
            (p._fileName && p._fileName.toLowerCase() === q) ||
            (p.name && p.name.toLowerCase() === q)
        ) || customPrototypes.find(p =>
            (p.id && p.id.toLowerCase() === q) ||
            (p.name && p.name.toLowerCase() === q)
        ) || null;
    }

    function syncUrlState() {
        const url = new URL(window.location.href);
        if (activeProtoId && !activeProtoId.startsWith('custom_proto_')) {
            url.searchParams.set('skema', activeProtoId);
        } else {
            url.searchParams.delete('skema');
            url.searchParams.delete('proto');
        }

        if (activeTab === 'tab-semester') {
            url.searchParams.set('tab', 'semester');
            if (semesterSelect && semesterSelect.value) {
                url.searchParams.set('semester', semesterSelect.value);
            }
            const cal = getActiveCalendar();
            if (cal && cal.weeks && cal.weeks[selectedSimWeekIndex]) {
                url.searchParams.set('uge', cal.weeks[selectedSimWeekIndex].week);
            }
        } else {
            url.searchParams.delete('tab');
            url.searchParams.delete('semester');
            url.searchParams.delete('uge');
        }
        window.history.replaceState({}, '', url);
    }

    // --- FANESKIFT ---
    function switchTab(targetTab) {
        activeTab = targetTab;
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === targetTab));
        tabPanes.forEach(p => p.style.display = p.id === targetTab ? 'block' : 'none');
        syncUrlState();
        renderSemesterSimulation();
    }

    tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    // --- 1. INITIALISERING ---
    function init() {
        loadFromStorage();

        setSectionOpen(sectionPalette, togglePaletteBtn, paletteBody, sidebarSectionsState.paletteOpen);
        setSectionOpen(sectionWishes, toggleWishesBtn, wishesBody, sidebarSectionsState.wishesOpen);

        buildTimeAxis();
        populateSemesterDropdown();

        SETTINGS.prototypes = allPrototypes;
        updateProtoDropdown();

        const urlParams = new URLSearchParams(window.location.search);
        const linkedQuery = urlParams.get('skema') || urlParams.get('proto');
        const linkedProto = findPrototypeByQuery(linkedQuery);

        const validProto = linkedProto ||
                           SETTINGS.prototypes.find(p => p.id === activeProtoId) ||
                           customPrototypes.find(p => p.id === activeProtoId);

        if (validProto) {
            loadPrototype(validProto.id, false);
        } else if (SETTINGS.prototypes.length > 0) {
            loadPrototype(SETTINGS.prototypes[0].id, false);
        } else {
            updateActionButtonsVisibility();
            renderSchedule();
        }

        const reqSem = urlParams.get('semester');
        if (reqSem && semesterSelect && Array.from(semesterSelect.options).some(o => o.value === reqSem)) {
            semesterSelect.value = reqSem;
        }

        const reqWeek = parseInt(urlParams.get('uge'), 10);
        const cal = getActiveCalendar();
        if (cal && !isNaN(reqWeek)) {
            const wIdx = cal.weeks.findIndex(w => w.week === reqWeek);
            if (wIdx !== -1) selectedSimWeekIndex = wIdx;
        }

        const reqTab = urlParams.get('tab');
        if (reqTab === 'semester') {
            switchTab('tab-semester');
        } else {
            switchTab('tab-builder');
        }

        renderPaletteAndStats();
        setupDragAndDrop();
    }

    function buildTimeAxis() {
        if (!timeAxisEl) return;
        timeAxisEl.innerHTML = '';

        const headerSpacer = document.createElement('div');
        headerSpacer.className = 'time-axis-header';
        timeAxisEl.appendChild(headerSpacer);

        const { startHour, endHour, pixelPerHour } = SETTINGS.timeline || { startHour: 7, endHour: 22, pixelPerHour: 48 };

        for (let hour = startHour; hour < endHour; hour++) {
            const tick = document.createElement('div');
            tick.className = 'time-tick';
            tick.style.height = `${pixelPerHour}px`;

            const label = document.createElement('span');
            label.className = 'time-tick-label';
            label.textContent = `${String(hour).padStart(2, '0')}:00`;
            tick.appendChild(label);

            timeAxisEl.appendChild(tick);
        }

        const lastTick = document.createElement('div');
        lastTick.className = 'time-tick-last';
        const lastLabel = document.createElement('span');
        lastLabel.className = 'time-tick-label';
        lastLabel.textContent = `${String(endHour).padStart(2, '0')}:00`;
        lastTick.appendChild(lastLabel);
        timeAxisEl.appendChild(lastTick);
    }

    function setModifiedState(modified) {
        isModified = modified;
        if (statusBadge && statusBadgeText) {
            if (isModified) {
                statusBadge.className = 'status-badge status-modified';
                statusBadgeText.textContent = '✏️ Kladde (ugemt ændring)';
            } else {
                statusBadge.className = 'status-badge status-saved';
                statusBadgeText.textContent = '★ Skabelon aktiv';
            }
        }
        updateActionButtonsVisibility();
        renderSemesterSimulation();
    }

    // --- 2. FARVELOGIK ---
    function getBlockColors(entry) {
        if (entry.colorOverride && entry.overrideColor) {
            return { color: entry.overrideColor, textColor: entry.overrideTextColor || '#ffffff' };
        }
        const defaultBlocks = SETTINGS.defaultBlocks || [];
        const mealBlocks = SETTINGS.mealBlocks || [];
        const allBlocks = [...defaultBlocks, ...customBlocks, ...mealBlocks];
        const paletteMatch = allBlocks.find(b => b.title === entry.title);
        if (paletteMatch) {
            return { color: paletteMatch.color, textColor: paletteMatch.textColor || '#ffffff' };
        }
        return { color: entry.color || '#cbd5e1', textColor: entry.textColor || '#0f172a' };
    }

    // --- 3. PALETTE & STATISTIK PÅ SKEMABYGGEREN ---
    function renderPaletteAndStats() {
        const counts = {};
        let totalTeachingMin = 0;
        let totalNonTeachingMin = 0;

        currentSchedule.forEach(entry => {
            const dur = Math.max(timeToMinutes(entry.end) - timeToMinutes(entry.start), 0);
            if (!counts[entry.title]) counts[entry.title] = { count: 0, totalMin: 0 };
            counts[entry.title].count += 1;
            counts[entry.title].totalMin += dur;

            if (isEntryTeaching(entry)) {
                totalTeachingMin += dur;
            } else {
                totalNonTeachingMin += dur;
            }
        });

        if (paletteEl) {
            paletteEl.innerHTML = '';
            const allBlocks = [...(SETTINGS.defaultBlocks || []), ...customBlocks];

            allBlocks.forEach(b => {
                const stat = counts[b.title] || { count: 0, totalMin: 0 };
                const hours = Math.floor(stat.totalMin / 60);
                const mins = stat.totalMin % 60;
                const timeStr = stat.totalMin > 0 ? `${hours}t ${mins > 0 ? mins + 'm' : ''}` : '0t';

                const card = document.createElement('div');
                card.className = 'palette-card';
                card.draggable = true;
                card.title = isBlockTitleTeaching(b.title) ? 'Tæller med som undervisning' : 'Rammer / ikke-undervisning';

                card.innerHTML = `
                    <div class="palette-card-left" style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <span class="palette-color-dot" style="width: 12px; height: 12px; border-radius: 50%; background-color: ${b.color}; display: inline-block;"></span>
                        <span class="palette-name" style="font-weight: 700; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.title}</span>
                    </div>
                    <div class="palette-card-right" style="display: flex; align-items: baseline; gap: 4px; flex-shrink: 0;">
                        <span class="badge-count" style="font-weight: 800; font-size: 0.8rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${stat.count}x</span>
                        <span class="badge-time" style="font-size: 0.72rem; color: #64748b;">${timeStr}</span>
                    </div>
                `;

                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                        title: b.title,
                        color: b.color,
                        textColor: b.textColor || '#ffffff',
                        defaultDuration: b.defaultDuration || 90,
                        isTeaching: isBlockTitleTeaching(b.title)
                    }));
                });

                paletteEl.appendChild(card);
            });
        }

        if (builderStatsBar) {
            const teachingHours = (totalTeachingMin / 60).toFixed(1);
            const nonTeachingHours = (totalNonTeachingMin / 60).toFixed(1);
            const meetsRequirement = parseFloat(teachingHours) >= 21;

            builderStatsBar.innerHTML = `
                <div style="background: ${meetsRequirement ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${meetsRequirement ? '#bbf7d0' : '#fecaca'}; color: ${meetsRequirement ? '#166534' : '#991b1b'}; padding: 4px 10px; border-radius: 6px; font-weight: 700;">
                    🎓 Reel undervisning: ${teachingHours} timer <small style="font-weight:normal;">· Lovkrav min. 21 klokketimer</small>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; padding: 4px 10px; border-radius: 6px; font-weight: 600;">
                    🧹 Rammer & møder: ${nonTeachingHours} timer
                </div>
            `;
        }
    }

    // --- 4. DRAG FRA PALETTE TIL SKEMA ---
    function setupDragAndDrop() {
        const dayBodies = document.querySelectorAll('.day-body');
        dayBodies.forEach(col => {
            col.addEventListener('dragover', (e) => {
                e.preventDefault();
                col.style.backgroundColor = 'rgba(56, 189, 248, 0.08)';
            });

            col.addEventListener('dragleave', () => { col.style.backgroundColor = ''; });

            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.style.backgroundColor = '';

                const raw = e.dataTransfer.getData('text/plain');
                if (!raw) return;

                const blockData = JSON.parse(raw);
                const dayKey = col.id.replace('day-', '');

                const rect = col.getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                const minutesFromTop = (offsetY / SETTINGS.timeline.pixelPerHour) * 60;
                const rawTotalMinutes = SETTINGS.timeline.startHour * 60 + minutesFromTop;

                const roundedMinutes = Math.round(rawTotalMinutes / 5) * 5;
                const startStr = minutesToTime(roundedMinutes);
                const endStr = minutesToTime(roundedMinutes + blockData.defaultDuration);

                currentSchedule.push({
                    id: 'entry_' + Date.now(),
                    day: dayKey,
                    title: blockData.title,
                    start: startStr,
                    end: endStr,
                    color: blockData.color,
                    textColor: blockData.textColor,
                    isTeaching: Boolean(blockData.isTeaching),
                    note: '',
                    colorOverride: false,
                    overrideColor: ''
                });

                setModifiedState(true);
                saveState();
                renderSchedule();
            });
        });
    }

    // --- 5. RENDER SKEMA PÅ TIDSLINJEN ---
    function renderSchedule() {
        ['man', 'tir', 'ons', 'tor', 'fre'].forEach(d => {
            const body = document.getElementById(`day-${d}`);
            if (body) body.innerHTML = '';
        });

        const { startHour, pixelPerHour } = SETTINGS.timeline || { startHour: 7, pixelPerHour: 48 };
        const timelineStartMinutes = startHour * 60;

        currentSchedule.forEach(entry => {
            const dayBody = document.getElementById(`day-${entry.day}`);
            if (!dayBody) return;

            const startMin = timeToMinutes(entry.start);
            const endMin = timeToMinutes(entry.end);
            const duration = Math.max(endMin - startMin, 15);

            const topPx = ((startMin - timelineStartMinutes) / 60) * pixelPerHour;
            const heightPx = (duration / 60) * pixelPerHour;
            const { color, textColor } = getBlockColors(entry);

            const blockEl = document.createElement('div');
            blockEl.className = 'schedule-block';
            blockEl.dataset.entryId = entry.id;
            blockEl.style.top = `${topPx}px`;
            blockEl.style.height = `${heightPx}px`;
            blockEl.style.backgroundColor = color;
            blockEl.style.color = textColor;

            blockEl.innerHTML = `
                <div class="block-header-line">
                    <span class="block-title">${entry.title}</span>
                    <button type="button" class="block-close-btn" title="Fjern lektion">&times;</button>
                </div>
                <span class="block-time">${entry.start} - ${entry.end}</span>
                ${entry.note ? `<span class="block-note">${entry.note}</span>` : ''}
                <div class="block-resize-handle" title="Træk for at forlænge/forkorte"></div>
            `;

            blockEl.querySelector('.block-close-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                currentSchedule = currentSchedule.filter(item => item.id !== entry.id);
                setModifiedState(true);
                saveState();
                renderSchedule();
            });

            attachDragAndResize(blockEl, entry);
            dayBody.appendChild(blockEl);
        });

        renderPaletteAndStats();
    }

    // --- 6. FLYT BRIKKER & FORLÆNG/FORKORT ---
    function attachDragAndResize(blockEl, entry) {
        const resizeHandle = blockEl.querySelector('.block-resize-handle');
        const timeDisplay = blockEl.querySelector('.block-time');
        const { startHour, endHour, pixelPerHour } = SETTINGS.timeline;
        const timelineStartMin = startHour * 60;
        const timelineEndMin = endHour * 60;

        resizeHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            blockEl.classList.add('is-resizing');

            const startY = e.clientY;
            const initialStartMin = timeToMinutes(entry.start);
            const initialEndMin = timeToMinutes(entry.end);
            let latestEndMin = initialEndMin;

            function onPointerMove(moveEvent) {
                const deltaY = moveEvent.clientY - startY;
                const deltaMinutes = (deltaY / pixelPerHour) * 60;
                const snappedDelta = Math.round(deltaMinutes / 5) * 5;

                latestEndMin = initialEndMin + snappedDelta;
                latestEndMin = Math.max(initialStartMin + 15, Math.min(timelineEndMin, latestEndMin));

                const currentDuration = latestEndMin - initialStartMin;
                blockEl.style.height = `${(currentDuration / 60) * pixelPerHour}px`;
                timeDisplay.textContent = `${entry.start} - ${minutesToTime(latestEndMin)}`;
            }

            function onPointerUp() {
                blockEl.classList.remove('is-resizing');
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);

                if (latestEndMin !== initialEndMin) {
                    entry.end = minutesToTime(latestEndMin);
                    setModifiedState(true);
                    saveState();
                    renderSchedule();
                }
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });

        blockEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.block-close-btn') || e.target.closest('.block-resize-handle')) return;

            const startX = e.clientX;
            const startY = e.clientY;
            const initialStartMin = timeToMinutes(entry.start);
            const initialEndMin = timeToMinutes(entry.end);
            const duration = initialEndMin - initialStartMin;

            let hasMoved = false;
            let latestStartMin = initialStartMin;
            let latestEndMin = initialEndMin;
            let currentTargetDay = entry.day;

            const dayColumns = ['man', 'tir', 'ons', 'tor', 'fre'].map(d => {
                const bodyEl = document.getElementById(`day-${d}`);
                return {
                    day: d,
                    body: bodyEl,
                    rect: bodyEl ? bodyEl.getBoundingClientRect() : null
                };
            }).filter(c => c.body && c.rect);

            function onPointerMove(moveEvent) {
                const deltaX = moveEvent.clientX - startX;
                const deltaY = moveEvent.clientY - startY;

                if (Math.abs(deltaY) > 3 || Math.abs(deltaX) > 3) {
                    hasMoved = true;
                    blockEl.classList.add('is-dragging');
                }
                if (!hasMoved) return;

                const deltaMinutes = (deltaY / pixelPerHour) * 60;
                const snappedDelta = Math.round(deltaMinutes / 5) * 5;

                latestStartMin = initialStartMin + snappedDelta;
                latestStartMin = Math.max(timelineStartMin, Math.min(timelineEndMin - duration, latestStartMin));
                latestEndMin = latestStartMin + duration;

                blockEl.style.top = `${((latestStartMin - timelineStartMin) / 60) * pixelPerHour}px`;
                timeDisplay.textContent = `${minutesToTime(latestStartMin)} - ${minutesToTime(latestEndMin)}`;

                const targetCol = dayColumns.find(c => moveEvent.clientX >= c.rect.left && moveEvent.clientX <= c.rect.right);
                if (targetCol && targetCol.day !== currentTargetDay) {
                    currentTargetDay = targetCol.day;
                    targetCol.body.appendChild(blockEl);
                }

                dayColumns.forEach(c => {
                    c.body.style.backgroundColor = (c.day === currentTargetDay && currentTargetDay !== entry.day)
                        ? 'rgba(56, 189, 248, 0.12)'
                        : '';
                });
            }

            function onPointerUp() {
                blockEl.classList.remove('is-dragging');
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);

                dayColumns.forEach(c => { c.body.style.backgroundColor = ''; });

                if (hasMoved) {
                    entry.start = minutesToTime(latestStartMin);
                    entry.end = minutesToTime(latestEndMin);
                    entry.day = currentTargetDay;
                    setModifiedState(true);
                    saveState();
                    renderSchedule();
                } else {
                    openEditModal(entry);
                }
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
    }

    // --- 7. REDIGER LEKTION MODAL ---
    function openEditModal(entry) {
        if (!editModal) return;
        editingEntryId = entry.id;
        editTitle.value = entry.title;
        editStart.value = entry.start;
        editEnd.value = entry.end;
        editNote.value = entry.note || '';

        const currentEffectiveColors = getBlockColors(entry);
        editColor.value = entry.colorOverride && entry.overrideColor ? entry.overrideColor : currentEffectiveColors.color;
        editUseOverride.checked = !!entry.colorOverride;
        if (editIsTeaching) editIsTeaching.checked = isEntryTeaching(entry);

        editModal.showModal();
    }

    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const entry = currentSchedule.find(item => item.id === editingEntryId);
            if (entry) {
                entry.title = editTitle.value.trim();
                entry.start = editStart.value;
                entry.end = editEnd.value;
                entry.note = editNote.value.trim();

                if (editIsTeaching) {
                    entry.isTeaching = editIsTeaching.checked;
                }

                entry.colorOverride = editUseOverride.checked;
                if (entry.colorOverride) {
                    entry.overrideColor = editColor.value;
                    entry.overrideTextColor = '#ffffff';
                } else {
                    entry.overrideColor = '';
                }

                setModifiedState(true);
                saveState();
                renderSchedule();
            }
            editModal.close();
        });
    }

    if (btnDeleteEntry) {
        btnDeleteEntry.addEventListener('click', () => {
            currentSchedule = currentSchedule.filter(item => item.id !== editingEntryId);
            setModifiedState(true);
            saveState();
            renderSchedule();
            editModal.close();
        });
    }

    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const btnCloseEdit = document.getElementById('btn-close-edit');
    if (btnCancelEdit && editModal) btnCancelEdit.addEventListener('click', () => editModal.close());
    if (btnCloseEdit && editModal) btnCloseEdit.addEventListener('click', () => editModal.close());
    if (editModal) editModal.addEventListener('click', (e) => { if (e.target === editModal) editModal.close(); });

    // --- 8. PROTOTYPE DROPDOWN, LINKS & SKEMA-HANDLINGER ---
    function updateProtoDropdown() {
        if (!protoSelect) return;
        protoSelect.innerHTML = '<option value="">-- Vælg foruddefineret skema --</option>';

        if (SETTINGS.prototypes && SETTINGS.prototypes.length > 0) {
            const groupsMap = {};
            SETTINGS.prototypes.forEach((p, idx) => {
                const grpName = p.group || 'Faste skabeloner';
                if (!groupsMap[grpName]) {
                    groupsMap[grpName] = { name: grpName, order: p._folderOrder !== undefined ? p._folderOrder : 999, items: [] };
                }
                groupsMap[grpName].items.push({
                    id: p.id || `builtin_${idx}`,
                    name: String(p.name || 'Uden navn'),
                    order: p.order !== undefined ? p.order : idx
                });
            });

            const sortedGroups = Object.values(groupsMap).sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
            });

            sortedGroups.forEach(grp => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = `── ${grp.name} ──`;
                grp.items.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
                grp.items.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    optgroup.appendChild(opt);
                });
                protoSelect.appendChild(optgroup);
            });
        }

        if (customPrototypes && customPrototypes.length > 0) {
            const userGroup = document.createElement('optgroup');
            userGroup.label = '── Mine egne forslag ──';
            customPrototypes.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || 'Uden navn';
                userGroup.appendChild(opt);
            });
            protoSelect.appendChild(userGroup);
        }

        protoSelect.value = activeProtoId || "";
        updateActionButtonsVisibility();
    }

    function loadPrototype(id, markModified = false) {
        let proto = SETTINGS.prototypes.find(p => p.id === id) || customPrototypes.find(p => p.id === id);
        if (proto) {
            activeProtoId = proto.id;
            currentTitle = proto.name;
            currentSchedule = JSON.parse(JSON.stringify(proto.schedule || []));
            currentNotes = proto.notes || "";
            if (notesTextarea) notesTextarea.value = currentNotes;
            if (titleDisplay) titleDisplay.textContent = currentTitle;

            syncUrlState();
            setModifiedState(markModified);
            updateProtoDropdown();
            saveState();
            renderSchedule();
        }
    }

    if (protoSelect) {
        protoSelect.addEventListener('change', (e) => {
            if (e.target.value) loadPrototype(e.target.value, false);
        });
    }

    if (btnCopyLink) {
        btnCopyLink.addEventListener('click', async () => {
            if (!activeProtoId || activeProtoId.startsWith('custom_proto_')) return;
            syncUrlState();
            try {
                await navigator.clipboard.writeText(window.location.href);
                const orig = btnCopyLink.textContent;
                btnCopyLink.textContent = '✅ Kopieret!';
                setTimeout(() => { btnCopyLink.textContent = orig; }, 2000);
            } catch (err) {
                prompt('Kopiér dette link:', window.location.href);
            }
        });
    }

    if (btnDeleteProto) {
        btnDeleteProto.addEventListener('click', () => {
            if (!activeProtoId || !activeProtoId.startsWith('custom_proto_')) return;
            const p = customPrototypes.find(item => item.id === activeProtoId);
            if (confirm(`Vil du slette forslaget "${p ? p.name : 'dette'}" permanent?`)) {
                customPrototypes = customPrototypes.filter(item => item.id !== activeProtoId);
                localStorage.setItem(STORAGE_KEY_CUSTOM_PROTOS, JSON.stringify(customPrototypes));
                activeProtoId = null;
                if (SETTINGS.prototypes && SETTINGS.prototypes.length > 0) {
                    loadPrototype(SETTINGS.prototypes[0].id, false);
                } else {
                    currentSchedule = [];
                    currentTitle = "Skemaforslag";
                    syncUrlState();
                    setModifiedState(false);
                    updateProtoDropdown();
                    saveState();
                    renderSchedule();
                }
            }
        });
    }

    if (btnSaveProto) {
        btnSaveProto.addEventListener('click', () => {
            const name = prompt('Hvad skal dit skemaforslag hedde?', currentTitle !== 'Skemaforslag' ? currentTitle : 'Mit nye forslag');
            if (!name || !name.trim()) return;
            const newProto = {
                id: 'custom_proto_' + Date.now(),
                name: name.trim(),
                notes: notesTextarea ? notesTextarea.value : '',
                schedule: JSON.parse(JSON.stringify(currentSchedule))
            };
            customPrototypes.push(newProto);
            localStorage.setItem(STORAGE_KEY_CUSTOM_PROTOS, JSON.stringify(customPrototypes));
            activeProtoId = newProto.id;
            currentTitle = newProto.name;
            if (titleDisplay) titleDisplay.textContent = currentTitle;

            syncUrlState();
            setModifiedState(false);
            updateProtoDropdown();
            saveState();
        });
    }

    if (btnInsertMeals) {
        btnInsertMeals.addEventListener('click', () => {
            ['man', 'tir', 'ons', 'tor', 'fre'].forEach(day => {
                (SETTINGS.mealBlocks || []).forEach(meal => {
                    if (!currentSchedule.some(item => item.day === day && item.title === meal.title)) {
                        currentSchedule.push({
                            id: 'meal_' + day + '_' + meal.title + '_' + Date.now(),
                            day,
                            title: meal.title,
                            start: meal.start,
                            end: meal.end,
                            color: meal.color,
                            textColor: meal.textColor,
                            isTeaching: Boolean(meal.isTeaching),
                            note: ''
                        });
                    }
                });
            });
            setModifiedState(true);
            saveState();
            renderSchedule();
        });
    }

    if (btnClearSchedule) {
        btnClearSchedule.addEventListener('click', () => {
            if (confirm('Vil du rydde alle lektioner i skemaet?')) {
                currentSchedule = [];
                setModifiedState(true);
                saveState();
                renderSchedule();
            }
        });
    }

    if (notesTextarea) {
        notesTextarea.addEventListener('input', () => {
            currentNotes = notesTextarea.value;
            setModifiedState(true);
            saveState();
        });
    }

    document.querySelector('.editable-title-wrapper')?.addEventListener('click', () => {
        const newName = prompt('Omdøb dette skemaforslag:', currentTitle);
        if (!newName || !newName.trim()) return;
        currentTitle = newName.trim();
        if (titleDisplay) titleDisplay.textContent = currentTitle;
        if (activeProtoId && activeProtoId.startsWith('custom_proto_')) {
            const p = customPrototypes.find(item => item.id === activeProtoId);
            if (p) p.name = currentTitle;
            localStorage.setItem(STORAGE_KEY_CUSTOM_PROTOS, JSON.stringify(customPrototypes));
            updateProtoDropdown();
        }
        setModifiedState(true);
        saveState();
    });

    if (btnNewBlock && customModal) {
        btnNewBlock.addEventListener('click', (e) => {
            e.stopPropagation();
            if (customIsTeaching) customIsTeaching.checked = true;
            customModal.showModal();
        });
        const btnCancelCustomBlock = document.getElementById('btn-cancel-custom-block');
        if (btnCancelCustomBlock) btnCancelCustomBlock.addEventListener('click', () => customModal.close());
        customModal.addEventListener('click', (e) => { if (e.target === customModal) customModal.close(); });

        const customBlockForm = document.getElementById('custom-block-form');
        if (customBlockForm) {
            customBlockForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const title = customTitle.value.trim();
                if (!title) return;
                customBlocks.push({
                    id: 'cb_' + Date.now(),
                    title,
                    color: customColor.value,
                    textColor: '#ffffff',
                    defaultDuration: parseInt(customDuration.value, 10),
                    isTeaching: customIsTeaching ? customIsTeaching.checked : true
                });
                localStorage.setItem(STORAGE_KEY_CUSTOM_BLOCKS, JSON.stringify(customBlocks));
                renderPaletteAndStats();
                customTitle.value = '';
                customModal.close();
            });
        }
    }

    if (btnExportJson) {
        btnExportJson.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify({
                id: 'proto_' + Date.now(),
                name: currentTitle,
                notes: notesTextarea ? notesTextarea.value : "",
                schedule: currentSchedule
            }, null, 4)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${currentTitle.replace(/[^a-z0-9æøå]/gi, '_').toLowerCase()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    if (btnExportImage) {
        btnExportImage.addEventListener('click', () => {
            const target = document.getElementById('export-target');
            if (!target || typeof window.html2canvas !== 'function') return;
            if (scheduleCardActions) scheduleCardActions.style.display = 'none';
            window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
                if (scheduleCardActions) scheduleCardActions.style.display = 'flex';
                const a = document.createElement('a');
                a.download = `${currentTitle.replace(/\s+/g, '_')}_VIH.png`;
                a.href = canvas.toDataURL('image/png');
                a.click();
            }).catch(() => { if (scheduleCardActions) scheduleCardActions.style.display = 'flex'; });
        });
    }

    // --- 9. SEMESTER SIMULATOR, BRUTTOLISTE & DIREKTE UGE-OVERRIDES ---
    function populateSemesterDropdown() {
        if (!semesterSelect) return;
        semesterSelect.innerHTML = '';
        if (scannedCalendars.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Ingen filer i /calendars/';
            semesterSelect.appendChild(opt);
            return;
        }
        scannedCalendars.forEach(cal => {
            const opt = document.createElement('option');
            opt.value = cal.id;
            opt.textContent = cal.name;
            semesterSelect.appendChild(opt);
        });
    }

    function hasLocalCalendarEdits(calId) {
        const extraPlacements = wishPlacementsByCal[calId] || [];
        const extraWishes = customWishesByCal[calId] || [];
        const ov = weekOverridesByCal[calId] || { added: [], removed: [] };
        return extraPlacements.length > 0 || extraWishes.length > 0 || (ov.added && ov.added.length > 0) || (ov.removed && ov.removed.length > 0);
    }

    function getActiveCalendar() {
        if (!semesterSelect || scannedCalendars.length === 0) return null;
        const baseCal = scannedCalendars.find(c => c.id === semesterSelect.value) || scannedCalendars[0];
        if (!baseCal) return null;

        const cal = JSON.parse(JSON.stringify(baseCal));
        if (!cal.wishes) cal.wishes = [];

        // Markér base-ændringer med deres oprindelige indeks før filtrering
        cal.weeks.forEach(w => {
            (w.changes || []).forEach((c, idx) => {
                c._source = 'base';
                c._baseIdx = idx;
            });
        });

        // 1. Flet egne ønsker ind
        const extraWishes = customWishesByCal[cal.id] || [];
        extraWishes.forEach(cw => cal.wishes.push({ ...cw, _customWish: true }));

        // 2. Fjern slettede/redigerede base-ændringer
        const ovData = weekOverridesByCal[cal.id] || { added: [], removed: [] };
        (ovData.removed || []).forEach(rem => {
            const wObj = cal.weeks.find(w => w.week === rem.week);
            if (wObj && wObj.changes) {
                wObj.changes = wObj.changes.filter(c => {
                    if (c._source !== 'base') return true;
                    if (typeof rem.baseIdx === 'number') return c._baseIdx !== rem.baseIdx;
                    return !(c.day === rem.day && c.title === rem.title && (c.start || '') === (rem.start || ''));
                });
            }
        });

        // 3. Flet fastlagte ønsker ind i ugerne
        const extraPlacements = wishPlacementsByCal[cal.id] || [];
        extraPlacements.forEach(pl => {
            const wObj = cal.weeks.find(w => w.week === pl.week);
            if (wObj) {
                if (!wObj.changes) wObj.changes = [];
                wObj.changes.push({ ...pl.change, _fromBrowser: true, _source: 'wish' });
            }
        });

        // 4. Flet lokale uge-overrides ind i ugerne
        (ovData.added || []).forEach(ov => {
            const wObj = cal.weeks.find(w => w.week === ov.week);
            if (wObj) {
                if (!wObj.changes) wObj.changes = [];
                wObj.changes.push({ ...ov.change, _fromBrowser: true, _source: 'override', _overrideId: ov.id });
            }
        });

        return cal;
    }

    function resetAllLocalCalendarEdits(calId) {
        delete wishPlacementsByCal[calId];
        delete customWishesByCal[calId];
        delete weekOverridesByCal[calId];
        localStorage.setItem(STORAGE_KEY_WISH_PLACEMENTS, JSON.stringify(wishPlacementsByCal));
        localStorage.setItem(STORAGE_KEY_CUSTOM_WISHES, JSON.stringify(customWishesByCal));
        localStorage.setItem(STORAGE_KEY_WEEK_OVERRIDES, JSON.stringify(weekOverridesByCal));
        renderSemesterSimulation();
    }

    // Wish Modal Events
    if (wishTypeSelect && wishTargetBlockGroup) {
        wishTypeSelect.addEventListener('change', () => {
            wishTargetBlockGroup.style.display = wishTypeSelect.value === 'immersion' ? 'flex' : 'none';
        });
    }
    if (btnNewWish && wishModal) {
        btnNewWish.addEventListener('click', (e) => {
            e.stopPropagation();
            if (wishForm) wishForm.reset();
            if (wishTargetBlockGroup) wishTargetBlockGroup.style.display = 'none';
            wishModal.showModal();
        });
    }
    const btnCloseWishModal = document.getElementById('btn-close-wish-modal');
    const btnCancelWishModal = document.getElementById('btn-cancel-wish-modal');
    if (btnCloseWishModal && wishModal) btnCloseWishModal.addEventListener('click', () => wishModal.close());
    if (btnCancelWishModal && wishModal) btnCancelWishModal.addEventListener('click', () => wishModal.close());
    if (wishModal) wishModal.addEventListener('click', (e) => { if (e.target === wishModal) wishModal.close(); });

    if (wishForm && wishModal) {
        wishForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const cal = getActiveCalendar();
            if (!cal) return;
            const title = wishTitleInput.value.trim();
            if (!title) return;
            const type = wishTypeSelect.value;
            const prefRaw = wishPrefWeeksInput.value.trim();
            const preferredWeeks = prefRaw ? prefRaw.split(/[,\s;]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n)) : [];

            const newWish = {
                id: 'custom_wish_' + Date.now(),
                title,
                type,
                ...(type === 'immersion' ? { targetBlock: wishTargetBlockSelect.value } : {}),
                start: wishStartInput.value || (type === 'buffer_or_event' ? '10:00' : '08:00'),
                end: wishEndInput.value || (type === 'buffer_or_event' ? '11:50' : '16:00'),
                preferredWeeks
            };

            if (!customWishesByCal[cal.id]) customWishesByCal[cal.id] = [];
            customWishesByCal[cal.id].push(newWish);
            localStorage.setItem(STORAGE_KEY_CUSTOM_WISHES, JSON.stringify(customWishesByCal));

            setSectionOpen(sectionWishes, toggleWishesBtn, wishesBody, true);
            sidebarSectionsState.wishesOpen = true;
            saveSidebarSectionsState();
            wishModal.close();
            renderSemesterSimulation();
        });
    }

    // Override Modal: Åbn til oprettelse eller redigering af en konkret brik i skemaet
    function populateOverrideWeekOptions(cal, selectedWeekNum) {
        if (!overrideWeekSelect || !cal) return;
        overrideWeekSelect.innerHTML = cal.weeks
            .map(w => `<option value="${w.week}">Uge ${w.week} (${w.label || 'Normaluge'})</option>`)
            .join('');
        if (selectedWeekNum !== undefined) {
            overrideWeekSelect.value = selectedWeekNum;
        }
    }

    function openCreateOverrideModal() {
        const cal = getActiveCalendar();
        if (!cal || !overrideModal) return;

        editingOverrideContext = null;
        if (overrideModalTitle) overrideModalTitle.textContent = 'Tilføj ændring / override';
        if (btnDeleteOverride) btnDeleteOverride.style.display = 'none';

        const defaultWeek = cal.weeks[selectedSimWeekIndex] ? cal.weeks[selectedSimWeekIndex].week : cal.weeks[0]?.week;
        populateOverrideWeekOptions(cal, defaultWeek);

        if (overrideDaySelect) overrideDaySelect.value = 'man';
        if (overrideTypeSelect) overrideTypeSelect.value = 'event';
        if (overrideTitleInput) overrideTitleInput.value = '';
        if (overrideStartInput) overrideStartInput.value = '08:00';
        if (overrideEndInput) overrideEndInput.value = '12:00';
        if (overrideTargetBlockGroup) overrideTargetBlockGroup.style.display = 'none';

        overrideModal.showModal();
    }

    function openEditOverrideModal(cal, weekNum, simItem) {
        if (!cal || !overrideModal || !simItem) return;

        editingOverrideContext = {
            calId: cal.id,
            week: weekNum,
            source: simItem._source || 'base',
            overrideId: simItem._overrideId || null,
            wishId: simItem.wishId || null,
            baseIdx: simItem._baseIdx,
            origDay: simItem.day,
            origTitle: simItem.title,
            origStart: simItem.start,
            origEnd: simItem.end
        };

        if (overrideModalTitle) overrideModalTitle.textContent = `Rediger ændring (Uge ${weekNum})`;
        if (btnDeleteOverride) btnDeleteOverride.style.display = 'inline-block';

        populateOverrideWeekOptions(cal, weekNum);
        if (overrideDaySelect) overrideDaySelect.value = simItem.day || 'man';
        if (overrideTypeSelect) overrideTypeSelect.value = simItem.rawType || 'event';
        if (overrideTitleInput) overrideTitleInput.value = simItem.title || '';
        if (overrideStartInput) overrideStartInput.value = simItem.start || '08:00';
        if (overrideEndInput) overrideEndInput.value = simItem.end || '16:00';

        if (overrideTargetBlockGroup) {
            const isImm = (simItem.rawType === 'immersion');
            overrideTargetBlockGroup.style.display = isImm ? 'flex' : 'none';
            if (isImm && simItem.targetBlock && overrideTargetBlockSelect) {
                overrideTargetBlockSelect.value = simItem.targetBlock;
            }
        }

        overrideModal.showModal();
    }

    if (overrideTypeSelect && overrideTargetBlockGroup) {
        overrideTypeSelect.addEventListener('change', () => {
            overrideTargetBlockGroup.style.display = overrideTypeSelect.value === 'immersion' ? 'flex' : 'none';
        });
    }
    if (btnAddWeekOverride) {
        btnAddWeekOverride.addEventListener('click', openCreateOverrideModal);
    }

    const btnCloseOverrideModal = document.getElementById('btn-close-override-modal');
    const btnCancelOverrideModal = document.getElementById('btn-cancel-override-modal');
    if (btnCloseOverrideModal && overrideModal) btnCloseOverrideModal.addEventListener('click', () => overrideModal.close());
    if (btnCancelOverrideModal && overrideModal) btnCancelOverrideModal.addEventListener('click', () => overrideModal.close());
    if (overrideModal) overrideModal.addEventListener('click', (e) => { if (e.target === overrideModal) overrideModal.close(); });

    if (btnDeleteOverride && overrideModal) {
        btnDeleteOverride.addEventListener('click', () => {
            if (!editingOverrideContext) return;
            const ctx = editingOverrideContext;

            if (ctx.source === 'wish' && ctx.wishId) {
                unlockWishFromCalendar(ctx.calId, ctx.wishId);
            } else if (ctx.source === 'override' && ctx.overrideId) {
                if (weekOverridesByCal[ctx.calId]) {
                    weekOverridesByCal[ctx.calId].added = weekOverridesByCal[ctx.calId].added.filter(o => o.id !== ctx.overrideId);
                    localStorage.setItem(STORAGE_KEY_WEEK_OVERRIDES, JSON.stringify(weekOverridesByCal));
                }
                renderSemesterSimulation();
            } else {
                if (!weekOverridesByCal[ctx.calId]) weekOverridesByCal[ctx.calId] = { added: [], removed: [] };
                weekOverridesByCal[ctx.calId].removed.push({
                    week: ctx.week,
                    baseIdx: ctx.baseIdx,
                    day: ctx.origDay,
                    title: ctx.origTitle,
                    start: ctx.origStart || '',
                    end: ctx.origEnd || ''
                });
                localStorage.setItem(STORAGE_KEY_WEEK_OVERRIDES, JSON.stringify(weekOverridesByCal));
                renderSemesterSimulation();
            }

            editingOverrideContext = null;
            overrideModal.close();
        });
    }

    if (overrideForm && overrideModal) {
        overrideForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const cal = getActiveCalendar();
            if (!cal) return;

            const wk = parseInt(overrideWeekSelect.value, 10);
            const day = overrideDaySelect.value;
            const type = overrideTypeSelect.value;
            const title = overrideTitleInput.value.trim();
            const start = overrideStartInput.value || '08:00';
            const end = overrideEndInput.value || '16:00';
            if (!title) return;

            const updatedChange = {
                day,
                start,
                end,
                type,
                ...(type === 'immersion' ? { targetBlock: overrideTargetBlockSelect.value } : {}),
                title
            };

            if (editingOverrideContext) {
                const ctx = editingOverrideContext;
                if (ctx.source === 'wish' && ctx.wishId) {
                    const list = wishPlacementsByCal[ctx.calId] || [];
                    const pl = list.find(p => p.wishId === ctx.wishId);
                    if (pl) {
                        pl.week = wk;
                        pl.change = { ...updatedChange, wishId: ctx.wishId };
                        localStorage.setItem(STORAGE_KEY_WISH_PLACEMENTS, JSON.stringify(wishPlacementsByCal));
                    }
                } else if (ctx.source === 'override' && ctx.overrideId) {
                    const ovData = weekOverridesByCal[ctx.calId];
                    const ov = ovData && ovData.added.find(o => o.id === ctx.overrideId);
                    if (ov) {
                        ov.week = wk;
                        ov.change = updatedChange;
                        localStorage.setItem(STORAGE_KEY_WEEK_OVERRIDES, JSON.stringify(weekOverridesByCal));
                    }
                } else {
                    // Base-ændring fra JSON: markér originalen som fjernet og tilføj den rettede som lokal override
                    if (!weekOverridesByCal[ctx.calId]) weekOverridesByCal[ctx.calId] = { added: [], removed: [] };
                    weekOverridesByCal[ctx.calId].removed.push({
                        week: ctx.week,
                        baseIdx: ctx.baseIdx,
                        day: ctx.origDay,
                        title: ctx.origTitle,
                        start: ctx.origStart || '',
                        end: ctx.origEnd || ''
                    });
                    weekOverridesByCal[ctx.calId].added.push({
                        id: 'ov_' + Date.now(),
                        week: wk,
                        change: updatedChange
                    });
                    localStorage.setItem(STORAGE_KEY_WEEK_OVERRIDES, JSON.stringify(weekOverridesByCal));
                }
            } else {
                if (!weekOverridesByCal[cal.id]) weekOverridesByCal[cal.id] = { added: [], removed: [] };
                weekOverridesByCal[cal.id].added.push({
                    id: 'ov_' + Date.now(),
                    week: wk,
                    change: updatedChange
                });
                localStorage.setItem(STORAGE_KEY_WEEK_OVERRIDES, JSON.stringify(weekOverridesByCal));
            }

            const wIdx = cal.weeks.findIndex(w => w.week === wk);
            if (wIdx !== -1) selectedSimWeekIndex = wIdx;

            editingOverrideContext = null;
            overrideModal.close();
            syncUrlState();
            renderSemesterSimulation();
        });
    }

    function simulateWeek(weekObj, baseSchedule, useBufferRescue) {
        const days = ['man', 'tir', 'ons', 'tor', 'fre'];
        const changes = weekObj.changes || [];
        const dayResults = {};
        const cancelledSubjectBlocks = [];

        days.forEach(day => {
            const dayChanges = changes.filter(c => c.day === day);
            const dayBase = baseSchedule.filter(e => e.day === day).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
            const items = [];

            dayBase.forEach(entry => {
                const eStart = timeToMinutes(entry.start);
                const eEnd = timeToMinutes(entry.end);
                const eDur = Math.max(eEnd - eStart, 0);
                const isMeal = MEAL_TITLES.includes(entry.title);
                const teachingFlag = isEntryTeaching(entry);

                const overlappingChange = !isMeal && dayChanges.find(chg => {
                    return (Math.min(eEnd, timeToMinutes(chg.end || '23:59')) - Math.max(eStart, timeToMinutes(chg.start || '00:00'))) > 10;
                });

                if (overlappingChange) {
                    items.push({ ...entry, isMeal, isTeaching: teachingFlag, simStatus: 'cancelled', simReason: overlappingChange.title || 'Aflyst', effectiveMinutes: 0 });
                    if (teachingFlag) {
                        cancelledSubjectBlocks.push({ title: entry.title, duration: eDur, day });
                    }
                } else {
                    items.push({ ...entry, isMeal, isTeaching: teachingFlag, simStatus: 'normal', effectiveMinutes: eDur });
                }
            });

            dayChanges.forEach(chg => {
                const cStart = timeToMinutes(chg.start || '08:00');
                const cEnd = timeToMinutes(chg.end || '16:00');
                const lunchOverlap = Math.max(0, Math.min(cEnd, 750) - Math.max(cStart, 720));
                const netMins = chg.effectiveMinutes !== undefined ? chg.effectiveMinutes : Math.max(0, (cEnd - cStart) - lunchOverlap);
                const isHoliday = chg.type === 'holiday';
                const isNoTeaching = isHoliday || chg.type === 'cancel';

                items.push({
                    day,
                    title: chg.title,
                    start: chg.start || '08:00',
                    end: chg.end || '16:00',
                    isMeal: false,
                    isTeaching: !isNoTeaching,
                    rawType: chg.type || 'event',
                    simStatus: chg.type === 'immersion' ? 'immersion' : (isHoliday ? 'holiday' : (chg.type === 'cancel' ? 'cancel_notice' : 'event')),
                    targetBlock: chg.targetBlock || null,
                    effectiveMinutes: isNoTeaching ? 0 : netMins,
                    _source: chg._source || 'base',
                    _baseIdx: chg._baseIdx,
                    _overrideId: chg._overrideId || null,
                    wishId: chg.wishId || null
                });
            });

            items.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
            dayResults[day] = { items, changes: dayChanges };
        });

        if (useBufferRescue && cancelledSubjectBlocks.length > 0) {
            days.forEach(day => {
                dayResults[day].items.forEach(item => {
                    if (item.title === 'BUFFER' && item.simStatus === 'normal' && cancelledSubjectBlocks.length > 0) {
                        const rescued = cancelledSubjectBlocks.shift();
                        item.title = `${rescued.title} (via BUFFER)`;
                        item.rescuedTitle = rescued.title;
                        item.isTeaching = true;
                        item.simStatus = 'rescued';
                    }
                });
            });
        }
        return dayResults;
    }

    function suggestPlacementsForWish(wish, simulatedWeeks, blockStats) {
        const candidates = [];
        const prefWeeks = Array.isArray(wish.preferredWeeks) && wish.preferredWeeks.length > 0 ? wish.preferredWeeks : simulatedWeeks.map(w => w.week);

        simulatedWeeks.forEach(w => {
            const isPreferredWeek = prefWeeks.includes(w.week);
            ['man', 'tir', 'ons', 'tor', 'fre'].forEach(day => {
                const dayObj = w.days[day];
                if (dayObj.changes.some(c => c.type === 'holiday' || (timeToMinutes(c.end || '16:00') - timeToMinutes(c.start || '08:00') >= 360))) return;

                if (wish.type === 'buffer_or_event') {
                    const freeBuffer = dayObj.items.find(i => i.title === 'BUFFER' && i.simStatus === 'normal');
                    if (freeBuffer) {
                        let score = 200;
                        if (isPreferredWeek) score += 60;
                        if (dayObj.changes.length > 0) score += 15;
                        candidates.push({
                            week: w.week, weekLabel: w.label || '', day, start: freeBuffer.start, end: freeBuffer.end,
                            type: 'event', targetBlock: null, viaBuffer: true, lostMinutes: 0, impactText: '0t tab (via BUFFER)', score
                        });
                        return;
                    }
                }

                const cStartStr = wish.start || (wish.type === 'buffer_or_event' ? '10:00' : '08:00');
                const cEndStr = wish.end || (wish.type === 'buffer_or_event' ? '11:50' : '16:00');
                const cStart = timeToMinutes(cStartStr);
                const cEnd = timeToMinutes(cEndStr);
                let lostMinutes = 0, deficitPenalty = 0, targetAlreadyOnDay = false;
                const affectedBlocks = new Set();

                dayObj.items.forEach(item => {
                    if (item.simStatus !== 'normal' || item.isMeal) return;
                    if (Math.min(timeToMinutes(item.end), cEnd) - Math.max(timeToMinutes(item.start), cStart) > 10) {
                        if (wish.type === 'immersion' && item.title === wish.targetBlock) {
                            targetAlreadyOnDay = true;
                        } else if (item.isTeaching) {
                            lostMinutes += item.effectiveMinutes;
                            affectedBlocks.add(item.title);
                            if (blockStats[item.title] && blockStats[item.title].actualMin < blockStats[item.title].plannedMin) deficitPenalty += 40;
                        }
                    }
                });

                let score = 100 - (lostMinutes / 10) - deficitPenalty;
                if (isPreferredWeek) score += 50;
                if (targetAlreadyOnDay) score += 25;
                if (dayObj.changes.length > 0) score += 15;

                candidates.push({
                    week: w.week, weekLabel: w.label || '', day, start: cStartStr, end: cEndStr,
                    type: wish.type === 'immersion' ? 'immersion' : 'event',
                    targetBlock: wish.targetBlock || null, viaBuffer: false, lostMinutes,
                    impactText: lostMinutes === 0 ? '0t tab for andre fag' : `Aflyser ${(lostMinutes / 60).toFixed(1)}t (${Array.from(affectedBlocks).join(', ')})`,
                    score
                });
            });
        });
        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, 3);
    }

    function lockWishIntoCalendar(calId, wish, placement) {
        if (!wishPlacementsByCal[calId]) wishPlacementsByCal[calId] = [];
        wishPlacementsByCal[calId].push({
            wishId: wish.id,
            week: placement.week,
            change: {
                wishId: wish.id,
                day: placement.day,
                start: placement.start,
                end: placement.end,
                type: placement.type,
                ...(placement.targetBlock ? { targetBlock: placement.targetBlock } : {}),
                title: wish.title
            }
        });
        localStorage.setItem(STORAGE_KEY_WISH_PLACEMENTS, JSON.stringify(wishPlacementsByCal));
        renderSemesterSimulation();
    }

    function unlockWishFromCalendar(calId, wishId) {
        if (!wishPlacementsByCal[calId]) return;
        wishPlacementsByCal[calId] = wishPlacementsByCal[calId].filter(p => p.wishId !== wishId);
        localStorage.setItem(STORAGE_KEY_WISH_PLACEMENTS, JSON.stringify(wishPlacementsByCal));
        renderSemesterSimulation();
    }

    function deleteCustomWish(calId, wishId) {
        if (customWishesByCal[calId]) {
            customWishesByCal[calId] = customWishesByCal[calId].filter(w => w.id !== wishId);
            localStorage.setItem(STORAGE_KEY_CUSTOM_WISHES, JSON.stringify(customWishesByCal));
        }
        unlockWishFromCalendar(calId, wishId);
    }

    function renderWishesSection(cal, simulatedWeeks, blockStats) {
        if (!simWishesContainer) return;
        const hasEdits = hasLocalCalendarEdits(cal.id);
        if (btnResetWishes) btnResetWishes.style.display = hasEdits ? 'inline-block' : 'none';
        if (btnResetCalendarOverrides) btnResetCalendarOverrides.style.display = hasEdits ? 'inline-block' : 'none';

        const wishes = cal.wishes || [];
        if (wishes.length === 0) {
            if (wishesCounterBadge) wishesCounterBadge.textContent = '0/0';
            simWishesContainer.innerHTML = `<p style="font-size:0.74rem; color:#64748b;">Klik på <strong>+</strong> for at oprette ønsker.</p>`;
            return;
        }

        const usedChangeKeys = new Set();
        let scheduledCount = 0;

        const wishItemsHtml = wishes.map(w => {
            let foundMatch = null;
            for (const weekObj of cal.weeks) {
                const changes = weekObj.changes || [];
                for (let cIdx = 0; cIdx < changes.length; cIdx++) {
                    const chg = changes[cIdx];
                    const uniqueKey = `${weekObj.week}_${cIdx}`;
                    if (usedChangeKeys.has(uniqueKey)) continue;

                    const idMatch = chg.wishId && chg.wishId === w.id;
                    const titleMatch = !chg.wishId && chg.title && chg.title.trim().toLowerCase() === w.title.trim().toLowerCase();

                    if (idMatch || titleMatch) {
                        usedChangeKeys.add(uniqueKey);
                        foundMatch = { week: weekObj.week, day: chg.day, start: chg.start, end: chg.end, fromBrowser: Boolean(chg._fromBrowser) };
                        break;
                    }
                }
                if (foundMatch) break;
            }

            if (foundMatch) {
                scheduledCount++;
                const dayShort = DAY_SHORT[foundMatch.day] || foundMatch.day;
                return `
                    <div class="sb-wish-item is-scheduled">
                        <div class="sb-wish-main-row">
                            <div class="sb-wish-left">
                                <span class="sb-wish-status-icon is-done" title="Skemalagt">✓</span>
                                <span class="sb-wish-title" title="${w.title}">${w.title}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                                <span class="sb-wish-badge">Uge ${foundMatch.week} · ${dayShort}</span>
                                ${foundMatch.fromBrowser ? `<button type="button" class="btn-unlock-wish" data-wish-id="${w.id}" title="Fjern placering" style="background:none; border:none; cursor:pointer; font-size:0.9rem; line-height:1; color:#dc2626; padding:0 2px;">&times;</button>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }

            const suggestions = suggestPlacementsForWish(w, simulatedWeeks, blockStats);
            const bestSug = suggestions[0];
            const prefText = Array.isArray(w.preferredWeeks) && w.preferredWeeks.length > 0 ? `Ønsket: uge ${w.preferredWeeks.join(', ')}` : 'Hele semesteret';

            const bestSugHtml = bestSug ? `
                <div class="sb-wish-sug-box">
                    <div style="min-width:0;">
                        <strong>Uge ${bestSug.week} · ${DAY_SHORT[bestSug.day]}</strong>
                        <div style="font-size:0.65rem; color:${bestSug.lostMinutes === 0 ? '#15803d' : '#64748b'}; font-weight:${bestSug.lostMinutes === 0 ? '700' : '400'};">
                            ${bestSug.impactText}
                        </div>
                    </div>
                    <button type="button" class="btn btn-outline btn-apply-wish-sug" data-wish-id="${w.id}" data-sug-idx="0" style="padding:2px 7px; font-size:0.69rem; white-space:nowrap;">
                        + Læg fast
                    </button>
                </div>
            ` : '';

            const altSugsHtml = suggestions.slice(1).map((sug, idx) => `
                <div class="sb-wish-sug-box">
                    <div style="min-width:0;">
                        <strong>Uge ${sug.week} · ${DAY_SHORT[sug.day]}</strong>
                        <div style="font-size:0.64rem; color:#64748b;">${sug.impactText}</div>
                    </div>
                    <button type="button" class="btn btn-outline btn-apply-wish-sug" data-wish-id="${w.id}" data-sug-idx="${idx + 1}" style="padding:2px 6px; font-size:0.67rem;">
                        + Læg fast
                    </button>
                </div>
            `).join('');

            const weekOptions = cal.weeks.map(wk => `<option value="${wk.week}">Uge ${wk.week}</option>`).join('');

            return `
                <div class="sb-wish-item is-pending" data-wish-card="${w.id}">
                    <div class="sb-wish-main-row">
                        <div class="sb-wish-left">
                            <span class="sb-wish-status-icon is-open" title="Mangler placering">○</span>
                            <div>
                                <div class="sb-wish-title">${w.title}</div>
                                <div class="sb-wish-sub">${prefText}</div>
                            </div>
                        </div>
                        ${w._customWish ? `<button type="button" class="btn-delete-custom-wish" data-wish-id="${w.id}" title="Slet ønske" style="background:none; border:none; cursor:pointer; font-size:0.95rem; color:#92400e; padding:0 2px;">&times;</button>` : ''}
                    </div>
                    <div class="sb-wish-actions">
                        ${bestSugHtml}
                        <details class="sb-wish-more-details">
                            <summary>Flere forslag / vælg selv</summary>
                            <div class="sb-wish-more-body">
                                ${altSugsHtml}
                                <div style="display:flex; gap:4px; align-items:center; margin-top:2px;">
                                    <select class="select-input manual-wish-week" style="padding:2px 4px; font-size:0.7rem; flex:1;">${weekOptions}</select>
                                    <select class="select-input manual-wish-day" style="padding:2px 4px; font-size:0.7rem;">
                                        <option value="man">Man</option>
                                        <option value="tir">Tir</option>
                                        <option value="ons">Ons</option>
                                        <option value="tor" selected>Tor</option>
                                        <option value="fre">Fre</option>
                                    </select>
                                    <button type="button" class="btn btn-outline btn-manual-lock" data-wish-id="${w.id}" style="padding:2px 6px; font-size:0.7rem;">Lås</button>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>
            `;
        }).join('');

        if (wishesCounterBadge) wishesCounterBadge.textContent = `${scheduledCount}/${wishes.length}`;
        simWishesContainer.innerHTML = wishItemsHtml;

        simWishesContainer.querySelectorAll('.btn-apply-wish-sug').forEach(btn => {
            btn.addEventListener('click', () => {
                const wish = wishes.find(x => x.id === btn.dataset.wishId);
                const chosen = suggestPlacementsForWish(wish, simulatedWeeks, blockStats)[parseInt(btn.dataset.sugIdx, 10)];
                if (chosen) lockWishIntoCalendar(cal.id, wish, chosen);
            });
        });
        simWishesContainer.querySelectorAll('.btn-manual-lock').forEach(btn => {
            btn.addEventListener('click', () => {
                const wish = wishes.find(x => x.id === btn.dataset.wishId);
                const card = btn.closest('.sb-wish-item');
                if (!wish || !card) return;
                lockWishIntoCalendar(cal.id, wish, {
                    week: parseInt(card.querySelector('.manual-wish-week').value, 10),
                    day: card.querySelector('.manual-wish-day').value,
                    start: wish.start || '08:00',
                    end: wish.end || '16:00',
                    type: wish.type === 'immersion' ? 'immersion' : 'event',
                    targetBlock: wish.targetBlock || null
                });
            });
        });
        simWishesContainer.querySelectorAll('.btn-unlock-wish').forEach(btn => {
            btn.addEventListener('click', () => unlockWishFromCalendar(cal.id, btn.dataset.wishId));
        });
        simWishesContainer.querySelectorAll('.btn-delete-custom-wish').forEach(btn => {
            btn.addEventListener('click', () => deleteCustomWish(cal.id, btn.dataset.wishId));
        });
    }

    function renderSemesterSimulation() {
        const cal = getActiveCalendar();
        if (simProtoName) simProtoName.textContent = currentTitle;

        if (!cal) {
            if (simKpiRow) simKpiRow.innerHTML = '<p style="color:#64748b;">Læg en kalender-JSON i mappen <code>/calendars/</code> for at starte simuleringen.</p>';
            return;
        }

        const useBuffer = simUseBuffer ? simUseBuffer.checked : true;
        const weeks = cal.weeks || [];
        if (selectedSimWeekIndex >= weeks.length) selectedSimWeekIndex = 0;

        const simulatedWeeks = weeks.map(w => ({ ...w, days: simulateWeek(w, currentSchedule, useBuffer) }));

        // 1. Sammentæl fagblokke (kun brikker valgt til som undervisning tæller i timetallet)
        const blockStats = {};
        currentSchedule.forEach(e => {
            if (isEntryTeaching(e) && !blockStats[e.title]) {
                blockStats[e.title] = { plannedCount: 0, plannedMin: 0, actualCount: 0, actualMin: 0, immersionMin: 0 };
            }
        });

        let normalWeeksCount = 0;
        let holidayDaysCount = 0;
        let totalTeachingHours = 0;
        const dayNormalCounts = { man: 0, tir: 0, ons: 0, tor: 0, fre: 0 };

        simulatedWeeks.forEach(w => {
            if (!w.changes || w.changes.length === 0) normalWeeksCount++;
            let weekTeachingMin = 0;

            ['man', 'tir', 'ons', 'tor', 'fre'].forEach(d => {
                const dObj = w.days[d];
                if (dObj.changes.length === 0) dayNormalCounts[d]++;
                if (dObj.changes.some(c => c.type === 'holiday')) holidayDaysCount++;

                currentSchedule.filter(e => e.day === d && isEntryTeaching(e)).forEach(e => {
                    blockStats[e.title].plannedCount += 1;
                    blockStats[e.title].plannedMin += Math.max(timeToMinutes(e.end) - timeToMinutes(e.start), 0);
                });

                dObj.items.forEach(item => {
                    if (item.simStatus === 'normal' || item.simStatus === 'rescued') {
                        const key = item.rescuedTitle || item.title;
                        if (item.isTeaching) {
                            if (blockStats[key]) {
                                blockStats[key].actualCount += 1;
                                blockStats[key].actualMin += item.effectiveMinutes;
                            }
                            weekTeachingMin += item.effectiveMinutes;
                        }
                    } else if (item.simStatus === 'immersion' && item.targetBlock) {
                        if (!blockStats[item.targetBlock]) {
                            blockStats[item.targetBlock] = { plannedCount: 0, plannedMin: 0, actualCount: 0, actualMin: 0, immersionMin: 0 };
                        }
                        blockStats[item.targetBlock].actualCount += 1;
                        blockStats[item.targetBlock].actualMin += item.effectiveMinutes;
                        blockStats[item.targetBlock].immersionMin += item.effectiveMinutes;
                        if (isBlockTitleTeaching(item.targetBlock)) {
                            weekTeachingMin += item.effectiveMinutes;
                        }
                    } else if (item.simStatus === 'event') {
                        weekTeachingMin += Math.min(item.effectiveMinutes, 360);
                    }
                });
            });

            totalTeachingHours += (weekTeachingMin / 60);
        });

        renderWishesSection(cal, simulatedWeeks, blockStats);
        if (activeTab !== 'tab-semester') return;

        // 2. Render KPI-kort (klokketimer)
        const avgHours = weeks.length > 0 ? (totalTeachingHours / weeks.length).toFixed(1) : 0;
        const meetsSemRequirement = parseFloat(avgHours) >= 21;
        if (simKpiRow) {
            simKpiRow.innerHTML = `
                <div class="sim-kpi-box">
                    <div class="sim-kpi-label">Semesterlængde</div>
                    <div class="sim-kpi-val">${weeks.length} uger</div>
                    <div class="sim-kpi-sub">${cal.name}</div>
                </div>
                <div class="sim-kpi-box">
                    <div class="sim-kpi-label">100 % Normaluger</div>
                    <div class="sim-kpi-val">${normalWeeksCount} ud af ${weeks.length}</div>
                    <div class="sim-kpi-sub">Uger helt uden ændringer</div>
                </div>
                <div class="sim-kpi-box">
                    <div class="sim-kpi-label">Helligdage / lukkedage</div>
                    <div class="sim-kpi-val">${holidayDaysCount} dage</div>
                    <div class="sim-kpi-sub">Låst i kalenderen</div>
                </div>
                <div class="sim-kpi-box" style="${!meetsSemRequirement ? 'border-color:#fca5a5; background:#fef2f2;' : ''}">
                    <div class="sim-kpi-label">Gns. reel undervisning / uge</div>
                    <div class="sim-kpi-val" style="${!meetsSemRequirement ? 'color:#991b1b;' : ''}">${avgHours} timer</div>
                    <div class="sim-kpi-sub">Lovkrav: min. 21 klokketimer</div>
                </div>
            `;
        }

        // 3. Render Fagblok-regnskab
        if (semesterStatsContainer) {
            const rowsHtml = Object.entries(blockStats).map(([title, st]) => {
                const pHours = (st.plannedMin / 60).toFixed(1);
                const aHours = (st.actualMin / 60).toFixed(1);
                const diffHours = ((st.actualMin - st.plannedMin) / 60).toFixed(1);
                const diffSign = diffHours > 0 ? `+${diffHours}` : diffHours;
                const diffColor = diffHours < -3 ? '#dc2626' : (diffHours > 0 ? '#16a34a' : '#475569');
                const { color } = getBlockColors({ title });
                const immersionNote = st.immersionMin > 0 ? `<div style="font-size:0.68rem; color:#15803d; font-weight:600;">heraf +${(st.immersionMin / 60).toFixed(1)}t fordybelse</div>` : '';
                return `
                    <tr>
                        <td>
                            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;"></span><strong>${title}</strong>
                            ${immersionNote}
                        </td>
                        <td>${st.plannedCount}x (${pHours}t)</td>
                        <td><strong>${st.actualCount}x (${aHours}t)</strong></td>
                        <td style="color:${diffColor};font-weight:800;">${diffSign}t</td>
                    </tr>
                `;
            }).join('');

            semesterStatsContainer.innerHTML = `
                <table class="sim-table">
                    <thead><tr><th>Undervisningsfag</th><th>Planlagt</th><th>Reelt</th><th>Forskel</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            `;
        }

        // 4. Render Uge-vælger & Proportional Uge-tidslinje (med klikbare overrides direkte i skemaet)
        if (simWeekSelect) {
            simWeekSelect.innerHTML = '';
            simulatedWeeks.forEach((w, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = `Uge ${w.week} – ${w.label || 'Normaluge'}`;
                simWeekSelect.appendChild(opt);
            });
            simWeekSelect.value = selectedSimWeekIndex;
        }

        const currentSimWeek = simulatedWeeks[selectedSimWeekIndex];
        if (simWeekDetail && currentSimWeek) {
            const SIM_START_HOUR = 7, SIM_END_HOUR = 21.5, SIM_START_MIN = SIM_START_HOUR * 60, SIM_PX_PER_HOUR = 38, totalHeightPx = (SIM_END_HOUR - SIM_START_HOUR) * SIM_PX_PER_HOUR;
            let ticksHtml = '';
            for (let h = SIM_START_HOUR; h <= 21; h++) {
                ticksHtml += `<div class="sim-time-tick" style="top:${(h - SIM_START_HOUR) * SIM_PX_PER_HOUR}px;">${String(h).padStart(2, '0')}:00</div>`;
            }

            const dayColsHtml = ['man', 'tir', 'ons', 'tor', 'fre'].map(d => {
                const dayItems = currentSimWeek.days[d].items;
                const cancelledItems = dayItems.filter(i => i.simStatus === 'cancelled');

                const blocksHtml = dayItems.map((item, itemIdx) => {
                    const sMin = Math.max(timeToMinutes(item.start), SIM_START_MIN);
                    const eMin = Math.min(timeToMinutes(item.end), SIM_END_HOUR * 60);
                    const topPx = ((sMin - SIM_START_MIN) / 60) * SIM_PX_PER_HOUR;
                    const heightPx = Math.max(((eMin - sMin) / 60) * SIM_PX_PER_HOUR, 17);
                    const isCompact = heightPx < 30;

                    let posStyle = 'left: 2px; right: 2px; z-index: 12;';
                    if (item.isMeal) {
                        posStyle = 'left: 2px; right: 2px; z-index: 25;';
                    } else if (item.simStatus === 'cancelled') {
                        posStyle = 'left: calc(56% + 1px); width: calc(44% - 3px); z-index: 10;';
                    } else if (['event', 'immersion', 'cancel_notice', 'holiday'].includes(item.simStatus)) {
                        const overlapsCancelled = cancelledItems.some(c => Math.min(eMin, timeToMinutes(c.end)) > Math.max(sMin, timeToMinutes(c.start)));
                        posStyle = overlapsCancelled ? 'left: 2px; width: calc(56% - 3px); z-index: 15;' : 'left: 2px; right: 2px; z-index: 15;';
                    }

                    const baseStyle = `top:${topPx}px; height:${heightPx}px; ${posStyle}`;
                    const timeLabel = isCompact ? item.start : `${item.start}–${item.end}`;
                    const compactCls = isCompact ? ' is-compact' : '';
                    const dataAttrs = `data-sim-day="${d}" data-sim-item-idx="${itemIdx}"`;

                    if (item.simStatus === 'cancelled') {
                        return `<div class="sim-mini-block is-cancelled${compactCls}" style="${baseStyle}" title="Aflyst: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                    }
                    if (item.simStatus === 'holiday') {
                        return `<div class="sim-mini-block is-holiday is-editable-override${compactCls}" ${dataAttrs} style="${baseStyle}" title="Klik for at redigere eller slette: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">🔒 ${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                    }
                    if (item.simStatus === 'immersion') {
                        return `<div class="sim-mini-block is-immersion is-editable-override${compactCls}" ${dataAttrs} style="${baseStyle}" title="Klik for at redigere eller slette: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">⭐ ${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                    }
                    if (item.simStatus === 'cancel_notice') {
                        return `<div class="sim-mini-block is-cancel is-editable-override${compactCls}" ${dataAttrs} style="${baseStyle}" title="Klik for at redigere eller slette: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">🚫 ${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                    }
                    if (item.simStatus === 'event') {
                        return `<div class="sim-mini-block is-event is-editable-override${compactCls}" ${dataAttrs} style="${baseStyle}" title="Klik for at redigere eller slette: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">📌 ${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                    }

                    const { color, textColor } = getBlockColors({ title: item.rescuedTitle || item.title });
                    return `<div class="sim-mini-block${compactCls}" style="${baseStyle} background:${color}; color:${textColor};" title="${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                }).join('');

                return `
                    <div class="sim-day-col">
                        <div class="sim-day-col-header">${DAY_LABELS[d]}</div>
                        <div class="sim-day-col-body" style="height:${totalHeightPx}px; background-size: 100% ${SIM_PX_PER_HOUR}px;">${blocksHtml}</div>
                    </div>
                `;
            }).join('');

            simWeekDetail.className = 'sim-timeline-grid';
            simWeekDetail.innerHTML = `
                <div class="sim-time-axis">
                    <div class="sim-time-axis-header"></div>
                    <div class="sim-time-axis-body" style="height:${totalHeightPx}px;">${ticksHtml}</div>
                </div>
                ${dayColsHtml}
            `;

            // Klik på en override direkte i ugeskemaet åbner rediger/slet modal
            simWeekDetail.querySelectorAll('.is-editable-override').forEach(el => {
                el.addEventListener('click', () => {
                    const dayKey = el.dataset.simDay;
                    const itemIdx = parseInt(el.dataset.simItemIdx, 10);
                    const simItem = currentSimWeek.days[dayKey]?.items[itemIdx];
                    if (simItem) {
                        openEditOverrideModal(cal, currentSimWeek.week, simItem);
                    }
                });
            });
        }

        // 5. Render Makro-tabel over hele semesteret
        if (semesterTableContainer) {
            const macroRows = simulatedWeeks.map((w, idx) => {
                const cells = ['man', 'tir', 'ons', 'tor', 'fre'].map(d => {
                    const chgs = w.days[d].changes;
                    if (chgs.length === 0) return `<td class="macro-cell-normal">✓ Normal</td>`;
                    const hasHoliday = chgs.some(c => c.type === 'holiday');
                    const isAllCancel = chgs.every(c => c.type === 'cancel');
                    const cls = hasHoliday ? 'macro-cell-holiday' : (isAllCancel ? 'macro-cell-closed' : 'macro-cell-changed');
                    const txt = chgs.map(c => {
                        const prefix = c.type === 'holiday' ? '🔒 ' : (c.type === 'cancel' ? '🚫 ' : '');
                        return `${prefix}${c.title} <small>(${c.start}-${c.end})</small>`;
                    }).join('<br>');
                    return `<td class="${cls}">${txt}</td>`;
                }).join('');

                return `
                    <tr style="cursor:pointer;" data-week-idx="${idx}" title="Klik for at inspicere uge ${w.week}">
                        <td><strong>Uge ${w.week}</strong><br><small style="color:#64748b;">${w.label || ''}</small></td>
                        ${cells}
                    </tr>
                `;
            }).join('');

            semesterTableContainer.innerHTML = `
                <table class="sim-table">
                    <thead>
                        <tr><th style="width:140px;">Uge</th><th>Mandag (${dayNormalCounts.man} normale)</th><th>Tirsdag (${dayNormalCounts.tir} normale)</th><th>Onsdag (${dayNormalCounts.ons} normale)</th><th>Torsdag (${dayNormalCounts.tor} normale)</th><th>Fredag (${dayNormalCounts.fre} normale)</th></tr>
                    </thead>
                    <tbody>${macroRows}</tbody>
                </table>
            `;

            semesterTableContainer.querySelectorAll('tr[data-week-idx]').forEach(tr => {
                tr.addEventListener('click', () => {
                    selectedSimWeekIndex = parseInt(tr.dataset.weekIdx, 10);
                    syncUrlState();
                    renderSemesterSimulation();
                });
            });
        }
    }

    if (semesterSelect) semesterSelect.addEventListener('change', () => { selectedSimWeekIndex = 0; syncUrlState(); renderSemesterSimulation(); });
    if (simUseBuffer) simUseBuffer.addEventListener('change', () => renderSemesterSimulation());
    if (btnResetWishes) {
        btnResetWishes.addEventListener('click', (e) => {
            e.stopPropagation();
            const cal = getActiveCalendar();
            if (!cal) return;
            if (confirm('Vil du nulstille alle dine midlertidige ønsker og kalender-overrides i browseren?')) {
                resetAllLocalCalendarEdits(cal.id);
            }
        });
    }
    if (btnResetCalendarOverrides) {
        btnResetCalendarOverrides.addEventListener('click', () => {
            const cal = getActiveCalendar();
            if (!cal) return;
            if (confirm('Vil du nulstille alle lokale kalender-overrides og ønsker?')) {
                resetAllLocalCalendarEdits(cal.id);
            }
        });
    }
    if (btnExportCalendarJson) {
        btnExportCalendarJson.addEventListener('click', () => {
            const cal = getActiveCalendar();
            if (!cal) return;
            const cleanCal = JSON.parse(JSON.stringify(cal));
            (cleanCal.wishes || []).forEach(w => { delete w._customWish; });
            cleanCal.weeks.forEach(w => {
                (w.changes || []).forEach(c => {
                    delete c._fromBrowser;
                    delete c._source;
                    delete c._baseIdx;
                    delete c._overrideId;
                });
            });
            const blob = new Blob([JSON.stringify(cleanCal, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${cleanCal.id}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    if (simWeekSelect) simWeekSelect.addEventListener('change', (e) => { selectedSimWeekIndex = parseInt(e.target.value, 10); syncUrlState(); renderSemesterSimulation(); });
    if (btnPrevWeek) btnPrevWeek.addEventListener('click', () => { if (selectedSimWeekIndex > 0) { selectedSimWeekIndex--; syncUrlState(); renderSemesterSimulation(); } });
    if (btnNextWeek) btnNextWeek.addEventListener('click', () => { const cal = getActiveCalendar(); if (cal && selectedSimWeekIndex < cal.weeks.length - 1) { selectedSimWeekIndex++; syncUrlState(); renderSemesterSimulation(); } });
    if (btnExportSimImage) {
        btnExportSimImage.addEventListener('click', () => {
            const target = document.getElementById('semester-export-target');
            if (!target || typeof window.html2canvas !== 'function') return;
            window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
                const a = document.createElement('a');
                a.download = `Semester_Simulering_${currentTitle.replace(/\s+/g, '_')}.png`;
                a.href = canvas.toDataURL('image/png');
                a.click();
            });
        });
    }

    // --- 10. LOCALSTORAGE & TIDSHJÆLPERE ---
    function saveState() {
        localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify({
            schedule: currentSchedule,
            notes: notesTextarea ? notesTextarea.value : '',
            activeProtoId,
            currentTitle,
            isModified
        }));
    }

    function loadFromStorage() {
        try {
            const storedBlocks = localStorage.getItem(STORAGE_KEY_CUSTOM_BLOCKS);
            if (storedBlocks) customBlocks = JSON.parse(storedBlocks);

            const storedProtos = localStorage.getItem(STORAGE_KEY_CUSTOM_PROTOS);
            if (storedProtos) customPrototypes = JSON.parse(storedProtos);

            const storedWishes = localStorage.getItem(STORAGE_KEY_WISH_PLACEMENTS);
            if (storedWishes) wishPlacementsByCal = JSON.parse(storedWishes);

            const storedCustomWishes = localStorage.getItem(STORAGE_KEY_CUSTOM_WISHES);
            if (storedCustomWishes) customWishesByCal = JSON.parse(storedCustomWishes);

            const storedWeekOverrides = localStorage.getItem(STORAGE_KEY_WEEK_OVERRIDES);
            if (storedWeekOverrides) weekOverridesByCal = JSON.parse(storedWeekOverrides);

            const storedSections = localStorage.getItem(STORAGE_KEY_SIDEBAR_SECTIONS);
            if (storedSections) {
                const parsedSections = JSON.parse(storedSections);
                if (typeof parsedSections.paletteOpen === 'boolean') sidebarSectionsState.paletteOpen = parsedSections.paletteOpen;
                if (typeof parsedSections.wishesOpen === 'boolean') sidebarSectionsState.wishesOpen = parsedSections.wishesOpen;
            }

            const storedCurrent = localStorage.getItem(STORAGE_KEY_CURRENT);
            if (storedCurrent) {
                const parsed = JSON.parse(storedCurrent);
                if (parsed.activeProtoId) activeProtoId = parsed.activeProtoId;
                if (parsed.currentTitle) currentTitle = parsed.currentTitle;
                if (typeof parsed.isModified === 'boolean') isModified = parsed.isModified;
            }
        } catch (e) { console.warn('Fejl ved indlæsning af local storage:', e); }
    }

    function timeToMinutes(str) {
        if (!str) return 0;
        const [h, m] = str.replace('.', ':').split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    function minutesToTime(totalMin) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}