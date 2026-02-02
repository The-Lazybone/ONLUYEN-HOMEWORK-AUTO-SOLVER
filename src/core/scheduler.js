import { CONFIG } from '../constants.js';
import { logger } from '../logger.js';

export class Scheduler {
    constructor(task, solver) {
        this.task = task;
        this.solver = solver;
        this.timer = null;
        this.active = false;
        this.failureCount = 0;
        this.idleCount = 0;
    }

    start() {
        if (this.active) return;
        this.active = true;
        this.failureCount = 0;
        this.idleCount = 0;
        logger.info("Scheduler started.");
        this._runTask(false);
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        logger.info("Scheduler stopped.");
    }

    _scheduleNext(isSuccess) {
        if (!this.active) return;

        const delay = isSuccess
            ? CONFIG.LOOP_INTERVAL_MS
            : CONFIG.LOOP_INTERVAL_MS / 2;

        this.timer = setTimeout(() => this._runTask(false), delay);
    }

    async _runTask(includeSolved = false) {
        if (!this.active) return;

        try {
            const result = await this.task(includeSolved);
            if (result === "FINISHED") {
                logger.info("Scheduler: Task reported FINISHED. Stopping.");
                this.stop();
                this.solver.overlay.updateStatus("Finished", "#27ae60");
                return;
            }

            if (result === "NO_QUESTION") {
                this.idleCount++;
                if (this.idleCount >= CONFIG.IDLE_THRESHOLD) {
                    logger.warn(`Scheduler: Idle for ${this.idleCount} cycles. Stopping due to inactivity.`);
                    this.stop();
                    this.solver.overlay.updateStatus("Finished (Timeout)", "#27ae60");
                    return;
                }
                this._scheduleNext(false);
                return;
            }

            if (result === true) {
                this.failureCount = 0;
                this.idleCount = 0;
                this._scheduleNext(true);
            } else {
                this.failureCount++;
                this.idleCount = 0;
                if (this.failureCount >= CONFIG.RETRIES) {
                    logger.warn(`Max retries reached. Skipping question.`);
                    await this.solver.skipCurrentQuestion();
                    this.failureCount = 0;
                    this._scheduleNext(true);
                } else {
                    this._scheduleNext(false);
                }
            }
        } catch (e) {
            logger.error("Scheduled task execution failed:", e);
            this._scheduleNext(false);
        }
    }
}
