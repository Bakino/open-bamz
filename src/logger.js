const winston = require('winston');


const fs = require('fs');
const path = require('path');
// rotating file transport (assumed installed)
const DailyRotateFile = require('winston-daily-rotate-file');

// determine transports based on LOG_PATH environment variable
const transports = [];
if (process.env.LOG_PATH) {
    // ensure the directory exists
    try {
        const dir = path.dirname(process.env.LOG_PATH);
        if (dir && dir !== '.') {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (err) {
        // if directory creation fails, fallback to console and emit a warning
        console.warn('Could not create log directory:', err.message);
    }

    // use rotating transport with retention
    {
        // build a filename pattern that includes %DATE%
        let pattern = process.env.LOG_PATH;
        if (!pattern.includes('%DATE%')) {
            const dir = path.dirname(pattern);
            const base = path.basename(pattern, path.extname(pattern));
            const ext = path.extname(pattern);
            pattern = path.join(dir, `${base}-%DATE%${ext}`);
        }
        transports.push(new DailyRotateFile({
            filename: pattern,
            datePattern: 'YYYY-MM-DD',
            maxFiles: '90d',
        }));
    }
} else {
    // default to console output
    transports.push(new winston.transports.Console());
}

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
    transports,
});

module.exports = logger;