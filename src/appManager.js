
const schedule = require('node-schedule');
const path = require("path") ;
const { readdir } = require('node:fs/promises');
const logger = require("./logger");
const { Migrator } = require('./database/migrator/migrator');


async function loadApps(params){
    let appsData = {} ;
    
    let appDirs = (await readdir(path.join(process.env.DATA_DIR, "apps"), { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
    for(let appDir of appDirs){
        let appSettings = {
            name: appDir,
            hasPublic: false,
            hasFrontend: false,
            routers : []
        } 
        let baseDir = path.join(process.env.DATA_DIR, "apps", appDir) ;
        let subdirs = (await readdir(baseDir, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
        if(subdirs.includes("public")){
            baseDir = path.join(baseDir, "public") ;
            subdirs = (await readdir(baseDir, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            appSettings.hasPublic = true ;
        }
        if(subdirs.includes("frontend")){
            appSettings.hasFrontend = true ;
        }
        if(subdirs.includes("backend")){
            appSettings.hasBackend = true ;
            const backendDir = path.join(baseDir, "backend") ;
            const backendSubdirs = (await readdir(backendDir, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            if(backendSubdirs.includes("routers")){
                appSettings.hasRouters = true ;
                const routersFiles = (await readdir(path.join(backendDir, "routers"), { withFileTypes: true }))
                    .filter(f => !f.isDirectory() && f.name.endsWith(".js"))
                    .map(dirent => dirent.name);
                for(let routerFile of routersFiles){
                    let router = (await import(path.join(backendDir, "routers", routerFile))).default ; 
                    if(!router){
                        logger.warn(`Router file ${routerFile} in app ${appDir} does not export a default router object.`) ;
                        continue ;
                    }
                    appSettings.routers.push({
                        name: routerFile.replace(".js", ""),
                        router: router
                    }) ;
                }
            }
            if(backendSubdirs.includes("schedulers")){
                appSettings.hasSchedulers = true ;
                const schedulersFiles = (await readdir(path.join(backendDir, "schedulers"), { withFileTypes: true }))
                    .filter(f => !f.isDirectory() && f.name.endsWith(".js"))
                    .map(dirent => dirent.name);
                for(let schedulersFile of schedulersFiles){
                    let scheduler = (await import(path.join(backendDir, "schedulers", schedulersFile))) ; 
                    let schedulerFunction = scheduler.default ;
                    let schedulerCron = scheduler.schedule ;
                    if(!schedulerFunction){
                        logger.warn(`Scheduler file ${schedulersFile} in app ${appDir} does not export a default scheduler object.`) ;
                        continue ;
                    }
                    if(!schedulerCron){
                        logger.warn(`Scheduler file ${schedulersFile} in app ${appDir} does not export schedule property.`) ;
                        continue ;
                    }
                    logger.info(`Scheduling ${schedulersFile} of app ${appDir} with cron ${schedulerCron}`) ;
                    schedule.scheduleJob(scheduler.schedule, async() => {
                        try{
                            await schedulerFunction({...params}) ;
                        }catch(err){
                            logger.error(`Error executing scheduler ${schedulersFile} of app ${appDir} : %o`, err) ;
                        }
                    }) ;
                }
            }
            if(backendSubdirs.includes("database")){
                const hasManifest = (await readdir(path.join(backendDir, "database"), { withFileTypes: true }))
                .find(f => !f.isDirectory() && f.name === "manifest.js")
                if(hasManifest){
                    try{
                        appSettings.hasDatabaseMigration = true ;
                        const pool = await params.getDbPool({database: appDir});
                        logger.info(`Migrating app ${appDir} database...`) ;
                        const migrator = new Migrator({ pool, migrationsDir: path.join(backendDir, "database") }) ;
                        await migrator.migrate() ;
                        logger.info(`App ${appDir} database migrated successfully.`) ;
                    }catch(err){
                        logger.error(`Error occurred while migrating app ${appDir} database : %o`, err) ;
                    }
                }
            }

            const backendFiles = (await readdir(path.join(backendDir), { withFileTypes: true }))
                    .filter(f => !f.isDirectory() && f.name.endsWith(".js"))
                    .map(dirent => dirent.name);
            if(backendFiles.includes("init.js")){
                let initFunction = (await import(path.join(backendDir, "init.js"))).default ; 
                if(initFunction && typeof initFunction === "function"){
                    try{
                        await initFunction({...params}) ;
                    }catch(err){
                        logger.error(`Error initializing backend of app ${appDir} : %o`, err) ;
                    }
                }
            }

        }
        appsData[appDir] = appSettings ;
    }
    
    return appsData;
}


module.exports.loadApps = loadApps;