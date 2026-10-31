import type { Messages } from "./en.js";

/**
 * Swedish UI copy. Claude's own menu names ("Customize", "Skills", "Upload a
 * skill") stay in English because that is what people see in Claude.
 */
export const sv: Messages = {
  language: {
    label: "Språk",
    switchTo: (name: string) => `Byt språk till ${name}`,
  },
  lifecycle: {
    draft: "utkast",
    published: "inskickad",
    approved: "godkänd",
    hidden: "dold",
    deprecated: "utfasad",
  },
  roles: {
    labels: {
      user: "Läsare",
      maintainer: "Redaktör",
      admin: "Admin",
    },
    descriptions: {
      user: "Bläddra bland och installera godkända skills.",
      maintainer: "Publicera utkast och godkänn skills för katalogen.",
      admin: "Hantera kollegor plus allt en redaktör kan göra.",
    },
  },
  login: {
    checking: "Kontrollerar din inloggning…",
    redirecting: "Skickar dig till Microsoft…",
    signIn: "Logga in med Microsoft",
  },
  rail: {
    workspace: "Arbetsyta",
    overview: "Översikt",
    catalog: "Katalog",
    mySkills: "Mina skills",
    publish: "Publicera",
    reports: "Rapporter",
    team: "Team",
    leaderboard: "Topplista",
    signOut: "Logga ut",
    apiKey: "API-nyckel",
    apiKeyPlaceholder: "Ange token...",
  },
  topbar: {
    activeWorkspace: "Aktiv arbetsyta",
    workspaceOption: (id: string) => `Arbetsyta: ${id}`,
    newWorkspace: "+ Ny arbetsyta...",
    workspaceOverview: "Översikt över arbetsytan",
  },
  overview: {
    startHere: "Börja här",
    browseSkills: "Bläddra bland skills",
    shareSkill: "Dela en skill",
    developerSummary:
      "För utvecklare: koppla Claude Code, Codex, Cursor eller ChatGPT",
    connectAria: "Koppla din agent via MCP",
    connectKicker: "Koppla din agent",
    connectTitle: "Kopiera installationsprompt för agenten",
    connectSignedIn:
      "Välj din agent nedan. Den kopierade prompten innehåller din personliga MCP-token. Klistra in den i Claude Code, Codex, Cursor eller en annan agent för att sätta upp lokal MCP och testa sökningen.",
    connectSignedOut:
      "Logga in först. Den kopierade prompten får då din personliga MCP-token så att agenten kan autentisera sig utan Microsoft-inloggning.",
    registry: "Register:",
    copyTargetAria: (label: string) =>
      `Kopiera MCP-installationsprompt för ${label}`,
    copied: "Kopierad",
    copyPrompt: "Kopiera prompt",
    metricsAria: "Nyckeltal för registret",
    approvedSkills: "Godkända skills",
    installs: "Installationer",
    needUpdate: "Behöver uppdateras",
    noSkillsYet: "Inga skills än",
    publishFirst: "Publicera första skillen",
  },
  howItWorks: {
    title: "Så funkar det",
    findTitle: "Hitta en skill",
    browse: "Bläddra bland skills",
    findRest: "och klicka på en för att se vad den gör.",
    downloadTitle: "Ladda ner den",
    downloadBody: "Ett klick. Filen hamnar i mappen Hämtade filer.",
    addTitle: "Lägg till den i Claude",
    addBody: "Ladda upp den under Customize och sedan Skills. Klart.",
    newToClaude: "Ny på Claude? Använd det på",
    inBrowserOr: "i webbläsaren, eller",
    downloadApp: "ladda ner skrivbordsappen",
  },
  addToClaude: {
    title: "Lägg till skillen i Claude",
    downloadTitle: "Ladda ner skillen.",
    downloadBefore: "Det sparar",
    downloadAfter: "i mappen Hämtade filer. Du behöver inte öppna filen.",
    downloadButton: "Ladda ner för Claude",
    openTitle: "Öppna Claude.",
    openBefore: "Använd",
    openAfter: "i webbläsaren, eller Claudes skrivbordsapp.",
    customizeTitle: "Gå till Customize och sedan Skills.",
    uploadTitle: "Klicka på +, sedan Create skill och sedan Upload a skill.",
    uploadBody: "Välj filen du nyss laddade ner.",
    enableTitle: "Slå på skillen.",
    enableBody:
      "Använd reglaget bredvid den i listan med skills. Sedan ber du bara Claude om hjälp som vanligt. Claude använder skillen när den passar.",
    promptTitle: "Eller låt Claude lägga till den åt dig",
    promptHint:
      "Kopiera prompten och klistra in den i Claude, i skrivbordsappen eller Claude Code. Claude kontrollerar din behörighet, laddar ner skillen och sparar den så att den fungerar i alla dina konversationer. Din personliga åtkomstnyckel läggs till när du kopierar, så dela inte den kopierade texten.",
    copied: "Kopierad",
    copyPrompt: "Kopiera prompt till Claude",
    copyFailed:
      "Det gick inte att kopiera till urklipp. Markera prompten ovan och kopiera den själv, eller prova en annan webbläsare.",
  },
  catalog: {
    allStatuses: "Alla statusar",
    approved: "Godkända",
    draftsPending: "Utkast och väntande",
    all: "Alla",
    loading: "Laddar skills…",
    empty: "Det finns inga skills i katalogen än.",
    featured: "Utvald godkänd skill",
    openCatalog: "Öppna katalogen",
    emptyDrafts:
      "Inga utkast eller väntande skills i den här kategorin matchar sökningen.",
    emptyApproved:
      "Inga godkända skills i den här kategorin matchar sökningen.",
    emptyAll: "Inga skills i den här kategorin matchar sökningen.",
    mineEmptyDrafts:
      "Du har inte laddat upp några utkast eller väntande skills i den här kategorin än.",
    mineEmptyApproved:
      "Du har inte laddat upp några godkända skills i den här kategorin än.",
    mineEmptyAll: "Du har inte laddat upp några skills i den här kategorin än.",
  },
  stats: {
    version: "Version",
    author: "Författare",
    downloads: "Nedladdningar",
    uploaded: "Uppladdad",
    lastModified: "Senast ändrad",
    downloadTrend: "Nedladdningstrend",
  },
  detail: {
    aria: "Skilldetaljer",
    selected: "Vald skill",
    copyLinkTitle: "Kopiera en delbar länk till skillen",
    copied: "Kopierad",
    copyLink: "Kopiera länk",
    developerSummary:
      "Använder du Claude Code, Codex eller Cursor? Installera med en prompt i stället",
    developerHint:
      "Klistra in prompten i Claude Code, Codex, Cursor eller en annan kodagent för att installera skillen och kontrollera att den fungerar.",
    installTarget: "Installera till",
    copyPrompt: "Kopiera prompt",
    downloadZip: "Ladda ner ZIP",
    noApproved: "Det finns ingen godkänd version att installera.",
    usage: "Användning",
    technical: "Tekniska detaljer: filer och validering",
    contents: "Innehåll",
    showLessAria: "Visa färre filer",
    showMoreAria: "Visa fler filer",
    showLess: "Visa färre",
    showMore: (count: number) => `Visa ${count} filer till`,
    validation: "Validering",
    activeVersion: "Aktiv version",
    noVersion: "Ingen version vald",
    approvedInstall: "Godkänd för installation",
    lifecycle: "Granskning",
    lifecycleCopy:
      "Redaktörer och admins granskar utkast här. När en skill godkänns går den att installera från katalogen.",
    approve: "Godkänn",
    hide: "Dölj",
    deprecate: "Fasa ut",
    activity: (days: number) =>
      `Antal nedladdningar och trendlinjer gäller de senaste ${days} dagarna.`,
  },
  validation: {
    none: "Inga valideringsresultat än.",
    valid:
      "Paketet ser bra ut. Frontmatter i SKILL.md och medföljande filer är giltiga.",
    warnings: "Paketet klarade valideringen, med varningar.",
    blocking: "Valideringen hittade fel som måste åtgärdas.",
    errors: "Fel",
    warningsTitle: "Varningar",
  },
  reports: {
    title: "Användningsrapport",
    packages: "Paket",
    current: "Aktuella",
    needsUpdate: "Behöver uppdateras",
    tableAria: "Rapporter per paket",
    installs: (count: number) => `${count} installationer`,
    stale: (count: number) => `${count} inaktuella`,
  },
  publish: {
    localAria: "Publicera lokalt utkast",
    localTitle: "Publicera en lokal mapp",
    workspace: "Arbetsyta",
    createWorkspace: "+ Skapa egen arbetsyta...",
    newWorkspaceId: "Id för ny arbetsyta",
    newWorkspacePlaceholder: "t.ex. engineering",
    slug: "Slug",
    version: "Version",
    categories: "Kategorier",
    noCategories: "Inga kategorier valda. Välj eller lägg till en nedan.",
    newCategoryPlaceholder: "Lägg till en egen kategori...",
    addCategory: "+ Lägg till",
    name: "Namn (valfritt)",
    namePlaceholder: "t.ex. Min bästa skill",
    description: "Beskrivning (valfri)",
    descriptionPlaceholder: "t.ex. En skill som gör X",
    filesStaged: (count: number) => `${count} filer redo`,
    folder: "Mapp:",
    chooseDifferent: "Välj en annan mapp",
    dropHere: "Dra och släpp en skill-mapp här",
    orBrowse: "eller klicka för att välja mapp",
    chooseFolder: "Välj mapp",
    validate: "Validera",
    upload: "Ladda upp skill",
    preflight: "Förhandsvalidering",
    gitAria: "Importera från Git",
    gitTitle: "Importera från Git",
    gitDescription:
      "Importera en version av ett skill-paket direkt från ett Git-repo.",
    repository: "Repo",
    ref: "Ref",
    subdir: "Undermapp",
    import: "Importera",
  },
  team: {
    aria: "Teamlista",
    title: "Team",
    onlyYou: "Bara du har loggat in hittills",
    youAnd: (count: number) =>
      `Du och ${count} ${count === 1 ? "kollega" : "kollegor"} till`,
    refresh: "Uppdatera",
    yourAccount: "Ditt konto",
    joined: "Gick med",
    submitted: (count: number) =>
      `${count} ${count === 1 ? "skill" : "skills"} inskickade`,
    roles: "Roller",
    members: "Teammedlemmar",
    loading: "Laddar kollegor…",
    none: "Inga kollegor har loggat in än.",
    user: "Användare",
    role: "Roll",
    skillsSubmitted: "Inskickade skills",
    joinedColumn: "Gick med",
    you: " (du)",
    removeTitle: (name: string) => `Ta bort ${name}`,
    remove: "Ta bort",
    branding: "Arbetsytans utseende",
    logoUrl: "Logotyp-URL",
    logoHint:
      "Stöder http(s), sökvägar från roten och base64-kodade data-URL:er för bilder.",
    saving: "Sparar...",
    saveLogo: "Spara logotyp",
    clear: "Rensa",
    logoUpdateFailed: "Det gick inte att uppdatera arbetsytans logotyp.",
  },
  popularity: {
    noColleagues: "Inga kollegor har installerat den än",
    installedBy: (count: number) =>
      `Installerad av ${count} ${count === 1 ? "kollega" : "kollegor"}`,
    foundUseful: (count: number) => `${count} tycker att den är användbar`,
    ownUseful: (count: number) => `${count} användbar`,
    yourSkill: "Din skill",
    useful: "Användbar",
    removeUpvote: "Ta bort din röst",
    upvoteHint: "Rösta om den här skillen hjälpte dig",
    sortAria: "Sortera skills",
    sortLabel: "Sortera",
    sortPopular: "Populära",
    sortNewest: "Nyaste",
    sortName: "A–Ö",
  },
  leaderboard: {
    title: "Flitigaste bidragsgivarna",
    intro:
      "Kollegor vars skills andra installerar och tycker är användbara. Nya installationer väger tyngst.",
    loading: "Laddar bidragsgivare…",
    empty: "Inga godkända skills än. Publicera en så kan du hamna först här.",
    you: " (du)",
    skills: (count: number) => (count === 1 ? "skill" : "skills"),
    colleaguesReached: (count: number) =>
      count === 1 ? "kollega nådd" : "kollegor nådda",
    upvotes: (count: number) => (count === 1 ? "röst" : "röster"),
  },
  notices: {
    upvoteSaved: "Tack — din röst är sparad",
    upvoteRemoved: "Rösten är borttagen",
    upvoteFailed: "Röstningen misslyckades",
    ready: "Redo",
    installCopied:
      "Installationsprompten är kopierad. Klistra in den i din agent.",
    mcpTokenFailed:
      "Det gick inte att hämta din MCP-token. Logga ut och in igen och försök på nytt. Om felet kvarstår kan registret behöva uppdateras.",
    mcpSignIn:
      "Logga in för att kopiera en installationsprompt med din personliga MCP-token.",
    mcpCopied: (label: string) =>
      `Installationsprompten för ${label} är kopierad, med din MCP-token`,
    catalogSynced: "Katalogen är uppdaterad",
    catalogEmpty: "Katalogen är tom. Publicera en skill för att komma igång.",
    refreshFailed: (message?: string) =>
      message
        ? `Det gick inte att uppdatera katalogen: ${message}`
        : "Det gick inte att uppdatera katalogen",
    apiUnavailable: (message?: string, demo?: boolean) =>
      `API:t svarar inte${message ? `: ${message}` : ""}${demo ? "; visar lokal demodata" : ""}`,
    noVersion: "Ingen vald version att flytta.",
    versionMoved: (version: string, state: string) =>
      `Version ${version} har nu status ${state}`,
    lifecycleFailed: "Det gick inte att byta status",
    roleUpdated: (role: string) => `Rollen ändrad till ${role}`,
    roleFailed: "Det gick inte att ändra rollen",
    confirmRemove: (name: string) =>
      `Ta bort ${name} från registret? Det går inte att ångra.`,
    userRemoved: (name: string) => `${name} har tagits bort`,
    removeFailed: "Det gick inte att ta bort användaren",
    skillNotFound: (slug: string) =>
      `Skillen "${slug}" finns inte i den här arbetsytan.`,
    linkCopied: "Länken är kopierad. Dela den med ditt team.",
    logoUpdated: "Arbetsytans logotyp är uppdaterad",
    logoCleared: "Arbetsytans logotyp är borttagen",
    chooseBeforeValidate: "Välj en skill-mapp innan du validerar.",
    validationWarnings:
      "Valideringen gick igenom med varningar. Du kan ladda upp utkastet för granskning.",
    validationPassed: "Valideringen gick igenom. Redo att ladda upp.",
    validationBlocking:
      "Valideringen hittade fel. Rätta dem före godkännande; du kan ändå ladda upp utkastet för granskning.",
    validationFailed: "Valideringen misslyckades",
    chooseBeforeUpload:
      "Välj en skill-mapp eller ett JSON-paket innan du laddar upp.",
    uploadedValid: (version: string) =>
      `Uppladdad som utkast: version ${version}. Valideringen gick igenom. En redaktör behöver godkänna den på sidan Katalog innan den går att ladda ner och installera.`,
    uploadedInvalid: (version: string) =>
      `Uppladdad som utkast: version ${version}. Valideringen hittade fel; rätta frontmatter före godkännande. Redaktörer ser listan med fel i Katalog.`,
    uploadFailed: "Uppladdningen misslyckades",
    noFilesStaged: "Inga filer valda",
    missingSkillMd:
      "Valideringsfel: Mappen saknar en SKILL.md-fil. Det krävs för att publicera.",
    filesStaged: (count: number, slug: string) =>
      `${count} filer från skill-mappen "${slug}" är redo att laddas upp.`,
    filesDropped: (count: number, slug: string) =>
      `${count} filer från mappen "${slug}" är redo att laddas upp.`,
  },
};
