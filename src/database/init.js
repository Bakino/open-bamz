const logger = require("../logger") ;
const { readFile } = require('node:fs/promises');
const path = require("path") ;
const { run, Logger } = require("graphile-worker");
const fs = require('fs-extra');
const { getDbClient, runQueryMain } = require("./dbAccess");
const { dynamicImport, clearCache } = require("../pluginManager");
const { Client } = require('pg');

/**
 * Create the database if it does not exist
 * @param {*} options 
 */
async function createIfNotExist(options){
    const client = new Client(options) ;
    try{
        await client.connect();
        logger.debug("Database connection OK");
    }catch(err){
        if(err.message && err.message.indexOf("ECONNREFUSED") !== -1){
            throw err;
        }
        //likely db does not exists
        logger.info("Database "+options.database+"does not exists, try to create");
        let optionsCreate = {} ;
        Object.keys(options).forEach((k)=>{
            optionsCreate[k] = options[k] ;
        }) ;
        optionsCreate.database = "postgres" ;
        const clientCreate = new Client(optionsCreate) ;
        try{
            await clientCreate.connect();
            await clientCreate.query("CREATE DATABASE "+options.database, []);
        }finally{
            clientCreate.end() ;
        }
        
    }finally{
        client.end() ;
    }
}

/**
 * Prepare the database schema from init file
 * @param {*} options 
 * @param {*} schemaName 
 */
async function prepareSchema(options, schemaName){
    const client = await getDbClient(options) ;
    try{
        let sql = await readFile(path.join(__dirname, schemaName+".sql"), {encoding: "utf8"}) ;
        logger.info("start run query");
        await client.query(sql);        
        logger.info("end run query");
    }finally{
        client.release() ;
    }
}

async function createRolesIfNeeded(options){
    const client = await getDbClient(options) ;
    try{
        const roles = ["normal_user", "anonymous"] ;
        for(let role of roles){
            let result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [role]);
            if(result.rows.length === 0){
                logger.info(`create ROLE ${role}`);
                await client.query(`CREATE ROLE ${role}
                    NOSUPERUSER
                    NOCREATEDB
                    NOCREATEROLE
                    NOREPLICATION`)

            } 
        }
        let roleAdmin = "admin";
        let result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [roleAdmin]);
        if(result.rows.length === 0){
            logger.info(`create ROLE ${roleAdmin}`);
            await client.query(`CREATE ROLE ${roleAdmin}
                NOSUPERUSER
                CREATEDB
                CREATEROLE
                REPLICATION`)

        } 
    }finally{
        client.release() ;
    }
}
/**
 * Prepare the main roles in the database
 * @param {*} options 
 */
async function prepareMainRoles(options){
    const client = await getDbClient(options) ;
    try{
        let role = "normal_user";
        let result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [role]);
        if(result.rows.length === 0){
            logger.info(`create ROLE ${role}`);
            await client.query(`CREATE ROLE ${role}
                NOSUPERUSER
                NOCREATEDB
                NOCREATEROLE
                NOREPLICATION`)

        } 

        
        await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${options.database} TO ${role}`)


        await client.query(`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ${role}`)

        //await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${role}`)

        //await client.query(`GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ${role}`)

        //await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`)
        //await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${role}`)
        //await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${role}`)

        let roleAnonymous = "anonymous";
        result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [roleAnonymous]);
        if(result.rows.length === 0){
            logger.info(`create ROLE ${roleAnonymous}`);
            await client.query(`CREATE ROLE ${roleAnonymous}
                NOSUPERUSER
                NOCREATEDB
                NOCREATEROLE
                NOREPLICATION`)

        } 

        let roleAdmin = "admin";
        result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [roleAdmin]);
        if(result.rows.length === 0){
            logger.info(`create ROLE ${roleAdmin}`);
            await client.query(`CREATE ROLE ${roleAdmin}
                NOSUPERUSER
                CREATEDB
                CREATEROLE
                REPLICATION`)

        } 
        
        await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${options.database} TO ${roleAdmin}`)


        for(let schemaName of [ "public", "private"]){
            await client.query(`GRANT ALL PRIVILEGES ON SCHEMA ${schemaName} TO ${roleAdmin}`)
            await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schemaName} TO ${roleAdmin}`)
    
            await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schemaName} TO ${roleAdmin}`)
    
            await client.query(`GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ${schemaName} TO ${roleAdmin}`)
            await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schemaName} TO ${roleAdmin}`)
            await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schemaName} TO ${roleAdmin}`)
    
            await client.query(`GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ${schemaName} TO ${roleAdmin}`)
    
            await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON TABLES TO ${roleAdmin}`)
            await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON SEQUENCES TO ${roleAdmin}`)
            await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON FUNCTIONS TO ${roleAdmin}`)
        }

    }finally{
        client.release() ;
    }
} 

