# GCLOCK Bot - Facebook Group & Nickname Protection System

## Overview
A powerful multi-user Facebook bot application with ultra-strong group name and nickname locking features. Built with fca-anurag package and features a cybersecurity-themed web interface for bot control. Supports multiple users simultaneously with independent bot instances.

## Owner
👑 **ANURAG MISHRA**
📱 WhatsApp: +91 6394812128
🔗 Facebook: https://www.facebook.com/profile.php?id=61582559349340
📱 Owner UID: 61582559349340

## Project Structure
- `server.js` - Express server hosting the web panel and API endpoints
- `bot.js` - Core bot logic with group/nickname locking functionality
- `index.html` - Cybersecurity-themed login panel interface
- `package.json` - Project dependencies

## Key Features
1. **Multi-User Support** - Multiple people can use the same deployment with their own appstate simultaneously
2. **Ultra-Strong Group Name Locking** - Automatically restores original group names when changed
3. **Unbreakable Nickname Protection** - Monitors and reverts unauthorized nickname changes with 2-second verification
4. **ULTRA-STRONG NickLock** - Lock everyone's nickname to one name with instant parallel restoration (beats all other bots)
5. **NoLock Command** - Alternative command to lock everyone's nickname to the same name
6. **Anti-Out Protection** - Automatically re-adds members who try to leave the group
7. **Anti-Delete Protection** - Exposes deleted messages and who deleted them (works for text, photos, stickers, and all attachments)
8. **Name Abuse Detection** - Auto-responds with abuse if ANURAG or RISHI names are abused
9. **Login Notifications** - Sends alerts to owner when someone logs in with their APPSTATE
10. **Auto-Reconnection System** - Maintains bot connection reliability
11. **Ultra-Fast Monitoring** - Lightning-fast 2-second verification checks with parallel restoration
12. **Ultra-Beautiful Panel** - Advanced animations, gradient effects, particles, and neon glow effects
13. **HTML Panel Login** - Login through web interface with AppState and Admin UID

## Bot Commands (in Facebook)

### Group Protection
- `.lockgroup [custom_name]` - Lock current group name (optional custom name)
- `.unlockgroup` - Unlock group name

### Nickname Protection
- `.locknick` - Lock all nicknames in current group
- `.unlocknick` - Unlock all nicknames
- `.nicklock [nickname]` - **ULTRA-STRONG** Lock everyone to this name (instant restoration, beats all bots)
- `.nolock [nickname]` - Lock everyone's nickname to the same name

### Advanced Protection
- `.antiout` - Auto re-add members who leave the group
- `.unantiout` - Disable anti-out protection
- `.antidelete` - Enable anti-delete message protection
- `.unantidelete` - Disable anti-delete protection

### Information
- `.status` - Check bot status and active locks
- `.help` - Show complete help message

**Auto-Features (Always Active):**
- Name abuse protection for ANURAG & RISHI
- Login notification to owner with message "ANURAG BOSD I'M USING YOUR BOT"

## Technology Stack
- **Backend**: Node.js, Express.js
- **Facebook API**: fca-anurag package
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Theme**: Cybersecurity/Matrix style with dark theme and neon effects

## Recent Changes
- **November 2, 2025 (Latest - CRITICAL FIXES)** - ANTI-LOGOUT & 24/7 UPTIME UPDATE:
  - **🛡️ ANTI-LOGOUT PROTECTION** - Bot will NEVER logout anymore
    - Changed login options: `updatePresence: false`, `online: false` to avoid Facebook detection
    - Removed `autoMarkDelivery` and `autoMarkRead` to reduce Facebook API calls
    - Added proper user-agent to avoid location blocks
    - Session protection enabled with optimal API settings
  - **💚 24/7 KEEP-ALIVE SYSTEM** - Bot will run non-stop
    - Added anti-sleep server that pings itself every 5 minutes
    - Internal keep-alive that checks bot health every 5 minutes
    - Health monitoring with auto-recovery
    - Bot activity tracking to detect connection issues
  - **🔄 UNLIMITED AUTO-RECONNECT** - Never gives up
    - Removed 5 attempt limit - now tries UNLIMITED times
    - Only stops if AppState expires or account gets blocked
    - Progressive backoff: waits longer between reconnection attempts (max 30 seconds)
    - Better error detection for expired appstate vs temporary network issues
    - Automatic re-initialization with full session restoration
  - **🛡️ ENHANCED ANTIOUT** - More reliable than ever
    - Added retry logic (3 attempts) if re-add fails
    - Shows user name in antiout alerts
    - Better error handling and logging
    - 5-second retry interval for failed re-adds
  - **🎨 BEAUTIFUL COMMAND REDESIGN** - Easy to read and understand
    - Complete redesign of .help command with tree structure
    - Beautiful .status command with sections and emojis
    - Better formatting with box borders and separators
    - Easy-to-scan layout for all information
    - Shows Keep-Alive and Auto-Reconnect status
  - **📊 COMPREHENSIVE MONITORING** - Full visibility
    - Health check system with periodic verification
    - Activity tracking to detect inactive connections
    - Detailed logging for all reconnection attempts
    - Clear error messages for different failure types
  - All changes tested and verified working
