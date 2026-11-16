export const MEAL_TITLES = [
    'Morgenmad', 'Frokost', 'Aftensmad',
    'Aftenforfriskning', 'Formiddagskaffe', 'Eftermiddagskaffe'
];

export const DEFAULT_TEACHING_TITLES = [
    'Idræt 1', 'Idræt 2', 'Idræt 1/2', 'Kompetencefag', 'Inspirationsfag',
    'DGL', 'Morgensamling', 'Fællessang', 'Connected', 'Fællesskab', 'Højskoleaften'
];

export const DAY_KEYS = ['man', 'tir', 'ons', 'tor', 'fre'];
export const DAY_LABELS = { man: 'Mandag', tir: 'Tirsdag', ons: 'Onsdag', tor: 'Torsdag', fre: 'Fredag' };
export const DAY_SHORT = { man: 'Man', tir: 'Tir', ons: 'Ons', tor: 'Tor', fre: 'Fre' };

export function timeToMinutes(str) {
    if (!str) return 0;
    const [h, m] = str.replace('.', ':').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(totalMin) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function resolveTimeWindowForDay(win, day) {
    if (!win) return null;
    if (Array.isArray(win.days) && !win.days.includes(day)) {
        return null;
    }
    const defaultStart = win.start ?? win.blockedStart;
    const defaultEnd = win.end ?? win.blockedEnd;

    if (win.timesByDay && Object.prototype.hasOwnProperty.call(win.timesByDay, day)) {
        const override = win.timesByDay[day];
        if (!override) return null;
        return {
            ...win,
            start: override.start || defaultStart,
            end: override.end || defaultEnd
        };
    }

    return {
        ...win,
        start: defaultStart,
        end: defaultEnd
    };
}

export function resolveMealForDay(meal, day) {
    return resolveTimeWindowForDay(meal, day);
}

export function isEntryTeaching(entry, settings, customBlocks = []) {
    if (!entry) return false;
    if (typeof entry.isTeaching === 'boolean') return entry.isTeaching;

    const allBlocks = [
        ...(settings.defaultBlocks || []),
        ...customBlocks,
        ...(settings.mealBlocks || [])
    ];
    const blockDef = allBlocks.find(b => b.title === entry.title);
    if (blockDef && typeof blockDef.isTeaching === 'boolean') {
        return blockDef.isTeaching;
    }
    return DEFAULT_TEACHING_TITLES.includes(entry.title);
}

export function isBlockTitleTeaching(title, settings, customBlocks = []) {
    return isEntryTeaching({ title }, settings, customBlocks);
}

export function getBlockColors(entry, settings, customBlocks = []) {
    if (entry.colorOverride && entry.overrideColor) {
        return { color: entry.overrideColor, textColor: entry.overrideTextColor || '#ffffff' };
    }
    const allBlocks = [
        ...(settings.defaultBlocks || []),
        ...customBlocks,
        ...(settings.mealBlocks || [])
    ];
    const paletteMatch = allBlocks.find(b => b.title === entry.title);
    if (paletteMatch) {
        return { color: paletteMatch.color, textColor: paletteMatch.textColor || '#ffffff' };
    }
    return { color: entry.color || '#cbd5e1', textColor: entry.textColor || '#0f172a' };
}

export function evaluateScheduleConstraints(schedule, constraints, settings, customBlocks = []) {
    const errors = [];
    const warnings = [];
    const entryIssues = {};

    const actualMealTitles = new Set(MEAL_TITLES);
    const fixedMealTitles = new Set([
        ...MEAL_TITLES,
        ...(settings.mealBlocks || []).map(m => m.title)
    ]);

    function tagEntry(entryId, severity, msg) {
        if (!entryId) return;
        if (!entryIssues[entryId]) entryIssues[entryId] = { severity, messages: [] };
        if (severity === 'error') entryIssues[entryId].severity = 'error';
        entryIssues[entryId].messages.push(msg);
    }

    // 1. Efterskolens spisetider: tjek KUN om vores egne spisetider kolliderer med efterskolens
    (constraints.blockedWindows || []).forEach(win => {
        schedule.forEach(entry => {
            if (!actualMealTitles.has(entry.title)) return;

            const resolved = resolveTimeWindowForDay(win, entry.day);
            if (!resolved) return;

            const wStart = timeToMinutes(resolved.start);
            const wEnd = timeToMinutes(resolved.end);
            const eStart = timeToMinutes(entry.start);
            const eEnd = timeToMinutes(entry.end);
            if (Math.min(eEnd, wEnd) - Math.max(eStart, wStart) > 0) {
                const msg = `${DAY_SHORT[entry.day]} ${entry.start}–${entry.end}: "${entry.title}" kolliderer med ${win.label} (${resolved.start}–${resolved.end})`;
                const sev = win.severity || 'error';
                (sev === 'error' ? errors : warnings).push(msg);
                tagEntry(entry.id, sev, `${win.label} (${resolved.start}–${resolved.end})`);
            }
        });
    });

    // 2. Højskolens egne måltider på skemaet: undervisning må ikke lægges oven i vores egne måltider
    const scheduledMeals = schedule.filter(e => fixedMealTitles.has(e.title));
    schedule.forEach(entry => {
        if (!isEntryTeaching(entry, settings, customBlocks)) return;
        const eStart = timeToMinutes(entry.start);
        const eEnd = timeToMinutes(entry.end);

        scheduledMeals.forEach(meal => {
            if (meal.day !== entry.day) return;
            const mStart = timeToMinutes(meal.start);
            const mEnd = timeToMinutes(meal.end);
            if (Math.min(eEnd, mEnd) - Math.max(eStart, mStart) > 0) {
                const msg = `${DAY_SHORT[entry.day]} ${entry.start}–${entry.end}: "${entry.title}" overlapper med ${meal.title} (${meal.start}–${meal.end})`;
                errors.push(msg);
                tagEntry(entry.id, 'error', `Overlapper med ${meal.title} (${meal.start}–${meal.end})`);
            }
        });
    });

    // 3. Efterskolens idrætslokaler / faciliteter
    (constraints.facilityRestrictions || []).forEach(fac => {
        const appliesTo = Array.isArray(fac.appliesTo) ? fac.appliesTo : [];

        schedule.forEach(entry => {
            if (appliesTo.length > 0 && !appliesTo.includes(entry.title)) return;
            const resolved = resolveTimeWindowForDay(fac, entry.day);
            if (!resolved) return;

            const fStart = timeToMinutes(resolved.start);
            const fEnd = timeToMinutes(resolved.end);
            const eStart = timeToMinutes(entry.start);
            const eEnd = timeToMinutes(entry.end);
            if (Math.min(eEnd, fEnd) - Math.max(eStart, fStart) > 0) {
                const msg = `${DAY_SHORT[entry.day]} ${entry.start}–${entry.end}: "${entry.title}" rammer ${fac.label}`;
                const sev = fac.severity || 'error';
                (sev === 'error' ? errors : warnings).push(msg);
                tagEntry(entry.id, sev, fac.label);
            }
        });
    });

    // 4. Samlet ugentligt timetal pr. fag
    const blockWishes = constraints.blockWishes || {};
    const totalMinByTitle = {};
    const countByTitle = {};

    schedule.forEach(entry => {
        const dur = Math.max(timeToMinutes(entry.end) - timeToMinutes(entry.start), 0);
        totalMinByTitle[entry.title] = (totalMinByTitle[entry.title] || 0) + dur;
        countByTitle[entry.title] = (countByTitle[entry.title] || 0) + 1;
    });

    Object.entries(blockWishes).forEach(([title, wish]) => {
        if (!wish) return;
        const targetMin = wish.desiredWeeklyMinutes > 0
            ? wish.desiredWeeklyMinutes
            : (wish.desiredDuration > 0 && wish.desiredWeeklyCount > 0
                ? wish.desiredDuration * wish.desiredWeeklyCount
                : 0);

        if (targetMin > 0) {
            const actualMin = totalMinByTitle[title] || 0;
            if (actualMin < targetMin) {
                const actualH = (actualMin / 60).toFixed(1);
                const targetH = (targetMin / 60).toFixed(1);
                const missingH = ((targetMin - actualMin) / 60).toFixed(1);
                warnings.push(`"${title}": samlet ${actualH}t (${actualMin} min) i ugen – mangler ${missingH}t i forhold til kravet på ${targetH}t (${targetMin} min)`);
            }
        } else if (wish.desiredWeeklyCount > 0) {
            const actualCount = countByTitle[title] || 0;
            if (actualCount < wish.desiredWeeklyCount) {
                warnings.push(`"${title}": ligger ${actualCount}x i ugen (krav: mindst ${wish.desiredWeeklyCount}x)`);
            }
        }
    });

    return { errors, warnings, entryIssues };
}

export function downloadJsonFile(dataObj, filename, indent = 2) {
    const blob = new Blob([JSON.stringify(dataObj, null, indent)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}