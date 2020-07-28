// Import Modules
import {
    DL
} from "./config.js";
import {
    AetherianActor
} from "./actor/actor.js";
import {
    AetherianActorSheet
} from "./actor/actor-sheet.js";
import {
    AetherianActorSheet2
} from "./actor/actor-sheet2.js";
import {
    AetherianCreatureSheet
} from "./actor/creature-sheet.js";
import {
    AetherianItem
} from "./item/item.js";
import {
    AetherianItemSheet
} from "./item/item-sheet.js";
import {
    AetherianItemSheet2
} from "./item/item-sheet2.js";
import {
    registerSettings
} from "./settings.js";
import {
    rollInitiative,
    setupTurns,
    startCombat
} from "./init/init.js";
import combattracker from './combattracker.js';
import { CharacterBuff } from './buff.js';

Hooks.once('init', async function () {
    game.aetherian = {
        AetherianActor,
        AetherianItem,
        rollWeaponMacro,
        rollTalentMacro,
        rollSpellMacro,
        rollAttributeMacro,
        rollInitMacro,
        healingPotionMacro,
        requestRollMacro
    };

    // Define custom Entity classes
    CONFIG.DL = DL;

    Combat.prototype.rollInitiative = rollInitiative;
    Combat.prototype.setupTurns = setupTurns;
    Combat.prototype.startCombat = startCombat;

    CONFIG.Actor.entityClass = AetherianActor;
    CONFIG.Item.entityClass = AetherianItem;
    CONFIG.ui.combat = combattracker;

    registerSettings();

    // Register sheet application classes
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("aetherian", AetherianActorSheet, {
        types: ['character'],
        makeDefault: false
    });
    Actors.registerSheet("aetherian", AetherianActorSheet2, {
        types: ['character'],
        makeDefault: true
    });

    Actors.registerSheet("aetherian", AetherianCreatureSheet, {
        types: ['creature'],
        makeDefault: true
    });

    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("aetherian", AetherianItemSheet, {
        makeDefault: false
    });
    Items.registerSheet("aetherian", AetherianItemSheet2, {
        makeDefault: true
    });

    window.CharacterBuff = CharacterBuff;

    // If you need to add Handlebars helpers, here are a few useful examples:
    Handlebars.registerHelper('concat', function () {
        var outStr = '';
        for (var arg in arguments) {
            if (typeof arguments[arg] != 'object') {
                outStr += arguments[arg];
            }
        }
        return outStr;
    });

    Handlebars.registerHelper('toLowerCase', function (str) {
        return str.toLowerCase();
    });

    Handlebars.registerHelper("json", JSON.stringify);

    preloadHandlebarsTemplates();
});

async function preloadHandlebarsTemplates() {
    const templatePaths = [
        "systems/aetherian/templates/tabs/character.html",
        "systems/aetherian/templates/tabs/combat.html",
        "systems/aetherian/templates/tabs/talents.html",
        "systems/aetherian/templates/tabs/magic.html",
        "systems/aetherian/templates/tabs/item.html",
        "systems/aetherian/templates/tabs/background.html",
        "systems/aetherian/templates/chat/challenge.html",
        "systems/aetherian/templates/chat/combat.html",
        "systems/aetherian/templates/chat/talent.html",
        "systems/aetherian/templates/chat/spell.html",
        "systems/aetherian/templates/chat/description.html",
        "systems/aetherian/templates/chat/showtalent.html"
    ];
    return loadTemplates(templatePaths);
}

Hooks.once("ready", async function () {
    // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
    Hooks.on("hotbarDrop", (bar, data, slot) => createAetherianMacro(data, slot));
});

/**
 * This function runs after game data has been requested and loaded from the servers, so entities exist
 */
Hooks.once("setup", function () {
    // Localize CONFIG objects once up-front
    const toLocalize = [
        "attributes"
    ];
    for (let o of toLocalize) {
        CONFIG.DL[o] = Object.entries(CONFIG.DL[o]).reduce((obj, e) => {
            obj[e[0]] = game.i18n.localize(e[1]);
            return obj;
        }, {});
    }
});

/**
 * Set default values for new actors' tokens
 */
