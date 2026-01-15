const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const https = require('https');
const GClockBot = require('./bot.js');

const app = express();
const PORT = process.env.PORT || 5000;

const botInstances = new Map();
const panelSessions = new Map();

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_TIMEOUT = 15 * 60 * 1000;

const PANEL_USERNAME = 'ANURAGXAROHI';
const PANEL_PASSWORD = 'HATERKEPAPAJI';

function cleanupLoginAttempts() {
    const now = Date.now();
    for (let [ip, data] of loginAttempts.entries()) {
        if (now - data.firstAttempt > LOGIN_TIMEOUT) {
            loginAttempts.delete(ip);
        }
    }
}

setInterval(cleanupLoginAttempts, 60000);

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use(express.static(__dirname, {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/panelLogin', (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (username === PANEL_USERNAME && password === PANEL_PASSWORD) {
            const sessionToken = require('crypto').randomBytes(32).toString('hex');
            panelSessions.set(sessionToken, { 
                username, 
                loginTime: Date.now() 
            });
            
            res.json({
                success: true,
                message: 'Panel login successful!',
                sessionToken
            });
        } else {
            res.json({
                success: false,
                message: 'Invalid username or password!'
            });
        }
    } catch (error) {
        res.json({
            success: false,
            message: 'Login failed: ' + error.message
        });
    }
});

app.post('/api/verifySession', (req, res) => {
    try {
        const { sessionToken } = req.body;
        
        if (panelSessions.has(sessionToken)) {
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        res.json({ success: false });
    }
});

function requirePanelSession(req, res, next) {
    const sessionToken = req.body.sessionToken || req.headers['x-session-token'];
    
    if (!sessionToken || !panelSessions.has(sessionToken)) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Valid panel session required!'
        });
    }
    
    next();
}

app.post('/api/login', requirePanelSession, async (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        if (!loginAttempts.has(clientIP)) {
            loginAttempts.set(clientIP, { count: 0, firstAttempt: now });
        }

        const attemptData = loginAttempts.get(clientIP);

        if (attemptData.count >= MAX_LOGIN_ATTEMPTS) {
            const timeRemaining = Math.ceil((LOGIN_TIMEOUT - (now - attemptData.firstAttempt)) / 1000 / 60);
            return res.json({
                success: false,
                message: `Too many login attempts. Please try again in ${timeRemaining} minutes.`
            });
        }

        const { appstate, adminUID } = req.body;

        if (!appstate || !adminUID) {
            attemptData.count++;
            return res.json({
                success: false,
                message: 'AppState and Admin UID are required!'
            });
        }

        if (typeof adminUID !== 'string' || adminUID.trim().length === 0) {
            attemptData.count++;
            return res.json({
                success: false,
                message: 'Invalid Admin UID format!'
            });
        }

        let parsedAppState;
        try {
            parsedAppState = typeof appstate === 'string' ? JSON.parse(appstate) : appstate;
            
            if (!Array.isArray(parsedAppState) || parsedAppState.length === 0) {
                attemptData.count++;
                return res.json({
                    success: false,
                    message: 'Invalid AppState format! Must be a non-empty JSON array.'
                });
            }
        } catch (parseError) {
            attemptData.count++;
            return res.json({
                success: false,
                message: 'Invalid AppState JSON format!'
            });
        }

        if (botInstances.has(adminUID)) {
            const existingBot = botInstances.get(adminUID);
            existingBot.shutdown();
            await new Promise(resolve => setTimeout(resolve, 1000));
            botInstances.delete(adminUID);
        }

        const botInstance = new GClockBot();
        const result = await botInstance.initialize(appstate, adminUID);
        
        botInstances.set(adminUID, botInstance);

        loginAttempts.delete(clientIP);
        
        await botInstance.notifyOwnerAboutLogin(adminUID);

        res.json({
            success: true,
            message: `Bot activated successfully! Ultra-strong protection is now active.\n\nActive users: ${botInstances.size}`
        });

    } catch (error) {
        console.error('Login Error:', error);
        
        const clientIP = req.ip || req.connection.remoteAddress;
        if (loginAttempts.has(clientIP)) {
            loginAttempts.get(clientIP).count++;
        }
        
        let errorMessage = 'Login failed: ';
        
        if (error.message && error.message.includes('ctx')) {
            errorMessage = '❌ Invalid AppState! Your Facebook cookies have expired or are incorrect.\n\n' +
                          '📝 To fix this:\n' +
                          '1. Open Facebook in Incognito/Private browser\n' +
                          '2. Login to your Facebook account\n' +
                          '3. Get fresh AppState cookies\n' +
                          '4. Try again with the new AppState';
        } else if (error.message && error.message.includes('cookie')) {
            errorMessage = '❌ Invalid AppState! Please get fresh Facebook cookies and try again.';
        } else {
            errorMessage += error.message || 'Unknown error occurred. Please check your AppState format.';
        }
        
        res.json({
            success: false,
            message: errorMessage
        });
    }
});

