const { clearDatabase } = require("../graphql");
const { removePlugin } = require("../init");

module.exports = async (payload, {logger, query}) => {
    // This task is called when a plugin is removed from the application (in plugins table)
    
    let result = await query(`SELECT current_database() as dbname`);
    let dbName = result.rows[0].dbname ;
    logger.info(`Remove plugin ${payload.plugin} for ${dbName}`);

    const connectionOptions = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: dbName,
    };

    await removePlugin(connectionOptions, payload.plugin);
    await clearDatabase(dbName);

};