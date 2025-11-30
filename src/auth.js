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

function signAccessToken(payload) {
    return jwt.sign(payload, PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '15m',
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

router.post('/login', express.json(), async (req, res) => {
    const { email, password } = req.body;

    const user = await authenticateUser(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = signAccessToken({ role: user._id });

    // create refresh token
    const refreshToken = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600_000);
    await saveSession(user._id, refreshToken, expiresAt);

    // set cookies
    res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000
    });

    res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 3600 * 1000
    });

    res.json({ ok: true });
});

async function refreshToken(oldToken){
    const entry = await findSession(oldToken);
    if (!entry || entry.revoked || entry.expire_time < new Date()) {
        return { newToken: false, newExpires: false };
    }

    // rotate
    await revokeSession(oldToken);
    const newToken = generateToken();
    const newExpires = new Date(Date.now() + 30 * 24 * 3600_000);
    await saveSession(entry.account_id, newToken, newExpires);
    return { newToken, account_id: entry.account_id };
}

async function refreshOnCookie(oldToken, res){
    
    const { newToken, account_id } = await refreshToken(oldToken);
    if (!newToken) {
        return res.status(401).end();
    }

    const accessToken = signAccessToken({ role: account_id });

    res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000
    });

    res.cookie('refresh_token', newToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 3600 * 1000
    });
}


router.post('/refresh', async (req, res) => {
    const oldToken = req.cookies?.refresh_token;
    if (!oldToken) return res.status(401).end();

    await refreshOnCookie(oldToken, res);

    res.json({ ok: true });
});


router.post('/logout', async (req, res) => {
    const rt = req.cookies?.refresh_token;
    if (rt) await revokeSession(rt);

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ ok: true });
});

/**
 * Authentication middleware:
 * 1. Read access token from HttpOnly cookie
 * 2. Verify JWT
 * 3. Inject Authorization header for PostGraphile v5
 */
const jwtMiddleware = async (req, res, next) => {
    const token = req.cookies?.access_token;
    if (!token) return next();

    try {
        const decoded = verifyAccessToken(token);

        // Attach user data for your own routes
        req.user = decoded;

        // Inject Authorization header for PostGraphile
        req.headers.authorization = `Bearer ${token}`;
    // eslint-disable-next-line no-unused-vars
    } catch (err) {
        // invalid or expired — ignore and continue
    }

    next();
};

module.exports.authRoutes = router;
module.exports.jwtMiddleware = jwtMiddleware;