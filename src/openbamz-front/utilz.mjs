

export function uuidv4() {
    if(typeof(window.crypto) !== "undefined" && crypto.getRandomValues){
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function(c){
            return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16) ;
        }) ;
    }else{
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}



function loadWaiterCss(parentElement){   
    let head = document.getElementsByTagName('head')[0];

    if(parentElement && parentElement.getRootNode){
        let shadowRoot = parentElement.getRootNode();
        head = shadowRoot;
        if(shadowRoot.head){
            head = shadowRoot.head ;
        }
    }

    if(head.waiterCssLoaded){ return;}
    head.waiterCssLoaded = true ;

    const css = "@keyframes bamz_spinner { to {transform: rotate(360deg);} }" +
        ".bamz_overlay { "+
        "    position: "+(parentElement?"absolute":"fixed")+"; "+
        "    top: 0; "+
        "    left: 0; "+
        "    right: 0; "+
        "    bottom: 0; "+
        "    background-color: rgba(0, 0, 0, 0.2); "+
        //"    background-image: url('/$bamz/public/resources/modules/apps/views/logo_back_light_opa.svg');" +
        "    background-repeat: no-repeat;" +
        "    background-position: center;" +
        "    background-size: 300px;" +
        "    z-index: 1500; "+
        "  }"+
        ".bamz_waitmsg { "+
        "    color: white; "+
        "    position: absolute;"+
        "    top: calc(50% + 30px);"+
        "    left: 0;"+
        "    width: 100%;"+
        "    text-align: center;"+
        "  }"+
        ".bamz_spinner:before { "+
        "    content: '';"+
        "    box-sizing: border-box;"+
        "    position: absolute;"+
        "    top: 50%;"+
        "    left: 50%;"+
        "    width: 20px;"+
        "    height: 20px;"+
        "    margin-top: -10px;"+
        "    margin-left: -10px;"+
        "    border-radius: 50%;"+
        "    border: 2px solid #ccc;"+
        "    border-top-color: #333;"+
        "    animation: bamz_spinner .6s linear infinite;"+
        "  }" ;

    let s = document.createElement('style');
    s.setAttribute('type', 'text/css');
    if (s.styleSheet) {   // IE
        s.styleSheet.cssText = css;
    } else {        // the world
        s.appendChild(document.createTextNode(css));
    }
    head.appendChild(s);
}

export function showWaiter(parentElement){
    //from : https://stephanwagner.me/only-css-loading-spinner
    loadWaiterCss(parentElement) ;
    let waiterDiv = document.createElement("div") ;
    waiterDiv.className = "bamz_overlay" ;
    let spinnerDiv = document.createElement("div") ;
    spinnerDiv.className = "bamz_spinner" ;
    waiterDiv.appendChild(spinnerDiv) ;
    waiterDiv.idTimeout = setTimeout(()=>{
        delete waiterDiv.idTimeout ;
        if(parentElement){
            parentElement.appendChild(waiterDiv) ;
        }else{
            document.body.appendChild(waiterDiv) ;
        }
    }, 10) ;
    return waiterDiv ;
}

export function hideWaiter(waiterDiv){
    if(waiterDiv.idTimeout){
        clearTimeout(waiterDiv.idTimeout) ;
    }
    if(waiterDiv.parentElement){
        waiterDiv.parentElement.removeChild(waiterDiv) ;
    }
}


const AsyncFunction = (async () => {}).constructor;

export function waiter(promise, parentElement){
    if(promise && promise.constructor === AsyncFunction){
        promise = promise.apply(null) ;
    }
    let spinner;
    const spinnerTimeoutId = setTimeout(()=>{
        spinner = showWaiter(parentElement) ;
    }, 100) ;
    // const stack = getStack() ;
    // setTimeout(()=>{
    //     if(spinner && !spinner.done){
    //         console.log("not hidden spinner", stack) ;
    //     }
    // }, 2000) ;
    return new Promise((resolve, reject)=>{
        promise.then((result)=>{
            if(spinner){
                spinner.done = true ;
                hideWaiter(spinner) ;
            }else{
                clearTimeout(spinnerTimeoutId) ;
            }
            return resolve(result) ;
        }).catch((err)=>{
            if(spinner){
                hideWaiter(spinner) ;
            }else{
                clearTimeout(spinnerTimeoutId) ;
            }
            window.alert(err) ;
            reject(err) ;
        }) ;
    });
} 


export function loadScript(url){
    return new Promise((resolve, reject)=>{
        let document = window.document ;
        let script = document.createElement("script");
        script.async = true;
        script.type = "application/javascript";
        script.src = url;
        script.onload = function(_, isAbort) {
            if (!script.readyState || "complete" === script.readyState) {
                if (isAbort){
                    reject("can't load "+url) ;
                }else{
                    resolve() ;
                }
            }
        };
        
        script.onreadystatechange = script.onload ;
        
        script.onerror = function () {
            reject("can't load "+url) ;
        };
        
        document.head.appendChild(script);
    }) ;
}

export function loadCss(url){
    let head = this.shadowRoot;
    if(this.shadowRoot.head){
        head = this.shadowRoot.head ;
    }
    return new Promise((resolve)=>{
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = url;
        
        
        head.appendChild(link);
        resolve() ;
    }) ;
} 