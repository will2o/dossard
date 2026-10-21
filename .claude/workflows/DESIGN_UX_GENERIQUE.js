export const meta = {
  name: 'DESIGN_UX_GENERIQUE',
  description:
    'Conçoit une UX complète à partir de n\'importe quel backend : contrat, specs, socle, vues, vérification Playwright, audit. Arrêt après la phase 1 (etape=analyse), reprise avec etape=construction.',
  whenToUse:
    'Quand un backend (REST, GraphQL, gRPC…) existe sans interface et qu\'on veut en dériver une UI vérifiée et auditée. Lancer d\'abord avec {etape:"analyse"}, relire ux/contrat.md et ux/spec-*.md, puis relancer avec {etape:"construction"}.',
  phases: [
    { title: 'Découverte', detail: 'extraire le contrat backend (E, R, C, T) et découper en domaines' },
    { title: 'Spec', detail: 'un analyste lecture seule par domaine → ux/spec-<domaine>.md' },
    { title: 'Socle', detail: 'shell, client API, composants, contrat de vue, montage, test de fumée' },
    { title: 'Vues', detail: 'un agent par domaine, un seul fichier chacun' },
    { title: 'Vérification', detail: 'testeur Playwright desktop + mobile, puis correcteur, boucle bornée' },
    { title: 'Audit', detail: 'critique (matrice de couverture) + contrôles mécaniques, puis rattrapage' },
  ],
}

// ---------------------------------------------------------------------------
// Paramètres (args) — tous optionnels, sauf indication.
//   etape            'analyse' (défaut) | 'construction'
//   sourceContrat    où chercher le contrat (OpenAPI, schema GraphQL, .proto, routers, docs…)
//   pile             stack UI imposée (défaut : JS natif sans dépendance ni CDN)
//   dossierUi        dossier de l'UI (défaut : ui/)
//   montage          préfixe d'URL où l'UI est servie (défaut : /ui/)
//   commandesControle  [{nom, cmd}] contrôles mécaniques (tests, lint, syntaxe/build…)
//   commandeServeur  commande de démarrage du backend pour les tests navigateur
//   baseJetable      comment obtenir une base/état éphémère pour les tests navigateur
//   viewports        [{nom, largeur, hauteur}] (défaut : desktop + mobile)
//   reglesDepot      obligations propres au dépôt (doc, changelog, tests…) appliquées au socle
//   domaines         [{nom, slug, description}] pour imposer le découpage (sinon déduit)
//   maxIterations    tours max correcteur / rattrapage (défaut : 2)
// ---------------------------------------------------------------------------
const A = args || {}
const ETAPE = A.etape || 'analyse'
const SOURCE = A.sourceContrat || 'à découvrir dans le dépôt (spec OpenAPI/GraphQL/proto, routes, docs, schéma de données)'
const PILE = A.pile || 'JavaScript natif, sans dépendance ni CDN, application monopage'
const UI = (A.dossierUi || 'ui').replace(/\/+$/, '')
const MONTAGE = A.montage || '/ui/'
const CONTROLES = A.commandesControle || []
const SERVEUR = A.commandeServeur || 'à déduire du dépôt'
const BASE = A.baseJetable || 'à déduire du dépôt (base/état éphémère distinct des données réelles)'
const VIEWPORTS = A.viewports || [
  { nom: 'desktop', largeur: 1280, hauteur: 800 },
  { nom: 'mobile', largeur: 390, hauteur: 844 },
]
const REGLES = A.reglesDepot || 'Respecter les conventions et règles du dépôt (CLAUDE.md, CONTRIBUTING, etc.).'
const MAX_IT = A.maxIterations || 2

if (ETAPE !== 'analyse' && ETAPE !== 'construction') {
  throw new Error(`etape inconnue : "${ETAPE}" (attendu : "analyse" ou "construction")`)
}

const CONTRAT = 'ux/contrat.md'
const DOMAINES_JSON = 'ux/domaines.json'
const specDe = (d) => `ux/spec-${d.slug}.md`
const vueDe = (d) => `${UI}/views/${d.slug}.js`

