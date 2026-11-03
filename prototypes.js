/**
 * Finder og indlæser automatisk alle .json skemaer fra /prototypes mappen
 * Virker automatisk både i Vite (lokalt) og på GitHub Pages.
 */
export async function fetchPrototypes() {
    // 1. VITE AUTO-DISCOVERY (Lokalt udviklingsmiljø)
    if (typeof import.meta !== 'undefined' && import.meta.glob) {
        try {
            const modules = import.meta.glob('./prototypes/*.json', { eager: true });
            const list = Object.values(modules).map(mod => mod.default || mod);
            if (list.length > 0) return list;
        } catch (e) {
            console.info('Vite glob ikke tilgængelig, skifter til netværks-søgning...');
        }
    }

    // 2. GITHUB PAGES AUTO-DISCOVERY (Via GitHub API)
    // Finder automatisk dit brugernavn og repo ud fra sidens URL
    const isGitHubPages = window.location.hostname.endsWith('github.io');
    if (isGitHubPages) {
        try {
            const user = window.location.hostname.split('.')[0];
            const repo = window.location.pathname.split('/')[1];

            if (user && repo) {
                const apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/prototypes`;
                const res = await fetch(apiUrl);
                if (res.ok) {
                    const files = await res.json();
                    const jsonFiles = files.filter(f => f.name.endsWith('.json'));

                    const loaded = await Promise.all(
                        jsonFiles.map(f => fetch(f.download_url).then(r => r.json()))
                    );
                    return loaded;
                }
            }
        } catch (err) {
            console.warn('Kunne ikke hente via GitHub API:', err);
        }
    }

    // 3. STATISK FALLBACK (Hvis du kører på en anden lokal webserver)
    const fallbackList = [
        './prototypes/efteraar-1.json',
        './prototypes/grundskema.json'
    ];

    const results = [];
    for (const path of fallbackList) {
        try {
            const res = await fetch(path);
            if (res.ok) results.push(await res.json());
        } catch (e) { /* ignorer */ }
    }
    return results;
}