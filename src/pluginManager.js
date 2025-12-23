const path = require("path") ;
const { readdir, readFile } = require('node:fs/promises');
const logger = require("./logger");
const { getDbClient, hasPlugin } = require("./database/dbAccess");
const { access, constants } = require("fs/promises");
const { injectBamz } = require("./utils") ;
const { appFileSystems } = require("./appFileSystems");
let pluginsData = {} ;

const pluginDirectories = [process.env.PLUGINS_DIR] ;

const PLUGIN_CACHE = {} ;

/**
 * Clears the plugin cache for a specific app.
 * @param {*} appName 
 */
async function clearCache(appName){
    delete PLUGIN_CACHE[appName] ;
}

/**
 * Dynamically imports a plugin module.
 * @param {*} pluginName 
 * @param {*} pluginDir 
 * @returns 
 */
async function dynamicImport(pluginName, pluginDir) {
    if(!pluginDir){
        for(let dir of pluginDirectories){
            try{
                await access(path.join(dir, pluginName), constants.F_OK);
                pluginDir = dir;
                break;
            }catch(err){
                //not exists
                logger.debug("Plugin "+pluginName+" does not exists in "+dir, err) ;
            }
        }
    }
    if(!pluginDir){
        logger.info("Plugin "+pluginName+" not found") ;
        return null;
    }
    let modulePath = path.join(pluginDir, pluginName) ;
    let pkg = require(path.join(modulePath, "package.json"));
    if(pkg.type === "module"){
        return import(path.join(modulePath, pkg.main))
    }else{
        return require(path.join(modulePath, pkg.main))
    }
}

/**
 * Gets the task runner for a specific plugin.
 * @param {*} param0 
 * @returns 
 */
async function getPluginTaskRunner({plugin, runnerPath}){
    let pluginDir;
    for(let dir of pluginDirectories){
        try{
            await access(path.join(dir, plugin), constants.F_OK);
            pluginDir = dir;
            break;
        }catch(err){
            //not exists
            logger.error("Plugin "+plugin+" does not exists in "+dir, err) ;
        }
    }
    if(!pluginDir){
        logger.info("Plugin "+plugin+" not found") ;
        return null;
    }
    let modulePath = path.join(pluginDir, plugin) ;
    let filePath = path.join(modulePath, runnerPath) ;
    if(filePath.endsWith(".mjs")){
        return (await import(filePath)).default ;
    }else{
        return require(filePath)
    }
}

/**
 * Gets the context for a specific app.
 * @param {*} appName 
 * @returns 
 */
const contextOfApp = async (appName)=>{
    if(!appName){ throw "Missing appName when try to get context" ; }
    try{
        const client = await getDbClient({database: appName});
        try{
            let results = await client.query("SELECT plugin_id FROM openbamz.plugins");  
            let contextApp = {
                bamzSourcesPath: __dirname,
                pluginsData: {}
            }
            for(let plugin of results.rows){
                if(pluginsData[plugin.plugin_id]){
                    contextApp.pluginsData[plugin.plugin_id] = {appName, ...pluginsData[plugin.plugin_id]};
                    contextApp.pluginsData[plugin.plugin_id].pluginSlots = structuredClone(contextApp.pluginsData[plugin.plugin_id].pluginSlots) ;
                }
            }
            for(let {pluginName, listener} of loadListeners){
                try{
                    if(await hasPlugin(appName, pluginName)){
                        await listener({pluginsData: contextApp.pluginsData, appName}) ;
                    }
                }catch(err){
                    logger.error("Error while run plugin load listener %o", err) ;
                }
            }
            return contextApp;
        }finally{
            client.release() ;
        }
    }catch(err){
        logger.info("No context for app %o", err) ;
        let contextApp = {
            pluginsData: {}
        }
        return contextApp;
    }
}

const loadListeners = [];
let addPluginLoadListener = (pluginName, listener)=>{
    loadListeners.push({pluginName, listener}) ;
}

