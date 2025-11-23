const {hostnameCache} = require("../../appCache");

module.exports = async (payload, {logger}) => {
    // The is called when a new application is created (in app table)
    // We create the database for it
    
    logger.info(`Update hostname of ${payload.database}`);

    if(payload.previousHosts){
        for(let host of payload.previousHosts){
            delete hostnameCache[host.hostname] ;
        }
    }

    if(payload.newHosts){
        for(let host of payload.newHosts){
            hostnameCache[host.hostname] = payload.database ;
        }
    }
};