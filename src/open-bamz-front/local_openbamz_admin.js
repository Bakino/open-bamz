
//script for cockpit

window.document.body.style.transition = "opacity 1s";  

window.BAMZ_PLUGINS = {} ;
window.BAMZ_PLUGINS["viewz"] = (await import('./plugin/open-bamz-front/viewz/lib/viewz-lib.mjs')) ;
// window.BAMZ_PLUGINS["dbadmin"] = (await import('/plugin/cockpit/dbadmin/lib/db-lib.mjs')) ;
window.BAMZ_PLUGINS["bootstrap5"] = (await import('./plugin/open-bamz-front/bootstrap5/lib/bootstrap-lib.mjs')) ;
// window.BAMZ_PLUGINS["ag-grid"] = (await import('/plugin/cockpit/ag-grid/lib/ag-grid-lib.mjs')) ;
// window.BAMZ_PLUGINS["users"] = (await import('/plugin/cockpit/users/lib/users-lib.mjs')) ;

window.document.body.style.opacity = 1;

window.BAMZ_LOADED = true ;

window.dispatchEvent(new CustomEvent("openbamz.plugin.loaded"));