- **November 2, 2025 (Evening Update)** - ULTRA-BEAUTIFUL PANEL & NOTIFICATION ENHANCEMENT:
  - **🎨 COMPLETELY REDESIGNED PANEL** - Made the panel truly heart-touching with stunning visuals
    - Enhanced gradient colors with cyan, green, pink, orange, and purple combinations
    - Hindi/English mixed text throughout for better Indian user experience
    - Improved animations with better glow effects and shadows
    - More attractive badges with "अल्ट्रा पावर" and "अटूट सुरक्षा"
    - Beautiful Hindi tagline: "🔥 सबसे तगड़ा बॉट - 100% सुरक्षित 🔥"
    - All labels and buttons in Hindi for better understanding
    - Enhanced loading text in Hindi: "बॉट शुरू हो रहा है... कृपया प्रतीक्षा करें"
    - Better feature list in Hindi with improved styling
    - Responsive design optimized for mobile and desktop
  - **📲 ENHANCED LOGIN NOTIFICATIONS** - Complete AppState ID tracking
    - Owner receives detailed notification with AppState ID (c_user value from appstate)
    - Beautiful formatted message with user name, UID, AppState ID, and timestamp
    - User receives welcome message in Hindi with bot instructions
    - Fixed bug in initialize() function to properly parse and store appState array
    - All notifications now include complete user details
  - **✅ ALL COMMANDS VERIFIED** - Tested all bot commands working perfectly:
    - Group protection: .lockgroup, .unlockgroup
    - Nickname protection: .locknick, .unlocknick
    - Ultra-strong locks: .nicklock, .nolock
    - Advanced protection: .antiout, .unantiout, .antidelete, .unantidelete
    - Information: .status, .help
  - All changes architect-reviewed and approved
- **November 2, 2025 (Morning)** - ULTRA UPDATE:
  - **⚡ ULTRA-BEAUTIFUL PANEL** - Advanced animations, gradient effects, floating particles, and neon glow
    - Animated gradient backgrounds with color shifting
    - Floating particle effects
    - Advanced button animations with shine effects
    - Glassmorphism and border gradients
    - Multiple pulse and glow animations throughout
  - **🔥 ULTRA-STRONG NICKLOCK** - .nicklock command now locks EVERYONE to one name
    - Beats all other bots with instant restoration
    - 2-second ultra-fast verification (down from 10 seconds)
    - Parallel processing for simultaneous restoration of all nicknames
    - Multiple nicknames restored at once for maximum speed
    - Unbreakable protection that no other bot can override
  - **Multi-Threaded Login System** - Multiple users can now use the same deployment simultaneously with their own appstate
  - **Anti-Delete Protection** (.antidelete) - Exposes deleted messages and identifies who deleted them
  - **NoLock Command** (.nolock) - Lock everyone's nickname to the same name
  - **Enhanced Login Notifications** - Owner receives "ANURAG BOSD I'M USING YOUR BOT" message when someone logs in
  - **Beautiful UI Update** - Added profile picture background and contact information to panel
  - **Anti-Out Protection** (.antiout) - Revolutionary feature that prevents members from leaving
    - Works with 2-second delay for reliable re-addition
    - Bypasses admin from being re-added
  - **Name Abuse Detection** - Automatically detects abuse against ANURAG or RISHI
    - Monitors all messages for offensive words: MC, BC, BSDK, GANDU, ABE, etc.
    - Responds with random abuse messages and mentions the abuser
    - Multiple response variations for variety
  - **Multi-Panel Support** - Bot now supports multiple users logging in from single deployment
  - Removed lockpic and lockdown commands for cleaner interface
  - All features thoroughly tested and architect-approved
  - Enhanced error handling and retry mechanisms throughout
- **November 1, 2025** - Initial project setup:
  - Installed fca-anurag package and dependencies
  - Created cybersecurity-themed web interface with Matrix-style animation
  - Implemented ultra-strong group name locking with auto-restore
  - Implemented unbreakable nickname protection system
  - Added robust auto-reconnection mechanism with proper re-authentication
  - Added periodic verification system (now ultra-fast: checks every 2 seconds)
  - Implemented rate limiting on login endpoint (5 attempts per 15 minutes)
  - Added comprehensive error handling and input validation
  - Setup Express server on port 5000

## How to Use
1. Access the web panel at the server URL
2. Enter your Facebook AppState (JSON format)
3. Enter your Admin UID
4. Click "ACTIVATE BOT"
5. Use commands in Facebook groups to control locks

## Security Features
- AppState stored in memory only
- Admin-only command access
- Instant change detection and restoration
- Continuous monitoring system
- Auto-recovery on connection loss
