import {
    briefForAgent,
    routeForAgent,
    runSocietyCommand,
    societyActions,
} from '../society/runtime.js';

export const societyCommands = [
    {
        name: '!society',
        requiresSociety: true,
        description: 'Read the settlement stage, your drives, binding laws, and open votes. The stage moves from band to camp to customs to commonwealth to order.',
        perform: async (agent) => runSocietyCommand(agent, (state, now) => societyActions.brief(state, agent.name, now)),
    },
    {
        name: '!socialRoute',
        requiresSociety: true,
        description: 'Get the one command the settlement wants next. Psychological drives and enacted laws choose it. Do that command.',
        perform: async (agent) => routeForAgent(agent),
    },
    {
        name: '!setRole',
        requiresSociety: true,
        description: 'Claim a settlement role. Use hunter, miner, forester, or builder unless the group has agreed another name.',
        params: {
            role: { type: 'string', description: 'The role to claim.' },
        },
        perform: async (agent, role) => runSocietyCommand(agent, (state, now) => societyActions.setRole(state, agent.name, role, now)),
    },
    {
        name: '!recordDeed',
        requiresSociety: true,
        description: 'Write a deed into the shared custom-log. Kinds: deposit, withdraw, gift, hunt, craft, gather, build, apology, harm, rest, custom. Repeated deeds become laws.',
        params: {
            kind: { type: 'string', description: 'The deed kind.' },
            detail: { type: 'string', description: 'A short description without double quotes.' },
        },
        perform: async (agent, kind, detail) => runSocietyCommand(agent, (state, now) => societyActions.recordDeed(state, agent.name, kind, detail, now)),
    },
    {
        name: '!proposeLaw',
        requiresSociety: true,
        description: 'Propose a law once the settlement has reached customs. Kinds: no_pvp, share_food, role_monopoly, curfew, custom, repeal, restitution. Param examples: "" , hunter, hunting:hunter, mining:miner, 13000, law-1, a citizen name.',
        params: {
            text: { type: 'string', description: 'The law in one sentence. No double quotes.' },
            kind: { type: 'string', description: 'The law kind.' },
            param: { type: 'string', description: 'Kind parameter, or an empty string.' },
        },
        perform: async (agent, text, kind, param) => runSocietyCommand(agent, (state, now) => societyActions.proposeLaw(state, agent.name, text, kind, param, now)),
    },
    {
        name: '!vote',
        requiresSociety: true,
        description: 'Vote yes or no on a proposed law. A law is enacted only by a strict majority with at least two yes votes. Your vote is recorded on the shared roll.',
        params: {
            law_id: { type: 'string', description: 'The law id, such as law-1.' },
            choice: { type: 'string', description: 'yes or no.' },
        },
        perform: async (agent, lawId, choice) => runSocietyCommand(agent, (state, now) => societyActions.vote(state, agent.name, lawId, choice, now)),
    },
    {
        name: '!relations',
        requiresSociety: true,
        description: 'See trust toward the other citizens.',
        perform: async (agent) => briefForAgent(agent),
    },
];
