import type { AppLanguage } from './appLanguage.js';

/**
 * The DARE Concept taxonomy: a CLOSED, versioned vocabulary of semantic
 * concepts (animals, water, family, …) used to notice themes that recur
 * across a dreamer's dreams, independent of the words or language each dream
 * was told in.
 *
 * - IDs are stable ASCII identifiers and never depend on the UI language.
 *   Display labels come from here, per UI language.
 * - The AI can only choose from CONCEPT_IDS (the analysis JSON schema
 *   constrains the output to this enum) and normalizeConcepts() filters,
 *   dedupes and caps whatever comes back, so nothing outside the taxonomy
 *   can ever be stored.
 * - IDs are never renamed or removed, only added (or deprecated with an
 *   alias), so a stored concept stays valid across versions. The version a
 *   dream was classified under is stored beside it (conceptVersion).
 *
 * Deliberately free of any Vite/browser-only code so both the frontend and
 * the Node backend can import it unchanged.
 */
export const CONCEPT_TAXONOMY_VERSION = 1;
export const MAX_CONCEPTS_PER_DREAM = 4;

export const CONCEPT_IDS = [
  'family',
  'children',
  'childhood',
  'friends_social',
  'romance_love',
  'marriage_weddings',
  'sexuality_intimacy',
  'pregnancy_birth',
  'death_loss',
  'public_figures',
  'body_health',
  'nudity_exposure',
  'role_identity',
  'transformation',
  'past_memory',
  'authority_power',
  'religion_spirituality',
  'supernatural_fantasy',
  'money_wealth',
  'crime',
  'home_dwelling',
  'work_career',
  'education_exams',
  'travel_journey',
  'vehicles',
  'technology_media',
  'food_eating',
  'performance_attention',
  'music_dance',
  'visual_writing_creativity',
  'sports_play',
  'celebration',
  'success_achievement',
  'animals',
  'water',
  'fire',
  'nature_landscape',
  'sky_weather',
  'flying_falling',
  'chase_escape',
  'danger_threat',
  'conflict_violence',
  'war_disaster',
  'being_lost',
  'confinement',
  'freedom',
  'rescue_protection',
  'failure_unprepared',
  'lateness_missing',
] as const;

export type ConceptId = (typeof CONCEPT_IDS)[number];

export interface ConceptInfo {
  en: string;
  he: string;
  /** Used only in the AI prompt. */
  definition: string;
}

