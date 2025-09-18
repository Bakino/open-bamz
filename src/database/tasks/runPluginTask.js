const { getPluginTaskRunner } = require("../../pluginManager");
const { io } = require("../../websocket");

module.exports = async (payload, {logger, query}) => {
    // This job can be called from plugins to run specific tasks of the plugin
    // for example : 
    //     SELECT graphile_worker.add_job('runPluginTask', $1)
    //     with $1 = {plugin: 'backup', task : 'tasks/backup.mjs', params: {backupId: NEW._id}}
    //  will call the task tasks/backup.mjs in the backup plugin with params {backupId: NEW._id}
    //  the plugin task also receive {logger, query, appName, io} as context 

    if(!payload.plugin){ 
        return logger.error("Missing plugin in %o", payload);
    }
    if(!payload.task){ 
        return logger.error("Missing task in %o", payload);
    }
    if(!payload.params){ 
        return logger.error("Missing params in %o", payload);
    }

    let runner;
    try{
        runner = await getPluginTaskRunner({plugin: payload.plugin, runnerPath: payload.task}) ;
    }catch(err){
        return logger.error("Can't get runner for %o ", {payload, err});
    }

    try{
        let result = await query(`SELECT current_database() as dbname`);
        let appName = result.rows[0].dbname ;
        await runner(payload.params, {logger, query, appName, io}) ;
    }catch(err){
        return logger.error("Error while running plugin task %o : %o", payload, err);
    }
};