/**
 * Prepare the plugins in the database
 * @param {*} options 
 */
async function preparePlugins(options){
    const client = await getDbClient(options) ;
    try{

        let result = await client.query(`SELECT * FROM openbamz.plugins`);
        let plugins = result.rows ;

        const grantSchemaAccess = (schema) =>{
            grantDefaultAccess(client, schema, options.database) ;
        }

        await clearCache(options.database);
        for(let pluginRecord of plugins){
            let plugin = await dynamicImport(pluginRecord.plugin_id);
            if(!plugin){ continue ; }
            const filesDirectory = path.join(process.env.DATA_DIR, "apps" , options.database);
            await plugin.prepareDatabase({client, options, grantSchemaAccess, filesDirectory});
        }
    }finally{
        client.release() ;
    }
}

/**
 * Add a plugin to the database
 * @param {*} options 
 * @param {*} pluginName 
 */
async function addPlugin(options, pluginName){
    const client = await getDbClient(options) ;
    try{
        await clearCache(options.database);
        let plugin = await dynamicImport(pluginName);
        if(plugin){

            if(plugin.dependencies){
                for(let dep of plugin.dependencies){
                    await client.query(`INSERT INTO openbamz.plugins(plugin_id) VALUES ($1) ON CONFLICT DO NOTHING`, [dep]);
                }
            }


            const grantSchemaAccess = (schema, level="default") =>{
                if(level === "default"){
                    grantDefaultAccess(client, schema, options.database) ;
                }
                if(level === "admin"){
                    grantAdminAccess(client, schema, options.database) ;
                }
                if(level === "user"){
                    grantUserAccess(client, schema, options.database) ;
                }
            }
            
            const filesDirectory = path.join(process.env.DATA_DIR, "apps" , options.database);
            await plugin.prepareDatabase({client, options, grantSchemaAccess, filesDirectory});
        }else{
            logger.warn("Unknown plugin "+pluginName) ;
        }
    }finally{
        client.release() ;
    }
}

/**
 * Remove a plugin from the database
 * @param {*} options 
 * @param {*} pluginName 
 */
async function removePlugin(options, pluginName){
    const client = await getDbClient(options) ;
    try{
        await clearCache(options.database);
        let plugin = await dynamicImport(pluginName);
        if(plugin){
            await plugin.cleanDatabase({client});
        }
    }finally{
        client.release() ;
    }
}

/**
 * Grant all access to the database admin user on a schema
 * @param {*} client 
 * @param {*} schemaName 
 * @param {*} databaseName 
 */
