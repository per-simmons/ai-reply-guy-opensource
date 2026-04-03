const LOG_PREFIX = "[ReplyGuy]";

function log(...args) {
  console.log(LOG_PREFIX, new Date().toISOString(), ...args);
}

function logError(...args) {
  console.error(LOG_PREFIX, new Date().toISOString(), ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Listen for messages from the dashboard
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  log("Received message from", sender.url, "action:", message.action);

  if (message.action === "ping") {
    sendResponse({ installed: true, version: "1.1" });
    return true;
  }

  if (message.action === "postReply") {
    handlePostReply(message, sendResponse);
    return true;
  }

  sendResponse({ success: false, error: "Unknown action" });
  return true;
});

async function handlePostReply(message, sendResponse) {
  const { tweetUrl, replyText } = message;
  const startTime = Date.now();

  if (!tweetUrl || !replyText) {
    sendResponse({ success: false, error: "Missing tweetUrl or replyText" });
    return;
  }

  log(`Starting reply flow for: ${tweetUrl}`);
  log(`Reply text (${replyText.length} chars): "${replyText.substring(0, 60)}..."`);

  let tabId = null;

  try {
    // Rate limit check
    const count = await getReplyCount();
    if (count >= 5) {
      sendResponse({ success: false, error: "Rate limit: max 5 replies per 10 min" });
      return;
    }

    // 1. Open tweet in background tab
    const tab = await chrome.tabs.create({ url: tweetUrl, active: false });
    tabId = tab.id;
    log(`Tab ${tabId} created`);

    // 2. Wait for page load
    await waitForTabLoad(tabId, 15000);
    log(`Tab loaded (${Date.now() - startTime}ms)`);

    // 3. Wait for React hydration
    await sleep(3000);

    // 4. Attach debugger to the tab
    log("Attaching debugger...");
    await chrome.debugger.attach({ tabId }, "1.3");
    log("Debugger attached");

    // 5. Find and click the reply textbox using debugger
    log("Clicking reply textbox...");
    const clickResult = await executeInTab(tabId, `
      const area = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (area) {
        area.click();
        const tb = document.querySelector('[role="textbox"]');
        if (tb) tb.focus();
        true;
      } else {
        false;
      }
    `);

    if (!clickResult) {
      throw new Error("Could not find reply textbox");
    }
    log("Reply textbox focused");

    await sleep(500);

    // 6. Type the reply using chrome.debugger (real keystrokes)
    log(`Typing ${replyText.length} characters...`);
    for (const char of replyText) {
      await sendKey(tabId, char);
      // Small random delay for human-like typing
      await sleep(15 + Math.random() * 35);
    }
    log("Typing complete");

    // 7. Wait for React to process
    await sleep(1000);

    // 8. Check if submit button is enabled
    const buttonReady = await executeInTab(tabId, `
      const btn = document.querySelector('[data-testid="tweetButtonInline"]');
      btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
    `);

    if (!buttonReady) {
      throw new Error("Reply button not enabled after typing");
    }
    log("Reply button is enabled");

    // 9. Click the Reply button
    log("Clicking Reply button...");
    await executeInTab(tabId, `
      const btn = document.querySelector('[data-testid="tweetButtonInline"]');
      if (btn) btn.click();
    `);

    // 10. Wait for reply to submit
    await sleep(3000);

    // 11. Check for success (reply box should be cleared)
    const submitted = await executeInTab(tabId, `
      const tb = document.querySelector('[data-testid="tweetTextarea_0"] [role="textbox"]');
      // If textbox is empty or gone, reply was submitted
      !tb || tb.textContent.length === 0 || tb.textContent === '\\n';
    `);

    log("Submit check:", submitted ? "success" : "may have failed");

    // 12. Detach debugger
    await chrome.debugger.detach({ tabId }).catch(() => {});

    // 13. Close tab
    await sleep(1000);
    await chrome.tabs.remove(tabId).catch(() => {});

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Reply completed in ${totalTime}s`);

    await incrementReplyCount();
    sendResponse({ success: true, totalTime });

  } catch (err) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logError(`Failed: ${err.message} (${totalTime}s)`);

    // Cleanup
    if (tabId) {
      await chrome.debugger.detach({ tabId }).catch(() => {});
      await chrome.tabs.remove(tabId).catch(() => {});
    }

    sendResponse({ success: false, error: err.message, totalTime });
  }
}

// Send a real keystroke via chrome.debugger
async function sendKey(tabId, char) {
  // Send keyDown + char event
  const params = {
    type: "keyDown",
    text: char,
    key: char,
    code: `Key${char.toUpperCase()}`,
    windowsVirtualKeyCode: char.charCodeAt(0),
    nativeVirtualKeyCode: char.charCodeAt(0),
  };

  // For special characters, just use char event
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
    type: "char",
    text: char,
    unmodifiedText: char,
  });
}

// Execute JS in a tab via debugger
async function executeInTab(tabId, code) {
  const result = await chrome.debugger.sendCommand(
    { tabId },
    "Runtime.evaluate",
    { expression: code, returnByValue: true }
  );
  return result?.result?.value;
}

// Wait for tab to finish loading
function waitForTabLoad(tabId, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, timeout);

    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Rate limiting
async function getReplyCount() {
  const data = await chrome.storage.local.get("replyLog");
  const replyLog = data.replyLog || [];
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  return replyLog.filter((ts) => ts > tenMinAgo).length;
}

async function incrementReplyCount() {
  const data = await chrome.storage.local.get("replyLog");
  const replyLog = data.replyLog || [];
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const filtered = replyLog.filter((ts) => ts > tenMinAgo);
  filtered.push(Date.now());
  await chrome.storage.local.set({ replyLog: filtered });
}

log("Reply Guy extension v1.1 loaded (debugger mode)");
