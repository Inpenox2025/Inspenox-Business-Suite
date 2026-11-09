/**
 * ==========================================================================
 * SIMULATORCONTROLLER.JS - Interactive WhatsApp Simulator Controller (Multi-Step Bot Progression Flow)
 * ==========================================================================
 * Drives the interactive smartphone simulation on the Automation Board and Landing Page: simulates multi-step WhatsApp chatbot progression (Welcome ➔ Location Select ➔ Dynamic Catalog List ➔ Order Placement ➔ Live Agent handoff), stepper navigation pills, button click simulation, hover detection, and auto-play replay loops.
 * 
 * Module Components:
 *  - Lines 13803 to 14141 in original app.js (WhatsApp Smartphone Simulator Flow, Stepper Pills, Button Click Simulation & Auto-Play Loop)
 * ==========================================================================
 */

// ==========================================================================
// INTERACTIVE WHATSAPP SIMULATOR CONTROLLER (INSPENOX MULTI-STEP FLOW)
// ==========================================================================

let simTimeouts = [];
let isSimHovered = false;
let simListenersAttached = false;

function clearSimTimers() {
    simTimeouts.forEach(t => clearTimeout(t));
    simTimeouts = [];
}

function queueSimAction(fn, delayMs) {
    const t = setTimeout(() => {
        fn();
    }, delayMs);
    simTimeouts.push(t);
    return t;
}

function scrollSimToElement(el) {
    const container = document.getElementById('preview-chat-flow-container');
    if (!container || !el) return;
    const targetScroll = Math.max(0, el.offsetTop - 15);
    container.scrollTo({ top: targetScroll, behavior: 'smooth' });
}

function scrollSimToBottom() {
    const container = document.getElementById('preview-chat-flow-container');
    if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
}

function updateSimStepperPill(stepNum) {
    document.querySelectorAll('.wa-sim-step-pill').forEach(p => p.classList.remove('active'));
    const pill = document.getElementById(`pill-step-${stepNum}`);
    if (pill) pill.classList.add('active');
}

function focusSimStep(stepIndex) {
    for (let i = 1; i <= stepIndex; i++) {
        const b = document.getElementById(`sim-bubble-${i}`);
        if (b) {
            b.style.display = 'block';
            b.style.opacity = '1';
        }
    }

    const el = document.getElementById(`sim-bubble-${stepIndex}`);
    if (el) {
        scrollSimToElement(el);
        el.style.transition = 'box-shadow 0.3s ease, transform 0.2s ease';
        el.style.boxShadow = '0 0 0 2px #00a884';
        setTimeout(() => {
            el.style.boxShadow = '';
        }, 800);
    }

    let pillNum = 1;
    if (stepIndex >= 6) pillNum = 4;
    else if (stepIndex >= 4) pillNum = 3;
    else if (stepIndex >= 3) pillNum = 2;
    updateSimStepperPill(pillNum);

    // Pause auto-play temporarily so user can review the clicked step, resume in 8s
    clearSimTimers();
    queueSimAction(() => {
        if (!isSimHovered) startAutoPlayChatSimulation(false);
    }, 8000);
}
window.focusSimStep = focusSimStep;

function triggerSimClick(action) {
    clearSimTimers();

    let label = 'India';
    if (action === 'usa') label = 'USA';
    if (action === 'uae') label = 'UAE & Others';

    const locEl = document.getElementById('sim-chosen-loc');
    if (locEl) locEl.textContent = label;

    [1, 2, 3, 4].forEach(i => {
        const b = document.getElementById(`sim-bubble-${i}`);
        if (b) {
            b.style.display = 'block';
            b.style.opacity = '1';
        }
    });

    const b3 = document.getElementById('sim-bubble-3');
    if (b3) scrollSimToElement(b3);
    updateSimStepperPill(2);

    queueSimAction(() => {
        if (!isSimHovered) startAutoPlayChatSimulation(false);
    }, 8000);
}
window.triggerSimClick = triggerSimClick;

