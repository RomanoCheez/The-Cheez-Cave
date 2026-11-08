# Settlement layer

Mindcraft's own memory is a 500-character summary and about 15 chat turns. That is not enough for a group to keep a rule. This layer puts the institution in `bots/settlement.json`, which every bot reads and writes. Places named with `!rememberHere` are copied into that file too, and personal places are saved in `bots/<name>/memory.json`.

The layer is off unless `settings.js` has `"society": true`. Task runs and single-bot play are unchanged while it is false.

## Turn it on

1. In `settings.js`, set `"society": true`.
2. Comment out `./andy.json` and uncomment the four profiles in `profiles/society/`.
3. Point each profile's `model` at the same provider you put in `keys.json`.
4. Use a dedicated server with `online-mode=false`, and `"auth": "offline"` in `settings.js`. The profile `name` is the Minecraft name.
5. From `mindcraft/`, run `npm install` and `npm start`.

On that first boot the default hello message is replaced with a settlement goal. After a bot has a `self_prompt` in `bots/<name>/memory.json`, set `"load_memory": true` so a restart continues the same goal.

`npm run test:society` checks the stage path, votes, and refusals without Minecraft.

## What the bots are

| Profile | Name | Role | Hunting |
| --- | --- | --- | --- |
| `profiles/society/ash.json` | ash | forester | off |
| `profiles/society/pike.json` | pike | miner | off |
| `profiles/society/mason.json` | mason | builder | off |
| `profiles/society/miller.json` | miller | hunter | on |

A profile's `society_role` is claimed automatically the first time that bot joins the roll. With two or more Mindcraft agents online, public chat is ignored. You talk to a bot with `/msg` or the page at `http://localhost:8080`. Bots talk to each other with `!startConversation`, one partner at a time.

## The path

The stage only moves forward.

1. **band.** Fewer than two named citizens, or no shared `town_square`.
2. **camp.** Two or more citizens and a saved square. Everyone still needs a role, and the deed log needs three material deeds (gather, deposit, hunt, craft, build, or rest).
3. **customs.** Roles and deeds exist. Repeated behavior can be proposed as a law. Harm proposes `no_pvp`. Deposits from two citizens propose `share_food`. One person doing all the hunting proposes `role_monopoly`.
4. **commonwealth.** A proposal exists. Votes count. A law is enacted by a strict majority and at least two yes votes. The proposer starts with a yes.
5. **order.** A law is enacted. Matching commands are refused. Two violations against the same citizen open a restitution proposal. An apology deed, `!recordDeed("apology","...")`, clears one violation.

Rejected proposals are not immediately re-filed by the route. A citizen can still propose that kind again by hand. `!proposeLaw("Repeal the curfew.","repeal","law-1")` removes an enacted law once the repeal itself passes.

## Commands

- `!society` shows stage, drives, binding laws, and open votes.
- `!socialRoute` prints the one command the current drives and laws want next.
- `!setRole("hunter")` claims a role.
- `!recordDeed("gather","collected 8 oak_log")` writes a custom.
- `!proposeLaw("No citizen attacks another citizen.","no_pvp","")`
- `!proposeLaw("Only the hunter hunts animals.","role_monopoly","hunting:hunter")`
- `!proposeLaw("Cooked food and bread stay in the town chest unless you are hungry or the steward.","share_food","hunter")`
- `!proposeLaw("Sleep after dusk.","curfew","13000")`
- `!vote("law-1","yes")`

While a goal is running, the self-prompt tells the model the exact next command. Hunger, a curfew, an open vote, and a low sense of belonging outrank ordinary work. Enacted laws also refuse the command itself:

- `no_pvp` blocks `!attackPlayer` against another citizen.
- `role_monopoly` of `hunting:` blocks `!attack` on animals and `!setMode("hunting", true)` for every other role.
- `role_monopoly` of `mining:` blocks ore collection for every other role. Stone is still free.
- `share_food` blocks taking bread and cooked food from a chest unless the citizen is hungry or holds the steward role.
- An enacted restitution law blocks that citizen from taking food until they apologize.

Drives are hunger, duty, belonging, and grievance. Gifts and conversation raise trust. Harm lowers it. Trust is directional and lives in the same settlement file.

## What this does not do

The model can still ignore the route and chat instead of acting. Three replies with no command stop the self-prompt loop. Laws are the kinds above, not free-form statutes the server can fully enforce: a `custom` law is text in the prompt. The file is the group's memory; the world chest is still the only shared warehouse.
