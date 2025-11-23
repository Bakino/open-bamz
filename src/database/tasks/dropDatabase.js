const { clearDatabase } = require("../graphql");
const { deleteAppDirectory } = require("../init");
const {appCache, hostnameCache} = require("../../appCache");


module.exports = async (payload, {logger, query}) => {
    // This task is called when an application is deleted (in app table)

    logger.info(`Removing application ${payload.database}`);
    
    // remove from caches
    delete appCache[payload.database] ;

    for(let [host, dbName] of Object.entries(hostnameCache)){
        if(dbName===payload.database){
            delete hostnameCache[host] ;
        }
    }

    await query(`DROP DATABASE IF EXISTS ${payload.database} WITH (FORCE)`);
    await query(`DROP OWNED BY ${payload.database}_admin CASCADE`);
    await query(`DROP ROLE IF EXISTS ${payload.database}_readonly`);
    await query(`DROP ROLE IF EXISTS ${payload.database}_user`);
    await query(`DROP ROLE IF EXISTS ${payload.database}_admin`);

    await deleteAppDirectory(payload);

    await clearDatabase(payload.database);
};