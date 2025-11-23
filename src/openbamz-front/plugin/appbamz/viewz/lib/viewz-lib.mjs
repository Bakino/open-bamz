let lib = {};

window.VIEWZ_HTML_PROCESSORS = [];

export let viewzLib = lib;


import {createRouter} from "../../../../routerz.mjs"

export async function startRouter(){
    try{
        let viewzContainer = document.getElementById("viewz-container") ; 
        if(!viewzContainer){
            viewzContainer = document.createElement("DIV") ;
            viewzContainer.id = "viewz-container" ;
            document.body.appendChild(viewzContainer) ;
        }
    
        let response = await fetch("routes.json");
        let routes = await response.json();
        
        let router = createRouter({
            routes,
            container: viewzContainer
        })
        router.start() ;
    }catch(err){
        console.log("Can't load viewz router", err) ; 
    }
}

startRouter() ;