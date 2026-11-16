import * as settingsModule from './settings.js';

export const SETTINGS = settingsModule.VIH_SKEMA_SETTINGS || settingsModule.VIH_SETTINGS || {};

export const STORAGE_KEYS = {
    CURRENT: 'vih_active_schedule_data',
    CUSTOM_BLOCKS: 'vih_custom_schedule_blocks',
    CUSTOM_PROTOS: 'vih_custom_schedule_protos',
    WISH_PLACEMENTS: 'vih_calendar_wish_placements',
    CUSTOM_WISHES: 'vih_calendar_custom_wishes',
    WEEK_OVERRIDES: 'vih_calendar_week_overrides',
    SIDEBAR_SECTIONS: 'vih_sidebar_sections_state',
    CONSTRAINTS: 'vih_schedule_constraints_v1',
    SHOW_CONSTRAINTS_OVERLAY: 'vih_show_constraints_overlay'
};

export function getDefaultConstraints() {
    const base = SETTINGS.constraints || {};
    return {
        blockedWindows: JSON.parse(JSON.stringify(base.blockedWindows || [])),
        facilityRestrictions: JSON.parse(JSON.stringify(base.facilityRestrictions || [])),
        blockWishes: JSON.parse(JSON.stringify(base.blockWishes || {}))
    };
}

export const state = {
    currentSchedule: [],
    currentNotes: '',
    customBlocks: [],
    customPrototypes: [],
    wishPlacementsByCal: {},
    customWishesByCal: {},
    weekOverridesByCal: {},
    activeConstraints: getDefaultConstraints(),
    sidebarSectionsState: { paletteOpen: true, wishesOpen: true },
    activeProtoId: null,
    currentTitle: 'Skemaforslag',
    isModified: false,
    editingEntryId: null,
    editingOverrideContext: null,
    activeTab: 'tab-builder',
    selectedSimWeekIndex: 0,
    showConstraintsOverlay: false
};

export function saveCurrentState(notesText = '') {
    localStorage.setItem(STORAGE_KEYS.CURRENT, JSON.stringify({
        schedule: state.currentSchedule,
        notes: notesText,
        activeProtoId: state.activeProtoId,
        currentTitle: state.currentTitle,
        isModified: state.isModified
    }));
}

export function saveCustomBlocks() {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_BLOCKS, JSON.stringify(state.customBlocks));
}

export function saveCustomPrototypes() {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_PROTOS, JSON.stringify(state.customPrototypes));
}

export function saveWishPlacements() {
    localStorage.setItem(STORAGE_KEYS.WISH_PLACEMENTS, JSON.stringify(state.wishPlacementsByCal));
}

export function saveCustomWishes() {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_WISHES, JSON.stringify(state.customWishesByCal));
}

export function saveWeekOverrides() {
    localStorage.setItem(STORAGE_KEYS.WEEK_OVERRIDES, JSON.stringify(state.weekOverridesByCal));
}

export function saveConstraints() {
    localStorage.setItem(STORAGE_KEYS.CONSTRAINTS, JSON.stringify(state.activeConstraints));
}

export function resetConstraintsToDefault() {
    state.activeConstraints = getDefaultConstraints();
    localStorage.removeItem(STORAGE_KEYS.CONSTRAINTS);
}

export function saveSidebarSectionsState() {
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_SECTIONS, JSON.stringify(state.sidebarSectionsState));
}

export function saveShowConstraintsOverlay() {
    localStorage.setItem(STORAGE_KEYS.SHOW_CONSTRAINTS_OVERLAY, JSON.stringify(state.showConstraintsOverlay));
}

export function resetLocalCalendarEdits(calId) {
    delete state.wishPlacementsByCal[calId];
    delete state.customWishesByCal[calId];
    delete state.weekOverridesByCal[calId];
    saveWishPlacements();
    saveCustomWishes();
    saveWeekOverrides();
}

export function loadFromStorage() {
    try {
        const storedBlocks = localStorage.getItem(STORAGE_KEYS.CUSTOM_BLOCKS);
        if (storedBlocks) state.customBlocks = JSON.parse(storedBlocks);

        const storedProtos = localStorage.getItem(STORAGE_KEYS.CUSTOM_PROTOS);
        if (storedProtos) state.customPrototypes = JSON.parse(storedProtos);

        const storedWishes = localStorage.getItem(STORAGE_KEYS.WISH_PLACEMENTS);
        if (storedWishes) state.wishPlacementsByCal = JSON.parse(storedWishes);

        const storedCustomWishes = localStorage.getItem(STORAGE_KEYS.CUSTOM_WISHES);
        if (storedCustomWishes) state.customWishesByCal = JSON.parse(storedCustomWishes);

        const storedWeekOverrides = localStorage.getItem(STORAGE_KEYS.WEEK_OVERRIDES);
        if (storedWeekOverrides) state.weekOverridesByCal = JSON.parse(storedWeekOverrides);

        const storedConstraints = localStorage.getItem(STORAGE_KEYS.CONSTRAINTS);
        if (storedConstraints) {
            const parsedC = JSON.parse(storedConstraints);
            const defaults = getDefaultConstraints();
            state.activeConstraints = {
                blockedWindows: Array.isArray(parsedC.blockedWindows) ? parsedC.blockedWindows : defaults.blockedWindows,
                facilityRestrictions: Array.isArray(parsedC.facilityRestrictions) ? parsedC.facilityRestrictions : defaults.facilityRestrictions,
                blockWishes: parsedC.blockWishes && typeof parsedC.blockWishes === 'object' ? parsedC.blockWishes : defaults.blockWishes
            };
        }

        const storedOverlay = localStorage.getItem(STORAGE_KEYS.SHOW_CONSTRAINTS_OVERLAY);
        if (storedOverlay !== null) {
            state.showConstraintsOverlay = JSON.parse(storedOverlay);
        }

        const storedSections = localStorage.getItem(STORAGE_KEYS.SIDEBAR_SECTIONS);
        if (storedSections) {
            const parsedSections = JSON.parse(storedSections);
            if (typeof parsedSections.paletteOpen === 'boolean') state.sidebarSectionsState.paletteOpen = parsedSections.paletteOpen;
            if (typeof parsedSections.wishesOpen === 'boolean') state.sidebarSectionsState.wishesOpen = parsedSections.wishesOpen;
        }

        const storedCurrent = localStorage.getItem(STORAGE_KEYS.CURRENT);
        if (storedCurrent) {
            const parsed = JSON.parse(storedCurrent);
            if (parsed.activeProtoId) state.activeProtoId = parsed.activeProtoId;
            if (parsed.currentTitle) state.currentTitle = parsed.currentTitle;
            if (typeof parsed.isModified === 'boolean') state.isModified = parsed.isModified;
        }
    } catch (e) {
        console.warn('Fejl ved indlæsning af localStorage:', e);
    }
}