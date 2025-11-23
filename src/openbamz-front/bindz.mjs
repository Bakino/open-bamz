
let sessionInc = 0; 
let urlBindIdInc = 0; 
let templateIdInc = 0; 

const TAG_BIND_CONTENTS = ["DIV", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "EM", "P", "UL", "OL", "LI",
"U", "I", "B", "A", "QUOTE", "TR", "SECTION", "OPTION",
"TABLE", "THEAD", "TBODY", "TD", "TH", "STRONG", "SMALL", "FORM", "Z-FORM",
"Z-TABS", "Z-TAB", "Z-TAB-TITLE", "Z-TAB-CONTENTS", "Z-FREE-LIST", "Z-MAP-MARKER", "Z-MAP-CIRCLE", "Z-MAP-POLYGON", 
"Z-CALENDAR-EVENT"
] ;
const TAG_ALWAYS_REPEAT = ["OPTION", "Z-MAP-MARKER", "Z-MAP-CIRCLE", "Z-MAP-POLYGON", "Z-CALENDAR-EVENT"] ;


/**
 * This function change the bind path of sub element with the newBasePath as prefix
 * 
 * Example : the sub element is bound with "name", after rebase with myObject, it will be bound to "myObject.name"
 * 
 * This manage the case when there is many level of inner binding, for example :
 * <div z-bind-url="/foos"> <!-- this will fetch all foos and repeat the tag as many time -->
 *    <div z-bind-url="/bars/${bar_id}"><!-- this will fetch the bar of the current foo (from bar_id of object foo) -->
 *       <h1 z-bind="name"></div><!-- this is the bar name -->
 *    </div>
 * </div>
 * 
 * After processing, the expected data structure would be : 
 * {
 *   foos : [
 *     { (...) bar: [{name: "My bar name"}] }
 *     { (...) bar: [{name: "My other bar name"}] }
 *   ]
 * }
 * 
 * so the template bind should generated as : 
 *  - foos
 *     - foos.bar.name
 * 
 * that will then be rendered from array data as :
 *   - foos.0
 *       - foos.0.bar.0.name
 *   - foos.1
 *       - foos.1.bar.0.name
 * 
 * if this example, the first level must be rebased with "foos" and the sub level recursively with "foos.bar"
 * 
 * @param {HTMLElement} el The element to rebase
 * @param {string} newBasePath The new base to use
 */
