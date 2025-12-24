const logger = require("./logger");
const express = require("express");
const mime = require('mime-types')
const bodyParser = require('body-parser')
const path = require("path");
const fs = require("fs");
const fsp = fs.promises ;
const { createIfNotExist, prepareSchema,prepareMainRoles, startAllWorkers, createRolesIfNeeded } = require("./database/init");
const { createServer } = require("node:http");
const { initPlugins, middlewareMenuJS, contextOfApp } = require("./pluginManager");
const graphql = require("./database/graphql");
const { runQuery, runQueryMain, getDbClient } = require("./database/dbAccess");
const { injectBamz } = require("./utils");
const { initWebSocket, io } = require("./websocket");
const {hostnameCache, appCache} = require("./appCache");
const { extname } = require("node:path");
const { createReadStream } = require("node:fs");
const cookieParser = require('cookie-parser');
const cors = require('cors');
const {authRoutes, jwtMiddleware} = require('./auth');


process.env.GRAPHILE_ENV = process.env.PROD_ENV  ;

// Main DB connection information from env variables
const mainDatabaseConnectionOptions = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
};

// Prepare the main database. The main database contains applications informations and global users
async function prepare() {
    logger.info("Prepare main database %o", mainDatabaseConnectionOptions)
    try {
        logger.info("Create database");
        await createIfNotExist(mainDatabaseConnectionOptions);
        logger.info("Prepare database");
        await createRolesIfNeeded(mainDatabaseConnectionOptions);
        await prepareSchema(mainDatabaseConnectionOptions, "_openbamz");
        await prepareMainRoles(mainDatabaseConnectionOptions);
        logger.info("Prepare database done");

        //Start workers
        startAllWorkers(mainDatabaseConnectionOptions)
     
    } catch (err) {
        logger.error("Fail to init database %o", err);
        throw err;
    }
}

