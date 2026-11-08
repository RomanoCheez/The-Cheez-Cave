// Shared settlement state. Pure functions: no files, no Minecraft.
// A settlement moves forward only: band → camp → customs → commonwealth → order.

const STAGES = ['band', 'camp', 'customs', 'commonwealth', 'order'];

const MATERIAL_DEEDS = new Set(['gather', 'deposit', 'hunt', 'craft', 'build', 'rest']);

const FOOD = new Set([
    'bread', 'apple', 'carrot', 'potato', 'baked_potato', 'beetroot', 'cookie',
    'pumpkin_pie', 'mushroom_stew', 'rabbit_stew', 'beetroot_soup', 'dried_kelp',
    'sweet_berries', 'glow_berries', 'melon_slice', 'honey_bottle', 'golden_carrot',
]);

const PREY = new Set([
    'cow', 'pig', 'sheep', 'chicken', 'rabbit', 'mooshroom', 'hoglin', 'salmon', 'cod',
]);

const ORES = new Set([
    'coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'diamond_ore', 'emerald_ore',
    'lapis_ore', 'redstone_ore', 'nether_gold_ore', 'nether_quartz_ore', 'ancient_debris',
    'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_copper_ore', 'deepslate_gold_ore',
    'deepslate_diamond_ore', 'deepslate_emerald_ore', 'deepslate_lapis_ore', 'deepslate_redstone_ore',
]);

const LAW_KINDS = new Set([
    'no_pvp', 'share_food', 'role_monopoly', 'curfew', 'custom', 'repeal', 'restitution',
]);

const DEED_KINDS = new Set([
    'deposit', 'withdraw', 'gift', 'hunt', 'craft', 'gather', 'build', 'talk', 'apology', 'harm', 'rest', 'custom',
]);

function clamp(n) {
    return Math.max(0, Math.min(1, n));
}

function stageAtLeast(state, stage) {
    return STAGES.indexOf(state.stage) >= STAGES.indexOf(stage);
}