Hooks.on("preCreateActor", (createData) => {
    let disposition = CONST.TOKEN_DISPOSITIONS.NEUTRAL;

    if (createData.type == "creature") {
        disposition = CONST.TOKEN_DISPOSITIONS.HOSTILE
    }

    // Set wounds, advantage, and display name visibility
    mergeObject(createData,
        {
            "token.bar1": { "attribute": "characteristics.health" },        // Default Bar 1 to Health 
            "token.bar2": { "attribute": "characteristics.insanity" },      // Default Bar 2 to Insanity
            "token.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,     // Default display name to be on owner hover
            "token.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,     // Default display bars to be on owner hover
            "token.disposition": disposition,                               // Default disposition to neutral
            "token.name": createData.name                                   // Set token name to actor name
        })

    // Default characters to HasVision = true and Link Data = true
    if (createData.type == "character") {
        createData.token.vision = true;
        createData.token.actorLink = true;
    }
})

Hooks.on('updateActor', async (actor, updateData, options, userId) => {
    if (updateData.data &&
        (game.user.isGM || actor.owner)) {

        if (game.combat) {
            for (const combatant of game.combat.combatants) {
                let init = 0;

                if (combatant.actor == actor) {
                    if (actor.data.type == "character") {
                        init = actor.data.data.fastturn ? 70 : 30;
                    } else {
                        init = actor.data.data.fastturn ? 50 : 10;
                    }

                    game.combat.setInitiative(combatant._id, init);
                }
            }
        }

        const actorData = actor.data;
        const asleep = CONFIG.DL.statusIcons.asleep;
        const blinded = CONFIG.DL.statusIcons.blinded;
        const dazed = CONFIG.DL.statusIcons.dazed;
        const deafened = CONFIG.DL.statusIcons.deafened;
        const frightened = CONFIG.DL.statusIcons.frightened;
        const poisoned = CONFIG.DL.statusIcons.poisoned;
        const prone = CONFIG.DL.statusIcons.prone;
        const unconscious = CONFIG.DL.statusIcons.unconscious;
        const injured = CONFIG.DL.statusIcons.blood;

        for (const t of actor.getActiveTokens()) {
            if (t.data.actorLink && t.scene.id === game.scenes.active.id) {
                if (actorData.data.characteristics.health.injured &&
                    !t.data.effects.includes(injured))
                    await t.toggleEffect(injured);
                else if (!actorData.data.characteristics.health.injured &&
                    t.data.effects.includes(injured))
                    await t.toggleEffect(injured);
                if (actorData.data.afflictions.asleep &&
                    !t.data.effects.includes(asleep))
                    await t.toggleEffect(asleep);
                else if (!actorData.data.afflictions.asleep &&
                    t.data.effects.includes(asleep))
                    await t.toggleEffect(asleep);
                if (actorData.data.afflictions.blinded &&
                    !t.data.effects.includes(blinded))
                    await t.toggleEffect(blinded);
                else if (!actorData.data.afflictions.blinded &&
                    t.data.effects.includes(blinded))
                    await t.toggleEffect(blinded);
                if (actorData.data.afflictions.dazed &&
                    !t.data.effects.includes(dazed))
                    await t.toggleEffect(dazed);
                else if (!actorData.data.afflictions.dazed &&
                    t.data.effects.includes(dazed))
                    await t.toggleEffect(dazed);
                if (actorData.data.afflictions.deafened &&
                    !t.data.effects.includes(deafened))
                    await t.toggleEffect(deafened);
                else if (!actorData.data.afflictions.deafened &&
                    t.data.effects.includes(deafened))
                    await t.toggleEffect(deafened);
                if (actorData.data.afflictions.frightened &&
                    !t.data.effects.includes(frightened))
                    await t.toggleEffect(frightened);
                else if (!actorData.data.afflictions.frightened &&
                    t.data.effects.includes(frightened))
                    await t.toggleEffect(frightened);
                if (actorData.data.afflictions.poisoned &&
                    !t.data.effects.includes(poisoned))
                    await t.toggleEffect(poisoned);
                else if (!actorData.data.afflictions.poisoned &&
                    t.data.effects.includes(poisoned))
                    await t.toggleEffect(poisoned);
                if (actorData.data.afflictions.prone &&
                    !t.data.effects.includes(prone))
                    await t.toggleEffect(prone);
                else if (!actorData.data.afflictions.prone &&
                    t.data.effects.includes(prone))
                    await t.toggleEffect(prone);
                if (actorData.data.afflictions.unconscious &&
                    !t.data.effects.includes(unconscious))
                    await t.toggleEffect(unconscious);
                else if (!actorData.data.afflictions.unconscious &&
                    t.data.effects.includes(unconscious))
                    await t.toggleEffect(unconscious);
            }
        }
    }
});