async function grantAdminAccess(client, schemaName, databaseName){
    let role = databaseName+"_admin";

    await client.query(`GRANT ALL PRIVILEGES ON SCHEMA ${schemaName} TO ${role}`)

    await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schemaName} TO ${role}`)

    await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schemaName} TO ${role}`)

    await client.query(`GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ${schemaName} TO ${role}`)

    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL PRIVILEGES ON TABLES TO ${role}`)
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL PRIVILEGES ON SEQUENCES TO ${role}`)
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL PRIVILEGES ON FUNCTIONS TO ${role}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schemaName} GRANT ALL ON TABLES TO ${role}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schemaName} GRANT ALL ON SEQUENCES TO ${role}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schemaName} GRANT ALL ON FUNCTIONS TO ${role}`)
}

/**
 * Grant base access to the database user and readonly roles on a schema
 * @param {*} client 
 * @param {*} schemaName 
 * @param {*} databaseName 
 */
async function grantBaseAccess(client, schemaName, databaseName){
    let roleUser = databaseName+"_user";
    let roleReadonly = databaseName+"_readonly";

    for(let role of [roleUser, roleReadonly]){
        //give access to schema
        await client.query(`GRANT USAGE ON SCHEMA ${schemaName} TO ${role}`)

        //allow run functions
        await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schemaName} TO ${role}`)

        //set default for future functions
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT EXECUTE ON FUNCTIONS TO ${role}`)
    }

}



/**
 * Grant SELECT, UPDATE, INSERT, DELETE access to the database normal user on a schema
 * @param {*} client 
 * @param {*} schemaName 
 * @param {*} databaseName 
 */
async function grantUserAccess(client, schemaName, databaseName){
    let role = databaseName+"_admin";
    let roleUser = databaseName+"_user";

   
    await client.query(`GRANT SELECT, UPDATE, INSERT, DELETE ON ALL TABLES IN SCHEMA ${schemaName} TO ${roleUser}`)
    await client.query(`GRANT SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${schemaName} TO ${roleUser}`)
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schemaName} TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT SELECT, UPDATE, INSERT, DELETE ON TABLES TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT SELECT, UPDATE ON SEQUENCES TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT EXECUTE ON FUNCTIONS TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schemaName} GRANT SELECT, UPDATE, INSERT, DELETE ON TABLES TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schemaName} GRANT SELECT, UPDATE, INSERT, DELETE ON TABLES TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schemaName} GRANT SELECT, UPDATE ON SEQUENCES TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA ${schemaName} GRANT SELECT, UPDATE ON SEQUENCES TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA ${schemaName} GRANT EXECUTE ON FUNCTIONS TO ${roleUser}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA ${schemaName} GRANT EXECUTE ON FUNCTIONS TO ${roleUser}`)
}

/**
 * Grant SELECT access to the database readonly user on a schema
 * @param {*} client 
 * @param {*} schemaName 
 * @param {*} databaseName 
 */
async function grantReadOnlyAccess(client, schemaName, databaseName){
    let role = databaseName+"_admin";
    let roleReadonly = databaseName+"_readonly";

    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${schemaName} TO ${roleReadonly}`)

    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT SELECT ON TABLES TO ${roleReadonly}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schemaName} GRANT SELECT ON TABLES TO ${roleReadonly}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA ${schemaName} GRANT SELECT ON TABLES TO ${roleReadonly}`)
}

/**
 * Grant the default access (admin, user, readonly) to the database roles on a schema
 * @param {*} client 
 * @param {*} schemaName 
 * @param {*} databaseName 
 */
async function grantDefaultAccess(client, schemaName, databaseName){
    await grantAdminAccess(client, schemaName, databaseName);
    await grantBaseAccess(client, schemaName, databaseName);
    await grantUserAccess(client, schemaName, databaseName);
    await grantReadOnlyAccess(client, schemaName, databaseName);
}


/**
 * Prepare the database role for the account
 * @param {*} options 
 * @param {*} account 
 */
async function prepareRole(options, account){
    const client = await getDbClient(options) ;
    try{

        let role = options.database+"_admin";
        let result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [role]);
        if(result.rows.length === 0){
            logger.info(`create ROLE ${role}`);
            await client.query(`CREATE ROLE ${role}
                NOSUPERUSER
                NOCREATEDB
                NOCREATEROLE
                NOREPLICATION;`)
        } 

        await client.query(`GRANT ${role} TO "${account._id}"`)

        logger.info("Finish GRANT ROLE");
    }finally{
        client.release() ;
    }
} 

/**
 * Prepare the privileges for the application roles
 * @param {*} options 
 */
