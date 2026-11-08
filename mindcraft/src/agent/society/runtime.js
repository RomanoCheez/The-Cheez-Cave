import settings from '../settings.js';
import { SOCIETY_INIT_MESSAGE } from './message.js';
import {
    advance,
    decide,
    enforce,
    formatBrief,
    formatRouteInstruction,
    noteBuild,
    noteDeposit,
    noteGather,
    noteGift,
    noteHarm,
    noteHunt,
    noteTalk,
    noteWithdraw,
    proposeLaw,
    recordDeed,
    registerCitizen,
    rememberPlace,
    setRole,
    touch,
    vote,
} from './model.js';
import { readSettlement, updateSettlement } from './store.js';

export { SOCIETY_INIT_MESSAGE };

function enabled() {
    return settings.society === true;
}

function citizenNow(agent) {
    return { name: agent.name, now: Date.now(), role: agent.prompter?.profile?.society_role || '' };
}

function contextFor(agent, now) {
    const turns = agent.history?.getHistory?.() || [];
    const last = [...turns].reverse().find(turn => turn.role === 'system');
    return {
        now,
        food: agent.bot?.food ?? null,
        timeOfDay: agent.bot?.time?.timeOfDay ?? null,
        huntingOn: Boolean(agent.bot?.modes?.isOn?.('hunting')),
        lastOutcome: last?.content || '',
        preferredRole: agent.prompter?.profile?.society_role || '',
    };
}

function withCitizen(agent, fn) {
    const { name, now, role } = citizenNow(agent);
    return updateSettlement(state => {
        registerCitizen(state, name, now);
        if (role && !state.citizens[name].role) setRole(state, name, role, now);
        const result = fn(state, now);
        advance(state, now);
        return result;
    });
}

export function bootSociety(agent) {
    if (!enabled()) return;
    const { name, now, role } = citizenNow(agent);
    updateSettlement(state => {
        registerCitizen(state, name, now);
        if (role && !state.citizens[name].role) setRole(state, name, role, now);
        for (const [place, pos] of Object.entries(state.places)) {
            if (!agent.memory_bank?.recallPlace(place)) {
                agent.memory_bank?.rememberPlace(place, pos.x, pos.y, pos.z);
            }
        }
        advance(state, now);
        return state.stage;
    });
}

export function sharePlace(agent, place, x, y, z) {
    if (!enabled()) return null;
    return withCitizen(agent, (state, now) => rememberPlace(state, place, x, y, z, agent.name, now));
}

export function recallSharedPlace(place) {
    if (!enabled()) return null;
    const state = readSettlement();
    const found = state?.places?.[String(place || '').trim().toLowerCase()];
    if (!found) return null;
    return [found.x, found.y, found.z];
}

export function guardAction(agent, action) {
    if (!enabled()) return null;
    return withCitizen(agent, (state, now) => {
        const result = enforce(state, agent.name, action, now);
        return result.refused ? result.message : null;
    });
}

export function recordEvent(agent, kind, detail, extra = {}) {
    if (!enabled()) return;
    withCitizen(agent, (state, now) => {
        if (kind === 'deposit') noteDeposit(state, agent.name, detail.item, detail.num, now);
        else if (kind === 'gather') noteGather(state, agent.name, detail, now);
        else if (kind === 'withdraw') noteWithdraw(state, agent.name, detail.item, detail.num, now);
        else if (kind === 'gift') noteGift(state, agent.name, extra.target, detail.item, detail.num, now);
        else if (kind === 'harm') noteHarm(state, agent.name, extra.target, detail, now);
        else if (kind === 'hunt') noteHunt(state, agent.name, detail, now);
        else if (kind === 'build') noteBuild(state, agent.name, detail, now);
        else if (kind === 'talk') noteTalk(state, agent.name, extra.target, now);
        return true;
    });
}

export function routeForAgent(agent) {
    const { name, now, role } = citizenNow(agent);
    const ctx = contextFor(agent, now);
    return updateSettlement(state => {
        registerCitizen(state, name, now);
        if (role && !state.citizens[name].role) setRole(state, name, role, now);
        touch(state, name, ctx);
        advance(state, now);
        return formatRouteInstruction(decide(state, name, ctx));
    });
}

export function briefForAgent(agent) {
    if (!enabled()) return '';
    const state = readSettlement();
    if (!state) return 'SETTLEMENT: no roll yet. The first action should be !rememberHere("town_square").';
    const now = Date.now();
    return formatBrief(state, agent.name, contextFor(agent, now));
}

export function settlementSummary(name) {
    const state = readSettlement();
    if (!state?.citizens?.[name]) return null;
    const me = state.citizens[name];
    return {
        stage: state.stage,
        role: me.role,
        reputation: me.reputation,
        violations: me.violations,
        enacted: state.laws.filter(law => law.status === 'enacted').map(law => law.id),
        open: state.laws.filter(law => law.status === 'proposed').map(law => law.id),
    };
}

export function runSocietyCommand(agent, fn) {
    return withCitizen(agent, (state, now) => {
        const result = fn(state, now);
        return result.message;
    });
}

export const societyActions = {
    setRole: (state, name, role, now) => setRole(state, name, role, now),
    recordDeed: (state, name, kind, detail, now) => recordDeed(state, name, kind, detail, now),
    proposeLaw: (state, name, text, kind, param, now) => proposeLaw(state, name, text, kind, param, now),
    vote: (state, name, lawId, choice, now) => vote(state, name, lawId, choice, now),
    brief: (state, name, now) => ({ message: formatBrief(state, name, { now }) }),
    route: (state, name, now, ctx) => ({ message: formatRouteInstruction(decide(state, name, { ...ctx, now })) }),
};
