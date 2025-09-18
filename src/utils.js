
const BAMZ_BODY_STYLE = "opacity: 0;"

/**
 * Inject BamZ loading code inside the HTML (will load plugin and admin top bar)
 * 
 * @param {string} src source HTML in which inject BamZ code
 * @param {string} appName the application name
 * @returns the modified HTML
 */
function injectBamz(src, appName, isPlugin){
    const BAMZ_INJECT_SRC = `<script id="bamz-app" type="text/javascript">
            window.BAMZ_APP = '${appName}' ;${isPlugin?`window.BAMZ_IN_PLUGIN = true;`:""}
            window.bamzWaitLoaded = function(){
                if(window.BAMZ_LOADED){
                    return Promise.resolve() ;
                }
                return new Promise((resolve, reject)=>{
                    const idTimeout = setTimeout(()=>{
                        reject("Not loaded, Don't wait for it inside a plugin load") ;
                    }, 5000) ;
                    window.addEventListener("openbamz.plugin.loaded", ()=>{
                        clearTimeout(idTimeout) ;
                        resolve() ;
                    });
                })
            }
            window.bamzGetPlugin = async function(pluginName){
                await window.bamzWaitLoaded() ;
                return window.BAMZ_PLUGINS[pluginName] ;
            } ;
        </script>
        <script type="module" src="/_openbamz_admin.js?appName=${appName}"></script>` ;

    let srcLower = src.toLowerCase() ;
    let indexBody = srcLower.indexOf("<body") ;
    if(indexBody !== -1){
        let indexEndBody = srcLower.indexOf(">", indexBody) ;
        let indexAttrStyle = srcLower.indexOf("style", indexBody) ;
        if(indexAttrStyle!==-1 && indexAttrStyle<indexEndBody){
            //inject style in attribute
            let indexQuote = srcLower.indexOf('"', indexAttrStyle) ;
            let indexSimpleQuote = srcLower.indexOf("'", indexAttrStyle) ;
            let indexStyleValue ;
            if(indexQuote!==-1 && indexSimpleQuote!==-1){
                indexStyleValue = Math.min(indexQuote, indexSimpleQuote) ;
            }else if (indexQuote!==-1){
                indexStyleValue = indexQuote ;
            }else if (indexSimpleQuote!==-1){
                indexStyleValue = indexSimpleQuote ;
            }
            if(indexStyleValue>indexEndBody){
                //malformated attribute, put at the end
                src = src.substring(0, indexEndBody)+` style="${BAMZ_BODY_STYLE}"`+ src.substring(indexEndBody) ;
            }else{
                indexStyleValue = indexStyleValue+1;
                src = src.substring(0, indexStyleValue)+`${BAMZ_BODY_STYLE}`+ src.substring(indexStyleValue) ;
            }
        }else{
            //no style attribute
            src = src.substring(0, indexEndBody)+` style="${BAMZ_BODY_STYLE}"`+ src.substring(indexEndBody) ;
        }
        //recompute end of <body> after style injection
        srcLower = src.toLowerCase() ;
        indexEndBody = srcLower.indexOf(">", indexBody) ;
        src = src.substring(0, indexEndBody+1)+BAMZ_INJECT_SRC+ src.substring(indexEndBody+1) ;
    }
    return src;
}

module.exports.injectBamz = injectBamz;