function openSimListSheet() {
    const sheet = document.getElementById('wa-sim-sheet');
    if (sheet) {
        sheet.style.display = 'block';
    }
}
window.openSimListSheet = openSimListSheet;

function closeSimListSheet() {
    const sheet = document.getElementById('wa-sim-sheet');
    if (sheet) {
        sheet.style.display = 'none';
    }
}
window.closeSimListSheet = closeSimListSheet;

function selectSimListOption(optionName) {
    closeSimListSheet();
    clearSimTimers();

    const optEl = document.getElementById('sim-chosen-opt');
    if (optEl) optEl.textContent = optionName;

    [1, 2, 3, 4, 5, 6].forEach(i => {
        const b = document.getElementById(`sim-bubble-${i}`);
        if (b) {
            b.style.display = 'block';
            b.style.opacity = '1';
        }
    });

    updateSimStepperPill(4);
    setTimeout(() => scrollSimToBottom(), 200);

    queueSimAction(() => {
        if (!isSimHovered) startAutoPlayChatSimulation(false);
    }, 8000);
}
window.selectSimListOption = selectSimListOption;

function triggerSimMic() {
    if (typeof showModal === 'function') {
        showModal('Voice & Media Automation', 'Inspenox Business API also supports incoming voice note transcription and automated template responses 24/7 powered by Cloudflare Workers!');
    }
}
window.triggerSimMic = triggerSimMic;