export const CONCEPTS: Record<ConceptId, ConceptInfo> = {
  family: { en: 'Family', he: 'משפחה', definition: 'Parents, siblings, grandparents, relatives, or family life as a real presence in the dream (including the dreamer\'s own children as family, and affection between family members).' },
  children: { en: 'Children', he: 'ילדים', definition: 'Children or babies as a presence in the dream (someone\'s children, grandchildren, kids). Not the dreamer\'s own childhood.' },
  childhood: { en: 'Childhood', he: 'ילדות', definition: 'The dreamer as a child, childhood places/times/objects, or a distinctly childlike state.' },
  friends_social: { en: 'Friends & community', he: 'חברים וקהילה', definition: 'Friends, acquaintances, neighbours, groups, social gatherings, belonging or exclusion.' },
  romance_love: { en: 'Love & romance', he: 'אהבה ורומנטיקה', definition: 'Partners, exes, crushes, dating, longing for or losing a ROMANTIC bond. Affection between family members is NOT romance (that belongs to family).' },
  marriage_weddings: { en: 'Marriage & weddings', he: 'חתונה ונישואין', definition: 'Weddings, engagement, vows, being married or divorcing.' },
  sexuality_intimacy: { en: 'Sexuality & intimacy', he: 'מיניות וקרבה', definition: 'Sexual desire or acts, physical intimacy, seduction.' },
  pregnancy_birth: { en: 'Pregnancy & birth', he: 'הריון ולידה', definition: 'Being pregnant, giving birth, newborns, expecting.' },
  death_loss: { en: 'Death & loss', he: 'מוות ואובדן', definition: 'Dying, the dead (including deceased relatives), funerals, grief, permanent loss of a person.' },
  public_figures: { en: 'Famous people', he: 'אנשים מפורסמים', definition: 'Use ONLY when an identifiable public, famous, historical or political person appears in the dream AS THAT PERSON (the dreamer meets, sees or interacts with them). Do NOT use it because the dreamer IS a queen, king, Cleopatra, president, celebrity, or holds a famous or powerful role — that belongs to role_identity and/or authority_power.' },
  body_health: { en: 'Body & health', he: 'גוף ובריאות', definition: 'Illness, injury, medical settings, teeth or hair changes, aging, bodily sensations.' },
  nudity_exposure: { en: 'Nudity & exposure', he: 'עירום וחשיפה', definition: 'Being naked, underdressed, or exposed in a vulnerable way.' },
  role_identity: { en: 'Roles & identity', he: 'תפקידים וזהות', definition: 'The dreamer being someone else or holding a distinct role or persona (a character, a ruler, a queen or king, a historical or famous figure, a profession, a clown), self-image, mirrors.' },
  transformation: { en: 'Transformation', he: 'שינוי והתמרה', definition: 'Changing form or nature, metamorphosis, becoming different, rebirth.' },
  past_memory: { en: 'Past & memory', he: 'עבר וזיכרון', definition: 'A meaningful return to a past time, place or state, or an explicit memory/nostalgia context (an old era, revisiting the past). A deceased or familiar person appearing is NOT by itself past_memory.' },
  authority_power: { en: 'Authority & power', he: 'סמכות וכוח', definition: 'Bosses, leaders, rulers, police, judges, rank, holding or lacking power and control.' },
  religion_spirituality: { en: 'Religion & spirituality', he: 'דת ורוחניות', definition: 'God, prayer, sacred figures or places, rituals, spiritual experience.' },
  supernatural_fantasy: { en: 'Magic & fantasy', he: 'קסם ופנטזיה', definition: 'Explicitly supernatural, magical, mythical or impossible-fantasy content: magic, ghosts, vampires, monsters, superpowers, fairy-tale worlds. An unusual or dreamlike scene is NOT by itself fantasy.' },
  money_wealth: { en: 'Money & wealth', he: 'כסף ועושר', definition: 'Money, winning or losing wealth, shopping, luxury, poverty.' },
  crime: { en: 'Crime', he: 'פשע', definition: 'Robbery, theft, burglary, heists, smuggling and other criminal acts or criminal situations (as perpetrator, witness or victim). Do NOT add conflict_violence merely because a crime occurs; add it only if actual interpersonal violence or confrontation is also a meaningful element.' },
  home_dwelling: { en: 'Home', he: 'בית ומגורים', definition: 'The dwelling or home itself is meaningful: a house, apartment or palace as someone\'s home, moving, the rooms of a home. A building or room merely existing (a workplace building, a cinema) is not enough.' },
  work_career: { en: 'Work & career', he: 'עבודה וקריירה', definition: 'Workplace, colleagues, meetings, projects, professional duties, running a committee or organisation.' },
  education_exams: { en: 'School & exams', he: 'לימודים ובחינות', definition: 'School, university, teachers, exams, homework, learning.' },
  travel_journey: { en: 'Travel & journeys', he: 'נסיעות ומסעות', definition: 'Trips, foreign places, airports, journeys toward a destination, sightseeing.' },
  vehicles: { en: 'Vehicles', he: 'כלי רכב', definition: 'Cars, trains, planes, balloons, boats, spacecraft; driving or riding as a central action.' },
  technology_media: { en: 'Technology & media', he: 'טכנולוגיה ומדיה', definition: 'Phones, computers, screens, internet, files, films, recordings.' },
  food_eating: { en: 'Food & eating', he: 'אוכל ואכילה', definition: 'Meals, cooking, drinking, hunger, restaurants, the food industry.' },
  performance_attention: { en: 'Performance & attention', he: 'במה ותשומת לב', definition: 'A stage, an audience, being watched, presenting, the spotlight.' },
  music_dance: { en: 'Music & dance', he: 'מוזיקה וריקוד', definition: 'Music, singing, musicians, concerts, dancing or choreography, when meaningful in the dream.' },
  visual_writing_creativity: { en: 'Art & creativity', he: 'אמנות ויצירה', definition: 'Painting, drawing, sculpture, photography, writing and other visual or literary creative activity (making it or watching it being made).' },
  sports_play: { en: 'Sports & play', he: 'ספורט ומשחק', definition: 'Sports, games, competition, running events, playfulness.' },
  celebration: { en: 'Celebration', he: 'חגיגה', definition: 'An actual celebration: a party, festival, ceremony, wedding reception, birthday or explicitly celebratory event. A pleasant, social or joyful scene is NOT automatically a celebration.' },
  success_achievement: { en: 'Success & achievement', he: 'הצלחה והישגים', definition: 'Achieving, winning, reaching a goal or summit, praise, recognition, admiration.' },
  animals: { en: 'Animals', he: 'בעלי חיים', definition: 'Any real animal, pet, farm animal, bird, fish or insect (including the general idea of animals).' },
  water: { en: 'Water', he: 'מים', definition: 'Explicit water in a meaningful scene: sea, ocean, river, lake, pool, rain, flood, swimming, drowning.' },
  fire: { en: 'Fire', he: 'אש', definition: 'Fire, flames, burning, heat.' },
  nature_landscape: { en: 'Nature & landscapes', he: 'טבע ונופים', definition: 'Forests, mountains, deserts, fields, beaches, gardens, plants, open land.' },
  sky_weather: { en: 'Sky & weather', he: 'שמיים ומזג אוויר', definition: 'Sky, clouds, storms, snow, sun, moon, stars, outer space.' },
  flying_falling: { en: 'Flying & falling', he: 'תעופה ונפילה', definition: 'Explicitly flying, floating, jumping or falling (including falling from a building or height), weightlessness.' },
  chase_escape: { en: 'Chase & escape', he: 'מרדף ובריחה', definition: 'Being pursued, running away, hiding, narrowly escaping.' },
  danger_threat: { en: 'Danger & threat', he: 'סכנה ואיום', definition: 'A personal threat or hazard: someone or something menacing, weapons pointed at the dreamer, accidents, an ominous presence.' },
  conflict_violence: { en: 'Conflict & violence', he: 'עימות ואלימות', definition: 'Arguments, confrontations, fights, weapons used, aggression, betrayal. (A crime by itself belongs to crime.)' },
  war_disaster: { en: 'War & disaster', he: 'מלחמה ואסון', definition: 'War, terror, military, earthquakes, collapse, mass catastrophe.' },
  being_lost: { en: 'Being lost', he: 'איבוד דרך', definition: 'Lost in place or purpose, unable to find the way, a person or a place.' },
  confinement: { en: 'Confinement', he: 'כליאה ותקיעות', definition: 'Trapped, locked in, paralysed, stuck, unable to leave or move.' },
  freedom: { en: 'Freedom', he: 'חופש', definition: 'Liberation, breaking free, open space, release from constraint, unrestrained joy of movement.' },
  rescue_protection: { en: 'Rescue & protection', he: 'הצלה והגנה', definition: 'Explicitly saving, rescuing, protecting, shielding or caring for someone or something vulnerable (people, animals), or being saved or protected. If the dreamer says she saved, rescued or protected someone or something, select this.' },
  failure_unprepared: { en: 'Failure & unpreparedness', he: 'כישלון וחוסר מוכנות', definition: 'Failing, not being ready, forgetting lines or material, being humiliated by a failure, being inadequate.' },
  lateness_missing: { en: 'Lateness & missing out', he: 'איחור והחמצה', definition: 'Being late, missing a departure or event, things that do not arrive or are lost, opportunities slipping away.' },
};

