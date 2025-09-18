const { prepareSchema, createIfNotExist, prepareRole, prepareAppDirectory, startWorkers, preparePrivileges } = require("../init");

module.exports = async (payload, {logger, query}) => {
    // The is called when a new application is created (in app table)
    // We create the database for it
    
    logger.info(`Create database ${payload.database}`);

    let result = await query(`SELECT acc.* FROM app a 
            JOIN private.account acc ON a.owner = acc._id
            WHERE a.code =  $1`, [payload.database]);
    let appAccount = result.rows[0] ;

    if(!appAccount){
        logger.warn(`App ${payload.database} not found, ignore database creation`)
    }

    const connectionOptions = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: payload.database,
    };

    await createIfNotExist(connectionOptions);
    logger.info("Start init database")
    await prepareSchema(connectionOptions, "init_base") ;
    logger.info("Start prepare role")
    await prepareRole(connectionOptions, appAccount) ;
    await preparePrivileges(connectionOptions) ;
    logger.info("Start prepare directory")
    await prepareAppDirectory(connectionOptions) ;
    logger.info("End prepare directory")

    await startWorkers(connectionOptions).catch((err) => {
        logger.warn(err);
        process.exit(1);
    });
    logger.info("End start worker")
};