export function rebasePath(el, newBasePath){
    //console.log("REBASE ", newBasePath, el) ;
    const binAttrs = ["z-bind", "z-hide-if"] ;
    for(let att of binAttrs){
        let allSubBind = el.querySelectorAll("["+att+"]") ;
        allSubBind = [el].concat(Array.prototype.slice.apply(allSubBind) ) ;
        for(let y=0; y<allSubBind.length; y++){
            const subEl = allSubBind[y] ;
            if(!subEl.getAttribute){ continue ; }
            const strBindConfig = subEl.getAttribute(att);
            if(!strBindConfig){ continue ; }
            const subElementBindConfig = JSON.parse(strBindConfig) ;
            const bindKeys = Object.keys(subElementBindConfig) ;
            for(let k=0; k<bindKeys.length; k++){
                const key = bindKeys[k] ;
                if((key === "_value" || key === "z-bind-url") && subEl === el) { 
                    //don't rebase the value of container element, it is already on right path
                    continue;
                }
                const keyBindPath = subElementBindConfig[key] ;
                /*if((/^_globals/.test(keyBindPath) || /^\${_globals/.test(keyBindPath)
                    || /^!_globals/.test(keyBindPath)|| /^!\(_globals/.test(keyBindPath))
                    && newBasePath.indexOf("_globals") === -1
                    ){
                    continue ;
                }*/
                if((/^JSON/.test(keyBindPath) || /^\${JSON/.test(keyBindPath)
                    || /^!JSON/.test(keyBindPath)|| /^!\(JSON/.test(keyBindPath))
                    && newBasePath.indexOf("JSON") === -1
                    ){
                    continue ;
                }
                subElementBindConfig[key] = addIndexToPath(keyBindPath, null, newBasePath, true) ;
            }
            subEl.setAttribute(att, JSON.stringify(subElementBindConfig)) ;
            subEl.setAttribute("zz-rebase-path", newBasePath) ;
            subEl.removeAttribute("z-auto-rebase-name") ;
            if(subEl.tagName === "TEMPLATE" && subElementBindConfig._value){
                //This sub element is a template, we must rebase its sub elements too
                rebasePath(subEl.content, newBasePath) ;
            }
        }
    }
    //rebase inside templates (from z-hide)
    let allSubTemplate = el.querySelectorAll("template") ;
    for(let y=0; y<allSubTemplate.length; y++){
        const subEl = allSubTemplate[y] ;
        if(!subEl.getAttribute){ continue ; }
        if(binAttrs.some(att=>subEl.hasAttribute(att))){ continue ; } //already done above
        rebasePath(subEl.content, newBasePath) ;
    }

}

/**
 * Prepare all the sub elements to the binding process
 * 
 * **The first purpose is to prepare the bind settings**
 * There is 2 way to bind data, the z-bind attribute and ${} syntax. An element can have both, for example
 * 
 * ```html
 * <input type="text" z-bind="foo" style="background : ${bar?'red':'green'}" />
 * ```
 * 
 * After preparation, the bind settings of each elements are put in a map "attribute=>bind expression". So for the above example : 
 * 
 * ```javascript
 * { _value : "foo", style: "background : ${bar?'red':'green'}"}
 * ```
 * 
 * **The second purpose is to prepare the elements that can be repeated by the binding**
 * If an element with a z-bind attribute has content markup (most common case is DIV but can be any tag that accept contents), 
 * it is removed from markup and replaced by a <template> containing itself.
 * For example : 
 * ```html
 * <div z-bind="foo">
 *   <span z-bind="foo.name">
 * </div>
 * ```
 * 
 * will be replaced by 
 * ```html
 * <template z-bind="foo">
 *   <div>
 *     <span z-bind="foo.name">
 *   </div>
 * </template>
 * ```
 * 
 * The binding process will then use the template to create the content corresponding to the foo property
 * 
 * **The third purpose is to prepare the elements that have a z-bind-url so that will fetch data after the bind**
 * Example :
 * ```html
 * <div z-bind="foo">
 *    <h1 z-bind="foo.name"></h1>
 *    <h2>List of bars of this foo</h2>
 *    <ul>
 *      <li z-bind-url="/rest/bars/?foo_id=${foo.id}">
 *        <span z-bind="name"></span>
 *      </li>
 *    </ul>
 * </div>
 * ```
 * In this example, we have an object foo, inside this object we want to dynamically retrieve all bars that
 * are linked to this foo so there is an inner z-bind-url that will be repeated for each foo so each time
 * we render a foo, we must trigger a fetch of the linked bars
 * 
 * To properly prepare the binding, we must add a dynamic variable to the foo to receive the fetched bars and
 * rebase the inner element to be bind to the dynamic variable
 * ```html
 * <div z-bind="foo">
 *    <h1 z-bind="foo.name"></h1>
 *    <h2>List of bars of this foo</h2>
 *    <ul>
 *      <template z-bind="foo.dynamic_bars" z-bind-url="/rest/bars/?foo_id=${foo.id}">
 *        <span z-bind="foo.dynamic_bars.name"></span>* 
 *      </template>
 *    </ul>
 * </div>
 * ```
 * 
 * 
 * 
 * @param {HTMLElement} el The element to prepare to bind
 */
export function prepareElementsToBind(el){
    //check if we already search without result
    if(el.hasAttribute && el.hasAttribute("zz-bind-prepared")){
        return ;
    }
    if(el.__zzBindPrepared){ return ; }


    //search sub element having a bind url
    let allElementUrlBind = el.querySelectorAll("[z-bind-url]") ;
    for(let i=0; i<allElementUrlBind.length; i++){
        const subElUrlBind = allElementUrlBind[i] ;
        if(!subElUrlBind.hasAttribute("z-bind-url")){
            //the z-bind-url disappeared in the mid time, it means that it was inclosed in an other and has 
            //already been processed by the recursion, we can safely ignore it
            continue ;
        }
       
        //create a variable name that will be populate with result of bind URL
        let rebaseVarName = null;
        let needRebase = true;
        if(!subElUrlBind.hasAttribute("z-bind")){
            rebaseVarName = subElUrlBind.getAttribute("z-bind-url").replace(/[^a-zA-Z]/g, "")+"_"+(urlBindIdInc++) ;
            //set this value as bind of this element
            subElUrlBind.setAttribute("z-auto-rebase-name", rebaseVarName) ;
            subElUrlBind.setAttribute("z-bind", rebaseVarName) ;
        }
        rebaseVarName = subElUrlBind.getAttribute("z-bind");
        if(subElUrlBind.getAttribute("z-bind-scope") === "global"){
            needRebase = false;
        }
        if(subElUrlBind.isArrayContainer){
            //this element is a simple widget that render the array an not a markup
            //that will be repeated
            continue ;
        }
        prepareElementsToBind(subElUrlBind) ;
        //for all sub element, add the variable to their bind path
        if(needRebase){
            rebasePath(subElUrlBind, rebaseVarName) ;
        }
    }

    //this is the first time, search for all attributes
    let allElements = el.querySelectorAll("*") ;
    allElements = Array.prototype.slice.apply(allElements) ;
    allElements = [el].concat(allElements) ;
    for(let i = 0; i<allElements.length; i++){
        const subEl = allElements[i] ;
        const attributes = subEl.attributes;
        if(!attributes){ continue ; }
        let bindProperties = {} ;
        let hideProperties = {};
        let eventProperties = {};
        let hasBind = false ;
        let hasHideIf = false ;
        let hasEvent = false ;

        if(subEl.hasAttribute("z-show-if")){
            subEl.setAttribute("z-hide-if", "!("+subEl.getAttribute("z-show-if")+")") ;
        }

        for(let a = 0; a < attributes.length; a++){
            const att = attributes[a] ;
            if(att.name === "z-bind"){
                hasBind = true;
                if(att.value[0] === "{"){
                    //already JSON, take it and stop
                    bindProperties = JSON.parse(att.value) ;
                    break;
                }else{
                    bindProperties._value = att.value ;
                }
            }else if(att.name === "z-hide-if"){
                hasHideIf = true;
                if(att.value[0] === "{"){
                    //already JSON, take it and stop
                    hideProperties = JSON.parse(att.value) ;
                    break;
                }else{
                    hideProperties._value = att.value ;
                }
            }else if(att.value.indexOf("${") !== -1){
                hasBind = true;
                bindProperties[att.name] = att.value ;
            }
            if(att.name.indexOf("z-on") === 0){
                hasEvent = true ;
                eventProperties[att.name.substring("z-on-".length)] = att.value ;
            }
        }
        let nodeList = subEl.childNodes ;
        for(let node of nodeList){
            if(node.constructor && node.constructor.name === "Text"){
                const text = node.wholeText ;
                if(text.indexOf("${") !== -1){
                    const parts = exprExtractor(text) ;

                    for(let part of parts){
                        let nodePart ;
                        if(part.type === "text"){
                            nodePart = document.createTextNode(part.text) ;
                        }else{
                            /*nodePart = document.createElement("z-format") ;
                            if(/DATE:[a-zA-Z./:\s]+:[a-zA-Z._]+/.test(part.text)){
                                const format = part.text.substring(part.text.indexOf(":")+1, part.text.lastIndexOf(":"));
                                const bindPath = part.text.substring(part.text.lastIndexOf(":")+1);
                                nodePart.setAttribute("z-date-format", format) ;
                                nodePart.setAttribute("z-bind", JSON.stringify({_value: "${"+bindPath+"}"})) ;
                            }else if(/TR:[a-zA-Z0-9.]+/.test(part.text)){
                                const key = part.text.substring(part.text.indexOf(":")+1);
                                nodePart.setAttribute("data-i18n", key) ;
                            }else if(/[a-zA-Z.]+:[a-zA-Z.]+/.test(part.text)){
                                const [model, bindPath] = part.text.split(":") ;
                                nodePart.setAttribute("z-model", model) ;
                                nodePart.setAttribute("z-bind", JSON.stringify({_value: "${"+bindPath+"}"})) ;
                            }else{
                                nodePart.setAttribute("z-bind", JSON.stringify({_value: "${"+part.text+"}"})) ;
                            }*/
                            nodePart = document.createElement("span") ;
                            nodePart.setAttribute("z-bind", JSON.stringify({_value: "${"+part.text+"}"})) ;
                        }
                        subEl.insertBefore(nodePart, node) ;
                    }
                    subEl.removeChild(node) ;
                }
            }
        }
        if(hasEvent){
            subEl.setAttribute("z-events", JSON.stringify(eventProperties)) ;
            prepareEventListeners(subEl, eventProperties) ;
        }
        if(hasBind){
            if(subEl !== el && bindProperties._value && !subEl.isArrayContainer 
                    && TAG_BIND_CONTENTS.includes(subEl.tagName) 
                    && (subEl.children.length > 0 || TAG_ALWAYS_REPEAT.includes(subEl.tagName)) ){
                //This element has contents. we transform it as template
                const template = document.createElement("template") ;
                subEl.parentNode.insertBefore(template, subEl) ;
                template.id = "__template_binding_"+(templateIdInc++) ;
                template.content.appendChild(subEl) ;
                template.setAttribute("z-bind", JSON.stringify(bindProperties)) ;
                subEl.removeAttribute("z-bind") ;
                if(subEl.hasAttribute("z-bind-url")){
                    const bindUrl = subEl.getAttribute("z-bind-url");
                    if(subEl[bindUrl] && typeof(subEl[bindUrl]) === "function"){
                        //the bind url is a local function, copy it to the template
                        template[bindUrl] = subEl[bindUrl] ;
                    }
                    template.setAttribute("z-bind-url", bindUrl) ;
                    subEl.removeAttribute("z-bind-url") ;
                }
                if(subEl.hasAttribute("z-auto-rebase-name")){
                    template.setAttribute("z-auto-rebase-name", subEl.getAttribute("z-auto-rebase-name")) ;
                    subEl.removeAttribute("z-auto-rebase-name") ;
                }
                if(subEl.hasAttribute("z-data-modifier")){
                    const modifierName = subEl.getAttribute("z-data-modifier") ;
                    template.setAttribute("z-data-modifier", modifierName) ;
                    if(subEl[modifierName]){
                        template[modifierName] = subEl[modifierName] ;
                    }
                    subEl.removeAttribute("z-data-modifier") ;
                }
            }else{
                //This element has no contents, add its updated binding informations
                subEl.setAttribute("z-bind", JSON.stringify(bindProperties)) ;
            }
        }
        if(hasHideIf){
            subEl.setAttribute("z-hide-if", JSON.stringify(hideProperties)) ;
            if(subEl.tagName !== "TEMPLATE"){
                const template = document.createElement("template") ;
                subEl.parentNode.insertBefore(template, subEl) ;
                template.id = "__template_hideif_"+(templateIdInc++) ;
                template.content.appendChild(subEl) ;
                template.setAttribute("z-hide-if", JSON.stringify(hideProperties)) ;
                subEl.removeAttribute("z-hide-if") ;
            }
        }
    }

    if(el.setAttribute){
        el.setAttribute("zz-bind-prepared", "true") ;
    }
    el.__zzBindPrepared = true ;
}

/**
 * This function add the auto grow feature to an array
 * 
 * When the autogrow feature is activated (by setting _activeAutoPush = true), a new item
 * is automatically added when : 
 *   - the array is empty
 *   - the last item is not empty
 * 
 * The purpose is to handle the repeating input table that always have an empty line at the bottom 
 * for inputs
 * 
 * @param {Array} array array to transfom
 * @param {*} defaultValue the default value for new item
 */
function autoGrowArray(array, defaultValue = {}){
    const strDefault = JSON.stringify(defaultValue) ;
    array.autoPush = function(){
        if(this._activeAutoPush){
            let mustAddItem = false ;
            if(this.length === 0){
                mustAddItem = true ;
            }else{
                let lastLineStr = JSON.stringify(this[this.length-1], (key, value)=>{
                    if(key === "__isProxy" || key === "__isNewLine" || Array.isArray(value)){
                        return undefined ;
                    }
                    return value ;
                }) ;
                if(lastLineStr !== strDefault){
                    mustAddItem = true ;
                }
            }
            if(mustAddItem){
                const newLine = JSON.parse(strDefault) ;
                newLine.__isNewLine = true ;
                if(this.length>0){
                    delete this[this.length-1].__isNewLine ;
                }
                // console.log("add line ???? ", newLine) ;
                this.push(newLine) ;
            }
        }
    } ;
    if(array._activeAutoPush){
        array.autoPush() ;
    }
    return array ;
}

function updateObservedDataPaths(data, dataPath){
    if(dataPath.length > 30){ 
        //data path is too long, it must be recursive in some way, don't dig further
        return ; 
    }
    if(!data.__dataPaths.some(d=>d.join(".")==dataPath.join("."))){
        //same data on another path, add the path
        data.__dataPaths.push(dataPath) ;
    }
    const keys = Object.keys(data) ;
    for(let k of keys){
        if(data[k] && typeof(data[k]) === "object" && data[k].__isProxy){
            updateObservedDataPaths(data[k], dataPath.concat(k)) ;
        }
    }
}

/**
 * Observe data change on data object
 * 
 * @param {*} data data to observe
 * @param {*} changeListener change listener to call when data changed
 * @param {*} dataPath the data path
 */
function observe(data, changeListener, dataPath=[]){
    if(data.__isProxy){
        if(dataPath){
            updateObservedDataPaths(data, dataPath) ;
        }
        return data ;
    } 
    if(data && 
        (   
            data.constructor === FileList || 
            data.constructor === File ||
            (data.constructor && data.constructor.name === "File") ||
            (data.constructor && data.constructor.name === "FileList")
            )
        
        ){
        return data ;
    }

    if(!dataPath){
        dataPath = [] ;
    }

    let observedData ;
    if(Array.isArray(data)){
        // console.log("observe array ", data, dataPath) ;
        if(!data.autoPush){
            autoGrowArray(data) ;
        }
        const originalChangeListener = changeListener ;
        changeListener = (params)=>{
            // console.log("array changed", params, dataPath) ;

            originalChangeListener(params) ;
            if(isNaN(params.property)){
                if(observedData && observedData.autoPush){
                    // console.log("auto push ??? ", observedData._activeAutoPush, observedData) ;
                    observedData.autoPush() ;
                }
            }
        } ;
    }

    let clone ;
    const changeHandler = {
        set: function(target, property, value, receiver) {
            // if(target[property] === value){ return true ; } //don't test this because we need to count the number of skip update in bind so we need to apply each modification
            //console.log('>>changed ' + property + ' for ' , target , ' with value ' , JSON.parse(JSON.stringify(value||'{"null": null}')));
            if(target[property] === value && property!=="length"){
                //no change
                return true ;
            }

            //console.log('>>changed ' + property + ' for ' , target , ' with value ' , JSON.parse(JSON.stringify(value||'{"null": null}')), " data is ", data);
            let autobind = true;

            if(value !== undefined && value !== null && value._dontAutoBind){
                //given a value but explicitly ask to not bind
                autobind = false;
                value = value.value ;
            }

            if(clone.__stopAutoBind || target.__stopAutoBind || (property[0] === "_" && property !== "_id" && property !== "_index")){
                autobind = false;
            // } else if(property === "length"){
            //     autobind = false;
            }

            if(value && value.constructor === Date){
                value = value.toISOString() ;
            }
            if(value && typeof(value) === "object"){
                target.__dataPaths.forEach((dataPath)=>{
                    value = observe(value, changeListener, dataPath.concat([property])) ;
                    if(target.__stopAutoBind){ value.__stopAutoBind = true ; }
                    if(value.addListener){
                        Object.keys(target.__listeners).forEach(function(listenerPath){
                            const splittedPath = listenerPath.split(".") ;
        
                            if(Array.isArray(target) && !isNaN(property) && splittedPath[0] === "*" ){
                                console.log("ADD LISTENER FROM SET ARRAY", target, property, splittedPath) ;
                                for(let l of target.__listeners[listenerPath]){
                                    value.addListener(splittedPath.slice(1).join("."), l) ;
                                }
                            } else if(splittedPath[0] === property || splittedPath[0] === "*" ){
                                console.log("ADD LISTENER FROM SET PROP", target, property, splittedPath) ;
                                if(Array.isArray(value) && splittedPath.slice(1).join(".") !== "length"){
                                    for(let l of target.__listeners[listenerPath]){
                                        value.addListener("*."+splittedPath.slice(1).join("."), l) ;
                                    }
                                }else{
                                    for(let l of target.__listeners[listenerPath]){
                                        value.addListener(splittedPath.slice(1).join("."), l) ;
                                    }
                                }
                            }
                        }) ;
                    }
                });
            }
            if(autobind){
                
                
                const oldValue = target[property] ;
                target[property] = value;
                data[property] = value;
                
                target.__dataPaths.forEach((dataPath)=>{
                    const changedPath =  dataPath.slice() ;
                    if(!Array.isArray(target)){
                        //add property only if the change is not on an array
                        changedPath.push(property) ;
                    }
                    //console.log('changed ' + property + ' for ' , target , ' with value ' , JSON.parse(JSON.stringify(value||'{"null": null}')));
                    // console.log('apply '+dataPath.join(".")+'.' + property + ' for ' , target , ' with value ' , JSON.parse(JSON.stringify(value||'{"null": null}'), 'previous value ', property[value]), clone.__listeners[property] );
                    changeListener({target, property, value, receiver, changedPath}) ;
                });

                if(clone.__listeners[property] || clone.__listeners["*"]){
                    let listeners = (clone.__listeners[property]||[]).concat((clone.__listeners["*"]||[])) ;
                    for(let listener of listeners){
                        listener({oldValue, newValue: value, target: observedData, property}) ;
                    }
                }
            }else{
                target[property] = value;
                data[property] = value;
            }
            
            return true;
        }
    };
    
    
    if(!Array.isArray(data)){
        clone = {} ;
        let keys = Object.keys(data) ;
        for(let k of keys){
            if(data[k] && data[k].constructor === Date){
                data[k] = data[k].toISOString() ;
            }
            if(data[k] && typeof(data[k]) === "object"){
                clone[k] = observe(data[k], changeListener, dataPath.concat([k])) ;
            }else{
                clone[k] = data[k] ;
            }
        }
    }else{
        clone = [] ;
        if(data.autoPush){
            clone.autoPush = data.autoPush ;
        }
        for(let i=0; i<data.length; i++){
            if(data[i] && data[i].constructor === Date){
                data[i] = data[i].toISOString() ;
            }
            if(data[i] && typeof(data[i]) === "object"){
                clone[i] = observe(data[i], changeListener, dataPath.concat([i])) ;
            }else{
                clone[i] = data[i] ;
            }
        }
    }
    clone.__isProxy = true ;
    clone.__dataPaths = [dataPath] ;
    clone.__listeners = {} ;
    clone.addListener = function(propPath, callback){
        //console.log("ADD LISTENER "+propPath+" ON ", clone) ;
        if(!clone.__listeners[propPath]){
            clone.__listeners[propPath] = [] ;
        }
        clone.__listeners[propPath].push(callback) ;
        const splittedPath = propPath.split(".") ;
        if(splittedPath.length>0){
            let prop = splittedPath.shift() ;
            if(Array.isArray(clone) && prop === "*"){
                //listen all occurrence of array
                for(let item of clone){
                    if(item && item.addListener){
                        //console.log("ADD LISTENER TO SUB") ;
                        if(Array.isArray(item)){
                            item.addListener("*."+splittedPath.join("."), callback) ;
                        }else{
                            item.addListener(splittedPath.join("."), callback) ;
                        }
                    }
                }
            }else if(prop === "*"){
                Object.keys(clone).forEach(function(p){
                    if(clone[p] && clone[p].addListener){
                        //console.log("ADD LISTENER TO SUB") ;
                        if(Array.isArray(clone[p])){
                            clone[p].addListener("*."+splittedPath.join("."), callback) ;
                        }else{
                            clone[p].addListener(splittedPath.join("."), callback) ;
                        }
                    }
                }) ;
            }else{
                if(clone[prop] && clone[prop].addListener){
                    //console.log("ADD LISTENER TO SUB") ;
                    if(Array.isArray(clone[prop]) && splittedPath.join(".") !== "length"){
                        clone[prop].addListener("*."+splittedPath.join("."), callback) ;
                    }else{
                        clone[prop].addListener(splittedPath.join("."), callback) ;
                    }
                }
            }
        }
    } ;

    clone.stopAutoBind = function(recursive=true){
        clone.__stopAutoBind = true ;
        if(recursive){
            if(Array.isArray(clone)){
                for(let child of clone){
                    if(child.stopAutoBind && !child.__stopAutoBind){
                        child.stopAutoBind(recursive) ;
                    }
                }
            }else{
                Object.keys(clone).forEach(k=>{
                    if(clone[k] && clone[k].stopAutoBind && !clone[k].__stopAutoBind){
                        clone[k].stopAutoBind(recursive);
                    }
                });
            }
        }
    } ;
    clone.startAutoBind = function(bindNow = true, recursive = true){
        clone.__stopAutoBind = false ;
        if(recursive){
            if(Array.isArray(clone)){
                for(let child of clone){
                    if(child.startAutoBind && child.__stopAutoBind){
                        child.startAutoBind(false, recursive) ;
                    }
                }
            }else{
                Object.keys(clone).forEach(k=>{
                    if(clone[k] && clone[k].startAutoBind && clone[k].__stopAutoBind){
                        clone[k].startAutoBind(false, recursive);
                    }
                });
            }
        }
        if(bindNow){
            changeListener({target: clone, changedPath: null}) ;
        }
    } ;
    observedData = new Proxy(clone, changeHandler) ;
    return observedData ;
}

/**
 * Bind the data to the tree under the container element
 * 
 * The bind is made using the following syntaxes : 
 * 
 * The content binding
 * ```javascript
 * el = <div><span z-bind="foo"><span></div>
 * bind(el, {foo: "bar"});
 * result = <div><span>bar<span></div>
 * ```
 *
 * Binding in attributes :
 * ```javascript
 * el = <div><span z-bind="product" style="background: ${price>100?'red':'green'}"><span></div>
 * bind(el, {product: "An expensive product", price: 500});
 * result = <div><span style="background: red">An expensive product<span></div>
 * ```
 * 
 * Binding of sub array
 * ```javascript
 * el = <div>
 *   <div z-bind="products">
 *    <span z-bind="products.name"><span>
 *    <span z-bind="products.price"><span>
 *   </div>
 * </div>
 * bind(el, {products: [
 *      { name: "Pear", price: 5 },
 *      { name: "Apple", price: 500 }
 * ]);
 * result = <div>
 *   <div>
 *    <span>Pear<span>
 *    <span>5<span>
 *   </div>
 *   <div>
 *    <span>Apple<span>
 *    <span>500<span>
 *   </div>
 * </div>
 * ```
 *
 * Binding with fetch of sub data form REST URL
 * ```javascript
 * el = <div>
 *   <div z-bind="products">
 *    <h1 z-bind="products.name"></h1>
 *    <div z-bind-url="/rest/sales/?product_id=${products.id}">
 *      <span z-bind="date"></span>
 *      <span z-bind="customer.name"></span>
 *    </div>
 *   </div>
 * </div>
 * bind(el, {products: [
 *      { id: 1, name: "Pear", price: 5 },
 *      { id: 2, name: "Apple", price: 500 }
 * ]);
 * //This will automatically retrieve 2 sale array from /rest/sales?product_id=1 and /rest/sales?product_id=2
 * [ { date: "2020-02-01", customer: { name: "John"} }, { date: "2020-02-02", customer: { name: "Alice"} } ]
 * [ { date: "2020-03-01", customer: { name: "Bob"} }, { date: "2020-03-02", customer: { name: "Ginny"} } ]
 * result = <div>
 *   <div>
 *    <h1>Pear</h1>
 *    <div><span>2020-02-01</span><span>John</span></div>
 *    <div><span>2020-02-02</span><span>Alice</span></div>
 *   </div>
 * </div>
 * ```
 * 
 * The binding is an **Two-way-binding**, when a property is bound to an editable tag (input, textarea...)
 * Any change made by the user will automatically be applied to the data object and immediately re-render
 * If you want to disable this for an element, add the attribute *z-no-auto-update*
 * 
 * @param {HTMLElement} el container element
 * @param {*} data data to bind@
 */
export function bind(el, data = {}, sessionId = null, dataPathToUpdate=null, forceRefetch=false){
    if(!data){ data = {} ; }
    
    let oData = null;
    if(el._globals && !data._globals){
        data._globals = el._globals ;
    }
    oData = observe(data, ({changedPath})=>{
        //console.log("rebind ? ", el, el.zzBindData === oData, el.zzBindData, oData) ;
        if(el.zzBindData === oData){
            bind(el, oData, null, changedPath) ;
        }
    }) ;
    
    loadCss() ;
    prepareElementsToBind(el) ;
    if(!sessionId){
        sessionId = ++sessionInc ;
    }
    //console.log("["+sessionId+"] start bind ");//, el, sessionId, data) ;
    el.zzBindData = oData;
    el.__zzBindRoot = true ;
    el.setAttribute("zz-bind-root", "true") ;
    el.getData = function(){ return el.zzBindData ; } ;

    el.dispatchEvent(new CustomEvent("bindStart", {detail : {data, dataPathToUpdate}}));

    let elementsToBind = el.querySelectorAll("[z-bind]") ;
    elementsToBind = Array.prototype.slice.apply(elementsToBind) ;
    elementsToBind = [el].concat(elementsToBind) ;
    for(let i=0; i<elementsToBind.length; i++){
        const elementToBind = elementsToBind[i] ;
        if(!elementToBind.getAttribute){ continue ; }

        // if(!elementToBind.hasAttribute("z-bind-url") && elementToBind.__zzParentBinder && elementToBind.__zzParentBinder!==el){
        //     //this element belongs to an occurrence element, it will be bind 
        //     //when the occurrence is bind
        //     continue;
        // }

        const lastBindSession = elementToBind.getAttribute("zz-bind-session") ;
        if(lastBindSession && Number(lastBindSession)>=sessionId){
            //bind already done on this element
            continue ;
        }
        

        const strBindSettings = elementToBind.getAttribute("z-bind");
        if(!strBindSettings){ 
            continue ;
        }

        elementToBind.zzBindData = oData ;

        const bindSettings = JSON.parse(strBindSettings) ;
        let attributes = Object.keys(bindSettings);
        if(!attributes){ continue ; }
        attributes = attributes.sort(att=>att==="_value"?1:-1) ;
        let hasUpdate = false ;
        for(let k=0; k<attributes.length; k++){
            let att = attributes[k] ;
            const bindPath = bindSettings[att] ;
            let valueToBind = null;

            let shouldUpdate = false;

            const fullDataPathToUpdate = dataPathToUpdate?dataPathToUpdate.join("."):"";

            if(!dataPathToUpdate){
                //full update OK
                shouldUpdate = true;
            } else if(!lastBindSession){
                //never been bound
                shouldUpdate = true;
            } else if(bindPath.includes("document.") || bindPath.includes("window.")){
                //calling JS function
                shouldUpdate = true;
            } else if(elementToBind.hasAttribute("z-always-refresh")){
                //has force flag
                shouldUpdate = true;
            } else if(bindPath.indexOf(fullDataPathToUpdate) !== -1){
                //the bind path contains the data to update
                shouldUpdate = true;
            } else if(elementToBind.isArrayContainer && fullDataPathToUpdate.indexOf(bindPath) !== -1){
                //it a table
                shouldUpdate = true;
            } else if(elementToBind.tagName === "TEMPLATE" && fullDataPathToUpdate.indexOf(bindPath) !== -1){
                //it a recurring template, we need to render occurrences inside
                shouldUpdate = true;
            }

            if(!shouldUpdate){
                //console.log("IGNORE "+bindPath, dataPathToUpdate) ;
                continue ;
            }

            

            hasUpdate = true ;

            if(bindPath.indexOf("${") !== -1){
                //template syntax : "abc ${data.prop}"
                valueToBind = bindPath ;
                while(typeof(valueToBind) === "string" && valueToBind.indexOf("${") !== -1){
                    let indexStart = valueToBind.indexOf("${") ;
                    let indexEnd = endBraceIndex(valueToBind, indexStart) ;
                    if(indexEnd < indexStart){ 
                        console.error("The bind value ${...} is not correct (miss closing })") ;
                        break;
                    }
                    var expr = valueToBind.substring(indexStart+2, indexEnd) ;
                    var exprValue = runCodeExpr(elementToBind, oData, expr) ;
                    if(indexStart>0 || indexEnd<valueToBind.length -1 ){
                        if(exprValue === undefined){
                            exprValue = "" ;
                        }
                        valueToBind = valueToBind.substring(0, indexStart)+exprValue+valueToBind.substring(indexEnd+1) ;
                    }else{
                        valueToBind = exprValue ;
                    }
                }
            }else{
                valueToBind = extractFromPath(oData, bindPath) ;
            }

            if(dataPathToUpdate){
                //console.log("UPDATE "+bindPath, "with value",valueToBind, "update restricted to ", dataPathToUpdate, elementToBind) ;
            }

            

            if(att === "_value"){
                elementToBind.getData = function(){ return valueToBind ; } ;
                elementToBind.getParentData = function(){ return el.zzBindData ; } ;
                if(elementToBind.content){
                    //case of template, propagate to the insed fragment
                    elementToBind.content.getData = function(){ return valueToBind ; } ;
                    elementToBind.content.getParentData = function(){ return el.zzBindData ; } ;
                } 
                if(elementToBind.tagName === "TEMPLATE" && !valueToBind){
                    //the value to bind should be an array but the current value is null/undefined
                    //give it an array !
                    // console.log("null instead of array, init array") ;
                    valueToBind = autoGrowArray([]) ;
                    updateToPath(el.zzBindData, bindPath, {value: valueToBind, _dontAutoBind: true}, true) ;
                }
            }

            if(Array.isArray(valueToBind)){
                if(elementToBind.hasAttribute("z-repeat-auto")){
                    if(!valueToBind._activeAutoPush){
                        valueToBind._activeAutoPush = true ;
                        if(valueToBind.autoPush){
                            valueToBind.autoPush() ;
                        }
                        // console.log("ACTIVATE AUTOPSUH ", valueToBind, data, bindPath) ;
                    }
                }
            }


            if(att === "_value" && elementToBind.tagName === "TEMPLATE" && Array.isArray(valueToBind) && !elementToBind.isArrayContainer){
                elementToBind.getValue = function(){
                    return valueToBind ;
                } ;
                elementToBind.render = function(){
                    updateBoundElement(elementToBind, bindSettings, el.zzBindData);
                } ;
                elementToBind.getRootData = function(){
                    return el.zzBindData ;
                };
                const createdOccurrenceElements = createOccurrences(el, elementToBind, valueToBind, el.zzBindData, bindPath, sessionId) ;
                for(let occEl of createdOccurrenceElements){
                    //add newly created occurrence to the elements to bind
                    if(occEl.getAttribute("zz-instance-session-id") == sessionId){
                        let elementsToBindInOccurrence = occEl.querySelectorAll("[z-bind]") ;
                        elementsToBind.push(occEl) ;
                        for(let elBindInOcc of elementsToBindInOccurrence){
                            elementsToBind.push(elBindInOcc) ;
                        }
                    }
                }
            }else{
                if(att === "_value"){
                    let valueAttr = "value" ;
                    if(elementToBind.tagName && elementToBind.tagName === "INPUT" && (elementToBind.type === "checkbox")){
                        valueAttr = "checked" ;
                    }

                    elementToBind.updateValue = elementToBind.render = function(value){
                        if(value !== undefined){
                            elementToBind[valueAttr] = value ;
                        }
                        updateBoundElement(elementToBind, bindSettings, el.zzBindData);
                    } ;
                    elementToBind.getValue = function(){
                        const bindPath = bindSettings.value ;
                        return extractFromPath(el.zzBindData, bindPath) ;
                    } ;
                    
                    if(elementToBind.tagName === "DIV" || elementToBind.tagName === "SPAN" 
                        || elementToBind.tagName === "H1"|| elementToBind.tagName === "H2"
                        || elementToBind.tagName === "H3"|| elementToBind.tagName === "H4"
                        || elementToBind.tagName === "H5"
                        || elementToBind.tagName === "H6"|| elementToBind.tagName === "H7"
                        || elementToBind.tagName === "EM"|| elementToBind.tagName === "P"
                        || elementToBind.tagName === "U"|| elementToBind.tagName === "LI"
                        || elementToBind.tagName === "B"|| elementToBind.tagName === "A"
                        || elementToBind.tagName === "PRE" || elementToBind.tagName === "SMALL"
                        || elementToBind.tagName === "QUOTE"|| elementToBind.tagName === "TD"
                        || elementToBind.tagName === "I"|| elementToBind.tagName === "STRONG"){

                        if(valueToBind !== undefined && valueToBind !== null && elementToBind.innerHTML !== valueToBind){
                            elementToBind.innerHTML = valueToBind ;
                        }
                    }else {
                        if((valueToBind === undefined || valueToBind === null) && elementToBind.tagName !== "Z-FIELD-ONLY"){
                            valueToBind = "" ;
                        }
                        if(!elementToBind.skipNextBind){
                            if(elementToBind.tagName === "INPUT" && elementToBind.type === "radio"){
                                //special case of radio buttons
                                elementToBind.checked = elementToBind.value == valueToBind ;
                            }else if(valueToBind !== elementToBind[valueAttr]){
                                //the value changed, set the new value
                                // console.log("bind "+valueToBind+" ("+bindPath+") previous was "+elementToBind.value) ;
                                if(elementToBind.isArrayContainer && !valueToBind){
                                    valueToBind = autoGrowArray([]) ;
                                    updateToPath(el.zzBindData, bindPath, {value: valueToBind, _dontAutoBind: true}, true) ;
                                    valueToBind = extractFromPath(el.zzBindData, bindPath) ;
                                }
                                elementToBind[valueAttr] = valueToBind ;
                            }else if(elementToBind.notifyChange){
                                //the value is still the same object but it may
                                //have changed "inside" (case of array for example)
                                elementToBind.notifyChange() ;
                            }
                            // console.log("NOT SKIPPED bind "+valueToBind+" ("+bindPath+") previous was "+elementToBind.value) ;
                        }else{
                            // console.log("SKIP bind "+elementToBind.skipNextBind+" "+valueToBind+" ("+bindPath+") previous was "+elementToBind.value) ;
                            elementToBind.skipNextBind--;
                        }
                        
                        
                        if(!elementToBind.hasAttribute("zz-auto-update-done")){
                            elementToBind.setAttribute("zz-auto-update-done", "done") ;
                            let events = ["change"];
                            if(elementToBind.tagName === "INPUT" || elementToBind.tagName === "TEXTAREA" 
                                || elementToBind.tagName === "Z-FIELD-ONLY"){
                                events.push("keyup");
                            }
                            for(let event of events){
                                elementToBind.addEventListener(event, function(ev){
                                    updateBoundElement(elementToBind, bindSettings, elementToBind.zzBindData, 
                                            elementToBind.hasAttribute("z-no-auto-update"), ()=>{
                                        if(!elementToBind.skipNextBind){
                                            elementToBind.skipNextBind = 0;
                                        }
                                        elementToBind.skipNextBind++;
                                        // console.log("change ??? "+event+" ("+bindPath+") skip "+elementToBind.skipNextBind, event, elementToBind.value) ;
                                    });
                                }) ;
                            }
                        }
                    }
                }else if(att === "innerhtml"){
                    if(elementToBind.tagName !== "TEMPLATE"){
                        if(valueToBind !== undefined && valueToBind !== null){
                            if(elementToBind.innerHTML !== valueToBind){
                                elementToBind.innerHTML = valueToBind ;
                            }
                        }else{
                            elementToBind.innerHTML = "" ;
                        }
                    }
                }else{
                    let previousValue;
                    if(att === "z-style"){
                        att = "style" ;
                    }
                    if(att === "z-class"){
                        previousValue = elementToBind.getAttribute(att) ;
                    }
                    if(valueToBind === false){
                        elementToBind.removeAttribute(att) ;
                        elementToBind[att] = false ;
                    }else{
                        if(att === "src"){
                            //first set blank image to avoid keeping the old image
                            elementToBind.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" ;
                            setTimeout(()=>{
                                elementToBind.src = valueToBind;
                            },1) ;
                        }
                        else{
                            if(att === "z-bind-url" && valueToBind !== elementToBind.getAttribute(att)){
                                elementToBind.removeAttribute("zz-fetch-done") ;
                                // console.log("You must fetch "+valueToBind+" on ",elementToBind," (previously : "+elementToBind.getAttribute(att)+"), data ?", JSON.parse(JSON.stringify(el.zzBindData))) ;
                            }
                            if(typeof(valueToBind) === "object"){
                                elementToBind.setAttribute(att, JSON.stringify(valueToBind)) ;
                            }else if(elementToBind.getAttribute(att) !== valueToBind){
                                elementToBind.setAttribute(att, valueToBind) ;
                                if(typeof(valueToBind) === "boolean"){
                                    elementToBind[att] = valueToBind ;
                                }
                            }
                        }
                    }
                    if(att === "z-class"){
                        //for attribute z-class, we update the css class list
                        (previousValue||"").split(" ").forEach((cl)=>{
                            if(cl){
                                elementToBind.classList.remove(cl) ;
                            }
                        }) ;
                        (valueToBind||"").split(" ").forEach((cl)=>{
                            if(cl){
                                elementToBind.classList.add(cl) ;
                            }
                        }) ;
                    }
                }
            }
        }
        if(hasUpdate){
            elementToBind.setAttribute("zz-bind-session", sessionId) ;
        }
    }

    const fetchPromises = [] ;

    //only if not inside template, refetch the inside datas
    const elementBindUrl = Array.prototype.slice.apply(el.querySelectorAll("[z-bind-url]")).filter(elBindUrl=>{
        // console.log("fetch again ? ", elBindUrl, elBindUrl.getAttribute("z-bind-url"), elBindUrl.getAttribute("z-bind"), forceRefetch || !elBindUrl.hasAttribute("zz-fetch-done")) ;
        if(dataPathToUpdate && elBindUrl.hasAttribute("z-bind")){
            const strDataPathToUpdate = dataPathToUpdate.join(".") ;
            const bindAttr = elBindUrl.getAttribute("z-bind") ;
            if(bindAttr[0]=== "{"){
                const bindSettings = JSON.parse(bindAttr);
                if(bindSettings._value){
                    if(bindSettings._value !== strDataPathToUpdate && bindSettings._value.indexOf(strDataPathToUpdate) === 0){
                        // console.log("REFETCH ", bindSettings._value, strDataPathToUpdate, elBindUrl) ;
                        elBindUrl.removeAttribute("zz-fetch-done") ;
                        return true ;   
                    }
                }
            }
        }
        return forceRefetch || !elBindUrl.hasAttribute("zz-fetch-done") ;
    }) ;
    const elementBindUrlTemplates = elementBindUrl.filter(el=>el.tagName === "TEMPLATE") ;
    for(let i=0; i<elementBindUrl.length; i++){
        const elBindUrl = elementBindUrl[i] ;
        if(forceRefetch){
            elBindUrl.removeAttribute("zz-fetch-done") ;
        }
        let belongToFetchedTemplate = false ;
        for(let elTemplate of elementBindUrlTemplates){
            const occurrenceEl = elBindUrl.closest('[zz-template-id="'+elTemplate.id+'"]') ;
            if(occurrenceEl){
                //this element is inside a template occurrence that we also fetch in this bind
                //don't fetch it now, wait for the template occurrence rebind to refetch
                //to avoid child refetch 
                belongToFetchedTemplate = true; 
                break;
            }
        }
        if(!belongToFetchedTemplate){
            // console.log("["+sessionId+"] fetch again ", elBindUrl) ;
            fetchPromises.push(fetchFromBindUrl(elBindUrl)) ;
        }
    }
    fetchPromises.push(hideIf(el, oData, null, dataPathToUpdate)) ;
    
    // console.log("["+sessionId+"] how many promises ", fetchPromises.length) ;
    return Promise.all(fetchPromises).then(()=>{
        // console.log("["+sessionId+"] end bind ", el) ;
        el.dispatchEvent(new CustomEvent("bindEnd", {detail : {data, dataPathToUpdate}}));
    }) ;
}

/**
 * Update the data object from the element value
 * 
 * This will trigger a re-render (because data is observed)
 * 
 * @param {HTMLElement} elementToBind The element that is bound to a data property
 * @param {*} bindSettings The bind settings of the element
 * @param {*} data The data object to update
 */
function updateBoundElement(elementToBind, bindSettings, data, noAutoUpdate, callbackBeforeUpdate){
    const bindPath = bindSettings._value ;
    let value = elementToBind.value;
    if(elementToBind.tagName === "INPUT" && elementToBind.type === "radio" && !elementToBind.checked){
        return;
    }
    if(elementToBind.tagName === "INPUT" && elementToBind.type === "checkbox"){
        value = elementToBind.checked;
    }
    if(bindPath.indexOf("${") === -1){
        let val = value;
        if(noAutoUpdate){
            val = {value: value, _dontAutoBind: true} ;
        }
        const parentAndProp = getParentAndProp(data, bindPath) ;
        if(!parentAndProp){
            return false;
        }
        if(parentAndProp.parentObject[parentAndProp.property] == val){
            return false;
        }
        if(callbackBeforeUpdate){ callbackBeforeUpdate() ; }
        parentAndProp.parentObject[parentAndProp.property] = val ;
        return true ;
    }else{
        return false;
    }
}


/**
 * Update the data object from bound elements
 * 
 * @param {HTMLElement} el The bind root element
 * @param {*} data The data to update
 */
export function update(el, data = {}, sessionId = null ){
    if(!sessionId){
        sessionId = sessionInc++ ;
    } 
    const elementsToBind = el.querySelectorAll("[z-bind]") ;
    for(let i=0; i<elementsToBind.length; i++){
        const elementToBind = elementsToBind[i] ;
        const lastBindSession = elementToBind.getAttribute("zz-update-session") ;
        if(lastBindSession && Number(lastBindSession)>=sessionId){
            //bind already done on this element
            continue ;
        }
        elementToBind.setAttribute("zz-update-session", sessionId) ;

        const bindSettings = JSON.parse(elementToBind.getAttribute("z-bind")) ;
        if(bindSettings._value){
            const bindPath = bindSettings._value ;
            const value = elementToBind.value;
            if(bindPath.indexOf("${") === -1){
                updateToPath(data, bindPath, value) ;
            }
        }
    }
}

/**
 * Hide the element from markup configuration
 * 
 * All element having z-hide-if attribute will be tested and hide if the condition is true
 * 
 * ```javascript
 * el = <div z-bind="todos">
 *   <span z-bind="todos.name"></span><span z-hide-if="todos.done">Do this task !</span>
 * </div>
 * data = { todos: [
 *    { name: "First task", done: true } ,
 *    { name: "Second task", done: false } ,
 * }]
 * hideIf(el, data)
 * render = <div>
 *   <span>First task</span><span>Do this task !</span>
 *   <span>Second task</span>
 * </div>
 * ```
 * 
 * Note : it is called by bind()
 * 
 * @param {HTMLElement} el The root element to render
 * @param {*} data The data object
 */
function hideIf(el, data = {}, sessionId = null, dataPathToUpdate=null ){
    loadCss() ;
    if(!sessionId){
        sessionId = sessionInc++ ;
    } 
    if(!data){
        data = {} ;
    }
    // if(el._globals){
    //     data._globals = el._globals ;
    // }
    let shouldBind = false ;
    const elementsToBind = el.querySelectorAll("[z-hide-if]") ;
    for(let i=0; i<elementsToBind.length; i++){
        const elementToHide = elementsToBind[i] ;
        const lastHideSession = elementToHide.getAttribute("zz-hide-session") ;
        if(lastHideSession && Number(lastHideSession)>=sessionId){
            //hide already done on this element
            continue ;
        }
        elementToHide.setAttribute("zz-hide-session", sessionId) ;

        const bindSettings = JSON.parse(elementToHide.getAttribute("z-hide-if")) ;
        const attributes = Object.keys(bindSettings) ;
        const instanceId = elementToHide.id+"_instance" ;
        let elInstance = el.querySelector('[zz-hide-template-id="'+instanceId+'"]') ;
        for(let k=0; k<attributes.length; k++){
            const att = attributes[k] ;
            const bindPath = bindSettings[att] ;


            let shouldUpdate = false;

            const fullDataPathToUpdate = dataPathToUpdate?dataPathToUpdate.join("."):"";

            if(!dataPathToUpdate){
                //full update OK
                shouldUpdate = true;
            } else if(!lastHideSession){
                //never been bound
                shouldUpdate = true;
            } else if(bindPath.includes("document.") || bindPath.includes("window.")){
                //calling JS function
                shouldUpdate = true;
            } else if(elementToHide.hasAttribute("z-always-refresh")){
                //has force flag
                shouldUpdate = true;
            } else if(bindPath.indexOf(fullDataPathToUpdate) !== -1){
                //the bind path contains the data to update
                shouldUpdate = true;
            } else if(elementToHide.isArrayContainer && fullDataPathToUpdate.indexOf(bindPath) !== -1){
                //it a table
                shouldUpdate = true;
            } else if(elementToHide.tagName === "TEMPLATE" && fullDataPathToUpdate.indexOf(bindPath) !== -1){
                //it a recurring template, we need to render occurrences inside
                shouldUpdate = true;
            }


            if(!shouldUpdate){
                // console.log("HIDE IF IGNORE "+bindPath, dataPathToUpdate, fullDataPathToUpdate) ;
                continue ;
            }


            let condition = null;
            if(/[^a-zA-Z0-9_]/.test(bindPath.trim())){
                let expr = bindPath ;
                while(expr.indexOf("${") !== -1){
                    let indexStart = bindPath.indexOf("${") ;
                    let indexEnd = endBraceIndex(bindPath, indexStart) ; 
                    if(indexEnd < indexStart){ 
                        console.error("The bind value ${...} is not correct (miss closing })") ;
                        break;
                    }
                    expr = expr.substring(0,indexStart)+runCodeExpr(elementToHide, data,  expr.substring(indexStart+2, indexEnd))+expr.substring(indexEnd+1)  ;
                }
                condition = runCodeExpr(elementToHide, data, expr) ;
            }else{
                condition = extractFromPath(data, bindPath) ;
            }
            if(condition){
                if(elInstance){
                    elInstance.parentNode.removeChild(elInstance) ;
                }
            }else{
                if(!elInstance){
                    // console.log("SHOW ELEMENT",elementToHide) ;
                    elInstance = document.importNode(elementToHide.content, true).children[0];
                    elInstance.getData = elInstance.getRootData = ()=>{
                        return data;
                    } ;
                    elInstance.setAttribute("zz-hide-template-id",  instanceId) ;
                    elInstance.setAttribute("zz-hide-instance-el",  instanceId) ;
                    elementToHide.parentNode.insertBefore(elInstance,elementToHide) ;
                    elInstance.data = data;
                    runSubScripts(elInstance, el._globals,  ()=>{ return elInstance.data; },  ()=>{ return elInstance.data; }) ;
                    shouldBind = true;

                    const subElEvents = Array.prototype.slice.apply(elInstance.querySelectorAll("[z-events]")) ;
                    if(elInstance.hasAttribute("z-events")){
                        subElEvents.push(elInstance) ;
                    }
                    for(let z=0; z<subElEvents.length; z++){
                        const subElEv = subElEvents[z] ;
                        const eventProperties = JSON.parse(subElEv.getAttribute("z-events")) ;
                        prepareEventListeners(subElEv, eventProperties) ;
                    }

                    elementToHide.dispatchEvent(new CustomEvent("instanced", {bubbles: true, detail : {instanceEl: elInstance}}));
                }else{
                    elInstance.data = data;
                    elInstance.getData = ()=>{
                        if(elementToHide.hasAttribute("zz-rebase-path")){
                            return extractFromPath(data, elementToHide.getAttribute("zz-rebase-path")) ;
                        }else{
                            return data ;
                        }
                    } ;
                    elInstance.getRootData = ()=>{
                        return data;
                    } ;
                }
            }
        }
    }
    if(shouldBind){
        return bind(el, data, sessionId, dataPathToUpdate) ;
    }
    return Promise.resolve() ;
}


function endBraceIndex(expr, openIndex){
    let startedBraceCount = 0;
    for(let i = openIndex+2; i<expr.length; i++){
        const c = expr[i] ;
            //I am in an expression
        if(c === "{"){
            //start a brace inside the expression, next brace should not be taken as the end of the expression
            startedBraceCount++;
        }else if(c === "}"){
            //this is a end brace
            if(startedBraceCount === 0){
                //all inside brace are closed, this the end of the expression
                return i;
            }else{
                //still have opened brace, close it
                startedBraceCount-- ;
            }
        }
    }   
    return -1;
}

function exprExtractor(expr){
    if(expr.indexOf("${") !== -1){
        //this is a complex expression, get each expressions to process them independently
        const parts = [] ;
        let isInExpr = false ;
        let startedBraceCount = 0;
        let currentText = "" ;
        for(let i = 0; i<expr.length; i++){
            const c = expr[i] ;
            if(isInExpr){
                //I am in an expression
                if(c === "{"){
                    //start a brace inside the expression, next brace should not be taken as the end of the expression
                    startedBraceCount++;
                    currentText += c ;
                }else if(c === "}"){
                    //this is a end brace
                    if(startedBraceCount === 0){
                        //all inside brace are closed, this the end of the expression
                        parts.push({
                            type: "expr",
                            text: currentText 
                        }) ;
                        currentText = "" ;
                        isInExpr = false;
                    }else{
                        //still have opened brace, close it
                        startedBraceCount-- ;
                        currentText += c ;
                    }
                }else{
                    //append to the current text
                    currentText += c ;
                }
            }else if(c === "$" && expr[i+1] === "{"){
                i++ ;
                isInExpr = true ;
                startedBraceCount = 0;
                if(currentText){
                    parts.push({
                        type: "text",
                        text: currentText 
                    }) ;
                    currentText = "" ;
                }
            }else{
                currentText += c ;
            }
        }
        if(currentText){
            parts.push({
                type: "text",
                text: currentText 
            }) ;
            currentText = "" ;
        }
        return parts ;
    }else{
        return [
            { type: "text", text: expr }
        ] ;
    }
}

function tokenizeExpr(exprs, tokens){
    if(tokens.length === 0){ return exprs ; }
    const token = tokens[0] ;
    const resultsExprs = [] ;
    for(let expr of exprs){

        let currentWord = "" ;
        let inQuote = false;
        let currentQuote = null ;
        for(let i=0; i<expr.length; i++){
            const c = expr[i] ;
            if(inQuote){
                currentWord += c ;
                if(c === currentQuote){
                    inQuote = false;
                }
            }else if(c === "'" || c === '"'){
                currentWord += c ;
                inQuote = true;
                currentQuote = c;
            }else if(c === token[0]){
                let isToken = true ;
                for(let y=1; y<token.length; y++){
                    if(expr[i+y] !== token[y]){
                        isToken = false ;
                        break;
                    }
                }
                if(isToken){
                    resultsExprs.push(currentWord.trim()) ;
                    resultsExprs.push(token);
                    currentWord = "" ;
                    i += token.length - 1 ;
                }else{
                    currentWord += c ;
                }
            }else{
                currentWord += c ;
            }
        }
        if(currentWord){
            resultsExprs.push(currentWord.trim()) ;
        }
    }
    return tokenizeExpr(resultsExprs, tokens.slice(1)) ;
}

/**
 * Update the path to the current occurrence.
 * 
 * The path is always set as absolute path without index.
 * For example : 
 *  - myarray.myprop should be updated to myarray.0.myprop, myarray.1.myprop, etc...
 * 
 * In case when the root data object itself is the array, the transformation should be
 *  - myprop should be updated to $this.0.myprop, $this.1.myprop, etc...
 * 
 * It should also take care of complex expression like "I am ${pupils.age} years old and my name is ${pupils.name}"
 * 
 * @param {string} expr the expression there is 2 forms
 *   - simple path (ex : myobject.myprop)
 *   - complex expression with one or many litteral (ex: "prefix${myobject.prop}-${myobject.bar}")
 * @param {string} baseBindPath the path of the array object. if not given, its means that the data object itself is an array (in this case it must be referred as $this)
 * @param {number} index the index of the current occurrence
 */
function addIndexToPath(expr, baseBindPath, index, isRebase){
    if(expr.indexOf("${") !== -1){
        //this is a complex expression, get each expressions to process them independently
        const parts = exprExtractor(expr) ;

        const modifiedExpr = parts.map((part)=>{
            if(part.type === "text"){ 
                return part.text ;
            }else{
                return "${"+addIndexToPath(part.text, baseBindPath, index, isRebase)+"}" ;
            }
        }).join("") ;
        // console.log(expr, parts, modifiedExpr) ;
        return modifiedExpr.trim() ;
    }
    expr = expr.trim() ;
    if(/^[!(]{0,2}document\..*\(.*\).*$/.test(expr)){
        //calling function on document
        return expr ;
    }
    const exprWords = tokenizeExpr([expr], [" ", "?", "!", ":", "||", "===", "==", "!==", "!=", "&&", "/", "*", "%", "+", "-", /*, "[", "]"*/]) ;

    if(exprWords.length>1){
        for(let i=0; i<exprWords.length; i++){
            let word = exprWords[i] ;
            if(word.length>1){
                while(["!", "("].includes(word[0]) && word.length>0){
                    exprWords.splice(i, 0, word[0]) ;
                    i++;
                    word = word.substring(1) ;
                    exprWords[i] = word;
                }
                while([")"].includes(word[word.length-1]) && word.length>0){
                    if(/\w+\([^)]*\)$/.test(word)){ 
                        //function call, stop
                        break;
                    }
                    exprWords.splice(i+1, 0, word[word.length-1]) ;
                    word = word.substring(0, word.length-1) ;
                    exprWords[i] = word;
                }
            }
            if(/[a-zA-Z]/.test(word) && /^[a-zA-Z0-9_.]+/.test(word)){
                exprWords[i] = addIndexToPath(word, baseBindPath, index, isRebase) ;
            }
        }
        return exprWords.join("") ;
    }
    
    //this is a simple expression

    if(expr === "true" || expr === "false"){
        return expr ;
    }
    
    if(/^_globals/.test(expr) && (!baseBindPath || baseBindPath.indexOf("_globals") === -1)){
        //it refers to globals, don't rebase
        return expr ;
    }
    if(/^window\./.test(expr) && (!baseBindPath || baseBindPath.indexOf("window") === -1)){
        //it refers to window, don't rebase
        return expr ;
    }
    if(/^document\./.test(expr) && (!baseBindPath || baseBindPath.indexOf("document") === -1)){
        //it refers to document, don't rebase
        return expr ;
    }
    if(/^JSON/.test(expr) && (!baseBindPath || baseBindPath.indexOf("JSON") === -1)){
        //it refers to JSON, don't rebase
        return expr ;
    }
    if(/^\w+\([^)]*\)$/.test(expr)){
        //it is a function call, don't rebase
        return expr ;
    }

    if(/^moment\(.*\)$/.test(expr)){
        //it is a function call, don't rebase
        return expr ;
    }
    
    

    
    if(baseBindPath){
        //the array is not the root data
        expr = expr.replace(new RegExp(baseBindPath.replace(/\$/g, "\\$")+".\\$INDEX\\$", "g"), index) ;

        //note that the replace should work for myarray.myprop or myobject.myarray.myprop

        // replace ^myarray. by ^myarray.0.
        let modifiedExpr = expr.replace(new RegExp("^"+baseBindPath.replace(/\$/g, "\\$")+"\\."), baseBindPath+"."+index+".") ;
        // replace .myarray. by .myarray.0.
        modifiedExpr = modifiedExpr.replace(new RegExp("\\."+baseBindPath.replace(/\$/g, "\\$")+"\\."), "."+baseBindPath+"."+index+".") ;
        // replace !(myarray. by !(myarray.0.
        modifiedExpr = modifiedExpr.replace(new RegExp("!\\("+baseBindPath.replace(/\$/g, "\\$")+"\\."), "!("+baseBindPath+"."+index+".") ;
        // replace !myarray. by !myarray.0.
        modifiedExpr = modifiedExpr.replace(new RegExp("!"+baseBindPath.replace(/\$/g, "\\$")+"\\."), "!"+baseBindPath+"."+index+".") ;
        // replace ^myarray$ by myarray.0
        modifiedExpr = modifiedExpr.replace(new RegExp("^"+baseBindPath.replace(/\$/g, "\\$")+"$"), baseBindPath+"."+index) ;

        return modifiedExpr ;
    }else{
        let modifiedExpr = null;
        let isNegated = false ;
        if(/^!/.test(expr)){
            isNegated = true;
            expr = expr.substring(1);
        }
        expr = expr.trim() ;
        let hasParenthesis = false ;
        if(/^\(.*\)$/.test(expr)){
            hasParenthesis = true ;
            expr = expr.substring(1,expr.length-1) ;
        }
        expr = expr.trim() ;
        if(isRebase){
            //case of rebase (index is a property not an array index)

            //"models.columns.type !== 'string' && models.columns.type !== 'email' && models.columns.type !== 'password'"

            modifiedExpr = index+"."+expr ;
        }else{
            //the array is the route data, $this.0. should be added at the beggining
            modifiedExpr = "$this."+index+"."+expr ;
        }
        if(hasParenthesis){
            modifiedExpr = "("+modifiedExpr+")" ;
        }
        if(isNegated){
            modifiedExpr = "!"+modifiedExpr ;
        }
        return modifiedExpr ;
    }
}

/**
 * Prepare the bind settings of sub element of this occurrence
 * 
 * Because the original bind settings don't include array indexes, we must add the index
 * to the path when we create the occurrence element markup
 * 
 * For example, the template markup of this occurrence is : 
 * ```javascript
 * <span z-bind="todos.name"></span>
 * ```
 * 
 * When create the markup of the item index 3 (that must render todos[3]), the occurrence
 * markup must be : 
 * ```javascript
 * <span z-bind="todos.3.name"></span>
 * ```
 * 
 * @param {HTMLElement} occurrenceEl The occurrence element
 * @param {string} baseBindPath The base bind path of the array
 * @param {number} occurrenceIndex The index number of this occurence
 */
export function prepareOccurrenceSubElements(occurrenceEl, baseBindPath, occurrenceIndex){
    occurrenceEl.__zzOccurrencePrepared = true ;

    //Look to sub element that are have automatic binding
    //they should be rebase to this base, if not they will
    //erase each others
    let subElementsAutoRebase = occurrenceEl.querySelectorAll("[z-auto-rebase-name]") ;
    for(let b=0; b<subElementsAutoRebase.length; b++){
        const subElement = subElementsAutoRebase[b] ;
        if(!subElement.getAttribute){ continue ; }
        const subElementBindPath = subElement.getAttribute("z-bind") ;
        if(!subElementBindPath){ continue ; }
        if(subElementBindPath[0] === "{"){
            const subElementBindConfig = JSON.parse(subElementBindPath) ;
            if(subElementBindConfig._value){
                subElementBindConfig._value = baseBindPath+"."+subElementBindConfig._value ;
            }
            subElement.setAttribute("z-bind", JSON.stringify(subElementBindConfig)) ;
        }else{
            subElement.setAttribute("z-bind", baseBindPath+"."+subElementBindPath) ;
        } 
        rebasePath(subElement, baseBindPath) ;
    }



    let subTemplates = occurrenceEl.querySelectorAll("template") ;
    if(occurrenceEl.tagName === "TEMPLATE"){
        //the occurrence itself is a template
        subTemplates = [occurrenceEl] ;
    }
    for(let b=0; b<subTemplates.length; b++){
        const subTemplate = subTemplates[b] ;
        subTemplate.id += "_occ_"+occurrenceIndex ;
        prepareOccurrenceSubElements(subTemplate.content, baseBindPath, occurrenceIndex) ;
    }

    let subElementsToBind = occurrenceEl.querySelectorAll("[z-bind]") ;
    subElementsToBind = Array.prototype.slice.apply(subElementsToBind) ;
    subElementsToBind = [occurrenceEl].concat(subElementsToBind) ;
    for(let b=0; b<subElementsToBind.length; b++){
        const subElement = subElementsToBind[b] ;
        if(!subElement.getAttribute){ continue ; }
        const subElementBindPath = subElement.getAttribute("z-bind") ;
        if(!subElementBindPath){ continue ; }
        if(subElementBindPath[0] === "{"){
            const subElementBindConfig = JSON.parse(subElementBindPath) ;
            const bindKeys = Object.keys(subElementBindConfig) ;
            for(let k=0; k<bindKeys.length; k++){
                const key = bindKeys[k] ;
                if((key === "_value" || key === "z-bind-url") && subElement === occurrenceEl) { 
                    //don't rebase the value of container element, it is already on right path
                    continue;
                }
                const keyBindPath = subElementBindConfig[key] ;
                subElementBindConfig[key] = addIndexToPath(keyBindPath, baseBindPath, occurrenceIndex) ;
            }
            subElement.setAttribute("z-bind", JSON.stringify(subElementBindConfig)) ;
        }else{
            subElement.setAttribute("z-bind", addIndexToPath(subElementBindPath, baseBindPath, occurrenceIndex)) ;
        } 
        subElement.__zzParentBinder = occurrenceEl ;
    }
    let subElementsToHide = occurrenceEl.querySelectorAll("[z-hide-if]") ;
    subElementsToHide = Array.prototype.slice.apply(subElementsToHide) ;
    subElementsToHide = [occurrenceEl].concat(subElementsToHide) ;
    for(let b=0; b<subElementsToHide.length; b++){
        const subElement = subElementsToHide[b] ;
        if(!subElement.getAttribute){ continue ; }
        const subElementBindPath = subElement.getAttribute("z-hide-if") ;
        if(!subElementBindPath){ continue ; }
        if(subElementBindPath[0] === "{"){
            const subElementBindConfig = JSON.parse(subElementBindPath) ;
            const bindKeys = Object.keys(subElementBindConfig) ;
            for(let k=0; k<bindKeys.length; k++){
                const key = bindKeys[k] ;
                const keyBindPath = subElementBindConfig[key] ;
                subElementBindConfig[key] = addIndexToPath(keyBindPath, baseBindPath, occurrenceIndex) ;
            }
            subElement.setAttribute("z-hide-if", JSON.stringify(subElementBindConfig)) ;
        }else{
            subElement.setAttribute("z-hide-if", addIndexToPath(subElementBindPath, baseBindPath, occurrenceIndex)) ;
        }
        if(subElement.hasAttribute("zz-rebase-path")){
            subElement.setAttribute("zz-rebase-path", addIndexToPath(subElement.getAttribute("zz-rebase-path"), baseBindPath, occurrenceIndex)) ;
        }
    }

    let subElementsWithEvens = occurrenceEl.querySelectorAll("[z-events]") ;
    subElementsWithEvens = Array.prototype.slice.apply(subElementsWithEvens) ;
    subElementsWithEvens = [occurrenceEl].concat(subElementsWithEvens) ;
    for(let b=0; b<subElementsWithEvens.length; b++){
        const subElement = subElementsWithEvens[b] ;
        if(!subElement.getAttribute){ continue ; }
        const subElementEvents = subElement.getAttribute("z-events") ;
        if(!subElementEvents){ continue ; }
        if(subElementEvents[0] === "{"){
            const subElementEventConfig = JSON.parse(subElementEvents) ;
            prepareEventListeners(subElement, subElementEventConfig) ;
        }
    }
}

let occurrenceDocumentInc = 0;

function searchInTemplates(element, id){
    const allTemplates = element.querySelectorAll("template") ;
    for(let template of allTemplates){
        let foundEl = template.content.querySelector("#"+id) ;
        if(!foundEl){
            foundEl = searchInTemplates(template.content, id) ;
        }
        if(foundEl){
            return { template, el: foundEl } ;
        }
    }
    return null;
}

export function runInContext(el, args, code){
    const instanceEl = getInstanceElement(el) ;
    const context = currentContext(el) ; 

    const localDocument = el.closest("[zz-bind-root]") || instanceEl.__zRootNode || el.getRootNode() ;

    //const localDocument = instanceEl.__zRootNode || el.getRootNode() ;
    const getRootData = localDocument.getData ;
    const rootData = getRootData?getRootData():{} ;
    const funcArgs = {
        document: localDocument,
        instanceEl: instanceEl,
        context: context,
        getData: instanceEl.getData, 
        getArrayData: instanceEl.getArrayData, 
        getRootData: instanceEl.getRootData, 
        _globals: rootData._globals||{}, 
        actions: rootData._globals?rootData._globals.actions:{},
        screenData: localDocument&&localDocument.getData?localDocument.getData():{},
        itemData: instanceEl&&instanceEl.getData?instanceEl.getData():{},
        ...(localDocument.contextz??{})
    } ;
    Object.keys(args).forEach((k)=>{
        funcArgs[k] = args[k] ;
    }) ;
    const argsKeys = Object.keys(funcArgs);
    if(code.indexOf("\n") === -1 && code.indexOf("return ") === -1){
        code = "return "+code ;
    }
    const func = new Function(argsKeys, code) ;
    return func.apply(el, argsKeys.map(arg=>funcArgs[arg])) ;
}

function prepareEventListeners(el, events){
    if(el.zzEventsPrepared){ return ; }
    el.zzEventsPrepared = true ;
    Object.keys(events).forEach((eventName)=>{
        function runEv(ev){
            // setTimeout(function(){
            runInContext(el, {event: ev}, events[eventName]) ;
            // }, 1) ;
        }
        if(eventName === "enter"){
            el.addEventListener("keyup", (ev)=>{
                if(ev.keyCode === 13){
                    runEv(ev) ;
                }
            });
        }else if(eventName === "click" && !el.hasAttribute("z-allow-quick-click")){
            el.addEventListener(eventName, (function (ev) {
                //event is click and detail is > 1, it is a second or third click, don't trigger event don't emit twice on double click
                if(eventName === "click" && ev.detail>1){ 
                    return; 
                }

                setTimeout(()=>{
                    runEv.bind(this)(ev) ;
                    if(el.tagName === "BUTTON"){
                        el.disabled = true;
                        setTimeout(() => { el.disabled = false; }, 1000) ;
                    }
                }, 1) ;
            }));
        }else{
            el.addEventListener(eventName, runEv) ;
        }
    }) ;
}

/**
 * Run script that is included inside a rendered occurrence
 * 
 * The run is done after the markup is added to the DOM
 * 
 * ```javascript
 * <div z-bind="products">
 *   <h1 z-bind="products.name"></h1>
 *   <button type="button" id="mybutton">Show details</button>
 *   <div style="display: none" id="details">This contains details</div>
 *   <script>
 *      document.querySelector("#mybutton").addEventListener("click", ()=>{
 *          document.querySelector("#details").style.display = "block" ;
 *      }) ;
 *   </script>
 * </div>
 * ```
 * **Notes** : the "document" object received by the script is not the page document
 * but the container element of the occurrence (in the example the <div z-bind="products">)
 * so you can't use document.getElementById (but you can use document.querySelector instead)
 * 
 * @param {HTMLElement} documentEl the container element
 */
export function runSubScripts(documentEl, globals, data, rootData){
    if(!globals){ globals = {} ;}
    const docId = "documentElements_"+(occurrenceDocumentInc++) ;
    documentEl.getElementById = function(id){
        const el = this.querySelector("#"+id) ;
        if(!el){
            const inTemplates = searchInTemplates(this, id);
            if(inTemplates){
                //the wanted element is inside an hidden sub template
                return {
                    addEventListener: function(event, callback){
                        inTemplates.template.addEventListener("instanced", (ev)=>{
                            let elId = null;
                            if(ev.detail.instanceEl.id === id){
                                elId = ev.detail.instanceEl ;
                            }else{
                                elId = ev.detail.instanceEl.querySelector("#"+id) ;
                            }
                            if(!elId){
                                throw "Missing element id "+id ;
                            }
                            elId.addEventListener(event, callback) ;
                        }) ;
                    }
                } ;
            }else{
                //no matching id
                return null;
            }
        }else{
            return el;
        }
    } ;
    window[docId] = {documentEl, globals, data, rootData} ;
    const scripts = documentEl.querySelectorAll("script") ;
    for(let i=0; i<scripts.length; i++){
        const script = scripts[i] ;
        if(script.parentElement && script.parentElement.tagName === "Z-SCRIPT"){
            continue ; 
        }
        if(script.hasAttribute("z-run-global")){
            const headScript = document.createElement("script") ;
            headScript.innerHTML = script.innerHTML ;
            document.head.appendChild(headScript) ;
        }else{
            window[docId+"_script_"+i] = {
                bindData : data
            };
            if(script.hasAttribute("z-bind")){
                window[docId+"_script_"+i].bindData = ()=>{
                    const zBind = script.getAttribute("z-bind") ;
                    if(zBind[0] === "{"){
                        const bindSettings = JSON.parse(zBind) ;
                        if(bindSettings._value){
                            let rData = window[docId].rootData() ;
                            return extractFromPath(rData, bindSettings._value) ;
                        } 
                    }
                    return window[docId].data() ;
                } ;
            }
            const headScript = document.createElement("script") ;
            headScript.innerHTML = `
            (function(document, getData, getRootData, getBindData, ${Object.keys(globals).join(",")}){
                ${script.innerHTML}
            })(window["${docId}"].documentEl, window["${docId}"].data, window["${docId}"].rootData, window["${docId}_script_${i}"].bindData, ${Object.keys(globals).map(k=>'window["'+docId+'"].globals["'+k+'"]').join(", ")}) ;
            
            //# sourceURL=/${documentEl.id||documentEl.getAttribute("zz-hide-template-id")}/script_${i}.js
            ` ;
            document.head.appendChild(headScript) ;
        }
    }
}


function createOccurrences(rootEl, elementToBind, valueToBind, parentData, bindPath, sessionId){
    if(!parentData){
        parentData = valueToBind ;
    }

    // console.log("Create occurrence on ", elementToBind, parentData, valueToBind) ;

    elementToBind.content.getData = function(){ return valueToBind ; } ;
    elementToBind.content.getArrayData = function(){ return valueToBind ;} ;
    elementToBind.content.getParentData = function(){ return parentData ; } ;
    
    if(!sessionId){
        sessionId = sessionInc++ ;
    } 
    if(elementToBind.getAttribute("zz-bind-session") == sessionId) {
        return;
    }
    elementToBind.setAttribute("zz-bind-session", sessionId) ;
    let templateId = elementToBind.id ;
    let allOccurrenceEls = elementToBind.parentNode.querySelectorAll('[zz-template-id="'+templateId+'"]') ;
    for(let a=0; a < valueToBind.length; a++){
        let occurrenceEl = allOccurrenceEls[a] ;
        if(!occurrenceEl){
            window.__zzCurrentCreatingOccurence = valueToBind[a] ;
            window.__zzCurrentRootNode = elementToBind.getRootNode() ;
            elementToBind.content.firstElementChild.setAttribute("zz-creating-occurence", "true");
            const importedNode = document.importNode(elementToBind.content, true) ;
            elementToBind.content.firstElementChild.removeAttribute("zz-creating-occurence");
            
            occurrenceEl = importedNode.children[0];
            runSubScripts(occurrenceEl, parentData._globals, ()=>{ return valueToBind[a]; }, ()=>{ return elementToBind.getRootData(); }) ;
            occurrenceEl.setAttribute("zz-template-id", templateId) ;
            occurrenceEl.setAttribute("zz-instance-el", templateId) ;
            occurrenceEl.setAttribute("zz-instance-session-id", sessionId) ;
            elementToBind.parentNode.insertBefore(occurrenceEl,elementToBind) ;
            if(elementToBind.hasAttribute("z-bind")){
                const bindSettings = JSON.parse(elementToBind.getAttribute("z-bind")) ;
                delete bindSettings._value;
                delete bindSettings["z-bind-url"];
                occurrenceEl.setAttribute("z-bind", JSON.stringify(bindSettings)) ;
            }
            prepareOccurrenceSubElements(occurrenceEl, bindPath, a) ;

            const subElEvents = occurrenceEl.querySelectorAll("[z-events]") ;
            for(let z=0; z<subElEvents.length; z++){
                const subElEv = subElEvents[z] ;
                const eventProperties = JSON.parse(subElEv.getAttribute("z-events")) ;
                prepareEventListeners(subElEv, eventProperties) ;
            }

            elementToBind.dispatchEvent(new CustomEvent("instanced", {bubbles: true, detail : {instanceEl: occurrenceEl}}));
        }
    }
    allOccurrenceEls = elementToBind.parentNode.querySelectorAll('[zz-template-id="'+templateId+'"]') ;
    for(let a=0; a < valueToBind.length; a++){
        let occurrenceEl = allOccurrenceEls[a] ;
        occurrenceEl._globals = elementToBind._globals ;
        
        // console.log("BIND OCCURENCE", occurrenceEl, parentData) ;
        
        occurrenceEl.getArrayData = function(){ return valueToBind ;} ;
        occurrenceEl.getData = function(){ return valueToBind[a] ;} ;
        
        occurrenceEl.setAttribute("zz-bind-occurence-index", a) ;
        // occurrenceEl.setAttribute("zz-bind-session", sessionId) ;
        const zBindAttr = elementToBind.getAttribute("z-bind") ;
        if(zBindAttr){
                // const zBind = JSON.parse(zBindAttr) ;
                //keep the original bind settings because if we use save after, it need to know the 
                //bind path to get the data to save
                occurrenceEl.setAttribute("zz-bind", zBindAttr) ;
            
            //already done above
        //     //add the bind without the value part because we may have bind on 
        //     //attribute that must be rendered
        //     delete zBind._value ;
        //     delete zBind["z-bind-url"] ;
        //     occurrenceEl.setAttribute("z-bind", JSON.stringify(zBind)) ;
        }
        occurrenceEl.__zzBindOrigData = elementToBind.__zzBindOrigData ;
    }
    if(allOccurrenceEls.length > valueToBind.length){
        allOccurrenceEls = Array.prototype.slice.apply(allOccurrenceEls) ;
        while(allOccurrenceEls.length > valueToBind.length){
            const elementToRemove = allOccurrenceEls.pop() ;
            // if(allOccurrenceEls.length === 0){
                //hide the first element, don't remove it for next render
            //     elementToRemove.classList.add("d-none") ;
            // }else{
                elementToRemove.parentNode.removeChild(elementToRemove) ;
            // }
    
        }
    }


    // for(let a=0; a < allOccurrenceEls.length; a++){
    //     let occurrenceEl = allOccurrenceEls[a] ;
    // }

    //set the bind done id on the occurrence inside the template
    //useful in the case when no occurrence is created
    // if(elementToBind.content.firstElementChild){
    //     elementToBind.content.firstElementChild.setAttribute("zz-bind-session", sessionId) ;
    // }
    
    return allOccurrenceEls ;
}

function extractPatchData(dataOrig, dataNew){
    if(!dataNew){ return null; }
    if(!dataOrig){ dataOrig = {} ; }
    if(dataOrig.__isBinary && dataNew.__isBinary){
        //spacial case of binary object
        if(dataOrig._id ===  dataNew._id){
            //id not changed, no modification
            return null;
        }else{
            //id changed, give new data
            return dataNew ;
        }
    }
    let dataPatch = {};
    const keys = Object.keys(dataNew) ;
    let hasModification = false;
    for(let i=0; i<keys.length; i++){
        const key = keys[i] ;
        if(key.indexOf("__") === 0){ continue ; }
        if(key === "_globals"){ continue ; }
        let origValue = dataOrig[key];
        const newValue = dataNew[key];
        if(typeof(newValue) === "function"){ continue ; }
        let isSameValue = (origValue == newValue) ;
        if(!isSameValue && origValue == null && newValue === ""){
            isSameValue = true ;
        }else if(!isSameValue && origValue == "" && newValue == null){
            isSameValue = true ;
        }else if(!isSameValue && origValue == undefined && newValue === ""){
            isSameValue = true ;
        }
        if(!isSameValue) {
            if(Array.isArray(newValue)){
                if(!origValue || !Array.isArray(origValue)){
                    origValue = [] ;
                }
                if(
                    (newValue.length>0 && typeof(newValue[0]) === "string") ||
                    (origValue.length>0 && typeof(origValue[0]) === "string")
                    ){
                    //array of string, not array of objects
                    if(newValue.join(",") !== origValue.join(",")){
                        hasModification = true;
                        dataPatch[key] = newValue ;
                    }
                }else{
                    let patchArray = [] ;
                    let origViewedIndexes = [] ;
                    for(let i=0; i<newValue.length; i++){
                        const newOcc = newValue[i];
                        if(newOcc.__isNewLine){ continue ; }
                        let origOcc = origValue[i];
                        let foundIndex = i;
                        if(newOcc._id){
                            origOcc = origValue.find((o,y)=>{ 
                                if(o._id === newOcc._id){
                                    foundIndex = y;
                                    return true ;
                                }
                            }) ;
                        }
                        if(origOcc){
                            origViewedIndexes.push(i);
                        }
                        let occModified = extractPatchData(origOcc, newOcc) ;
                        if(occModified === null){
                            occModified = {} ;
                        }
                        if(!occModified && foundIndex !== i){
                            occModified = {};
                        }
                        if(occModified){
                            hasModification = true ;
                        }
                        if(origOcc && origOcc._id && !newValue.some(o=>o!==newOcc && o._id === origOcc._id)){
                            if(!occModified){ occModified = {} ;}
                            occModified._id = origOcc._id ;
                        }
                        patchArray.push(occModified) ;
                    }
                    if(origViewedIndexes.length<origValue.length){
                        //new array has less entries than orig one
                        hasModification = true ;
                    }
                    dataPatch[key] = patchArray ;
                }
            }else{
                if(newValue && newValue.constructor === File){
                    hasModification = true;
                    dataPatch[key] = newValue ;
                }else{
                    const typeOfOrig = typeof(origValue) ;
                    if(typeOfOrig === "object" && origValue !== null && newValue !== null){
                        const subObjectPatch = extractPatchData(origValue, newValue) ;
                        if(subObjectPatch){
                            dataPatch[key] = subObjectPatch ;
                        }
                    } else {
                        hasModification = true;
                        dataPatch[key] = newValue ;
                    }
                }
            }
        }
    }
    if(hasModification){
        return dataPatch ;
    }else {
        return null;
    }
}

export function getInstanceElement(el){
    let instanceElement = el;
    if(el.closest){
        instanceElement = el.closest("[zz-instance-el]") || el.getRootNode() ;
    }
    if(!instanceElement.getElementById){
        instanceElement.getElementById = function(id){
            const el = this.querySelector("#"+id) ;
            if(!el){
                const inTemplates = searchInTemplates(this, id);
                if(inTemplates){
                    //the wanted element is inside an hidden sub template
                    return {
                        addEventListener: function(event, callback){
                            inTemplates.template.addEventListener("instanced", (ev)=>{
                                let elId = null;
                                if(ev.detail.instanceEl.id === id){
                                    elId = ev.detail.instanceEl ;
                                }else{
                                    elId = ev.detail.instanceEl.querySelector("#"+id) ;
                                }
                                if(!elId){
                                    throw "Missing element id "+id ;
                                }
                                elId.addEventListener(event, callback) ;
                            }) ;
                        }
                    } ;
                }else{
                    //no matching id
                    return null;
                }
            }else{
                return el;
            }
        } ;
    }
    if(!instanceElement.getData && instanceElement.firstElementChild 
            && instanceElement.firstElementChild.hasAttribute("zz-creating-occurence")){
        //we are creating the occurrence element, the occurence data is kept on global variable
        instanceElement.getData = ()=>{ return window.__zzCurrentCreatingOccurence ; } ;
        instanceElement.__zRootNode = window.__zzCurrentRootNode ;
    }
    return instanceElement;
}

export function currentContext(el){
    const instanceElement = getInstanceElement(el) ;
    if(!instanceElement.__zzContext){
        instanceElement.__zzContext = {} ;
    }
    return instanceElement.__zzContext ;
}

export function getSavePatch(el, idColumn="id", rowIndex=null){
    //this element is linked
    let url = el.getAttribute("z-save-url") ;
    let isBindUrl = false ;
    if(!url){
        isBindUrl = true ;
        url = el.getAttribute("z-bind-url") ;
    }

    let elRootData = el ;
    while(!elRootData.__zzBindRoot && !elRootData.zzBindData && elRootData.parentNode){
        elRootData = elRootData.parentNode ;
    }
    let bindPath = null;
    if(elRootData.hasAttribute && elRootData.hasAttribute("zz-bind")){
        const bindSettings = JSON.parse(elRootData.getAttribute("zz-bind"));
        bindPath = bindSettings._value ;
    }else if(elRootData.hasAttribute && elRootData.hasAttribute("z-bind")){
        const bindSettings = JSON.parse(elRootData.getAttribute("z-bind"));
        bindPath = bindSettings._value ;
    }
    let data = elRootData.zzBindData ;
    if(bindPath){
        data = extractFromPath(data, bindPath);
    }
    if(!data){
        data = {} ;
        update(elRootData, data) ;
    }
    let dataOrig = elRootData.__zzBindOrigData ;
    if(bindPath){
        dataOrig = extractFromPath(dataOrig, bindPath);
    }
    let id = data[idColumn] ;
    let dataArray = null;
    let dataArrayOrig = null;
    if(elRootData.hasAttribute("zz-bind-occurence-index") || rowIndex!==null){
        let index = rowIndex ;
        if(index === null){
            index = Number(elRootData.getAttribute("zz-bind-occurence-index")) ;
        }
        rowIndex = index ;
        dataArray = data;
        data = data[index] ;
        dataArrayOrig = dataOrig||[] ;
        dataOrig = dataArrayOrig[index] ;

        if(data){
            id = data[idColumn] ;
        }
        
        if(isBindUrl && url){
            let indexQuery = url.indexOf("?");
            if(indexQuery === -1){
                indexQuery = url.length ;
            }
            if(url[indexQuery-1] !== "/"){
                url = url.substring(0, indexQuery) + "/" + url.substring(indexQuery);
                indexQuery++ ;
            }
            if(data){
                id = data[idColumn] ;
                //this is a repeating occurence, get the parent URL and add the ID
                if(id){
                    url = url.substring(0, indexQuery) + id + url.substring(indexQuery);
                }
            }
        }
    }
    const dataPatch = extractPatchData(dataOrig, data) ;
    return {dataPatch, id, dataOrig, data, url, dataArrayOrig} ;
}

function dataHasFile(dataPatch){
    if(!dataPatch){ return false ; }
    return Object.keys(dataPatch).some((k)=>{
        const value = dataPatch[k] ;
        if(value && value.constructor && value.constructor.name === "File"){
            return true;
        }else if(value && Array.isArray(value)){
            return value.some(v=>dataHasFile(v)) ;
        }else if(value && typeof(value) === "object"){
            return dataHasFile(value) ;
        }
        return false ;
    }) ;
}

function dataAddFileToForm(dataPatch, formData, path = []){
    Object.keys(dataPatch).forEach((k)=>{
        let value = dataPatch[k] ;
        if(value && value.constructor && value.constructor.name === "File"){
            let fullPath = k;
            if(path.length>0){
                fullPath = path.join(".")+"."+k ;
            }
            formData.append(fullPath, value) ;
        }else if(value && Array.isArray(value)){
            let basePath = path.concat([k]) ;
            for(let i = 0; i<value.length; i++){
                dataAddFileToForm(value[i], formData, basePath.concat([i])) ;
            }
        }else if(value && typeof(value) === "object"){
            dataAddFileToForm(value, formData, path.concat([k])) ;
        }
    });
}

export function prepareFormData(dataPatch){
    let body;
    let headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    } ;
    if(dataPatch && Array.isArray(dataPatch)){
        const form = document.createElement("form");
        form.setAttribute("method", "POST");
        form.setAttribute("enctype", "multipart/form-data");
        const formData  = new FormData(form);
        formData.append("records", JSON.stringify(dataPatch));
        body = formData ;
        headers = {} ;
    }else{
        const hasFile = dataHasFile(dataPatch);
        if(hasFile){
            const form = document.createElement("form");
            form.setAttribute("method", "POST");
            form.setAttribute("enctype", "multipart/form-data");
            const formData  = new FormData(form);
            Object.keys(dataPatch).forEach((k)=>{
                let value = dataPatch[k] ;
                const isFile = (value && value.constructor && value.constructor.name === "File") ;
                if(!isFile){
                    if(value && typeof(value) === "object"){
                        value = JSON.stringify(value) ;
                    }
                    formData.append(k, value) ;
                }
            }) ;
            dataAddFileToForm(dataPatch, formData) ;
            body = formData ;
            headers = {} ;
        }else{
            body = JSON.stringify(dataPatch) ;
        }
    }
    return {body, headers} ;
}

