/** Where the desktop sidebar's folded state is kept between visits. */
export const SIDEBAR_STORAGE_KEY = "console.sidebar";

/**
 * Runs in `<head>` before the first paint and marks `<html data-sidebar>`, so
 * CSS lays out a folded sidebar before React hydrates and it never flashes open.
 */
export const SIDEBAR_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)})==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
