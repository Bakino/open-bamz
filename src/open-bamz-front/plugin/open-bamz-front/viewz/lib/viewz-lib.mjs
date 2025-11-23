let lib = {};

window.VIEWZ_HTML_PROCESSORS = [];

export let viewzLib = lib;

import {startViewZ} from "https://cdn.jsdelivr.net/gh/Bakino/viewz@latest/lib/frameworkz.mjs" ;


window.bamzWaitLoaded().then(async ()=>{
    // const formatters = (await import(`/viewz/bindz-formatters/${window.BAMZ_APP}`)).default ;
    // //ensure all plugin are loaded before add extensions
    // for(let formatter of formatters){
    //     registerFormatter(formatter) ;
    // }

    // const extensions = (await import(`/viewz/viewz-extensions/${window.BAMZ_APP}`)).default ;
    // //ensure all plugin are loaded before add extensions
    // for(let ext of extensions){
    //     ViewZ.loadExtension(ext) ;
    // }
    if(!window.BAMZ_NO_ROUTERZ){
        startViewZ() ;
    }
})
