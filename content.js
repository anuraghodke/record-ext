// Handles all recording logic
(function() {
  console.log('Content script starting...');
  
  // Check if recorder is active already to prevent duplicates
  if (window.recorderActive) {
    console.log('Recorder already active, skipping...');
    return;
  }
  // Mark as active
  window.recorderActive = true;
  
  const recorder = {
    steps: [],
    startTime: Date.now(),
    isRecording: false,
    typingTimeout: null,
    lastTypedText: '',
    lastUrl: null,
    lastRecordedEvent: null, // Track the last recorded event type
    
    startRecording: function() {
      console.log('Starting recording in content script...');
      this.isRecording = true;
      this.startTime = Date.now();
      this.steps = [];
      this.lastUrl = window.location.href;
      this.lastRecordedEvent = null;
      
      // Always add initial navigation step first
      this.addStep({
        type: 'navigate',
        url: window.location.href
      });
      
      // Send start message to side panel
      this.sendToSidePanel({
        type: 'RECORDING_STARTED',
        startTime: this.startTime
      });
    },
    
    stopRecording: function() {
      console.log('Stopping recording in content script...');
      this.isRecording = false;
      
      // Clear any pending typing timeout
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
      }
      
      // Send stop message with all steps
      this.sendToSidePanel({
        type: 'RECORDING_STOPPED',
        steps: this.steps
      });
    },
    
    addStep: function(step) {
      if (!this.isRecording) return;
      
      const timestamp = Date.now() - this.startTime;
      const stepWithTime = {
        t: timestamp,
        ...step
      };
      
      console.log('Content script adding step:', stepWithTime);
      
      this.steps.push(stepWithTime);
      this.lastRecordedEvent = step.type; // Track the last recorded event type
      
      // Send step to side panel
      this.sendToSidePanel({
        type: 'RECORD_STEP',
        step: stepWithTime
      });
    },
    
    sendToSidePanel: function(message) {
      // Try to send message to side panel
      chrome.runtime.sendMessage(message).catch((error) => {
        console.log('Side panel not ready yet:', error.message);
      });
    },
    
    // Capture clicks
    captureClick: function(event) {
      if (!this.isRecording) return;
      
      console.log('Click captured on:', event.target);
      const target = event.target;
      const locators = this.generateLocators(target);
      
      this.addStep({
        type: 'click',
        target: { locators }
      });
    },
    
    // Capture typing with debouncing - only record when user stops typing
    captureType: function(event) {
      if (!this.isRecording) return;
      
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.contentEditable === 'true') {
        const text = event.target.value || event.target.textContent || event.target.innerText;
        
        // Clear previous timeout
        if (this.typingTimeout) {
          clearTimeout(this.typingTimeout);
        }
        
        // Set new timeout to record typing after user stops typing for 1 second
        this.typingTimeout = setTimeout(() => {
          if (text && text.length > 0 && text !== this.lastTypedText) {
            console.log('Type captured (after delay):', text);
            this.lastTypedText = text;
            this.addStep({
              type: 'type',
              text: text
            });
          }
        }, 1000); // 1 second delay
      }
    },
    
    // Capture key presses
    captureKeyPress: function(event) {
      if (!this.isRecording) return;
      
      const specialKeys = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (specialKeys.includes(event.key)) {
        console.log('Key press captured:', event.key);
        
        // If Enter is pressed, clear typing timeout and record immediately
        if (event.key === 'Enter' && this.typingTimeout) {
          clearTimeout(this.typingTimeout);
          this.typingTimeout = null;
          
          // Get the current text and record it if different from last recorded
          const target = event.target;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
            const text = target.value || target.textContent || target.innerText;
            if (text && text.length > 0 && text !== this.lastTypedText) {
              console.log('Type captured (on Enter):', text);
              this.lastTypedText = text;
              this.addStep({
                type: 'type',
                text: text
              });
            }
          }
        }
        
        this.addStep({
          type: 'press',
          key: event.key
        });
      }
    },
    
    isDynamicId: function(id) {
      const dynamicPatterns = [
        /radix-«[^»]+»/,  // radix-«random»
        /^[a-f0-9]{8,}$/,  // long hex strings
        /^[a-zA-Z0-9]{20,}$/,  // long alphanumeric strings
        /^[a-f0-9-]{20,}$/,  // UUID-like patterns
        /^react-select/,  // React component IDs
        /^mui-/,  // Material-UI IDs
        /^chakra-/,  // Chakra UI IDs
        /^rc-/,  // React component IDs
      ];
      
      return dynamicPatterns.some(pattern => pattern.test(id));
    },

    // Generate locators for elements
    generateLocators: function(element) {
      const locators = [];
      
      // Try role and name first
      if (element.getAttribute('role')) {
        const role = element.getAttribute('role');
        const name = element.getAttribute('name') || element.getAttribute('aria-label') || element.textContent?.trim();
        if (name) {
          locators.push({
            type: 'role',
            role: role,
            name: name
          });
        }
      }
      
      if (element.getAttribute('data-testid')) {
        locators.push({
          type: 'data-testid',
          value: element.getAttribute('data-testid')
        });
      }
      
      if (element.id && !this.isDynamicId(element.id)) {
        locators.push({
          type: 'id',
          value: element.id
        });
      }
      
      // Try href for links
      if (element.tagName === 'A' && element.href) {
        const href = element.href;
        const url = new URL(href);
        const path = url.pathname;
        if (path && path !== '/') {
          locators.push({
            type: 'href',
            path: path
          });
        }
      }
      
      // Try title attribute
      if (element.title) {
        locators.push({
          type: 'title',
          value: element.title
        });
      }
      
      // Try text content for clickable elements
      if (element.textContent && element.textContent.trim()) {
        const text = element.textContent.trim();
        if (text.length > 0 && text.length < 100) {
          locators.push({
            type: 'text',
            content: text
          });
        }
      }
      
      if (this.isWebSearchButton(element)) {
        locators.push({
          type: 'web-search',
          description: 'Web search button'
        });
      }
      
      // Special handling for composer plus button
      if (this.isComposerPlusButton(element)) {
        locators.push({
          type: 'composer-plus',
          description: 'Composer plus button'
        });
      }
      
      try {
        const cssSelector = this.generateCSSSelector(element);
        if (cssSelector) {
          locators.push({
            type: 'css',
            selector: cssSelector
          });
        }
      } catch (e) {
        // Ignore CSS selector generation errors
      }
      
      // Try XPath as fallback (simplified)
      try {
        const xpath = this.generateSimpleXPath(element);
        if (xpath) {
          locators.push({
            type: 'xpath',
            path: xpath
          });
        }
      } catch (e) {
        // Ignore XPath generation errors
      }
      
      console.log('Generated locators:', locators);
      return locators;
    },
    
    // Check if element is composer plus button
    isComposerPlusButton: function(element) {
      const dataTestId = element.getAttribute('data-testid');
      const className = element.className;
      const ariaLabel = element.getAttribute('aria-label');
      
      return dataTestId === 'composer-plus-btn' ||
             className.includes('composer-btn') ||
             ariaLabel?.toLowerCase().includes('plus') ||
             ariaLabel?.toLowerCase().includes('add');
    },
    
    // Web search button detection
    isWebSearchButton: function(element) {
      const text = element.textContent?.toLowerCase() || '';
      const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
      const title = element.getAttribute('title')?.toLowerCase() || '';
      const dataTestId = element.getAttribute('data-testid')?.toLowerCase() || '';
      const role = element.getAttribute('role');
      
      // Check for web search indicators
      const isWebSearch = text.includes('web search') || 
                         text.includes('search the web') ||
                         ariaLabel.includes('web search') ||
                         ariaLabel.includes('search the web') ||
                         title.includes('web search') ||
                         title.includes('search the web') ||
                         dataTestId.includes('web-search') ||
                         dataTestId.includes('search-web') ||
                         (role === 'menuitemradio' && text.includes('web search'));
      
      // Additional check: look for specific ChatGPT web search patterns
      if (isWebSearch) {
        console.log('Web search button detected:', {
          text: text,
          ariaLabel: ariaLabel,
          title: title,
          dataTestId: dataTestId,
          role: role,
          element: element
        });
        return true;
      }
      
      return false;
    },
    
    generateCSSSelector: function(element) {
      if (element.getAttribute('data-testid')) {
        return `[data-testid="${element.getAttribute('data-testid')}"]`;
      }
      
      if (element.id && !this.isDynamicId(element.id)) {
        return `#${element.id}`;
      }
      
      let selector = element.tagName.toLowerCase();
      
      if (element.className) {
        const classes = element.className.split(' ').filter(c => c.trim() && c.length > 2);
        if (classes.length > 0) {
          const meaningfulClasses = classes.slice(0, 3);
          selector += `.${meaningfulClasses.join('.')}`;
        }
      }
      
      if (element.href) {
        selector += `[href*="${element.href.split('/').pop()}"]`;
      }
      
      if (element.title) {
        selector += `[title="${element.title}"]`;
      }
      
      return selector;
    },
    
    generateSimpleXPath: function(element) {
      if (element.getAttribute('data-testid')) {
        return `//*[@data-testid="${element.getAttribute('data-testid')}"]`;
      }
      
      if (element.id && !this.isDynamicId(element.id)) {
        return `//*[@id="${element.id}"]`;
      }
      
      let path = '';
      let current = element;
      let depth = 0;
      const maxDepth = 5;
      
      while (current && current.nodeType === Node.ELEMENT_NODE && depth < maxDepth) {
        let selector = current.tagName.toLowerCase();
        
        if (current.previousElementSibling || current.nextElementSibling) {
          let position = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === current.tagName) {
              position++;
            }
            sibling = sibling.previousElementSibling;
          }
          selector += `[${position}]`;
        }
        
        path = '/' + selector + path;
        current = current.parentNode;
        depth++;
      }
      
      return path;
    },
    
    resolveLocator: function(locators) {
      console.log('Resolving locators:', locators);
      
      for (const locator of locators) {
        try {
          const locatorType = locator.type;
          let selector = null;
          
          console.log(`Trying locator type: ${locatorType}`, locator);
          
          if (locatorType === 'web-search') {
            selector = this.findWebSearchButton();
            if (selector) {
              console.log('Found web search button:', selector);
              return selector;
            }
          }
          
          // Handle composer plus button
          if (locatorType === 'composer-plus') {
            selector = this.findComposerPlusButton();
            if (selector) {
              console.log('Found composer plus button:', selector);
              return selector;
            }
          }
          
          // Handle data-testid (most reliable)
          if (locatorType === 'data-testid') {
            const testId = locator.value;
            if (testId) {
              selector = `[data-testid="${testId}"]`;
              if (document.querySelector(selector)) {
                console.log('Found element by data-testid:', selector);
                return selector;
              }
            }
          }
          
          // Handle standard locators
          if (locatorType === 'role') {
            const role = locator.role;
            const name = locator.name;
            if (role && name) {
              // Try exact match first
              selector = `[role="${role}"][name="${name}"]`;
              if (document.querySelector(selector)) {
                console.log('Found element by role (name):', selector);
                return selector;
              }
              // Try with aria-label as fallback
              selector = `[role="${role}"][aria-label="${name}"]`;
              if (document.querySelector(selector)) {
                console.log('Found element by role (aria-label):', selector);
                return selector;
              }
              // Try with text content as fallback
              selector = `[role="${role}"]`;
              const roleElements = document.querySelectorAll(selector);
              for (const element of roleElements) {
                if (element.textContent?.trim() === name || element.getAttribute('aria-label') === name) {
                  console.log('Found element by role (text/aria-label):', element);
                  return element;
                }
              }
            }
          } else if (locatorType === 'id') {
            const elementId = locator.value;
            if (elementId) {
              selector = `#${elementId}`;
              if (document.querySelector(selector)) {
                console.log('Found element by ID:', selector);
                return selector;
              }
            }
          } else if (locatorType === 'href') {
            const hrefPath = locator.path;
            if (hrefPath) {
              selector = `a[href*="${hrefPath}"]`;
              if (document.querySelector(selector)) {
                console.log('Found element by href:', selector);
                return selector;
              }
            }
          } else if (locatorType === 'title') {
            const title = locator.value;
            if (title) {
              selector = `[title="${title}"]`;
              if (document.querySelector(selector)) {
                console.log('Found element by title:', selector);
                return selector;
              }
            }
          } else if (locatorType === 'text') {
            const text = locator.content;
            if (text) {
              // Try to find element containing exact text
              const elements = document.querySelectorAll('*');
              for (const element of elements) {
                if (element.textContent && element.textContent.trim() === text) {
                  console.log('Found element by text:', element);
                  return element;
                }
              }
            }
          } else if (locatorType === 'css') {
            const cssSelector = locator.selector;
            if (cssSelector && document.querySelector(cssSelector)) {
              console.log('Found element by CSS:', cssSelector);
              return cssSelector;
            }
          } else if (locatorType === 'xpath') {
            const xpath = locator.path;
            if (xpath) {
              try {
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                if (result.singleNodeValue) {
                  console.log('Found element by XPath:', result.singleNodeValue);
                  return result.singleNodeValue;
                }
              } catch (e) {
                console.warn('XPath evaluation failed:', e);
              }
            }
          }
        } catch (e) {
          console.warn('Locator resolution failed for:', locator, e);
          continue;
        }
      }
      
      console.log('No locator resolved successfully');
      return null;
    },
    
    findComposerPlusButton: function() {
      console.log('Searching for composer plus button...');
      
      const testIdSelector = '[data-testid="composer-plus-btn"]';
      const element = document.querySelector(testIdSelector);
      if (element) {
        console.log('Found composer plus button by data-testid:', element);
        return element;
      }
      
      const classSelector = 'button.composer-btn';
      const classElement = document.querySelector(classSelector);
      if (classElement) {
        console.log('Found composer plus button by class:', classElement);
        return classElement;
      }
      
      const ariaSelector = 'button[aria-haspopup="menu"]';
      const ariaElement = document.querySelector(ariaSelector);
      if (ariaElement) {
        console.log('Found composer plus button by aria-haspopup:', ariaElement);
        return ariaElement;
      }
      
      console.log('No composer plus button found');
      return null;
    },
    
    findWebSearchButton: function() {
      console.log('Searching for web search button...');
      
      const currentChatWebSearchToggle = this.findCurrentChatWebSearchToggle();
      if (currentChatWebSearchToggle) {
        console.log('Found current chat web search toggle:', currentChatWebSearchToggle);
        return currentChatWebSearchToggle;
      }
      
      const specificSelectors = [
        'button[data-testid*="web-search"]',
        'button[data-testid*="search-web"]',
        'button[aria-label*="Web search"]',
        'button[title*="Web search"]',
        'button[aria-label*="Search the web"]',
        'button[title*="Search the web"]',
        'button[aria-label*="web search"]',
        'button[title*="web search"]',
        'button[aria-label*="search the web"]',
        'button[title*="search the web"]',
        'button[data-testid="web-search-toggle"]',
        'button[data-testid="search-toggle"]'
      ];
      
      for (const selector of specificSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          console.log('Found web search button with selector:', selector, element);
          return element;
        }
      }
      
      const menuItems = document.querySelectorAll('[role="menuitemradio"]');
      for (const item of menuItems) {
        const text = item.textContent?.toLowerCase() || '';
        if (text.includes('web search')) {
          console.log('Found web search menuitemradio:', item);
          return item;
        }
      }
      
      const buttons = document.querySelectorAll('button');
      console.log(`Checking ${buttons.length} buttons for web search text...`);
      for (const button of buttons) {
        const text = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        const title = button.getAttribute('title')?.toLowerCase() || '';
        const dataTestId = button.getAttribute('data-testid')?.toLowerCase() || '';
        
        if (text.includes('web search') || text.includes('search the web') ||
            ariaLabel.includes('web search') || ariaLabel.includes('search the web') ||
            title.includes('web search') || title.includes('search the web') ||
            dataTestId.includes('web-search') || dataTestId.includes('search-web')) {
          
          console.log('Found web search button by text/attributes:', {
            text: text,
            ariaLabel: ariaLabel,
            title: title,
            dataTestId: dataTestId,
            element: button
          });
          return button;
        }
      }
      
      const toggleButtons = document.querySelectorAll('button[data-testid*="toggle"], button[aria-label*="toggle"]');
      for (const button of toggleButtons) {
        const parent = button.closest('[class*="search"], [class*="web"], [class*="toggle"]');
        if (parent) {
          console.log('Found potential web search toggle button:', button);
          return button;
        }
      }
      
      console.log('No web search button found');
      return null;
    },
    
    findCurrentChatWebSearchToggle: function() {
      console.log('Looking for current chat web search toggle...');
      
      const toggleSelectors = [
        'button[data-testid*="web-search-toggle"]',
        'button[data-testid*="search-toggle"]',
        'button[aria-label*="Web search"]',
        'button[title*="Web search"]',
        'button[aria-label*="Search the web"]',
        'button[title*="Search the web"]'
      ];
      
      for (const selector of toggleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log('Found visible web search toggle:', element);
            return element;
          }
        }
      }
      
      const allButtons = document.querySelectorAll('button');
      for (const button of allButtons) {
        const text = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        const title = button.getAttribute('title')?.toLowerCase() || '';
        const dataTestId = button.getAttribute('data-testid')?.toLowerCase() || '';
        
        // Check if it's a web search toggle
        if ((text.includes('web search') || text.includes('search the web') ||
             ariaLabel.includes('web search') || ariaLabel.includes('search the web') ||
             title.includes('web search') || title.includes('search the web') ||
             dataTestId.includes('web-search') || dataTestId.includes('search-web')) &&
            button.offsetParent !== null) { // Check if visible
          
          console.log('Found visible web search toggle button:', button);
          return button;
        }
      }
      
      console.log('No current chat web search toggle found');
      return null;
    },
    
    executeReplayClick: function(selector) {
      try {
        console.log('Attempting to click selector:', selector);
        
        const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (element) {
          console.log('Clicking element:', element);
          console.log('Element details:', {
            tagName: element.tagName,
            textContent: element.textContent,
            ariaLabel: element.getAttribute('aria-label'),
            title: element.getAttribute('title'),
            dataTestId: element.getAttribute('data-testid'),
            className: element.className
          });
          
          // Try multiple click methods
          element.click();
          
          // Try dispatching click event
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          element.dispatchEvent(clickEvent);
          
          console.log('Click executed successfully');
          return true;
        } else {
          console.error('Element not found for selector:', selector);
          return false;
        }
      } catch (e) {
        console.error('Replay click failed:', e);
        return false;
      }
    },
    
    // Typing with character-by-character animation
    executeReplayType: function(text) {
      return new Promise((resolve) => {
        try {
          console.log('Starting typing animation for:', text);
          
          let inputElement = document.activeElement;
          
          if (!inputElement || (inputElement.tagName !== 'INPUT' && inputElement.tagName !== 'TEXTAREA' && inputElement.contentEditable !== 'true')) {
            const inputSelectors = [
              'textarea[placeholder*="Message"]',
              'textarea[placeholder*="Send"]',
              'input[type="text"]',
              'textarea',
              'div[contenteditable="true"]'
            ];
            
            for (const selector of inputSelectors) {
              const element = document.querySelector(selector);
              if (element) {
                inputElement = element;
                break;
              }
            }
          }
          
          console.log('Input element found:', inputElement);
          
          if (inputElement && (inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA' || inputElement.contentEditable === 'true')) {
            // Clear existing content
            if (inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA') {
              inputElement.value = '';
            } else {
              inputElement.textContent = '';
            }
            
            inputElement.focus();
            
            console.log('Starting character-by-character typing...');
            
            // Type character by character
            this.typeCharacterByCharacter(inputElement, text, 0, resolve);
          } else {
            console.error('No suitable element found for typing');
            resolve(false);
          }
        } catch (e) {
          console.error('Replay type failed:', e);
          resolve(false);
        }
      });
    },
    
    // Type character by character (realistic timing)
    typeCharacterByCharacter: function(element, text, index, callback) {
      if (index >= text.length) {
        console.log('Typing animation completed:', text);
        callback(true);
        return;
      }
      
      const char = text[index];
      console.log(`Typing character ${index + 1}/${text.length}: "${char}"`);
      
      // Add the character
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value += char;
        // Trigger input event
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        element.textContent += char;
        // Trigger input event
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      let delay = 50; 
      
      if (char === ' ') {
        delay = 100; 
      } else if (char === '.' || char === ',' || char === '!' || char === '?') {
        delay = 200;
      } else if (char === '\n') {
        delay = 150; 
      }
      
      delay += Math.random() * 30;
      
      setTimeout(() => {
        this.typeCharacterByCharacter(element, text, index + 1, callback);
      }, delay);
    },
    
    executeReplayKeyPress: function(key) {
      try {
        console.log('Executing key press:', key);
        
        let targetElement = document.activeElement;
        
        if (targetElement) {
          const event = new KeyboardEvent('keydown', {
            key: key,
            code: key,
            bubbles: true,
            cancelable: true
          });
          targetElement.dispatchEvent(event);
          console.log('Key press executed successfully:', key);
          return true;
        } else {
          console.error('No active element for key press');
          return false;
        }
      } catch (e) {
        console.error('Replay key press failed:', e);
        return false;
      }
    }
  };
  
  console.log('Setting up event listeners...');
  
  // Add event listeners
  document.addEventListener('click', recorder.captureClick.bind(recorder), false);
  document.addEventListener('input', recorder.captureType.bind(recorder), false);
  document.addEventListener('keydown', recorder.captureKeyPress.bind(recorder), false);
  
  // Store recorder reference globally
  window.recorder = recorder;
  
  // Listen for navigation changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('Navigation detected:', url);
      
      const isChatGPT = url.includes('chatgpt.com') || url.includes('openai.com');
      const isSameChat = isChatGPT && recorder.lastUrl && 
                        recorder.lastUrl.includes('chatgpt.com') && 
                        url.split('/c/')[1] === recorder.lastUrl.split('/c/')[1];
      
      // Check if the last recorded event was an Enter key press
      const lastEventWasEnter = recorder.lastRecordedEvent === 'press';
      
      // Prevent recording ChatGPT navigation if:
      // 1. We're on ChatGPT and it's the same chat, OR
      // 2. We're on ChatGPT and the last event was Enter (new chat creation)
      if (recorder.isRecording && isChatGPT && (isSameChat || lastEventWasEnter)) {
        console.log('Skipping ChatGPT navigation - same chat or after Enter key');
        recorder.lastUrl = url;
        return;
      }
      
      if (recorder.isRecording && !isSameChat) {
        recorder.addStep({
          type: 'navigate',
          url: url
        });
        recorder.lastUrl = url;
      } else if (isSameChat) {
        console.log('Same ChatGPT chat detected, skipping navigation step');
        recorder.lastUrl = url;
      }
    }
  }).observe(document, {subtree: true, childList: true});
  
  // Listen for messages from side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    
    try {
      switch (message.type) {
        case 'START_RECORDING':
          recorder.startRecording();
          sendResponse({success: true});
          break;
        case 'STOP_RECORDING':
          recorder.stopRecording();
          sendResponse({success: true});
          break;
        case 'GET_STEPS':
          sendResponse({steps: recorder.steps});
          break;
        case 'RESOLVE_LOCATOR':
          const selector = recorder.resolveLocator(message.locators);
          chrome.runtime.sendMessage({
            type: 'LOCATOR_RESOLVED',
            messageId: message.messageId,
            selector: selector
          }).catch(error => {
            console.error('Failed to send locator response:', error);
          });
          sendResponse({success: true});
          break;
        case 'REPLAY_CLICK':
          const clickSuccess = recorder.executeReplayClick(message.selector);
          sendResponse({success: clickSuccess});
          break;
        case 'REPLAY_TYPE':
          recorder.executeReplayType(message.text).then((success) => {
            sendResponse({success: success});
          });
          return true; 
        case 'REPLAY_KEY_PRESS':
          const keySuccess = recorder.executeReplayKeyPress(message.key);
          sendResponse({success: keySuccess});
          break;
        default:
          console.warn('Unknown message type:', message.type);
          sendResponse({success: false, error: 'Unknown message type'});
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({success: false, error: error.message});
    }
  });
  
  console.log('Content script setup complete');
})();
