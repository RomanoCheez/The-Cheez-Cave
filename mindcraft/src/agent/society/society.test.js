import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import test from 'node:test';
import {
    advance,
    codifyCandidate,
    createState,
    decide,
    deedForOutcome,
    enforce,
    formatRouteInstruction,
    getTrust,
    noteDeposit,
    noteGift,
    noteHarm,
    noteHunt,
    proposeLaw,
    recordDeed,
    registerCitizen,
    rememberPlace,
    setRole,
    touch,
    vote,
} from './model.js';
import { readSettlement, updateSettlement } from './store.js';

const commandRegex = /!(\w+)(?:\(((?:-?\d+(?:\.\d+)?|true|false|"[^"]*")(?:\s*,\s*(?:-?\d+(?:\.\d+)?|true|false|"[^"]*"))*)\))?/;

function assertCommand(command) {
    const matched = command.match(commandRegex);
    assert.ok(matched, command);
    assert.equal(matched[0], command, command);
}

function camp(now = 1_000) {
    const state = createState(now);
    registerCitizen(state, 'ash', now);
    registerCitizen(state, 'miller', now);
    rememberPlace(state, 'town_square', 10, 64, -4, 'ash', now);
    assert.equal(state.stage, 'camp');
    return state;
}

function customs(now = 2_000) {
    const state = camp(now);
    setRole(state, 'ash', 'forester', now);
    setRole(state, 'miller', 'hunter', now);
    recordDeed(state, 'ash', 'gather', 'collected 8 oak_log', now);
    recordDeed(state, 'miller', 'hunt', 'hunted a pig', now);
    recordDeed(state, 'ash', 'build', 'placed oak_planks', now);
    assert.equal(state.stage, 'customs');
    return state;
}

test('a square and two names make a camp, and one name does not', () => {
    const alone = createState(0);
    registerCitizen(alone, 'ash', 0);
    rememberPlace(alone, 'town_square', 0, 64, 0, 'ash', 0);
    assert.equal(alone.stage, 'band');

    const state = camp();
    assert.equal(state.places.town_square.x, 10);
});

test('roles and three material deeds open customs', () => {
    const state = customs();
    assert.equal(state.citizens.ash.role, 'forester');
    assert.equal(state.citizens.miller.role, 'hunter');
});

test('laws cannot be proposed in camp, and a proposal opens the commonwealth', () => {
    const early = camp();
    const blocked = proposeLaw(early, 'ash', 'No fighting.', 'no_pvp', '', 5_000);
    assert.equal(blocked.ok, false);

    const state = customs(5_000);
    const proposed = proposeLaw(state, 'ash', 'No citizen attacks another citizen.', 'no_pvp', '', 5_000);
    assert.equal(proposed.ok, true);
    assert.equal(state.stage, 'commonwealth');
    assert.equal(state.laws[0].status, 'proposed');
    assert.equal(state.laws[0].votes.ash, 'yes');
});

test('two citizens enact a law only when both vote yes', () => {
    const state = customs();
    proposeLaw(state, 'ash', 'No citizen attacks another citizen.', 'no_pvp', '', 3_000);
    const rejected = vote(state, 'miller', 'law-1', 'no', 3_100);
    assert.equal(rejected.ok, true);
    assert.equal(state.laws[0].status, 'rejected');
    assert.equal(state.stage, 'commonwealth');

    const again = proposeLaw(state, 'ash', 'No citizen attacks another citizen.', 'no_pvp', '', 3_200);
    assert.equal(again.ok, true);
    vote(state, 'miller', 'law-2', 'yes', 3_300);
    assert.equal(state.laws[1].status, 'enacted');
    assert.equal(state.stage, 'order');
});

test('four citizens need three yes votes, and a duplicate proposal is refused', () => {
    const state = customs();
    registerCitizen(state, 'pike', 4_000);
    registerCitizen(state, 'mason', 4_000);
    setRole(state, 'pike', 'miner', 4_000);
    setRole(state, 'mason', 'builder', 4_000);
    proposeLaw(state, 'ash', 'No citizen attacks another citizen.', 'no_pvp', '', 4_000);
    vote(state, 'miller', 'law-1', 'yes', 4_100);
    assert.equal(state.laws[0].status, 'proposed');
    vote(state, 'pike', 'law-1', 'yes', 4_200);
    assert.equal(state.laws[0].status, 'enacted');
    const duplicate = proposeLaw(state, 'mason', 'Still no fighting.', 'no_pvp', '', 4_300);
    assert.equal(duplicate.ok, false);
});

test('votes before the commonwealth are refused', () => {
    const state = customs();
    const result = vote(state, 'ash', 'law-1', 'yes', 1);
    assert.equal(result.ok, false);
});