const DOMAINES_SCHEMA = {
  type: 'object',
  properties: {
    domaines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          slug: { type: 'string', description: 'kebab-case ASCII, sert de nom de fichier' },
          description: { type: 'string' },
          ids: { type: 'array', items: { type: 'string' }, description: 'identifiants du contrat couverts (E1, R3, C2, T1…)' },
        },
        required: ['nom', 'slug', 'description', 'ids'],
      },
    },
    totaux: {
      type: 'object',
      properties: { E: { type: 'number' }, R: { type: 'number' }, C: { type: 'number' }, T: { type: 'number' } },
      required: ['E', 'R', 'C', 'T'],
    },
  },
  required: ['domaines', 'totaux'],
}

const RESUME_SCHEMA = {
  type: 'object',
  properties: { resume: { type: 'string' }, fichiers: { type: 'array', items: { type: 'string' } } },
  required: ['resume', 'fichiers'],
}

const DEFAUTS_SCHEMA = {
  type: 'object',
  properties: {
    defauts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          gravite: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] },
          viewport: { type: 'string' },
          ecran: { type: 'string' },
          description: { type: 'string' },
          reproduction: { type: 'string' },
        },
        required: ['gravite', 'viewport', 'ecran', 'description', 'reproduction'],
      },
    },
    parcoursCouverts: { type: 'number' },
  },
  required: ['defauts', 'parcoursCouverts'],
}

const MATRICE_SCHEMA = {
  type: 'object',
  properties: {
    matrice: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          statut: { type: 'string', enum: ['couvert', 'partiel', 'absent'] },
          ou: { type: 'string', description: 'fichier:ligne qui gère l\'élément, vide si absent' },
          manque: { type: 'string' },
        },
        required: ['id', 'statut', 'ou', 'manque'],
      },
    },
  },
  required: ['matrice'],
}

const CONTROLES_SCHEMA = {
  type: 'object',
  properties: {
    resultats: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nom: { type: 'string' }, ok: { type: 'boolean' }, sortie: { type: 'string' } },
        required: ['nom', 'ok', 'sortie'],
      },
    },
  },
  required: ['resultats'],
}

// ---------------------------------------------------------------------------
// Phase 0 — Découverte (lecture seule sauf ux/)
// ---------------------------------------------------------------------------
let domaines = A.domaines || null

if (ETAPE === 'analyse') {
  phase('Découverte')
  const decouverte = await agent(
    `Tu extrais le CONTRAT d'un backend pour en dériver une UX. Tu ne modifies aucun fichier du backend : tu écris uniquement dans ux/.

Source du contrat : ${SOURCE}.

Écris ${CONTRAT} avec quatre inventaires numérotés, exhaustifs, vérifiés dans le code réel (pas seulement dans la doc) :
- E1…En : endpoints/opérations (méthode ou type, chemin ou nom, paramètres, corps, forme de la réponse, authentification éventuelle) ;
- R1…Rn : règles métier et invariants (validations, unicité, plafonds, dépendances entre entités, droits) avec leur emplacement dans le code ;
- C1…Cn : codes d'erreur et statuts HTTP, avec message et condition de déclenchement ;
- T1…Tn : machines à états (statuts d'une entité, transitions autorisées et interdites, effets de bord).
Chaque élément = identifiant, description d'une ligne, référence fichier:ligne.

Puis découpe le backend en ${A.domaines ? 'les domaines imposés ci-dessous' : '3 à 6 domaines UX cohérents'} (un parcours utilisateur ne doit pas être éclaté entre domaines ; une entité transverse appartient à un seul domaine, les autres y renvoient). Chaque identifiant E/R/C/T doit appartenir à au moins un domaine.
${A.domaines ? `Domaines imposés : ${JSON.stringify(A.domaines)}` : ''}
Écris aussi ${DOMAINES_JSON} (même contenu que ta réponse structurée) pour la phase suivante.`,
    { label: 'découverte du contrat', phase: 'Découverte', schema: DOMAINES_SCHEMA },
  )
  if (!decouverte || !decouverte.domaines?.length) throw new Error('Découverte vide : aucun domaine produit')
  domaines = decouverte.domaines
  log(
    `Contrat : ${decouverte.totaux.E} opérations, ${decouverte.totaux.R} règles, ${decouverte.totaux.C} erreurs, ${decouverte.totaux.T} transitions ; ${domaines.length} domaines : ${domaines.map((d) => d.slug).join(', ')}`,
  )

  // -------------------------------------------------------------------------
  // Phase 1 — Spec (lecture seule sauf ux/spec-*.md)
  // -------------------------------------------------------------------------
  phase('Spec')
  const specs = await parallel(
    domaines.map((d) => () =>
      agent(
        `Tu es analyste UX en lecture seule : tu n'écris que ${specDe(d)}.

Domaine : ${d.nom} — ${d.description}
Éléments du contrat à couvrir : ${d.ids.join(', ')} (lis ${CONTRAT} et vérifie dans le code backend au besoin).

Rédige la spécification UX de ce domaine :
1. Parcours utilisateur (qui fait quoi, dans quel ordre), numérotés P1…Pn.
2. Écrans et navigation : liste, détail, formulaires, actions.
3. Pour chaque écran : états vide / chargement / erreur / succès, champs, validations côté client alignées sur les règles R.
4. Traitement de CHAQUE code d'erreur C du domaine : message affiché, où, action de récupération.
5. Pour chaque machine à états T : quelles actions sont proposées, masquées ou désactivées selon l'état, et pourquoi.
6. Cas limites et accessibilité de base (clavier, libellés, contraste), comportement mobile.
7. Dépendances vers d'autres domaines et besoins transverses pour le socle.
Chaque point référence ses identifiants (E, R, C, T). Pas de code, pas de maquette graphique : un texte précis et testable. La pile cible est : ${PILE}.`,
        { label: `spec ${d.slug}`, phase: 'Spec', schema: RESUME_SCHEMA },
      ),
    ),
  )
  const manquantes = domaines.filter((_, i) => !specs[i]).map((d) => d.slug)
  if (manquantes.length) log(`Specs non produites (à relancer) : ${manquantes.join(', ')}`)

  log('ARRÊT après la phase 1. Relire ux/contrat.md et ux/spec-*.md, corriger si besoin, puis relancer avec {etape:"construction"}.')
  return {
    etape: 'analyse',
    arret: 'validation humaine requise avant la construction',
    contrat: CONTRAT,
    domaines: domaines.map((d) => ({ slug: d.slug, nom: d.nom, spec: specDe(d), ok: !manquantes.includes(d.slug) })),
    totaux: decouverte.totaux,
    suite: `Workflow DESIGN_UX_GENERIQUE avec args {"etape":"construction"} (+ les mêmes paramètres)`,
  }
}

