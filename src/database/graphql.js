const { grafast } = require("grafast");
const graphileConfig = require("./graphileConfig");
const { postgraphile } = require("postgraphile");
const { getConnectionInfo, MAIN_DB_OPTIONS, getDbClient } = require("./dbAccess");
const { prepareSchema, preparePlugins, preparePrivileges } = require("./init");
const { grafserv } = require("postgraphile/grafserv/express/v4");

const logger = require("../logger");

let pglMain;
/**
 * Get the main database postgraphile instance
 * @returns the main database postgraphile instance
 */
function getMainGraphql() {
    if (pglMain) {
        return pglMain;
    }
    pglMain = postgraphile(graphileConfig.mainDbPreset);
    return pglMain;
}

/**
 * Run a GraphQL query against the main database
 * @param {*} query 
 * @param {*} headers 
 * @returns 
 */
async function runMainGraphql(query, role) {
    const { schema, resolvedPreset } = await (await getMainGraphql()).getSchemaResult();
    const { data, errors } = await grafast({
        schema,
        resolvedPreset,
        requestContext: {
            node: { req: { headers: {} } }
        },
        contextValue: {
            forceRole: role?{
                role: role
            }:undefined
        },
        source: query,
        variableValues: {},
    });
    if (errors?.length > 0) {
        throw errors;
    }
    return data;
}

/**
 * Middleware to check if the logged user has access to the requested application
 * @param {*} req 
 * @param {*} res 
 * @param {*} appName 
 * @param {*} jwtToken 
 * @returns 
 */
async function checkAppAccessMiddleware(req, res, appName) {
    if(!appName){
        appName = req.appName || req.params.appName ;
    }
    try{
        // Check user has proper authorization
        await checkAppAccess(appName, req.jwt?.bamz?.role);
        return true;
    }catch(err){
        console.log("checkAppAccessMiddleware error", err) ;
        res.status(err.statusCode??500).json(err);
        return false;
    }
}

/**
 * Check if the user has access to the specified application
 * @param {*} appName 
 * @param {*} jwtToken 
 * @returns 
 */
async function checkAppAccess(appName, role) {
    if(!role){ throw { statusCode: 401, message: "No token" } ; }
    let result = await runMainGraphql(`query { app_by_code(code: "${appName}") { code } }`, role);

    if(result.app_by_code?.code === appName){
        return true;
    }
    throw { statusCode: 401, message: "Unauthorized for app "+appName } ;
}

let pglByDb = {};
/**
 * Get the database postgraphile instance for the specified application
 * @param {*} appName 
 * @returns 
 */
async function getDbGraphql(appName) {
    if (pglByDb[appName]) {
        return pglByDb[appName];
    }
    let account = await getConnectionInfo(MAIN_DB_OPTIONS, appName);
    if (!account) {
        logger.warn(`No account information for ${appName}`);
        throw `No account information for ${appName}`;
    }
    const options = {
        user: account._id,
        password: account.password,
        superuser: process.env.DB_USER,
        superpassword: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: appName
    };

    let client = await getDbClient(options) ;
    try{
        let plugins = (await client.query("SELECT plugin_id FROM openbamz.plugins")).rows;
        let schemas = (await client.query("select schema_name from information_schema.schemata")).rows;
        let publicSchemas = ["public", "openbamz"].concat(schemas.filter(s=>plugins.some(p=>(p.plugin_id||"").replace("open-bamz-", "")===s.schema_name)).map(s=>s.schema_name))
        console.log("publicSchemas of "+appName, publicSchemas);
        options.schemas = publicSchemas ;
        pglByDb[appName] = postgraphile(graphileConfig.createAppPreset(options));
        return pglByDb[appName];
    }finally{
        client.release();
    }

}


/**
 * Run a GraphQL query against the specified application's database
 * @param {*} appName 
 * @param {*} query 
 * @param {*} headers 
 * @returns 
 */
async function runDbGraphql(appName, query, headers) {
    const { schema, resolvedPreset } = await (await getDbGraphql(appName)).getSchemaResult();
    //const { data, errors } = await grafast({
    const result = await grafast({
        schema,
        resolvedPreset,
        requestContext: {
            node: { req: { headers: headers } }
        },
        source: query,
        variableValues: {},
        contextValue: {
            forceRole: {
                role: appName+"_admin"
            }
        }
        // context(requestContext, args) {
        //     return {
        //       pgSettings: {
        //         role: appName+"_admin"
        //       },
        //     };
        //   },
    });
    if (result.errors?.length > 0) {
        throw result.errors;
    }
    return result.data;
}

const graphServers = {} ;
const initializingDatabase = {} ;
/**
 * Initialize the database for the specified application
 * @param {*} appName 
 * @returns 
 */
async function initDatabase(appName){
    if(initializingDatabase[appName]){
        //init is in progress, retry in 100ms
        return new Promise((resolve, reject)=>{
            setTimeout(()=>{
                initDatabase(appName).then(resolve).catch(reject) ;
            }, 100) ;
        })
    }
    if(graphServers[appName]){
        //already initialized, return
        return false;
    }
    try{
        initializingDatabase[appName] = true;
        let options = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: appName
        }; 
        logger.info(`Start initialize database ${appName}`) ;
        await prepareSchema(options, "init_base") ;
        await preparePrivileges(options) ;
        await preparePlugins(options) ;
        const pgl = await getDbGraphql(appName);
        const serv = pgl.createServ(grafserv);
        serv.handler = serv.createHandler() ;
        graphServers[appName] = serv;
        logger.info(`Finished initialize database ${appName}`) ;
        return serv;
    }finally{
        delete initializingDatabase[appName] ; 
    }
}

/**
 * Clear the cached GraphQL instance for the specified application
 * @param {*} appName 
 * @returns 
 */
async function clearDatabase(appName) {
    if(initializingDatabase[appName]){
        //init is in progress, retry in 100ms
        return new Promise((resolve, reject)=>{
            setTimeout(()=>{
                clearDatabase(appName).then(resolve).catch(reject) ;
            }, 100) ;
        })
    }
    if (graphServers[appName]) {
        await graphServers[appName].release();
        delete graphServers[appName].handler ;
        delete graphServers[appName];
    }
    if (pglByDb[appName]) {
        delete pglByDb[appName];
    }
}

module.exports.getMainGraphql = getMainGraphql;
module.exports.runMainGraphql = runMainGraphql;
module.exports.getDbGraphql = getDbGraphql;
module.exports.runDbGraphql = runDbGraphql;
module.exports.checkAppAccess = checkAppAccess;
module.exports.checkAppAccessMiddleware = checkAppAccessMiddleware;
module.exports.clearDatabase = clearDatabase;
module.exports.initDatabase = initDatabase;