const KNOWN = new Set<string>(CONCEPT_IDS);

export function isConceptId(value: unknown): value is ConceptId {
  return typeof value === 'string' && KNOWN.has(value);
}

/** Filters unknown IDs, removes duplicates (keeping the model's order, which
    is most-important-first) and caps at MAX_CONCEPTS_PER_DREAM. */
export function normalizeConcepts(raw: unknown): ConceptId[] {
  if (!Array.isArray(raw)) return [];
  const out: ConceptId[] = [];
  for (const item of raw) {
    if (isConceptId(item) && !out.includes(item)) out.push(item);
    if (out.length === MAX_CONCEPTS_PER_DREAM) break;
  }
  return out;
}

/** The concepts a saved dream carries, read defensively: a legacy dream has
    none, and any stored ID this build doesn't know is ignored. */
export function conceptsOfDream(analysis: { concepts?: unknown } | null | undefined): ConceptId[] {
  return normalizeConcepts(analysis?.concepts);
}

export function conceptLabel(id: ConceptId, language: AppLanguage): string {
  return language === 'he' ? CONCEPTS[id].he : CONCEPTS[id].en;
}

const CONCEPT_DISTINCTIONS = `Distinctions between neighbouring concepts (tag the one that truly applies; never add a neighbour just because it often co-occurs):
- public_figures: a famous/historical/political person APPEARS as themselves. role_identity: the dreamer IS a queen, king, Cleopatra, celebrity, clown or another persona. authority_power: rank, control or power dynamics. Being a queen or king is role_identity (and authority_power if power is exercised), NOT public_figures.
- family: relatives, including the dreamer's own children as family and affection within the family. children: kids or babies as a presence. childhood: the dreamer's own childhood or a childlike state. pregnancy_birth: only pregnancy or delivery.
- romance_love: romantic partners and love (never family affection). marriage_weddings: weddings or vows. sexuality_intimacy: physical desire or acts.
- crime: robbery, theft and other criminal acts. conflict_violence: confrontation, fighting, weapons used against someone. Add conflict_violence to a crime only if real interpersonal violence or confrontation is also meaningful. danger_threat: a personal menace or hazard. war_disaster: war or mass catastrophe. chase_escape: being pursued or running away.
- confinement: trapped or stuck. freedom: released, open. chase_escape: pursuit.
- performance_attention: stage, audience, being watched. success_achievement: winning, reaching a goal, praise. celebration: an actual party, festival or ceremony. nudity_exposure: bodily exposure.
- work_career: the workplace or running an organisation. education_exams: school. failure_unprepared: failing or being unready. lateness_missing: being late or things not arriving.
- role_identity: being someone else or holding a persona or role. transformation: changing form or nature.
- water: water itself (sea, ocean, river, pool, rain, drowning, swimming). nature_landscape: land, plants, beaches. sky_weather: sky, weather, moon, space.
- travel_journey: the trip or destination. vehicles: the vehicle as a central action. being_lost: losing the way.
- death_loss: death, the dead, grief. past_memory: a meaningful return to a past time or place.
- home_dwelling: the home itself as a place to live. family: the people.
- animals: real animals. supernatural_fantasy: explicitly magical, mythical or supernatural beings and worlds.
- music_dance: music, singing, concerts, dancing. visual_writing_creativity: painting, drawing, writing, art-making. sports_play: sports and games.
- rescue_protection: explicit saving, rescuing or protecting. flying_falling: explicit flying, floating or falling.`;

