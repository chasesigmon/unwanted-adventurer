# Abandoned Realms — MUD Game Mechanics Reference

> Research compiled from https://abandonedrealms.com (public documentation pages) for use as **design inspiration** on a different game project. This is a reference document only — no mechanics here are to be copied verbatim into code; treat as a source of ideas for races/classes/skills/economy/world design.
>
> Compiled: 2026-07 (site content is dynamic/community-maintained and may change).

---

## Table of Contents

1. [Races](#1-races)
2. [Classes](#2-classes)
3. [Skills/Spells System (Training & Progression)](#3-skillsspells-system-training--progression)
4. [Cabals, Coteries & Religions](#4-cabals-coteries--religions)
5. [Economy](#5-economy)
6. [Items / Codex](#6-items--codex)
7. [Other Core Mechanics (Combat, Death, World Structure, Lore)](#7-other-core-mechanics)

---

## 1. Races

Source: https://abandonedrealms.com/realms/races/ and individual race pages at `/realms/races/<name>.php`

Races are balanced primarily through an **"experience cost" multiplier** — a percentage penalty to XP gain that scales with how powerful/exotic the race's stat block and abilities are. Human is the baseline (0 cost). This is a notable design pattern: instead of hard level caps or forbidding races, power is taxed via slower leveling.

General race data pattern per page: base stat block (STR/INT/WIS/DEX/CON), XP cost, allowed classes, innate abilities ("racial characteristics" like infravision, flight, size), class-specific "racial legacies" (unique abilities unlocked only when a specific race+class combo is chosen), resistances/vulnerabilities, and lore/flavor text.

### Full Race List (sorted by XP cost)

| Race | XP Cost | Base Stats (STR/INT/WIS/DEX/CON) | Allowed Classes | Notes |
|---|---|---|---|---|
| **Human** | 0 | 21/20/20/20/20 (+1 to primary stat) | All 18 classes + Freelancer (human-exclusive) | Baseline race; "flawed and impure," ambitious; friendly with Elves (parent of Half-Elf), disliked by Drow |
| **Gnome** | 200 | 18/23/25/21/18 | Warrior, Ranger, Rogue, Invoker, Illusionist, Bard, Druid, Riftward | Infravision, 100% Lore, small size, resist charm/mental, vulnerable to bash. Very high WIS/INT — excess practices can convert to health/mana/move |
| **Half-Elf** | 250 | 19/22/21/22/18 | Warrior, Ranger, Paladin, Rogue, Shadow, Monk, Invoker, Illusionist, Healer, Bard, Riftward | Infravision, improved learning, charm resistance; "accepted by neither" parent race |
| **Illithid** | 300 | 19/25/24/19/17 | Illusionist, Psionicist only | Cone of Force, Shock (self-heal-lockout state), Leech; resist charm/bash/lightning/arcane/mental; vulnerable to slash/light; evil subterranean mind-flayers |
| **Werebeast** | 300 | +20 to ALL stats | Ranger, Druid only | Transform (shapeshift, adds beast's main attribute), Probe (danger sense); requires rank 15 to gain animal form; hates Dwarves, distrusts arcane magic |
| **Dwarf** | 325 | 21/17/21/18/25 | Warrior, Berserker, Paladin, Healer, Druid | Infravision, 100% Berserk, resist magic/afflictive, vulnerable to drowning; poor swimmers; allies with Elves despite friction |
| **Duergar** | 325 | 21/18/19/20/22 | Warrior, Berserker, Dark-Knight, Rogue, Shadow, Shaman, Druid | Evil dwarves; infravision, 100% Berserk, resist magic/maledictive, vulnerable to drowning/light; most paranoid race |
| **Avian** | 350 | 19/21/20/23/18 | Warrior, Ranger, Dark-Knight, Rogue, Shadow, Invoker, Illusionist, Necromancer, Healer, Bard, Druid, Riftward | Flight (immune to trip, can travel without resting), resist mental, vulnerable to maledictive; bird-people gifted by the god Stryth |
| **Pixie** | 350 | 17/21/21/25/17 | Berserker, Ranger, Rogue, Invoker, Illusionist, Bard, Riftward | Infravision, tiny size, Pixie Dust (non-hostile buff use), Shrink Weapon; resist holy, vulnerable to sound, weak to iron; cannot lie; lose fey magic if they adopt a religion |
| **Halfling** | 350 | 18/19/21/24/20 | Warrior, Ranger, Rogue, Monk, Healer, Bard, Riftward | Infravision, 100% Steal, blackjack bonus, resist negative/maledictive; excellent dodge, poor parry |
| **Jotun** | 350 | 22/18/23/16/21 | Paladin, Dark-Knight only | Giant-sized (can 1-hand oversized weapons); resist cold/arcane, weak to obsidian, vulnerable to piercing; descendants of the evil "Eternal Army" |
| **Slith** | 400 | 21/18/17/22/22 | Warrior, Rogue only | Swallow Corpse, Shed Skin, Tail Attack, 100% Spear; resist disease/maledictive, vulnerable to charm; solitary lizardmen, historically non-magical |
| **Fire Giant** | 400 | 25/15/15/16/23 | Warrior, Berserker, Shaman | 100% Bash & Enhanced Damage, Blazing Ember, oversized weapons 1-handed; resist weapon/bash/fire, vulnerable to cold/mental; always evil |
| **Treant** | 400 | 22/21/23/15/22 | Warrior, Druid only | Oversized weapons 1-handed; resist cold/wood/weapon, vulnerable to fire; ancient sentient trees, neutral alignment |
| **Storm Giant** | 450 | 24/17/17/16/23 | Warrior, Berserker, Monk, Healer | 100% Bash & Enhanced Damage, Called Lightning, swimming, oversized weapons; resist weapon/bash/lightning/drowning, vulnerable to mental; always good, peaceful, allies with Elves/Gnomes |
| **Stone Giant** | 500 | 24/16/16/16/23 | Warrior, Berserker only | 100% Bash & Enhanced Damage, Stonesplit Shout, oversized weapons; resist weapon, vulnerable to mental; neutral, friendly with Dwarves/Sliths |
| **Quasit** | 500 | 16/24/22/22/18 | Rogue, Invoker, Illusionist, Psionicist, Shaman | Infravision, small size, Doppelganger, Cause Fear; vulnerable to holy; former demon-familiars, cowardly but dangerous |
| **Minotaur** | 500 | 23/17/18/17/23 | Warrior, Berserker, Shaman | 100% Charge, dual-wield any two axes, oversized weapons; resist bash, vulnerable to charm; chaotic, glory-in-combat culture |
| **Elf** | 500 | 18/25/21/23/15 | Warrior, Ranger, Paladin, Rogue, Invoker, Illusionist, Psionicist, Healer, Bard | Infravision, innate Sneak, resist charm, weak to iron; ancient, graceful, long-lived, honor-focused |
| **Drow** | 500 | 18/24/18/24/16 | Warrior, Dark-Knight, Rogue, Shadow, Invoker, Illusionist, Necromancer, Psionicist, Shaman, Bard | Infravision, innate Sneak, resist charm, vulnerable to light, weak to silver/mithril; evil elves, matriarchal, must stay evil to cast; hate humans |
| **Jagar** | 500 | 18/18/23/23/20 | Warrior, Berserker, Ranger, Rogue, Monk, Illusionist, Shaman, Druid | Jaguar-human hybrids; resist lightning, vulnerable to cold; distrustful of authority/gods, protect wilderness |
| **Ayr** | 500 | 21/19/25/21/19 | Warrior, Paladin, Psionicist, Healer | Small (gnome-sized), Overclock, Vent Motes, resist charm/pierce; sentient wisp+machine beings from a crashed starship; exclusively Lawful Good; **population is finite** — permadeath permanently reduces the race's population (discouraged for new players) |
| **Void-elf** | 500 | 18/25/21/23/15 | Riftward only (exclusive) | Resist charm, weak to iron; elves mutated by a reality-tearing cosmic event; maddened by "whispers from the void" but gained cosmic insight; must stay neutral to avoid destabilizing further |

### Design takeaways for races
- **XP-cost-as-power-tax** is the core race-balancing lever, rather than hard stat caps alone.
- **Racial Legacies**: many races grant *extra* unique abilities that only trigger for specific race+class pairings (e.g., Halfling Rogue "Master of Mischief," Elf Warrior "Dance of Silver Leaves," Drow Dark-Knight "Auspice of Ilythir"). This is a strong hook — a matrix of race×class bonus abilities layered on top of the normal class kit.
- **Giant subrace split** (Fire/Storm/Stone) all share "100% Bash/Enhanced Damage" and oversized-weapon mechanics but differ in alignment, secondary stats, and unique signature ability (Blazing Ember / Called Lightning / Stonesplit Shout).
- **Population-limited race** (Ayr) — an unusual permadeath-scarcity mechanic tied to lore (destroyed mothership, no new members).
- Class-gating by race is common (e.g., Illithid can only be Illusionist/Psionicist; Jotun only Paladin/Dark-Knight) — race strongly shapes narrative/mechanical identity rather than being a pure reskin.

---

## 2. Classes

Source: https://abandonedrealms.com/realms/classes/ and individual pages at `/realms/classes/<name>.php`

**19 classes total**, grouped by the site into five archetype families:
- **Fighters**: Warrior, Berserker, Ranger
- **Stealth**: Rogue, Shadow
- **Clerics**: Healer, Shaman (plus Druid and Riftward as nature/planar clerics)
- **Mages**: Invoker, Necromancer, Illusionist (plus Psionicist as a self-taught "mage")
- **Hybrids**: Bard, Paladin, Dark-Knight (highest XP cost in the game due to versatility)
- Plus two special/unlockable classes: **Vampire** (unlocked via Dark-Knight) and **Freelancer** (human-only classless starter)

### Warrior — "Standard" melee tank/damage
- Foundational melee class: high defense + high damage, exceptional stunning ability, poor vision/mobility, needs group support.
- Levels 1-10: weapon profs (axe/dagger/flail/mace/polearm/bow/sword/spear/whip/staff), shield block, parry, kick, rescue, enhanced damage, dirt kick, sideswipe, second attack, fast healing, blind fighting.
- Levels 12-28: third attack, dual wield, charge, trip, bash, berserk, warcry, barrage, overhead crush, counter, windmill cleave, overpower, athleticism.
- Levels 30-40: hobble, offhand disarm, fourth attack, riposte, martial instinct, momentum, double grip.
- Stat priority: CON (shield block), hitroll/damroll.

### Rogue — Stealth/ambush striker
- Evolved narrative from spies/scouts/thieves into modern "delinquents" (pranks, traps, theft, murder).
- Key kit: Backstab (12), Steal (16), Dual Wield (22), Dual Backstab (30), Pick Lock (4), Sneak (4), Disarm (12), Trip (15), Envenom (15), Poison Shot (16), Weapon Finesse/Throw/Uncanny Attack (17), Explosive Shot (19), Hook Shot/Blackjack/Gag (20), Pry (21), Edge Craft (22), Pilfer (23), Alarm Door/Third Attack (25), Clobber (26), Alacrity (28), Cheap Shot (30), Weapon Improvise/Drug Other (35), Trip Wire (40), Disguise (45), Strap Slash/Street Justice (50).
- No self-heal; relies on HEALTH+DAMROLL over hitroll (backstab doesn't need hitroll); racial variety hugely affects flavor (Halfling 100% Steal, Gnome trap mastery/100% Lore, Slith Swallow Corpse/Tail Attack, Quasit Doppelganger/Cause Fear, Avian flight).

### Illusionist — "Mages of Beguilement" (mental/deception)
- Split from the original Mage guild after the Great War; mastery of mental magic.
- Notable spells: Hob Spark, Ventriloquate, Detect Magic (early); Invisibility, Mirror Image, Gate, Marionette (mid); Duplicate, Prismatic Spray, Project Image, Transmogrify (late).
- Duplicates expire fast but multiply damage; Dispel Magic strips buffs for burst windows; Weapon Ward blocks physical skills/style penalties.

### Invoker — "Mages of the Elements"
- Elemental damage-dealer; can specialize into a chosen element, modifying abilities.
- Notable spells: Magic Missile, Detect Magic, Invisibility, Armor, Enchant Weapon (early); Lightning Bolt, Ice Shield, Protective Shield, Flame Arrow, Ice Storm, Sanctuary (mid); Chain Lightning, Meteor Swarm, Hellstream, Elemental Mastery, Ray of Vindication (late).
- Enchant Weapon doubles as a player-service income source.

### Necromancer — "Mages of the Undead"
- Manipulates death/undead/souls: "capturing of souls."
- Raise Skeleton (early), Curse/Blindness/Poison/Vampiric Touch/Energy Drain, Sleep/Hold Undead, Flesh Golem (mid); Animate Corpse, Wraith Summon, Ghoul Touch, Acid Blast, Absolute Zero, Powerword Kill, Phylactery, Apocalypse, Hellgate (late).
- Unique mechanic: builds an undead "army" (skeletons/zombies/golems/wraiths) as pseudo-pets/DPS.

### Psionicist — "Mages of the Mind"
- Self-taught, internal magic; **cannot be silenced/blasphemed** (immune to standard anti-caster tools) but very vulnerable to concentration breaks/distraction.
- 70+ spells: Mind Thrust, Psionic Sphere, Kinesis, Convergence, Ego Whip, Psionic Blast, Hypnosis, Clairvoyance, capstone Flashback (50).
- Weak at healing/support compared to Illusionist/Invoker.

### Healer — "Defensive Cleric"
- Pacifist support caster; gains bonus XP specifically from healing/curing others.
- Cure Light → Cure Serious/Critical → Heal; Protective Shield, Turn Undead (28), Sanctuary, Heaven's Gate, Holy Word, Dispel Magic, Esuna.
- Zero self-damage focus; entirely support-oriented economy of play.

### Shaman — "Offensive Cleric" (evil)
- Dark priest, "prophets of death and suffering," must stay evil.
- **Maledictions** (curses/hexes) as signature toolkit: Curse, Hex, Plague, Faerie Fog, Phantom Grasp, Demonic Push, Insomnia, Flay Health, Dysentery, Dark Shroud, Blasphemy, Hysteria, Banes, Conversion; also Cause Wounds line, Energy Drain, Harm, Frenzy, Sanctuary.
- Appearance visibly corrupts (skeletal/demonic) from dark communion.

### Druid — "Cleric of Nature"
- Neutral, non-deity nature priest; avoids metal weapons, uses a druidic staff for many abilities.
- Faerie Fire, Earthquake, Wild Shape (20), Dreamwalk, Astral Form, Summon Stag (high level); "racial circles" grant extra race-specific abilities.
- Philosophy mirrors monk energy-balance (good/bad deeds return as karma-like energy).

### Riftward — "Clerics of the Planes" (newest class, Third Age)
- Neutral-only planar specialist; anchors Serin against "entropy of the Prime Planes."
- Cure Light, Ether Ward, Void Bolt, Mending Aura, Cure Serious (early); Astral Ward, Sanctuary, Primeval Ward, Ethereal Jaunt, Shield of Acadia (mid); Voidstep, Eldritch Ward, Oblivion Ward, Cataclysm, Celestial Radiance, Cosmic Reverence, Entropic Cascade (late).
- Restricted to a small set of races (Human, Halfling, Gnome, Avian, Half-elf, Pixie, Void-elf).

### Ranger — "Warriors of Nature"
- Elven-warrior-descended wilderness archer/skirmisher with animal companions (falcon, boar, panther, grizzly bear via Tame/Beast Call).
- Volley, Camouflage, Keen Sight, Scout, Barkskin (early); Point-Blank Shot, Wounding Shot, Pathfinding, Beast Call, Falcon Strike, Aerial Shot, Dual Parry, Flare Shot (mid); Called Shot, Quick Volley, Snap Shot, Ambush, Shield Throw, Double Disarm, Parting Shot, Leading Shot (late).
- Best played hit-and-run (flee/engage cycle), especially vs. casters.

### Berserker — "Warriors of Rage"
- Dwarven-origin rage-fighters; core resource is **Fury**, capstone ability **Rage** (level 8) — advised to save it to finish fights, not open with it.
- Headbutt, Blood Bath, Roar, Charge, Berserk, Warcry, Rampage (mid); Weapon Cleave, Flurry, Boiling Blood, Decapitate, Ignore Pain (late).
- **Specialization system at level 35+**: choose one of 5 "Devotion" paths — Fury (Restraint), Power (Devastate + fast regen), Death (full Ignore Pain), Glory (Glorious Heart — intimidation), Destruction (Meltdown + Decapitate mastery). This is the game's clearest example of a **late-game skill-tree/subclass branch**.

### Shadow — "Deadly Martial Artists" (descended from Rogue guild)
- Burst-then-escape playstyle; dual-wield, poison, smoke, ninja arts.
- Hide/Sneak/Invisibility/Vanish (escape kit); Assassinate; "Shadow Arts"/"Forgotten Arts" — named finishing techniques: Art of Phoenix/Tarantula/Scorpion/Condor, Searing/Frozen/Corrosive/Lightning Shuriken, Acupuncture, Blindness Dust, Obscuring Smoke, Shadow Dance (40-50).

### Dark-Knight — "Warriors of Evil" (from the "Eternal Army")
- Melee/caster hybrid specializing in plagues, elemental attacks, stunning.
- Signature dark magic: Pestilence, Vile Presence, Chill Touch, Unholy Armor (early); Faerie Fire, Chaos Bolt, Curse, Energy Drain, Silence, Plague (mid); Fireball, Iceball, Harm, Souleater, Blasphemy, Guillotine (late).
- **Soul Pact choice**: Devils (V) — lawful, control/self-preservation — vs. Demons (D) — chaotic, conquest/destruction. A binary alignment-flavored subclass choice.
- Feeds into the **Vampire** unlock (see below).

### Monk — Martial artist (trains at monasteries, not guildhalls)
- Hybrid of healing/tanking/damage via unarmed combat; light armor only; alignment locked until rank 10 (starts lawful-ish, can't be chaotic).
- **Combat styles** (only one active at a time): Snake, Panda, Crane, Monkey, Mantis, Leopard, Tiger, later Dragon — switching styles is core strategy.
- **Ki system**: two separate ki gauges (internal / external flowing ki) fuel abilities.
- **Tattoo specialization**: permanently tattoo to specialize into a style track, progressing novice → grandmaster (a form of permanent build commitment/skill tree).
- Late abilities: Acupuncture, Astral Walk, Transcendence, Serenity.

### Bard — Song-based hybrid/rogue
- "Musical talents...affect mood, mentality, health, and spirit" of those around them.
- Songs function like short-duration spells needing frequent re-application (Compose/Refrain/Tune/Crescendo/Cross Fade modifiers).
- Combat kit: enhanced damage, dodge, parry, kick, 2nd/3rd attack, dual wield, fencing, counterbalance; utility: sneak, pick lock, lore, meditation, eavesdrop, throw, disguise, panhandling.

### Paladin — "Warriors of Divinity"
- Holy knight, formed during the Alliances era to oppose the Eternal Army; virtues of chivalry/mercy/honor.
- **Sacred Oath choice at level 15**: Devotion (D, defense/healing), Eradication (E, anti-evil combat), Valor/Reckoning (V/P, offensive power) — another branching subclass mechanic.
- Cure Light → Cure Serious, Lay on Hands, Turn Undead, Cure Disease, Sanctuary, Virtuous Light (mid); Errantry (flight without potions), Steed (mount), Consecration, Guardian/Avenging Angel, Radiance, Paragon (late).
- Wrath spell deals bonus damage specifically to evil targets.

### Vampire — Unlockable "prestige" class (not chosen at creation)
- **Unlock requirements**: must be a Human Dark-Knight, rank 30, non-lawful ethos, "exceptional roleplay ability," and level 50.
- Joins the **Covenant of Blood** — exchanges mortality for power.
- Day/night power cycle: full power only at night; sunlight weakens severely; "sunburn" forces resting in a coffin to recover; young vampires take heavy fire damage (improves with "age").
- Must drain blood from fresh corpses to sustain itself.
- Abilities: Bloodlust (1), Vampiric Touch & Energy Drain (16), Bat/Wolf/Mist Form (30/40), Dark Thrall (40).
- This is a strong example of an **endgame prestige-class conversion gated by roleplay + specific prior-class history**, not just a stat/level gate.

### Freelancer — Human-only classless starter
- "A classless adventurer" who samples skills from multiple classes without specializing.
- Starts lawful-neutral; **must convert to a full class at rank 26** via PATH (choose alignment/ethos) then CLASSCHOICE (lock in class); unrelated practiced skills are refunded, relevant ones retained.
- Functions as a risk-free trial period for undecided new players — a notable onboarding design pattern.

### Design takeaways for classes
- **Subclass/specialization branch points recur across multiple classes** at different levels: Berserker Devotion (35), Paladin Sacred Oath (15), Dark-Knight Soul Pact (early), Monk style tattoo (progressive). This is a strong pattern to borrow: mid-to-late-game binary/multi-way branching that changes available abilities without a full reclass.
- **Prestige/unlockable class** (Vampire) gated behind a specific base class + rank + roleplay, converting rather than starting fresh.
- **"Trial" class** (Freelancer) lets new players delay commitment with a refund-based conversion system.
- Every class page repeats a consistent tactical-tips template (fly-scroll/protective-shield to avoid bash/trip lock, savebreak gear, potions to cover missing detection, matching weapon/style to counter opponents) — suggesting the game deliberately designs *symmetric counterplay tools* available to every class rather than fully unique kits.

---

## 3. Skills/Spells System (Training & Progression)

Sources: in-game HELP PRACTICE / HELP TRAINING (via abandonedrealms.com/search.php), abandonedrealms.com/help/newbie/, class pages.

- **Level cap: 50** (Immortal/staff-only ranks exist above 51+, called "Immortals," with their own hierarchy up to at least rank 60).
- Two parallel resources are earned on level-up:
  - **Practice sessions** — spent via the `PRACTICE` command to raise a skill/spell from 0% up to a **75% baseline cap**, learned from a **guildmaster** (found in every hometown; Monks train at a monastery priest instead). Higher **WISDOM** = more practice sessions per level; higher **INTELLIGENCE** = more % gained per practice invested.
  - **Training sessions** — earned **every 5 ranks**, spent at the Training Grounds (Seringale, NW of North Square) to raise a core attribute (STR/INT/WIS/DEX/CON) up to the character's **racial maximum**, or converted into flat Health (+10) / Mana (+15) / Movement (+20) pools.
  - **Trains and practices are mutually convertible** ("convert these into practice sessions, or vice versa") — a resource-allocation choice between "more/better skills" vs. "better raw stats."
  - Recommended new-player priority: max **WIS and CON** first (WIS compounds future practice income; CON is HP), before spending elsewhere.
- **Skills grow past the 75% guildmaster cap purely through use in play**: "At least one practice must be spent for a skill to raise through use" — i.e., a skill needs a nonzero investment to be "unlocked" for passive on-use growth beyond the trained percentage. This creates a two-phase mastery curve: buy-in via practice, then organic mastery via repetition.
- Commands: `SKILLS`, `SPELLS`, and (Bard-specific) `SONGS` list currently available abilities per class/level.
- No explicit skill-tree UI is documented beyond the **class-specific branch points** noted in section 2 (Devotion/Oath/Soul Pact/monk styles) and **racial legacies** (bonus abilities from race+class combos).

---

## 4. Cabals, Coteries & Religions

Source: https://abandonedrealms.com/realms/cabals/, /realms/coteries/, /realms/religions/, /realms/immortals/

### Cabals (large-scale PvP/warfare factions, 5 total)
All cabal members: gain "extra unique abilities," must defend a **holy shrine**, and earn a cabal-specific **soft currency** that cannot be looted on death. Picking up a cabal's holy relic **removes PK-range protection** and prevents concealment/transport/escape from attackers — a risk/reward "flag carrier" mechanic.

| Cabal | Theme | Alignment lean | Currency | Notes |
|---|---|---|---|---|
| **Knight** (Knights of Valour) | Good, honor-bound monster/evil hunters; Code of Chivalry | Good | Medals (from defeating overlords, redeemed at Seringale arena) | Founded after Queen Victoria's betrayal-assassination by traitor-knight Rodyn; joining = application → squireship under a mentor → interview |
| **Legion** (Legion of Darkness) | Conquest/domination, pacts with lower planar entities | Evil | — | Resurrected/corrupted by shaman Rodyn; admission = lethal trials + strategy/warfare tests |
| **Justice** | Law enforcement, flags & punishes criminals in civilized zones | Lawful | — | Patron deity Stryth; attacking anyone in town during evaluation = auto-reject |
| **Keeper** (Sentinels of Balance) | Prevents overly-powerful individuals/artifact hoarding; will fight for the weaker side | Amoral/necessity-driven | Relics (from questing/bosses, redeemed at Timaran) | Members must **renounce all rare/unique/non-cabal items** — a self-imposed equipment handicap balanced by diplomacy/alliance play |
| **Warlord** (Masters of War) | Formal 1v1 honor-duel culture, permanent win/loss records | Neutral/honor-focused | — | Legacy of immortal-warrior Diocletian |

### Coteries (non-combat roleplay/lore factions, 4 total)
All require **level 20+**, "superbly written" character background, strong roleplay, and membership in an umbrella org called **"the Consortium."** Open to all alignments/races/classes.

| Coterie | Theme | Purpose |
|---|---|---|
| **Scholar** | Interdisciplinary researchers | Merged remnant of old Herald+Mystic focuses; runs events, publications, Codex updates |
| **Herald** | Historians/journalists | Chronicles events for the in-world "Serin Mystique" publication; reports to superiors called "the Winds" |
| **Mystic** | Magic scholars / mentors | Vets religious sincerity, mentors new players, maintains the Codex (items/areas/creatures); tied to deep lore (founder Denadlyr, the catastrophic "Invasion" caused by leader Malenfaler's demon pact) |
| **Strife** | Honor-duel guild for retired/non-cabal fighters | Founded by retired paladin Luminetar; cabal members can retire into it, non-cabal players vetted by "the Arena Juggernaut" |

### Religions (14 deities)
Source: /realms/religions/. Each deity has a domain and alignment; followers progress through titles (**Initiate → Disciple → Adept**, no further mechanical detail found on the public page).

| Deity | Domain | Alignment |
|---|---|---|
| Vanisse | Water, Law | Lawful Good |
| Kedaleam | Luck | Lawful Good |
| Lumubella | Earth | Neutral Good |
| Phostan | Storm | Neutral Good |
| Avenar | Sun | Chaotic Good |
| Ceridwel | Lightning, Balance | Chaotic Good |
| Olyn | Arcane | Lawful Neutral |
| Varliv | Air | True Neutral |
| Valindra | Fire | Chaotic Neutral |
| Lorne | Blood, Plague | Chaotic Neutral |
| Davairus | Ice, Acid | Lawful Evil |
| Resatimm | Trickery | Neutral Evil |
| Vhrael | Shadow | Chaotic Evil |
| Dogran | (unspecified) | Chaotic Evil |

Interestingly, several deity names (Avenar, Lumubella, Valindra) also appear as **"Immortal" staff/admin-tier player characters** in the game's meta-hierarchy (level 51+), implying the pantheon and the "game master" layer are narratively the same entities — long-time top players effectively ascend into godhood in the fiction.

### Design takeaways for factions
- Cabals = **PvP war factions** with an item-based "flag" objective (holy relic) that trades safety for power — a classic capture-the-flag risk mechanic layered onto a MUD.
- Coteries = **pure roleplay/journalism factions**, entirely orthogonal to combat, gated by writing quality rather than mechanical stats — a good pattern for non-combat progression tracks.
- Deity/religion layer is thin mechanically (public docs) but rich narratively, and blurs into the admin/"Immortal" tier — gods are (former) players.

---

## 5. Economy

Source: https://abandonedrealms.com/economy/

### Currencies
- **Gold coins** — primary, lootable on death, the base spend/earn currency.
- **Soft, non-lootable cabal currencies** (can't be stolen/lost): **Medals** (Knight cabal, from defeating overlords, spent at Seringale arena), **Relics** (Keeper cabal + general questing/bosses, spent at Timaran; also earned for Codex item submissions — 5 relics per submission), **Chips** (Herald coterie roleplay events, spent at the Herald's tavern).
- **Shards** — crystal currency from Druid foraging or destroying rare items at "the Fireforge."

### Earning gold
- Killing NPCs ("mug your nearest inanimate denizen") — the most common method.
- **Quests** — one-time-per-character, tracked via a `QUESTOR` command.
- **Tasks** — repeatable shopkeeper/guildmaster errands (fetch/deliver/greet) for pay.
- Selling to shops (vendors buy related items when they have recent sales revenue — implies a simulated shop "float"/liquidity mechanic).
- Goblin bounty (turn in goblin corpses near Seringale's south gate).

### Spending / money sinks
- Food & drink upkeep (ongoing maintenance cost).
- Temple healing (expensive last-resort cure).
- Gambling: tavern games + randomized gear purchases from armorers/jewelers (loot-box-like uncertainty).
- **Banks**: located in every hometown; deposit gold to protect it from death/looting, but pay a **withdrawal fee** to take it back out — a friction-based anti-hoarding/anti-loot-farming mechanic. Advice given: always keep enough liquid for recall potions/gyvels/guild outfit.

### Crafting / Gathering
- **Enchanting**: spend Relics or Medals to add up to **5 enchant "layers"** to weapons/armor at the Forgemaster (Seringale, mundane enchants) or the Chamber of Invokation (magical enchants, via an Invoker) — going beyond 5 layers requires an Invoker's help.
- **Forging** (multi-stage, high-risk-high-reward crafting minigame):
  1. **Mining** — travel to Grimforge Mountain, open boulders, avoid a wandering "Black Magician" NPC, gather ore types: Silver (damroll), Gold (hitroll), Platinum (HP), Mithril (saves), Coal (crushes into Shards).
  2. **Smelting** — load ore + a gem into a furnace, wait through 10 "smoulder" cycles.
  3. **Shaping** — place the ingot in a template and follow a hammer/grip minigame sequence (timed ~4-5 sec apart).
  4. **Finalizing** — dunk the finished piece in a pool.
  - Ore *quantity* affects final armor class/tier chance; *performance* at the forge (including the finishing "pool crapshoot") affects penalties. Gem level gates maximum tier (e.g., a level-15 blue gem caps at tier 3 / 15 ores).
  - Explicit warning that this is a **full-loot PvP world** — forged gear can be lost instantly to another player.
- **Crafting stations** (Seringale, NPC-staffed): Brewing (Echuir the Witch), Jewelcrafting (Mire the Jeweler), Armor Forge (Pel), Leatherworking (Anga); cooking via campfire/`PATTERN` command.

### Trading
- **Trading Post / auction house** (Seringale, NPC "Rimath the trader") for LIMITED (rare/unique) items: `submit`, `cancel`, `list`, `bid`, `collect` commands. Explicit buyer-beware warning that item name/level alone don't guarantee stats — you must inspect before bidding.
- **Pawn Shop** (Darkhaven, NPC "Vinnie"): a **bounty system** — `contract [object] [amount]` to bounty an item, or `contract [player]` to put a bounty on a player's head; only Darkhaven-hometown characters can collect contracts. A built-in assassination/reward economy layered on top of PvP.

### Design takeaways for economy
- Multiple **parallel non-fungible currencies** tied to specific factions/activities (prevents one universal grind from trivializing all systems).
- **Full-loot death** is the central economic tension — banks (with fees) and non-lootable soft currencies are explicit answers to that risk.
- The **forging minigame** is a genuinely interesting multi-step crafting loop (gather → smelt → shape → finish) with quality/RNG layered on top of player skill/timing — a strong reference for a crafting system with real stakes (full loot).
- **Bounty board tied to a specific hometown** turns economy into a PvP incentive layer.

---

## 6. Items / Codex

Source: https://abandonedrealms.com/realms/areas/items/

### Categories
- **Weapon**
- **Armor** (subtypes: clothing, light, medium, heavy, non-metal)
- **Consumables** (potions/pills/scrolls/wands/staves — see "Preps" in section 7)
- **Misc**
- **Jewelry**

### Tracked attributes per item
The Codex search/filter exposes a large attribute set per item: `hitroll, damroll, ave (average damage), ac, strength, intelligence, wisdom, dexterity, constitution, luck, health, mana, move, hp regen, mana regen, movement regen, concentration, save vs spell, save vs maledictive, save vs mental, save vs afflictive, spell break, maledictive break, mental break, afflictive break, level, value`, plus **alignment restriction** (Orderly/Non-Orderly/Wild/Good/Neutral/Evil) and a **two-handed** flag.

### Notable mechanics
- Items can become **outdated** (Codex flags this, implying periodic rebalancing/power creep management).
- Community-sourced identification: players submit newly-identified/appraised items to keep the Codex live, earning Relics as a reward (5 per submission) — crowdsourced wiki-as-gameplay-loop.
- Enchant "layers" (see Economy) act as a soft +N modifier system, capped at 5 without special help.
- Weapon type and combat style form **rock-paper-scissors cycles** used for both offense and defense balancing (see section 7).

### Design takeaways for items
- A single unified stat schema across all gear (rather than per-slot bespoke stats) simplifies itemization and enables systematic search/filter tooling — worth mirroring in a design doc/spreadsheet for any itemization system.
- The "outdated" flag + crowdsourced identification loop is a clever way to keep a live item database maintained by the player base rather than devs alone.

---

## 7. Other Core Mechanics

Source: https://abandonedrealms.com/gameplay/, historical timeline at /realms/, roleplay/alignment help, monster compendium.

### Combat fundamentals
- Built on classic DikuMUD conventions: **d20-based** attack resolution.
- **Rock-paper-scissors layers** used deliberately to prevent any one build from being dominant:
  - **Weapon type**: Blades > Shafts > Segments > Blades (cyclic advantage).
  - **Combat style**: Two-hand > Dual-wield > Defensive > Two-hand (cyclic).
- **5 core attributes**: Strength (carry capacity, melee damage, weapon strength reqs), Intelligence (mana pool/regen, skill learning rate), Wisdom (practice sessions, mana, skill improvement), Dexterity (hit chance, dodge, carry capacity, AC), Constitution (HP/level, healing speed, and the permadeath tracker below).
- **Melee defense layers** (weakest → strongest as build matures): Armor Class (easily bypassed after ~level 35), Shield Block (WIS/CON), Dodge (DEX), Parry (STR, modified by weapon-type matchups).
- **Damage types**: Physical (pierce, bash, slash, negative) and Magical (fire, cold, water, lightning, energy, divine, mental).
- **Immunity priority**: IMM > VULN > RES (an immunity always overrides a listed vulnerability or resistance).
- **Magic categories**: Afflictive (direct damage — Invoker specialty), Maledictive (curses/negative energy — Necromancer/Shaman specialty), Mental (varied — Illusionist/Psionicist specialty). Defended against via **"SAVE VS SPELL"**-type gear rather than melee defenses (~40% natural resistance baseline); attackers can equip **"savebreak"** gear to punch through enemy saves — an itemized offense/defense arms-race stat pair.
- **"Preps"** (consumable-use items, each with its own use-verb): Potions (`quaff`), Pills (`eat`), Scrolls (`recite`, class-restricted), Wands (`zap`, class-restricted), Staves (`brandish`, class-restricted).
- **Pulse system**: each second = 4 pulses; commands only resolve on pulse ticks; combat actions incur pulse-measured lag; queued commands execute in order (you commit once queued — no cancel).
- **Adrenaline**: triggered by recent combat (PvE, defensive PvP, or aggressive PvP); blocks quitting temporarily; **PvP-sourced adrenaline lasts 2x as long** as PvE-sourced and also affects stealth abilities — discourages combat-logging and reward-hopping between mobs/players.
- **Healing**: passive regen via `REST`/`SLEEP` (~30-second ticks); active cure spells (Healer specialty); some gear grants cure spells directly.

### Leveling & death
- **Level cap 50** (51+ = "Immortal"/staff tier, up to at least rank 60 seen in current roster).
- **PvP unlocks at level 10.**
- **PK range**: max 8-level difference between combatants, adjusted by each character's XP-cost multiplier (i.e., a high-XP-cost "powerful" race effectively has a tighter/wider usable range once normalized) — ties directly back into the race XP-tax design.
- **Permadeath-adjacent mechanic**: Constitution is a **finite lifetime pool** — "you will lose one constitution point every five deaths," and once CON drops too low, the character **dies permanently**. This is a soft/gradual permadeath curve rather than instant hardcore-mode, giving players a visible countdown and reason to avoid reckless death even in a non-hardcore ruleset.
- **Full looting on death** is standard (referenced repeatedly in economy/forging warnings) — corpses can be completely stripped by other players, which is why banks, non-lootable soft currencies, and the Pawn Shop bounty system all exist as counterweights.

### Alignment / Ethos (roleplay-enforced law layer)
- **Alignment**: Good ("Lightwalkers," don't attack other Goods; expected of Paladins/Healers), Neutral (don't attack unprovoked; excessive unjustified killing can shift you to Evil), Evil (exploit others freely; expected of Dark-Knights/Shamans).
- **Ethos** (secondary axis): Lawful / Neutral / Chaotic, cross-referenced with alignment (e.g., Lawful Good, Chaotic Evil) to produce classic 9-box alignment grid behavior.
- **Rule enforcement**: "Lawfuls don't attack other players in Seringale" (safe-zone rule); "ICA = ICC" (in-character actions have in-character consequences) — alignment violations risk staff/"Immortal" punishment, i.e., alignment is roleplay-policed, not just a passive stat.

### World structure
- **Five realms/planes**: **Serin** (mortal realm, the main playspace), **Acadia** (faerie realm, tied to Druids/Pixies), **Material Abyss** (demon realm), **Winter** (a "highly dangerous prison realm"), **Limbo** (where Immortals/staff-tier reside), and **Ether** (a chaotic plane surrounding all the others).
- **Hometowns**: Seringale (primary hub), Valour, Timaran, Darkhaven, Solace.
- **Leveling zone progression** (illustrative low-end path): Academy of Learning (1-4, near hometown temple) → The Mausoleum (3-10) / Goblin Village (5-10, cheap starter gear) / Sylvan Vale (5-10) → Drkshtyre Wood (10-45) / Emerald Forest (10-50) → The Orc Mountains (15-20), and dozens more named zones at higher tiers (Grimforge Mountain for ore, Towers of High Sorcery, Underworld, Winter Frozen Tundra, The Black Pyramid, Dragon Sea/Dragon Tower, etc. — 80+ areas total per the homepage's marketing copy).
- **Navigation**: `mm`, `map`, `worldmap`, `target`, `where`, `wayfind` commands; nexus fast-travel, caravans, and signposts as world-traversal aids.
- **Monster compendium** organized geographically by area, each entry tagged with level, Imm/Res/Vuln, and lootable Codex-linked items; includes named bosses/dragons (e.g., "Grazz't, the Fallen Emperor," multiple dragons like Xalthessa/Ixphenyl/Kyrinithax).

### World lore timeline (14 eras, useful as a template for "ages of the world" style backstory pacing)
1. **Beginning** (20,000 BP) — gods seed the world with core races; four founding guilds (warrior/mage/cleric/rogue) established; undead and gnomes introduced.
2. **Chaos Reign** (15,000 BP) — first undead war, "Bastions of Light" destroyed.
3. **Dragon Wars** (12,000 BP) — first global war; only 4 towns survive (Valour, Seringale, New Thalos, Darkhaven); vampires emerge afterward.
4. **Alliances** (10,000 BP) — cabals form around artifacts of power; 4 leaders ascend to immortality; Paladin and Dark-Knight guilds founded.
5. **The Great War** (5,000 BP) — Battle for Greginsham fractures races/guilds: giants split 3 ways, elves split into Elf/Drow, dwarves gain Duergar; multiple guilds branch into specializations (this is literally the in-fiction origin of most of today's class/race variants).
6. **Second Age** (1 AP) — reset event; new races added (Illithid, Slith, Minotaur, Werebeast); Clerics banished permanently, replaced by their splinter classes; Assassin cabal (now defunct/renamed?) opens.
7. **Dark Ages** (1,000 AP) — top-tier gods leave; power vacuum, decline.
8. **Taekir War** (1,200 AP) — 5 immortals killed; a god sacrifices himself to undo his own mistaken creation.
9. **New Thalos Falls** (3,000 AP) — a chaos-god secretly destroys a whole city.
10. **New Horizon** (4,000 AP) — succession of divine authority; new immortals ascend.
11. **The Return** (4,500 AP) — two major gods return; an ancient enemy awakens.
12. **The Invasion** (4,700 AP) — a prideful faction's demon pact nearly dooms the realm (directly tied to today's Mystic coterie lore).
13. **The Broken Arch** (4,750 AP) — factions unite against a shared dark-lord threat.
14. **Oblivion** (5,300 AP, most recent/current era) — a new villain opens portals; demons actively invading — i.e., the "current" live storyline.

### Design takeaways (general)
- The **guild-fracture-as-class-origin** narrative device (one guild splits into 2-3 specialized classes after a cataclysm) is an efficient way to justify why so many classes feel like variations on a theme (Mage → Invoker/Illusionist/Necromancer; Cleric → Healer/Shaman/Druid/Riftward; Rogue → Rogue/Shadow/Bard).
- **Gradual, countdown-based permadeath** (lose CON per every 5 deaths) is a middle ground between full permadeath and consequence-free death — worth considering for games wanting death to matter without being punishingly binary.
- **Full-loot PvP + counterbalancing safe systems** (banks w/ fees, non-lootable currencies, safe-zone law enforcement, bounty boards) form a coherent risk/reward economic loop rather than being one isolated feature.
- **Symmetric universal counterplay tools** (fly scrolls, clear potions, savebreak gear) given to every class regardless of kit keeps the rock-paper-scissors combat layer from calcifying into unbeatable hard-counters.

---

## Sources

- https://abandonedrealms.com/
- https://abandonedrealms.com/realms/
- https://abandonedrealms.com/realms/classes/ (+ 19 individual class pages)
- https://abandonedrealms.com/realms/races/ (+ 22 individual race pages, including void-elf)
- https://abandonedrealms.com/realms/cabals/ (+ 5 individual cabal pages)
- https://abandonedrealms.com/realms/coteries/ (+ 4 individual coterie pages)
- https://abandonedrealms.com/realms/religions/
- https://abandonedrealms.com/realms/immortals/
- https://abandonedrealms.com/gameplay/
- https://abandonedrealms.com/economy/
- https://abandonedrealms.com/realms/areas/
- https://abandonedrealms.com/realms/areas/items/
- https://abandonedrealms.com/realms/areas/monsters/
- https://abandonedrealms.com/roleplay/ (alignment/ethos)
- https://abandonedrealms.com/help/newbie/
- https://abandonedrealms.com/search.php?search=PRACTICE
- https://abandonedrealms.com/search.php?search=training

**Pages attempted but not found/accessible:** `/guides/levelling.php` (404), `/realms/areas/items/weapons/` (no distinct sub-page; weapon-type detail lives only in aggregate on class pages and the Codex filter attributes).