function startAutoPlayChatSimulation(isManual = false) {
    clearSimTimers();

    const container = document.getElementById('preview-chat-flow-container');
    if (!container) return;

    // Attach hover listener once so user reading/hovering pauses the loop
    const deviceEl = document.querySelector('.wa-sim-device');
    if (deviceEl && !simListenersAttached) {
        simListenersAttached = true;
        deviceEl.addEventListener('mouseenter', () => {
            isSimHovered = true;
        });
        deviceEl.addEventListener('mouseleave', () => {
            isSimHovered = false;
        });
    }

    const bubbles = [
        document.getElementById('sim-bubble-1'),
        document.getElementById('sim-bubble-2'),
        document.getElementById('sim-bubble-3'),
        document.getElementById('sim-bubble-4'),
        document.getElementById('sim-bubble-5'),
        document.getElementById('sim-bubble-6')
    ];

    const statusEl = document.getElementById('preview-sim-status');
    const indiaBtn = document.getElementById('sim-btn-india');
    const listBtn = document.getElementById('sim-btn-list');

    // 1. Reset all bubbles to hidden
    bubbles.forEach(b => {
        if (b) {
            b.style.display = 'none';
            b.style.opacity = '0';
        }
    });

    if (indiaBtn) indiaBtn.classList.remove('sim-clicked', 'is-active');
    if (listBtn) listBtn.classList.remove('sim-clicked', 'is-active');

    // Reset status & pills
    if (statusEl) {
        statusEl.textContent = 'Official Business Account';
        statusEl.classList.remove('is-typing');
    }
    updateSimStepperPill(1);

    // Scroll to top
    container.scrollTo({ top: 0, behavior: 'smooth' });

    // Step 1: Customer sends "Hii" (at 300ms)
    queueSimAction(() => {
        if (bubbles[0]) {
            bubbles[0].style.display = 'block';
            bubbles[0].style.opacity = '1';
            bubbles[0].style.animation = 'waBubbleFadeIn 0.3s ease-out';
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, 300);

    // Step 2a: Bot typing indicator (at 1200ms)
    queueSimAction(() => {
        if (statusEl) {
            statusEl.textContent = 'typing...';
            statusEl.classList.add('is-typing');
        }
    }, 1200);

    // Step 2b: Bot Welcome & 3 Location Buttons appears (at 2100ms)
    queueSimAction(() => {
        if (statusEl) {
            statusEl.textContent = 'Official Business Account';
            statusEl.classList.remove('is-typing');
        }
        if (bubbles[1]) {
            bubbles[1].style.display = 'block';
            bubbles[1].style.opacity = '1';
            bubbles[1].style.animation = 'waBubbleFadeIn 0.3s ease-out';
            scrollSimToElement(bubbles[1]);
        }
    }, 2100);

    // Step 3a: Simulate user clicking "India" button with pulse animation (at 3600ms)
    queueSimAction(() => {
        if (indiaBtn) {
            indiaBtn.classList.add('sim-clicked');
        }
    }, 3600);

    // Step 3b: Customer Quoted reply "India" appears (at 4100ms)
    queueSimAction(() => {
        if (indiaBtn) indiaBtn.classList.remove('sim-clicked');
        if (bubbles[2]) {
            bubbles[2].style.display = 'block';
            bubbles[2].style.opacity = '1';
            bubbles[2].style.animation = 'waBubbleFadeIn 0.3s ease-out';
            updateSimStepperPill(2);
            scrollSimToElement(bubbles[2]);
        }
    }, 4100);

    // Step 4a: Bot typing indicator (at 5200ms)
    queueSimAction(() => {
        if (statusEl) {
            statusEl.textContent = 'typing...';
            statusEl.classList.add('is-typing');
        }
    }, 5200);

    // Step 4b: Bot Menu List template appears (at 6200ms)
    queueSimAction(() => {
        if (statusEl) {
            statusEl.textContent = 'Official Business Account';
            statusEl.classList.remove('is-typing');
        }
        if (bubbles[3]) {
            bubbles[3].style.display = 'block';
            bubbles[3].style.opacity = '1';
            bubbles[3].style.animation = 'waBubbleFadeIn 0.3s ease-out';
            updateSimStepperPill(3);
            scrollSimToElement(bubbles[3]);
        }
    }, 6200);

    // Step 5a: Simulate clicking list menu button "Please select" (at 7600ms)
    queueSimAction(() => {
        if (listBtn) {
            listBtn.classList.add('sim-clicked');
        }
    }, 7600);

    // Step 5b: Customer Quoted reply "Place an Order" appears (at 8100ms)
    queueSimAction(() => {
        if (listBtn) listBtn.classList.remove('sim-clicked');
        if (bubbles[4]) {
            bubbles[4].style.display = 'block';
            bubbles[4].style.opacity = '1';
            bubbles[4].style.animation = 'waBubbleFadeIn 0.3s ease-out';
            scrollSimToElement(bubbles[4]);
        }
    }, 8100);

    // Step 6a: Bot typing indicator (at 9100ms)
    queueSimAction(() => {
        if (statusEl) {
            statusEl.textContent = 'typing...';
            statusEl.classList.add('is-typing');
        }
    }, 9100);

    // Step 6b: Bot Live Agent Handoff appears (at 10100ms)
    queueSimAction(() => {
        if (statusEl) {
            statusEl.textContent = 'Official Business Account';
            statusEl.classList.remove('is-typing');
        }
        if (bubbles[5]) {
            bubbles[5].style.display = 'block';
            bubbles[5].style.opacity = '1';
            bubbles[5].style.animation = 'waBubbleFadeIn 0.3s ease-out';
            updateSimStepperPill(4);
            scrollSimToBottom();
        }
    }, 10100);

    // Loop: After 8-second pause, check hover and restart auto-play loop!
    queueSimAction(() => {
        function checkAndLoop() {
            if (isSimHovered) {
                queueSimAction(checkAndLoop, 3000);
                return;
            }
            const autoView = document.getElementById('view-automation');
            if (autoView && autoView.style.display !== 'none' && !autoView.classList.contains('hidden')) {
                startAutoPlayChatSimulation(false);
            }
        }
        checkAndLoop();
    }, 18000);
}
window.startAutoPlayChatSimulation = startAutoPlayChatSimulation;

function replayChatSimulation() {
    startAutoPlayChatSimulation(true);
}
window.replayChatSimulation = replayChatSimulation;