export function save(elOrDataPatch, idColumn="id", rowIndex=null){
    if(!elOrDataPatch.dataPatch){
        elOrDataPatch = getSavePatch(elOrDataPatch, idColumn, rowIndex) ;
    }
    const {dataPatch, id, dataOrig, data, url, dataArrayOrig} = elOrDataPatch ;
    if(!dataPatch){
        //no modifications
        return new Promise((resolve)=>{ resolve(data) ; }) ;
    }

    const {body, headers} = prepareFormData(dataPatch);
    
    if(id && dataOrig && dataOrig[idColumn]){
        //modification
        
        return fetch(url, {
            method: "PATCH", 
            credentials: 'include', 
            body: body,
            headers: headers
         }).then(function(response) {
            if(response.status < 200 || response.status > 299){
                return response.text().then((text)=>{
                    let msg = text;
                    try{
                        msg = JSON.parse(text) ;
                    }catch(e){
                        //ignore parse error, it is not a JSON object
                    }
                    if(!msg){
                        msg = "error" ; 
                    }
                    throw msg ;
                }) ;
            }
            return response.json().then((result)=>{
                //update data with data returned by server (may have column computed on server side)
                Object.keys(result).forEach(function(key){
                    if(result[key] !== data[key]){
                        data[key] = result[key] ;
                    }
                    if(result[key] !== dataOrig[key]){
                        dataOrig[key] = JSON.parse(JSON.stringify(result[key])) ;
                    }
                }) ;
                return result;
            });
        });
    }else{
        //create new
        return fetch(url, {
            method: "POST", 
            credentials: 'include', 
            body: body,
            headers: headers
        }).then(function(response) {
            if(response.status < 200 || response.status > 299){
                return response.text().then((text)=>{
                    let msg = text;
                    try{
                        msg = JSON.parse(text) ;
                    }catch(e){
                        //ignore parse error, it is not a JSON object
                    }
                    if(!msg){
                        msg = "error" ; 
                    }
                    throw msg ;
                }) ;
            }
            return response.json().then((result)=>{
                //update data with data returned by server (may have column computed on server side)
                if(dataArrayOrig){
                    //if there is an original data, add the server to it to become the new original data
                    while(dataArrayOrig.length < rowIndex-2){
                        //fill with blank if index is too far
                        dataArrayOrig.push({}) ;
                    }
                    dataArrayOrig.push(result) ;
                }
                Object.keys(result).forEach(function(key){
                    if(result[key] !== data[key]){
                        data[key] = result[key] ;
                    }
                }) ;
                return result;
            });
        });
    }
}