// Start server
async function start() {
    const { grafserv } = require("postgraphile/grafserv/express/v4");


    const app = express()
    const port = 3000

    app.use(cookieParser());
    // app.use(cors({
    //     origin: /.*/,
    //     credentials: true,
    //     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    //     allowedHeaders: ["Content-Type", "Accept", "Range", "x-lang","x-timezone", "x-binding-refresh-id", "Authorization", "x-cors-auth"],
    //     exposedHeaders: ["Accept-Ranges", "Content-Encoding", "Content-Length", "Content-Range", "Content-Disposition", "Content-Type"]
    // }));

    

    app.use(jwtMiddleware) ;

    // parse application/json
    app.use(bodyParser.json({limit:'50mb'}));
    // parse application/x-www-form-urlencoded
    app.use(bodyParser.urlencoded({ limit:'50mb', extended: false }))

    app.use('/auth', authRoutes);

    // middleware to determine the application name from hostname or headers
    app.use(async (req, res, next) => {
        let appName = null ;

        // search in cache
        if(hostnameCache[req.hostname]){
            appName = hostnameCache[req.hostname] ;
        }

        if(!appName){
            //search for the host in app table
            let allApps = await runQueryMain(`SELECT code
                FROM public.app
                WHERE hosts @> $1::jsonb`, [JSON.stringify([{ hostname: req.hostname }])]) ;
            if(allApps.rows.length>0){
                appName = allApps.rows[0].code ;
                hostnameCache[req.hostname] = appName ;
            }
        }

        if(!appName){
            // if not found, get from header app-name
            if(req.headers["app-name"]){
                appName = req.headers["app-name"] ;
            }
        }

        if(!appName){
            // if not found, get from param ?appName=
            if(req.query.appName){
                appName = req.query.appName ;
            }
        }

        if(appName){
            if(!appCache[appName]){
                //check that the app exists
                let allApps = await runQueryMain(`SELECT *
                    FROM public.app
                    WHERE code = $1`, [appName]) ;
                if(allApps.rows.length>0){
                    appCache[appName] = allApps.rows[0] ;
                }else{
                    return res.end(`Application ${appName} not found`) ;
                }
            }
        }

        if(!appName){
            // run the default app
            appName = process.env.DB_NAME ;
        }
        
        req.appName = appName ;
        res.setHeader('app-name', appName) ;
        next() ;
    });

    app.use(cors(async (req, callback) =>{

        const defaultAllowed = ["Content-Type", "Accept", "Range", "x-lang","x-timezone", "x-binding-refresh-id", "Authorization", "x-cors-auth"] ;
        const defaultExposed = ["Accept-Ranges", "Content-Encoding", "Content-Length", "Content-Range", "Content-Disposition", "Content-Type"] ;
        if(req.headers["access-control-request-headers"]){
            const requestedHeaders = req.headers["access-control-request-headers"].split(",") ;
            for(let rh of requestedHeaders){
                if(!defaultAllowed.includes(rh)){
                    defaultAllowed.push(rh) ;
                }
                if(!defaultExposed.includes(rh)){
                    defaultExposed.push(rh) ;
                }
            }
        }
        if(req.appName){
            let pluginData = await contextOfApp(req.appName) ;
            if(pluginData){
                for(let config of Object.values(pluginData.pluginsData)){
                    if(config.cors){
                        for(let cor of config.cors){
                            cor = cor.replace(":appName", req.appName) ;
                            if(!defaultAllowed.includes(cor)){
                                defaultAllowed.push(cor) ;
                            }
                            if(!defaultExposed.includes(cor)){
                                defaultExposed.push(cor) ;
                            }
                        }
                    }
                }
            }
        }
        const  corsOptions = {
            origin: /.*/,
            credentials: true,
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            allowedHeaders: defaultAllowed,
            exposedHeaders: defaultExposed
        } ;
        callback(null, corsOptions);
    }));

    function getAppPath(appName){
        if(appName===process.env.DB_NAME){
            return path.join(__dirname, "open-bamz-front");
        }
        return path.join(process.env.DATA_DIR, "apps" ,appName, "public");
    }
    
    // Initialize plugins
    const pluginsData = await initPlugins({app, logger, graphql, runQuery, runQueryMain, getDbClient, io}) ;



    // Middleware to search all HTML files or / requests and inject bamz-lib
    app.get(/.*\.html$|\/$/, async (req, res, next) => {
        let appName = req.appName ;
        let relativePath = null;
        let basePath = null; 
        let isPlugin = false;
        if(req.originalUrl.startsWith("/plugin")){
            //file in plugin
            isPlugin = true;
            let pluginName = req.originalUrl.replace(/^\/plugin\//, "").replace(/\?.*$/,"").replace(/^\//, ""); 
            let slashIndex = pluginName.indexOf("/");
            if(slashIndex !== -1){
                pluginName = pluginName.substring(0, slashIndex) ;
            }

            if(!pluginsData[pluginName]){
                //plugin not found
                return res.status(404).send("Plugin not found");
            }

            let allowedToServe = true ;

            relativePath = req.originalUrl.replace(`/plugin/${pluginName}`, '').replace(/\?.*$/,"");

            if(!req.jwt?.bamz){
                // not connected
                allowedToServe = false ;
                if(pluginsData[pluginName].frontEndPublic){
                    // serve public files
                    let publicFiles = pluginsData[pluginName].frontEndPublic ;
                    if(!Array.isArray(publicFiles)){
                        publicFiles = [publicFiles] ;
                    }
                    for(let pf of publicFiles){
                        if(relativePath === pf || relativePath.startsWith(pf+"/")){
                            allowedToServe = true ;
                            break;
                        }
                    }
                }
            }
            if(!allowedToServe){
                return res.status(403).send("Forbidden");
            }

            //get base path from plugins data
            basePath = pluginsData[pluginName]?.frontEndFullPath
        } else {
            //file in app sources
            relativePath = req.originalUrl.replace(`/app/${appName}`, '').replace(/^\//, "");;
            basePath = getAppPath(appName);
        }

        if(!basePath){
            //no base path, maybe try to load a plugin that does not exists anymore
            return next() ;
        }
        let filePath = path.join(basePath, relativePath);
        if(req.originalUrl.replace(/\?.*$/,"").endsWith('/')){
            filePath = path.join(filePath, "index.html") ;
        }
        try{
            const data = await fs.promises.readFile(filePath, 'utf8') ;
            let modifiedHtml = data;
            // Example modification: Inject a script tag
            modifiedHtml = injectBamz(modifiedHtml, appName, isPlugin) ;
            
            res.setHeader('Content-Type', 'text/html');
            res.end(modifiedHtml);
        // eslint-disable-next-line no-unused-vars
        }catch(err){
            //error reading file, continue with standard
            return next(); 
        }
    }) ;

    //Register after the middleware to modify HTML
    for(let pluginDir of Object.keys(pluginsData)){
        //register static files of each plugin
        if(pluginsData[pluginDir].frontEndPath){
            app.use(`/plugin/${pluginDir}/`, express.static(pluginsData[pluginDir].frontEndFullPath));
        }

        //register router of each plugin
        if(pluginsData[pluginDir].router){
            logger.info(`Register routing /${pluginDir}/`);
            app.use(`/${pluginDir}/`, pluginsData[pluginDir].router);
        }
    }

    // Serve bamz-lib static files
    app.use(`/bamz-lib/`, express.static(path.join(__dirname, "lib-client")));

    // List of plugins
    app.get("/plugin_list", (req, res)=>{
        res.json(Object.keys(pluginsData).map(pluginId=>{
            return {
                id: pluginId,
                description: pluginsData[pluginId].manifest.description,
                name: pluginsData[pluginId].manifest.name
            }
        }))
    });

    // Special route to serve the admin menu JS
    app.get("/_openbamz_admin.js", middlewareMenuJS);

    const graphqlServers = [] ;

    /**
     * Dynamically load the application GraphQL instance
     */
    app.use(["/graphql/*any", "/graphiql/*any"], async (req, res, next)=>{
        // initialize graphql and static files serve
        //let appName = req.appName ;
        let appName = req.baseUrl.replace(/^\/graph[i]{0,1}ql\//, "").replace(/^\/app\/{0,1}/, "") ; ;
        let slashIndex = appName.indexOf("/");
        if(slashIndex !== -1){
            appName = appName.substring(0, slashIndex) ;
        }
        if(appName && appName !== process.env.DB_NAME){
            // get the graphql instance
            try{
                if(!appCache[appName]){
                    //check that the app exists
                    let allApps = await runQueryMain(`SELECT *
                        FROM public.app
                        WHERE code = $1`, [appName]) ;
                    if(allApps.rows.length>0){
                        appCache[appName] = allApps.rows[0] ;
                    }else{
                        //app not found
                        return next() ;
                    }
                }
                
                let serv = await graphql.initDatabase(appName) ;
                if(serv){
                    //add the handler to the list
                    graphqlServers.push(serv);
                }
            }catch(err){
                logger.error("Error while handling graphql request %o", err);
                res.status(err.statusCode??500).json(err);
            }finally{
                next() ;
            }   
        }else{
            //graphql already loaded
            next() ;
        }
    });

    /**
     * Pass the request to each graphql server handler
     * If one handler handle the request, we stop the loop
     * Otherwise we call next to go to the next middleware
     */
    app.use(async (req, res, next)=>{
        let handled = false;
        for(let i=0; i<graphqlServers.length; i++){
            let s = graphqlServers[i] ;
            if(s.handler){
                let nextCalled = false;
                await s.handler(req, res, /*next*/()=>{
                    nextCalled = true; //this mean that the handler did not handle req
                });
                if(!nextCalled){
                    //next has not been called, the handler did handle req
                    handled = true;
                }
            }else{
                graphqlServers.splice(i, 1);
                i--;
                //remove the handler
            }
        }
        if(!handled){
            //no handler processed the req, go to next
            next();
        }
    }) ;

    app.use(async (req, res, next)=>{
        const appName = req.appName ;
        if(!appName){ 
            return next() ;
        }
        let relativePath = req.originalUrl.replace(/^\//, "").replace(/\?.*$/, "");
        if(relativePath === ""){
            relativePath = "index.html" ;
        }
        const appFilePath = getAppPath(appName);

        const filePath = path.join(appFilePath, relativePath);
        //don't allow to access files outside the public directory
        if(!filePath.startsWith(appFilePath)){
            return next() ;
        }
        try {
            let stats = await fsp.stat(filePath);
            if (!stats.isFile()) {
                // File does not exist or is not a file
                return next(); 
            }

            const type = mime.contentType(extname(filePath)) || 'application/octet-stream'

            res.setHeader('Content-Type', type)

            // Serve the file
            createReadStream(filePath).pipe(res);
        }catch(err){
            return next() ;
        }
    }); 

    // Create a Node HTTP server, mounting Express into it
    const server = createServer(app);

    // Initialize WebSocket (socker.io)
    initWebSocket(server) ;

    server.on("error", (e) => {
        logger.error("Unexpected error %o", e);
    });
    const pgl = await graphql.getMainGraphql();
    const serv = pgl.createServ(grafserv);

    serv.addTo(app, server).catch((e) => {
        logger.error("Unexpected error %o", e);
        process.exit(1);
    });

    server.listen(port, () => {
        logger.info(`Open BamZ is listening on port ${port}`)
        logger.info(
            `GraphiQL (GraphQL IDE) endpoint: http://localhost:${port}/graphql`
        );
    })
}


prepare().then(start);