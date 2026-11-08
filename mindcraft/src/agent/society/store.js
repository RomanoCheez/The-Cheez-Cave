import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { createState } from './model.js';

function sleepSync(ms) {
    const buffer = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(buffer, 0, 0, ms);
}

function acquire(lock) {
    mkdirSync(path.dirname(lock), { recursive: true });
    for (let attempt = 0; attempt < 80; attempt++) {
        try {
            mkdirSync(lock);
            return;
        } catch {
            try {
                const info = statSync(lock);
                if (Date.now() - info.mtimeMs > 5000) rmSync(lock, { recursive: true, force: true });
            } catch {
                // The lock holder removed it between the failed acquire and this stat.
            }
            sleepSync(20);
        }
    }
    throw new Error(`Could not lock settlement file: ${lock}`);
}

export function settlementPath(root = process.cwd()) {
    return path.join(root, 'bots', 'settlement.json');
}

export function readSettlement(file = settlementPath()) {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8'));
}

export function updateSettlement(mutator, file = settlementPath()) {
    const lock = `${file}.lock`;
    acquire(lock);
    try {
        let state = createState(Date.now());
        if (existsSync(file)) {
            state = JSON.parse(readFileSync(file, 'utf8'));
        }
        const result = mutator(state);
        mkdirSync(path.dirname(file), { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify(state, null, 2));
        renameSync(temp, file);
        return result;
    } finally {
        rmSync(lock, { recursive: true, force: true });
    }
}
