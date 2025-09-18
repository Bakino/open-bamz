const winston = require('winston');


const logger = winston.createLogger({
    level: 'info',
    format: 
        process.env.NODE_ENV === 'production'?
        winston.format.combine(
            winston.format.timestamp(),
            winston.format.splat(),
            winston.format.json()
        ):winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.align(),
            winston.format.splat(),
            winston.format.printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
        ),
    transports: [
      // log all to console
      new winston.transports.Console(),
    ],
});

module.exports = logger;