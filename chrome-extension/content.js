const LOG_PREFIX = "[ReplyGuy Content]";

function log(...args) {
  console.log(LOG_PREFIX, new Date().toISOString(), ...args);
}

function logError(...args) {
  console.error(LOG_PREFIX, new Date().toISOString(), ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait for an element to appear in the DOM
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for: ${selector}`));
    }, timeout);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Insert text into X's React contenteditable reply box
async function insertText(textbox, text) {
  textbox.focus();
  await sleep(200);

  // Method 1: Clipboard paste simulation (most reliable for React)
  log("Trying clipboard paste method...");
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    textbox.dispatchEvent(pasteEvent);
    await sleep(500);

    // Check if text was inserted
    if (textbox.textContent && textbox.textContent.includes(text.substring(0, 20))) {
      log("Clipboard paste worked!");
      return true;
    }
  } catch (e) {
    log("Clipboard paste failed:", e.message);
  }

  // Method 2: InputEvent insertText
  log("Trying InputEvent method...");
  try {
    textbox.focus();
    const inputEvent = new InputEvent("input", {
      inputType: "insertText",
      data: text,
      bubbles: true,
      cancelable: true,
    });
    textbox.dispatchEvent(inputEvent);
    await sleep(500);

    if (textbox.textContent && textbox.textContent.includes(text.substring(0, 20))) {
      log("InputEvent method worked!");
      return true;
    }
  } catch (e) {
    log("InputEvent method failed:", e.message);
  }

  // Method 3: Character-by-character with beforeinput events
  log("Trying character-by-character method...");
  try {
    textbox.focus();
    for (const char of text) {
      const beforeInput = new InputEvent("beforeinput", {
        inputType: "insertText",
        data: char,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      textbox.dispatchEvent(beforeInput);

      const input = new InputEvent("input", {
        inputType: "insertText",
        data: char,
        bubbles: true,
        cancelable: false,
        composed: true,
      });
      textbox.dispatchEvent(input);

      await sleep(30 + Math.random() * 50); // human-like delay
    }
    await sleep(500);

    if (textbox.textContent && textbox.textContent.length > 0) {
      log("Character-by-character method worked!");
      return true;
    }
  } catch (e) {
    log("Character-by-character method failed:", e.message);
  }

  // Method 4: execCommand (deprecated but sometimes works)
  log("Trying execCommand method...");
  try {
    textbox.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    await sleep(500);

    if (textbox.textContent && textbox.textContent.includes(text.substring(0, 20))) {
      log("execCommand method worked!");
      return true;
    }
  } catch (e) {
    log("execCommand method failed:", e.message);
  }

  return false;
}

// Main reply handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "typeAndSubmitReply") {
    handleReply(message.replyText).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async
  }
});

async function handleReply(replyText) {
  log(`Starting reply process. Text: "${replyText.substring(0, 50)}..." (${replyText.length} chars)`);

  // Check if we're on a tweet page
  const url = window.location.href;
  if (!url.includes("x.com") && !url.includes("twitter.com")) {
    throw new Error("Not on X.com");
  }

  // Check if logged in
  if (url.includes("/login") || url.includes("/i/flow/login")) {
    throw new Error("Not logged in to X. Please log in first.");
  }

  // Wait for tweet to load
  log("Waiting for tweet to load...");
  try {
    await waitForElement('[data-testid="tweet"]', 10000);
  } catch {
    // Check for deleted/unavailable tweet
    if (document.body.textContent.includes("This post is unavailable")) {
      throw new Error("Tweet is unavailable or deleted");
    }
    throw new Error("Tweet did not load in time");
  }
  log("Tweet loaded");

  // Dismiss any cookie consent
  const cookieBtn = document.querySelector('[data-testid="BottomBar"] button');
  if (cookieBtn) {
    cookieBtn.click();
    await sleep(500);
  }

  // Find the reply textbox — on a tweet page, the reply box is usually visible
  log("Looking for reply textbox...");
  let textbox = document.querySelector('[data-testid="tweetTextarea_0"] [role="textbox"]');

  if (!textbox) {
    // Try clicking the reply button first to open the compose area
    log("Reply textbox not found, clicking reply button...");
    const replyBtn = document.querySelector('[data-testid="reply"]');
    if (replyBtn) {
      replyBtn.click();
      await sleep(1500);
      textbox = document.querySelector('[data-testid="tweetTextarea_0"] [role="textbox"]');
    }
  }

  if (!textbox) {
    throw new Error("Could not find reply textbox");
  }
  log("Found reply textbox");

  // Random delay before typing (human-like)
  const preDelay = 1000 + Math.random() * 2000;
  log(`Waiting ${(preDelay / 1000).toFixed(1)}s before typing...`);
  await sleep(preDelay);

  // Insert the reply text
  log(`Inserting text (${replyText.length} chars)...`);
  const inserted = await insertText(textbox, replyText);

  if (!inserted) {
    throw new Error("Failed to insert reply text into textbox (all methods failed)");
  }
  log("Text inserted successfully");

  // Wait for React to process
  await sleep(800);

  // Find and click the submit button
  log("Looking for submit button...");
  const submitBtn =
    document.querySelector('[data-testid="tweetButtonInline"]') ||
    document.querySelector('[data-testid="tweetButton"]');

  if (!submitBtn) {
    throw new Error("Could not find reply submit button");
  }

  // Check if button is enabled
  if (submitBtn.disabled || submitBtn.getAttribute("aria-disabled") === "true") {
    throw new Error("Submit button is disabled — text may not have been recognized by X");
  }

  log("Clicking submit button...");
  submitBtn.click();

  // Wait for reply to be submitted
  await sleep(3000);

  // Check for errors
  const errorText = document.querySelector('[data-testid="toast"]');
  if (errorText && errorText.textContent.includes("went wrong")) {
    throw new Error("X showed an error after submitting: " + errorText.textContent);
  }

  log("Reply appears to have been submitted successfully!");
  return { success: true };
}

log("Content script loaded on:", window.location.href);