export function deleteRecord(elOrDataPatch, idColumn="id", rowIndex=null){
    if(!elOrDataPatch.dataPatch){
        elOrDataPatch = getSavePatch(elOrDataPatch, idColumn, rowIndex) ;
    }
    const {dataPatch, id, dataOrig, data, url, dataArrayOrig} = elOrDataPatch ;

    return fetch(url, {method: "DELETE", credentials: 'include', }).then(function(response) {
        if(response.status < 200 || response.status > 299){
            return response.text().then((text)=>{
                let msg = text;
                try{
                    msg = JSON.parse(text) ;
                }catch(e){
                    //ignore parse error, it is not a JSON object
                }
                if(!msg){
                    msg = "error" ; 
                }
                throw msg ;
            }) ;
        }
        return response.json();
    });
}

const distantDataCache = {};
let distantDataId = 0;

function listenDistantDataChange(dataId, originalData, listener){
    distantDataCache[dataId] = {
        originalData: JSON.stringify(originalData),
        listener: listener
    } ;
}

export function notifyDistantDataChange(dataId, newData){
    const cacheConfig = distantDataCache[dataId] ;
    if(cacheConfig && cacheConfig.originalData !== JSON.stringify(newData)){
        cacheConfig.listener(newData) ;
    }
}

function applyResultFromUrl(elementToFetch, result){
    if(result === null || result === undefined){
        result = [] ;
    }
    let valueToBind = result;
    if(!Array.isArray(valueToBind)){
        valueToBind = [valueToBind] ;
    }
    let modifierPromise = Promise.resolve(valueToBind) ;
    if(elementToFetch.hasAttribute("z-data-modifier")){
        const funcName = elementToFetch.getAttribute("z-data-modifier") ;
        let func = elementToFetch[funcName] ;
        if(!func){
            func = elementToFetch.getRootNode()[funcName] ;
        }
        if(!func){
            console.error("Missing function "+funcName+" on element ", elementToFetch, "or", elementToFetch) ;
        }else{
            const funcResult = func.bind(elementToFetch.content?elementToFetch.content:elementToFetch)(valueToBind) ;
            if(typeof(funcResult) === "object" && funcResult.constructor === Promise){
                modifierPromise = funcResult ;
            }else if(!funcResult){
                modifierPromise = Promise.resolve(valueToBind) ;
            }else {
                modifierPromise = Promise.resolve(funcResult) ;
            }
        }
    }
    return modifierPromise.then((valueToBind)=>{
        if(elementToFetch.hasAttribute("z-bind")){
            let bindPath = elementToFetch.getAttribute("z-bind") ;
            if(bindPath[0] === "{"){
                bindPath = JSON.parse(bindPath)._value ;
            }

            let elRootData = elementToFetch ;
            while(!elRootData.__zzBindRoot && elRootData.parentNode){
                elRootData = elRootData.parentNode ;
            }
            let data = elRootData.zzBindData ;
            if(!data){ 
                //is outside a data context, probably a fetch finished after DOM change
                return ;
            }
            const dataCopy = JSON.parse(JSON.stringify(data));
            //dataCopy.__isCopy = true;
            //update the copy first that don't trigger rebind
            updateToPath(dataCopy, bindPath,JSON.parse(JSON.stringify(valueToBind)), true) ;
            elementToFetch.__zzBindOrigData = dataCopy; 

            //update live data that trigger rebind
            updateToPath(data, bindPath,valueToBind, true) ;
            elementToFetch.zzBindData = data;  
            elementToFetch.__zzBindRoot = true;  
            return ;
        }
        const dataCopy = JSON.parse(JSON.stringify(valueToBind));
        //dataCopy.__isCopy = true;
        if(Array.isArray(valueToBind)){
            const template = document.createElement("template") ;
            let parentEl = elementToFetch.parentElement;
            if(!parentEl && elementToFetch.parentNode && elementToFetch.parentNode.insertBefore){
                parentEl = elementToFetch.parentNode;
            }
            if(parentEl){
                parentEl.insertBefore(template, elementToFetch) ;
                template.id = "__template_binding_"+(templateIdInc++) ;
                template.content.appendChild(elementToFetch) ;
        
                const allOccurrenceEls = createOccurrences(elementToFetch, template, valueToBind) ;
                for(let a = 0; a<allOccurrenceEls.length; a++){
                    allOccurrenceEls[a].__zzBindOrigData = dataCopy;                                            
                    //addSaveListener(allOccurrenceEls[a]);
                    //addDeleteListener(allOccurrenceEls[a]);
                    bind(allOccurrenceEls[a], valueToBind[a]) ;
                    hideIf(allOccurrenceEls[a], valueToBind[a]) ;
                }
            }
        }else{
            elementToFetch.__zzBindOrigData = dataCopy;
            return bind(elementToFetch, valueToBind) ;
            //addSaveListener(elementToFetch);
            //addDeleteListener(elementToFetch);
        }
    }) ;
}