Hooks.on('preCreateToken', async (scene, createData, options, userId) => {
    // return if the token has no linked actor
    if (!createData.actorLink)
        return;
    const actor = game.actors.get(createData.actorId);
    // return if this token has no actor
    if (!actor)
        return;

    const asleep = CONFIG.DL.statusIcons.asleep;
    const blinded = CONFIG.DL.statusIcons.blinded;
    const dazed = CONFIG.DL.statusIcons.dazed;
    const deafened = CONFIG.DL.statusIcons.deafened;
    const frightened = CONFIG.DL.statusIcons.frightened;
    const poisoned = CONFIG.DL.statusIcons.poisoned;
    const prone = CONFIG.DL.statusIcons.prone;
    const unconscious = CONFIG.DL.statusIcons.unconscious;
    const injured = CONFIG.DL.statusIcons.blood;

    const actorData = actor.data;
    const createEffects = [];
    if (actorData.data.characteristics.health.injured)
        createEffects.push(injured);
    if (actorData.data.afflictions.asleep)
        createEffects.push(asleep);
    if (actorData.data.afflictions.blinded)
        createEffects.push(blinded);
    if (actorData.data.afflictions.dazed)
        createEffects.push(dazed);
    if (actorData.data.afflictions.deafened)
        createEffects.push(deafened);
    if (actorData.data.afflictions.frightened)
        createEffects.push(frightened);
    if (actorData.data.afflictions.poisoned)
        createEffects.push(poisoned);
    if (actorData.data.afflictions.prone)
        createEffects.push(prone);
    if (actorData.data.afflictions.unconscious)
        createEffects.push(unconscious);
    createData.effects = createEffects;
});

Hooks.on('preUpdateToken', async (scene, token, updateData, options) => {
    const asleep = CONFIG.DL.statusIcons.asleep;
    const blinded = CONFIG.DL.statusIcons.blinded;
    const dazed = CONFIG.DL.statusIcons.dazed;
    const deafened = CONFIG.DL.statusIcons.deafened;
    const frightened = CONFIG.DL.statusIcons.frightened;
    const poisoned = CONFIG.DL.statusIcons.poisoned;
    const prone = CONFIG.DL.statusIcons.prone;
    const unconscious = CONFIG.DL.statusIcons.unconscious;
    const injured = CONFIG.DL.statusIcons.blood;

    if (updateData.effects) {
        if (token.actorLink) {
            // linked token
            const tokenActor = game.actors.get(token.actorId);
            await tokenActor.update({
                'data.afflictions': {
                    asleep: updateData.effects.includes(asleep),
                    blinded: updateData.effects.includes(blinded),
                    dazed: updateData.effects.includes(dazed),
                    deafened: updateData.effects.includes(deafened),
                    frightened: updateData.effects.includes(frightened),
                    poisoned: updateData.effects.includes(poisoned),
                    prone: updateData.effects.includes(prone),
                    unconscious: updateData.effects.includes(unconscious)
                },
                'data.characteristics.health': {
                    injured: updateData.effects.includes(injured)
                }
            });
        }
    }
});

