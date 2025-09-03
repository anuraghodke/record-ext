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
    
    startRecording: function() {
      console.log('Starting recording in content script...');
      this.isRecording = true;
      this.startTime = Date.now();
      this.steps = [];
      
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
      
      // Try ID
      if (element.id) {
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
      
      // Try CSS selector with better specificity
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
    
    generateCSSSelector: function(element) {
      if (element.id) {
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
      if (element.id) {
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
      if (recorder.isRecording) {
        recorder.addStep({
          type: 'navigate',
          url: url
        });
      }
    }
  }).observe(document, {subtree: true, childList: true});
  
  // Listen for messages from side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    
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
    }
  });
  
  console.log('Content script setup complete');
})();
