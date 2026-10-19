export const THEME_STORAGE_KEY = 'app_theme';

// Inlined in the root layout so the first paint already uses the right palette.
// Legacy ids from the old 12-theme picker map onto the two supported palettes.
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}')||'dark';if(p==='light'||p==='paper'){p='light'}else if(p!=='system'){p='dark'}var r=p==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