// ---------------------------------------------------------------------------
// Étape construction : reprise après validation humaine
// ---------------------------------------------------------------------------
phase('Socle')
const relu = await agent(
  `Lis ${DOMAINES_JSON} (et vérifie que ${CONTRAT} et chaque ux/spec-<slug>.md correspondant existent). Ne modifie rien. Renvoie les domaines tels qu'ils sont dans le fichier ; s'il manque ${CONTRAT} ou une spec, indique-le dans le champ domaines en omettant le domaine concerné.`,
  { label: 'relecture des specs validées', phase: 'Socle', schema: DOMAINES_SCHEMA },
)
domaines = (relu && relu.domaines) || []
if (!domaines.length) throw new Error(`Aucun domaine exploitable dans ${DOMAINES_JSON} : lancer d'abord l'étape "analyse".`)

// ---------------------------------------------------------------------------
// Phase 2 — Socle (un seul agent, séquentiel, avant tout parallélisme)
// ---------------------------------------------------------------------------
const socle = await agent(
  `Tu construis le SOCLE de l'UI. Lis ${CONTRAT} et tous les ux/spec-*.md. Tu es le seul à écrire dans ${UI}/ pendant cette phase.

Pile : ${PILE}. Dossier : ${UI}/. Montage : l'UI est servie sous ${MONTAGE} par le backend (ajoute le montage minimal côté serveur, et si le dépôt a une page d'accueil, redirige-la vers ${MONTAGE}).

Livrables :
1. Shell : point d'entrée, routage (hash ou history), navigation générale, mise en page responsive.
2. Client API unique : toutes les requêtes passent par lui ; il normalise les erreurs au format du backend et les expose aux vues avec leur code (C).
3. Composants communs : tableau, formulaire avec erreurs de champ, notifications, états vide/chargement/erreur, confirmation d'action destructive.
4. CONTRAT DE VUE, documenté en tête de ${UI}/README ou dans le shell : chaque domaine fournit ${UI}/views/<slug>.js exportant exactement la même interface (ex. routes déclarées + fonction de rendu(container, params)). Crée un squelette conforme pour chacun de ces fichiers : ${domaines.map(vueDe).join(', ')}.
5. Test de fumée : l'UI est servie sous ${MONTAGE}, le shell se charge, chaque vue se monte sans erreur.
6. ${REGLES}

Contraintes : aucune dépendance ni CDN sauf si la pile le prévoit ; ne pas toucher aux fichiers de vue au-delà du squelette ; ne pas modifier le comportement existant du backend. Lance les contrôles du dépôt (${CONTROLES.map((c) => c.cmd).join(' ; ') || 'tests, lint, syntaxe'}) avant de rendre la main. Liste dans ta réponse les composants et fonctions exposés aux vues.`,
  { label: 'socle', phase: 'Socle', schema: RESUME_SCHEMA },
)
if (!socle) throw new Error('Le socle a échoué : arrêt avant les vues.')
log(`Socle prêt : ${socle.fichiers.length} fichiers`)

