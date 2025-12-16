// auth.js
const express = require('express');
const router = express.Router();
const { runQueryMain } = require("./database/dbAccess");
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const PRIVATE_KEY = fs.readFileSync(process.env.JWT_PRIVATE_KEY_FILE);
const PUBLIC_KEY  = fs.readFileSync(process.env.JWT_PUBLIC_KEY_FILE);

function generateToken() {
    return crypto.randomBytes(48).toString('hex');
}

function signAccessToken(payload, expire) {
    return jwt.sign(payload, PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: expire+'m',
      audience: 'bamz-api',
      issuer: 'bamz',
    });
}

function verifyAccessToken(token) {
    return jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'],
      audience: 'bamz-api',
      issuer: 'bamz',
    });
}

async function saveSession(userId, token, expiresAt) {
    await runQueryMain(`INSERT INTO private.session (account_id, token, expire_time, revoked) VALUES ($1, $2, $3, false)
         ON CONFLICT (token) DO UPDATE SET expire_time = $3, revoked = false`, [userId, token, expiresAt]);
}

async function revokeSession(token) {
    await runQueryMain(`UPDATE private.session SET revoked = true WHERE token = $1`, [token]);
}

async function findSession(token) {
    const result = await runQueryMain(`SELECT account_id, token, expire_time, revoked FROM private.session WHERE token = $1`, [token]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

async function authenticateUser(email, password) {
    let result = await runQueryMain(`SELECT public.authenticate($1, $2) as account`, [email, password]) ;
    if(result.rows.length>0){
        return result.rows[0].account ;
    }
    return null;
}

async function genSession(user, res){
    const expireAccessToken = Number(process.env.COOKIE_TTL || (3 * 60 * 60 * 1000)) ; // 3h session by default

    const accessToken = signAccessToken({ role: user._id }, Math.round(expireAccessToken/(60 * 1000)));

    // create refresh token
    const refreshToken = generateToken();
    const expiresAt = new Date(Date.now() + expireAccessToken);
    await saveSession(user._id, refreshToken, expiresAt);

    // set cookies
    res.cookie('jwt-bamz-access', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        domain: process.env.COOKIE_DOMAIN || ".test3.bakino.fr",
        maxAge: expireAccessToken
    });

    res.cookie('jwt-bamz-refresh', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        domain: process.env.COOKIE_DOMAIN || ".test3.bakino.fr",
        maxAge: Number(process.env.COOKIE_REFRESH_TTL || (3 * 24 * 60 * 60 * 1000)) // 3d renew session by default
    });
}

router.post('/login', express.json(), async (req, res) => {
    const { email, password } = req.body;

    const user = await authenticateUser(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    await genSession(user, res) ;

    res.json({ ok: true });
});


router.post('/refresh', async (req, res) => {
    const oldToken = req.cookies?.['jwt-bamz-refresh'];
    if (!oldToken) return res.status(401).end();

    const entry = await findSession(oldToken);
    if (!entry || entry.revoked || entry.expire_time < new Date()) {
        return res.status(401).end();
    }
    // rotate
    await revokeSession(oldToken);

    await genSession({_id: entry.account_id}, res) ;

    res.json({ ok: true });
});


router.post('/logout', async (req, res) => {
    const rt = req.cookies?.['jwt-bamz-refresh'];
    if (rt) await revokeSession(rt);

    res.clearCookie('jwt-bamz-access', {
        domain: process.env.COOKIE_DOMAIN || ".test3.bakino.fr"
    });
    res.clearCookie('jwt-bamz-refresh',  {
        domain: process.env.COOKIE_DOMAIN || ".test3.bakino.fr"
    });
    res.json({ ok: true });
});

/**
 * Authentication middleware:
 * 1. Read access token from HttpOnly cookie
 * 2. Verify JWT
 * 3. Inject Authorization header for PostGraphile v5
 */
const jwtMiddleware = async (req, res, next) => {
    if(req.cookies){
        for(const [name, value] of Object.entries(req.cookies)){
            // Look for cookies named like "jwt-<claim>-access"
            if(name.startsWith("jwt-") && name.endsWith("-access")){
                const token = value;
                if (!token) continue;
                try {
                    const decoded = verifyAccessToken(token);

                    //check session has been deleted on server side
                    const sessionToken = req.cookies?.[name.replace("-access", "-refresh")];
                    if (!sessionToken) continue;

                    const entry = await findSession(sessionToken);
                    if (!entry || entry.revoked || entry.expire_time < new Date()) {
                        continue;
                    }

                    // Attach user data for your own routes
                    if(!req.jwt) req.jwt = {};
                    req.jwt[name.replace("jwt-", "").replace("-access", "")] = decoded;
                // eslint-disable-next-line no-unused-vars
                } catch (err) {
                    // invalid or expired — ignore and continue
                }
            }
        }
    }
    next();
};

module.exports.authRoutes = router;
module.exports.jwtMiddleware = jwtMiddleware;