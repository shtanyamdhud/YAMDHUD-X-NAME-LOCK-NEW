const login = require('@dongdev/fca-unofficial');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const request = require('request');

class GClockBot {
    constructor() {
        this.api = null;
        this.adminUID = null;
        this.lockedGroups = new Map();
        this.lockedNicknames = new Map();
        this.antiOutGroups = new Map();
        this.antiDeleteGroups = new Map();
        this.deletedMessages = new Map();
        this.monitoringInterval = null;
        this.verificationInterval = null;
        this.keepAliveInterval = null;
        this.isActive = false;
        this.appStateData = null;
        this.listenerActive = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = Infinity;
        this.isReconnecting = false;
        this.lastActivity = Date.now();
        this.OWNER_UID = process.env.OWNER_UID || '100001749311229';
        this.pendingAntiOut = false;
        this.pendingAntiDelete = false;
    }

    async initialize(appStateData, adminUID) {
        return new Promise((resolve, reject) => {
            this.adminUID = adminUID;
            
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
                this.monitoringInterval = null;
            }
            if (this.verificationInterval) {
                clearInterval(this.verificationInterval);
                this.verificationInterval = null;
            }
            
            const appState = typeof appStateData === 'string' 
                ? JSON.parse(appStateData) 
                : appStateData;

            this.appStateData = appState;

            const credentials = { appState };

            login(credentials, {
                listenEvents: true,
                selfListen: false,
                updatePresence: false,
                forceLogin: true,
                autoMarkDelivery: false,
                autoMarkRead: false,
                online: false,
                listenTyping: false,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }, (err, api) => {
                if (err) {
                    console.error('Login Error:', err);
                    return reject(err);
                }

                this.api = api;
                this.isActive = true;
                this.reconnectAttempts = 0;
                this.lastActivity = Date.now();
                
                api.setOptions({
                    selfListen: false,
                    listenEvents: true,
                    updatePresence: false,
                    autoMarkDelivery: false,
                    autoMarkRead: false,
                    online: false
                });
                
                console.log('✅ Bot logged in successfully!');
                console.log('👤 Admin UID:', this.adminUID);
                console.log('🛡️ Session Protection: ACTIVE');
                console.log('🔄 Auto-Reconnect: UNLIMITED');
                
                this.setupListeners();
                this.startMonitoring();
                this.startPeriodicVerification();
                this.startKeepAlive();
                
                resolve({
                    success: true,
                    message: 'Bot activated successfully!'
                });
            });
        });
    }

    setupListeners() {
        if (this.listenerActive) {
            console.log('⚠️ Listener already active, skipping duplicate setup');
            return;
        }

        this.listenerActive = true;
        
        this.api.listenMqtt((err, event) => {
            if (err) {
                console.error('Listen Error:', err);
                this.listenerActive = false;
                this.handleReconnection();
                return;
            }

            try {
                if (event.type === 'message') {
                    this.storeMessage(event);
                    this.handleMessage(event);
                } else if (event.type === 'event') {
                    this.handleGroupEvent(event);
                } else if (event.type === 'message_unsend') {
                    this.handleMessageUnsend(event);
                }
            } catch (error) {
                console.error('Event handling error:', error);
            }
        });
    }

    handleMessage(event) {
        try {
            if (!event.body || typeof event.body !== 'string') {
                return;
            }

            const message = event.body;
            const messageLower = message.toLowerCase();
            const senderID = event.senderID;
            const threadID = event.threadID;

            this.checkForNameAbuse(message, senderID, threadID);

            if (senderID === this.adminUID) {
                if (this.pendingAntiOut && event.isGroup) {
                    this.enableAntiOut(threadID);
                    this.pendingAntiOut = false;
                    this.api.sendMessage('✅ Anti-Out protection enabled for this group!', threadID);
                }
                
                if (this.pendingAntiDelete && event.isGroup) {
                    this.enableAntiDelete(threadID);
                    this.pendingAntiDelete = false;
                    this.api.sendMessage('✅ Anti-Delete protection enabled for this group!', threadID);
                }
            }

            if (senderID !== this.adminUID) return;

            if (messageLower.startsWith('.lockgroup')) {
                const parts = message.split(' ');
                const customName = parts.slice(1).join(' ').trim();
                this.lockGroupName(threadID, customName);
            } else if (messageLower.startsWith('.unlockgroup')) {
                this.unlockGroupName(threadID);
            } else if (messageLower.startsWith('.nicklock')) {
                const parts = message.split(' ');
                const userName = parts.slice(1).join(' ').trim();
                this.lockSpecificNickname(threadID, userName);
            } else if (messageLower.startsWith('.nolock')) {
                const parts = message.split(' ');
                const nickName = parts.slice(1).join(' ').trim();
                this.lockAllToSameName(threadID, nickName);
            } else if (messageLower.startsWith('.locknick')) {
                this.lockAllNicknames(threadID);
            } else if (messageLower.startsWith('.unlocknick')) {
                this.unlockAllNicknames(threadID);
            } else if (messageLower === '.antiout') {
                this.enableAntiOut(threadID);
            } else if (messageLower === '.unantiout') {
                this.disableAntiOut(threadID);
            } else if (messageLower === '.antidelete') {
                this.enableAntiDelete(threadID);
            } else if (messageLower === '.unantidelete') {
                this.disableAntiDelete(threadID);
            } else if (messageLower === '.status') {
                this.sendStatus(threadID);
            } else if (messageLower === '.help') {
                this.sendHelp(threadID);
            }
        } catch (error) {
            console.error('Error in handleMessage:', error);
        }
    }

    storeMessage(event) {
        if (!event.messageID) return;
        
        if (!event.body && (!event.attachments || event.attachments.length === 0)) return;
        
        const threadID = event.threadID;
        if (!this.deletedMessages.has(threadID)) {
            this.deletedMessages.set(threadID, new Map());
        }
        
        const threadMessages = this.deletedMessages.get(threadID);
        threadMessages.set(event.messageID, {
            body: event.body || '',
            senderID: event.senderID,
            timestamp: Date.now(),
            attachments: event.attachments || []
        });
        
        if (threadMessages.size > 100) {
            const firstKey = threadMessages.keys().next().value;
            threadMessages.delete(firstKey);
        }
    }

    async handleMessageUnsend(event) {
        const threadID = event.threadID;
        const messageID = event.messageID;
        
        if (!this.antiDeleteGroups.has(threadID)) return;
        
        if (this.deletedMessages.has(threadID)) {
            const threadMessages = this.deletedMessages.get(threadID);
            const deletedMsg = threadMessages.get(messageID);
            
            if (deletedMsg) {
                try {
                    const userInfo = await this.getUserInfo(deletedMsg.senderID);
                    const userName = userInfo && userInfo.name ? userInfo.name : 'Unknown User';
                    
                    let restoreMessage = `🚨 ANTI-DELETE ALERT! 🚨\n\n` +
                        `⚠️ Someone tried to delete a message!\n` +
                        `👤 Deleted by: ${userName}\n`;
                    
                    if (deletedMsg.body && deletedMsg.body.length > 0) {
                        restoreMessage += `📝 Original Message:\n"${deletedMsg.body}"\n`;
                    }
                    
                    if (deletedMsg.attachments && deletedMsg.attachments.length > 0) {
                        restoreMessage += `📎 Attachments: ${deletedMsg.attachments.length} item(s)\n`;
                        const attachmentTypes = deletedMsg.attachments.map(a => a.type || 'unknown').join(', ');
                        restoreMessage += `📌 Types: ${attachmentTypes}\n`;
                    }
                    
                    restoreMessage += `\n🛡️ Protection: ACTIVE\n` +
                        `No message can be hidden! 😈`;
                    
                    this.api.sendMessage(restoreMessage, threadID);
                    
                    console.log(`🚨 Message deletion detected and reported in ${threadID}`);
                } catch (error) {
                    console.error('Error handling message unsend:', error);
                }
            }
        }
    }

    async handleGroupEvent(event) {
        const threadID = event.threadID;

        if (event.logMessageType === 'log:thread-name') {
            if (this.lockedGroups.has(threadID)) {
                await this.restoreGroupName(threadID, event);
            }
        } else if (event.logMessageType === 'log:user-nickname') {
            if (this.lockedNicknames.has(threadID)) {
                await this.restoreNickname(threadID, event);
            }
        } else if (event.logMessageType === 'log:unsubscribe') {
            if (this.antiOutGroups.has(threadID)) {
                await this.handleAntiOut(threadID, event);
            }
        }
    }


    async lockGroupName(threadID, customName = null) {
        try {
            let nameToLock;
            
            if (customName && customName.length > 0) {
                nameToLock = customName;
                
                this.lockedGroups.set(threadID, {
                    name: nameToLock,
                    timestamp: Date.now(),
                    lastUpdate: Date.now()
                });
                
                try {
                    await this.setThreadName(threadID, customName);
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.error('Error setting custom name:', error);
                }
            } else {
                const threadInfo = await this.getThreadInfo(threadID);
                nameToLock = threadInfo.threadName;
                
                this.lockedGroups.set(threadID, {
                    name: nameToLock,
                    timestamp: Date.now(),
                    lastUpdate: Date.now()
                });
            }

            this.api.sendMessage(
                `🔒 GROUP NAME LOCKED!\n\n` +
                `📌 Locked Name: ${nameToLock}\n` +
                `⚡ Protection: ULTRA-STRONG\n` +
                `🛡️ Status: ACTIVE\n\n` +
                `Any changes will be instantly reverted!`,
                threadID
            );
            
            console.log(`🔒 Locked group name: "${nameToLock}" for threadID: ${threadID}`);
        } catch (error) {
            console.error('Error locking group:', error);
            this.api.sendMessage('❌ Failed to lock group name!', threadID);
        }
    }

    async unlockGroupName(threadID) {
        if (this.lockedGroups.has(threadID)) {
            this.lockedGroups.delete(threadID);
            this.api.sendMessage('🔓 Group name unlocked!', threadID);
            console.log(`🔓 Unlocked group name for: ${threadID}`);
        } else {
            this.api.sendMessage('⚠️ Group name is not locked!', threadID);
        }
    }

    async lockAllNicknames(threadID) {
        try {
            const threadInfo = await this.getThreadInfo(threadID);
            const nicknames = {};
            
            for (let participantID in threadInfo.nicknames) {
                nicknames[participantID] = threadInfo.nicknames[participantID];
            }

            this.lockedNicknames.set(threadID, {
                nicknames: nicknames,
                timestamp: Date.now()
            });

            this.api.sendMessage(
                `🔒 ALL NICKNAMES LOCKED!\n\n` +
                `👥 Protected Users: ${Object.keys(nicknames).length}\n` +
                `⚡ Protection: UNBREAKABLE\n` +
                `🛡️ Status: ACTIVE\n\n` +
                `Any nickname changes will be instantly reverted!`,
                threadID
            );
            
            console.log(`🔒 Locked nicknames for: ${threadID}`);
        } catch (error) {
            console.error('Error locking nicknames:', error);
            this.api.sendMessage('❌ Failed to lock nicknames!', threadID);
        }
    }

    async unlockAllNicknames(threadID) {
        if (this.lockedNicknames.has(threadID)) {
            this.lockedNicknames.delete(threadID);
            this.api.sendMessage('🔓 All nicknames unlocked!', threadID);
            console.log(`🔓 Unlocked nicknames for: ${threadID}`);
        } else {
            this.api.sendMessage('⚠️ Nicknames are not locked!', threadID);
        }
    }

    async lockSpecificNickname(threadID, nickName) {
        try {
            if (!nickName || nickName.length === 0) {
                this.api.sendMessage('❌ Please provide a nickname!\nUsage: .nicklock [nickname]', threadID);
                return;
            }

            const threadInfo = await this.getThreadInfo(threadID);
            const nicknames = {};
            let count = 0;
            
            for (let participantID of threadInfo.participantIDs) {
                try {
                    await this.changeNickname(nickName, threadID, participantID);
                    nicknames[participantID] = nickName;
                    count++;
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (err) {
                    console.error(`Error setting nickname for ${participantID}:`, err);
                }
            }

            this.lockedNicknames.set(threadID, {
                nicknames: nicknames,
                timestamp: Date.now()
            });

            this.api.sendMessage(
                `⚡ ULTRA-STRONG NICKLOCK ACTIVATED! ⚡\n\n` +
                `📛 Locked Name: "${nickName}"\n` +
                `👥 Protected Users: ${count}\n` +
                `🔥 Protection Level: MAXIMUM\n` +
                `🛡️ Status: UNBREAKABLE\n\n` +
                `Everyone's nickname is now "${nickName}"!\n` +
                `⚡ INSTANT RESTORATION - किसी का bot नहीं टिकेगा! 😈`,
                threadID
            );
            
            console.log(`⚡ ULTRA-STRONG: Locked all nicknames to "${nickName}" for: ${threadID}`);
        } catch (error) {
            console.error('Error locking nicknames:', error);
            this.api.sendMessage('❌ Failed to lock nicknames!', threadID);
        }
    }

    async lockAllToSameName(threadID, nickName) {
        try {
            if (!nickName || nickName.length === 0) {
                this.api.sendMessage('❌ Please provide a nickname!\nUsage: .nolock [nickname]', threadID);
                return;
            }

            const threadInfo = await this.getThreadInfo(threadID);
            const nicknames = {};
            let count = 0;
            
            for (let participantID of threadInfo.participantIDs) {
                try {
                    await this.changeNickname(nickName, threadID, participantID);
                    nicknames[participantID] = nickName;
                    count++;
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (err) {
                    console.error(`Error setting nickname for ${participantID}:`, err);
                }
            }

            this.lockedNicknames.set(threadID, {
                nicknames: nicknames,
                timestamp: Date.now()
            });

            this.api.sendMessage(
                `🔒 ALL NICKNAMES LOCKED TO SAME NAME!\n\n` +
                `📛 Locked Name: "${nickName}"\n` +
                `👥 Protected Users: ${count}\n` +
                `⚡ Protection: UNBREAKABLE\n` +
                `🛡️ Status: ACTIVE\n\n` +
                `Everyone's nickname is now "${nickName}"!\nAny changes will be instantly reverted! 😈`,
                threadID
            );
            
            console.log(`🔒 Locked all nicknames to "${nickName}" for: ${threadID}`);
        } catch (error) {
            console.error('Error locking all to same name:', error);
            this.api.sendMessage('❌ Failed to lock nicknames!', threadID);
        }
    }


    async restoreGroupName(threadID, event) {
        const lockedData = this.lockedGroups.get(threadID);
        if (!lockedData) return;
        
        const originalName = lockedData.name;
        const newName = event.logMessageData.name;
        
        const timeSinceLastUpdate = Date.now() - (lockedData.lastUpdate || 0);
        if (timeSinceLastUpdate < 800) {
            console.log(`⏭️ Skipping restoration - recent bot update (${timeSinceLastUpdate}ms ago)`);
            return;
        }

        if (newName !== originalName) {
            console.log(`⚠️ Unauthorized group name change detected!`);
            console.log(`🔄 Restoring: "${originalName}" (changed to: "${newName}")`);
            
            try {
                lockedData.lastUpdate = Date.now();
                await this.setThreadName(threadID, originalName);
                
                this.api.sendMessage(
                    `🚨 SECURITY ALERT!\n\n` +
                    `⚠️ Unauthorized name change detected!\n` +
                    `🔄 Original name restored immediately\n` +
                    `🔒 Protection: ACTIVE\n\n` +
                    `Changed by: ${event.author}\n` +
                    `Attempted name: ${newName}\n` +
                    `Restored to: ${originalName}`,
                    threadID
                );
                
                console.log(`✅ Successfully restored group name to: "${originalName}"`);
            } catch (error) {
                console.error('Error restoring group name:', error);
                setTimeout(() => this.restoreGroupName(threadID, event), 1000);
            }
        }
    }

    async restoreNickname(threadID, event) {
        const lockedData = this.lockedNicknames.get(threadID);
        const participantID = event.logMessageData.participant_id;
        
        if (!lockedData.nicknames.hasOwnProperty(participantID)) {
            return;
        }
        
        const originalNickname = lockedData.nicknames[participantID];
        const newNickname = event.logMessageData.nickname;

        if (newNickname !== originalNickname) {
            console.log(`⚠️ Unauthorized nickname change detected!`);
            console.log(`🔄 Restoring nickname for: ${participantID}`);
            
            try {
                await this.changeNickname(originalNickname, threadID, participantID);
                
                this.api.sendMessage(
                    `🚨 SECURITY ALERT!\n\n` +
                    `⚠️ Unauthorized nickname change detected!\n` +
                    `🔄 Original nickname restored immediately\n` +
                    `🔒 Protection: ACTIVE\n\n` +
                    `Changed by: ${event.author}`,
                    threadID
                );
            } catch (error) {
                console.error('Error restoring nickname:', error);
                setTimeout(() => this.restoreNickname(threadID, event), 1000);
            }
        }
    }

    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            if (!this.isActive || !this.api) {
                console.log('⚠️ Connection lost. Attempting reconnection...');
                this.handleReconnection();
            } else {
                const timeSinceActivity = Date.now() - this.lastActivity;
                if (timeSinceActivity > 120000) {
                    console.log('⚠️ No activity detected. Performing health check...');
                    this.performHealthCheck();
                }
            }
        }, 30000);
        
        console.log('🔍 Monitoring system started!');
    }

    startKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        
        this.keepAliveInterval = setInterval(() => {
            if (this.isActive && this.api) {
                try {
                    this.api.getUserInfo(this.adminUID, (err, info) => {
                        if (!err) {
                            this.lastActivity = Date.now();
                            console.log('💚 Keep-Alive: Bot is alive and active');
                        } else {
                            console.log('⚠️ Keep-Alive: Failed to fetch user info, might need reconnection');
                        }
                    });
                } catch (error) {
                    console.error('Keep-Alive error:', error);
                }
            }
        }, 300000);
        
        console.log('💚 Keep-Alive system started (5 min interval)!');
    }

    performHealthCheck() {
        if (!this.api || !this.isActive) return;
        
        try {
            this.api.getUserInfo(this.adminUID, (err, info) => {
                if (err) {
                    console.log('❌ Health check failed. Initiating reconnection...');
                    this.handleReconnection();
                } else {
                    this.lastActivity = Date.now();
                    console.log('✅ Health check passed');
                }
            });
        } catch (error) {
            console.error('Health check error:', error);
            this.handleReconnection();
        }
    }

    startPeriodicVerification() {
        this.verificationInterval = setInterval(async () => {
            if (!this.isActive || !this.api) return;

            try {
                for (let [threadID, lockData] of this.lockedGroups.entries()) {
                    await this.verifyGroupLock(threadID, lockData);
                }

                for (let [threadID, lockData] of this.lockedNicknames.entries()) {
                    await this.verifyNicknameLocks(threadID, lockData);
                }
            } catch (error) {
                console.error('Verification error:', error);
            }
        }, 2000);
        
        console.log('⚡ ULTRA-FAST verification started (2s interval)!');
    }

    async verifyGroupLock(threadID, lockData) {
        try {
            const threadInfo = await this.getThreadInfo(threadID);
            const currentName = threadInfo.threadName;
            const expectedName = lockData.name;

            if (currentName !== expectedName) {
                console.log(`⚠️ Group name mismatch detected! Restoring: ${expectedName}`);
                await this.setThreadName(threadID, expectedName);
                
                this.api.sendMessage(
                    `🚨 SECURITY ALERT!\n\n` +
                    `⚠️ Lock verification detected unauthorized change!\n` +
                    `🔄 Original name restored\n` +
                    `🔒 Protection: ACTIVE`,
                    threadID
                );
            }
        } catch (error) {
            console.error('Error verifying group lock:', error);
        }
    }

    async verifyNicknameLocks(threadID, lockData) {
        try {
            const threadInfo = await this.getThreadInfo(threadID);
            const currentNicknames = threadInfo.nicknames || {};
            const expectedNicknames = lockData.nicknames;

            const restorePromises = [];
            
            for (let participantID in expectedNicknames) {
                if (!expectedNicknames.hasOwnProperty(participantID)) continue;
                
                const expectedNickname = expectedNicknames[participantID];
                const currentNickname = currentNicknames[participantID] || '';

                if (currentNickname !== expectedNickname) {
                    console.log(`⚡ INSTANT RESTORE: ${participantID} -> ${expectedNickname}`);
                    restorePromises.push(
                        this.changeNickname(expectedNickname, threadID, participantID)
                            .catch(err => console.error(`Error restoring ${participantID}:`, err))
                    );
                }
            }
            
            if (restorePromises.length > 0) {
                await Promise.all(restorePromises);
                console.log(`⚡ ULTRA-FAST: Restored ${restorePromises.length} nicknames instantly!`);
            }
        } catch (error) {
            console.error('Error verifying nickname locks:', error);
        }
    }


    async handleReconnection() {
        if (this.isReconnecting) {
            console.log('⚠️ Reconnection already in progress, skipping duplicate attempt');
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}...`);
        console.log('📡 Bot will keep trying until appstate expires or ID is blocked');
        
        this.listenerActive = false;
        
        if (this.api) {
            try {
                this.api.logout();
            } catch (error) {
                console.error('Logout error during reconnection:', error);
            }
        }

        const waitTime = Math.min(5000 + (this.reconnectAttempts * 1000), 30000);
        
        setTimeout(async () => {
            try {
                console.log('🔌 Attempting to re-establish connection...');
                await this.initialize(this.appStateData, this.adminUID);
                console.log('✅ Reconnection successful!');
                console.log('🎉 Bot is back online!');
                this.isReconnecting = false;
            } catch (error) {
                console.error('❌ Reconnection failed:', error);
                
                if (error.message && (error.message.includes('appstate') || error.message.includes('expired') || error.message.includes('checkpoint'))) {
                    console.error('🚨 CRITICAL: AppState expired or account checkpoint! Please update AppState.');
                    this.isActive = false;
                    this.isReconnecting = false;
                } else {
                    console.log(`⏳ Waiting ${waitTime/1000}s before next attempt...`);
                    this.isReconnecting = false;
                    setTimeout(() => this.handleReconnection(), waitTime);
                }
            }
        }, waitTime);
    }

    async enableAntiOut(threadID) {
        try {
            const threadInfo = await this.getThreadInfo(threadID);
            const participants = threadInfo.participantIDs || [];
            
            this.antiOutGroups.set(threadID, {
                enabled: true,
                participants: participants,
                timestamp: Date.now()
            });

            this.api.sendMessage(
                `🛡️ ANTI-OUT ACTIVATED! 🛡️\n\n` +
                `🚫 No one can leave this group!\n` +
                `🔄 Auto re-add: ENABLED\n` +
                `⚡ Protection: MAXIMUM\n\n` +
                `Anyone who leaves will be automatically added back!`,
                threadID
            );
            
            console.log(`🛡️ Anti-out enabled for: ${threadID}`);
        } catch (error) {
            console.error('Error enabling anti-out:', error);
            this.api.sendMessage('❌ Failed to enable anti-out!', threadID);
        }
    }

    async disableAntiOut(threadID) {
        if (this.antiOutGroups.has(threadID)) {
            this.antiOutGroups.delete(threadID);
            this.api.sendMessage(
                `✅ ANTI-OUT DEACTIVATED!\n\n` +
                `🔓 Members can now leave freely!`,
                threadID
            );
            console.log(`✅ Anti-out disabled for: ${threadID}`);
        } else {
            this.api.sendMessage('⚠️ Anti-out is not active!', threadID);
        }
    }

    async handleAntiOut(threadID, event) {
        try {
            const leftUserID = event.logMessageData.leftParticipantFbId;
            
            if (!leftUserID || leftUserID === this.adminUID) {
                return;
            }

            console.log(`⚠️ User ${leftUserID} left the group! Re-adding...`);
            
            setTimeout(async () => {
                try {
                    await this.addUserToGroup(leftUserID, threadID);
                    
                    const userInfo = await this.getUserInfo(leftUserID);
                    const userName = userInfo && userInfo.name ? userInfo.name : 'User';
                    
                    this.api.sendMessage(
                        `━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `🚨 ANTI-OUT PROTECTION 🚨\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `⚠️ ${userName} tried to leave!\n` +
                        `🔄 Auto Re-Add: SUCCESSFUL\n` +
                        `🛡️ Protection: MAXIMUM\n` +
                        `⚡ Status: ACTIVE\n\n` +
                        `📌 Nobody can escape! 😈\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━`,
                        threadID
                    );
                    
                    console.log(`✅ User ${leftUserID} re-added successfully!`);
                } catch (error) {
                    console.error('Error re-adding user:', error);
                    
                    let retryCount = 0;
                    const maxRetries = 3;
                    const retryInterval = setInterval(async () => {
                        try {
                            await this.addUserToGroup(leftUserID, threadID);
                            console.log(`✅ User ${leftUserID} re-added on retry ${retryCount + 1}`);
                            clearInterval(retryInterval);
                        } catch (err) {
                            retryCount++;
                            if (retryCount >= maxRetries) {
                                console.error(`❌ Failed to re-add user after ${maxRetries} attempts`);
                                clearInterval(retryInterval);
                            }
                        }
                    }, 5000);
                }
            }, 2000);
        } catch (error) {
            console.error('Error handling anti-out:', error);
        }
    }

    async enableAntiDelete(threadID) {
        try {
            this.antiDeleteGroups.set(threadID, {
                enabled: true,
                timestamp: Date.now()
            });

            this.api.sendMessage(
                `🛡️ ANTI-DELETE ACTIVATED! 🛡️\n\n` +
                `🚫 No one can delete messages!\n` +
                `📝 Message restore: ENABLED\n` +
                `⚡ Protection: MAXIMUM\n\n` +
                `All deleted messages will be exposed!`,
                threadID
            );
            
            console.log(`🛡️ Anti-delete enabled for: ${threadID}`);
        } catch (error) {
            console.error('Error enabling anti-delete:', error);
            this.api.sendMessage('❌ Failed to enable anti-delete!', threadID);
        }
    }

    async disableAntiDelete(threadID) {
        if (this.antiDeleteGroups.has(threadID)) {
            this.antiDeleteGroups.delete(threadID);
            this.api.sendMessage(
                `✅ ANTI-DELETE DEACTIVATED!\n\n` +
                `🔓 Messages can now be deleted freely!`,
                threadID
            );
            console.log(`✅ Anti-delete disabled for: ${threadID}`);
        } else {
            this.api.sendMessage('⚠️ Anti-delete is not active!', threadID);
        }
    }

    checkForNameAbuse(message, senderID, threadID) {
        if (senderID === this.adminUID) return;
        
        const messageLower = message.toLowerCase();
        const abuseWords = ['mc', 'bc', 'bsdk', 'gandu', 'abe', 'madarchod', 'bhenchod', 'chutiya', 'gali'];
        
        const hasAnurag = messageLower.includes('anurag');
        const hasRishi = messageLower.includes('rishi');
        const hasAbuse = abuseWords.some(word => messageLower.includes(word));
        
        if ((hasAnurag || hasRishi) && hasAbuse) {
            const targetName = hasAnurag ? 'ANURAG' : 'RISHI';
            
            this.api.getUserInfo(senderID, (err, userInfo) => {
                let userName = 'User';
                if (!err && userInfo && userInfo[senderID]) {
                    userName = userInfo[senderID].name || 'User';
                }
                
                const responses = [
                    `Abe @${userName} MC BC BSDK! ${targetName} ko gali deta hai? Teri aukat kya hai gandu? 🤬`,
                    `@${userName} Saale MC BC! ${targetName} ka naam lekar gali de raha hai? Muh tod dunga tera BSDK! 😡`,
                    `Teri maa ki @${userName}! ${targetName} se panga? MC BC BSDK tujhe pata bhi hai tu kisse baat kar raha hai? 🔥`,
                    `@${userName} BC MC GANDU! ${targetName} ko gaali? Teri himmat kaise hui BSDK? Bhag yaha se! 😤`,
                    `Saale @${userName} MC BSDK! ${targetName} pe gali? Teri shakal dekhi hai kabhi aine me? BC GANDU! 💢`
                ];
                
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                
                this.api.sendMessage(
                    {
                        body: randomResponse,
                        mentions: [{
                            tag: `@${userName}`,
                            id: senderID
                        }]
                    },
                    threadID
                );
                
                console.log(`🚨 Name abuse detected from ${senderID}! Response sent.`);
            });
        }
    }


    async notifyOwnerAboutLogin(userUID) {
        try {
            if (userUID === this.OWNER_UID) {
                console.log('Owner logged in - no notification needed');
                return;
            }

            const userInfo = await this.getUserInfo(userUID);
            const userName = userInfo && userInfo.name ? userInfo.name : 'Unknown User';
            
            const appStateId = this.appStateData && Array.isArray(this.appStateData) && this.appStateData.length > 0 
                ? this.appStateData.find(item => item.key === 'c_user')?.value || 'Unknown' 
                : 'Unknown';
            
            const notificationMessage = `🔔 नया बॉट लॉगिन - GCLOCK BOT\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 यूजर: ${userName}\n` +
                `🆔 UID: ${userUID}\n` +
                `📱 AppState ID: ${appStateId}\n` +
                `⏰ समय: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `✅ Bot Successfully Activated!\n` +
                `🛡️ All Protection Features: ACTIVE\n` +
                `⚡ Status: ULTRA POWER MODE ON\n\n` +
                `👑 Owner: ANURAG MISHRA`;
            
            this.api.sendMessage(notificationMessage, this.OWNER_UID);
            
            const userMessage = `🎉 बधाई हो ${userName}!\n\n` +
                `✅ आपका GCLOCK BOT सफलतापूर्वक चालू हो गया!\n\n` +
                `🔰 सभी कमांड देखने के लिए .help टाइप करें\n` +
                `📊 बॉट स्टेटस देखने के लिए .status टाइप करें\n\n` +
                `🛡️ आपके ग्रुप अब पूरी तरह सुरक्षित हैं!\n` +
                `⚡ ULTRA PROTECTION MODE ACTIVE\n\n` +
                `👑 Owner: ANURAG MISHRA\n` +
                `📞 Contact: +91 6394812128`;
            
            this.api.sendMessage(userMessage, userUID);
            
            console.log(`✅ Login notification sent to owner for user: ${userName} (${userUID}) with AppState ID: ${appStateId}`);
        } catch (error) {
            console.error('Error sending login notification:', error);
        }
    }

    sendStatus(threadID) {
        const groupLocked = this.lockedGroups.has(threadID);
        const nickLocked = this.lockedNicknames.has(threadID);
        const antiOutActive = this.antiOutGroups.has(threadID);
        const antiDeleteActive = this.antiDeleteGroups.has(threadID);
        
        let status = `╔══════════════════════════╗\n`;
        status += `║   📊 GCLOCK BOT STATUS   ║\n`;
        status += `╚══════════════════════════╝\n\n`;
        
        status += `━━━━━ 🤖 BOT STATUS ━━━━━\n`;
        status += `${this.isActive ? '🟢 ONLINE & ACTIVE' : '🔴 OFFLINE'}\n`;
        status += `💚 Keep-Alive: RUNNING\n`;
        status += `🔄 Auto-Reconnect: UNLIMITED\n\n`;
        
        status += `━━━━ 🛡️ PROTECTION STATUS ━━━━\n`;
        status += `🔒 Group Lock: ${groupLocked ? '✅ ON' : '❌ OFF'}\n`;
        status += `👤 Nickname Lock: ${nickLocked ? '✅ ON' : '❌ OFF'}\n`;
        status += `🛡️ Anti-Out: ${antiOutActive ? '✅ ON' : '❌ OFF'}\n`;
        status += `📝 Anti-Delete: ${antiDeleteActive ? '✅ ON' : '❌ OFF'}\n\n`;
        
        status += `━━━━━━ ℹ️ INFO ━━━━━━━\n`;
        status += `👑 Owner: ANURAG MISHRA\n`;
        status += `📞 WhatsApp: +91 6394812128\n`;
        status += `🔗 Facebook: fb.com/61582559349340\n`;
        status += `⚡ Protection Level: MAXIMUM\n\n`;
        
        status += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        status += `💡 Type .help for commands`;
        
        this.api.sendMessage(status, threadID);
    }

    sendHelp(threadID) {
        const help = `╔═══════════════════════════╗\n` +
            `║  🔰 GCLOCK BOT COMMANDS  ║\n` +
            `╚═══════════════════════════╝\n\n` +
            
            `━━━━ 🔒 GROUP PROTECTION ━━━━\n` +
            `📌 .lockgroup\n` +
            `   └ Lock group name\n` +
            `📌 .unlockgroup\n` +
            `   └ Unlock group name\n\n` +
            
            `━━━ 👤 NICKNAME PROTECTION ━━━\n` +
            `📌 .locknick\n` +
            `   └ Lock all current nicknames\n` +
            `📌 .unlocknick\n` +
            `   └ Unlock all nicknames\n` +
            `📌 .nicklock [name]\n` +
            `   └ Lock everyone to this name\n` +
            `   └ ULTRA-STRONG mode\n` +
            `📌 .nolock [name]\n` +
            `   └ Set same name for everyone\n\n` +
            
            `━━ 🛡️ ADVANCED PROTECTION ━━\n` +
            `📌 .antiout\n` +
            `   └ Enable anti-leave protection\n` +
            `   └ Auto re-add members\n` +
            `📌 .unantiout\n` +
            `   └ Disable anti-leave\n` +
            `📌 .antidelete\n` +
            `   └ Enable anti-delete messages\n` +
            `   └ Expose deleted messages\n` +
            `📌 .unantidelete\n` +
            `   └ Disable anti-delete\n\n` +
            
            `━━━━━━ ℹ️ INFORMATION ━━━━━━\n` +
            `📌 .status - Bot & protection status\n` +
            `📌 .help - Show this help menu\n\n` +
            
            `━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👑 Owner: ANURAG MISHRA\n` +
            `📞 WhatsApp: +91 6394812128\n` +
            `🔗 Facebook: fb.com/61582559349340\n` +
            `⚡ Protection: ULTRA-STRONG\n` +
            `💚 24/7 Active with Keep-Alive\n` +
            `🔄 Unlimited Auto-Reconnect`;
        
        this.api.sendMessage(help, threadID);
    }

    getThreadInfo(threadID) {
        return new Promise((resolve, reject) => {
            this.api.getThreadInfo(threadID, (err, info) => {
                if (err) reject(err);
                else resolve(info);
            });
        });
    }

    setThreadName(threadID, name) {
        return new Promise((resolve, reject) => {
            this.api.setTitle(name, threadID, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    changeNickname(nickname, threadID, participantID) {
        return new Promise((resolve, reject) => {
            this.api.changeNickname(nickname, threadID, participantID, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    getUserInfo(userID) {
        return new Promise((resolve, reject) => {
            this.api.getUserInfo(userID, (err, info) => {
                if (err) reject(err);
                else resolve(info[userID] || null);
            });
        });
    }

    downloadImageAuthenticated(url, filepath) {
        return new Promise((resolve, reject) => {
            if (!url || url.trim() === '') {
                return reject(new Error('Invalid URL provided'));
            }

            const options = {
                url: url,
                method: 'GET',
                encoding: null,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.facebook.com/'
                },
                followRedirect: true,
                maxRedirects: 5
            };

            request(options, (error, response, body) => {
                if (error) {
                    console.error('Download error:', error);
                    return reject(error);
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                }

                if (!body || body.length < 500) {
                    return reject(new Error('Downloaded file is too small or empty'));
                }

                fs.writeFile(filepath, body, (err) => {
                    if (err) {
                        console.error('File write error:', err);
                        return reject(err);
                    }
                    
                    console.log(`✅ Image downloaded: ${filepath} (${body.length} bytes)`);
                    resolve(filepath);
                });
            });
        });
    }

    changeGroupImage(threadID, imageStream) {
        return new Promise((resolve, reject) => {
            this.api.changeGroupImage(imageStream, threadID, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    addUserToGroup(userID, threadID) {
        return new Promise((resolve, reject) => {
            this.api.addUserToGroup(userID, threadID, (err) => {
                if (err) {
                    console.error('Error adding user to group:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    shutdown() {
        this.isActive = false;
        this.listenerActive = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        if (this.verificationInterval) {
            clearInterval(this.verificationInterval);
            this.verificationInterval = null;
        }
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.api) {
            try {
                this.api.logout();
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
        console.log('🛑 Bot shutdown complete');
    }
}

module.exports = GClockBot;