Hooks.on("renderChatLog", (app, html, data) => AetherianItem.chatListeners(html));

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createAetherianMacro(data, slot) {
    if (data.type !== "Item") return;
    if (!("data" in data)) return ui.notifications.warn("You can only create macro buttons for owned Items");
    const item = data.data;

    // Create the macro command
    let command;
    switch (item.type) {
        case 'weapon':
            command = `game.aetherian.rollWeaponMacro("${item.name}");`;
            break;
        case 'talent':
            command = `game.aetherian.rollTalentMacro("${item.name}");`;
            break;
        case 'spell':
            command = `game.aetherian.rollSpellMacro("${item.name}");`;
            break;
        default:
            break;
    }

    let macro = game.macros.entities.find(m => (m.name === item.name) && (m.command === command));
    if (!macro) {
        macro = await Macro.create({
            name: item.name,
            type: "script",
            img: item.img,
            command: command,
            flags: {
                "aetherian.itemMacro": true
            }
        });
    }
    game.user.assignHotbarMacro(macro, slot);
    return false;
}

/**
 * Roll Macro from a Weapon.
 * @param {string} itemName
 * @return {Promise}
 */
function rollWeaponMacro(itemName) {
    const speaker = ChatMessage.getSpeaker();
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);
    const item = actor ? actor.items.find(i => i.name === itemName) : null;
    if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

    return actor.rollWeaponAttack(item.id);
}

/**
 * Roll Macro from a Talent.
 * @param {string} itemName
 * @return {Promise}
 */
function rollTalentMacro(itemName) {
    const speaker = ChatMessage.getSpeaker();
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);
    const item = actor ? actor.items.find(i => i.name === itemName) : null;
    if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

    return actor.rollTalent(item.id);
}

/**
 * Roll Macro from a Spell.
 * @param {string} itemName
 * @return {Promise}
 */
function rollSpellMacro(itemName) {
    const speaker = ChatMessage.getSpeaker();
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);
    const item = actor ? actor.items.find(i => i.name === itemName) : null;
    if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

    return actor.rollSpell(item.id);
}

/**
 * Create a Macro from an Attribute.
 * @param {string} attributeName
 * @return {Promise}
 */
function rollAttributeMacro(attributeName) {
    const speaker = ChatMessage.getSpeaker();
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);
    const attribute = actor ? actor.data.data.attributes[attributeName] : null;

    return actor.rollChallenge(attribute);
}

/**
 * Create a Macro from an Attribute.
 */
function rollInitMacro() {
    const speaker = ChatMessage.getSpeaker();
    let combatantFound = null;
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);

    for (const combatant of game.combat.combatants) {
        let init = 0;

        if (combatant.actor == actor) {
            combatantFound = combatant;
        }
    }

    if (combatantFound)
        game.combat.rollInitiative(combatantFound._id);
}

/**
 * Create a Macro for using a Healing Potion.
 */
function healingPotionMacro() {
    const speaker = ChatMessage.getSpeaker();
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);

    if (actor) {
        const currentDamage = parseInt(actor.data.data.characteristics.health.value);
        const healingRate = parseInt(actor.data.data.characteristics.health.healingrate);

        let newdamage = currentDamage - healingRate;
        if (newdamage < 0)
            newdamage = 0;

        actor.update({
            "data.characteristics.health.value": newdamage
        });


        var templateData = {
            actor: this.actor,
            data: {
                itemname: {
                    value: game.i18n.localize('DL.DialogUseItemHealingPotion')
                },
                description: {
                    value: game.i18n.localize('DL.DialogUseItemHealingPotionText').replace("#", healingRate)
                }
            }
        };

        let chatData = {
            user: game.user._id,
            speaker: {
                actor: actor._id,
                token: actor.token,
                alias: actor.name
            }
        };

        let template = 'systems/aetherian/templates/chat/useitem.html';
        renderTemplate(template, templateData).then(content => {
            chatData.content = content;
            ChatMessage.create(chatData);
        });
    }
}

function requestRollMacro() {
    const speaker = ChatMessage.getSpeaker();
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);

    if (actor) {
        var templateData = {
            actor: this.actor,
            data: {
                itemname: {
                    value: game.i18n.localize('DL.DialogUseItemHealingPotion')
                },
                description: {
                    value: ""
                }
            }
        };

        let chatData = {
            user: game.user._id,
            speaker: {
                actor: actor._id,
                token: actor.token,
                alias: "GM"
            }
        };

        chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");

        let template = 'systems/aetherian/templates/chat/requestroll.html';
        renderTemplate(template, templateData).then(content => {
            chatData.content = content;
            ChatMessage.create(chatData);
        });
    }
}