/** The concept section of the dream-analysis system prompt (elements-first). */
export function buildConceptPromptSection(): string {
  const list = CONCEPT_IDS.map((id) => `- ${id} (${CONCEPTS[id].en}): ${CONCEPTS[id].definition}`).join('\n');
  return `CONCEPTS AND EXPLICIT ELEMENTS
In addition to the structure above, finish the JSON with two more fields, in this order: "explicitElementsEvents", then "concepts".

"explicitElementsEvents" — establish WHAT ACTUALLY HAPPENS in the dream before you choose concepts. List the meaningful concrete elements, places, beings and events that the dreamer's own words explicitly state, as short factual phrases (for example "rescued animals", "drowning in the ocean", "fell from a building", "mother chased her with a gun", "late to a meeting"). These are internal working notes: write them in plain English whatever the dream's language (the language rule above does not apply to this field); they are discarded afterwards. Facts only — NO interpretation, symbolism, emotions or psychology (a door is just a door; darkness is not "danger"; a deceased relative appearing is just that; a palace is just a palace; an unusual scene is just what it is). Include an element or event only if it is meaningful to the dream — part of what happens or where it happens, not a throwaway detail; do not list every noun or action. 2 to 6 phrases is typical.

"concepts" — map the meaningful content to concept IDs from the closed list below.
1. Choose ONLY IDs from the list. Never invent an ID.
2. PRIORITY: first map each meaningful explicit element/event to the concept it explicitly belongs to (do not leave a meaningful explicit event unmapped — e.g. explicitly drowning or swimming in a sea/ocean/river/pool → water; explicitly saving, rescuing or protecting → rescue_protection; explicitly falling or flying → flying_falling; a central robbery/theft → crime; being chased → chase_escape; being late → lateness_missing; animals present → animals). Only after the concrete content is covered may you add a broader theme, and only when clearly supported.
3. But an element becomes a concept only if it is MEANINGFUL to the dream. Do not convert every concrete noun or action into a concept, and do not tag incidental words or passing mentions.
4. Be strict with the interpretive concepts — celebration, past_memory, romance_love, supernatural_fantasy, home_dwelling, public_figures, role_identity: use them only when their definition is explicitly met, never as a guess.
5. Choose at most ${MAX_CONCEPTS_PER_DREAM} concepts, most important first (explicit and central first). If more qualify, keep the ${MAX_CONCEPTS_PER_DREAM} most important. Zero is allowed only if nothing explicit and meaningful applies.
6. Every concept must be independently justified by the dream. Do not add a broader or neighbouring concept just because it often co-occurs.
7. Concepts describe the CONTENT of the dream, never the dreamer's emotions or any interpretation. Concept IDs are language-independent.

CONCEPT LIST:
${list}

${CONCEPT_DISTINCTIONS}`;
}
