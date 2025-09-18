const { clearDatabase } = require("../graphql");
const { deleteAppDirectory } = require("../init");

module.exports = async (payload, {logger, query}) => {
    // This task is called when an application is deleted (in app table)
    
    logger.info(`Received ${JSON.stringify(payload)}`);
    await query(`DROP DATABASE IF EXISTS ${payload.database} WITH (FORCE)`);
    await query(`DROP OWNED BY ${payload.database}_admin CASCADE`);
    await query(`DROP ROLE IF EXISTS ${payload.database}_readonly`);
    await query(`DROP ROLE IF EXISTS ${payload.database}_user`);
    await query(`DROP ROLE IF EXISTS ${payload.database}_admin`);

    await deleteAppDirectory(payload);

    await clearDatabase(payload.database);
};