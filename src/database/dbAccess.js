const { Pool } = require('pg');
const logger = require('../logger');


// Main DB connection information from env variables
const MAIN_DB_OPTIONS = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
};

const POOLS = {} ;
/**
 * Get a database client with the specified options.
 * @param {*} options connection options (user, password, host, port, database). Use MAIN_DB_OPTIONS as default
 * @returns a pg database client (don't forget to call client.release() when done !)
 */
async function getDbClient(options){
    let opt = JSON.parse(JSON.stringify(MAIN_DB_OPTIONS));
    for(let k of Object.keys(options)){
        opt[k] = options[k];
    }
    let key = JSON.stringify(opt) ;
    let pool = POOLS[key] ;
    if(!pool){
        pool = new Pool(opt);
        POOLS[key] = pool;
    }
    const client = await pool.connect() ;
    let _query = client.query ;
    client.query = async function(query, params){
        try{
            return await _query.call(client, query, params) ;
        }catch(err){
            logger.error("Error while running query %o (params %o) : %o", query, params, err) ;
            throw err;
        }
    }
    return client;
}   

/**
 * Get a database client for the main database
 * @returns a pg database client for the main database (don't forget to call client.release() when done !)
 */
async function getMainDbClient(){
    return await getDbClient(MAIN_DB_OPTIONS) ;
}

/**
 * Run a single database query with the specified options.
 * @param {*} options connection options (user, password, host, port, database). Use MAIN_DB_OPTIONS as default
 * @param {*} query SQL query string
 * @param {*} params Query parameters
 * @returns Query result
 */
async function runQuery(options, query, params){
    //console.log("run query ", options.database, query) ;
    let client = await getDbClient(options) ;
    try{
        let results = await client.query(query, params);
        return results;
    }finally{
        client.release();
    }
}

/**
 * Run a single database query in the main database.
 * @param {*} query SQL query string
 * @param {*} params Query parameters
 * @returns Query result
 */
async function runQueryMain(query, params){
    let client = await getMainDbClient() ;
    let results = await client.query(query, params);
    client.release();
    return results;
}

/**
 * Get connection information for a specific application.
 *
 * The connection to application database is done with the unprivileged application owner account.
 *
 * @param {*} options connection options (user, password, host, port, database). Use MAIN_DB_OPTIONS as default
 * @param {*} database application database name
 * @returns application connection information
 */
async function getConnectionInfo(options, database){
    let result = await runQuery(options, `SELECT acc.* FROM app a 
        JOIN private.account acc ON a.owner = acc._id
        WHERE a.code =  $1`, [database]);
    let appAccount = result.rows[0] ;

    return appAccount;
}

/**
 * Check if the application has a specific plugin.
 * @param {*} appName 
 * @param {*} plugin 
 * @returns 
 */
async function hasPlugin(appName, plugin){
    try{
        if(!appName || !plugin) return false ;
        if(appName === process.env.DB_NAME) return false ; 
        return (await runQuery({database: appName}, "SELECT plugin_id FROM openbamz.plugins WHERE plugin_id=$1", [plugin])).rows.length>0;
    }catch(err){
        logger.info("Error while check if has plugin %o in app %o", err, appName) ;
        return false;
    }
}

module.exports.MAIN_DB_OPTIONS = MAIN_DB_OPTIONS;
module.exports.getConnectionInfo = getConnectionInfo;
module.exports.runQueryMain = runQueryMain;
module.exports.runQuery = runQuery;
module.exports.getMainDbClient = getMainDbClient;
module.exports.getDbClient = getDbClient;
module.exports.hasPlugin = hasPlugin;