async function preparePrivileges(options){
    const client = await getDbClient(options) ;
    try{

        let role = options.database+"_admin";
        let result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [role]);
        if(result.rows.length === 0){
            logger.info(`create ROLE ${role}`);
            await client.query(`CREATE ROLE ${role}
                NOSUPERUSER
                NOCREATEDB
                NOCREATEROLE
                NOREPLICATION;`)
        } 

        await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${options.database} TO ${role}`)

        let roleUser = options.database+"_user";
        result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [roleUser]);
        if(result.rows.length === 0){
            logger.info(`create ROLE ${roleUser}`);
            await client.query(`CREATE ROLE ${roleUser}
                NOSUPERUSER
                NOCREATEDB
                NOCREATEROLE
                NOREPLICATION;`)
        } 

        let roleReadonly = options.database+"_readonly";
        result = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname =  $1", [roleReadonly]);
        if(result.rows.length === 0){
            logger.info(`create ROLE ${roleReadonly}`);
            await client.query(`CREATE ROLE ${roleReadonly}
                NOSUPERUSER
                NOCREATEDB
                NOCREATEROLE
                NOREPLICATION;`)
        } 

        for(let schemaName of [ "public", "openbamz"]){
            await grantAdminAccess(client, schemaName, options.database);
            await grantBaseAccess(client, schemaName, options.database);
        }

        await grantUserAccess(client, "public", options.database) ;

        await grantReadOnlyAccess(client, "public", options.database) ;
       
        logger.info("Finish GRANT PRIVILEGES");
    }finally{
        client.release() ;
    }
} 

/**
 * Start the workers for all applications
 * @param {*} options 
 */
async function startAllWorkers(options){
    //start main workers
    startWorkers(options).catch((err) => {
        logger.warn(err);
        process.exit(1);
    });
    
    let allApps = await runQueryMain(`SELECT code FROM app`) ;
    for(let app of allApps.rows){
        let opts = { ...options, database: app.code}
        startWorkers(opts).catch((err) => {
            logger.warn(err);
            //process.exit(1);
        });
    }
}

/**
 * Start the workers for the application
 * @param {*} options 
 */
async function startWorkers(options) {
    logger.info("Start workers for "+options.database);
  // Run a worker to execute jobs:
  const runner = await run({
    connectionString: `postgres://${options.user}:${options.password}@${options.host}:${options.port}/${options.database}`,
    concurrency: 5,
    logger: new Logger((/*scope*/)=>{
        return (level, message, meta)=>{
            if(level === "warning"){ level = "warn" ;}
            if(logger[level]){
                logger[level](message, meta) ;
            }else{
                logger.info(message, meta) ;
            }
        }
    }),
    crontabFile: path.join(__dirname, "crontab"),
    // Install signal handlers for graceful shutdown on SIGINT, SIGTERM, etc
    noHandleSignals: false,
    pollInterval: 1000,
    // you can set the taskList or taskDirectory but not both
    taskDirectory: `${__dirname}/tasks`,
  });

  // Immediately await (or otherwise handle) the resulting promise, to avoid
  // "unhandled rejection" errors causing a process crash in the event of
  // something going wrong.
  await runner.promise;

  // If the worker exits (whether through fatal error or otherwise), the above
  // promise will resolve/reject.
}

const BASE_DIR = path.join(process.env.DATA_DIR, "apps") ;
/**
 * Prepare the application directory structure
 * @param {*} options 
 */
async function prepareAppDirectory(options) {
    logger.info("CREATE DIRECTORY "+path.join(BASE_DIR, options.database))
    await fs.ensureDir(path.join(BASE_DIR, options.database)) ;
    await fs.ensureDir(path.join(BASE_DIR, options.database, "public")) ;
    await fs.ensureDir(path.join(BASE_DIR, options.database, "branches")) ;
    logger.info("WRITE FILE "+path.join(BASE_DIR, options.database, "public", "index.html"))
    await fs.writeFile(path.join(BASE_DIR, options.database, "public", "index.html"),`<html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
        <title>${options.database}</title>
    </head>
    <body>
        
    </body>
</html>`, {encoding: "utf8"})
}

/**
 * Delete the application directory structure
 * @param {*} options 
 */
async function deleteAppDirectory(options) {
    logger.info("REMOVE DIRECTORY "+path.join(BASE_DIR, options.database))
    await fs.remove(path.join(BASE_DIR, options.database)) ;
}


module.exports.createIfNotExist = createIfNotExist;
module.exports.prepareSchema = prepareSchema;
module.exports.createRolesIfNeeded = createRolesIfNeeded;
module.exports.prepareMainRoles = prepareMainRoles;
module.exports.startWorkers = startWorkers;
module.exports.startAllWorkers = startAllWorkers;
module.exports.prepareRole = prepareRole;
module.exports.preparePrivileges = preparePrivileges;
module.exports.prepareAppDirectory = prepareAppDirectory;
module.exports.deleteAppDirectory = deleteAppDirectory;
module.exports.preparePlugins = preparePlugins;
module.exports.addPlugin = addPlugin;
module.exports.removePlugin = removePlugin;