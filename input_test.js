(function() {
    'use strict';

    function testInputInteraction() {
        const inputElement = document.getElementById('mathplay-answer-1');

        if (!inputElement) {
            console.error('Input element with ID "mathplay-answer-1" not found.');
            return;
        }

        console.log('Attempting to interact with input element:', inputElement);

        try {
            // Attempt to focus and click
            inputElement.focus();
            inputElement.click();
            console.log('Input element focused and clicked.');

            // Simulate pasting text
            const testText = 'TEST_PASTE';
            inputElement.value = testText;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            inputElement.blur();
            console.log(`Input value set to "${testText}" and events dispatched.`);

            if (inputElement.value === testText) {
                console.log('SUCCESS: Input element value was set correctly.');
            } else {
                console.error('FAILURE: Input element value was NOT set correctly.');
            }

            // Check if it's disabled or read-only
            if (inputElement.disabled) {
                console.warn('WARNING: Input element is disabled.');
            }
            if (inputElement.readOnly) {
                console.warn('WARNING: Input element is read-only.');
            }
            const pointerEvents = window.getComputedStyle(inputElement).getPropertyValue('pointer-events');
            if (pointerEvents === 'none') {
                console.warn('WARNING: Input element has pointer-events: none CSS property.');
            }

        } catch (e) {
            console.error('An error occurred during input interaction test:', e);
        }
    }

    // Expose the function to the window for manual execution
    window.testInputInteraction = testInputInteraction;

    // Function to test submission button detection
    function testSubmitButton() {
        console.log('Test: Attempting to find submit button...');

        // Simulate the clickSubmit logic from solver.js
        const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).filter(b => !b.disabled);
        const selectors = [
            b => (b.innerText || b.value || '').trim() === 'Trả lời',
            b => b.matches('button.btn.btn-lg.btn-block.ripple.btn-primary'),
            b => b.matches('button.btn-primary'),
            b => /trả lời|tra loi/i.test(b.innerText || b.value || ''),
            b => (b.innerText || b.value || '').trim() === 'Bỏ qua' || b.matches('button.btn-gray'), // Added for "Bỏ qua" button
            // Add more common selectors
            b => (b.innerText || b.value || '').trim() === 'Submit',
            b => (b.innerText || b.value || '').trim() === 'Check Answer',
            b => /submit/i.test(b.innerText || b.value || ''),
            b => b.matches('input[type="submit"]'),
        ];

        for (const selector of selectors) {
            const button = candidates.find(selector);
            if (button) {
                console.log('SUCCESS: Submit button found:', button);
                console.log({
                    text: button.innerText || button.value,
                    id: button.id,
                    className: button.className,
                    type: button.type,
                    disabled: button.disabled
                });
                return button;
            }
        }
        console.error('FAILURE: No submit button found with the given selectors.');
        console.log('Available buttons on page:');
        candidates.forEach((b, index) => {
            console.log(`${index + 1}.`, {
                text: b.innerText || b.value,
                id: b.id,
                className: b.className,
                type: b.type,
                disabled: b.disabled
            });
        });
        return null;
    }

    // Function to simulate clicking a submit button
    function simulateSubmitClick(shouldClick = true) {
        const button = testSubmitButton();
        if (!button) {
            console.error('No submit button found to click.');
            return false;
        }

        console.log('Submit button found. Simulating click (shouldClick:', shouldClick + '): ' + button.innerText);
        if (!shouldClick) {
            console.log('Skipping actual click to preserve input fields.');
            return true;
        }

        try {
            // Simulate click using the same technique as solver.js
            if (button.scrollIntoView) {
                button.scrollIntoView({ block: 'center', inline: 'center' });
            }
            if (button.focus) {
                button.focus();
            }
            button.click();
            button.dispatchEvent(new Event('input', { bubbles: true }));
            button.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('SUCCESS: Submit button clicked.');
            return true;
        } catch (e) {
            console.error('FAILURE: Error clicking submit button:', e);
            return false;
        }
    }

    // Expose the functions to the window for manual execution
    window.testSubmitButton = testSubmitButton;
    window.simulateSubmitClick = simulateSubmitClick;

    // Test improved typing simulation like the updated solver.js
    function testImprovedTyping(testText = '573', instantMode = false) {
        const inputElement = document.getElementById('mathplay-answer-1');

        if (!inputElement) {
            console.error('Input element with ID "mathplay-answer-1" not found.');
            return;
        }

        console.log('Test: Improved typing simulation for text:', testText, 'instant mode:', instantMode);

        // Simulate mouse hover before typing
        inputElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }));
        inputElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, composed: true }));

        inputElement.focus();
        inputElement.value = ''; // Clear existing value

        // Always type char-by-char, but with different delays for instant mode
        const minDelay = instantMode ? 0 : 2000;
        const maxDelay = instantMode ? 50 : 5000;

        // Use recursive setTimeout for random delays
        let i = 0;
        const typeNextChar = () => {
            if (i >= testText.length) {
                // Dispatch final events
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));

                // Small delay before blurring
                setTimeout(() => inputElement.blur(), 100);

                console.log('Simulated typing completed.');
                return;
            }

            const char = testText[i];
            const charCode = char.charCodeAt(0);
            const keyCode = charCode < 32 ? 0 : charCode; // Handle non-printable chars

            // Simulate full key sequence
            inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: char, keyCode: keyCode, charCode: charCode, bubbles: true, composed: true }));
            inputElement.dispatchEvent(new KeyboardEvent('keypress', { key: char, keyCode: keyCode, charCode: charCode, bubbles: true, composed: true }));

            inputElement.value += char;
            inputElement.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true, composed: true }));

            inputElement.dispatchEvent(new KeyboardEvent('keyup', { key: char, keyCode: keyCode, charCode: charCode, bubbles: true, composed: true }));

            i++;

            // Schedule next char with random delay
            const delay = minDelay + Math.random() * (maxDelay - minDelay);
            setTimeout(typeNextChar, delay);
        };

        typeNextChar();

        console.log('Started improved typing simulation.');
    }

    // Expose the functions to the window for manual execution
    window.testImprovedTyping = testImprovedTyping;

    console.log("input_test.js loaded. Functions available:");
    console.log("- window.testInputInteraction(): Test basic input field interaction");
    console.log("- window.testSubmitButton(): Find and log submit button");
    console.log("- window.simulateSubmitClick(true): Find submit button and simulate a click (default)");
    console.log("- window.simulateSubmitClick(false): Find submit button without clicking (to preserve input)");
    console.log("- window.testImprovedTyping('text', false): Test improved typing simulation with optional instant mode");
})();
