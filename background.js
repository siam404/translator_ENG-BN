// background.js
let geminiApiKey = '';

// Initialize context menu item
browser.contextMenus.create({
  id: "translate-selection",
  title: "Translate to Bangla",
  contexts: ["selection"]
});

// Load API key from storage
browser.storage.local.get('geminiApiKey', function(data) {
  if (data.geminiApiKey) {
    geminiApiKey = data.geminiApiKey;
    console.log("API key loaded from storage");
  } else {
    console.log("No API key found in storage");
  }
});

// Listen for API key updates
browser.runtime.onMessage.addListener(function(message) {
  if (message.action === "apiKeySaved") {
    geminiApiKey = message.apiKey;
    console.log("API key updated");
    return true;
  }
  return true;
});

// Handle context menu click
browser.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === "translate-selection") {
    const textToTranslate = info.selectionText;
    console.log("Context menu translation requested for:", textToTranslate);
    
    if (textToTranslate && geminiApiKey) {
      translateText(textToTranslate, tab.id);
    } else if (!geminiApiKey) {
      console.error("No API key available");
      notifyAllFrames(tab.id, {
        action: "showError",
        error: "API key not found. Please set your Gemini API key in the extension popup."
      });
    }
  }
});

// Listen for messages from content script
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === "translateSelection" && message.text) {
    console.log("Translation requested from content script:", message.text);
    
    if (!sender.tab) {
      console.error("Sender tab information missing");
      return true;
    }
    
    translateText(message.text, sender.tab.id);
  }
  return true;
});

// Function to translate text using Gemini API
function translateText(text, tabId) {
  console.log("Translating text:", text);
  console.log("Using API key:", geminiApiKey ? "API key exists" : "No API key");
  
  if (!geminiApiKey) {
    notifyAllFrames(tabId, {
      action: "showError",
      error: "API key not found. Please set your Gemini API key in the extension popup."
    });
    return;
  }
  
  const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
  
  const requestBody = {
    contents: [{
      parts: [{
        text: `Translate the following English text to Bangla (Bengali). Return only the translated text without any additional explanations or quotation marks: "${text}"`
      }]
    }]
  };
  
  console.log("Sending API request with body:", JSON.stringify(requestBody));
  
  fetch(`${apiUrl}?key=${geminiApiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  })
  .then(response => {
    console.log("API response status:", response.status);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log("API response data:", JSON.stringify(data));

    // Extract translation from Gemini API response
    let translatedText = "";
    
    if (data.candidates && 
        data.candidates[0] && 
        data.candidates[0].content && 
        data.candidates[0].content.parts && 
        data.candidates[0].content.parts[0] && 
        data.candidates[0].content.parts[0].text) {
      
      translatedText = data.candidates[0].content.parts[0].text;
      
      // Clean up the response
      translatedText = translatedText.replace(/^["']|["']$/g, ''); // Remove surrounding quotes if present
      translatedText = translatedText.replace(/^Translation: /i, ''); // Remove "Translation: " prefix if present
      
      console.log("Extracted translation:", translatedText);
      
      // Send translation to all frames in the tab
      notifyAllFrames(tabId, {
        action: "showTranslation",
        original: text,
        translation: translatedText
      });
    } else {
      console.error("Unexpected API response structure:", data);
      notifyAllFrames(tabId, {
        action: "showError",
        error: "Translation failed. API response format was unexpected."
      });
    }
  })
  .catch(error => {
    console.error("Translation error:", error);
    notifyAllFrames(tabId, {
      action: "showError",
      error: "API error: " + error.message
    });
  });
}

// Function to notify all frames in a tab with a message
function notifyAllFrames(tabId, message) {
  // First, try sending to all frames
  browser.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(error => {
    console.log("Error sending to main frame:", error);
  });
  
  // Also try to query for all frames and send to each one
  browser.webNavigation.getAllFrames({ tabId: tabId }).then(frames => {
    if (frames && frames.length > 0) {
      console.log(`Found ${frames.length} frames in tab ${tabId}`);
      frames.forEach(frame => {
        console.log(`Sending message to frame ${frame.frameId}`);
        browser.tabs.sendMessage(tabId, message, { frameId: frame.frameId }).catch(error => {
          console.log(`Error sending to frame ${frame.frameId}:`, error);
        });
      });
    } else {
      console.log("No frames found in tab, trying regular send");
      // Fallback to regular sendMessage if getAllFrames fails
      browser.tabs.sendMessage(tabId, message).catch(error => {
        console.error("Error sending message to tab:", error);
      });
    }
  }).catch(error => {
    console.error("Error querying frames:", error);
    // Fallback to regular sendMessage if getAllFrames fails
    browser.tabs.sendMessage(tabId, message).catch(err => {
      console.error("Fallback error sending message to tab:", err);
    });
  });
}