//init all plugins on application start
async function initPlugins(params){
    pluginsData = {} ;
    let pluginsToLoad = [];
    console.log(pluginDirectories)
    for(let dir of pluginDirectories){
        let subdirs = (await readdir(dir, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
        for(let pluginDir of subdirs){
            let pkg = require(path.join(dir, pluginDir , "package.json"));
            let plugin = await dynamicImport(pluginDir, dir) ;
            pluginsToLoad.push({pkg, depends: pkg?.openbamz?.depends??[] , plugin, id: pluginDir, path: path.join(dir, pluginDir) });
        }
    }
    
    pluginsToLoad = sortPluginByDependencies(pluginsToLoad) ;
    for(let pluginToLoad of pluginsToLoad){
        const hasCurrentPlugin = async function (appName){
            if(appName === "app"){ return false; }
            let pluginInstalled ; 
            //console.log("PLUGIN_CACHE[appName]", PLUGIN_CACHE, pluginToLoad.id)
            if(PLUGIN_CACHE[appName] && PLUGIN_CACHE[appName][pluginToLoad.id] !== undefined){
                //console.log("from cache") ;
                return PLUGIN_CACHE[appName][pluginToLoad.id] ;
            }
            pluginInstalled = await hasPlugin(appName, pluginToLoad.id) ;
            if(!PLUGIN_CACHE[appName]){
                PLUGIN_CACHE[appName] = {} ;
            }
            PLUGIN_CACHE[appName][pluginToLoad.id] = pluginInstalled ;
            return pluginInstalled ;
        }
        const loadPluginData = async function (listener){
            addPluginLoadListener(pluginToLoad.id, listener) ;
        }
        const userLoggedAndHasPlugin = async function(req, res){
            if(await params.graphql.checkAppAccessMiddleware(req, res)){
                //is logged
                if(await hasCurrentPlugin(req.appName)){
                    return true;
                }else{
                    res.status(403).json({error: "Forbidden"})
                    return false;
                }
            }else{
                return false;
            }
        }
        pluginsData[pluginToLoad.id] = await pluginToLoad.plugin.initPlugin({contextOfApp, appFileSystems, loadPluginData, hasCurrentPlugin, userLoggedAndHasPlugin, injectBamz , ...params});
        if(pluginsData[pluginToLoad.id].frontEndPath){
            pluginsData[pluginToLoad.id].frontEndFullPath = path.join(pluginToLoad.path ,pluginsData[pluginToLoad.id].frontEndPath);
        }
        pluginsData[pluginToLoad.id].manifest = pluginToLoad.pkg ;
    }
    
    return pluginsData;
}


const BAMZ_ICON = `<svg
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   width="113.65009mm"
   height="96.249985mm"
   viewBox="0 0 113.65009 96.249985"
   version="1.1"
   id="svg866"
   inkscape:version="0.92.5 (2060ec1f9f, 2020-04-08)"
   sodipodi:docname="logo_white.svg">
  <defs
     id="defs860" />
  <sodipodi:namedview
     id="base"
     pagecolor="#ffffff"
     bordercolor="#666666"
     borderopacity="1.0"
     inkscape:pageopacity="0.0"
     inkscape:pageshadow="2"
     inkscape:zoom="0.98994949"
     inkscape:cx="108.54627"
     inkscape:cy="-35.232354"
     inkscape:document-units="mm"
     inkscape:current-layer="layer1"
     showgrid="false"
     fit-margin-top="0"
     fit-margin-left="0"
     fit-margin-right="0"
     fit-margin-bottom="0"
     inkscape:window-width="1848"
     inkscape:window-height="1136"
     inkscape:window-x="72"
     inkscape:window-y="27"
     inkscape:window-maximized="1" />
  <metadata
     id="metadata863">
    <rdf:RDF>
      <cc:Work
         rdf:about="">
        <dc:format>image/svg+xml</dc:format>
        <dc:type
           rdf:resource="http://purl.org/dc/dcmitype/StillImage" />
        <dc:title></dc:title>
      </cc:Work>
    </rdf:RDF>
  </metadata>
  <g
     inkscape:label="Calque 1"
     inkscape:groupmode="layer"
     id="layer1"
     transform="translate(-42.204658,-6.9702454)">
    <rect
       class="fil7"
       x="97.194763"
       y="25.700243"
       width="3.0899997"
       height="23.489996"
       id="rect88"
       style="clip-rule:evenodd;fill:#ffffff;fill-opacity:1;fill-rule:evenodd;stroke-width:0.01;image-rendering:optimizeQuality;shape-rendering:geometricPrecision;text-rendering:geometricPrecision" />
    <path
       style="clip-rule:evenodd;fill:#ffffff;fill-opacity:1;fill-rule:evenodd;stroke-width:0.03779528;image-rendering:optimizeQuality;shape-rendering:geometricPrecision;text-rendering:geometricPrecision"
       d="m 374.26758,175.37109 c -118.60155,0 -214.75391,96.15041 -214.75391,214.75196 h 429.54297 c 0,-118.60155 -96.1497,-214.75196 -214.78906,-214.75196 z m 71.74023,87.98633 a 57.713379,57.713379 0 0 1 57.71485,57.71485 57.713379,57.713379 0 0 1 -57.71485,57.71289 57.713379,57.713379 0 0 1 -57.71289,-57.71289 57.713379,57.713379 0 0 1 57.71289,-57.71485 z m -147.16406,21.02149 a 47.203033,47.203033 0 0 1 47.20313,47.20312 47.203033,47.203033 0 0 1 -47.20313,47.20313 47.203033,47.203033 0 0 1 -47.20313,-47.20313 47.203033,47.203033 0 0 1 47.20313,-47.20312 z"
       transform="scale(0.26458333)"
       id="path92"
       inkscape:connector-curvature="0" />
    <path
       class="fil13"
       d="m 99.024762,46.40024 c -19.309995,0 -36.369993,9.629998 -46.629992,24.349996 10.249999,-10.049997 24.289997,-16.249997 39.779993,-16.249997 28.629997,0 52.309987,21.169996 56.249987,48.719991 h 7.43 c 0,-31.379993 -25.43999,-56.81999 -56.829988,-56.81999 z"
       id="path94"
       inkscape:connector-curvature="0"
       style="clip-rule:evenodd;fill:#ffffff;fill-opacity:1;fill-rule:evenodd;stroke-width:0.01;image-rendering:optimizeQuality;shape-rendering:geometricPrecision;text-rendering:geometricPrecision" />
    <circle
       class="fil18"
       cx="98.734764"
       cy="18.710243"
       r="11.739998"
       id="circle108"
       style="clip-rule:evenodd;fill:#ffffff;fill-opacity:1;fill-rule:evenodd;stroke-width:0.01;image-rendering:optimizeQuality;shape-rendering:geometricPrecision;text-rendering:geometricPrecision" />
    <circle
       class="fil20"
       cx="98.859344"
       cy="18.040289"
       r="5.4399991"
       id="circle148"
       style="clip-rule:evenodd;fill:#ffffff;fill-opacity:1;fill-rule:evenodd;stroke-width:0.01;image-rendering:optimizeQuality;shape-rendering:geometricPrecision;text-rendering:geometricPrecision" />
    <circle
       class="fil21"
       cx="78.823524"
       cy="87.580673"
       r="5.4896894"
       id="circle150"
       style="clip-rule:evenodd;fill:#fefefe;fill-rule:evenodd;stroke-width:0.01;image-rendering:optimizeQuality;shape-rendering:geometricPrecision;text-rendering:geometricPrecision" />
    <circle
       class="fil21"
       cx="118.49715"
       cy="84.55468"
       r="4.3999996"
       id="circle152"
       style="clip-rule:evenodd;fill:#fefefe;fill-rule:evenodd;stroke-width:0.01;image-rendering:optimizeQuality;shape-rendering:geometricPrecision;text-rendering:geometricPrecision" />
  </g>
</svg>`

const BASE_MENU = [
    { name: BAMZ_ICON,  link: "/app/:appName", entries: [
        { name: "Home", link: "/app/:appName" },
        { name: "Settings", link: "/openbamz/settings/:appName" },
        { name: "All apps", link: "/openbamz" },
    ] } 
    /* { name: "admin", entries: [
         { name: "database", link: "/database" },
         { name: "sources", link: "/sources" }
     ] },
     { name: "settings", entries: [
         { name: "main", link: "/mainsettings" },
         { name: "profile", link: "/profile" }
     ] }*/
];

/**
 * Middleware to inject the admin menu JavaScript into the response.
 * It loads all plugin javascript script in the application
 * 
 * @param {*} req 
 * @param {*} res 
 */
function middlewareMenuJS(req, res){
    (async ()=>{
        let appName = req.appName ;
        /*let options = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: appName
        }; */

        
        //const client = await getDbClient(options) ;
        try{
            let contextApp = null;
            if(appName !== process.env.DB_NAME){
                contextApp = await contextOfApp(appName);
            }else{
                contextApp = { pluginsData : {}}  ;
            }
            /*let results;
            try{
                results = await client.query("SELECT plugin_id FROM openbamz.plugins");  
            }catch(err){
                logger.warn("Can't load plugins from db %o", err);
                results = { rows: [] } ;
            }*/
            let adminMenu = JSON.parse(JSON.stringify(BASE_MENU)) ;
            let pluginLib = [];
            for(let plugin of Object.keys(contextApp.pluginsData)){
                let pluginData = contextApp.pluginsData[plugin] ;
                if(pluginData?.menu){
                    for(let menu of pluginData.menu){
                        let menuEntry = adminMenu.find(m=>m.name === menu.name) ;
                        if(!menuEntry){
                            menuEntry = {
                                name: menu.name,
                                entries : []
                            };
                            adminMenu.push(menuEntry) ;
                        }
                        for(let entry of menu.entries){
                            menuEntry.entries.push(entry) ;
                        }
                    }
                }

                let isInPlugin = !req.query.forceLoadPlugins && (req.headers.referer && req.headers.referer.includes(`/plugin/${appName}/`)) ;
                if(!isInPlugin){
                    // we load plugin front lib in the app but not in plugins pages
                    let libs = pluginData?.frontEndLib??[];
                    if(!Array.isArray(libs)){
                        libs = [libs] ;
                    }
                    for(let lib of libs){
                        pluginLib.push(`window.BAMZ_PLUGINS["${plugin}"] = (await import('/plugin/${plugin}/${lib}')) ;`)
    //                     pluginLib.push(`import * as BAMZ_PLUGIN_${plugin.toUpperCase().replaceAll("-", "_")} from '/plugin/${plugin}/${lib}';
    // window.BAMZ_PLUGINS["${plugin}"] = BAMZ_PLUGIN_${plugin.toUpperCase().replaceAll("-", "_")}`);
                    }
                }
            }
            let jsSource = await readFile(path.join(__dirname, "menu-front", "adminMenu.js"), {encoding: "utf8"}) ;
            res.setHeader("Content-Type", "application/javascript") ;
            res.end(`
//script for ${req.appName}

window.document.body.style.transition = "opacity 1s";  

window.BAMZ_PLUGINS = {} ;
${pluginLib.join("\n")}

window.document.body.style.opacity = 1;

window.BAMZ_LOADED = true ;

window.dispatchEvent(new CustomEvent("openbamz.plugin.loaded"));

let adminMenu = ${JSON.stringify(adminMenu)} ;

${jsSource}
            `)
        }catch(err){
            logger.warn("Can't load plugin %o", err);
            res.end(`//script for ${req.appName}
`)
        }finally{
           // client.release() ;
        }
    })() ;
}

/**
 * Sorts an array of plugin objects by their dependencies.
 * @param {*} arr 
 * @returns 
 */
function sortPluginByDependencies(arr) {
    // Create a map to store the objects by their id for quick access
    const objMap = new Map(arr.map(obj => [obj.id, obj]));

    // Create a map to track dependencies for each object
    const dependencies = new Map();
    const inDegree = new Map(); // to count the number of incoming edges for each object

    // Initialize dependencies and inDegree maps
    arr.forEach(obj => {
        inDegree.set(obj.id, 0);
        dependencies.set(obj.id, []);
    });

    // Fill the dependencies map and inDegree map
    arr.forEach(obj => {
        obj.depends.forEach(dep => {
            if (objMap.has(dep)) {
                dependencies.get(dep).push(obj.id);
                inDegree.set(obj.id, (inDegree.get(obj.id) || 0) + 1);
            }
        });
    });

    // Perform topological sorting using Kahn's algorithm
    const queue = [];
    const sortedArray = [];

    // Add objects with no dependencies (inDegree 0) to the queue
    inDegree.forEach((degree, id) => {
        if (degree === 0) {
            queue.push(id);
        }
    });

    while (queue.length) {
        const currentId = queue.shift();
        sortedArray.push(objMap.get(currentId));

        // Decrease the inDegree of dependent objects
        dependencies.get(currentId).forEach(depId => {
            inDegree.set(depId, inDegree.get(depId) - 1);
            if (inDegree.get(depId) === 0) {
                queue.push(depId);
            }
        });
    }

    //Can't be sorted because of circular reference
    let failedElements = arr.filter(o=>!sortedArray.some(a=>a.id === o.id))
    if(failedElements.length>0){
        logger.warn("The following plugins have circular dependencies, they are ignored %o", failedElements.map(o=>o.id).join(","))
    }
    return sortedArray;
}


module.exports.initPlugins = initPlugins;
module.exports.pluginsData = pluginsData;
module.exports.middlewareMenuJS = middlewareMenuJS;
module.exports.dynamicImport = dynamicImport;
module.exports.getPluginTaskRunner = getPluginTaskRunner;
module.exports.clearCache = clearCache;
module.exports.contextOfApp = contextOfApp;