function cleanText(text, max = 160) {
    return String(text || '').replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function placeKey(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
}

function roleKey(role) {
    return String(role || '').trim().toLowerCase().replace(/[^a-z_]/g, '').slice(0, 16);
}

function edgeKey(from, to) {
    return `${from}>${to}`;
}

function citizens(state) {
    return Object.keys(state.citizens);
}

function latestEnacted(state, kind) {
    const found = state.laws.filter(law => law.status === 'enacted' && law.kind === kind);
    return found.length ? found[found.length - 1] : null;
}

function lawKey(kind, param) {
    if (kind === 'role_monopoly') return `${kind}:${String(param || '').split(':')[0]}`;
    if (kind === 'restitution' || kind === 'repeal') return `${kind}:${param || ''}`;
    return kind;
}

function pushDeed(state, actor, kind, detail, now) {
    state.deeds.push({
        at: now,
        actor,
        kind,
        detail: cleanText(detail, 120),
    });
    if (state.deeds.length > 80) state.deeds.splice(0, state.deeds.length - 80);
    const citizen = state.citizens[actor];
    if (citizen) {
        citizen.last_deed = now;
        citizen.drives.duty = clamp(citizen.drives.duty - 0.08);
    }
}

function ensureCitizen(state, name, now) {
    if (!name) return null;
    if (!state.citizens[name]) {
        state.citizens[name] = {
            role: '',
            reputation: 0,
            violations: 0,
            drives: { hunger: 0.25, duty: 0.35, belonging: 0.6, grievance: 0 },
            last_seen: now,
            last_talked: now,
            last_deed: now,
        };
    }
    return state.citizens[name];
}

function adjustTrust(state, from, to, delta, field) {
    if (!state.citizens[from] || !state.citizens[to] || from === to) return;
    const key = edgeKey(from, to);
    if (!state.relations[key]) state.relations[key] = { trust: 0, gifts: 0, harms: 0 };
    const edge = state.relations[key];
    edge.trust = Math.max(-1, Math.min(1, edge.trust + delta));
    if (field) edge[field] += 1;
}

export function getTrust(state, from, to) {
    return state.relations[edgeKey(from, to)]?.trust || 0;
}

export function createState(now = 0) {
    return {
        version: 1,
        stage: 'band',
        stage_since: now,
        places: {},
        citizens: {},
        relations: {},
        deeds: [],
        laws: [],
        violations: [],
        next_law_id: 1,
    };
}

export function advance(state, now) {
    for (let i = 0; i < STAGES.length; i++) {
        const next = nextStage(state);
        if (next === state.stage) break;
        state.stage = next;
        state.stage_since = now;
    }
    return state.stage;
}

function nextStage(state) {
    const names = citizens(state);
    const hasSquare = Boolean(state.places.town_square || state.places.town_chest);
    const allRoles = names.length >= 2 && names.every(name => state.citizens[name].role);
    const material = state.deeds.filter(deed => MATERIAL_DEEDS.has(deed.kind)).length;
    const proposals = state.laws.length;
    const enacted = state.laws.some(law => law.status === 'enacted');
    if (state.stage === 'band' && names.length >= 2 && hasSquare) return 'camp';
    if (state.stage === 'camp' && allRoles && material >= 3) return 'customs';
    if (state.stage === 'customs' && proposals >= 1) return 'commonwealth';
    if (state.stage === 'commonwealth' && enacted) return 'order';
    return state.stage;
}

export function gateHint(state) {
    const names = citizens(state);
    if (state.stage === 'band') {
        return `Need 2 citizens and a shared town_square. Citizens: ${names.join(', ') || 'none'}.`;
    }
    if (state.stage === 'camp') {
        const missing = names.filter(name => !state.citizens[name].role);
        const material = state.deeds.filter(deed => MATERIAL_DEEDS.has(deed.kind)).length;
        return `Need a role for everyone and 3 material deeds (${material}/3). Missing roles: ${missing.join(', ') || 'none'}.`;
    }
    if (state.stage === 'customs') return 'A citizen must !proposeLaw before votes can bind.';
    if (state.stage === 'commonwealth') return 'A proposed law still needs a strict majority, at least 2 yes votes.';
    return 'Enacted laws bind commands. Repeat violations become restitution proposals.';
}

export function registerCitizen(state, name, now) {
    ensureCitizen(state, name, now);
    advance(state, now);
    return state.citizens[name];
}

export function setRole(state, name, role, now) {
    const citizen = ensureCitizen(state, name, now);
    const clean = roleKey(role);
    if (!clean || clean.length < 3) {
        return { ok: false, message: 'Role must be at least 3 letters, such as hunter, miner, forester, or builder.' };
    }
    citizen.role = clean;
    advance(state, now);
    return { ok: true, message: `${name} is now the ${clean}. Stage: ${state.stage}. ${gateHint(state)}` };
}

export function rememberPlace(state, place, x, y, z, by, now) {
    const key = placeKey(place);
    if (!key) return { ok: false, message: 'Place name is empty.' };
    ensureCitizen(state, by, now);
    state.places[key] = {
        x: Math.round(Number(x)),
        y: Math.round(Number(y)),
        z: Math.round(Number(z)),
        by,
        at: now,
    };
    advance(state, now);
    return { ok: true, message: `Shared place ${key} saved at ${state.places[key].x} ${state.places[key].y} ${state.places[key].z}. Stage: ${state.stage}.` };
}

export function recordDeed(state, actor, kind, detail, now) {
    ensureCitizen(state, actor, now);
    const cleanKind = String(kind || '').toLowerCase();
    if (!DEED_KINDS.has(cleanKind)) {
        return { ok: false, message: `Deed kind must be one of: ${[...DEED_KINDS].join(', ')}.` };
    }
    const text = cleanText(detail, 120);
    if (!text) return { ok: false, message: 'Deed detail is empty.' };
    if (cleanKind === 'apology') {
        const citizen = state.citizens[actor];
        citizen.violations = Math.max(0, citizen.violations - 1);
        citizen.reputation += 1;
        citizen.drives.grievance = clamp(citizen.drives.grievance - 0.2);
    }
    pushDeed(state, actor, cleanKind, text, now);
    advance(state, now);
    return { ok: true, message: `Deed recorded (${cleanKind}). Stage: ${state.stage}. ${gateHint(state)}` };
}

function validateLaw(state, kind, param, text) {
    if (!LAW_KINDS.has(kind)) return `Unknown law kind ${kind}.`;
    if (!text) return 'Law text is empty.';
    if (kind === 'role_monopoly' && !/^(hunting|mining):[a-z_]{3,16}$/.test(param || '')) {
        return 'role_monopoly param must look like hunting:hunter or mining:miner.';
    }
    if (kind === 'curfew' && param && !/^\d{1,5}$/.test(param)) return 'curfew param must be a tick number, or empty for 13000.';
    if (kind === 'repeal') {
        const target = state.laws.find(law => law.id === param);
        if (!target || target.status !== 'enacted') return `Cannot repeal ${param}. It must be an enacted law id.`;
    }
    if (kind === 'restitution' && !state.citizens[param]) return `${param} is not on the roll.`;
    if (kind === 'share_food' && param && !/^[a-z_]{3,16}$/.test(param)) return 'share_food param must be a role name or empty.';
    const key = lawKey(kind, param);
    const clash = state.laws.find(law => (law.status === 'proposed' || law.status === 'enacted') && lawKey(law.kind, law.param) === key);
    if (clash) return `${clash.id} already covers ${key} (${clash.status}).`;
    return '';
}

function tally(state, law, now) {
    if (law.status !== 'proposed') return;
    if (!stageAtLeast(state, 'commonwealth')) return;
    const names = citizens(state);
    const yes = names.filter(name => law.votes[name] === 'yes').length;
    const no = names.filter(name => law.votes[name] === 'no').length;
    if (yes >= 2 && yes * 2 > names.length) {
        law.status = 'enacted';
        law.enacted_at = now;
        if (law.kind === 'repeal') {
            const target = state.laws.find(item => item.id === law.param);
            if (target && target.status === 'enacted') {
                target.status = 'repealed';
                target.resolved_at = now;
            }
        }
        return;
    }
    if (yes + no === names.length && yes * 2 <= names.length) {
        law.status = 'rejected';
        law.resolved_at = now;
    }
}

export function proposeLaw(state, proposer, text, kind, param, now) {
    ensureCitizen(state, proposer, now);
    if (!stageAtLeast(state, 'customs')) {
        return { ok: false, message: `The settlement is a ${state.stage}. Laws wait until customs. ${gateHint(state)}` };
    }
    const cleanKind = String(kind || '').toLowerCase();
    const cleanParam = String(param || '').trim();
    const clean = cleanText(text);
    const error = validateLaw(state, cleanKind, cleanParam, clean);
    if (error) return { ok: false, message: error };
    const law = {
        id: `law-${state.next_law_id++}`,
        text: clean,
        kind: cleanKind,
        param: cleanParam,
        status: 'proposed',
        proposer,
        votes: { [proposer]: 'yes' },
        created_at: now,
        enacted_at: null,
        resolved_at: null,
    };
    state.laws.push(law);
    tally(state, law, now);
    advance(state, now);
    return { ok: true, message: `${law.id} proposed (${law.kind}). Status: ${law.status}. Stage: ${state.stage}. Votes: ${JSON.stringify(law.votes)}.` };
}

export function vote(state, voter, lawId, choice, now) {
    ensureCitizen(state, voter, now);
    if (!stageAtLeast(state, 'commonwealth')) {
        return { ok: false, message: `Votes bind at commonwealth. Current stage: ${state.stage}. ${gateHint(state)}` };
    }
    const law = state.laws.find(item => item.id === lawId);
    if (!law) return { ok: false, message: `No law ${lawId}.` };
    if (law.status !== 'proposed') return { ok: false, message: `${lawId} is ${law.status} and cannot be voted.` };
    const ballot = String(choice || '').toLowerCase();
    if (ballot !== 'yes' && ballot !== 'no') return { ok: false, message: 'Vote must be yes or no.' };
    law.votes[voter] = ballot;
    tally(state, law, now);
    advance(state, now);
    return { ok: true, message: `${voter} voted ${ballot} on ${law.id}. Status: ${law.status}. Stage: ${state.stage}.` };
}

function sponsor(state, except) {
    const names = citizens(state).filter(name => name !== except);
    names.sort((a, b) => state.citizens[b].reputation - state.citizens[a].reputation);
    return names[0] || except;
}

function noteViolation(state, actor, law, detail, now) {
    const previous = [...state.violations].reverse().find(item => item.actor === actor && item.law_id === law.id);
    if (previous && now - previous.at < 60000) return;
    state.violations.push({ at: now, actor, law_id: law.id, detail: cleanText(detail, 120) });
    if (state.violations.length > 40) state.violations.splice(0, state.violations.length - 40);
    const citizen = state.citizens[actor];
    citizen.violations += 1;
    citizen.reputation -= 1;
    if (citizen.violations >= 2 && citizens(state).length >= 2) {
        const key = lawKey('restitution', actor);
        const exists = state.laws.some(item => (item.status === 'proposed' || item.status === 'enacted') && lawKey(item.kind, item.param) === key);
        if (!exists && stageAtLeast(state, 'customs')) {
            proposeLaw(
                state,
                sponsor(state, actor),
                `${actor} must apologize with a deed before drawing on the common stock.`,
                'restitution',
                actor,
                now,
            );
        }
    }
}

function mayTakeFood(state, name, law) {
    const role = state.citizens[name]?.role || '';
    if (law.param && role === law.param) return true;
    return state.citizens[name].drives.hunger >= 0.7;
}

function requiredRole(law) {
    return String(law?.param || '').split(':')[1] || '';
}

export function isPrey(entity) {
    return PREY.has(String(entity || '').toLowerCase());
}

export function isFood(item) {
    const name = String(item || '').toLowerCase();
    return FOOD.has(name) || name.startsWith('cooked_');
}

export function isOre(block) {
    return ORES.has(String(block || '').toLowerCase());
}

export function enforce(state, name, action, now) {
    ensureCitizen(state, name, now);
    let law = null;
    let detail = '';
    if (action.type === 'attack_player') {
        const ban = latestEnacted(state, 'no_pvp');
        if (ban && state.citizens[action.target]) {
            law = ban;
            detail = `attack on ${action.target}`;
            adjustTrust(state, name, action.target, -0.3, 'harms');
            state.citizens[action.target].drives.grievance = clamp(state.citizens[action.target].drives.grievance + 0.3);
        }
    } else if (action.type === 'attack_entity' && isPrey(action.entity)) {
        const hunting = state.laws.find(item => item.status === 'enacted' && item.kind === 'role_monopoly' && item.param.startsWith('hunting:'));
        if (hunting && state.citizens[name].role !== requiredRole(hunting)) {
            law = hunting;
            detail = `hunted ${action.entity}`;
        }
    } else if (action.type === 'set_mode' && action.mode === 'hunting' && action.on) {
        const hunting = state.laws.find(item => item.status === 'enacted' && item.kind === 'role_monopoly' && item.param.startsWith('hunting:'));
        if (hunting && state.citizens[name].role !== requiredRole(hunting)) {
            law = hunting;
            detail = 'turned hunting on';
        }
    } else if (action.type === 'collect' && isOre(action.block)) {
        const mining = state.laws.find(item => item.status === 'enacted' && item.kind === 'role_monopoly' && item.param.startsWith('mining:'));
        if (mining && state.citizens[name].role !== requiredRole(mining)) {
            law = mining;
            detail = `mined ${action.block}`;
        }
    } else if (action.type === 'take_chest' && isFood(action.item)) {
        const sanction = state.laws.find(item => item.status === 'enacted' && item.kind === 'restitution' && item.param === name);
        const foodLaw = latestEnacted(state, 'share_food');
        if (sanction && state.citizens[name].violations > 0) {
            law = sanction;
            detail = `took ${action.item} while sanctioned`;
        } else if (foodLaw && !mayTakeFood(state, name, foodLaw)) {
            law = foodLaw;
            detail = `took ${action.item} from the common stock`;
        }
    }
    if (!law) return { refused: false, message: '' };
    noteViolation(state, name, law, detail, now);
    advance(state, now);
    return { refused: true, message: `Refused by ${law.id}: ${law.text} (${detail}). Do not retry it. Call !socialRoute.` };
}

export function noteGift(state, from, to, item, num, now) {
    ensureCitizen(state, from, now);
    pushDeed(state, from, 'gift', `gave ${num} ${item} to ${to}`, now);
    if (state.citizens[to]) {
        adjustTrust(state, from, to, 0.15, 'gifts');
        state.citizens[from].reputation += 1;
        state.citizens[from].drives.belonging = clamp(state.citizens[from].drives.belonging + 0.1);
        state.citizens[to].drives.grievance = clamp(state.citizens[to].drives.grievance - 0.1);
    }
    advance(state, now);
}

export function noteHarm(state, from, to, detail, now) {
    ensureCitizen(state, from, now);
    if (!state.citizens[to]) return { ok: false, message: `${to} is outside the roll.` };
    pushDeed(state, from, 'harm', detail || `harmed ${to}`, now);
    adjustTrust(state, from, to, -0.25, 'harms');
    state.citizens[from].reputation -= 2;
    state.citizens[to].drives.grievance = clamp(state.citizens[to].drives.grievance + 0.35);
    advance(state, now);
    return { ok: true, message: `Harm recorded against ${to}.` };
}

export function noteDeposit(state, actor, item, num, now) {
    ensureCitizen(state, actor, now);
    pushDeed(state, actor, 'deposit', `put ${num} ${item} in a chest`, now);
    state.citizens[actor].reputation += 1;
    advance(state, now);
}

export function noteWithdraw(state, actor, item, num, now) {
    ensureCitizen(state, actor, now);
    pushDeed(state, actor, 'withdraw', `took ${num} ${item} from a chest`, now);
    advance(state, now);
}

export function noteGather(state, actor, detail, now) {
    ensureCitizen(state, actor, now);
    pushDeed(state, actor, 'gather', detail, now);
    advance(state, now);
}

export function noteHunt(state, actor, entity, now) {
    ensureCitizen(state, actor, now);
    pushDeed(state, actor, 'hunt', `hunted ${entity}`, now);
    advance(state, now);
}

export function noteBuild(state, actor, block, now) {
    ensureCitizen(state, actor, now);
    pushDeed(state, actor, 'build', `placed ${block}`, now);
    advance(state, now);
}

export function noteTalk(state, from, to, now) {
    ensureCitizen(state, from, now);
    state.citizens[from].last_talked = now;
    state.citizens[from].drives.belonging = clamp(state.citizens[from].drives.belonging + 0.12);
    if (state.citizens[to]) {
        adjustTrust(state, from, to, 0.05, null);
        state.citizens[to].last_talked = now;
        state.citizens[to].drives.belonging = clamp(state.citizens[to].drives.belonging + 0.12);
    }
    advance(state, now);
}

export function touch(state, name, ctx = {}) {
    const now = ctx.now ?? 0;
    const me = ensureCitizen(state, name, now);
    if (ctx.food != null) {
        const target = ctx.food < 14 ? 0.8 : 0.2;
        me.drives.hunger = clamp(me.drives.hunger * 0.5 + target * 0.5);
    }
    const idleMin = Math.min(30, Math.max(0, (now - me.last_deed) / 60000));
    const sinceSeen = Math.min(30, Math.max(0, (now - me.last_seen) / 60000));
    const sinceTalk = Math.min(30, Math.max(0, (now - me.last_talked) / 60000));
    me.drives.duty = clamp(me.drives.duty + idleMin * 0.02);
    me.drives.grievance = clamp(me.drives.grievance - sinceSeen * 0.03);
    me.drives.belonging = clamp(me.drives.belonging - sinceTalk * 0.02);
    me.last_seen = now;
    return me;
}

function alreadyLogged(state, name, kind, detail) {
    return state.deeds.some(deed => deed.actor === name && deed.kind === kind && deed.detail === detail);
}

export function deedForOutcome(text) {
    if (!text) return null;
    const raw = String(text);
    if (raw.length > 400) return null;
    const body = raw.toLowerCase();
    if (/refused by law-|you died|settlement stage/.test(body)) return null;
    const detail = cleanText(raw, 120);
    if (/collected \d+/.test(body)) return { kind: 'gather', detail };
    if (/crafted|smelted/.test(body)) return { kind: 'craft', detail };
    if (/in a chest|deposited/.test(body) && /put|deposit/.test(body)) return { kind: 'deposit', detail };
    if (/gave \d+|given \d+/.test(body)) return { kind: 'gift', detail };
    if (/hunted |killed |slain/.test(body)) return { kind: 'hunt', detail };
    if (/slept|sleeping/.test(body)) return { kind: 'rest', detail: 'slept' };
    return null;
}

function openLawKey(state, kind, param) {
    const key = lawKey(kind, param);
    // A rejected custom stays rejected until someone repeals the attempt by proposing again by hand.
    return state.laws.some(law => law.status !== 'repealed' && lawKey(law.kind, law.param) === key);
}

function stewardRole(state) {
    if (citizens(state).some(name => state.citizens[name].role === 'hunter')) return 'hunter';
    const counts = {};
    for (const deed of state.deeds) {
        if (deed.kind !== 'deposit') continue;
        const role = state.citizens[deed.actor]?.role;
        if (!role) continue;
        counts[role] = (counts[role] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : 'hunter';
}

export function codifyCandidate(state) {
    const harms = state.deeds.filter(deed => deed.kind === 'harm');
    if (harms.length >= 2 && !openLawKey(state, 'no_pvp', '')) {
        return {
            kind: 'no_pvp',
            param: '',
            text: 'No citizen attacks another citizen.',
            because: 'Harm has happened often enough to become a custom.',
        };
    }
    const deposits = state.deeds.filter(deed => deed.kind === 'deposit');
    const depositors = new Set(deposits.map(deed => deed.actor));
    if (deposits.length >= 3 && depositors.size >= 2 && !openLawKey(state, 'share_food', '')) {
        const role = stewardRole(state);
        return {
            kind: 'share_food',
            param: role,
            text: 'Cooked food and bread stay in the town chest unless you are hungry or the steward.',
            because: 'Several citizens keep storing goods. That custom can become a food law.',
        };
    }
    const hunts = state.deeds.filter(deed => deed.kind === 'hunt');
    const hunters = [...new Set(hunts.map(deed => deed.actor))];
    if (hunts.length >= 3 && hunters.length === 1 && !openLawKey(state, 'role_monopoly', 'hunting:')) {
        const role = state.citizens[hunters[0]]?.role || 'hunter';
        return {
            kind: 'role_monopoly',
            param: `hunting:${role}`,
            text: `Only the ${role} hunts animals.`,
            because: `${hunters[0]} is the only one hunting. The camp can make that a rule.`,
        };
    }
    const oreGathers = state.deeds.filter(deed => deed.kind === 'gather' && /ore|ancient_debris/.test(deed.detail));
    const miners = [...new Set(oreGathers.map(deed => deed.actor))];
    if (oreGathers.length >= 3 && miners.length === 1 && !openLawKey(state, 'role_monopoly', 'mining:')) {
        const role = state.citizens[miners[0]]?.role || 'miner';
        return {
            kind: 'role_monopoly',
            param: `mining:${role}`,
            text: `Only the ${role} mines ore.`,
            because: `${miners[0]} is the only one bringing back ore.`,
        };
    }
    return null;
}

function bestPartner(state, name) {
    const others = citizens(state).filter(other => other !== name);
    if (!others.length) return null;
    others.sort((a, b) => {
        const score = other => getTrust(state, name, other) + (state.citizens[other].role !== state.citizens[name].role ? 0.05 : 0);
        return score(b) - score(a);
    });
    return others[0];
}

function voteChoice(state, voter, law) {
    if (law.kind === 'restitution' && law.param === voter) return 'no';
    const trust = getTrust(state, voter, law.proposer);
    if (state.citizens[voter].drives.grievance > 0.65 && trust < 0) return 'no';
    if (trust < -0.2) return 'no';
    return 'yes';
}

function canHunt(state, name) {
    const hunting = state.laws.find(law => law.status === 'enacted' && law.kind === 'role_monopoly' && law.param.startsWith('hunting:'));
    if (!hunting) return true;
    return state.citizens[name].role === requiredRole(hunting);
}

function duty(state, name) {
    const role = state.citizens[name].role;
    if (role === 'hunter') {
        if (canHunt(state, name)) return { command: '!attack("pig")', because: 'Hunter duty is meat for the common chest.' };
        return { command: '!collectBlocks("oak_log", 4)', because: 'Hunting is closed to your role.' };
    }
    if (role === 'miner') {
        const mining = state.laws.find(law => law.status === 'enacted' && law.kind === 'role_monopoly' && law.param.startsWith('mining:'));
        if (mining && state.citizens[name].role !== requiredRole(mining)) {
            return { command: '!collectBlocks("oak_log", 4)', because: 'Ore is reserved for another role.' };
        }
        const minedOre = state.deeds.some(deed => deed.actor === name && deed.kind === 'gather' && /ore|ancient_debris/.test(deed.detail));
        if (!minedOre) return { command: '!collectBlocks("stone", 8)', because: 'Miner duty starts with stone for tools.' };
        return { command: '!collectBlocks("coal_ore", 4)', because: 'Miner duty is fuel.' };
    }
    if (role === 'forester') return { command: '!collectBlocks("oak_log", 8)', because: 'Forester duty is wood for the camp.' };
    if (role === 'builder') return { command: '!collectBlocks("oak_log", 4)', because: 'Builder duty starts with wood for a shelter.' };
    return { command: '!nearbyBlocks', because: 'Look around, then work the role on the roll.' };
}

export function decide(state, name, ctx = {}) {
    const now = ctx.now ?? 0;
    const stage = state.stage;
    const me = state.citizens[name];
    if (!me) return { command: '!society', because: 'You are not on the settlement roll yet.', stage };

    const sanctioned = state.laws.find(law => law.status === 'enacted' && law.kind === 'restitution' && law.param === name);
    if (sanctioned && me.violations > 0) {
        return { command: '!recordDeed("apology","I accept the settlement judgment and will comply.")', because: `${sanctioned.id} requires an apology before normal work resumes.`, stage };
    }

    if (me.drives.hunger >= 0.7) {
        if (me.role === 'hunter' && canHunt(state, name)) {
            return { command: '!attack("cow")', because: 'Hunger is high and hunting is your office.', stage };
        }
        const foodLaw = latestEnacted(state, 'share_food');
        if (!foodLaw || mayTakeFood(state, name, foodLaw)) {
            return { command: '!takeFromChest("bread", 2)', because: 'Hunger is high and the food rule allows a draw.', stage };
        }
        const hunter = citizens(state).find(other => other !== name && state.citizens[other].role === 'hunter');
        if (hunter) {
            return { command: `!startConversation("${hunter}","I am hungry. Please put cooked food in the town chest.")`, because: 'Hunger is high and hunting is not your office.', stage };
        }
        return { command: '!searchForEntity("cow", 64)', because: 'Hunger is high.', stage };
    }

    const curfew = latestEnacted(state, 'curfew');
    if (curfew && ctx.timeOfDay != null) {
        const after = Number(curfew.param) || 13000;
        if (ctx.timeOfDay >= after) {
            return { command: '!goToBed', because: `${curfew.id} is a curfew from tick ${after}.`, stage };
        }
    }

    if (ctx.huntingOn && !canHunt(state, name)) {
        return { command: '!setMode("hunting", false)', because: 'An enacted hunting rule does not include your role.', stage };
    }

    if (stageAtLeast(state, 'commonwealth')) {
        const open = state.laws.find(law => law.status === 'proposed' && !law.votes[name]);
        if (open) {
            const choice = voteChoice(state, name, open);
            return { command: `!vote("${open.id}","${choice}")`, because: `${open.id} (${open.text}) is waiting on your vote.`, stage };
        }
    }

    if (stageAtLeast(state, 'customs')) {
        const candidate = codifyCandidate(state);
        if (candidate) {
            return {
                command: `!proposeLaw("${candidate.text}","${candidate.kind}","${candidate.param}")`,
                because: candidate.because,
                stage,
            };
        }
    }

    if (me.drives.belonging < 0.35) {
        const partner = bestPartner(state, name);
        if (partner) {
            return { command: `!startConversation("${partner}","Settlement check. Stage is ${stage}. What should we store, and which custom should become law?")`, because: 'Belonging is low. Bots can only talk to one partner at a time.', stage };
        }
    }

    const outcome = deedForOutcome(ctx.lastOutcome || '');
    if (outcome && !alreadyLogged(state, name, outcome.kind, outcome.detail)) {
        return { command: `!recordDeed("${outcome.kind}","${outcome.detail}")`, because: 'A finished action becomes a custom only after it is written down.', stage };
    }

    if (!state.places.town_square && !state.places.town_chest) {
        return { command: '!rememberHere("town_square")', because: 'A camp needs a shared square before roles can matter.', stage };
    }

    if (!me.role) {
        const role = roleKey(ctx.preferredRole || '') || 'builder';
        return { command: `!setRole("${role}")`, because: 'You have no role on the roll.', stage };
    }

    const unroled = citizens(state).find(other => other !== name && !state.citizens[other].role);
    if (unroled) {
        return { command: `!startConversation("${unroled}","Claim your role with !setRole so we can leave camp.")`, because: `${unroled} has no role, so customs cannot start.`, stage };
    }

    const job = duty(state, name);
    return { command: job.command, because: job.because, stage };
}

export function formatRouteInstruction(decision) {
    return `Your society requires the next command to be exactly: ${decision.command}. Reason: ${decision.because} Stage: ${decision.stage}.`;
}

function trustLine(state, name) {
    const others = citizens(state).filter(other => other !== name);
    if (!others.length) return 'none yet';
    return others.slice(0, 4).map(other => `${other} ${getTrust(state, name, other).toFixed(2)}`).join(', ');
}

export function formatBrief(state, name, ctx = {}) {
    const me = state.citizens[name];
    if (!me) return 'SETTLEMENT: you are not on the roll yet.';
    const binding = state.laws
        .filter(law => law.status === 'enacted')
        .slice(-5)
        .map(law => `${law.id} ${law.kind}: ${law.text}`);
    const open = state.laws
        .filter(law => law.status === 'proposed')
        .slice(-4)
        .map(law => `${law.id} ${law.kind} your vote=${law.votes[name] || 'none'}`);
    const decision = decide(state, name, ctx);
    const drives = me.drives;
    return [
        `SETTLEMENT stage=${state.stage}. You are ${name}, role=${me.role || 'unset'}, reputation=${me.reputation}, violations=${me.violations}.`,
        `Drives hunger=${drives.hunger.toFixed(2)} duty=${drives.duty.toFixed(2)} belonging=${drives.belonging.toFixed(2)} grievance=${drives.grievance.toFixed(2)}.`,
        `BINDING: ${binding.join(' | ') || 'none yet'}.`,
        `OPEN: ${open.join(' | ') || 'none'}.`,
        `Trust: ${trustLine(state, name)}.`,
        `${gateHint(state)}`,
        `Next command: ${decision.command}`,
        'Binding laws override requests. A refused command must not be retried.',
    ].join('\n');
}