app.get('/api/status', (req, res) => {
    const activeUsers = botInstances.size;
    let totalLockedGroups = 0;
    let totalLockedNicknames = 0;
    let totalAntiOut = 0;
    let totalAntiDelete = 0;
    
    for (let bot of botInstances.values()) {
        if (bot.isActive) {
            totalLockedGroups += bot.lockedGroups.size;
            totalLockedNicknames += bot.lockedNicknames.size;
            totalAntiOut += bot.antiOutGroups.size;
            totalAntiDelete += bot.antiDeleteGroups.size;
        }
    }
    
    res.json({
        activeUsers: activeUsers,
        totalLockedGroups: totalLockedGroups,
        totalLockedNicknames: totalLockedNicknames,
        totalAntiOut: totalAntiOut,
        totalAntiDelete: totalAntiDelete
    });
});

app.post('/api/stopbot', requirePanelSession, async (req, res) => {
    try {
        const { adminUID } = req.body;

        if (!adminUID) {
            return res.json({
                success: false,
                message: 'Admin UID is required!'
            });
        }

        if (!botInstances.has(adminUID)) {
            return res.json({
                success: false,
                message: 'No active bot found for this UID!'
            });
        }

        const botInstance = botInstances.get(adminUID);
        botInstance.shutdown();
        botInstances.delete(adminUID);

        console.log(`🛑 Bot stopped for UID: ${adminUID}`);
        
        res.json({
            success: true,
            message: 'Bot stopped successfully!'
        });

    } catch (error) {
        console.error('Stop Bot Error:', error);
        res.json({
            success: false,
            message: 'Failed to stop bot: ' + error.message
        });
    }
});

