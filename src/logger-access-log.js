// access log logger — created only when ACCESS_LOG_PATH is defined

const winston = require('winston');
const fs = require('fs');
const path = require('path');
const DailyRotateFile = require('winston-daily-rotate-file');

let accessLogger = null;
if (process.env.ACCESS_LOG_PATH) {
    const transports = [];
    // ensure target directory exists
    try {
        const dir = path.dirname(process.env.ACCESS_LOG_PATH);
        if (dir && dir !== '.') {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (err) {
        console.warn('Could not create access log directory:', err.message);
    }

    // build a rotated filename pattern
    let pattern = process.env.ACCESS_LOG_PATH;
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
        level: 'info',
    }));

    accessLogger = winston.createLogger({
        level: 'info',
        format: process.env.NODE_ENV === 'production'
            ? winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.json()
              )
            : winston.format.combine(
                  winston.format.colorize(),
                  winston.format.timestamp(),
                  winston.format.printf(
                      (info) => `[${info.timestamp}] ${info.level}: ${info.message}`
                  )
              ),
        transports,
    });
}

module.exports = accessLogger;