test('an enacted no-pvp law refuses citizen attacks and logs one violation a minute', () => {
    const state = customs();
    proposeLaw(state, 'ash', 'No citizen attacks another citizen.', 'no_pvp', '', 10_000);
    vote(state, 'miller', 'law-1', 'yes', 10_100);
    const first = enforce(state, 'ash', { type: 'attack_player', target: 'miller' }, 20_000);
    const second = enforce(state, 'ash', { type: 'attack_player', target: 'miller' }, 20_500);
    const third = enforce(state, 'ash', { type: 'attack_player', target: 'miller' }, 80_001);
    assert.match(first.message, /Refused by law-1/);
    assert.match(second.message, /Refused by law-1/);
    assert.equal(state.citizens.ash.violations, 2);
    assert.equal(state.violations.length, 2);
    assert.ok(state.laws.some(law => law.kind === 'restitution' && law.param === 'ash'));
    assert.ok(third.refused);
    assert.ok(getTrust(state, 'ash', 'miller') < 0);
});

test('food law lets the hungry and the steward draw, and blocks a full forester', () => {
    const state = customs();
    noteDeposit(state, 'ash', 'bread', 8, 1);
    noteDeposit(state, 'miller', 'bread', 4, 2);
    noteDeposit(state, 'ash', 'bread', 4, 3);
    proposeLaw(state, 'ash', 'Cooked food and bread stay in the town chest unless you are hungry or the steward.', 'share_food', 'hunter', 4);
    vote(state, 'miller', state.laws.at(-1).id, 'yes', 5);
    state.citizens.ash.drives.hunger = 0.2;
    const blocked = enforce(state, 'ash', { type: 'take_chest', item: 'bread', num: 2 }, 90_000);
    assert.equal(blocked.refused, true);
    state.citizens.ash.drives.hunger = 0.8;
    const hungry = enforce(state, 'ash', { type: 'take_chest', item: 'bread', num: 2 }, 200_000);
    assert.equal(hungry.refused, false);
    state.citizens.ash.drives.hunger = 0.2;
    const steward = enforce(state, 'miller', { type: 'take_chest', item: 'cooked_beef', num: 1 }, 260_000);
    assert.equal(steward.refused, false);
});

test('hunting and mining monopolies refuse the other roles', () => {
    const state = customs();
    proposeLaw(state, 'miller', 'Only the hunter hunts animals.', 'role_monopoly', 'hunting:hunter', 1);
    vote(state, 'ash', 'law-1', 'yes', 2);
    const hunted = enforce(state, 'ash', { type: 'attack_entity', entity: 'cow' }, 10_000);
    const mode = enforce(state, 'ash', { type: 'set_mode', mode: 'hunting', on: true }, 10_500);
    const hunter = enforce(state, 'miller', { type: 'attack_entity', entity: 'pig' }, 10_500);
    assert.equal(hunted.refused, true);
    assert.equal(mode.refused, true);
    assert.equal(hunter.refused, false);

    proposeLaw(state, 'ash', 'Only the miner mines ore.', 'role_monopoly', 'mining:miner', 90_000);
    registerCitizen(state, 'pike', 90_000);
    setRole(state, 'pike', 'miner', 90_000);
    vote(state, 'miller', 'law-2', 'yes', 91_000);
    vote(state, 'pike', 'law-2', 'yes', 92_000);
    assert.equal(state.laws[1].status, 'enacted');
    const ore = enforce(state, 'ash', { type: 'collect', block: 'coal_ore' }, 150_000);
    const miner = enforce(state, 'pike', { type: 'collect', block: 'iron_ore' }, 150_000);
    const stone = enforce(state, 'ash', { type: 'collect', block: 'stone' }, 150_000);
    assert.equal(ore.refused, true);
    assert.equal(miner.refused, false);
    assert.equal(stone.refused, false);
});

test('a repeal vote removes an enacted law', () => {
    const state = customs();
    proposeLaw(state, 'ash', 'Sleep after dusk.', 'curfew', '13000', 1);
    vote(state, 'miller', 'law-1', 'yes', 2);
    proposeLaw(state, 'miller', 'Repeal the curfew.', 'repeal', 'law-1', 3);
    vote(state, 'ash', 'law-2', 'yes', 4);
    assert.equal(state.laws[0].status, 'repealed');
    assert.equal(state.laws[1].status, 'enacted');
});

test('an apology clears one violation', () => {
    const state = customs();
    state.citizens.ash.violations = 1;
    recordDeed(state, 'ash', 'apology', 'I accept the settlement judgment and will comply.', 1);
    assert.equal(state.citizens.ash.violations, 0);
    assert.equal(state.citizens.ash.reputation, 1);
});

