import { CONFIG } from '../constants.js';
import { logger } from '../logger.js';

export class BasicUI {
    constructor(solver) {
        this.solver = solver;
        this.container = null;
        this.statusEl = null;
        this.isMinimized = false;
        this.init();
    }

    init() {
        if (!document.body) {
            window.addEventListener("DOMContentLoaded", () => this.init());
            return;
        }

        if (document.getElementById("hw-solver-overlay") && document.getElementById("hw-solver-styles")) {
            return;
        }

        const existingOverlay = document.getElementById("hw-solver-overlay");
        if (existingOverlay) existingOverlay.remove();

        const existingStyles = document.getElementById("hw-solver-styles");
        if (existingStyles) existingStyles.remove();

        const styles = `
            #hw-solver-overlay { position: fixed; bottom: 20px; right: 20px; width: 200px; background: #2c3e50; color: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; z-index: 999999; overflow: hidden; transition: all 0.3s ease; }
            #hw-solver-header { padding: 10px; background: #34495e; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
            #hw-solver-status { font-size: 14px; font-weight: bold; margin-bottom: 5px; color: #ecf0f1; }
            .hw-input-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 5px; }
            .hw-input-group label { font-size: 11px; color: #bdc3c7; }
            .hw-key-input { padding: 6px; border: 1px solid #34495e; border-radius: 4px; background: #3d566e; color: white; font-size: 12px; }
            .hw-btn { padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s; color: white; margin-bottom: 5px; }
            .hw-btn-start { background: #27ae60; }
            .hw-btn-start:hover { background: #2ecc71; }
            .hw-btn-once { background: #2980b9; }
            .hw-btn-once:hover { background: #3498db; }
            .hw-btn-stop { background: #c0392b; }
            .hw-btn-stop:hover { background: #e74c3c; }
            .hw-btn-clear { background: #7f8c8d; }
            .hw-btn-clear:hover { background: #95a5a6; }
            #hw-solver-toggle { font-size: 12px; }
            #hw-tab-bar { display: flex; background: #34495e; border-bottom: 1px solid #2c3e50; }
            .hw-tab { flex: 1; padding: 8px; text-align: center; font-size: 11px; cursor: pointer; color: #bdc3c7; transition: all 0.2s; }
            .hw-tab.active { color: white; background: #2c3e50; border-bottom: 2px solid #3498db; }
            .hw-tab-content { padding: 15px; display: none; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; }
            .hw-tab-content.active { display: flex; }
            .hw-checkbox-group { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ecf0f1; cursor: pointer; margin-top: 5px; }
            .hw-checkbox-group input { cursor: pointer; }
            .hw-footer { padding: 8px; background: #34495e; text-align: center; font-size: 10px; color: #bdc3c7; border-top: 1px solid #2c3e50; }
            .hw-footer a { color: #3498db; text-decoration: none; }
            .hw-footer a:hover { text-decoration: underline; }
            .minimized { height: 40px !important; width: 120px !important; }
            .minimized #hw-tab-bar, .minimized .hw-tab-content, .minimized .hw-footer { display: none !important; }
        `;

        const styleSheet = document.createElement("style");
        styleSheet.id = "hw-solver-styles";
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        this.container = document.createElement("div");
        this.container.id = "hw-solver-overlay";
        this.container.innerHTML = `
            <div id="hw-solver-header">
                <span>AI Solver</span>
                <span id="hw-solver-toggle">▼</span>
            </div>
            <div id="hw-tab-bar">
                <div class="hw-tab active" data-tab="solver">Solver</div>
                <div class="hw-tab" data-tab="settings">Settings</div>
            </div>
            <div id="hw-solver-content" class="hw-tab-content active">
                <div id="hw-solver-status">Status: Ready</div>
                <button class="hw-btn hw-btn-start" id="hw-start-btn">Start Auto</button>
                <button class="hw-btn hw-btn-once" id="hw-once-btn">Solve Once</button>
                <button class="hw-btn hw-btn-stop" id="hw-stop-btn">Stop</button>
                <button class="hw-btn hw-btn-clear" id="hw-clear-btn">Clear All</button>
            </div>
            <div id="hw-settings-content" class="hw-tab-content">
                <div class="hw-input-group">
                    <label>API Key</label>
                    <input type="password" class="hw-key-input hw-config-input" data-key="POLL_KEY" id="hw-api-key" placeholder="Enter key..." value="${CONFIG.POLL_KEY}">
                </div>
                <div class="hw-input-group">
                    <label>Endpoint</label>
                    <input type="text" class="hw-key-input hw-config-input" data-key="PROXY_URL" placeholder="https://..." value="${CONFIG.PROXY_URL}">
                </div>
                <div class="hw-input-group">
                    <label>Text Model</label>
                    <input type="text" class="hw-key-input hw-config-input" data-key="DEFAULT_MODEL" value="${CONFIG.DEFAULT_MODEL}">
                </div>
                <div class="hw-input-group">
                    <label>Vision Model</label>
                     <input type="text" class="hw-key-input hw-config-input" data-key="VISION_MODEL" value="${CONFIG.VISION_MODEL}">
                 </div>
                 <div class="hw-input-group">
                     <label>Idle Threshold (Cycles)</label>
                     <input type="number" class="hw-key-input hw-config-input" data-key="IDLE_THRESHOLD" placeholder="10" value="${CONFIG.IDLE_THRESHOLD}">
                 </div>
                 <div class="hw-checkbox-group">
                    <input type="checkbox" class="hw-config-check" data-key="INSTANT_MODE" id="hw-instant-check" ${CONFIG.INSTANT_MODE ? "checked" : ""}>
                    <label for="hw-instant-check">Instant Mode</label>
                </div>
                <div class="hw-checkbox-group">
                    <input type="checkbox" class="hw-config-check" data-key="THINK_BEFORE_ANSWER" id="hw-think-check" ${CONFIG.THINK_BEFORE_ANSWER ? "checked" : ""}>
                    <label for="hw-think-check">Reasoning</label>
                </div>
            </div>
            <div class="hw-footer">
                Powered by <a href="https://pollinations.ai" target="_blank">Pollinations.ai</a>
            </div>
        `;

        document.body.appendChild(this.container);
        this.statusEl = this.container.querySelector("#hw-solver-status");

        this.container.querySelectorAll(".hw-tab").forEach((tab) => {
            tab.onclick = () => {
                this.container.querySelectorAll(".hw-tab").forEach((t) => t.classList.remove("active"));
                this.container.querySelectorAll(".hw-tab-content").forEach((c) => c.classList.remove("active"));
                tab.classList.add("active");
                this.container.querySelector(`#hw-${tab.dataset.tab}-content`).classList.add("active");
            };
        });

        this.container.querySelector("#hw-solver-header").onclick = () => this.toggleMinimize();
        this.container.querySelector("#hw-start-btn").onclick = () => this.solver.start();
        this.container.querySelector("#hw-once-btn").onclick = () => this.solver.solveOnce();
        this.container.querySelector("#hw-stop-btn").onclick = () => this.solver.stop();
        this.container.querySelector("#hw-clear-btn").onclick = () => this.solver.clearAnswers();

        this.container.querySelectorAll(".hw-config-input").forEach((input) => {
            input.onchange = (e) => {
                const key = input.dataset.key;
                let value = e.target.value.trim();
                if (key === "IDLE_THRESHOLD") {
                    value = parseInt(value, 10) || 10;
                    e.target.value = value;
                }
                CONFIG[key] = value;
                const storageKey = key === "POLL_KEY" ? "HW_SOLVER_API_KEY" : `HW_SOLVER_${key}`;
                localStorage.setItem(storageKey, value);
                logger.info(`${key} updated and saved.`);
                this.updateStatus("Settings Saved", "#2ecc71");
                setTimeout(() => this.updateStatus("Ready"), 2000);
            };
        });

        this.container.querySelectorAll(".hw-config-check").forEach((check) => {
            check.onchange = (e) => {
                const key = check.dataset.key;
                const value = e.target.checked;
                CONFIG[key] = value;
                localStorage.setItem(`HW_SOLVER_${key}`, value);
                logger.info(`${key} toggled: ${value}`);
                this.updateStatus("Settings Saved", "#2ecc71");
                setTimeout(() => this.updateStatus("Ready"), 2000);
            };
        });
    }

    updateStatus(text, color = "#ecf0f1") {
        if (this.statusEl) {
            this.statusEl.innerText = `Status: ${text}`;
            this.statusEl.style.color = color;
        }
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        const content = this.container.querySelector("#hw-solver-content");
        const toggle = this.container.querySelector("#hw-solver-toggle");
        if (this.isMinimized) {
            this.container.classList.add("minimized");
            content.style.display = "none";
            toggle.innerText = "▲";
        } else {
            this.container.classList.remove("minimized");
            content.style.display = "flex";
            toggle.innerText = "▼";
        }
    }
}
