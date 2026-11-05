import * as settingsModule from './settings.js';
const SETTINGS = settingsModule.VIH_SKEMA_SETTINGS || settingsModule.VIH_SETTINGS || {};

// 1. Vite scanner direkte i ./prototypes/ uden if-tjek
const rootModules = import.meta.glob('./prototypes/*.json', { eager: true });
const subModules = import.meta.glob('./prototypes/**/*.json', { eager: true });
const allModules = Object.assign({}, rootModules, subModules);

// Formaterer mappenavnet til optgroup (fx '1_Nye_Forslag' -> '1. Nye Forslag')
function formatGroupName(folder) {
    if (!folder) return 'Faste skabeloner';
    const withDot = folder.replace(/^(\d+)[_\-\.]\s*/, '$1. ');
    const clean = withDot.replace(/_/g, ' ').trim();
    return clean ? (clean.charAt(0).toUpperCase() + clean.slice(1)) : folder;
}

const entries = Object.entries(allModules).sort(([pathA], [pathB]) =>
    pathA.localeCompare(pathB, undefined, { numeric: true })
);

const scannedPrototypes = entries.map(([path, mod]) => {
    const rawData = mod.default || mod;
    const data = JSON.parse(JSON.stringify(rawData));

    // Sti relativt til prototypes mappen
    const relPath = path.replace(/^\.\/prototypes\//, '');
    const parts = relPath.split('/');
    const fileName = parts[parts.length - 1].replace(/\.json$/i, '');

    if (parts.length > 1) {
        // Ligger i en undermappe (fx '2_Skema_2026/2026e-4.json')
        const folderRaw = parts[0];
        const matchNum = folderRaw.match(/^(\d+)/);
        data._folder = folderRaw;
        data._folderOrder = matchNum ? parseInt(matchNum[1], 10) : 900;
        data.group = formatGroupName(folderRaw);
    } else {
        // Ligger direkte i roden af ./prototypes/ (fx 'forslag-1.json')
        data._folder = '';
        data._folderOrder = 0;
        data.group = 'Faste skabeloner';
    }

    data.name = data.name || data.title || fileName;
    if (!data.id) {
        data.id = 'proto_' + path.replace(/[^a-zA-Z0-9]/g, '_');
    }

    return data;
});

console.log(`[VIH Skema] Fandt ${scannedPrototypes.length} skabeloner i ./prototypes/:`, 
    scannedPrototypes.map(p => `[${p.group}] ${p.name}`)
);

const defaultPrototypes = SETTINGS.prototypes || [];
export const allPrototypes = [...scannedPrototypes];

defaultPrototypes.forEach(p => {
    if (!allPrototypes.some(x => x.name === p.name || (x.id && x.id === p.id))) {
        allPrototypes.push(p);
    }
});