test('repeated harm, deposits, and hunts become the next proposal', () => {
    const state = customs();
    noteHarm(state, 'ash', 'miller', 'hit miller', 1);
    noteHarm(state, 'ash', 'miller', 'hit miller again', 2);
    let candidate = codifyCandidate(state);
    assert.equal(candidate.kind, 'no_pvp');

    proposeLaw(state, 'miller', candidate.text, candidate.kind, candidate.param, 3);
    vote(state, 'ash', 'law-1', 'no', 4);
    noteDeposit(state, 'ash', 'bread', 4, 5);
    noteDeposit(state, 'miller', 'bread', 4, 6);
    noteDeposit(state, 'ash', 'bread', 4, 7);
    candidate = codifyCandidate(state);
    assert.equal(candidate.kind, 'share_food');
    assert.equal(candidate.param, 'hunter');

    proposeLaw(state, 'ash', candidate.text, candidate.kind, candidate.param, 8);
    vote(state, 'miller', state.laws.at(-1).id, 'no', 9);
    noteHunt(state, 'miller', 'pig', 10);
    noteHunt(state, 'miller', 'cow', 11);
    noteHunt(state, 'miller', 'chicken', 12);
    candidate = codifyCandidate(state);
    assert.equal(candidate.kind, 'role_monopoly');
    assert.equal(candidate.param, 'hunting:hunter');
});

test('the route walks the institution and always emits one legal command', () => {
    const band = createState(0);
    registerCitizen(band, 'ash', 0);
    const first = decide(band, 'ash', { now: 0, preferredRole: 'forester' });
    assert.equal(first.command, '!rememberHere("town_square")');
    assertCommand(first.command);

    const state = customs();
    noteHarm(state, 'ash', 'miller', 'hit miller', 1);
    noteHarm(state, 'ash', 'miller', 'hit miller again', 2);
    const proposal = decide(state, 'ash', { now: 50_000 });
    assert.match(proposal.command, /^!proposeLaw\(/);
    assertCommand(proposal.command);
    proposeLaw(state, 'ash', 'No citizen attacks another citizen.', 'no_pvp', '', 50_000);
    const ballot = decide(state, 'miller', { now: 60_000 });
    assert.equal(ballot.command, '!vote("law-1","yes")');
    assertCommand(ballot.command);

    state.citizens.miller.drives.hunger = 0.9;
    const hungry = decide(state, 'miller', { now: 60_000 });
    assert.equal(hungry.command, '!attack("cow")');

    state.citizens.ash.drives.hunger = 0.2;
    state.citizens.ash.drives.belonging = 0.2;
    const lonely = decide(state, 'ash', { now: 60_000, lastOutcome: '' });
    assert.match(lonely.command, /^!startConversation\("miller"/);
    assertCommand(lonely.command);

    proposeLaw(state, 'miller', 'Sleep after dusk.', 'curfew', '13000', 70_000);
    vote(state, 'ash', 'law-2', 'yes', 70_100);
    const night = decide(state, 'ash', { now: 80_000, timeOfDay: 14000, lastOutcome: '' });
    assert.equal(night.command, '!goToBed');
    assert.match(formatRouteInstruction(night), /exactly: !goToBed/);
});

test('a logged outcome is not written twice', () => {
    const state = customs();
    const outcome = 'collected 4 spruce_log';
    assert.deepEqual(deedForOutcome(outcome), { kind: 'gather', detail: outcome });
    const first = decide(state, 'ash', { now: 10_000, lastOutcome: outcome });
    assert.equal(first.command, `!recordDeed("gather","${outcome}")`);
    recordDeed(state, 'ash', 'gather', outcome, 10_000);
    const second = decide(state, 'ash', { now: 10_500, lastOutcome: outcome });
    assert.notEqual(second.command, first.command);
});

test('a gift raises trust', () => {
    const state = camp();
    noteGift(state, 'ash', 'miller', 'bread', 4, 1);
    assert.ok(getTrust(state, 'ash', 'miller') > 0);
    assert.equal(state.citizens.ash.reputation, 1);
});

test('touch moves hunger toward the body and does not erase a fresh citizen', () => {
    const state = createState(0);
    registerCitizen(state, 'ash', 0);
    touch(state, 'ash', { now: 0, food: 6 });
    assert.ok(state.citizens.ash.drives.hunger > 0.4);
    touch(state, 'ash', { now: 0, food: 20 });
    assert.ok(state.citizens.ash.drives.hunger < 0.7);
});

test('the settlement file survives a failed write and a second update', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'settlement-'));
    const file = path.join(root, 'bots', 'settlement.json');
    try {
        updateSettlement(state => {
            rememberPlace(state, 'town_square', 3, 64, 9, 'ash', 1);
            return state.stage;
        }, file);
        assert.throws(() => updateSettlement(() => {
            throw new Error('boom');
        }, file));
        updateSettlement(state => {
            registerCitizen(state, 'miller', 2);
            return state.stage;
        }, file);
        const saved = readSettlement(file);
        assert.equal(saved.places.town_square.z, 9);
        assert.ok(saved.citizens.miller);
        assert.equal(advance(saved, 3), 'camp');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