app.post('/api/command', requirePanelSession, async (req, res) => {
    try {
        const { adminUID, command, threadID, customValue } = req.body;

        if (!adminUID || !command) {
            return res.json({
                success: false,
                message: 'Admin UID and command are required!'
            });
        }

        if (!botInstances.has(adminUID)) {
            return res.json({
                success: false,
                message: 'Bot not active! Please login first.'
            });
        }

        const botInstance = botInstances.get(adminUID);

        if (!botInstance.isActive || !botInstance.api) {
            return res.json({
                success: false,
                message: 'Bot is not connected! Please try logging in again.'
            });
        }

        let result;

        switch(command) {
            case 'lockgroup':
                if (!threadID) {
                    return res.json({ success: false, message: 'Thread ID required!' });
                }
                await botInstance.lockGroupName(threadID, customValue);
                result = { success: true, message: `Group locked successfully! ${customValue ? `Name set to: ${customValue}` : ''}` };
                break;

            case 'unlockgroup':
                if (!threadID) {
                    return res.json({ success: false, message: 'Thread ID required!' });
                }
                await botInstance.unlockGroupName(threadID);
                result = { success: true, message: 'Group unlocked successfully!' };
                break;

            case 'locknick':
                if (!threadID) {
                    return res.json({ success: false, message: 'Thread ID required!' });
                }
                await botInstance.lockAllNicknames(threadID);
                result = { success: true, message: 'All nicknames locked successfully!' };
                break;

            case 'unlocknick':
                if (!threadID) {
                    return res.json({ success: false, message: 'Thread ID required!' });
                }
                await botInstance.unlockAllNicknames(threadID);
                result = { success: true, message: 'All nicknames unlocked!' };
                break;

            case 'nicklock':
                if (!threadID || !customValue) {
                    return res.json({ success: false, message: 'Thread ID and nickname required!' });
                }
                await botInstance.lockSpecificNickname(threadID, customValue);
                result = { success: true, message: `Ultra-strong nicklock activated! Everyone locked to: ${customValue}` };
                break;

            default:
                result = { success: false, message: 'Unknown command!' };
        }

        res.json(result);

    } catch (error) {
        console.error('Command Error:', error);
        res.json({
            success: false,
            message: 'Command execution failed: ' + error.message
        });
    }
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    for (let bot of botInstances.values()) {
        bot.shutdown();
    }
    botInstances.clear();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

function startAntiSleepServer() {
    const serverUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : `http://localhost:${PORT}`;
    
    setInterval(() => {
        const url = new URL(serverUrl);
        const client = url.protocol === 'https:' ? https : http;
        
        client.get(serverUrl, (res) => {
            if (res.statusCode === 200) {
                console.log(`💚 Anti-Sleep Ping: Server is alive at ${new Date().toLocaleTimeString()}`);
            }
        }).on('error', (err) => {
            console.error('⚠️ Anti-Sleep Ping failed:', err.message);
        });
    }, 5 * 60 * 1000);
    
    console.log('💚 Anti-Sleep Server: ACTIVE (pinging every 5 minutes)');
    console.log(`📡 Ping URL: ${serverUrl}`);
}

app.listen(PORT, '0.0.0.0', () => {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║                                               ║');
    console.log('║          ⚡ GCLOCK BOT CONTROL PANEL ⚡        ║');
    console.log('║                                               ║');
    console.log('║  🔒 Ultra-Strong Group & Nickname Protection  ║');
    console.log('║                                               ║');
    console.log('║  👑 Owner: ANURAG MISHRA                      ║');
    console.log('║                                               ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Server running on: http://0.0.0.0:${PORT}`);
    console.log('🚀 Ready to accept MULTI-USER connections!');
    console.log('💚 24/7 Keep-Alive: ENABLED');
    console.log('🔄 Auto-Reconnect: UNLIMITED ATTEMPTS');
    console.log('🛡️ Location Block Protection: ACTIVE');
    console.log('');
    console.log('📝 To activate bot:');
    console.log('   1. Open the web panel');
    console.log('   2. Enter your Facebook AppState');
    console.log('   3. Enter your Admin UID');
    console.log('   4. Click ACTIVATE BOT');
    console.log('');
    console.log('✨ ENHANCED FEATURES:');
    console.log('   💚 Anti-Sleep Server (prevents bot shutdown)');
    console.log('   🔄 Unlimited reconnection attempts');
    console.log('   🛡️ Location block prevention');
    console.log('   📝 Anti-message-delete protection');
    console.log('   🔒 Ultra-strong nickname locking');
    console.log('   🛡️ Enhanced antiout with retry logic');
    console.log('');
    console.log('🔐 Bot Commands (in Facebook):');
    console.log('   .lockgroup / .unlockgroup');
    console.log('   .locknick / .unlocknick');
    console.log('   .nicklock [user] / .nolock [name]');
    console.log('   .antiout / .unantiout');
    console.log('   .antidelete / .unantidelete');
    console.log('   .status / .help');
    console.log('');
    
    startAntiSleepServer();
});
