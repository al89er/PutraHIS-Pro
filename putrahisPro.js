// ==UserScript==
// @name         UPM RESQ Full Panel + Telegram Multi-User + Overdue Breakdown (Supabase Realtime Hub)
// @namespace    http://tampermonkey.net/
// @version      4.9
// @description  Site-wide persistent navbar capsule + Anti-Ping-Pong State Lock + Telegram Bot management.
// @match        https://putrahis.hsaas.upm.edu.my/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ====== BOT TOKEN SECURITY CONFIG ======
//    let TELEGRAM_BOT_TOKEN = GM_getValue('TELEGRAM_BOT_TOKEN', '');

//    if (!TELEGRAM_BOT_TOKEN) {
//        const input = prompt('Please enter your Telegram Bot Token for RESQ Script:', '');
//        if (input) {
//            TELEGRAM_BOT_TOKEN = input.trim();
//            GM_setValue('TELEGRAM_BOT_TOKEN', TELEGRAM_BOT_TOKEN);
//        } else {
//            console.warn('Telegram Bot Token missing. Bot listener processes disabled.');
//        }
//    }

//    GM_registerMenuCommand('Change Telegram Bot Token', () => {
//        const current = GM_getValue('TELEGRAM_BOT_TOKEN', '');
//        const input = prompt('Enter new Telegram Bot Token:', current);
//        if (input !== null) {
//            GM_setValue('TELEGRAM_BOT_TOKEN', input.trim());
//            location.reload();
//        }
//    });

    // ====== SUPABASE CONFIGURATION ======
    const SUPABASE_URL = 'https://pvbbdmlyueodfzqvywfv.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2YmJkbWx5dWVvZGZ6cXZ5d2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzkyNjEsImV4cCI6MjA5OTExNTI2MX0.A1dSapE7481_5L-IHCBcEG-qF-xhxzMRBdO3A4Yd3NM';

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let TELEGRAM_BOT_TOKEN = null; //

    const myComputerId = 'pc_' + Math.random().toString(36).substring(2, 9);
    let supabaseCache = null;
    let lastSeenLocalDataString = null; // NEW: Memory lock to prevent ping-pong loops

    // ====== STYLES SHEET INJECTION ======
    const style = document.createElement("style");
    style.textContent = `
    #zoneCounterPanel {
      display: flex;
      align-items: center;
      gap: 10px;
      position: fixed; 
      top: 10px;
      left: 195px; 
      background: #111318; 
      border: 1px solid #222530;
      padding: 0 14px;
      z-index: 1035; 
      font-family: 'Poppins', 'Segoe UI', Helvetica, sans-serif;
      border-radius: 24px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.1);
      height: 34px;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }
    #zoneCounterPanel:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15);
      background: #161920;
    }
    .nav-status-group {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      background: #1c1f26; 
      padding: 2px 8px;
      border-radius: 14px;
      height: 24px;
      border: 1px solid #2d313f;
      white-space: nowrap;
    }
    .zone-label { font-size: 11px; font-weight: 700; }
    .zone-green-text  { color: #52d681; } 
    .zone-yellow-text { color: #f5d042; }
    .zone-red-text    { color: #ff5252; }
    .nav-status-badge { font-size: 11px; color: #ffffff; font-weight: 700; }
    .nav-overdue-tag { font-size: 9px; color: #8a92b2; font-weight: 500; margin-left: 2px; }
    .epau-group { background: rgba(155, 89, 182, 0.15); border: 1px solid rgba(155, 89, 182, 0.4); }
    .epau-label { color: #d19fe8; font-size: 11px; font-weight: 700; }
    .epau-count { color: #ffffff; font-weight: 700; font-size: 12px; }
    .status-dots-container {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 2px;
      border-left: 1px solid #2d313f;
      padding-left: 8px;
      height: 14px;
    }
    .pulse-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
    .pulse-dot.active-tg { background-color: #38bdf8; box-shadow: 0 0 6px rgba(56, 189, 248, 0.6); }
    .pulse-dot.active-session { background-color: #4ade80; box-shadow: 0 0 6px rgba(74, 222, 128, 0.6); }
    .pulse-dot.connecting-loop { background-color: #fbbf24; animation: pulseGlow 1s infinite alternate; }
    .pulse-dot.error-state { background-color: #f87171; animation: pulseGlow 0.5s infinite alternate; }
    @keyframes pulseGlow { 0% { opacity: 0.4; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1.1); } }
    #sessionStatus, #telegramStatus { display: none !important; }
  `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.id = "zoneCounterPanel";
    panel.innerHTML = `<span style="color:#aaa; font-size:11px;">Initializing Sync Pipeline...</span>`;
    document.body.appendChild(panel);

    // ====== DOM DATA EXTRACTOR PARSER ======
    function getDataSummary() {
        const data = {
            green: { seen: 0, total: 0, over4h: 0, over6h: 0 },
            yellow: { seen: 0, total: 0, over4h: 0, over6h: 0 },
            red: { seen: 0, total: 0, over4h: 0, over6h: 0 },
            epau: { total: 0 }
        };

        const panels = document.querySelectorAll("div.panel.panel-inverse");
        panels.forEach(p => {
            const heading = p.querySelector(".panel-heading .panel-title")?.innerText.trim().toUpperCase() || "";
            if (heading.includes("RESQ ZONE")) {
                const rows = p.querySelectorAll("table tbody tr");
                rows.forEach(row => {
                    if (row.offsetParent === null) return;
                    const cells = row.querySelectorAll("td");
                    if (cells.length < 5) return;

                    const zoneText = row.innerText.toLowerCase();
                    let zone = null;
                    if (zoneText.includes("green zone")) zone = "green";
                    else if (zoneText.includes("yellow zone")) zone = "yellow";
                    else if (zoneText.includes("red zone")) zone = "red";
                    if (!zone) return;

                    data[zone].total++;
                    const seenText = cells[4].textContent.trim();
                    if (seenText && seenText !== "-") data[zone].seen++;

                    const over6 = row.querySelector("span.blinking");
                    const over4 = row.querySelector("span.blinking2");
                    if (over6) data[zone].over6h++;
                    else if (over4) data[zone].over4h++;
                });
            } else if (heading.includes("EPAU")) {
                const rows = p.querySelectorAll("table tbody tr");
                rows.forEach(row => {
                    if (row.offsetParent === null) return;
                    const cells = row.querySelectorAll("td");
                    if (cells.length >= 3) {
                        data.epau.total++;
                    }
                });
            }
        });
        return data;
    }

    // ====== UI RENDERING MOTOR ======
    function updatePanelUI(data) {
        panel.innerHTML = `
      <div class="nav-status-group" title="Green Zone (Seen / Total) [>4h Delay | >6h Overdue]">
        <span class="zone-label zone-green-text">GRN</span>
        <span class="nav-status-badge">${data.green.seen}/${data.green.total}</span>
        <span class="nav-overdue-tag">${data.green.over4h}•${data.green.over6h}</span>
      </div>
      <div class="nav-status-group" title="Yellow Zone (Seen / Total) [>4h Delay | >6h Overdue]">
        <span class="zone-label zone-yellow-text">YLW</span>
        <span class="nav-status-badge">${data.yellow.seen}/${data.yellow.total}</span>
        <span class="nav-overdue-tag">${data.yellow.over4h}•${data.yellow.over6h}</span>
      </div>
      <div class="nav-status-group" title="Red Zone (Seen / Total) [>4h Delay | >6h Overdue]">
        <span class="zone-label zone-red-text">RED</span>
        <span class="nav-status-badge">${data.red.seen}/${data.red.total}</span>
        <span class="nav-overdue-tag">${data.red.over4h}•${data.red.over6h}</span>
      </div>
      <div class="nav-status-group epau-group" title="EPAU Active Patient Tally">
        <span class="epau-label">EPAU</span>
        <span class="epau-count">${data.epau.total}</span>
      </div>
      <div class="status-dots-container">
        <span id="dotTelegram" class="pulse-dot active-tg" title="Telegram Engine Connected"></span>
        <span id="dotSession" class="pulse-dot active-session" title="HIS Session Guard Protected"></span>
      </div>
    `;
    }

    // ====== SCREENSHOT CAPTURE UTILITIES ======
    function findTargetPanel() {
        const contentWrapper = document.querySelector('#content') || document.querySelector('.content');
        if (contentWrapper) return contentWrapper;

        const panels = Array.from(document.querySelectorAll('div.panel.panel-inverse')).filter(el => el && el.offsetParent !== null);
        if (panels.length > 0) return panels[0].closest('.row') || panels[0].parentElement;
        return document.body;
    }

    async function capturePanelBlob(scaleInput) {
        const node = findTargetPanel();
        if (!node) throw new Error('Root target panel missing on current view frame.');
        let scale = Number(scaleInput);
        if (!Number.isFinite(scale) || scale <= 0) scale = Math.min(4, Math.max(3, (window.devicePixelRatio || 1) * 2));

        await new Promise(r => setTimeout(r, 50));
        const canvas = await html2canvas(node, { backgroundColor: '#ffffff', scale, useCORS: true, logging: false });
        return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
    }

    async function sendPanelImage(chatId, { asDocument = true, scale } = {}) {
        try {
            await sendChatAction(chatId, asDocument ? 'upload_document' : 'upload_photo');
            const blob = await capturePanelBlob(scale);
            if (!blob) throw new Error('Canvas rendering engine returned bad binary stream.');

            const fd = new FormData();
            fd.append('chat_id', String(chatId));
            fd.append('caption', `RESQ Matrix • ${new Date().toLocaleTimeString()} • ${asDocument ? 'Full-Res' : 'Compressed'}`);
            const endpoint = asDocument ? 'sendDocument' : 'sendPhoto';
            fd.append(asDocument ? 'document' : 'photo', blob, `panel-${Date.now()}.png`);

            const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`, { method: 'POST', body: fd });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        } catch (err) {
            console.error('sendPanelImage execution crash:', err);
            await sendTelegramMessage(chatId, `⚠️ *Remote screenshot processing dropped:* ${err.message}`);
        }
    }

    // ====== CORE TELEGRAM CONNECTIONS ======
    function sendTelegramMessage(chatId, text) {
        return fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
        });
    }

    function sendChatAction(chatId, action) {
        return fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action })
        });
    }

    function sendFormattedTallyToTelegram(data, chatId) {
        const msg = `
**🧾 RESQ & EPAU System Summary** (${new Date().toLocaleTimeString()}):
🟢 *Green*: ${data.green.seen}/${data.green.total} seen  [>4h: ${data.green.over4h} | >6h: ${data.green.over6h}]
🟡 *Yellow*: ${data.yellow.seen}/${data.yellow.total} seen [>4h: ${data.yellow.over4h} | >6h: ${data.yellow.over6h}]
🔴 *Red*: ${data.red.seen}/${data.red.total} seen    [>4h: ${data.red.over4h} | >6h: ${data.red.over6h}]
🔮 *EPAU Unit Total*: ${data.epau.total} patients active`.trim();
        sendTelegramMessage(chatId, msg).catch(err => console.error('Bot delivery crash:', err));
    }

    // ====== LIVE SCRAPER AND INTELLIGENT ANTI-PING-PONG WRITER ======
    function runLocalScraperAndUiEngine() {
        const local = getDataSummary();
        const localString = JSON.stringify(local);

        if (!supabaseCache) return; // Wait for handshake sync to finish

        // 🎯 THE FIX: Only attempt to write to Supabase if the PHYSICAL Web Page has changed.
        // This completely prevents stale background tabs from fighting with fresh tabs.
        if (lastSeenLocalDataString !== localString) {
            lastSeenLocalDataString = localString;

            const dataHasChanged = 
                local.green.seen   !== supabaseCache.green_seen   || local.green.total  !== supabaseCache.green_total  ||
                local.yellow.seen  !== supabaseCache.yellow_seen  || local.yellow.total !== supabaseCache.yellow_total ||
                local.red.seen     !== supabaseCache.red_seen     || local.red.total    !== supabaseCache.red_total    ||
                local.green.over4h !== supabaseCache.green_over4h || local.green.over6h !== supabaseCache.green_over6h ||
                local.epau.total   !== supabaseCache.epau_total;

            if (dataHasChanged) {
                supabaseCache = {
                    green_seen: local.green.seen, green_total: local.green.total, green_over4h: local.green.over4h, green_over6h: local.green.over6h,
                    yellow_seen: local.yellow.seen, yellow_total: local.yellow.total, yellow_over4h: local.yellow.over4h, yellow_over6h: local.yellow.over6h,
                    red_seen: local.red.seen, red_total: local.red.total, red_over4h: local.red.over4h, red_over6h: local.red.over6h,
                    epau_total: local.epau.total
                };
                supabaseClient.from('hospital_live_state').update(supabaseCache).eq('id', 1).then();
            }
        }

        // 🎯 SECOND FIX: Always draw the UI using the single source of truth (Cloud Cache).
        // This stops your pill bar from flickering back to old numbers if you are on a stale page.
        updatePanelUI({
            green: { seen: supabaseCache.green_seen, total: supabaseCache.green_total, over4h: supabaseCache.green_over4h, over6h: supabaseCache.green_over6h },
            yellow: { seen: supabaseCache.yellow_seen, total: supabaseCache.yellow_total, over4h: supabaseCache.yellow_over4h, over6h: supabaseCache.yellow_over6h },
            red: { seen: supabaseCache.red_seen, total: supabaseCache.red_total, over4h: supabaseCache.red_over4h, over6h: supabaseCache.red_over6h },
            epau: { total: supabaseCache.epau_total }
        });
    }

    // ====== LIVE GLOBAL READ STATE SYNC PIPELINE ======
    supabaseClient
      .channel('live_state_sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hospital_live_state', filter: 'id=eq.1' }, (payload) => {
          supabaseCache = payload.new; 
          updatePanelUI({
              green: { seen: supabaseCache.green_seen, total: supabaseCache.green_total, over4h: supabaseCache.green_over4h, over6h: supabaseCache.green_over6h },
              yellow: { seen: supabaseCache.yellow_seen, total: supabaseCache.yellow_total, over4h: supabaseCache.yellow_over4h, over6h: supabaseCache.yellow_over6h },
              red: { seen: supabaseCache.red_seen, total: supabaseCache.red_total, over4h: supabaseCache.red_over4h, over6h: supabaseCache.red_over6h },
              epau: { total: supabaseCache.epau_total }
          });
      })
      .subscribe();

    // ====== DISTRIBUTED CONCURRENCY COMMAND ENGINE ======
    function startTelegramCommandEngine() {
        supabaseClient
          .channel('telegram_race_coordination')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telegram_commands' }, async (payload) => {
            const request = payload.new;
            if (request.status !== 'pending') return;

            const { data } = await supabaseClient
              .from('telegram_commands')
              .update({ status: 'processing', claimed_by: myComputerId })
              .eq('id', request.id)
              .eq('status', 'pending')
              .select();

            if (data && data.length > 0) {
                const tgIcon = document.getElementById('dotTelegram');
                try {
                    if (tgIcon) tgIcon.className = 'pulse-dot connecting-loop';

                    if (request.command === '/update') {
                        const summary = getDataSummary(); // Gets actual physical numbers for accurate reporting
                        sendFormattedTallyToTelegram(summary, request.chat_id);
                    } 
                    else if (request.command === '/screenshot' || request.command === '/screenshot_photo') {
                        await sendPanelImage(request.chat_id, { asDocument: request.command === '/screenshot', scale: 3 });
                    }

                    await supabaseClient.from('telegram_commands').update({ status: 'completed' }).eq('id', request.id);
                    if (tgIcon) tgIcon.className = 'pulse-dot active-tg';
                } catch (err) {
                    await supabaseClient.from('telegram_commands').update({ status: 'failed' }).eq('id', request.id);
                    if (tgIcon) tgIcon.className = 'pulse-dot error-state';
                }
            }
          })
          .subscribe();
    }

    // ====== HIS PORTAL SESSION PRESERVATION LOOP ======
    function getPvId() {
        const el = document.querySelector('[id^="alert_"]');
        return el?.id?.replace("alert_", "") || null;
    }

    function startSessionKeepAlive() {
        setInterval(async () => {
            const pvId = getPvId();
            if (!pvId) return;

            const sessionIcon = document.getElementById('dotSession');
            try {
                const res = await fetch(`https://putrahis.hsaas.upm.edu.my/REST/ajaxShowZoneAlert.php?pvId=${pvId}`, { credentials: "include" });
                const text = await res.text();
                if (text.toLowerCase().includes("login") || text.toLowerCase().includes("expired")) {
                    if (sessionIcon) sessionIcon.className = 'pulse-dot error-state';
                    location.reload();
                } else {
                    if (sessionIcon) {
                        sessionIcon.className = 'pulse-dot active-session';
                        sessionIcon.style.animation = "blink 0.3s ease-out";
                    }
                }
            } catch (err) {
                if (sessionIcon) sessionIcon.className = 'pulse-dot error-state';
            }
        }, 2 * 60 * 1000);
    }

    // ====== HYBRID PIPELINE BOOTSTRAP INITIALIZATION ======
    async function beginHandshakeInitialization() {
        const headerContainer = document.getElementById("header");
        if (!headerContainer) return setTimeout(beginHandshakeInitialization, 200);

        try {
            // Fetch BOTH the live stats and the secret bot token in parallel!
            const [stateResponse, configResponse] = await Promise.all([
                supabaseClient.from('hospital_live_state').select().eq('id', 1).single(),
                supabaseClient.from('app_config').select('telegram_bot_token').eq('id', 1).single()
            ]);

            supabaseCache = stateResponse.data;
            TELEGRAM_BOT_TOKEN = configResponse.data.telegram_bot_token;
            
            updatePanelUI({
                green: { seen: data.green_seen, total: data.green_total, over4h: data.green_over4h, over6h: data.green_over6h },
                yellow: { seen: data.yellow_seen, total: data.yellow_total, over4h: data.yellow_over4h, over6h: data.yellow_over6h },
                red: { seen: data.red_seen, total: data.red_total, over4h: data.red_over4h, over6h: data.red_over6h },
                epau: { total: data.epau_total }
            });
        } catch (err) {
            console.error("Initial handshakes dropped with Supabase cloud server layers.", err);
        }

        const pageHeader = document.querySelector(".page-header");
        const headerText = pageHeader ? pageHeader.innerText.replace(/\s+/g, ' ').trim() : "";
        
        if (headerText === "RESQ Patient List") {
            console.log("PC Status: ACTIVE SCRAPER mode armed.");
            // 🎯 NEW: Set baseline before loop starts to prevent initial-load overwrites
            lastSeenLocalDataString = JSON.stringify(getDataSummary()); 
            setInterval(runLocalScraperAndUiEngine, 5000);
            
            // 🎯 NEW: Only start the Telegram listener if we are actually on the patient list!
            startTelegramCommandEngine();
            
        } else {
            console.log("PC Status: PASSIVE LISTENER mode armed.");
        }

        startSessionKeepAlive();
        setInterval(() => location.reload(), 10 * 60 * 1000); 
    }

    beginHandshakeInitialization();
})();