export function fetchFromBindUrl(elementToFetch, globalsData){
    if(globalsData){
        elementToFetch._globals = globalsData ;
    }
    let url = elementToFetch.getAttribute("z-bind-url") ;

    if(url.indexOf("${") !== -1){
        return applyResultFromUrl(elementToFetch, []) ;
    }

    elementToFetch.setAttribute("zz-fetch-done", "true") ;

    if(elementToFetch[url] && typeof(elementToFetch[url]) === "function"){
        //get from function
        const functionResult = elementToFetch[url]() ;
        if(functionResult && functionResult.constructor === Promise){
            return functionResult.then((result)=>{
                return applyResultFromUrl(elementToFetch, result) ;
            }) ;
        }else{
            return applyResultFromUrl(elementToFetch, functionResult) ;
        }
    } else if(url === "$emptyRecord"){
        return applyResultFromUrl(elementToFetch, {}) ;
    } else {
        //fetch from distant URL
        const dataId = distantDataId++ ;

        const indexQuery = url.indexOf("?") ;
        if(indexQuery !== -1){
            url = encodeURI(url.substring(0,indexQuery))+url.substring(indexQuery) ;
        }else{
            url = encodeURI(url) ;
        }
        url = url.replace(/%5C\//g, "%2F") ;

        elementToFetch.__zzFetchId = dataId ;
        return fetch(url, {credentials: 'include', headers: {
                "X-Binding-Refresh-Id": dataId }})
                .then((response) =>{
                    return response.json() ;
                }).then((result) =>{
            if(elementToFetch.__zzFetchId !== dataId){
                //new fetch done
                return ; 
            }
            listenDistantDataChange(dataId, result, (newData)=>{
                applyResultFromUrl(elementToFetch, newData) ;
            }) ;
            return applyResultFromUrl(elementToFetch, result) ;
        }) ;
    }
    
}

export function fetchAndBind(el, globalsData){
    loadCss() ;
    prepareElementsToBind(el) ;
    const elementsToFetch = el.querySelectorAll("[z-bind-url]") ;

    let allPromises = [] ;
    for(let i=0; i<elementsToFetch.length; i++){
        const elementToFetch = elementsToFetch[i] ;
        allPromises.push(fetchFromBindUrl(elementToFetch, globalsData)) ;
    }

    return Promise.all(allPromises) ;
}




export function extractFromPath(obj, path) {
    if(!path){
        return obj ;
    }
    var pathArray = path ;
    var isNegated = false;
    if (!Array.isArray(path)) {
        if(path[0] === "!"){
            isNegated = true ;
            path = path.substring(1) ;
        }
        pathArray = path.split(".").map(function(p){ return p.trim(); });
    }
    var objectPath = [];
    var dataObject = obj;
    var len = pathArray.length ;
    var ind=0;
    while (ind < len) {
        var p = pathArray[ind];

        if (p !== null && p !== undefined && p === "$parent"){
            dataObject = objectPath.pop() ;
            if(Array.isArray(dataObject)){
                dataObject = objectPath.pop() ;
            }
        } else if (p !== null && p !== undefined && p === "$index" && ind>0) {
            return Number(pathArray[ind-1]) ;
        } else if (p !== null && p !== undefined && p === "length" && ind>0 && Array.isArray(pathArray[ind-1])) {
            return pathArray[ind-1].length ;
        } else if (dataObject && p !== null && p !== undefined && p !== "$this") {
            objectPath.push(dataObject);
            dataObject = dataObject[p];
        }
        ind++ ;
    }
    if(isNegated){
        dataObject = !dataObject ;
    }
    return dataObject;
}

function getParentAndProp(obj, path, dontCreatePath){
    if(!path){
        return false ;
    }
    var pathArray = path ;
    if (!Array.isArray(path)) {
        pathArray = path.split(".").map(function(p){ return p.trim(); });
    }
    var objectPath = [];
    var dataObject = obj;
    var len = pathArray.length ;
    var ind=0;
    while (ind < len-1) {
        var p = pathArray[ind];

        if (p !== null && p !== undefined && p === "$parent"){
            dataObject = objectPath.pop() ;
            if(Array.isArray(dataObject)){
                dataObject = objectPath.pop() ;
            }
        } else if (dataObject && p !== null && p !== undefined && p !== "$this") {
            objectPath.push(dataObject);
            if(!dataObject[p]){
                //p does not exists yet in data object
                if(dontCreatePath){
                    return;
                }
                //create it
                let nextP = pathArray[ind+1];
                if(isNaN(nextP)){
                    //next path part is a not a number, we must create an object
                    dataObject[p] = {} ;
                }else{
                    //next path part is a number, we must create an array
                    dataObject[p] = [] ;
                }
            }
            dataObject = dataObject[p];
        }
        ind++ ;
    }
    return {
        parentObject: dataObject,
        property: pathArray[pathArray.length-1]
    } ;
}

export function updateToPath(obj, path, value, dontCreatePath) {
    const parentAndProp = getParentAndProp(obj, path, dontCreatePath) ;
    if(!parentAndProp){
        return false ;
    }
    parentAndProp.parentObject[parentAndProp.property] = value ;
}


let cacheExprs = {} ;
function runCodeExpr(el,data, expr){
    let argNames = [];
    let argValues = [];
    if(!Array.isArray(data)){
        argNames = Object.keys(data);
        for(let k = 0; k < argNames.length; k++){
            argValues.push(data[argNames[k]]) ;
        }
    }
    argNames.push("$this") ;
    argValues.push(data) ;

    const instanceEl = getInstanceElement(el) ;
    const localDocument = instanceEl.__zRootNode || el.getRootNode() ;
    argNames.push("document") ;
    argValues.push(localDocument) ;
    argNames.push("getData") ;
    argValues.push(instanceEl.getData) ;

    let funcKey = argNames.join("_")+expr ;
    let func = cacheExprs[funcKey] ;
    let i = 0;
    //30 retry maximum
    while(i<30){ 
        i++;
        try{
            if(!func){
                //replace bar.1.foo by bar[1].foo
                expr = expr.replace(/\.(\d+)\./g, "[$1].") ;
                if(expr.indexOf(".!") !== -1){
                    expr = "!"+expr.replace(".!", "");
                }

                //replace bar[10].$index by 10
                while(/\[\d+\]\.\$index/.test(expr)){
                    const indexBraceEnd = expr.indexOf("].$index") ;
                    const indexBraceStart = expr.lastIndexOf("[", indexBraceEnd) ;
                    const indexNumber = expr.substring(indexBraceStart+1, indexBraceEnd) ;
                    let c=indexBraceStart;
                    while(c>0){
                        if(/\s/.test(expr[c])){
                            break;
                        }
                        c--;
                    }
                    expr = expr.substring(0, c)+indexNumber+expr.substring(indexBraceEnd+8) ;
                }

                //replace bar[10].length by bar.length
                while(/\[\d+\]\.length/.test(expr)){
                    const indexBraceEnd = expr.indexOf("].length") ;
                    const indexBraceStart = expr.lastIndexOf("[", indexBraceEnd) ;
                    
                    expr = expr.substring(0, indexBraceStart)+expr.substring(indexBraceEnd+1) ;
                }

                func = new Function(argNames.map(function(name){ return name.replace(/[^a-zA-Z_$0-9]/g, "") ;}).join(","), "return "+expr) ;
            }
            const result = func.apply(null, argValues) ;
            cacheExprs[funcKey] = func ;
            return result ;
        }catch(e){
            if(e.name === "ReferenceError" ){
                //the expression use a variable name that is not in arguments name
                
                //add the variable to the argument list with undefined value
                let varName = "";
                if(/is not defined$/.test(e.message)){//Chrome, FF
                    varName = e.message.split(" ")[0].replace(/'/g, "") ;
                }else if(/is undefined$/.test(e.message)){//IE
                    varName = e.message.split(" ")[0].replace(/'/g, "") ;
                }else if(e.message.indexOf("Can't find variable") === 0){//Safari
                    varName = e.message.split(" ").pop().replace(/'/g, "") ;
                }
                if(varName){
                    argNames.push(varName);
                    argValues.push(undefined) ;
                }else{
                    console.log("Unrecognized error format "+e.message+", try to add all words....") ;
                    e.message.split(" ").forEach(function(w){
                        argNames.push(w.replace(/[^a-zA-Z0-9_]/g, ""));
                        argValues.push(undefined) ;
                    }) ;
                }
                func = null;
                funcKey = argNames.join("_")+expr ;
                continue; //retry
            }
            //other case, log a console error as it likely to be a programmation error
            // console.error("Wrong expression "+expr+" retry "+i, e, JSON.parse(JSON.stringify(data))) ;
            return "";
        }
    }
    console.error("More than 30 retry of "+expr) ;
    return "";
}

let cssLoaded = false;
function loadCss(){
    if(cssLoaded){ return ;}

        var css = ".z-hidden {";
        css += "    display: none !important;";
        css += "}";


        var head = window.document.getElementsByTagName('head')[0];
        var s = window.document.createElement('style');
        s.setAttribute('type', 'text/css');
        if (s.styleSheet) {   // IE
            s.styleSheet.cssText = css;
        } else {                // the world
            s.appendChild(window.document.createTextNode(css));
        }
        head.appendChild(s);
        cssLoaded = true ;
}