// ---------------------------------------------------------------------------
// Phases 3 et 4 — Vues puis vérification, chaîne par domaine (pipeline, sans barrière)
// ---------------------------------------------------------------------------
const rapports = await pipeline(
  domaines,
  // Phase 3 — Vue : un fichier par agent, aucun conflit possible
  (d) =>
    agent(
      `Tu écris la vue du domaine "${d.nom}" dans ${vueDe(d)} — et UNIQUEMENT ce fichier.

Lis ${specDe(d)}, ${CONTRAT} (éléments : ${d.ids.join(', ')}), le socle dans ${UI}/ et son contrat de vue. Implémente tous les parcours, états, messages d'erreur par code et règles d'activation par état décrits dans la spec.
Si un composant transverse manque, ne le crée pas et ne contourne pas le socle : note-le dans "demandes au socle" dans ta réponse. ${PILE}.`,
      { label: `vue ${d.slug}`, phase: 'Vues', schema: RESUME_SCHEMA },
    ),
  // Phase 4 — Vérification : test → correction → retest, borné
  async (vue, d, i) => {
    if (!vue) return { domaine: d.slug, vue: false, defautsRestants: [], iterations: 0 }
    const port = 8100 + i
    let defauts = []
    let iterations = 0
    for (let tour = 0; tour <= MAX_IT; tour++) {
      const test = await agent(
        `Tu es testeur Playwright pour le domaine "${d.nom}". Tu ne modifies aucun fichier source (tu peux écrire des captures dans ux/captures/${d.slug}/).

Démarre le backend avec : ${SERVEUR}, sur le port ${port}, avec une base/un état JETABLE propre à ce test : ${BASE}. Ne touche jamais aux données réelles. Peuple-la avec des données synthétiques via l'API.
Parcours TOUS les parcours P1…Pn de ${specDe(d)} dans l'UI (${MONTAGE}), pour chaque viewport : ${VIEWPORTS.map((v) => `${v.nom} ${v.largeur}x${v.hauteur}`).join(', ')}. Provoque aussi chaque erreur C du domaine et vérifie le message affiché, ainsi que les actions masquées/désactivées selon les états T. Surveille la console navigateur et les débordements horizontaux sur mobile.
Arrête le serveur à la fin. Rends la liste des défauts (gravité, viewport, écran, description, étapes de reproduction) ; liste vide si tout est conforme.${tour > 0 ? ' Ceci est un re-test après correction : revérifie en priorité les défauts précédents puis refais un passage complet.' : ''}`,
        { label: `test ${d.slug} #${tour + 1}`, phase: 'Vérification', schema: DEFAUTS_SCHEMA },
      )
      if (!test) break
      defauts = test.defauts
      const aCorriger = defauts.filter((x) => x.gravite !== 'mineur' || tour === 0)
      if (!defauts.length || tour === MAX_IT || !aCorriger.length) break
      iterations++
      await agent(
        `Tu corriges les défauts de l'UI du domaine "${d.nom}". Tu peux modifier ${vueDe(d)} ; pour un défaut qui vient du socle, fais le correctif minimal dans le socle et signale-le. Ne touche pas aux autres vues.

Défauts : ${JSON.stringify(aCorriger)}
Spec de référence : ${specDe(d)}. Corrige la cause, pas le symptôme ; relance les contrôles de syntaxe du dépôt.`,
        { label: `correction ${d.slug} #${tour + 1}`, phase: 'Vérification', schema: RESUME_SCHEMA },
      )
    }
    return { domaine: d.slug, vue: true, defautsRestants: defauts, iterations }
  },
)
const rapportsOk = rapports.filter(Boolean)
const restants = rapportsOk.flatMap((r) => r.defautsRestants.map((x) => ({ domaine: r.domaine, ...x })))
if (restants.length) {
  log(`Défauts non résolus après ${MAX_IT} itération(s) max : ${restants.length} (consignés dans le résultat)`)
}
if (rapportsOk.length < domaines.length) {
  log(`Domaines sans rapport de vérification : ${domaines.filter((d) => !rapportsOk.some((r) => r.domaine === d.slug)).map((d) => d.slug).join(', ')}`)
}

