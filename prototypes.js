// Vite scanner mappen synkront ved start (både små og store bogstaver i filendelsen)
const modules = import.meta.glob('./prototypes/*.{json,JSON,js,JS}', { eager: true });

export const allPrototypes = Object.values(modules)
    .map(mod => mod.default || mod)
    .filter(p => p && p.name && p.schedule);

console.log(`[VIH Skema] Vite fandt ${allPrototypes.length} skema(er) i /prototypes:`, allPrototypes.map(p => p.name));