// ---------------------------------------------------------------------------
// Phase 5 — Audit : critique ‖ contrôles mécaniques, puis rattrapage borné
// ---------------------------------------------------------------------------
phase('Audit')
const lancerAudit = () =>
  parallel([
    () =>
      agent(
        `Tu es le critique. Lecture seule. Compare le code de l'UI (${UI}/) au contrat ${CONTRAT} : pour CHAQUE identifiant E, R, C et T, détermine s'il est couvert, partiel ou absent, et où (fichier:ligne). "couvert" exige une preuve dans le code (appel de l'endpoint, validation de la règle, affichage du message d'erreur, gestion de la transition), pas une intention. Sois exhaustif : une ligne par identifiant du contrat, aucun oublié.`,
        { label: 'critique : matrice de couverture', phase: 'Audit', schema: MATRICE_SCHEMA },
      ),
    () =>
      CONTROLES.length
        ? agent(
            `Lance ces contrôles à la racine du dépôt, sans rien modifier, et rapporte ok/échec avec la fin de la sortie : ${JSON.stringify(CONTROLES)}`,
            { label: 'contrôles mécaniques', phase: 'Audit', schema: CONTROLES_SCHEMA, effort: 'low' },
          )
        : agent(
            `Détermine les contrôles de qualité du dépôt (tests, lint/format, vérification de syntaxe/build de l'UI) à partir de CLAUDE.md, du README et de la config, puis lance-les sans rien modifier et rapporte ok/échec avec la fin de la sortie.`,
            { label: 'contrôles mécaniques', phase: 'Audit', schema: CONTROLES_SCHEMA, effort: 'low' },
          ),
  ])

const bilan = (res) => {
  const [m, c] = res
  const ecarts = ((m && m.matrice) || []).filter((x) => x.statut !== 'couvert')
  const echecs = ((c && c.resultats) || []).filter((x) => !x.ok)
  return { matrice: (m && m.matrice) || [], ecarts, echecs, complet: !!m && !!c }
}

let audit = bilan(await lancerAudit())
let tours = 0
while ((audit.ecarts.length || audit.echecs.length || !audit.complet) && tours < MAX_IT) {
  tours++
  log(`Rattrapage ${tours}/${MAX_IT} : ${audit.ecarts.length} écart(s) de couverture, ${audit.echecs.length} contrôle(s) en échec`)
  await agent(
    `Passe de rattrapage de l'UI. Corrige, dans ${UI}/ (et le socle si nécessaire), ces écarts. ${REGLES}

Écarts de couverture (contrat ${CONTRAT}, specs ux/spec-*.md) : ${JSON.stringify(audit.ecarts)}
Contrôles en échec : ${JSON.stringify(audit.echecs)}

Un seul agent à la fois écrit : traite tout, sans modifier le backend sauf si un contrôle l'exige. Ajoute les tests qui manquent pour ce que tu corriges.`,
    { label: `rattrapage #${tours}`, phase: 'Audit', schema: RESUME_SCHEMA },
  )
  audit = bilan(await lancerAudit())
}

const termine = !audit.ecarts.length && !audit.echecs.length && audit.complet && !restants.length
log(
  termine
    ? 'Audit propre : matrice complète, contrôles verts, aucun défaut résiduel.'
    : `Audit non propre : ${audit.ecarts.length} écart(s), ${audit.echecs.length} échec(s), ${restants.length} défaut(s) de vérification non résolus.`,
)

return {
  etape: 'construction',
  termine,
  domaines: domaines.map((d) => d.slug),
  verification: rapportsOk,
  defautsNonResolus: restants,
  couverture: {
    total: audit.matrice.length,
    couverts: audit.matrice.filter((x) => x.statut === 'couvert').length,
    ecarts: audit.ecarts,
  },
  controlesEnEchec: audit.echecs,
  toursDeRattrapage: tours,
}
